/**
 * Seed the bench: 5 categories x 4 listings, 5 x 6 materialised subject
 * variants, 5 x 2 shopper intents.
 *
 *   --force   rewrite listing content even when recorded trials depend on it
 *
 * Idempotent — safe to re-run. Trials and runs are never touched.
 *
 * Re-seeding *unchanged* content is always allowed. Re-seeding *changed*
 * content is refused when trials already reference the affected rows, because
 * those trials point at the row by id: rewriting it retroactively changes what
 * they appear to have shown. Start a new Run after any content edit, or pass
 * --force if you accept that the old trials become unattributable (they keep
 * their own variantContentHash, so the UI will flag them as stale rather than
 * quietly mis-describing them).
 */

import { PrismaClient } from "@prisma/client";
import { CATEGORIES } from "../src/data/index.ts";
import { buildSubjectVariants, validateCategory } from "../src/data/variants.ts";
import { listingContentHash } from "../src/lib/content-hash.ts";
import type { SpecTable } from "../src/lib/types.ts";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");

async function main() {
  // Fail before touching the database if any category is malformed.
  const errors = CATEGORIES.flatMap(validateCategory);
  if (errors.length) {
    console.error("Seed data failed validation:\n" + errors.map((e) => "  - " + e).join("\n"));
    process.exit(1);
  }

  // ---- provenance guard: would this rewrite content that trials depend on?
  const conflicts: string[] = [];
  for (const cat of CATEGORIES) {
    for (const v of buildSubjectVariants(cat)) {
      const existing = await prisma.subjectVariant.findUnique({
        where: { categoryId_variant: { categoryId: cat.id, variant: v.variant } },
        select: { id: true, contentHash: true },
      });
      if (!existing) continue;
      const nextHash = listingContentHash({ ...v, specs: v.specs as SpecTable });
      if (existing.contentHash === nextHash) continue;

      const dependents = await prisma.trial.count({ where: { variantId: existing.id } });
      if (dependents > 0) {
        conflicts.push(
          `${cat.id}/${v.variant}: content changed but ${dependents} recorded trial(s) reference it`,
        );
      }
    }
  }

  if (conflicts.length && !FORCE) {
    console.error(
      "Refusing to rewrite listing content that recorded trials depend on:\n" +
        conflicts.map((c) => "  - " + c).join("\n") +
        "\n\nThose trials reference these rows by id, so rewriting them would change\n" +
        "what the trials appear to have shown. Either keep the content as it was,\n" +
        "or re-run `npm run trials` to produce a new Run against the new content.\n" +
        "Pass --force to seed anyway (old trials will be flagged as stale in the UI).",
    );
    process.exit(1);
  }
  if (conflicts.length && FORCE) {
    console.warn(
      `! --force: rewriting ${conflicts.length} variant(s) that recorded trials depend on.\n` +
        "  Those trials will show as stale in the dashboard.\n",
    );
  }

  let listings = 0;
  let variants = 0;
  let intents = 0;

  for (const cat of CATEGORIES) {
    await prisma.category.upsert({
      where: { id: cat.id },
      create: {
        id: cat.id,
        name: cat.name,
        subjectSku: cat.subjectSku,
        specKeys: cat.specKeys,
      },
      update: { name: cat.name, subjectSku: cat.subjectSku, specKeys: cat.specKeys },
    });

    for (const l of cat.listings) {
      const data = {
        categoryId: cat.id,
        brand: l.brand,
        title: l.title,
        price: l.price,
        currency: l.currency,
        bullets: l.bullets,
        specs: l.specs,
        rating: l.rating,
        reviewCount: l.reviewCount,
        reviews: l.reviews,
        isSubject: l.sku === cat.subjectSku,
        contentHash: listingContentHash(l),
      };
      await prisma.listingBase.upsert({
        where: { sku: l.sku },
        create: { sku: l.sku, ...data },
        update: data,
      });
      listings++;
    }

    for (const v of buildSubjectVariants(cat)) {
      const data = {
        sku: v.sku,
        brand: v.brand,
        title: v.title,
        price: v.price,
        currency: v.currency,
        bullets: v.bullets,
        specs: v.specs,
        rating: v.rating,
        reviewCount: v.reviewCount,
        reviews: v.reviews,
        changedFields: v.changedFields,
        contentHash: listingContentHash({ ...v, specs: v.specs as SpecTable }),
      };
      await prisma.subjectVariant.upsert({
        where: { categoryId_variant: { categoryId: cat.id, variant: v.variant } },
        create: { categoryId: cat.id, variant: v.variant, ...data },
        update: data,
      });
      variants++;
    }

    for (const [index, text] of cat.intents.entries()) {
      await prisma.shopperIntent.upsert({
        where: { categoryId_index: { categoryId: cat.id, index } },
        create: { categoryId: cat.id, index, text },
        update: { text },
      });
      intents++;
    }

    console.log(`  ${cat.id.padEnd(15)} 4 listings, 6 variants, 2 intents`);
  }

  console.log(
    `\nSeeded ${CATEGORIES.length} categories, ${listings} listings, ${variants} subject variants, ${intents} intents.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

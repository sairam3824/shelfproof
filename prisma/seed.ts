/**
 * Seed the bench: 5 categories x 4 listings, 5 x 6 materialised subject
 * variants, 5 x 2 shopper intents.
 *
 * Idempotent — safe to re-run. Trials and runs are never touched, so reseeding
 * the listings does not destroy experimental results. (If you change listing
 * *text* after a run, the old trials still reference the SubjectVariant row by
 * id, so re-seeding does mutate what those trials appear to have shown. Start a
 * new Run after any content edit.)
 */

import { PrismaClient } from "@prisma/client";
import { CATEGORIES } from "../src/data/index.ts";
import { buildSubjectVariants, validateCategory } from "../src/data/variants.ts";

const prisma = new PrismaClient();

async function main() {
  // Fail before touching the database if any category is malformed.
  const errors = CATEGORIES.flatMap(validateCategory);
  if (errors.length) {
    console.error("Seed data failed validation:\n" + errors.map((e) => "  - " + e).join("\n"));
    process.exit(1);
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

/**
 * npm run trials — execute the 5 x 6 x 8 = 240 trial grid.
 *
 *   --model <id>          default $SHELFPROOF_MODEL or claude-sonnet-4-6
 *   --temperature <n>     default $SHELFPROOF_TEMPERATURE or 0.7
 *   --trials <n>          trials per (category, variant) cell, default 8
 *   --resume <runId>      continue an existing run, skipping completed cells
 *   --resume-latest       continue the most recent unfinished run
 *   --categories a,b      restrict to these category ids
 *   --order balanced|pure position assignment, default balanced
 *   --concurrency <n>     parallel API calls, default 4
 *   --dry-run             build every prompt and print the grid, call nothing
 *
 * Resume-on-crash: every trial is written the moment it returns, and the runner
 * skips any (run, category, variant, trialIndex) cell already in the database.
 * Kill it at trial 137 and re-run with --resume-latest; it picks up at 137.
 */

import { PrismaClient } from "@prisma/client";
import { askAgent } from "../src/lib/agent.ts";
import { buildUserPrompt, publicCode, assertUniqueCodes } from "../src/lib/prompt.ts";
import { listingOrderFor } from "../src/lib/rng.ts";
import { costUsd, fmtUsd, PRICING } from "../src/lib/cost.ts";
import type { Listing, SpecTable } from "../src/lib/types.ts";
import { VARIANTS } from "../src/lib/types.ts";

const prisma = new PrismaClient();

// ---------------------------------------------------------------- args

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const MODEL = arg("model", process.env.SHELFPROOF_MODEL ?? "claude-sonnet-4-6")!;
const TEMPERATURE = Number(arg("temperature", process.env.SHELFPROOF_TEMPERATURE ?? "0.7"));
const TRIALS_PER_CELL = Number(arg("trials", "8"));
const ORDER_MODE = (arg("order", "balanced") as "balanced" | "pure");
const CONCURRENCY = Number(arg("concurrency", "4"));
const DRY_RUN = flag("dry-run");
const ONLY = arg("categories")?.split(",").map((s) => s.trim());

// ---------------------------------------------------------------- helpers

type Row = {
  price: unknown;
  bullets: string[];
  specs: unknown;
  rating: number;
  reviewCount: number;
  reviews: string[];
  sku: string;
  brand: string;
  title: string;
  currency: string;
};

function toListing(r: Row): Listing {
  return {
    sku: r.sku,
    brand: r.brand,
    title: r.title,
    price: Number(r.price),
    currency: r.currency,
    bullets: r.bullets,
    specs: r.specs as SpecTable,
    rating: r.rating,
    reviewCount: r.reviewCount,
    reviews: r.reviews,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------- main

async function main() {
  if (!PRICING[MODEL]) {
    console.warn(`! No price table for ${MODEL} — cost will report as ${fmtUsd(0)}.`);
  }
  if (!DRY_RUN && !process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }

  const categories = await prisma.category.findMany({
    where: ONLY ? { id: { in: ONLY } } : undefined,
    include: { listings: true, variants: true, intents: { orderBy: { index: "asc" } } },
    orderBy: { id: "asc" },
  });
  if (!categories.length) {
    console.error("No categories found. Run `npm run db:seed` first.");
    process.exit(1);
  }

  // ---- resolve the run (new, or resumed)
  let runId = arg("resume");
  if (!runId && flag("resume-latest")) {
    const latest = await prisma.run.findFirst({
      where: { finishedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (!latest) {
      console.error("No unfinished run to resume.");
      process.exit(1);
    }
    runId = latest.id;
  }
  if (runId) {
    const run = await prisma.run.findUnique({ where: { id: runId } });
    if (!run) {
      console.error(`Run ${runId} not found.`);
      process.exit(1);
    }
    console.log(`Resuming run ${run.id} (${run.model}, temp ${run.temperature})`);
  } else if (!DRY_RUN) {
    const run = await prisma.run.create({
      data: { model: MODEL, temperature: TEMPERATURE, note: `order=${ORDER_MODE}` },
    });
    runId = run.id;
    console.log(`Started run ${runId}`);
  } else {
    runId = "dry-run";
  }

  // Cells already done, so a resume skips them without an API call.
  const done = new Set(
    DRY_RUN
      ? []
      : (
          await prisma.trial.findMany({
            where: { runId },
            select: { categoryId: true, variant: true, trialIndex: true },
          })
        ).map((t) => `${t.categoryId}|${t.variant}|${t.trialIndex}`),
  );
  if (done.size) console.log(`  ${done.size} trials already recorded — skipping those.\n`);

  const totalCells = categories.length * VARIANTS.length * TRIALS_PER_CELL;
  let completed = 0;
  let invalid = 0;
  let subjectWins = 0;
  let grandCost = 0;
  let grandIn = 0;
  let grandOut = 0;
  const startedAt = Date.now();

  for (const cat of categories) {
    const bySku = new Map(cat.listings.map((l) => [l.sku, toListing(l as Row)]));
    const controlSkus = cat.listings.filter((l) => !l.isSubject).map((l) => l.sku);
    const specKeys = cat.specKeys;
    assertUniqueCodes(cat.listings.map((l) => l.sku));

    const codeToSku = new Map(cat.listings.map((l) => [publicCode(l.sku), l.sku]));

    for (const variant of VARIANTS) {
      const vRow = cat.variants.find((v) => v.variant === variant);
      if (!vRow) {
        console.error(`${cat.id}: missing seeded variant ${variant} — re-run db:seed`);
        process.exit(1);
      }
      const subjectListing = toListing(vRow as unknown as Row);

      const cells = Array.from({ length: TRIALS_PER_CELL }, (_, i) => i).filter(
        (t) => !done.has(`${cat.id}|${variant}|${t}`),
      );

      const cellStart = Date.now();
      let cellIn = 0;
      let cellOut = 0;
      let cellWins = 0;
      let cellValid = 0;
      let cellInvalid = 0;

      await mapLimit(cells, CONCURRENCY, async (trialIndex) => {
        const intent = cat.intents[trialIndex % cat.intents.length];
        const order = listingOrderFor(cat.id, trialIndex, cat.subjectSku, controlSkus, ORDER_MODE);
        const ordered = order.map((sku) =>
          sku === cat.subjectSku ? subjectListing : bySku.get(sku)!,
        );
        const validCodes = order.map(publicCode);
        const userPrompt = buildUserPrompt(intent.text, ordered, specKeys);

        if (DRY_RUN) {
          completed++;
          return;
        }

        const ans = await askAgent({
          model: MODEL,
          temperature: TEMPERATURE,
          maxTokens: 1024,
          userPrompt,
          validCodes,
        });

        const chosenSku = ans.chosenCode ? codeToSku.get(ans.chosenCode) ?? null : null;
        const rankingSkus = ans.ranking.map((c) => codeToSku.get(c) ?? c);
        const valid = ans.invalidCause === null && chosenSku !== null;
        const subjectRank = valid ? rankingSkus.indexOf(cat.subjectSku) + 1 : null;
        const subjectWon = valid ? chosenSku === cat.subjectSku : null;

        await prisma.trial.create({
          data: {
            runId: runId!,
            categoryId: cat.id,
            variantId: vRow.id,
            intentId: intent.id,
            variant,
            trialIndex,
            seed: trialIndex,
            listingOrder: order,
            subjectPosition: order.indexOf(cat.subjectSku),
            chosenSku,
            ranking: rankingSkus,
            reason: ans.reason,
            subjectWon,
            subjectRank: subjectRank && subjectRank > 0 ? subjectRank : null,
            valid,
            invalidCause: ans.invalidCause,
            rawResponse: ans.raw.slice(0, 8000),
            parseRetried: ans.parseRetried,
            latencyMs: ans.latencyMs,
            inputTokens: ans.inputTokens,
            outputTokens: ans.outputTokens,
          },
        });

        cellIn += ans.inputTokens;
        cellOut += ans.outputTokens;
        completed++;
        if (valid) {
          cellValid++;
          if (subjectWon) {
            cellWins++;
            subjectWins++;
          }
        } else {
          cellInvalid++;
          invalid++;
        }
      });

      const cellCost = costUsd(MODEL, cellIn, cellOut);
      grandCost += cellCost;
      grandIn += cellIn;
      grandOut += cellOut;

      const skipped = TRIALS_PER_CELL - cells.length;
      const label = `${cat.id}/${variant}`.padEnd(38);
      const winStr = cellValid ? `${cellWins}/${cellValid} wins` : "—";
      console.log(
        `${label} ${String(cells.length).padStart(2)} trials  ${winStr.padEnd(12)}` +
          `${cellInvalid ? `${cellInvalid} invalid  ` : ""}` +
          `${fmtUsd(cellCost).padStart(8)}  ${((Date.now() - cellStart) / 1000).toFixed(1)}s` +
          `${skipped ? `  (${skipped} skipped)` : ""}`,
      );
    }

    console.log(`  ${cat.id} subtotal: ${fmtUsd(grandCost)} running\n`);
  }

  if (!DRY_RUN && runId) {
    await prisma.run.update({ where: { id: runId }, data: { finishedAt: new Date() } });
  }

  const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log("─".repeat(72));
  console.log(
    `${completed}/${totalCells} trials  ·  ${subjectWins} subject wins  ·  ${invalid} invalid  ·  ${mins} min`,
  );
  console.log(
    `tokens: ${grandIn.toLocaleString("en-GB")} in / ${grandOut.toLocaleString("en-GB")} out  ·  total ${fmtUsd(grandCost)}`,
  );
  if (!DRY_RUN) console.log(`run id: ${runId}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("\nRun aborted:", e);
    console.error("Re-run with --resume-latest to continue from where it stopped.");
    await prisma.$disconnect();
    process.exit(1);
  });

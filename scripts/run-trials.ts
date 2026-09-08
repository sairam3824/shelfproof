/**
 * npm run trials — execute the 5 x 6 x 8 = 240 trial grid.
 *
 *   --model <id>          default $SHELFPROOF_MODEL or claude-sonnet-4-6
 *   --temperature <n>     default $SHELFPROOF_TEMPERATURE or 0.7
 *   --trials <n>          trials per (category, variant) cell, default 8
 *   --resume <runId>      continue an existing run, skipping completed cells
 *   --resume-latest       continue the most recent unfinished run
 *   --repair              re-run only the cells that failed with an API error
 *   --categories a,b      restrict to these category ids
 *   --order balanced|pure position assignment, default balanced
 *   --concurrency <n>     parallel API calls, default 4
 *   --allow-unpriced      permit a model with no price table (cost unreported)
 *   --dry-run             build every prompt and print the grid, call nothing
 *
 * Resume-on-crash: every trial is written the moment it returns, and the runner
 * skips any (run, category, variant, trialIndex) cell already in the database.
 * Kill it at trial 137 and re-run with --resume-latest; it picks up at 137.
 *
 * Trials that failed with `api_error` are NOT treated as done. A rate limit or
 * a dropped connection is an infrastructure failure, not a measurement, and
 * leaving it in the database permanently removes that trial from the
 * denominator. Resume re-runs them. Parse and ranking failures are left alone —
 * those are the model's actual behaviour and the spec counts them as data.
 */

import { PrismaClient } from "@prisma/client";
import { askAgent } from "../src/lib/agent.ts";
import { buildUserPrompt, publicCode, assertUniqueCodes } from "../src/lib/prompt.ts";
import { listingOrderFor, intentIndexFor, isBalanceable } from "../src/lib/rng.ts";
import { costUsd, fmtUsd, PRICING, temperatureSupport } from "../src/lib/cost.ts";
import { listingContentHash } from "../src/lib/content-hash.ts";
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
const TEMPERATURE_ARG = arg("temperature", process.env.SHELFPROOF_TEMPERATURE ?? "0.7");
const TEMPERATURE_REQUESTED = Number(TEMPERATURE_ARG);
const TRIALS_PER_CELL = Number(arg("trials", "8"));
const ORDER_MODE = arg("order", "balanced") as "balanced" | "pure";
const CONCURRENCY = Number(arg("concurrency", "4"));
const DRY_RUN = flag("dry-run");
const REPAIR = flag("repair");
const ALLOW_UNPRICED = flag("allow-unpriced");
const ONLY = arg("categories")?.split(",").map((s) => s.trim());

/** Infrastructure failures, safe (and necessary) to re-run. */
const REPAIRABLE = new Set(["api_error"]);

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

function die(message: string): never {
  console.error(message);
  void prisma.$disconnect();
  process.exit(1);
}

// ---------------------------------------------------------------- preflight

/**
 * Resolve the temperature for this model, or refuse to run.
 *
 * The design needs repeated trials to vary. Sampling parameters were removed
 * across the Claude 5 generation, so sending `temperature` to those models
 * turns all 240 calls into api_error rows — 240 failures discovered one at a
 * time rather than one failure discovered now.
 */
function resolveTemperature(): number | null {
  const support = temperatureSupport(MODEL);

  if (support === "unknown") {
    if (!ALLOW_UNPRICED) {
      die(
        `Unknown model "${MODEL}".\n` +
          "  It has no price table and its sampling support has not been vetted, so a\n" +
          "  run would report an unknown cost and might fail on every call.\n" +
          `  Add it to PRICING and SUPPORTS_TEMPERATURE in src/lib/cost.ts, or pass\n` +
          "  --allow-unpriced to run anyway with temperature omitted.",
      );
    }
    console.warn(
      `! ${MODEL} is not in the price table — cost will report as n/a, and\n` +
        "  temperature will be omitted since its sampling support is unknown.\n",
    );
    return null;
  }

  if (support === "no") {
    die(
      `${MODEL} does not accept a temperature parameter.\n` +
        "  This experiment needs stochastic sampling: 8 trials per cell are only\n" +
        "  independent draws if the model can vary its answer. Sending temperature\n" +
        "  anyway would fail every call with a 400.\n\n" +
        "  Use a model that still accepts it (claude-sonnet-4-6, claude-opus-4-6,\n" +
        "  claude-haiku-4-5), or change the design so variance comes from the\n" +
        "  model's own sampling rather than from 240 identical prompts.",
    );
  }

  if (!Number.isFinite(TEMPERATURE_REQUESTED) || TEMPERATURE_REQUESTED < 0) {
    die(`Invalid --temperature "${TEMPERATURE_ARG}".`);
  }
  return TEMPERATURE_REQUESTED;
}

// ---------------------------------------------------------------- main

async function main() {
  if (!Number.isInteger(TRIALS_PER_CELL) || TRIALS_PER_CELL < 1) {
    die(`Invalid --trials "${arg("trials", "8")}" — expected a positive integer.`);
  }
  if (ORDER_MODE !== "balanced" && ORDER_MODE !== "pure") {
    die(`Invalid --order "${ORDER_MODE}" — expected "balanced" or "pure".`);
  }

  const TEMPERATURE = resolveTemperature();

  if (!DRY_RUN && !process.env.ANTHROPIC_API_KEY) {
    die("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.");
  }

  const categories = await prisma.category.findMany({
    where: ONLY ? { id: { in: ONLY } } : undefined,
    include: { listings: true, variants: true, intents: { orderBy: { index: "asc" } } },
    orderBy: { id: "asc" },
  });
  if (!categories.length) {
    die("No categories found. Run `npm run db:seed` first.");
  }

  // ---- balance guard
  if (ORDER_MODE === "balanced") {
    for (const cat of categories) {
      const n = cat.intents.length;
      if (!n) die(`${cat.id}: no shopper intents seeded.`);
      if (!isBalanceable(TRIALS_PER_CELL, n)) {
        die(
          `--trials ${TRIALS_PER_CELL} cannot be balanced for ${cat.id}.\n` +
            `  Balanced mode puts the subject in each of the 4 slots equally often\n` +
            `  within each of the ${n} intents, so trials per cell must be a multiple\n` +
            `  of ${4 * n}. Use ${4 * n}, ${8 * n}, ${16 * n}, ... or pass --order pure.`,
        );
      }
    }
  }

  // ---- resolve the run (new, or resumed)
  let runId = arg("resume");
  if (!runId && (flag("resume-latest") || REPAIR)) {
    const latest = await prisma.run.findFirst({
      // A repair targets a run that has already finished; a resume targets one
      // that has not.
      where: REPAIR ? undefined : { finishedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (!latest) die(REPAIR ? "No run to repair." : "No unfinished run to resume.");
    runId = latest.id;
  }

  if (runId) {
    const run = await prisma.run.findUnique({ where: { id: runId } });
    if (!run) die(`Run ${runId} not found.`);

    // Continuing a run under different settings silently blends two
    // experiments into one row. Refuse rather than produce a mixed dataset.
    const mismatches: string[] = [];
    if (run.model !== MODEL) mismatches.push(`model: run has ${run.model}, args say ${MODEL}`);
    if ((run.temperature ?? null) !== TEMPERATURE) {
      mismatches.push(
        `temperature: run has ${run.temperature ?? "none"}, args say ${TEMPERATURE ?? "none"}`,
      );
    }
    if (run.trialsPerCell !== TRIALS_PER_CELL) {
      mismatches.push(`trials: run has ${run.trialsPerCell}, args say ${TRIALS_PER_CELL}`);
    }
    if (run.orderMode !== ORDER_MODE) {
      mismatches.push(`order: run has ${run.orderMode}, args say ${ORDER_MODE}`);
    }
    if (mismatches.length) {
      die(
        `Cannot continue run ${run.id} under different settings:\n` +
          mismatches.map((m) => "  - " + m).join("\n") +
          "\n\n  Every trial in a run must share the same model, temperature, cell size\n" +
          "  and order mode, or the run's own metadata describes only some of its\n" +
          "  trials. Match the flags above, or start a new run.",
      );
    }

    console.log(
      `${REPAIR ? "Repairing" : "Resuming"} run ${run.id} ` +
        `(${run.model}, temp ${run.temperature ?? "n/a"}, ${run.trialsPerCell}/cell)`,
    );
    // A repair reopens a finished run until it completes again.
    if (REPAIR && run.finishedAt) {
      await prisma.run.update({ where: { id: run.id }, data: { finishedAt: null } });
    }
  } else if (REPAIR) {
    die("--repair needs an existing run (--resume <runId>, or omit to use the latest).");
  } else if (!DRY_RUN) {
    const run = await prisma.run.create({
      data: {
        model: MODEL,
        temperature: TEMPERATURE,
        trialsPerCell: TRIALS_PER_CELL,
        orderMode: ORDER_MODE,
      },
    });
    runId = run.id;
    console.log(`Started run ${runId}`);
  } else {
    runId = "dry-run";
  }

  // ---- which cells still need running
  //
  // A cell counts as done only if it holds a trial that is not an
  // infrastructure failure. api_error rows are re-run and overwritten.
  const existing = DRY_RUN
    ? []
    : await prisma.trial.findMany({
        where: { runId },
        select: { categoryId: true, variant: true, trialIndex: true, valid: true, invalidCause: true },
      });

  const done = new Set<string>();
  const repairable = new Set<string>();
  for (const t of existing) {
    const key = `${t.categoryId}|${t.variant}|${t.trialIndex}`;
    if (!t.valid && t.invalidCause && REPAIRABLE.has(t.invalidCause)) repairable.add(key);
    else done.add(key);
  }

  if (done.size) console.log(`  ${done.size} trials already recorded — skipping those.`);
  if (repairable.size) console.log(`  ${repairable.size} trials failed with an API error — re-running those.`);
  if (REPAIR && !repairable.size) {
    console.log("  Nothing to repair: no API-error trials in this run.");
  }
  if (done.size || repairable.size) console.log("");

  const totalCells = categories.length * VARIANTS.length * TRIALS_PER_CELL;
  let completed = 0;
  let invalid = 0;
  let repaired = 0;
  let subjectWins = 0;
  let grandIn = 0;
  let grandOut = 0;
  const priced = Boolean(PRICING[MODEL]);
  const startedAt = Date.now();

  for (const cat of categories) {
    const bySku = new Map(cat.listings.map((l) => [l.sku, toListing(l as Row)]));
    const controlSkus = cat.listings.filter((l) => !l.isSubject).map((l) => l.sku);
    const specKeys = cat.specKeys;
    const intentCount = cat.intents.length;
    assertUniqueCodes(cat.listings.map((l) => l.sku));

    const codeToSku = new Map(cat.listings.map((l) => [publicCode(l.sku), l.sku]));

    for (const variant of VARIANTS) {
      const vRow = cat.variants.find((v) => v.variant === variant);
      if (!vRow) {
        die(`${cat.id}: missing seeded variant ${variant} — re-run db:seed`);
      }
      const subjectListing = toListing(vRow as unknown as Row);
      // Prefer the hash the seed script stored; fall back to computing it so a
      // database seeded before this column existed still records provenance.
      const contentHash =
        vRow.contentHash || listingContentHash({ ...subjectListing, specs: subjectListing.specs });

      const cells = Array.from({ length: TRIALS_PER_CELL }, (_, i) => i).filter((t) => {
        const key = `${cat.id}|${variant}|${t}`;
        if (done.has(key)) return false;
        // In repair mode, only previously-failed cells run.
        return REPAIR ? repairable.has(key) : true;
      });

      const cellStart = Date.now();
      let cellIn = 0;
      let cellOut = 0;
      let cellWins = 0;
      let cellValid = 0;
      let cellInvalid = 0;
      let cellRepaired = 0;

      await mapLimit(cells, CONCURRENCY, async (trialIndex) => {
        const intentIndex = intentIndexFor(trialIndex, intentCount);
        const intent = cat.intents[intentIndex];
        const order = listingOrderFor(
          cat.id,
          trialIndex,
          cat.subjectSku,
          controlSkus,
          ORDER_MODE,
          intentCount,
        );
        const ordered = order.map((sku) =>
          sku === cat.subjectSku ? subjectListing : bySku.get(sku)!,
        );
        const validCodes = order.map(publicCode);
        const userPrompt = buildUserPrompt(intent.text, ordered, specKeys);

        if (DRY_RUN) {
          completed++;
          return;
        }

        const wasRepair = repairable.has(`${cat.id}|${variant}|${trialIndex}`);

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

        const data = {
          runId: runId!,
          categoryId: cat.id,
          variantId: vRow.id,
          intentId: intent.id,
          variant,
          trialIndex,
          seed: trialIndex,
          intentIndex,
          variantContentHash: contentHash,
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
        };

        // Upsert rather than create: a repaired cell overwrites the api_error
        // row it is replacing, in one round trip and without a delete race.
        await prisma.trial.upsert({
          where: {
            runId_categoryId_variant_trialIndex: {
              runId: runId!,
              categoryId: cat.id,
              variant,
              trialIndex,
            },
          },
          create: data,
          update: data,
        });

        cellIn += ans.inputTokens;
        cellOut += ans.outputTokens;
        completed++;
        if (wasRepair) {
          cellRepaired++;
          repaired++;
        }
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

      grandIn += cellIn;
      grandOut += cellOut;

      if (!cells.length) continue;

      const cellCost = costUsd(MODEL, cellIn, cellOut);
      const skipped = TRIALS_PER_CELL - cells.length;
      const label = `${cat.id}/${variant}`.padEnd(38);
      const winStr = cellValid ? `${cellWins}/${cellValid} wins` : "—";
      console.log(
        `${label} ${String(cells.length).padStart(2)} trials  ${winStr.padEnd(12)}` +
          `${cellInvalid ? `${cellInvalid} invalid  ` : ""}` +
          `${cellRepaired ? `${cellRepaired} repaired  ` : ""}` +
          `${fmtUsd(cellCost).padStart(8)}  ${((Date.now() - cellStart) / 1000).toFixed(1)}s` +
          `${skipped ? `  (${skipped} skipped)` : ""}`,
      );
    }

    console.log(`  ${cat.id} subtotal: ${fmtUsd(costUsd(MODEL, grandIn, grandOut))} running\n`);
  }

  if (!DRY_RUN && runId) {
    await prisma.run.update({ where: { id: runId }, data: { finishedAt: new Date() } });
  }

  const grandCost = costUsd(MODEL, grandIn, grandOut);
  const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log("─".repeat(72));
  console.log(
    `${completed}/${totalCells} trials  ·  ${subjectWins} subject wins  ·  ${invalid} invalid` +
      `${repaired ? `  ·  ${repaired} repaired` : ""}  ·  ${mins} min`,
  );
  console.log(
    `tokens: ${grandIn.toLocaleString("en-GB")} in / ${grandOut.toLocaleString("en-GB")} out  ·  total ${fmtUsd(grandCost)}` +
      (priced ? "" : `  (no price table for ${MODEL})`),
  );
  if (invalid) {
    console.log(
      `\n${invalid} invalid trial(s). If any are api_error, re-run with --repair to retry just those.`,
    );
  }
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

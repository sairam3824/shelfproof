/**
 * npm run report — print a completed run's analysis as markdown, ready to paste
 * into the README's Results section.
 *
 *   --run <runId>   default: most recent finished run
 *
 * This exists so the README's numbers come out of the database rather than out
 * of someone's memory of what the dashboard showed.
 */

import { analyseVariants, fmtPct, fmtSignedPct, type TrialRow } from "../src/lib/analysis.ts";
import { costUsd, fmtUsd, PRICING } from "../src/lib/cost.ts";
import { prisma } from "../src/lib/db.ts";
import { VARIANT_LABELS, VARIANTS } from "../src/lib/types.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : undefined;
}

async function fail(message: string): Promise<never> {
  console.error(message);
  await prisma.$disconnect();
  process.exit(1);
}

async function main() {
  const runId =
    arg("run") ??
    (
      await prisma.run.findFirst({
        where: { finishedAt: { not: null } },
        orderBy: { startedAt: "desc" },
        select: { id: true },
      })
    )?.id;

  if (!runId) return fail("No finished run found. Run `npm run trials` first.");

  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run) return fail(`Run ${runId} not found.`);

  const [categories, agg, invalid] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.trial.aggregate({
      where: { runId },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true },
      _avg: { latencyMs: true },
    }),
    prisma.trial.count({ where: { runId, valid: false } }),
  ]);

  const cost = costUsd(run.model, agg._sum.inputTokens ?? 0, agg._sum.outputTokens ?? 0);

  console.log(
    `Run \`${run.id}\` — ${run.model}, temperature ${run.temperature ?? "n/a"}, ` +
      `${run.startedAt.toISOString().slice(0, 10)}.`,
  );
  console.log(
    `${agg._count._all} trials, ${invalid} invalid, ` +
      `mean latency ${Math.round(agg._avg.latencyMs ?? 0)} ms, total cost ${fmtUsd(cost)}.`,
  );
  // An unpriced model would otherwise print a confident-looking number into the
  // README. Say so in the output itself, not just on the runner's console.
  if (!PRICING[run.model]) {
    console.log(
      `\n> Cost is unavailable: no price table entry for \`${run.model}\`. ` +
        `${(agg._sum.inputTokens ?? 0).toLocaleString("en-GB")} input / ` +
        `${(agg._sum.outputTokens ?? 0).toLocaleString("en-GB")} output tokens were used.`,
    );
  }
  console.log("");

  const findings: string[] = [];
  const nonControlCells = categories.length * (VARIANTS.length - 1);

  for (const cat of categories) {
    const trials = await prisma.trial.findMany({
      where: { runId, categoryId: cat.id },
      select: { variant: true, valid: true, subjectWon: true, subjectRank: true },
    });
    const stats = analyseVariants(trials as TrialRow[]);

    console.log(`### ${cat.name} — subject \`${cat.subjectSku}\`\n`);
    console.log("| Variant | Win rate | 95% CI | Lift | Lift 95% CI | Mean rank | Verdict |");
    console.log("| --- | ---: | ---: | ---: | ---: | ---: | --- |");
    for (const s of stats) {
      const verdict =
        s.verdict === "control"
          ? "control"
          : s.verdict === "higher"
            ? "**higher**"
            : s.verdict === "lower"
              ? "**lower**"
              : s.verdict === "insufficient"
                ? "insufficient data"
                : "no measurable effect";
      console.log(
        `| \`${s.variant}\` — ${VARIANT_LABELS[s.variant]} ` +
          `| ${fmtPct(s.winRate)} (${s.wins}/${s.validTrials}) ` +
          `| ${s.ci ? `${fmtPct(s.ci.lo)}–${fmtPct(s.ci.hi)}` : "—"} ` +
          `| ${fmtSignedPct(s.lift)} ` +
          `| ${s.liftCi ? `${fmtSignedPct(s.liftCi.lo)} to ${fmtSignedPct(s.liftCi.hi)}` : "—"} ` +
          `| ${s.meanRank === null ? "—" : s.meanRank.toFixed(2)} ` +
          `| ${verdict} |`,
      );

      if (s.verdict === "higher" || s.verdict === "lower") {
        findings.push(
          `${cat.name}: ${s.variant} ${fmtSignedPct(s.lift)} ` +
            `(${fmtSignedPct(s.liftCi!.lo)} to ${fmtSignedPct(s.liftCi!.hi)})`,
        );
      }
    }
    console.log("");
  }

  console.log("### Cells clearing the noise band\n");
  if (findings.length) {
    for (const f of findings) console.log(`- ${f}`);
  } else {
    console.log(
      "None. Every lift interval contains zero — at 8 trials per cell this run " +
        "distinguishes no variant from control.",
    );
  }
  console.log(`\n${findings.length} of ${nonControlCells} non-control cells cleared the noise band.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

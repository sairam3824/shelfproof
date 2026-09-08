import { prisma } from "./db.ts";
import {
  analyseVariants,
  analysePositions,
  poolAcrossCategories,
  type TrialRow,
  type VariantStats,
} from "./analysis.ts";

/** The run the dashboard reads. Defaults to the most recent finished run, so
 *  a half-finished run in progress never silently becomes "the result". */
export async function resolveRunId(requested?: string): Promise<string | null> {
  if (requested) {
    const exists = await prisma.run.findUnique({ where: { id: requested }, select: { id: true } });
    if (exists) return exists.id;
  }
  const finished = await prisma.run.findFirst({
    where: { finishedAt: { not: null } },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (finished) return finished.id;
  const any = await prisma.run.findFirst({ orderBy: { startedAt: "desc" }, select: { id: true } });
  return any?.id ?? null;
}

export async function listRuns() {
  return prisma.run.findMany({
    orderBy: { startedAt: "desc" },
    include: { _count: { select: { trials: true } } },
  });
}

export type DbStatus = { ok: true } | { ok: false; message: string };

/**
 * Is the database reachable?
 *
 * Checked explicitly so a missing DATABASE_URL renders setup instructions
 * instead of an unhandled exception. A bench that 500s before it can tell you
 * to run `db:push` is not usable on the one day it matters most — the first.
 */
export async function dbHealth(): Promise<DbStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message.split("\n")[0] : String(e) };
  }
}

/** Runs and the default selection, for the nav's run picker. */
export async function getNavData() {
  const health = await dbHealth();
  if (!health.ok) return { health, runs: [], defaultRunId: null };
  const [runs, defaultRunId] = await Promise.all([listRuns(), resolveRunId()]);
  return {
    health,
    defaultRunId,
    runs: runs.map((r) => ({
      id: r.id,
      model: r.model,
      startedAt: r.startedAt.toISOString().slice(0, 16).replace("T", " "),
      trials: r._count.trials,
      finished: Boolean(r.finishedAt),
    })),
  };
}

export async function listCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

export async function getCategoryAnalysis(runId: string, categoryId: string) {
  const trials = await prisma.trial.findMany({
    where: { runId, categoryId },
    select: { variant: true, valid: true, subjectWon: true, subjectRank: true },
  });
  return analyseVariants(trials as TrialRow[]);
}

/**
 * Every variant analysed once per category, then pooled.
 *
 * Pooling needs the per-category breakdown anyway (lift is defined against each
 * category's own control), so both are returned from the one pass.
 */
export async function getPooledAnalysis(
  runId: string,
): Promise<{ pooled: VariantStats[]; byCategory: { id: string; name: string; stats: VariantStats[] }[] }> {
  const [categories, trials] = await Promise.all([
    listCategories(),
    prisma.trial.findMany({
      where: { runId },
      select: {
        categoryId: true,
        variant: true,
        valid: true,
        subjectWon: true,
        subjectRank: true,
      },
    }),
  ]);

  const byCategory = categories.map((c) => ({
    id: c.id,
    name: c.name,
    stats: analyseVariants(trials.filter((t) => t.categoryId === c.id) as TrialRow[]),
  }));

  return { pooled: poolAcrossCategories(byCategory.map((c) => c.stats)), byCategory };
}

/**
 * Subject win rate by presented slot — the audit of the randomisation.
 * Omit categoryId to check the whole run at once.
 */
export async function getPositionAnalysis(runId: string, categoryId?: string) {
  const trials = await prisma.trial.findMany({
    where: { runId, ...(categoryId ? { categoryId } : {}) },
    select: { variant: true, valid: true, subjectWon: true, subjectRank: true, subjectPosition: true },
  });
  return analysePositions(trials as TrialRow[]);
}

/** Every trial for one cell, for the drill-down. */
export async function getVariantTrials(runId: string, categoryId: string, variant: string) {
  return prisma.trial.findMany({
    where: { runId, categoryId, variant },
    orderBy: { trialIndex: "asc" },
    include: { intent: true },
  });
}

/**
 * The subject listing as this run actually saw it.
 *
 * Resolved through a trial's own foreign key rather than by looking up
 * (categoryId, variant) directly, and checked against the hash the trial
 * recorded. Seeding is an upsert, so the row can have been rewritten since the
 * run — in which case `stale` is true and the UI must not present the current
 * text as what the agent read.
 */
export async function getVariantListing(runId: string, categoryId: string, variant: string) {
  const trial = await prisma.trial.findFirst({
    where: { runId, categoryId, variant },
    orderBy: { trialIndex: "asc" },
    select: { variantContentHash: true, variantRef: true },
  });
  if (!trial?.variantRef) return null;
  return {
    ...trial.variantRef,
    stale:
      Boolean(trial.variantContentHash) &&
      Boolean(trial.variantRef.contentHash) &&
      trial.variantContentHash !== trial.variantRef.contentHash,
  };
}

export async function getRunSummary(runId: string) {
  const [run, agg, invalid, staleCount] = await Promise.all([
    prisma.run.findUnique({ where: { id: runId } }),
    prisma.trial.aggregate({
      where: { runId },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true },
      _avg: { latencyMs: true },
    }),
    prisma.trial.count({ where: { runId, valid: false } }),
    // Trials whose subject listing has been re-seeded since the run.
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM trials t
      JOIN subject_variants v ON v.id = t."variantId"
      WHERE t."runId" = ${runId}
        AND t."variantContentHash" <> ''
        AND v."contentHash" <> ''
        AND t."variantContentHash" <> v."contentHash"
    `,
  ]);
  return { run, agg, invalid, stale: Number(staleCount[0]?.count ?? 0) };
}

/** Breakdown of why invalid trials were rejected, for the run header. */
export async function getInvalidBreakdown(runId: string) {
  const rows = await prisma.trial.groupBy({
    by: ["invalidCause"],
    where: { runId, valid: false },
    _count: { _all: true },
  });
  return rows
    .filter((r) => r.invalidCause !== null)
    .map((r) => ({ cause: r.invalidCause as string, count: r._count._all }))
    .sort((a, b) => b.count - a.count);
}

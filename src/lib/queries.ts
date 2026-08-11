import { prisma } from "./db.ts";
import { analyseVariants, type TrialRow } from "./analysis.ts";

/** The run the dashboard reads. Defaults to the most recent finished run, so
 *  a half-finished run in progress never silently becomes "the result". */
export async function resolveRunId(requested?: string): Promise<string | null> {
  if (requested) return requested;
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

/** Every trial for one cell, for the drill-down. */
export async function getVariantTrials(runId: string, categoryId: string, variant: string) {
  return prisma.trial.findMany({
    where: { runId, categoryId, variant },
    orderBy: { trialIndex: "asc" },
    include: { intent: true },
  });
}

export async function getSubjectVariant(categoryId: string, variant: string) {
  return prisma.subjectVariant.findUnique({
    where: { categoryId_variant: { categoryId, variant } },
  });
}

export async function getRunSummary(runId: string) {
  const [run, agg, invalid] = await Promise.all([
    prisma.run.findUnique({ where: { id: runId } }),
    prisma.trial.aggregate({
      where: { runId },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true },
      _avg: { latencyMs: true },
    }),
    prisma.trial.count({ where: { runId, valid: false } }),
  ]);
  return { run, agg, invalid };
}

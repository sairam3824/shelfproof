import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { VARIANT_LABELS, VARIANTS, type Variant } from "../../lib/types.ts";
import { editPriority, fmtPct, fmtSignedPct } from "../../lib/analysis.ts";
import { costUsd, fmtUsd, PRICING } from "../../lib/cost.ts";
import {
  dbHealth,
  getInvalidBreakdown,
  getPooledAnalysis,
  getPositionAnalysis,
  getRunSummary,
  resolveRunId,
} from "../../lib/queries.ts";
import LiftChart from "../components/LiftChart.tsx";
import { liftPoints } from "../components/lift-data.ts";
import PositionChart, { type PositionPoint } from "../components/PositionChart.tsx";
import {
  Code,
  EmptyState,
  HeroFigure,
  Notice,
  SectionHeading,
  StatTile,
  VerdictBadge,
} from "../components/ui.tsx";

export const dynamic = "force-dynamic";

const SHORT: Record<Variant, string> = {
  v0_control: "control",
  v1_title: "title",
  v2_claim_specificity: "claims",
  v3_price_position: "price",
  v4_review_text: "reviews",
  v5_spec_complete: "specs",
};

const VERDICT_MARK: Record<string, { icon: string; color: string }> = {
  higher: { icon: "▲", color: "var(--success-text)" },
  lower: { icon: "▼", color: "var(--critical)" },
  no_effect: { icon: "·", color: "var(--text-muted)" },
  insufficient: { icon: "?", color: "var(--text-muted)" },
  control: { icon: "—", color: "var(--text-muted)" },
};

function Page({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>;
}

export default async function Overview({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const sp = await searchParams;

  const health = await dbHealth();
  if (!health.ok) {
    return (
      <Page>
        <EmptyState
          title="Can't reach the database."
          body="Set DATABASE_URL and DIRECT_URL, then create the schema."
          hint={<Code>npm run db:push && npm run db:seed</Code>}
        />
      </Page>
    );
  }

  const runId = await resolveRunId(sp.run);
  if (!runId) {
    return (
      <Page>
        <EmptyState
          title="No trials recorded yet."
          body="Run the grid to populate the overview."
          hint={<Code>npm run trials</Code>}
        />
      </Page>
    );
  }

  const [{ pooled, byCategory }, summary, positions, invalidCauses] = await Promise.all([
    getPooledAnalysis(runId),
    getRunSummary(runId),
    getPositionAnalysis(runId),
    getInvalidBreakdown(runId),
  ]);
  const { run, agg, invalid, stale } = summary;

  const control = pooled.find((s) => s.variant === "v0_control")!;
  const { helped, hurt } = editPriority(pooled);
  const top = helped[0];
  const lifts = liftPoints(pooled, (v) => SHORT[v as Variant]);

  const cost = run ? costUsd(run.model, agg._sum.inputTokens ?? 0, agg._sum.outputTokens ?? 0) : null;

  const positionData: PositionPoint[] = positions.map((p) => ({
    label: `slot ${p.position}`,
    winRate: p.winRate ?? 0,
    lo: p.ci?.lo ?? 0,
    hi: p.ci?.hi ?? 0,
    err: [(p.winRate ?? 0) - (p.ci?.lo ?? 0), (p.ci?.hi ?? 0) - (p.winRate ?? 0)],
    trials: p.trials,
    wins: p.wins,
  }));
  const positionTotal = positions.reduce((a, p) => a + p.trials, 0);
  const positionWins = positions.reduce((a, p) => a + p.wins, 0);

  const catLink = (id: string) =>
    ("/?" + new URLSearchParams({ category: id, ...(sp.run ? { run: sp.run } : {}) })) as Route;

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="secondary mt-1 max-w-2xl text-sm">
            Every category pooled into one estimate per edit. Pooling is where the statistical
            power is — a 5×8 cell has an interval roughly half the width of an 8-trial one.
          </p>
        </div>
        {run && (
          <div className="muted tnum text-xs">
            {run.model} · temp {run.temperature ?? "n/a"} ·{" "}
            {run.startedAt.toISOString().slice(0, 10)}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {run && !run.finishedAt && (
          <Notice tone="warning">
            This run has not finished — pooled cells may hold fewer trials than they eventually
            will.
          </Notice>
        )}
        {stale > 0 && (
          <Notice tone="critical">
            {stale} trial{stale === 1 ? "" : "s"} reference listing text that has been re-seeded
            since this run.
          </Notice>
        )}
      </div>

      {/* ----------------------------------------------------------- hero */}
      <section className="card mt-6 grid gap-6 p-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)]">
        {top ? (
          <HeroFigure
            value={fmtSignedPct(top.lift)}
            label="Best edit, pooled"
            sub={
              <>
                <span className="font-medium">{VARIANT_LABELS[top.variant]}</span> across all
                categories — 95% CI{" "}
                <span className="tnum">
                  {fmtSignedPct(top.liftCi!.lo)} to {fmtSignedPct(top.liftCi!.hi)}
                </span>
                .
              </>
            }
          />
        ) : (
          <HeroFigure
            value="None"
            label="Edits clearing the noise band"
            sub={
              <>
                Even pooled across {byCategory.length} categories, every lift interval contains
                zero. With {control.validTrials} pooled control trials the bench can only detect
                large effects.
              </>
            }
          />
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Pooled control"
            value={fmtPct(control.winRate)}
            hint={`${control.wins}/${control.validTrials}`}
          />
          <StatTile label="Trials" value={String(agg._count._all)} hint={`${byCategory.length} categories`} />
          <StatTile
            label="Invalid"
            value={agg._count._all ? fmtPct(invalid / agg._count._all, 1) : "—"}
            tone={invalid === 0 ? "neutral" : invalid > agg._count._all * 0.05 ? "critical" : "warning"}
            hint={
              invalidCauses.length
                ? invalidCauses.map((c) => `${c.count} ${c.cause}`).join(", ")
                : "none"
            }
          />
          <StatTile
            label="Cost"
            value={fmtUsd(cost)}
            hint={
              run && !PRICING[run.model]
                ? "no price table for this model"
                : `${((agg._sum.inputTokens ?? 0) / 1000).toFixed(0)}k in / ${(
                    (agg._sum.outputTokens ?? 0) / 1000
                  ).toFixed(0)}k out`
            }
          />
        </div>
      </section>

      {/* ---------------------------------------------------- pooled lift */}
      <section className="card mt-6 p-6">
        <SectionHeading
          title="Pooled lift against control"
          note={
            <>
              Each category contributes its own subject and its own control rate, so read the
              lift, not the level — a pooled win rate is the rate at which the
              subject-of-its-category gets picked, averaged over {byCategory.length} different
              contests.
            </>
          }
        />
        <div className="mt-4">
          <LiftChart data={lifts} />
        </div>
      </section>

      {/* --------------------------------------------------------- matrix */}
      <section className="card mt-6">
        <div className="p-6 pb-0">
          <SectionHeading
            title="Every edit in every category"
            note="Lift against that category's own control. An edit that helps everywhere is a finding about listings; one that helps in a single category is probably about that category."
          />
        </div>
        <div className="scroll-x mt-4">
          <table className="grid-table min-w-[820px]">
            <caption className="sr-only">Lift per variant per category, with verdicts</caption>
            <thead>
              <tr>
                <th scope="col">Edit</th>
                {byCategory.map((c) => (
                  <th key={c.id} scope="col" className="num">
                    <Link href={catLink(c.id)} className="link">
                      {c.name}
                    </Link>
                  </th>
                ))}
                <th scope="col" className="num">
                  Pooled
                </th>
              </tr>
            </thead>
            <tbody>
              {VARIANTS.filter((v) => v !== "v0_control").map((variant) => {
                const p = pooled.find((s) => s.variant === variant)!;
                return (
                  <tr key={variant}>
                    <td className="font-medium">{VARIANT_LABELS[variant]}</td>
                    {byCategory.map((c) => {
                      const s = c.stats.find((x) => x.variant === variant)!;
                      const mark = VERDICT_MARK[s.verdict];
                      return (
                        <td key={c.id} className="num tnum">
                          <span style={{ color: mark.color }}>
                            <span aria-hidden="true">{mark.icon}</span>{" "}
                            <span
                              style={{
                                color:
                                  s.verdict === "higher" || s.verdict === "lower"
                                    ? mark.color
                                    : "var(--text-secondary)",
                              }}
                            >
                              {fmtSignedPct(s.lift)}
                            </span>
                          </span>
                          <span className="sr-only">
                            {s.verdict === "higher"
                              ? " above control"
                              : s.verdict === "lower"
                                ? " below control"
                                : " no measurable effect"}
                          </span>
                        </td>
                      );
                    })}
                    <td className="num">
                      <div className="flex items-center justify-end gap-2">
                        <span className="tnum">{fmtSignedPct(p.lift)}</span>
                        <VerdictBadge verdict={p.verdict} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted px-6 pb-5 pt-3 text-xs">
          ▲ above control · ▼ below control · · interval spans zero. Percentages are lift, not
          win rate.
        </p>
      </section>

      {/* ------------------------------------------------------- position */}
      <section className="card mt-6 p-6">
        <SectionHeading
          title="Randomisation audit — whole run"
          note="Subject win rate by presented slot across every category. Four overlapping intervals is what the design predicts."
        />
        <div className="mt-4">
          <Suspense fallback={<div style={{ height: 260 }} />}>
            <PositionChart
              data={positionData}
              overall={positionTotal ? positionWins / positionTotal : null}
            />
          </Suspense>
        </div>
      </section>

      {hurt.length > 0 && (
        <section className="card mt-6 p-6">
          <SectionHeading
            title="Edits that measurably hurt, pooled"
            note="Listed separately so they are never read as a recommendation."
          />
          <ul className="mt-4 space-y-2">
            {hurt.map((s) => (
              <li key={s.variant} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="font-medium">{VARIANT_LABELS[s.variant]}</span>
                <span className="tnum" style={{ color: "var(--critical)" }}>
                  {fmtSignedPct(s.lift)} ({fmtSignedPct(s.liftCi!.lo)} to{" "}
                  {fmtSignedPct(s.liftCi!.hi)})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}

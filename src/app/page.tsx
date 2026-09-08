import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { VARIANT_LABELS, type Variant } from "../lib/types.ts";
import { editPriority, fmtPct, fmtSignedPct } from "../lib/analysis.ts";
import {
  dbHealth,
  getCategoryAnalysis,
  getInvalidBreakdown,
  getPositionAnalysis,
  getRunSummary,
  getVariantListing,
  getVariantTrials,
  listCategories,
  resolveRunId,
} from "../lib/queries.ts";
import WinRateChart, { type ChartPoint } from "./components/WinRateChart.tsx";
import LiftChart from "./components/LiftChart.tsx";
import { liftPoints } from "./components/lift-data.ts";
import PositionChart, { type PositionPoint } from "./components/PositionChart.tsx";
import {
  Code,
  EmptyState,
  HeroFigure,
  Notice,
  SectionHeading,
  StatTile,
  VerdictBadge,
} from "./components/ui.tsx";

export const dynamic = "force-dynamic";

/** Short axis labels — the full names live in the table and the tooltips. */
const SHORT: Record<Variant, string> = {
  v0_control: "control",
  v1_title: "title",
  v2_claim_specificity: "claims",
  v3_price_position: "price",
  v4_review_text: "reviews",
  v5_spec_complete: "specs",
};

const CAUSE_LABEL: Record<string, string> = {
  parse_failure: "unparseable JSON",
  missing_sku: "named a product not on the page",
  bad_ranking: "ranking was not a permutation",
  api_error: "API error",
};

function Page({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>;
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; variant?: string; run?: string }>;
}) {
  const sp = await searchParams;

  // ---- setup states, in the order a new checkout hits them
  const health = await dbHealth();
  if (!health.ok) {
    return (
      <Page>
        <EmptyState
          title="Can't reach the database."
          body="ShelfProof reads results from Postgres; nothing is computed at request time. Set DATABASE_URL and DIRECT_URL, then create the schema."
          hint={
            <>
              <div className="mb-2">
                <Code>cp .env.example .env</Code> — fill in your Neon connection strings
              </div>
              <div className="mb-2">
                <Code>npm run db:push</Code> — create the tables
              </div>
              <div className="mb-3">
                <Code>npm run db:seed</Code> — load the 20 listings
              </div>
              <div className="secondary break-words">{health.message}</div>
            </>
          }
        />
      </Page>
    );
  }

  const categories = await listCategories();
  if (!categories.length) {
    return (
      <Page>
        <EmptyState
          title="No seed data yet."
          body="The schema is reachable but empty. Seeding loads 5 categories, 20 baseline listings, 30 materialised subject variants and 10 shopper intents."
          hint={
            <>
              <Code>npm run db:seed</Code>
            </>
          }
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
          body="The bench is seeded and ready. Running the grid executes 5 categories x 6 variants x 8 trials = 240 LLM calls and writes each result as it returns."
          hint={
            <>
              <div className="mb-2">
                <Code>npm run trials -- --dry-run</Code> — build every prompt, call nothing
              </div>
              <div>
                <Code>npm run trials</Code> — execute the grid (resumable)
              </div>
            </>
          }
        />
      </Page>
    );
  }

  // ---- the actual view
  const category = categories.find((c) => c.id === sp.category) ?? categories[0];
  const [stats, summary, positions, invalidCauses] = await Promise.all([
    getCategoryAnalysis(runId, category.id),
    getRunSummary(runId),
    getPositionAnalysis(runId, category.id),
    getInvalidBreakdown(runId),
  ]);
  const { run, agg, invalid, stale } = summary;

  const control = stats.find((s) => s.variant === "v0_control")!;
  const { helped, hurt, noEffect, insufficient } = editPriority(stats);

  const chartData: ChartPoint[] = stats
    .filter((s) => s.winRate !== null && s.ci !== null)
    .map((s) => ({
      variant: s.variant,
      label: SHORT[s.variant],
      winRate: s.winRate!,
      ciLo: s.ci!.lo,
      ciHi: s.ci!.hi,
      err: [s.winRate! - s.ci!.lo, s.ci!.hi - s.winRate!],
      verdict: s.verdict,
      validTrials: s.validTrials,
      wins: s.wins,
    }));

  const lifts = liftPoints(stats, (v) => SHORT[v as Variant]);

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

  // ---- drill-down
  const selectedVariant = (sp.variant ?? "") as Variant;
  const hasSelection = selectedVariant in VARIANT_LABELS;
  const [drillTrials, drillListing] = hasSelection
    ? await Promise.all([
        getVariantTrials(runId, category.id, selectedVariant),
        getVariantListing(runId, category.id, selectedVariant),
      ])
    : [[], null];

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ category: category.id, ...(sp.run ? { run: sp.run } : {}) });
    for (const [k, v] of Object.entries(over)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return ("/?" + p.toString()) as Route;
  };

  const top = helped[0];

  return (
    <Page>
      {/* ---------------------------------------------------------- header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{category.name}</h1>
          <p className="secondary mt-1 text-sm">
            Which single edit makes the assistant recommend{" "}
            <span className="tnum font-medium" style={{ color: "var(--text-primary)" }}>
              {category.subjectSku}
            </span>
            ?
          </p>
        </div>
        {run && (
          <dl className="muted tnum flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <div>
              <dt className="inline">model </dt>
              <dd className="inline" style={{ color: "var(--text-secondary)" }}>
                {run.model}
              </dd>
            </div>
            <div>
              <dt className="inline">temp </dt>
              <dd className="inline" style={{ color: "var(--text-secondary)" }}>
                {run.temperature ?? "n/a"}
              </dd>
            </div>
            <div>
              <dt className="inline">trials </dt>
              <dd className="inline" style={{ color: "var(--text-secondary)" }}>
                {agg._count._all}
              </dd>
            </div>
            <div>
              <dt className="inline">latency </dt>
              <dd className="inline" style={{ color: "var(--text-secondary)" }}>
                {Math.round(agg._avg.latencyMs ?? 0)}ms
              </dd>
            </div>
          </dl>
        )}
      </div>

      {/* ------------------------------------------------------- warnings */}
      <div className="mt-4 space-y-2">
        {run && !run.finishedAt && (
          <Notice tone="warning">
            This run has not finished. Cells that have not executed yet are missing from every
            number on this page — they are not zeros.
          </Notice>
        )}
        {stale > 0 && (
          <Notice tone="critical">
            {stale} trial{stale === 1 ? "" : "s"} in this run reference listing text that has been
            re-seeded since. The listings shown in the drill-down are the current ones, not
            necessarily what the agent read. Start a new run to restore provenance.
          </Notice>
        )}
      </div>

      {/* ------------------------------------------------------- category */}
      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Category">
        {categories.map((c) => (
          <Link
            key={c.id}
            href={
              ("/?" +
                new URLSearchParams({
                  category: c.id,
                  ...(sp.run ? { run: sp.run } : {}),
                })) as Route
            }
            className="pill"
            data-active={c.id === category.id}
            aria-current={c.id === category.id ? "true" : undefined}
          >
            {c.name}
          </Link>
        ))}
      </nav>

      {/* ----------------------------------------------------------- hero */}
      <section className="card mt-6 grid gap-6 p-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)]">
        {control.validTrials === 0 ? (
          // No measurement at all is not the same claim as "no effect", and must
          // never be rendered as one.
          <HeroFigure
            value="No data"
            label="This category has no valid trials"
            sub={
              control.trials === 0 ? (
                // Distinct from "everything failed": this category was simply
                // not part of the selected run (e.g. --categories was used).
                <>
                  This run recorded no trials for {category.name} at all — it was not part of the
                  run. Execute the grid without <Code>--categories</Code>, or pick a run that
                  covered it.
                </>
              ) : (
                <>
                  All {control.trials} control trials failed
                  {invalidCauses.length > 0 && (
                    <> ({invalidCauses.map((c) => CAUSE_LABEL[c.cause] ?? c.cause).join(", ")})</>
                  )}
                  , so nothing here has been measured. Nothing below is a finding — fix the cause
                  and re-run.
                </>
              )
            }
          />
        ) : top ? (
          <HeroFigure
            value={fmtSignedPct(top.lift)}
            label="Best measurable edit"
            sub={
              <>
                <span className="font-medium">{VARIANT_LABELS[top.variant]}</span> — 95% CI{" "}
                <span className="tnum">
                  {fmtSignedPct(top.liftCi!.lo)} to {fmtSignedPct(top.liftCi!.hi)}
                </span>
                , clear of zero.
              </>
            }
          />
        ) : (
          <HeroFigure
            value="None"
            label="Edits clearing the noise band"
            sub={
              <>
                Every lift interval in this category contains zero. At {control.validTrials} valid
                trials per cell that is the honest answer, not a failure — the bench cannot
                separate these edits from control.
              </>
            }
          />
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile
            label="Control win rate"
            value={fmtPct(control.winRate)}
            hint={`${control.wins}/${control.validTrials} trials`}
          />
          <StatTile
            label="Control mean rank"
            value={control.meanRank === null ? "—" : control.meanRank.toFixed(2)}
            hint="1 = best of 4"
          />
          <StatTile
            label="Invalid trials"
            value={String(invalid)}
            tone={invalid === 0 ? "neutral" : invalid > agg._count._all * 0.05 ? "critical" : "warning"}
            hint={
              invalidCauses.length ? (
                <>{invalidCauses.map((c) => `${c.count} ${CAUSE_LABEL[c.cause] ?? c.cause}`).join(", ")}</>
              ) : (
                "run-wide, excluded from denominators"
              )
            }
          />
        </div>
      </section>

      {/* ---------------------------------------------------------- lift */}
      <section className="card mt-6 p-6">
        <SectionHeading
          title="Lift against control"
          note={
            <>
              The measurement this bench exists for. A bar is a finding only if its interval
              clears the zero rule — grey bars span zero and are unmeasured, not neutral.
              Intervals are Newcombe score intervals for the difference of two proportions.
            </>
          }
        />
        <div className="mt-4">
          <LiftChart data={lifts} />
        </div>
        <div className="muted mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: "var(--diverge-pos)" }}
            />
            above control
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: "var(--diverge-neg)" }}
            />
            below control
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: "var(--mark-null)" }}
            />
            interval spans zero
          </span>
        </div>
      </section>

      {/* ------------------------------------------------------ win rate */}
      <section className="card mt-6 p-6">
        <SectionHeading
          title="Subject win rate by variant"
          note={
            <>
              Error bars are 95% Wilson intervals. A bar whose interval overlaps the dashed
              control line is not distinguishable from control. Click a bar to read the agent&rsquo;s
              own reasoning for that cell.
            </>
          }
        />
        <div className="mt-4">
          <Suspense fallback={<div style={{ height: 320 }} />}>
            <WinRateChart
              data={chartData}
              controlRate={control.winRate}
              selected={hasSelection ? selectedVariant : undefined}
            />
          </Suspense>
        </div>
      </section>

      {/* --------------------------------------------------------- table */}
      <section className="card mt-6">
        <div className="p-6 pb-0">
          <SectionHeading
            title="All values"
            note="The table view twin — every number in the charts above is reachable here, and nothing is gated behind a tooltip."
          />
        </div>
        <div className="scroll-x mt-4">
          <table className="grid-table min-w-[860px]">
            <caption className="sr-only">
              Win rate, lift, confidence intervals and mean rank for each variant in {category.name}
            </caption>
            <thead>
              <tr>
                <th scope="col">Variant</th>
                <th scope="col" className="num">
                  Win rate
                </th>
                <th scope="col" className="num">
                  95% CI
                </th>
                <th scope="col" className="num">
                  Lift
                </th>
                <th scope="col" className="num">
                  Lift 95% CI
                </th>
                <th scope="col" className="num">
                  Mean rank
                </th>
                <th scope="col">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.variant} data-highlight={hasSelection && s.variant === selectedVariant}>
                  <td>
                    <Link href={qs({ variant: s.variant })} className="link font-medium">
                      {VARIANT_LABELS[s.variant]}
                    </Link>
                    <div className="muted tnum mt-0.5 text-xs">{s.variant}</div>
                  </td>
                  <td className="num">
                    {fmtPct(s.winRate)}
                    <span className="muted"> ({s.wins}/{s.validTrials})</span>
                  </td>
                  <td className="num muted">
                    {s.ci ? `${fmtPct(s.ci.lo)}–${fmtPct(s.ci.hi)}` : "—"}
                  </td>
                  <td className="num">{fmtSignedPct(s.lift)}</td>
                  <td className="num muted">
                    {s.liftCi
                      ? `${fmtSignedPct(s.liftCi.lo)} to ${fmtSignedPct(s.liftCi.hi)}`
                      : "—"}
                  </td>
                  <td className="num">
                    {s.meanRank === null ? "—" : s.meanRank.toFixed(2)}
                    {s.meanRankStderr != null && !Number.isNaN(s.meanRankStderr) && (
                      <span className="muted"> ±{s.meanRankStderr.toFixed(2)}</span>
                    )}
                  </td>
                  <td>
                    <VerdictBadge verdict={s.verdict} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ------------------------------------------------------ priority */}
      <section className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <div className="card p-6">
          <SectionHeading title="Edit priority" note="Lift interval clears zero upward, largest first." />
          {helped.length ? (
            <ol className="mt-4 space-y-3">
              {helped.map((s, i) => (
                <li key={s.variant} className="flex gap-3">
                  <span className="tnum muted pt-0.5 text-sm">{i + 1}.</span>
                  <div className="min-w-0">
                    <Link href={qs({ variant: s.variant })} className="link text-sm font-medium">
                      {VARIANT_LABELS[s.variant]}
                    </Link>
                    <div className="tnum secondary mt-0.5 text-xs">
                      {fmtSignedPct(s.lift)} ({fmtSignedPct(s.liftCi!.lo)} to{" "}
                      {fmtSignedPct(s.liftCi!.hi)})
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="secondary mt-4 text-sm">No edit measurably raised the win rate here.</p>
          )}
        </div>

        <div className="card p-6">
          <SectionHeading
            title="Measurably worse"
            note="Kept apart from the priority list on purpose — these clear zero downward."
          />
          {hurt.length ? (
            <ul className="mt-4 space-y-3">
              {hurt.map((s) => (
                <li key={s.variant}>
                  <Link href={qs({ variant: s.variant })} className="link text-sm font-medium">
                    {VARIANT_LABELS[s.variant]}
                  </Link>
                  <div className="tnum text-xs" style={{ color: "var(--critical)" }}>
                    {fmtSignedPct(s.lift)} ({fmtSignedPct(s.liftCi!.lo)} to{" "}
                    {fmtSignedPct(s.liftCi!.hi)})
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="secondary mt-4 text-sm">No edit measurably lowered the win rate here.</p>
          )}
        </div>

        <div className="card p-6">
          <SectionHeading
            title="No measurable effect"
            note="Interval spans zero. Treat these as unmeasured, not as proven neutral."
          />
          <ul className="mt-4 space-y-3">
            {noEffect.map((s) => (
              <li key={s.variant}>
                <Link href={qs({ variant: s.variant })} className="link text-sm">
                  {VARIANT_LABELS[s.variant]}
                </Link>
                <div className="tnum muted text-xs">
                  {fmtSignedPct(s.lift)}{" "}
                  {s.liftCi && `(${fmtSignedPct(s.liftCi.lo)} to ${fmtSignedPct(s.liftCi.hi)})`}
                </div>
              </li>
            ))}
            {!noEffect.length && <li className="secondary text-sm">None.</li>}
          </ul>

          {/* Kept visually inside the same card but under its own heading:
              "measured, found nothing" and "never measured" are different
              claims and must not share a list. */}
          {insufficient.length > 0 && (
            <>
              <hr className="rule my-4" />
              <h3 className="text-sm font-medium">Not measured</h3>
              <p className="muted mt-1 text-xs leading-relaxed">
                Too few valid trials to compute a lift at all. These are not results.
              </p>
              <ul className="mt-3 space-y-2">
                {insufficient.map((s) => (
                  <li key={s.variant} className="flex items-baseline justify-between gap-2">
                    <Link href={qs({ variant: s.variant })} className="link text-sm">
                      {VARIANT_LABELS[s.variant]}
                    </Link>
                    <span className="tnum muted text-xs">
                      {s.validTrials}/{s.trials} valid
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------ position */}
      <section className="card mt-6 p-6">
        <SectionHeading
          title="Randomisation audit — win rate by presented slot"
          note={
            <>
              Not a result about listings: a check on the design. The subject is placed in each
              of the 4 slots equally often within each intent, so these four intervals should
              overlap. A slot that separates means position is leaking into the measurement.
            </>
          }
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

      {/* ----------------------------------------------------- drilldown */}
      {hasSelection && (
        <section className="card mt-6 p-6" id="drilldown">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium">{VARIANT_LABELS[selectedVariant]}</h2>
              <p className="muted tnum mt-0.5 text-xs">{selectedVariant}</p>
            </div>
            <Link href={qs({ variant: "" })} className="pill text-xs">
              Close
            </Link>
          </div>

          {drillListing && (
            <div className="inset mt-4 p-4">
              {drillListing.stale && (
                <div className="mb-3">
                  <Notice tone="critical">
                    This listing has been re-seeded since the run. What you see below is the
                    current text, not what the agent read.
                  </Notice>
                </div>
              )}
              <div className="text-sm font-medium">{drillListing.title}</div>
              <div className="secondary tnum mt-1 text-xs">
                £{Number(drillListing.price).toFixed(2)} · {drillListing.rating.toFixed(1)}★ ·{" "}
                {drillListing.reviewCount.toLocaleString("en-GB")} reviews
                {drillListing.changedFields.length > 0 && (
                  <> · changed: {drillListing.changedFields.join(", ")}</>
                )}
              </div>
            </div>
          )}

          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            {(["won", "lost"] as const).map((side) => {
              const rows = drillTrials.filter((t) =>
                side === "won" ? t.subjectWon === true : t.subjectWon === false,
              );
              return (
                <div key={side}>
                  <h3 className="text-xs font-medium uppercase tracking-wide">
                    {side === "won" ? "Trials the subject won" : "Trials the subject lost"}{" "}
                    <span className="muted">({rows.length})</span>
                  </h3>
                  <ul className="mt-3 space-y-4">
                    {rows.map((t) => (
                      <li
                        key={t.id}
                        className="border-l-2 pl-3"
                        style={{
                          borderColor:
                            side === "won" ? "var(--series-1)" : "var(--gridline)",
                        }}
                      >
                        <div className="muted tnum text-xs">
                          trial {t.trialIndex} · slot {t.subjectPosition + 1} of 4 · chose{" "}
                          {t.chosenSku ?? "—"} · {t.latencyMs}ms
                          {t.parseRetried && " · retried"}
                        </div>
                        <p className="mt-1 text-sm leading-relaxed">
                          {t.reason ?? (
                            <span className="muted italic">
                              The model returned a choice but no reason.
                            </span>
                          )}
                        </p>
                        <p className="muted mt-1.5 text-xs italic">
                          intent:{" "}
                          {t.intent.text.length > 110
                            ? `${t.intent.text.slice(0, 110)}…`
                            : t.intent.text}
                        </p>
                      </li>
                    ))}
                    {!rows.length && <li className="muted text-sm">None.</li>}
                  </ul>
                </div>
              );
            })}
          </div>

          {drillTrials.some((t) => !t.valid) && (
            <p className="muted mt-6 text-xs">
              {drillTrials.filter((t) => !t.valid).length} invalid trial(s) excluded:{" "}
              {[
                ...new Set(
                  drillTrials
                    .filter((t) => !t.valid)
                    .map((t) => CAUSE_LABEL[t.invalidCause ?? ""] ?? t.invalidCause),
                ),
              ].join(", ")}
              .
            </p>
          )}
        </section>
      )}
    </Page>
  );
}

import type { Route } from "next";
import Link from "next/link";
import { VARIANT_LABELS, type Variant } from "../lib/types.ts";
import { editPriority, fmtPct, fmtSignedPct } from "../lib/analysis.ts";
import {
  getCategoryAnalysis,
  getRunSummary,
  getSubjectVariant,
  getVariantTrials,
  listCategories,
  listRuns,
  resolveRunId,
} from "../lib/queries.ts";
import WinRateChart, { type ChartPoint } from "./components/WinRateChart.tsx";

export const dynamic = "force-dynamic";

const SHORT: Record<Variant, string> = {
  v0_control: "control",
  v1_title: "title",
  v2_claim_specificity: "claims",
  v3_price_position: "price",
  v4_review_text: "reviews",
  v5_spec_complete: "specs",
};

const VERDICT_COPY: Record<string, string> = {
  control: "—",
  higher: "Above control",
  lower: "Below control",
  no_effect: "No measurable effect",
  insufficient: "Insufficient data",
};

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto max-w-3xl p-10">
      <h1 className="text-2xl font-semibold">ShelfProof</h1>
      <div className="card mt-6 p-6">
        <p className="font-medium">{title}</p>
        <p className="secondary mt-2 text-sm">{body}</p>
      </div>
    </main>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; variant?: string; run?: string }>;
}) {
  const sp = await searchParams;

  const [categories, runs] = await Promise.all([listCategories(), listRuns()]);
  if (!categories.length) {
    return <Empty title="No seed data yet." body="Run `npm run db:push` then `npm run db:seed`." />;
  }

  const runId = await resolveRunId(sp.run);
  if (!runId) {
    return (
      <Empty
        title="No trials recorded yet."
        body="Run `npm run trials` to execute the 240-trial grid, then reload this page."
      />
    );
  }

  const category = categories.find((c) => c.id === sp.category) ?? categories[0];
  const [stats, { run, agg, invalid }] = await Promise.all([
    getCategoryAnalysis(runId, category.id),
    getRunSummary(runId),
  ]);

  const control = stats.find((s) => s.variant === "v0_control")!;
  const { measurable, noEffect } = editPriority(stats);

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

  const selectedVariant = (sp.variant ?? "") as Variant;
  const hasSelection = selectedVariant in VARIANT_LABELS;
  const [drillTrials, drillListing] = hasSelection
    ? await Promise.all([
        getVariantTrials(runId, category.id, selectedVariant),
        getSubjectVariant(category.id, selectedVariant),
      ])
    : [[], null];

  const qs = (over: Record<string, string>) =>
    ("/?" +
      new URLSearchParams({
        category: category.id,
        ...(sp.run ? { run: sp.run } : {}),
        ...over,
      })) as Route;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">ShelfProof</h1>
          <p className="secondary mt-1 text-sm">
            Which listing edits make an AI shopping assistant recommend{" "}
            <span className="font-medium">{category.subjectSku}</span>?
          </p>
        </div>
        <div className="muted text-xs">
          <Link href="/methodology" className="underline underline-offset-2">
            Methodology
          </Link>
          {run && (
            <span className="tnum ml-3">
              {run.model} · temp {run.temperature} · {agg._count._all} trials
              {invalid > 0 && ` · ${invalid} invalid`}
              {runs.length > 1 && ` · ${runs.length} runs`}
            </span>
          )}
        </div>
      </header>

      {/* One filter row above everything it scopes. */}
      <nav className="mt-6 flex flex-wrap gap-2">
        {categories.map((c) => (
          <Link
            key={c.id}
            href={
              (`/?${new URLSearchParams({
                category: c.id,
                ...(sp.run ? { run: sp.run } : {}),
              })}`) as Route
            }
            className="card px-3 py-1.5 text-sm"
            style={
              c.id === category.id
                ? { borderColor: "var(--series-1)", color: "var(--series-1)" }
                : undefined
            }
          >
            {c.name}
          </Link>
        ))}
      </nav>

      <section className="card mt-6 p-6">
        <h2 className="text-sm font-medium">
          Subject win rate by variant
          <span className="muted font-normal"> — bars are 95% Wilson intervals</span>
        </h2>
        <p className="muted mt-1 text-xs">
          A bar whose error bar overlaps the dashed control line is not distinguishable from
          control. Click a bar to read the agent&rsquo;s reasoning.
        </p>
        <div className="mt-4">
          <WinRateChart data={chartData} controlRate={control.winRate} />
        </div>
      </section>

      {/* Table view twin — every value in the chart is reachable here. */}
      <section className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="secondary border-b text-left" style={{ borderColor: "var(--hairline)" }}>
              <th className="px-4 py-3 font-medium">Variant</th>
              <th className="px-4 py-3 text-right font-medium">Win rate</th>
              <th className="px-4 py-3 text-right font-medium">95% CI</th>
              <th className="px-4 py-3 text-right font-medium">Lift</th>
              <th className="px-4 py-3 text-right font-medium">Lift 95% CI</th>
              <th className="px-4 py-3 text-right font-medium">Mean rank</th>
              <th className="px-4 py-3 font-medium">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr
                key={s.variant}
                className="border-b last:border-0"
                style={{ borderColor: "var(--hairline)" }}
              >
                <td className="px-4 py-3">
                  <Link href={qs({ variant: s.variant })} className="underline underline-offset-2">
                    {s.variant}
                  </Link>
                  <div className="muted text-xs">{VARIANT_LABELS[s.variant]}</div>
                </td>
                <td className="tnum px-4 py-3 text-right">
                  {fmtPct(s.winRate)}
                  <span className="muted"> ({s.wins}/{s.validTrials})</span>
                </td>
                <td className="tnum muted px-4 py-3 text-right">
                  {s.ci ? `${fmtPct(s.ci.lo)}–${fmtPct(s.ci.hi)}` : "—"}
                </td>
                <td className="tnum px-4 py-3 text-right">{fmtSignedPct(s.lift)}</td>
                <td className="tnum muted px-4 py-3 text-right">
                  {s.liftCi ? `${fmtSignedPct(s.liftCi.lo)} to ${fmtSignedPct(s.liftCi.hi)}` : "—"}
                </td>
                <td className="tnum px-4 py-3 text-right">
                  {s.meanRank === null ? "—" : s.meanRank.toFixed(2)}
                  {s.meanRankStderr != null && !Number.isNaN(s.meanRankStderr) && (
                    <span className="muted"> ±{s.meanRankStderr.toFixed(2)}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    style={{
                      color:
                        s.verdict === "higher"
                          ? "var(--good)"
                          : s.verdict === "lower"
                            ? "var(--critical)"
                            : "var(--text-secondary)",
                    }}
                  >
                    {s.verdict === "higher" ? "▲ " : s.verdict === "lower" ? "▼ " : ""}
                    {VERDICT_COPY[s.verdict]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-sm font-medium">Listing edit priority</h2>
          <p className="muted mt-1 text-xs">
            Edits whose lift interval clears zero, largest first.
          </p>
          {measurable.length ? (
            <ol className="mt-4 space-y-3">
              {measurable.map((s, i) => (
                <li key={s.variant} className="flex gap-3">
                  <span className="tnum muted">{i + 1}.</span>
                  <div>
                    <Link href={qs({ variant: s.variant })} className="font-medium underline underline-offset-2">
                      {VARIANT_LABELS[s.variant]}
                    </Link>
                    <div className="tnum secondary text-xs">
                      {fmtSignedPct(s.lift)} ({fmtSignedPct(s.liftCi!.lo)} to{" "}
                      {fmtSignedPct(s.liftCi!.hi)})
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="secondary mt-4 text-sm">
              No edit produced a measurable effect in this category.
            </p>
          )}
        </div>

        <div className="card p-6">
          <h2 className="text-sm font-medium">No measurable effect</h2>
          <p className="muted mt-1 text-xs">
            Lift interval spans zero. At 8 trials per cell these are indistinguishable from
            control — treat them as unmeasured, not as proven neutral.
          </p>
          <ul className="mt-4 space-y-3">
            {noEffect.map((s) => (
              <li key={s.variant}>
                <Link href={qs({ variant: s.variant })} className="underline underline-offset-2">
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
        </div>
      </section>

      {hasSelection && (
        <section className="card mt-6 p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-medium">
              {selectedVariant} — {VARIANT_LABELS[selectedVariant]}
            </h2>
            <Link href={qs({})} className="muted text-xs underline underline-offset-2">
              close
            </Link>
          </div>

          {drillListing && (
            <div className="secondary mt-3 text-xs">
              Subject as shown: <span className="font-medium">{drillListing.title}</span> ·{" "}
              £{Number(drillListing.price).toFixed(2)}
              {drillListing.changedFields.length > 0 &&
                ` · changed: ${drillListing.changedFields.join(", ")}`}
            </div>
          )}

          <div className="mt-5 grid gap-6 md:grid-cols-2">
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
                      <li key={t.id} className="border-l-2 pl-3" style={{ borderColor: "var(--gridline)" }}>
                        <div className="tnum muted text-xs">
                          trial {t.trialIndex} · subject in position {t.subjectPosition + 1} of 4 ·
                          chose {t.chosenSku} · {t.latencyMs}ms
                        </div>
                        <p className="mt-1 text-sm">{t.reason}</p>
                        <p className="muted mt-1 text-xs italic">
                          intent: {t.intent.text.slice(0, 110)}…
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
            <p className="muted mt-5 text-xs">
              {drillTrials.filter((t) => !t.valid).length} invalid trial(s) excluded:{" "}
              {[...new Set(drillTrials.filter((t) => !t.valid).map((t) => t.invalidCause))].join(", ")}
            </p>
          )}
        </section>
      )}
    </main>
  );
}

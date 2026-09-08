/**
 * Chart-shaping for the lift chart.
 *
 * Deliberately NOT in LiftChart.tsx: that module carries "use client", and a
 * plain function exported from a client module cannot be called from a server
 * component — it throws at request time. The pages that build this data are
 * server components, so the transform lives here and the client component
 * imports only the type.
 */

export type LiftPoint = {
  variant: string;
  label: string;
  lift: number;
  /** [distance below the value, distance above] — Recharts wants offsets, and
   *  wants them as a plain array field rather than a computed dataKey. */
  err: [number, number];
  lo: number;
  hi: number;
  verdict: string;
  wins: number;
  validTrials: number;
};

export function liftPoints(
  stats: {
    variant: string;
    lift: number | null;
    liftCi: { lo: number; hi: number } | null;
    verdict: string;
    wins: number;
    validTrials: number;
  }[],
  label: (v: string) => string,
): LiftPoint[] {
  return stats
    .filter((s) => s.variant !== "v0_control" && s.lift !== null && s.liftCi !== null)
    .map((s) => ({
      variant: s.variant,
      label: label(s.variant),
      lift: s.lift!,
      lo: s.liftCi!.lo,
      hi: s.liftCi!.hi,
      err: [s.lift! - s.liftCi!.lo, s.liftCi!.hi - s.lift!],
      verdict: s.verdict,
      wins: s.wins,
      validTrials: s.validTrials,
    }));
}

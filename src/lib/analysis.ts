import { VARIANTS, type Variant } from "./types.ts";

/** z for a two-sided 95% interval. */
export const Z_95 = 1.959963984540054;

export type Interval = { lo: number; hi: number };

/**
 * Wilson score interval for a binomial proportion.
 *
 * Chosen over the normal approximation because win rates here sit on 8-trial
 * cells and frequently hit 0 or 1, where the normal interval degenerates to
 * zero width and would claim certainty we do not have.
 */
export function wilsonInterval(successes: number, n: number, z = Z_95): Interval {
  if (n <= 0) return { lo: 0, hi: 1 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/**
 * Newcombe's score interval for the difference of two independent proportions,
 * built from the two Wilson intervals.
 *
 * The brief asks for a Wilson interval on each win rate and for lifts whose
 * interval crosses zero to be flagged. Those two requirements only join up if
 * the lift itself has an interval — and the standard way to get one from Wilson
 * bounds is Newcombe (1998), which is what this is. Differencing the raw Wilson
 * bounds instead would give a much too wide interval and under-report findings.
 */
export function liftInterval(
  variant: { successes: number; n: number },
  control: { successes: number; n: number },
  z = Z_95,
): { lift: number; lo: number; hi: number } {
  const p1 = variant.n ? variant.successes / variant.n : 0;
  const p2 = control.n ? control.successes / control.n : 0;
  const w1 = wilsonInterval(variant.successes, variant.n, z);
  const w2 = wilsonInterval(control.successes, control.n, z);

  const lo = p1 - p2 - Math.sqrt((p1 - w1.lo) ** 2 + (w2.hi - p2) ** 2);
  const hi = p1 - p2 + Math.sqrt((w1.hi - p1) ** 2 + (p2 - w2.lo) ** 2);

  return { lift: p1 - p2, lo, hi };
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

/** Sample standard error of the mean (n-1 denominator). */
export function stderr(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  const variance = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance / xs.length);
}

export type Verdict = "control" | "higher" | "lower" | "no_effect" | "insufficient";

export type TrialRow = {
  variant: string;
  valid: boolean;
  subjectWon: boolean | null;
  subjectRank: number | null;
};

export type VariantStats = {
  variant: Variant;
  trials: number;
  validTrials: number;
  invalidTrials: number;
  wins: number;
  winRate: number | null;
  ci: Interval | null;
  lift: number | null;
  liftCi: Interval | null;
  meanRank: number | null;
  meanRankStderr: number | null;
  verdict: Verdict;
};

export function analyseVariants(rows: TrialRow[]): VariantStats[] {
  const byVariant = new Map<string, TrialRow[]>();
  for (const r of rows) {
    const list = byVariant.get(r.variant) ?? [];
    list.push(r);
    byVariant.set(r.variant, list);
  }

  const controlRows = byVariant.get("v0_control") ?? [];
  const controlValid = controlRows.filter((r) => r.valid);
  const control = {
    successes: controlValid.filter((r) => r.subjectWon).length,
    n: controlValid.length,
  };

  return VARIANTS.map((variant) => {
    const all = byVariant.get(variant) ?? [];
    const valid = all.filter((r) => r.valid);
    const wins = valid.filter((r) => r.subjectWon).length;
    const ranks = valid
      .map((r) => r.subjectRank)
      .filter((r): r is number => typeof r === "number" && r > 0);

    if (valid.length === 0) {
      return {
        variant,
        trials: all.length,
        validTrials: 0,
        invalidTrials: all.length,
        wins: 0,
        winRate: null,
        ci: null,
        lift: null,
        liftCi: null,
        meanRank: null,
        meanRankStderr: null,
        verdict: "insufficient" as Verdict,
      };
    }

    const winRate = wins / valid.length;
    const ci = wilsonInterval(wins, valid.length);

    let lift: number | null = null;
    let liftCi: Interval | null = null;
    let verdict: Verdict;

    if (variant === "v0_control") {
      verdict = "control";
    } else if (control.n === 0) {
      verdict = "insufficient";
    } else {
      const d = liftInterval({ successes: wins, n: valid.length }, control);
      lift = d.lift;
      liftCi = { lo: d.lo, hi: d.hi };
      // The whole point of the CI: an interval spanning zero is not a finding.
      verdict = d.lo > 0 ? "higher" : d.hi < 0 ? "lower" : "no_effect";
    }

    return {
      variant,
      trials: all.length,
      validTrials: valid.length,
      invalidTrials: all.length - valid.length,
      wins,
      winRate,
      ci,
      lift,
      liftCi,
      meanRank: ranks.length ? mean(ranks) : null,
      meanRankStderr: ranks.length > 1 ? stderr(ranks) : null,
      verdict,
    };
  });
}

/** Edit priority: measurable effects by lift descending, then the noise band. */
export function editPriority(stats: VariantStats[]): {
  measurable: VariantStats[];
  noEffect: VariantStats[];
} {
  const candidates = stats.filter((s) => s.variant !== "v0_control");
  return {
    measurable: candidates
      .filter((s) => s.verdict === "higher" || s.verdict === "lower")
      .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0)),
    noEffect: candidates
      .filter((s) => s.verdict === "no_effect" || s.verdict === "insufficient")
      .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0)),
  };
}

export function fmtPct(x: number | null, dp = 0): string {
  return x === null || Number.isNaN(x) ? "—" : `${(x * 100).toFixed(dp)}%`;
}

export function fmtSignedPct(x: number | null, dp = 0): string {
  if (x === null || Number.isNaN(x)) return "—";
  const s = (x * 100).toFixed(dp);
  return x > 0 ? `+${s}%` : `${s}%`;
}

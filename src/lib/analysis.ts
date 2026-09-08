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
  /** 0-based slot the subject occupied; only needed by analysePositions. */
  subjectPosition?: number | null;
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

/**
 * Edit priority, in three groups.
 *
 * `helped` and `hurt` are kept apart deliberately. Both clear zero, so both are
 * findings — but a numbered "do these edits" list that ends with the edit which
 * measurably *reduces* the win rate is a list that will be misread. The sort
 * inside each group is by effect size in the direction that matters.
 */
export function editPriority(stats: VariantStats[]): {
  helped: VariantStats[];
  hurt: VariantStats[];
  noEffect: VariantStats[];
  insufficient: VariantStats[];
} {
  const candidates = stats.filter((s) => s.variant !== "v0_control");
  return {
    helped: candidates
      .filter((s) => s.verdict === "higher")
      .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0)),
    hurt: candidates
      .filter((s) => s.verdict === "lower")
      .sort((a, b) => (a.lift ?? 0) - (b.lift ?? 0)),
    // "We measured it and found nothing" and "we have no measurement" are
    // different claims. Collapsing them lets a failed run present itself as a
    // null result, which is the exact misreading this bench exists to prevent.
    noEffect: candidates
      .filter((s) => s.verdict === "no_effect")
      .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0)),
    insufficient: candidates.filter((s) => s.verdict === "insufficient"),
  };
}

export type PositionStats = {
  position: number; // 1-based, as presented to a reader
  trials: number;
  wins: number;
  winRate: number | null;
  ci: Interval | null;
};

/**
 * Win rate by the slot the subject occupied.
 *
 * This is the audit of the randomisation itself, not a result about listings.
 * The design claims position bias is removed by construction; the only way to
 * check that claim is to look. Overlapping intervals across all four slots is
 * the outcome the design predicts.
 */
export function analysePositions(rows: TrialRow[], slots = 4): PositionStats[] {
  return Array.from({ length: slots }, (_, i) => {
    const at = rows.filter((r) => r.valid && r.subjectPosition === i);
    const wins = at.filter((r) => r.subjectWon).length;
    return {
      position: i + 1,
      trials: at.length,
      wins,
      winRate: at.length ? wins / at.length : null,
      ci: at.length ? wilsonInterval(wins, at.length) : null,
    };
  });
}

/**
 * Pool one variant's trials across every category.
 *
 * Each category has its own subject and its own control win rate, so a pooled
 * win rate is not "the" win rate of anything — it is the rate at which the
 * subject-of-its-category gets picked, averaged over five different contests.
 * What pooling buys is n: a 5x8 = 40-trial cell has an interval roughly half
 * the width of an 8-trial one, which is the difference between detecting a
 * 15-point effect and not. Read the lift, not the level.
 */
export function poolAcrossCategories(perCategory: VariantStats[][]): VariantStats[] {
  const merged: TrialRow[] = [];
  for (const stats of perCategory) {
    for (const s of stats) {
      for (let i = 0; i < s.wins; i++) {
        merged.push({ variant: s.variant, valid: true, subjectWon: true, subjectRank: 1 });
      }
      for (let i = 0; i < s.validTrials - s.wins; i++) {
        merged.push({ variant: s.variant, valid: true, subjectWon: false, subjectRank: null });
      }
      for (let i = 0; i < s.invalidTrials; i++) {
        merged.push({ variant: s.variant, valid: false, subjectWon: null, subjectRank: null });
      }
    }
  }
  const pooled = analyseVariants(merged);
  // Mean rank cannot be reconstructed from counts, so recompute it as the
  // trial-weighted mean of the per-category means rather than inventing one.
  return pooled.map((p) => {
    const parts = perCategory
      .flatMap((stats) => stats.filter((s) => s.variant === p.variant))
      .filter((s) => s.meanRank !== null && s.validTrials > 0);
    const n = parts.reduce((a, s) => a + s.validTrials, 0);
    return {
      ...p,
      meanRank: n ? parts.reduce((a, s) => a + s.meanRank! * s.validTrials, 0) / n : null,
      meanRankStderr: null,
    };
  });
}

export function fmtPct(x: number | null, dp = 0): string {
  return x === null || Number.isNaN(x) ? "—" : `${(x * 100).toFixed(dp)}%`;
}

export function fmtSignedPct(x: number | null, dp = 0): string {
  if (x === null || Number.isNaN(x)) return "—";
  const s = (x * 100).toFixed(dp);
  return x > 0 ? `+${s}%` : `${s}%`;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  wilsonInterval,
  liftInterval,
  analyseVariants,
  analysePositions,
  poolAcrossCategories,
  editPriority,
  mean,
  stderr,
  type TrialRow,
} from "./analysis.ts";

const close = (actual: number, expected: number, eps = 1e-4) =>
  assert.ok(
    Math.abs(actual - expected) < eps,
    `expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected)})`,
  );

// ---------------------------------------------------------------- Wilson
// Reference values are the published Wilson score intervals at 95%.

test("wilson: 5/10 is symmetric about 0.5", () => {
  const { lo, hi } = wilsonInterval(5, 10);
  close(lo, 0.2366);
  close(hi, 0.7634);
  close(lo + hi, 1.0);
});

test("wilson: 1/10", () => {
  const { lo, hi } = wilsonInterval(1, 10);
  close(lo, 0.0179);
  close(hi, 0.4042);
});

test("wilson: 8/8 does not claim certainty at the top", () => {
  const { lo, hi } = wilsonInterval(8, 8);
  close(lo, 0.6756);
  assert.equal(hi, 1);
  // The normal approximation would give [1, 1] here — the reason we use Wilson.
  assert.ok(lo < 1);
});

test("wilson: 0/8 mirrors 8/8", () => {
  const zero = wilsonInterval(0, 8);
  const all = wilsonInterval(8, 8);
  assert.equal(zero.lo, 0);
  close(zero.hi, 1 - all.lo);
});

test("wilson: interval always contains the point estimate", () => {
  for (let n = 1; n <= 40; n++) {
    for (let k = 0; k <= n; k++) {
      const { lo, hi } = wilsonInterval(k, n);
      const p = k / n;
      assert.ok(lo <= p + 1e-12 && p <= hi + 1e-12, `${k}/${n}: ${lo}..${hi} excludes ${p}`);
      assert.ok(lo >= 0 && hi <= 1, `${k}/${n} out of [0,1]`);
    }
  }
});

test("wilson: interval narrows as n grows at fixed proportion", () => {
  const small = wilsonInterval(4, 8);
  const large = wilsonInterval(40, 80);
  assert.ok(large.hi - large.lo < small.hi - small.lo);
});

test("wilson: n=0 is fully uninformative rather than NaN", () => {
  assert.deepEqual(wilsonInterval(0, 0), { lo: 0, hi: 1 });
});

// ---------------------------------------------------------------- lift

test("lift: point estimate is the difference of win rates", () => {
  const d = liftInterval({ successes: 6, n: 8 }, { successes: 2, n: 8 });
  close(d.lift, 0.5);
});

test("lift: Newcombe bounds for 8/8 vs 4/8", () => {
  const d = liftInterval({ successes: 8, n: 8 }, { successes: 4, n: 8 });
  close(d.lift, 0.5);
  close(d.lo, 0.0684);
  close(d.hi, 0.7848);
  assert.ok(d.lo > 0, "an 8/8 vs 4/8 difference should clear zero");
});

test("lift: identical cells give an interval spanning zero", () => {
  const d = liftInterval({ successes: 4, n: 8 }, { successes: 4, n: 8 });
  close(d.lift, 0);
  assert.ok(d.lo < 0 && d.hi > 0);
});

test("lift: a 1-trial difference at n=8 does NOT clear zero", () => {
  // This is the case the brief cares about — 5/8 vs 4/8 looks like a 12.5pt
  // lift and is nothing. If this ever passes as a finding, the UI is lying.
  const d = liftInterval({ successes: 5, n: 8 }, { successes: 4, n: 8 });
  close(d.lift, 0.125);
  assert.ok(d.lo < 0, "5/8 vs 4/8 must not be reported as a real effect");
});

test("lift: interval brackets the point estimate and is antisymmetric", () => {
  const a = { successes: 7, n: 8 };
  const b = { successes: 3, n: 8 };
  const fwd = liftInterval(a, b);
  const rev = liftInterval(b, a);
  assert.ok(fwd.lo <= fwd.lift && fwd.lift <= fwd.hi);
  close(rev.lift, -fwd.lift);
  close(rev.lo, -fwd.hi);
  close(rev.hi, -fwd.lo);
});

test("lift: sign is reported correctly for a negative effect", () => {
  const d = liftInterval({ successes: 0, n: 8 }, { successes: 8, n: 8 });
  close(d.lift, -1);
  assert.ok(d.hi < 0);
});

// ---------------------------------------------------------------- moments

test("mean and stderr", () => {
  close(mean([1, 2, 3, 4]), 2.5);
  // sd of [1,2,3,4] with n-1 is sqrt(5/3) = 1.29099; se = sd/2 = 0.645497
  close(stderr([1, 2, 3, 4]), 0.6455);
  assert.ok(Number.isNaN(stderr([1])));
});

// ---------------------------------------------------------------- roll-up

function rows(variant: string, wins: number, n: number, rank = 2): TrialRow[] {
  return Array.from({ length: n }, (_, i) => ({
    variant,
    valid: true,
    subjectWon: i < wins,
    subjectRank: i < wins ? 1 : rank,
  }));
}

test("analyseVariants: control is labelled control and carries no lift", () => {
  const stats = analyseVariants(rows("v0_control", 4, 8));
  const c = stats.find((s) => s.variant === "v0_control")!;
  assert.equal(c.verdict, "control");
  assert.equal(c.lift, null);
  close(c.winRate!, 0.5);
});

test("analyseVariants: a real effect is flagged higher, noise is flagged no_effect", () => {
  const stats = analyseVariants([
    ...rows("v0_control", 1, 8),
    ...rows("v1_title", 8, 8),
    ...rows("v2_claim_specificity", 2, 8),
  ]);
  assert.equal(stats.find((s) => s.variant === "v1_title")!.verdict, "higher");
  assert.equal(stats.find((s) => s.variant === "v2_claim_specificity")!.verdict, "no_effect");
});

test("analyseVariants: invalid trials are excluded from n, not counted as losses", () => {
  const stats = analyseVariants([
    ...rows("v0_control", 2, 8),
    ...rows("v1_title", 4, 4),
    { variant: "v1_title", valid: false, subjectWon: null, subjectRank: null },
    { variant: "v1_title", valid: false, subjectWon: null, subjectRank: null },
  ]);
  const v = stats.find((s) => s.variant === "v1_title")!;
  assert.equal(v.trials, 6);
  assert.equal(v.validTrials, 4);
  assert.equal(v.invalidTrials, 2);
  close(v.winRate!, 1.0); // 4/4, not 4/6
});

test("analyseVariants: a variant with no valid trials is insufficient, not 0%", () => {
  const stats = analyseVariants([
    ...rows("v0_control", 4, 8),
    { variant: "v1_title", valid: false, subjectWon: null, subjectRank: null },
  ]);
  const v = stats.find((s) => s.variant === "v1_title")!;
  assert.equal(v.verdict, "insufficient");
  assert.equal(v.winRate, null);
});

test("analyseVariants: mean rank is computed over valid trials only", () => {
  const stats = analyseVariants([
    ...rows("v0_control", 2, 4, 3), // 2 wins at rank 1, 2 losses at rank 3
  ]);
  const c = stats.find((s) => s.variant === "v0_control")!;
  close(c.meanRank!, 2.0);
});

test("analyseVariants: always returns all six variants, even absent from data", () => {
  const stats = analyseVariants(rows("v0_control", 4, 8));
  assert.equal(stats.length, 6);
  assert.equal(stats.filter((s) => s.verdict === "insufficient").length, 5);
});

test("editPriority: separates measurable effects from the noise band", () => {
  const stats = analyseVariants([
    ...rows("v0_control", 1, 8),
    ...rows("v1_title", 8, 8), // clear effect
    ...rows("v2_claim_specificity", 2, 8), // noise
    ...rows("v3_price_position", 7, 8), // clear effect, smaller
  ]);
  const { helped, hurt, noEffect } = editPriority(stats);
  assert.deepEqual(
    helped.map((s) => s.variant),
    ["v1_title", "v3_price_position"],
  );
  assert.equal(hurt.length, 0);
  assert.ok(noEffect.some((s) => s.variant === "v2_claim_specificity"));
  assert.ok(!helped.some((s) => s.variant === "v0_control"));
});

test("editPriority: a variant that measurably hurts is not listed as a priority edit", () => {
  const stats = analyseVariants([
    ...rows("v0_control", 8, 8),
    ...rows("v1_title", 0, 8), // clearly worse than control
  ]);
  const { helped, hurt } = editPriority(stats);
  // The old shape put this at the bottom of a numbered "do these edits" list.
  assert.equal(helped.length, 0);
  assert.deepEqual(
    hurt.map((s) => s.variant),
    ["v1_title"],
  );
  assert.ok(hurt[0].lift! < 0);
});

test("editPriority: 'not measured' is kept apart from 'measured, no effect'", () => {
  // A run where every call failed must not present itself as a null result.
  const allInvalid = ["v0_control", "v1_title", "v2_claim_specificity"].flatMap((variant) =>
    Array.from({ length: 8 }, () => ({
      variant,
      valid: false,
      subjectWon: null,
      subjectRank: null,
    })),
  );
  const { helped, hurt, noEffect, insufficient } = editPriority(analyseVariants(allInvalid));
  assert.equal(helped.length, 0);
  assert.equal(hurt.length, 0);
  assert.equal(noEffect.length, 0, "nothing was measured, so nothing can be 'no effect'");
  assert.ok(insufficient.some((s) => s.variant === "v1_title"));
  assert.ok(insufficient.every((s) => s.verdict === "insufficient"));
});

test("analysePositions: reports win rate per slot over valid trials only", () => {
  const at = (pos: number, won: boolean, valid = true): TrialRow => ({
    variant: "v0_control",
    valid,
    subjectWon: valid ? won : null,
    subjectRank: valid ? 1 : null,
    subjectPosition: pos,
  });
  const stats = analysePositions([
    at(0, true),
    at(0, false),
    at(1, true),
    at(1, true),
    at(2, false),
    at(3, false),
    at(3, true, false), // invalid — excluded from both numerator and denominator
  ]);
  assert.equal(stats.length, 4);
  assert.deepEqual(
    stats.map((s) => s.trials),
    [2, 2, 1, 1],
  );
  close(stats[0].winRate!, 0.5);
  close(stats[1].winRate!, 1.0);
  assert.equal(stats[3].wins, 0);
});

test("poolAcrossCategories: sums cells and widens n without inventing wins", () => {
  const a = analyseVariants([...rows("v0_control", 2, 8), ...rows("v1_title", 5, 8)]);
  const b = analyseVariants([...rows("v0_control", 3, 8), ...rows("v1_title", 6, 8)]);
  const pooled = poolAcrossCategories([a, b]);

  const control = pooled.find((s) => s.variant === "v0_control")!;
  const title = pooled.find((s) => s.variant === "v1_title")!;
  assert.equal(control.validTrials, 16);
  assert.equal(control.wins, 5);
  assert.equal(title.validTrials, 16);
  assert.equal(title.wins, 11);

  // The whole point of pooling: the interval is narrower than either input.
  const singleWidth = a.find((s) => s.variant === "v1_title")!.ci!;
  assert.ok(title.ci!.hi - title.ci!.lo < singleWidth.hi - singleWidth.lo);
});

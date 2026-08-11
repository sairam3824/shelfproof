/** Deterministic PRNG so every trial's listing order is reproducible from its
 *  (categoryId, trialIndex) pair alone. */

export function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Decide where each listing sits for one trial.
 *
 * Two properties matter here, and pure randomisation only gives the first:
 *
 *  1. The subject must not sit in a fixed slot. With `balanced`, the subject
 *     occupies each of the 4 positions exactly twice across the 8 trials, which
 *     removes position bias by construction rather than in expectation. At
 *     n=8 a fair coin can easily deal the subject position 0 five times, and
 *     that noise lands directly on the win rate we are trying to measure.
 *
 *  2. The order must be IDENTICAL across the 6 variants at the same trial
 *     index. Lift is a difference between a variant and control, so if both
 *     saw the same arrangement, position cancels out of the difference. This is
 *     why the seed deliberately excludes `variant`.
 *
 * `pure` reverts to unconstrained randomisation (still variant-independent) if
 * you want the textbook design.
 */
export function listingOrderFor(
  categoryId: string,
  trialIndex: number,
  subjectSku: string,
  controlSkus: string[],
  mode: "balanced" | "pure" = "balanced",
): string[] {
  const rng = makeRng(hashSeed(`${categoryId}:${trialIndex}`));

  if (mode === "pure") {
    return shuffle([subjectSku, ...controlSkus], rng);
  }

  const subjectPosition = trialIndex % 4;
  const controls = shuffle(controlSkus, rng);
  const order: string[] = [];
  let c = 0;
  for (let pos = 0; pos < 4; pos++) {
    order.push(pos === subjectPosition ? subjectSku : controls[c++]);
  }
  return order;
}

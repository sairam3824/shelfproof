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

/** Which shopper intent trial `trialIndex` uses. Intents cycle. */
export function intentIndexFor(trialIndex: number, intentCount: number): number {
  return trialIndex % intentCount;
}

/**
 * Cell sizes for which `balanced` mode is actually balanced.
 *
 * The subject must occupy each of the 4 slots equally often *within each
 * intent*, so a cell needs a whole number of (intent x position) blocks:
 * trialsPerCell must be divisible by 4 * intentCount.
 */
export function isBalanceable(trialsPerCell: number, intentCount: number): boolean {
  return trialsPerCell > 0 && trialsPerCell % (4 * intentCount) === 0;
}

/**
 * Decide where each listing sits for one trial.
 *
 * Three properties matter here, and pure randomisation gives only the first:
 *
 *  1. The subject must not sit in a fixed slot.
 *
 *  2. Position must be balanced *within each intent*, not merely across the
 *     cell. Balancing on `trialIndex % 4` while intents cycle on
 *     `trialIndex % 2` looks balanced in aggregate but confounds the two: with
 *     2 intents, intent 0 only ever sees the subject in slots 0 and 2, and
 *     intent 1 only in slots 1 and 3. Any per-intent read of the results is
 *     then measuring intent and position together. Indexing position by the
 *     trial's ordinal *within its own intent* removes that: with 8 trials and
 *     2 intents, each intent sees each of the 4 slots exactly once.
 *
 *  3. The order must be IDENTICAL across the 6 variants at the same trial
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
  intentCount = 1,
): string[] {
  const rng = makeRng(hashSeed(`${categoryId}:${trialIndex}`));

  if (mode === "pure") {
    return shuffle([subjectSku, ...controlSkus], rng);
  }

  // Ordinal of this trial within the subset that shares its intent.
  const ordinalWithinIntent = Math.floor(trialIndex / Math.max(1, intentCount));
  const subjectPosition = ordinalWithinIntent % 4;

  const controls = shuffle(controlSkus, rng);
  const order: string[] = [];
  let c = 0;
  for (let pos = 0; pos < 4; pos++) {
    order.push(pos === subjectPosition ? subjectSku : controls[c++]);
  }
  return order;
}

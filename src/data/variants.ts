import {
  VARIANTS,
  VARIANT_FIELDS,
  type CategoryDefinition,
  type Listing,
  type Variant,
} from "../lib/types.ts";

export type MaterialisedVariant = Listing & {
  variant: Variant;
  changedFields: string[];
};

/** Median of the 4 baseline prices in a category (mean of the middle two). */
export function categoryMedianPrice(cat: CategoryDefinition): number {
  const p = cat.listings.map((l) => l.price).sort((a, b) => a - b);
  return (p[1] + p[2]) / 2;
}

export function subjectOf(cat: CategoryDefinition): Listing {
  const s = cat.listings.find((l) => l.sku === cat.subjectSku);
  if (!s) throw new Error(`${cat.id}: subjectSku ${cat.subjectSku} not in listings`);
  return s;
}

export function controlsOf(cat: CategoryDefinition): Listing[] {
  return cat.listings.filter((l) => l.sku !== cat.subjectSku);
}

/**
 * Produce the 6 fully-rendered subject listings. Each is a copy of the control
 * with exactly one field-group replaced — the override object is the only
 * source of change, so a variant cannot accidentally become a multi-axis edit.
 */
export function buildSubjectVariants(cat: CategoryDefinition): MaterialisedVariant[] {
  const base = subjectOf(cat);
  const o = cat.overrides;

  return VARIANTS.map((variant) => {
    const listing: Listing = { ...base, specs: { ...base.specs } };

    if (variant === "v1_title") listing.title = o.v1_title;
    if (variant === "v2_claim_specificity") listing.bullets = o.v2_claim_specificity;
    if (variant === "v3_price_position") listing.price = o.v3_price_position;
    if (variant === "v4_review_text") listing.reviews = o.v4_review_text;
    if (variant === "v5_spec_complete") listing.specs = { ...o.v5_spec_complete };

    return { ...listing, variant, changedFields: VARIANT_FIELDS[variant] };
  });
}

/**
 * Authoring guards. These are cheap and they catch the failure modes that would
 * silently produce a meaningless experiment — a variant that changes nothing, a
 * "price below median" that isn't, a spec-completion that leaves gaps.
 */
export function validateCategory(cat: CategoryDefinition): string[] {
  const errs: string[] = [];
  const fail = (m: string) => errs.push(`${cat.id}: ${m}`);

  if (cat.listings.length !== 4) fail(`expected 4 listings, got ${cat.listings.length}`);
  if (cat.intents.length !== 2) fail(`expected 2 intents, got ${cat.intents.length}`);

  const skus = new Set(cat.listings.map((l) => l.sku));
  if (skus.size !== cat.listings.length) fail("duplicate SKU");
  if (!skus.has(cat.subjectSku)) fail(`subjectSku ${cat.subjectSku} not in listings`);

  // Every listing must use exactly the category's spec keys, or "blank field"
  // is not comparable across SKUs.
  const want = [...cat.specKeys].sort().join(",");
  for (const l of cat.listings) {
    const got = Object.keys(l.specs).sort().join(",");
    if (got !== want) fail(`${l.sku} spec keys do not match category spec keys`);
    if (l.bullets.length !== 5) fail(`${l.sku} has ${l.bullets.length} bullets, expected 5`);
    if (l.reviews.length !== 3) fail(`${l.sku} has ${l.reviews.length} reviews, expected 3`);
  }

  const base = cat.listings.find((l) => l.sku === cat.subjectSku);
  if (!base) return errs;

  // Each variant must actually differ from control on its own axis.
  const o = cat.overrides;
  if (o.v1_title === base.title) fail("v1_title is identical to control title");
  if (JSON.stringify(o.v2_claim_specificity) === JSON.stringify(base.bullets))
    fail("v2_claim_specificity is identical to control bullets");
  if (JSON.stringify(o.v4_review_text) === JSON.stringify(base.reviews))
    fail("v4_review_text is identical to control reviews");
  if (o.v2_claim_specificity.length !== 5) fail("v2_claim_specificity must have 5 bullets");
  if (o.v4_review_text.length !== 3) fail("v4_review_text must have 3 reviews");

  // v3 must move the subject from above the median to below it, or the variant
  // is not testing what it claims to test.
  const median = categoryMedianPrice(cat);
  if (base.price <= median)
    fail(`control price ${base.price} is not above the median ${median}`);
  if (o.v3_price_position >= median)
    fail(`v3 price ${o.v3_price_position} is not below the median ${median}`);

  // v5 must fill every blank and leave every populated field alone.
  const blanks = cat.specKeys.filter((k) => base.specs[k] === null);
  if (blanks.length === 0) fail("control subject has no blank spec fields for v5 to fill");
  for (const k of cat.specKeys) {
    if (o.v5_spec_complete[k] == null) fail(`v5_spec_complete leaves ${k} blank`);
    if (base.specs[k] !== null && o.v5_spec_complete[k] !== base.specs[k])
      fail(`v5_spec_complete changed already-populated field ${k}`);
  }

  return errs;
}

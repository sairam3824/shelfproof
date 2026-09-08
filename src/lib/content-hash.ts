/**
 * Content hashing for listing provenance.
 *
 * The seed script upserts SubjectVariant rows keyed on (categoryId, variant),
 * so editing a listing and re-seeding rewrites the row that existing trials
 * point at — silently changing what those trials appear to have shown. Storing
 * the hash of the listing on the Trial itself makes that detectable: if a
 * trial's stored hash no longer matches its variant row, the content moved
 * underneath it and the UI says so instead of presenting current text as
 * historical fact.
 */

import { createHash } from "node:crypto";

export type HashableListing = {
  sku: string;
  brand: string;
  title: string;
  price: number;
  currency: string;
  bullets: string[];
  specs: Record<string, string | null>;
  rating: number;
  reviewCount: number;
  reviews: string[];
};

/** Deterministic serialisation — object keys sorted so key order never moves the hash. */
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return "{" + entries.map(([k, v]) => JSON.stringify(k) + ":" + stable(v)).join(",") + "}";
}

export function listingContentHash(l: HashableListing): string {
  const canonical = stable({
    sku: l.sku,
    brand: l.brand,
    title: l.title,
    // Fixed precision so a Prisma Decimal and a JS number hash identically.
    price: Number(l.price).toFixed(2),
    currency: l.currency,
    bullets: l.bullets,
    specs: l.specs,
    rating: Number(l.rating).toFixed(1),
    reviewCount: l.reviewCount,
    reviews: l.reviews,
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

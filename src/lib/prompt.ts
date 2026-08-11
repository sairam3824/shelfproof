import { hashSeed } from "./rng.ts";
import type { Listing, SpecTable } from "./types.ts";

/**
 * Neutral product codes.
 *
 * The agent must name the product it picks, but naming it by SKU would leak the
 * brand ("AURELIO-SIG-200") into every listing regardless of what the title
 * says — which would partly defeat v1_title. Naming it by position ("Product A")
 * would encode position into the answer, which would defeat the shuffle. So we
 * use a stable, opaque code derived from the SKU: same product, same code,
 * every trial, carrying neither brand nor position.
 */
export function publicCode(sku: string): string {
  return "P" + (hashSeed(sku) % 9000 + 1000).toString();
}

export function assertUniqueCodes(skus: string[]): void {
  const seen = new Map<string, string>();
  for (const sku of skus) {
    const code = publicCode(sku);
    const prev = seen.get(code);
    if (prev) throw new Error(`public code collision: ${prev} and ${sku} both map to ${code}`);
    seen.set(code, sku);
  }
}

function renderSpecs(specs: SpecTable, specKeys: string[]): string {
  return specKeys
    .map((k) => {
      const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const v = specs[k];
      // A blank field is rendered as blank, not omitted. Hiding it would erase
      // the very signal v5_spec_complete exists to test.
      return `| ${label} | ${v === null || v === undefined ? "—" : v} |`;
    })
    .join("\n");
}

export function renderListing(
  listing: Listing,
  specKeys: string[],
  currencySymbol = "£",
): string {
  return [
    `### ${publicCode(listing.sku)} — ${listing.title}`,
    `**Price:** ${currencySymbol}${listing.price.toFixed(2)}`,
    `**Rating:** ${listing.rating.toFixed(1)} out of 5 (${listing.reviewCount.toLocaleString("en-GB")} reviews)`,
    ``,
    `**About this item**`,
    ...listing.bullets.map((b) => `- ${b}`),
    ``,
    `**Product details**`,
    ``,
    `| Field | Value |`,
    `| --- | --- |`,
    renderSpecs(listing.specs, specKeys),
    ``,
    `**Customer reviews**`,
    ...listing.reviews.map((r) => `> "${r}"`),
  ].join("\n");
}

export const SYSTEM_PROMPT = [
  "You are a shopping assistant helping a customer choose one product.",
  "",
  "The customer will describe what they need, followed by the search results they are looking at.",
  "Read the listings, decide which single product best fits what the customer asked for, and rank all of them from best to worst fit.",
  "",
  "Respond with a single JSON object and nothing else — no preamble, no explanation outside the JSON, no markdown code fences. The object must have exactly these keys:",
  "",
  '  "chosen_sku": string   — the product code of your single recommendation',
  '  "ranking":    string[] — every product code, best fit first, worst fit last',
  '  "reason":     string   — two or three sentences explaining your recommendation to the customer',
  "",
  "`ranking` must contain every product code exactly once, and `chosen_sku` must be one of them.",
].join("\n");

export function buildUserPrompt(
  intent: string,
  orderedListings: Listing[],
  specKeys: string[],
): string {
  return [
    `Customer: "${intent}"`,
    ``,
    `---`,
    ``,
    `Search results (${orderedListings.length} products):`,
    ``,
    orderedListings.map((l) => renderListing(l, specKeys)).join("\n\n---\n\n"),
  ].join("\n");
}

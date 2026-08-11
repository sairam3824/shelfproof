/** Core domain types for ShelfProof seed data and the trial runner. */

/** A spec-table value. `null` means the field exists for this category but the
 *  seller left it blank — that gap is what v5_spec_complete fills. */
export type SpecValue = string | null;

export type SpecTable = Record<string, SpecValue>;

export type Listing = {
  sku: string;
  brand: string;
  title: string;
  price: number;
  currency: string;
  bullets: string[];
  specs: SpecTable;
  rating: number;
  reviewCount: number;
  reviews: string[];
};

export const VARIANTS = [
  "v0_control",
  "v1_title",
  "v2_claim_specificity",
  "v3_price_position",
  "v4_review_text",
  "v5_spec_complete",
] as const;

export type Variant = (typeof VARIANTS)[number];

export const VARIANT_LABELS: Record<Variant, string> = {
  v0_control: "Control (unmodified)",
  v1_title: "Title leads with use case",
  v2_claim_specificity: "Claims made specific",
  v3_price_position: "Price below category median",
  v4_review_text: "Reviews name concrete outcomes",
  v5_spec_complete: "Spec table completed",
};

/** The single field-group each variant is allowed to touch. Enforced by
 *  `buildSubjectVariants` so a variant can never drift into a multi-axis edit. */
export const VARIANT_FIELDS: Record<Variant, string[]> = {
  v0_control: [],
  v1_title: ["title"],
  v2_claim_specificity: ["bullets"],
  v3_price_position: ["price"],
  v4_review_text: ["reviews"],
  v5_spec_complete: ["specs"],
};

/** The per-variant overrides an author writes for a category's subject SKU.
 *  Each key is the only field that variant may change. */
export type SubjectOverrides = {
  v1_title: string;
  v2_claim_specificity: string[];
  v3_price_position: number;
  v4_review_text: string[];
  v5_spec_complete: SpecTable;
};

export type CategoryDefinition = {
  id: string;
  name: string;
  /** Canonical spec-table key order. Every listing in the category must use
   *  exactly these keys, so "empty field" is well defined and comparable. */
  specKeys: string[];
  subjectSku: string;
  /** Exactly 4: one subject, three fixed controls. */
  listings: Listing[];
  /** Exactly 2 shopper intents. */
  intents: string[];
  overrides: SubjectOverrides;
};

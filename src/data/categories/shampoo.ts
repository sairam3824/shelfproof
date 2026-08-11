import type { CategoryDefinition } from "../../lib/types.ts";

/**
 * Shampoo. Subject = SOLENNE-NOUR-400.
 *
 * The subject's baseline ingredient list deliberately uses coco-glucoside (not
 * SLS), so v2's "sulphate-free" claim is consistent with the unchanged spec
 * table. The sulphate_free spec field itself is left blank at baseline — that
 * is the gap v5 fills.
 */

const SPEC_KEYS = [
  "volume",
  "hair_type",
  "key_ingredients",
  "sulphate_free",
  "silicone_free",
  "ph",
  "fragrance",
  "certifications",
];

export const shampoo: CategoryDefinition = {
  id: "shampoo",
  name: "Shampoo",
  specKeys: SPEC_KEYS,
  subjectSku: "SOLENNE-NOUR-400",

  listings: [
    // ---------- SUBJECT ----------
    {
      sku: "SOLENNE-NOUR-400",
      brand: "Solenne",
      title: "Solenne Nourishing Shampoo 400ml",
      price: 5.2,
      currency: "GBP",
      bullets: [
        "Nourishes and revitalises your hair",
        "For soft, healthy-looking results",
        "Gentle enough for regular use",
        "Beautiful, long-lasting fragrance",
        "Salon-inspired formula",
      ],
      specs: {
        volume: "400ml",
        hair_type: "All hair types",
        key_ingredients: "Aqua, coco-glucoside, argan oil, glycerin, parfum",
        sulphate_free: null,
        silicone_free: null,
        ph: null,
        fragrance: "Floral",
        certifications: null,
      },
      rating: 4.2,
      reviewCount: 903,
      reviews: [
        "Lovely shampoo, smells amazing.",
        "Hair felt nice after using it.",
        "Good product, would recommend.",
      ],
    },

    // ---------- CONTROLS ----------
    {
      sku: "FYFE-REPAIR-400",
      brand: "Fyfe & Bright",
      title: "Fyfe & Bright Repair Shampoo 400ml",
      price: 6.5,
      currency: "GBP",
      bullets: [
        "Sulphate-free and silicone-free",
        "Bond-repair complex for chemically treated hair",
        "pH 4.8 to seal the cuticle and hold colour",
        "Vegan, cruelty-free, 96% biodegradable formula",
        "Safe for keratin and colour treatments",
      ],
      specs: {
        volume: "400ml",
        hair_type: "Damaged, colour-treated hair",
        key_ingredients: "Aqua, coco-glucoside, bond-repair complex, panthenol",
        sulphate_free: "Yes",
        silicone_free: "Yes",
        ph: "4.8",
        fragrance: "Light citrus",
        certifications: "Vegan Society, Leaping Bunny",
      },
      rating: 4.6,
      reviewCount: 14020,
      reviews: [
        "Three colour appointments in and my stylist says my ends are in better shape than when I started.",
        "It doesn't lather much, which threw me at first, but my hair has never felt this good.",
        "Expensive, but a pump and a half does my whole head so a bottle lasts months.",
      ],
    },
    {
      sku: "NORTHCOTE-EVD-400",
      brand: "Northcote",
      title: "Northcote Everyday Shampoo 400ml",
      price: 3.8,
      currency: "GBP",
      bullets: [
        "Everyday shampoo for normal hair",
        "Light formula that rinses clean",
        "pH 5.5 balanced",
        "Suitable for daily washing",
        "Recyclable bottle",
      ],
      specs: {
        volume: "400ml",
        hair_type: "Normal hair",
        key_ingredients: "Aqua, sodium laureth sulfate, glycerin, panthenol",
        sulphate_free: "No",
        silicone_free: "Yes",
        ph: "5.5",
        fragrance: "Fresh linen",
        certifications: "Recyclable bottle",
      },
      rating: 4.3,
      reviewCount: 6700,
      reviews: [
        "Does exactly what a shampoo should do and nothing more.",
        "Rinses out properly, no residue left on fine hair.",
        "Been buying it for years and I've never had a bad bottle.",
      ],
    },
    {
      sku: "BASICWASH-2IN1-400",
      brand: "BasicWash",
      title: "BasicWash 2-in-1 Shampoo & Conditioner 400ml",
      price: 1.75,
      currency: "GBP",
      bullets: [
        "Shampoo and conditioner in one",
        "For all the family",
        "Fresh fragrance",
        "400ml bottle",
        "Great everyday value",
      ],
      specs: {
        volume: "400ml",
        hair_type: "All hair types",
        key_ingredients: "Aqua, sodium laureth sulfate, dimethicone, parfum",
        sulphate_free: "No",
        silicone_free: "No",
        ph: null,
        fragrance: "Fresh",
        certifications: null,
      },
      rating: 3.7,
      reviewCount: 5240,
      reviews: [
        "Cheap, and it cleans hair.",
        "Leaves my hair a bit flat and coated.",
        "Fine for the kids, wouldn't use it on my own hair.",
      ],
    },
  ],

  intents: [
    "My hair is colour-treated and it's been going brassy and dry between appointments. I need a shampoo that won't strip the colour out.",
    "I've got fine hair that goes greasy at the roots and falls flat if I use anything heavy. What should I get?",
  ],

  overrides: {
    v1_title:
      "Shampoo for Dry, Colour-Treated Hair That Strips Less Between Washes — 400ml (Solenne Nourishing)",

    v2_claim_specificity: [
      "Sulphate-free: cleansed with coco-glucoside rather than SLS or SLES",
      "3% cold-pressed argan oil plus hydrolysed wheat protein",
      "pH 5.0, within the range shown to slow colour fade",
      "Silicone-free, so no dimethicone build-up on fine hair",
      "Colour retention tested: 87% of tone retained after 8 washes",
    ],

    // Category median is £4.50 (mean of £3.80 and £5.20).
    v3_price_position: 4.25,

    v4_review_text: [
      "Six weeks in and my copper hasn't gone brassy — I usually get about three weeks out of a colour.",
      "My colourist asked what I'd changed, which has genuinely never happened before.",
      "No build-up at the roots, so I've gone from washing every day to every third day.",
    ],

    v5_spec_complete: {
      volume: "400ml",
      hair_type: "All hair types",
      key_ingredients: "Aqua, coco-glucoside, argan oil, glycerin, parfum",
      sulphate_free: "Yes",
      silicone_free: "Yes",
      ph: "5.0",
      fragrance: "Floral",
      certifications: "Vegan Society, Leaping Bunny",
    },
  },
};

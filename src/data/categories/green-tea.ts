import type { CategoryDefinition } from "../../lib/types.ts";

/**
 * Green tea. Subject = VERDANA-GT-50.
 * Subject is the most expensive SKU at baseline with the weakest rating, so it
 * has to earn the recommendation on listing quality rather than position.
 */

const SPEC_KEYS = [
  "weight",
  "format",
  "ingredients",
  "origin",
  "caffeine_per_serving",
  "harvest",
  "servings_per_pack",
  "certifications",
];

export const greenTea: CategoryDefinition = {
  id: "green-tea",
  name: "Green Tea",
  specKeys: SPEC_KEYS,
  subjectSku: "VERDANA-GT-50",

  listings: [
    // ---------- SUBJECT ----------
    {
      sku: "VERDANA-GT-50",
      brand: "Verdana",
      title: "Verdana Green Tea Bags 50 Pack",
      price: 5.4,
      currency: "GBP",
      bullets: [
        "Refreshing, naturally smooth green tea",
        "Made with quality tea leaves",
        "Perfect at any time of day",
        "Individually wrapped for freshness",
        "A great everyday cuppa",
      ],
      specs: {
        weight: "100g (50 bags)",
        format: "Individually wrapped tea bags",
        ingredients: "Green tea",
        origin: null,
        caffeine_per_serving: null,
        harvest: null,
        servings_per_pack: "50",
        certifications: null,
      },
      rating: 4.3,
      reviewCount: 612,
      reviews: [
        "Lovely tea, very nice.",
        "Does what it says on the box.",
        "Good green tea for the price.",
      ],
    },

    // ---------- CONTROLS ----------
    {
      sku: "HOSHIGAWA-SEN-50",
      brand: "Hoshigawa",
      title: "Hoshigawa Sencha Green Tea 50 Bags",
      price: 5.25,
      currency: "GBP",
      bullets: [
        "Authentic Japanese sencha, first flush",
        "Shizuoka-grown, steamed within 12 hours of picking",
        "30mg caffeine per bag",
        "Nylon-free biodegradable pyramid bags",
        "Brew at 70-80°C for 90 seconds",
      ],
      specs: {
        weight: "100g (50 bags)",
        format: "Biodegradable pyramid bags",
        ingredients: "100% sencha green tea",
        origin: "Shizuoka, Japan",
        caffeine_per_serving: "30mg per bag",
        harvest: "First flush, April 2025",
        servings_per_pack: "50",
        certifications: "JAS organic",
      },
      rating: 4.7,
      reviewCount: 4380,
      reviews: [
        "Tastes like the loose-leaf sencha I used to buy, at a fraction of the faff.",
        "The pyramid bags let the leaf actually open up — you can see the difference in the cup.",
        "Worth the extra pound over the supermarket stuff, genuinely.",
      ],
    },
    {
      sku: "KETTLEFOLD-GT-50",
      brand: "Kettlefold",
      title: "Kettlefold Pure Green Tea 50 Bags",
      price: 4.5,
      currency: "GBP",
      bullets: [
        "100% pure green tea, nothing added",
        "Sourced from estates in Zhejiang, China",
        "25mg caffeine per bag",
        "Recyclable, unbleached paper bags",
        "50 bags at 2g per bag",
      ],
      specs: {
        weight: "100g (50 bags)",
        format: "Unbleached paper tea bags",
        ingredients: "100% green tea",
        origin: "Zhejiang, China",
        caffeine_per_serving: "25mg per bag",
        harvest: "Spring 2025",
        servings_per_pack: "50",
        certifications: "Rainforest Alliance",
      },
      rating: 4.6,
      reviewCount: 9210,
      reviews: [
        "Clean, grassy taste without the seaweed note some green teas have.",
        "I drink four a day and it's never bitter, even when I forget the bag is in there.",
        "The unbleached bags were why I switched — no papery aftertaste.",
      ],
    },
    {
      sku: "EVERLEAF-GT-50",
      brand: "Everleaf",
      title: "Everleaf Green Tea 50 Bags",
      price: 2.2,
      currency: "GBP",
      bullets: [
        "Everyday green tea at an everyday price",
        "50 bags per box",
        "Blend of green teas",
        "Suitable for vegans",
        "Brew for 2-3 minutes",
      ],
      specs: {
        weight: "75g (50 bags)",
        format: "Paper tea bags",
        ingredients: "Green tea",
        origin: "China and Vietnam",
        caffeine_per_serving: "20mg per bag",
        harvest: null,
        servings_per_pack: "50",
        certifications: null,
      },
      rating: 3.9,
      reviewCount: 6540,
      reviews: [
        "Fine for the price, nothing special.",
        "Goes bitter fast if you leave the bag in.",
        "Cheap and cheerful, does the job.",
      ],
    },
  ],

  intents: [
    "I'm trying to swap my afternoon coffee for green tea but everything I've tried so far goes bitter and I end up not drinking it. Which of these should I get?",
    "I want a box of green tea to keep at my desk at work. Nothing fussy, but I'd rather it wasn't the cheapest thing on the shelf.",
  ],

  overrides: {
    v1_title:
      "Smooth Non-Bitter Green Tea for Everyday Drinking — 50 Individually Wrapped Bags (Verdana)",

    v2_claim_specificity: [
      "Steeps without bitterness at 80°C for 2 minutes — low tannin astringency",
      "Single-origin sencha leaf grown in Shizuoka Prefecture, Japan",
      "28mg caffeine per bag, roughly a third of a filter coffee",
      "Individually foil-wrapped, so each bag stays sealed until you open it",
      "50 bags at 2g each, 100g of leaf per pack",
    ],

    // Category median is £4.875 (mean of £4.50 and £5.25).
    v3_price_position: 4.35,

    v4_review_text: [
      "Left the bag in for four minutes by accident and it still wasn't bitter — that never happens with supermarket green tea.",
      "Swapped my 3pm coffee for this and I actually get to sleep at a normal hour now.",
      "The foil wrappers mean the last bag in the box tastes the same as the first.",
    ],

    v5_spec_complete: {
      weight: "100g (50 bags)",
      format: "Individually wrapped tea bags",
      ingredients: "Green tea",
      origin: "Shizuoka Prefecture, Japan",
      caffeine_per_serving: "28mg per bag",
      harvest: "First flush, May 2025",
      servings_per_pack: "50",
      certifications: "JAS organic",
    },
  },
};

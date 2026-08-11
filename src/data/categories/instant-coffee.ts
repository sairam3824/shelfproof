import type { CategoryDefinition } from "../../lib/types.ts";

/**
 * Instant coffee. Subject = AURELIO-SIG-200.
 *
 * The subject is deliberately built with headroom on all six axes, otherwise a
 * variant would have nothing to change and its lift would be structurally zero:
 *   v1 — title is brand-led, no use case
 *   v2 — bullets are vague ("smooth, rich", "carefully selected")
 *   v3 — £6.99 sits above the £6.245 category median
 *   v4 — review snippets are generic ("does the job")
 *   v5 — 5 of 8 spec fields are blank
 *
 * Pack size is held at 200g across all four SKUs so price is directly
 * comparable and v3 measures price position rather than pack-size confusion.
 */

const SPEC_KEYS = [
  "weight",
  "form",
  "ingredients",
  "origin",
  "caffeine_per_serving",
  "roast_level",
  "servings_per_jar",
  "certifications",
];

export const instantCoffee: CategoryDefinition = {
  id: "instant-coffee",
  name: "Instant Coffee",
  specKeys: SPEC_KEYS,
  subjectSku: "AURELIO-SIG-200",

  listings: [
    // ---------- SUBJECT ----------
    {
      sku: "AURELIO-SIG-200",
      brand: "Aurelio",
      title: "Aurelio Signature Instant Coffee 200g",
      price: 6.99,
      currency: "GBP",
      bullets: [
        "Smooth, rich flavour in every cup",
        "Made from carefully selected coffee beans",
        "Dissolves easily in hot or cold water",
        "Resealable jar keeps your coffee fresh",
        "Great for everyday drinking",
      ],
      specs: {
        weight: "200g",
        form: "Freeze-dried granules",
        ingredients: "100% instant coffee",
        origin: null,
        caffeine_per_serving: null,
        roast_level: null,
        servings_per_jar: null,
        certifications: null,
      },
      rating: 4.2,
      reviewCount: 486,
      reviews: [
        "Good coffee, does the job.",
        "Nice taste, would buy again.",
        "Decent value for a jar this size.",
      ],
    },

    // ---------- CONTROLS (never modified) ----------
    {
      sku: "BREWHAUS-GOLD-200",
      brand: "Brewhaus",
      title: "Brewhaus Gold Freeze-Dried Instant Coffee 200g",
      price: 7.49,
      currency: "GBP",
      bullets: [
        "100% arabica, medium-dark roast",
        "Freeze-dried at -40°C to lock in aroma compounds",
        "Rainforest Alliance certified beans",
        "80mg caffeine per 2g serving",
        "Approx. 100 cups per 200g jar",
      ],
      specs: {
        weight: "200g",
        form: "Freeze-dried granules",
        ingredients: "100% arabica coffee",
        origin: "Colombia and Brazil",
        caffeine_per_serving: "80mg per 2g serving",
        roast_level: "Medium-dark",
        servings_per_jar: "100",
        certifications: "Rainforest Alliance",
      },
      rating: 4.6,
      reviewCount: 12430,
      reviews: [
        "Closest instant I've found to a proper filter coffee — no bitter aftertaste when I drink it black.",
        "Been buying this for two years. The aroma when you open a fresh jar is the giveaway.",
        "Pricey per jar, but 100 cups works out at about 7p a cup, so it's not actually expensive.",
      ],
    },
    {
      sku: "NUEVE-CLASSIC-200",
      brand: "Café Nueve",
      title: "Café Nueve Classic Instant Coffee 200g",
      price: 4.25,
      currency: "GBP",
      bullets: [
        "Everyday value instant coffee",
        "Blend of robusta and arabica beans",
        "Spray-dried powder, dissolves in hot water",
        "200g jar, approx. 110 cups",
        "Suitable for vegetarians and vegans",
      ],
      specs: {
        weight: "200g",
        form: "Spray-dried powder",
        ingredients: "Coffee (robusta, arabica)",
        origin: "Vietnam and Brazil",
        caffeine_per_serving: "95mg per 2g serving",
        roast_level: "Medium",
        servings_per_jar: "110",
        certifications: null,
      },
      rating: 4.0,
      reviewCount: 3102,
      reviews: [
        "Perfectly fine for a morning cup at this price.",
        "A bit sharp drunk black, completely fine with milk.",
        "Cheapest jar I can find that isn't horrible.",
      ],
    },
    {
      sku: "MORNSIDE-RICH-200",
      brand: "Mornside",
      title: "Mornside Rich Roast Instant Coffee Granules 200g",
      price: 5.5,
      currency: "GBP",
      bullets: [
        "Dark roast for a fuller, bolder cup",
        "Freeze-dried granules dissolve in seconds",
        "70% arabica / 30% robusta blend",
        "95mg caffeine per 2g serving",
        "Recyclable glass jar",
      ],
      specs: {
        weight: "200g",
        form: "Freeze-dried granules",
        ingredients: "Coffee (70% arabica, 30% robusta)",
        origin: "Brazil, Honduras and Vietnam",
        caffeine_per_serving: "95mg per 2g serving",
        roast_level: "Dark",
        servings_per_jar: "100",
        certifications: "Recyclable packaging",
      },
      rating: 4.4,
      reviewCount: 7845,
      reviews: [
        "Strong enough to drink black, which most instants really aren't.",
        "Granules dissolve properly — no sludge left at the bottom of the mug.",
        "Swapped from a supermarket own-brand and I'm not going back.",
      ],
    },
  ],

  intents: [
    "I drink instant coffee black every morning and I really don't get on with that bitter, burnt aftertaste. Which of these should I buy?",
    "I need a jar of instant coffee for the office kitchen — about a dozen of us, a couple are fussy about coffee, and I don't want to overspend.",
  ],

  overrides: {
    // Lead with the use case, drop the brand to the tail.
    v1_title:
      "Smooth Low-Bitterness Instant Coffee for Everyday Black Coffee — 200g Jar (Aurelio Signature)",

    // Same five claims, each replaced with something measurable.
    v2_claim_specificity: [
      "Low-bitterness medium roast: 100% arabica, zero robusta",
      "Single-origin beans from smallholder farms in Huila, Colombia",
      "Freeze-dried granules fully dissolve in under 5 seconds at 80°C",
      "Nitrogen-flushed glass jar stays aroma-sealed for 12 weeks after opening",
      "100 x 2g servings per jar, 75mg caffeine per serving",
    ],

    // Category median is £6.245 (mean of £5.50 and £6.99). £5.75 clears it
    // without undercutting the £4.25 budget SKU.
    v3_price_position: 5.75,

    // Same three reviewers, now naming an outcome instead of a vibe.
    v4_review_text: [
      "Switched from a £9 jar and honestly can't tell the difference in the cup.",
      "No bitter aftertaste when I drink it black, and that's the only reason I keep rebuying.",
      "One 2g spoon in 200ml of water and it's dissolved before I've put the kettle down.",
    ],

    // Every blank field filled. Non-blank fields keep their control values.
    v5_spec_complete: {
      weight: "200g",
      form: "Freeze-dried granules",
      ingredients: "100% instant coffee",
      origin: "Colombia (Huila region)",
      caffeine_per_serving: "75mg per 2g serving",
      roast_level: "Medium",
      servings_per_jar: "100",
      certifications: "Fairtrade certified",
    },
  },
};

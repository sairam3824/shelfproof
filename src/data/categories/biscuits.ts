import type { CategoryDefinition } from "../../lib/types.ts";

/**
 * Biscuits. Subject = HALLOWAY-OAT-300.
 * All packs held at 300g so price is directly comparable.
 */

const SPEC_KEYS = [
  "weight",
  "format",
  "ingredients",
  "sugar_per_biscuit",
  "allergens",
  "biscuits_per_pack",
  "storage",
  "certifications",
];

export const biscuits: CategoryDefinition = {
  id: "biscuits",
  name: "Biscuits",
  specKeys: SPEC_KEYS,
  subjectSku: "HALLOWAY-OAT-300",

  listings: [
    // ---------- SUBJECT ----------
    {
      sku: "HALLOWAY-OAT-300",
      brand: "Halloway's",
      title: "Halloway's Oat Crunch Biscuits 300g",
      price: 2.4,
      currency: "GBP",
      bullets: [
        "Deliciously crunchy oat biscuits",
        "Baked with wholesome ingredients",
        "Perfect with a cup of tea",
        "Resealable pack keeps them fresh",
        "The whole family will love them",
      ],
      specs: {
        weight: "300g",
        format: "Round biscuits",
        ingredients: "Wheat flour, oats, sugar, vegetable oil, salt, raising agents",
        sugar_per_biscuit: null,
        allergens: null,
        biscuits_per_pack: null,
        storage: "Store in a cool, dry place",
        certifications: null,
      },
      rating: 4.2,
      reviewCount: 741,
      reviews: [
        "Tasty biscuits, nice and crunchy.",
        "Good with a brew.",
        "Family enjoyed them.",
      ],
    },

    // ---------- CONTROLS ----------
    {
      sku: "BINDLE-CHOC-300",
      brand: "Bindle & Co.",
      title: "Bindle & Co. Belgian Chocolate Oat Biscuits 300g",
      price: 3.1,
      currency: "GBP",
      bullets: [
        "Half-coated in 54% Belgian dark chocolate",
        "38% wholegrain oats",
        "6.8g sugar per biscuit",
        "18 biscuits per 300g pack",
        "No palm oil, no artificial colours or flavours",
      ],
      specs: {
        weight: "300g",
        format: "Round, half chocolate-coated",
        ingredients:
          "Wheat flour, oats (38%), Belgian dark chocolate (54% cocoa), sugar, sunflower oil, salt",
        sugar_per_biscuit: "6.8g",
        allergens: "Contains wheat (gluten), oats, soya. May contain milk, nuts.",
        biscuits_per_pack: "18",
        storage: "Store in a cool, dry place below 20°C",
        certifications: "Fairtrade cocoa, Red Tractor wheat",
      },
      rating: 4.7,
      reviewCount: 11240,
      reviews: [
        "The chocolate is genuinely good chocolate, not the waxy stuff you usually get.",
        "I hide these from my husband, which tells you everything you need to know.",
        "Pricier than the rest but you only need one with a coffee.",
      ],
    },
    {
      sku: "TANNER-DIG-300",
      brand: "Tannerfield",
      title: "Tannerfield Digestive Biscuits 300g",
      price: 1.95,
      currency: "GBP",
      bullets: [
        "The classic wheatmeal digestive",
        "Baked with 52% wholemeal flour",
        "4.9g sugar per biscuit",
        "Approx. 22 biscuits per pack",
        "Suitable for vegetarians",
      ],
      specs: {
        weight: "300g",
        format: "Round digestive",
        ingredients:
          "Wholemeal flour (52%), wheat flour, sugar, palm oil, oat flour, salt, raising agents",
        sugar_per_biscuit: "4.9g",
        allergens: "Contains wheat (gluten), oats. May contain milk.",
        biscuits_per_pack: "22",
        storage: "Store in a cool, dry place",
        certifications: "RSPO-certified palm oil",
      },
      rating: 4.5,
      reviewCount: 8900,
      reviews: [
        "It's a digestive. It's the digestive I grew up with and it hasn't changed.",
        "Holds up to a dunk for a good three seconds, which is the only test that matters.",
        "Bought these for a meeting and the packet was empty inside twenty minutes.",
      ],
    },
    {
      sku: "PENNYWISE-OAT-300",
      brand: "Pennywise",
      title: "Pennywise Oat Biscuits 300g",
      price: 0.95,
      currency: "GBP",
      bullets: [
        "Everyday oat biscuits at a budget price",
        "300g sharing pack",
        "Suitable for vegetarians",
        "Great for the biscuit tin",
        "Store in a cool, dry place",
      ],
      specs: {
        weight: "300g",
        format: "Round biscuits",
        ingredients: "Wheat flour, sugar, palm oil, oats, salt, raising agents",
        sugar_per_biscuit: "5.6g",
        allergens: "Contains wheat (gluten), oats.",
        biscuits_per_pack: "24",
        storage: "Store in a cool, dry place",
        certifications: null,
      },
      rating: 3.9,
      reviewCount: 4410,
      reviews: [
        "You get what you pay for, but they're not bad.",
        "A bit dry on their own, fine dunked.",
        "Cheapest oat biscuit going and the kids don't care.",
      ],
    },
  ],

  intents: [
    "I want a biscuit for the kids' lunchboxes that isn't just a sugar bomb — something with a bit of substance to it that won't fall apart by lunchtime.",
    "I need decent biscuits for a work meeting. Not fancy, but not the cheapest thing on the shelf either.",
  ],

  overrides: {
    v1_title:
      "Everyday Lunchbox and Tea-Break Oat Biscuits — 300g Resealable Pack (Halloway's Oat Crunch)",

    v2_claim_specificity: [
      "42% wholegrain oats — 3.1g of fibre per two-biscuit serving",
      "4.2g sugar per biscuit, around 30% less than the category average",
      "Baked, not fried, with high-oleic sunflower oil instead of palm oil",
      "No artificial colours, flavours or preservatives",
      "20 biscuits per 300g pack, sturdy enough to stack in a lunchbox",
    ],

    // Category median is £2.175 (mean of £1.95 and £2.40).
    v3_price_position: 1.85,

    v4_review_text: [
      "Two of these and my son actually makes it to lunch without raiding the snack drawer.",
      "Less sweet than the chocolate ones, and my daughter's dentist has stopped commenting.",
      "They survive a whole day in a lunchbox without turning to crumbs, which is the entire point.",
    ],

    v5_spec_complete: {
      weight: "300g",
      format: "Round biscuits",
      ingredients: "Wheat flour, oats, sugar, vegetable oil, salt, raising agents",
      sugar_per_biscuit: "4.2g",
      allergens: "Contains wheat (gluten), oats. May contain milk, soya.",
      biscuits_per_pack: "20",
      storage: "Store in a cool, dry place",
      certifications: "Red Tractor assured wheat",
    },
  },
};

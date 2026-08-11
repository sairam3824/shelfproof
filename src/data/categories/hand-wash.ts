import type { CategoryDefinition } from "../../lib/types.ts";

/**
 * Hand wash. Subject = LUMEVA-GEN-500.
 *
 * Note the internal-consistency constraint: v2 rewrites the subject's vague
 * claims into measurable ones, but the spec table is NOT changed by v2. So v2's
 * claims must not contradict the control spec table — e.g. the subject's
 * fragrance spec says "Fresh", so v2 quantifies the fragrance rather than
 * claiming fragrance-free.
 */

const SPEC_KEYS = [
  "volume",
  "format",
  "key_ingredients",
  "ph",
  "fragrance",
  "dermatologically_tested",
  "suitable_for",
  "certifications",
];

export const handWash: CategoryDefinition = {
  id: "hand-wash",
  name: "Hand Wash",
  specKeys: SPEC_KEYS,
  subjectSku: "LUMEVA-GEN-500",

  listings: [
    // ---------- SUBJECT ----------
    {
      sku: "LUMEVA-GEN-500",
      brand: "Lumeva",
      title: "Lumeva Gentle Hand Wash 500ml",
      price: 3.6,
      currency: "GBP",
      bullets: [
        "Gently cleanses without drying",
        "Enriched with moisturising ingredients",
        "Kind to skin",
        "Pleasant, fresh fragrance",
        "Handy pump bottle",
      ],
      specs: {
        volume: "500ml",
        format: "Liquid pump",
        key_ingredients: "Aqua, glycerin, coco-glucoside, parfum",
        ph: null,
        fragrance: "Fresh",
        dermatologically_tested: null,
        suitable_for: null,
        certifications: null,
      },
      rating: 4.1,
      reviewCount: 328,
      reviews: [
        "Nice hand wash, smells good.",
        "Does the job, no complaints.",
        "Good value, will repurchase.",
      ],
    },

    // ---------- CONTROLS ----------
    {
      sku: "PURECARE-SEN-500",
      brand: "Purecare",
      title: "Purecare Sensitive Hand Wash 500ml",
      price: 4.2,
      currency: "GBP",
      bullets: [
        "pH 5.5, sulphate-free formula",
        "Contains 6% glycerin and colloidal oatmeal",
        "Fragrance-free and dye-free",
        "Accepted by the National Eczema Society",
        "Dermatologically tested, suitable from 3 months",
      ],
      specs: {
        volume: "500ml",
        format: "Liquid pump",
        key_ingredients: "Aqua, glycerin (6%), colloidal oatmeal, panthenol",
        ph: "5.5",
        fragrance: "None (fragrance-free)",
        dermatologically_tested: "Yes",
        suitable_for: "Sensitive and eczema-prone skin, from 3 months",
        certifications: "National Eczema Society Accepted, Leaping Bunny",
      },
      rating: 4.7,
      reviewCount: 15600,
      reviews: [
        "Our paediatric dermatologist recommended this for my son's hands and it's the only one that hasn't flared him up.",
        "No fragrance at all, which sounds boring until you've had a reaction to one of the 'gentle' ones.",
        "Expensive per bottle, but we get through half as much as we did with the foaming ones.",
      ],
    },
    {
      sku: "BRAMBLE-BOT-500",
      brand: "Bramblewood",
      title: "Bramblewood Botanical Hand Wash 500ml",
      price: 2.95,
      currency: "GBP",
      bullets: [
        "Blended with rosemary and bergamot essential oils",
        "Plant-derived cleansing base, 98% natural origin",
        "pH 5.5 skin-friendly formula",
        "Vegan and cruelty-free",
        "Recycled and recyclable bottle",
      ],
      specs: {
        volume: "500ml",
        format: "Liquid pump",
        key_ingredients: "Aqua, coco-glucoside, glycerin, rosemary and bergamot oil",
        ph: "5.5",
        fragrance: "Rosemary and bergamot essential oils",
        dermatologically_tested: "Yes",
        suitable_for: "Normal to dry skin",
        certifications: "Vegan Society, Leaping Bunny",
      },
      rating: 4.4,
      reviewCount: 5120,
      reviews: [
        "Smells like a nice hotel rather than a supermarket.",
        "The bottle looks good enough to leave out when people come round.",
        "A bit strong if you're sensitive to essential oils, lovely otherwise.",
      ],
    },
    {
      sku: "VALUCLEAN-AB-500",
      brand: "ValuClean",
      title: "ValuClean Antibacterial Hand Wash 500ml",
      price: 1.4,
      currency: "GBP",
      bullets: [
        "Kills 99.9% of bacteria",
        "Antibacterial protection for the whole family",
        "Fresh clean scent",
        "500ml pump bottle",
        "Great value, multipack available",
      ],
      specs: {
        volume: "500ml",
        format: "Liquid pump",
        key_ingredients: "Aqua, sodium laureth sulfate, benzalkonium chloride, parfum",
        ph: null,
        fragrance: "Fresh clean scent",
        dermatologically_tested: null,
        suitable_for: "Normal skin",
        certifications: null,
      },
      rating: 3.8,
      reviewCount: 9870,
      reviews: [
        "Cheap, and it does kill germs.",
        "Dries my hands out if I use it all day.",
        "Fine for the kitchen sink, wouldn't use it on the kids.",
      ],
    },
  ],

  intents: [
    "I need a hand wash that won't dry out my kids' skin — they wash their hands constantly and my youngest has eczema patches on her wrists.",
    "Looking for a hand wash for the downstairs loo that guests will use. I want it to smell nice but not be overpowering.",
  ],

  overrides: {
    v1_title:
      "Hand Wash for Dry, Sensitive and Eczema-Prone Skin — 500ml Pump (Lumeva Gentle)",

    v2_claim_specificity: [
      "pH 5.5, matched to skin's natural acid mantle",
      "Sulphate-free cleansing base — no SLS or SLES",
      "5% glycerin plus panthenol to reduce trans-epidermal water loss",
      "Low-allergen fragrance at 0.4%, free from all 26 EU-listed fragrance allergens",
      "Dermatologically tested on sensitive skin: 4-week study, 120 participants",
    ],

    // Category median is £3.275 (mean of £2.95 and £3.60).
    v3_price_position: 2.75,

    v4_review_text: [
      "My six-year-old's knuckles stopped cracking about two weeks after we switched to this.",
      "I wash my hands maybe thirty times a shift on the ward and this is the first one that hasn't left them tight.",
      "No sting on the eczema patch on my wrist, which ruled out every other wash we tried.",
    ],

    v5_spec_complete: {
      volume: "500ml",
      format: "Liquid pump",
      key_ingredients: "Aqua, glycerin, coco-glucoside, parfum",
      ph: "5.5",
      fragrance: "Fresh",
      dermatologically_tested: "Yes — 4-week study, 120 participants",
      suitable_for: "Sensitive, dry and eczema-prone skin, ages 3+",
      certifications: "Cruelty Free International Leaping Bunny",
    },
  },
};

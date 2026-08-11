Build ShelfProof: an experiment bench that measures which product-listing
changes make an AI shopping assistant recommend a given SKU.

STACK
Next.js 15 (App Router) + TypeScript, Tailwind, Recharts, PostgreSQL via
Prisma (Neon), deployed on Vercel. Anthropic or OpenAI API for the agent.
Runs are executed by a Node script and persisted; the web app reads results
from Postgres and does not call the LLM at request time.

DOMAIN MODEL
5 categories, FMCG/personal care: instant coffee, green tea, hand wash,
biscuits, shampoo.
Each category has 4 competing SKUs with a realistic baseline listing:
title, price, 5 bullet points, spec table (weight, ingredients, claims),
star rating, review count, and 3 short review snippets.
In each category exactly one SKU is the SUBJECT — the one we're trying to
get recommended. The other 3 are fixed controls and never change.

THE 6 VARIANTS (applied to the SUBJECT listing only)
  v0_control          — baseline, unmodified
  v1_title            — title rewritten to lead with the use case, not the brand
  v2_claim_specificity— vague claims replaced with specific measurable ones
                        ("gentle" -> "pH 5.5, sulphate-free")
  v3_price_position   — price moved from above to below the category median
  v4_review_text      — review snippets swapped for ones naming concrete outcomes
  v5_spec_complete    — every empty spec field filled in

THE AGENT
One LLM call per trial. System prompt: you are a shopping assistant helping
a customer choose one product. User prompt: a shopper intent (2 per category,
e.g. "I need a hand wash that won't dry out my kids' skin") plus the 4
listings as search results.
Return strict JSON: { "chosen_sku": string, "ranking": string[],
"reason": string }. Retry once on parse failure, then record as invalid.

METHODOLOGY — this part matters, do not skip it
- Randomise the order of the 4 listings on every trial and store the order.
  Position bias will otherwise swamp the effect being measured.
- temperature 0.7 so repeated trials vary; store the seed/trial index.
- 5 categories x 6 variants x 8 trials = 240 trials. Cache nothing.
- Store every trial row: category, variant, shopper intent, listing order,
  chosen SKU, full ranking, reason text, latency ms, token counts.

ANALYSIS
Per (category, variant): win rate = subject chosen / valid trials.
Lift = win rate minus that category's v0_control win rate.
Wilson 95% confidence interval on each win rate; flag any lift whose
interval crosses zero as "not distinguishable from control" — do not let
the UI present noise as a finding.
Also compute mean rank of the subject, not just win rate.

DASHBOARD (/)
- Category selector.
- Bar chart: win rate by variant with the control drawn as a reference line
  and error bars from the CI.
- Table: variant, win rate, lift, CI, mean rank, verdict.
- "Listing edit priority" panel: variants sorted by lift descending, with
  the ones inside the noise band explicitly listed as "no measurable effect"
  in a separate group.
- A trial drill-down: click a variant, read the agent's actual reasons for
  the trials it won and lost.
- /methodology page stating trial counts, randomisation, and CI method.

BUILD ORDER
1. Prisma schema + seed script with all 20 listings and the 6 variant
   transforms. Show me the seed data for one category before writing the rest.
2. Runner script (npm run trials) with cost printed per batch and resume-on-crash.
3. Analysis module with unit tests on the Wilson interval and lift math.
4. Dashboard.
5. README: the question, the design, the result, and what the design cannot
   tell you.


# ShelfProof

An experiment bench that measures which product-listing edits make an AI
shopping assistant recommend a given SKU.

---

## The question

Shoppers increasingly ask an assistant rather than scan a results page. If an
LLM is going to be the thing that picks one product out of four, a merchandiser
has a concrete question: **of the edits I could make to my listing, which one
actually changes the recommendation?**

That is a causal question, so it needs an experiment rather than an opinion.
ShelfProof runs one: a fixed set of competitors, one listing under test, six
one-change-at-a-time variants of it, and enough repeated trials to say whether a
difference in win rate is real or is sampling noise.

The answer it produces is deliberately narrow: *for this assistant, on this
model, on this date, this edit moved the recommendation rate by this much, and
here is the interval around it.* Everything the design cannot support is listed
at the bottom of this file and on `/methodology`.

---

## The design

### Domain

Five FMCG / personal-care categories: instant coffee, green tea, hand wash,
biscuits, shampoo. Each has **4 competing SKUs** with a full realistic listing —
title, price, 5 bullets, a spec table, star rating, review count, 3 review
snippets.

In each category exactly one SKU is the **subject** (the listing we are trying
to get recommended). The other 3 are **controls** and never change, in any
variant, in any trial.

| Category | Subject SKU |
| --- | --- |
| Instant Coffee | `AURELIO-SIG-200` |
| Green Tea | `VERDANA-GT-50` |
| Hand Wash | `LUMEVA-GEN-500` |
| Biscuits | `HALLOWAY-OAT-300` |
| Shampoo | `SOLENNE-NOUR-400` |

### The six variants

Applied to the subject listing only. Each changes exactly one field-group, so
any effect is attributable to one edit rather than to a redesign.

| Variant | Edit |
| --- | --- |
| `v0_control` | Baseline, unmodified. |
| `v1_title` | Title leads with the use case, not the brand. |
| `v2_claim_specificity` | Vague claims replaced with specific measurable ones. |
| `v3_price_position` | Price moved from above the category median to below it. |
| `v4_review_text` | Review snippets swapped for ones naming concrete outcomes. |
| `v5_spec_complete` | Every empty spec field filled in. |

Concretely, in hand wash `v2` turns

> Gently cleanses without drying · Enriched with moisturising ingredients ·
> Kind to skin

into

> pH 5.5, matched to skin's natural acid mantle · Sulphate-free cleansing base —
> no SLS or SLES · 5% glycerin plus panthenol to reduce trans-epidermal water
> loss

The variants are **materialised at seed time**, not computed at run time, so the
exact text the agent saw in any trial is recoverable from the database
permanently. `src/data/variants.ts` also validates the seed data before it is
written: it fails the seed if a variant is identical to control, if the "below
median" price is not actually below the median, if `v5` leaves a field blank or
alters an already-populated one, or if bullet/review/spec-key counts drift.

### The agent

One LLM call per trial. System prompt: a shopping assistant helping a customer
choose one product. User prompt: a shopper intent (2 per category) plus the 4
listings rendered as search results. It must reply with strict JSON:

```json
{ "chosen_sku": "P4821", "ranking": ["P4821", "..."], "reason": "..." }
```

A response is rejected if it fails to parse, names a product that was not on the
page, or returns a ranking that is not a permutation of the four codes. **One**
corrective retry is issued; a second failure records the trial as invalid with
its cause. Invalid trials are excluded from the denominator — never counted as
losses.

Products are identified by a stable opaque code (`P4821`) derived from the SKU.
Not by SKU, which would leak the brand into every listing and partly defeat
`v1_title`. Not by slot letter, which would encode position into the answer and
defeat the shuffle.

### Methodology

The parts that make the numbers mean anything:

- **240 trials per run** — 5 categories × 6 variants × 8 trials. Nothing is
  cached; identical prompts are re-sent and re-billed, because a cache would
  collapse the variance the design depends on.
- **temperature 0.7**, extended thinking disabled. The trial index is stored on
  every row.
- **Balanced position assignment.** Across the 8 trials in a cell the subject
  occupies each of the 4 positions exactly twice — position bias is removed by
  construction, not merely in expectation. At n=8, unconstrained shuffling can
  easily deal the subject the first slot five times, and that noise lands
  directly on the win rate being measured. (`--order pure` reverts to textbook
  randomisation.)
- **Order is held constant across variants.** The shuffle is seeded from
  `(category, trialIndex)` and deliberately excludes the variant, so at trial *k*
  all six variants see the identical arrangement. Lift is a difference between a
  variant and control, so position cancels out of that difference exactly.
- **Every trial row is stored**: category, variant, intent, listing order,
  subject position, chosen SKU, full ranking, reason text, latency, token counts,
  raw response, and whether a parse retry was needed.

### Analysis

Per `(category, variant)`:

- **Win rate** = subject chosen / valid trials.
- **95% Wilson score interval** on each win rate. Wilson rather than the normal
  approximation because cells are small and win rates frequently hit 0 or 1,
  where the normal interval collapses to zero width and asserts certainty that
  does not exist.
- **Lift** = variant win rate − that category's `v0_control` win rate, with
  **Newcombe's score interval for the difference of two proportions**, composed
  from the two Wilson intervals. Differencing the raw Wilson bounds instead would
  give a far too wide interval and under-report real effects.
- **Any lift whose interval contains zero is reported as "no measurable
  effect"** and is grouped separately from the ranked findings. The UI never
  presents a noise-band difference as a finding.
- **Mean rank** of the subject (1 best, 4 worst) with a standard error, because
  win rate cannot tell a narrow second place from a distant fourth.

`src/lib/analysis.test.ts` covers this maths — Wilson against published values,
the 0/n and n/n edge cases, symmetry, lift sign and interval behaviour, and the
verdict boundaries. Run with `npm test`.

### Dashboard

- Category selector.
- Win rate by variant, with the control drawn as a reference line and error bars
  from the CI. Clicking a bar opens the drill-down.
- Table: win rate, CI, lift, lift CI, mean rank ± SE, verdict.
- **Listing edit priority** — variants whose lift interval clears zero, largest
  first, with the noise-band variants in a separate "no measurable effect" group
  labelled as unmeasured rather than as proven neutral.
- **Trial drill-down** — the agent's actual reasoning for the trials the subject
  won and the trials it lost, side by side, with the subject's position in each.
- `/methodology` — trial counts, randomisation, CI method, limitations.

The web app never calls the LLM. It reads finished runs out of Postgres, and it
defaults to the most recent **finished** run so a half-complete run in progress
cannot silently become "the result".

---

## Running it

```bash
npm install
cp .env.example .env          # fill in Neon + Anthropic credentials

npm run db:push               # create the schema
npm run db:seed               # 20 listings, 30 subject variants, 10 intents
npm run trials                # 240 LLM calls; prints cost per cell
npm run report                # results as markdown
npm run dev                   # dashboard on :3000
```

Useful flags on the runner:

| Flag | Effect |
| --- | --- |
| `--dry-run` | Build every prompt and print the grid, call nothing. |
| `--resume-latest` | Continue the most recent unfinished run. |
| `--categories a,b` | Restrict to some categories. |
| `--trials 16` | Trials per cell (default 8). |
| `--order pure` | Unconstrained randomisation instead of balanced. |
| `--concurrency 8` | Parallel API calls (default 4). |

**Resume-on-crash**: each trial is written the moment it returns, and a unique
constraint on `(run, category, variant, trialIndex)` lets the runner skip cells
already recorded. Kill it at trial 137 and `npm run trials -- --resume-latest`
picks up at 137 without re-billing the first 136.

**Model note**: the default is `claude-sonnet-4-6`. The design requires
`temperature` 0.7, and the current frontier models won't take it — Opus 5 removed
`temperature`/`top_p`/`top_k` entirely (400), and Sonnet 5 rejects any non-default
value. Sonnet 4.6 still accepts sampling parameters, so the bench stays there.
Set `SHELFPROOF_MODEL` to change it; add a price row in `src/lib/cost.ts` for any
new model or the cost line reports `$0.0000`.

If you ever want to run this on a model without `temperature`, the honest fix is
to drop the parameter and let the model's own sampling supply the variance —
**not** to keep 240 identical prompts and pretend the trials are independent.

---

## The result

> **No run has been executed in this checkout** — it has no database credentials
> and no API key, so there are no trials to report. Everything above is built and
> tested; the numbers below are the only thing waiting on a run.
>
> `npm run trials && npm run report` emits this section as markdown, per
> category, straight from the trial rows. Paste it here. Do not hand-transcribe
> it from the dashboard, and do not report a cell whose lift interval contains
> zero as a finding — `report` already marks those as "no measurable effect".

What to expect when you do run it, so the output is not misread:

- At 8 trials per cell the noise band is wide. A 5/8 versus 4/8 split looks like
  a 12.5-point lift and is statistically nothing. Expect most cells to land in
  "no measurable effect", and expect that to be the honest answer rather than a
  failure of the bench.
- If you want to detect effects in the 10–15 point range, raise `--trials`. The
  interval narrows roughly with √n, so 32 trials per cell — 960 trials, four
  times the cost — is the realistic setting for fine-grained comparisons.
- Watch mean rank as well as win rate. An edit can move the subject from a
  consistent 3rd to a consistent 2nd without ever winning, and that is a real
  effect on how the assistant reads the listing.

---

## What this design cannot tell you

- **One assistant, one model, one date.** Model updates move these numbers. A
  different assistant may rank differently. Nothing here generalises to "AI
  shoppers" as a class.
- **Synthetic listings.** They are built so each variant has headroom to change
  something, which makes effects easier to detect than on a real catalogue where
  a listing may already be well written. Effect sizes here are an upper bound,
  not a forecast.
- **Four listings, not forty.** Real search results are longer, and position
  effects at rank 20 are not modelled at all.
- **Two intents per category** cannot represent the distribution of shopper
  phrasing. An edit that wins on "won't dry out my kids' skin" may do nothing on
  a price-led query.
- **Recommendation ≠ purchase.** This measures what an assistant recommends, not
  what a human then buys. Nothing here connects the two.
- **8 trials per cell only detects large effects.** A real 10-point lift will
  usually land inside the noise band and be reported as no measurable effect.
  **Absence of a finding here is not evidence the edit does nothing.**
- **One edit at a time, by construction.** The design cannot see interactions —
  whether a specific title plus a complete spec table does more than the sum of
  the two is outside what a one-factor-at-a-time grid can answer.
- **It is a bench, not an audit.** It measures what a listing change does to a
  recommendation. It says nothing about whether making that change is truthful,
  and `v2_claim_specificity` in particular is only a legitimate edit when the
  specific claims are ones you can substantiate.

---

## Layout

```
prisma/schema.prisma        Categories, listings, materialised variants, runs, trials
prisma/seed.ts              Idempotent seed; validates data before writing
src/data/categories/*.ts    The 5 categories: 4 listings, 2 intents, 6 overrides each
src/data/variants.ts        Variant materialisation + authoring guards
src/lib/rng.ts              Seeded shuffle and balanced position assignment
src/lib/prompt.ts           System prompt, listing rendering, opaque product codes
src/lib/agent.ts            One LLM call, strict JSON parse, one corrective retry
src/lib/analysis.ts         Wilson, Newcombe lift, verdicts, edit priority
src/lib/analysis.test.ts    Unit tests for the above
src/lib/queries.ts          Read side; defaults to the latest finished run
scripts/run-trials.ts       The runner: cost per cell, resume-on-crash
scripts/report.ts           Run results as markdown
src/app/page.tsx            Dashboard: chart, table, edit priority, drill-down
src/app/methodology/page.tsx
```

**Stack**: Next.js 15 (App Router) + TypeScript, Tailwind, Recharts, PostgreSQL
via Prisma (Neon), Anthropic API, deployed on Vercel.

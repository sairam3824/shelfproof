# ShelfProof

An experiment bench that measures which product-listing edits make an AI
shopping assistant recommend a given SKU.

[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A522.18-brightgreen.svg)
![Next.js](https://img.shields.io/badge/next.js-15-black.svg)

**Stack** — Next.js 15 (App Router) · TypeScript · Tailwind · Recharts ·
PostgreSQL via Prisma · Anthropic API
**Licence** — [MIT](LICENSE)

```bash
npm install
cp .env.example .env          # add your Postgres + Anthropic credentials
npm run db:push               # create the schema
npm run db:seed               # load the listings
npm run dev                   # dashboard on http://localhost:3000
```

The dashboard is usable immediately: with no database it explains how to set one
up, with an empty schema it tells you to seed, and with no trials it tells you
how to execute the grid. To actually run the experiment, see
[Running it](#running-it) — or [`torun.txt`](torun.txt) for the full operational
runbook, including local PostgreSQL setup and troubleshooting.

---

## Contents

- [The question](#the-question)
- [The design](#the-design)
- [The dashboard](#the-dashboard)
- [Running it](#running-it)
- [Results](#results)
- [What this design cannot tell you](#what-this-design-cannot-tell-you)
- [Project layout](#project-layout)
- [Development](#development)
- [Licence](#licence)

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
[at the bottom of this file](#what-this-design-cannot-tell-you) and on
`/methodology`.

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

The variants are **materialised at seed time**, not computed at run time.
`src/data/variants.ts` validates the seed data before it is written: it fails
the seed if a variant is identical to control, if the "below median" price is
not actually below the median, if `v5` leaves a field blank or alters an
already-populated one, or if bullet / review / spec-key counts drift.

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
- **Balanced position assignment, within each intent.** Across the 8 trials in a
  cell the subject occupies each of the 4 slots exactly twice — and each of the 4
  slots exactly once *within each intent*. The per-intent part is what matters:
  indexing the slot on the trial number while intents alternate on the same
  counter looks balanced in aggregate but confounds the two, giving intent 0 only
  slots 1 and 3 and intent 1 only slots 2 and 4. The slot is therefore indexed by
  the trial's ordinal within its own intent, so position bias is removed by
  construction rather than in expectation. (`--order pure` reverts to textbook
  randomisation.)
- **Cell sizes are validated.** Balance needs a whole number of (intent × slot)
  blocks, so `--trials` must be a multiple of 4 × the intent count — 8, 16, 32
  for the standard 2 intents. The runner refuses anything else in balanced mode
  rather than silently producing a skewed design.
- **Order is held constant across variants.** The shuffle is seeded from
  `(category, trialIndex)` and deliberately excludes the variant, so at trial *k*
  all six variants see the identical arrangement. Lift is a difference between a
  variant and control, so position cancels out of that difference exactly.
- **The audit is in the product.** Win rate by presented slot is plotted per
  category and run-wide, so the claim above is checkable rather than asserted.
- **Every trial row is stored**: category, variant, intent, listing order,
  subject slot, chosen SKU, full ranking, reason text, latency, token counts,
  raw response, whether a parse retry was needed, and a content hash of the
  listing as it was rendered.

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
  effect"**, grouped separately from the ranked findings. A cell with too few
  valid trials to compute a lift at all is grouped separately again, as **"not
  measured"** — "we measured it and found nothing" and "we have no measurement"
  are different claims, and collapsing them would let a failed run present itself
  as a null result.
- **Mean rank** of the subject (1 best, 4 worst) with a standard error, because
  win rate cannot tell a narrow second place from a distant fourth.
- **Pooled across categories** on `/overview`. A 5 × 8 = 40-trial cell has an
  interval roughly half the width of an 8-trial one, which is the difference
  between detecting a 15-point effect and not.

`src/lib/analysis.test.ts` and `src/lib/rng.test.ts` cover this: Wilson against
published values, the 0/n and n/n edge cases, symmetry, lift sign and interval
behaviour, verdict boundaries, and the randomisation invariants. Run with
`npm test`.

---

## The dashboard

Three views, with one run selector in the header scoping all of them.

**`/` — category detail**

- Category selector, and a hero figure: the best measurable edit, an explicit
  "None" when nothing clears the noise band, or "No data" when the category has
  no valid trials at all.
- **Lift against control** — the measurement the bench exists for, as a diverging
  bar chart with the CI as whiskers and a zero rule. Bars whose interval spans
  zero are neutral grey, never a colour that reads as a result.
- **Win rate by variant**, control drawn as a reference line, error bars from the
  CI. Clicking a bar opens the drill-down.
- **Table**: win rate, CI, lift, lift CI, mean rank ± SE, verdict. Every number
  in the charts is reachable here — nothing is gated behind a tooltip.
- **Edit priority** in four groups: edits that measurably helped (ranked), edits
  that measurably *hurt* (kept separate so they are never read as a
  recommendation), the noise band, and cells that were never measured.
- **Randomisation audit** — win rate by presented slot. The design claims
  position bias is removed by construction; this plots whether it was.
- **Trial drill-down** — the agent's actual reasoning for the trials the subject
  won and lost, side by side, with slot and intent for each.

**`/overview` — cross-category rollup**

Pooled lift per edit across all five categories, plus a variant × category matrix
showing whether an edit helps everywhere or only in one contest.

**`/methodology`** — trial counts, randomisation, CI method, provenance,
limitations.

The web app never calls the LLM. It reads finished runs out of Postgres, and
defaults to the most recent **finished** run so a half-complete run in progress
cannot silently become "the result". Unfinished runs, and trials whose listing
text has been re-seeded since, are flagged in the UI rather than presented as
clean data.

---

## Running it

> Full operational detail, including local PostgreSQL installation and a
> troubleshooting section, is in **[`torun.txt`](torun.txt)**.

### Prerequisites

- **Node ≥ 22.18** — every script runs TypeScript directly through Node's native
  type stripping, which is only unflagged from that version. On Node 20 you get a
  confusing syntax error.
- **PostgreSQL 14+**, local or hosted.
- **An Anthropic API key** — needed only by the runner, not the dashboard.

### Database

Either works; nothing else in the project changes.

**Local (macOS):**

```bash
brew install postgresql@16
/opt/homebrew/opt/postgresql@16/bin/pg_ctl \
  -D /opt/homebrew/var/postgresql@16 \
  -l /opt/homebrew/var/log/postgresql@16.log start
/opt/homebrew/opt/postgresql@16/bin/createdb shelfproof
# DATABASE_URL=DIRECT_URL=postgresql://$USER@localhost:5432/shelfproof
```

**Hosted (Neon or similar):** put the pooled connection in `DATABASE_URL` and the
direct connection in `DIRECT_URL`. On a plain Postgres server, use the same URL
for both.

### Commands

```bash
npm install
cp .env.example .env

npm run db:push               # create the schema
npm run db:seed               # 20 listings, 30 subject variants, 10 intents

npm run trials -- --dry-run   # build all 240 prompts, call nothing — free
npm run trials                # 240 LLM calls, ~$1.40, ~5-10 min
npm run report                # results as markdown

npm run dev                   # dashboard on :3000
npm run check                 # typecheck + lint + unit tests
```

A cheaper first pass — one category, 48 trials, roughly $0.28:

```bash
npm run trials -- --categories instant-coffee
```

### Runner flags

| Flag | Effect |
| --- | --- |
| `--dry-run` | Build every prompt and print the grid, call nothing. |
| `--resume-latest` | Continue the most recent unfinished run. |
| `--resume <runId>` | Continue a specific run. |
| `--repair` | Re-run only the cells that failed with an API error. |
| `--categories a,b` | Restrict to some categories. |
| `--trials 16` | Trials per cell (default 8). In balanced mode it must be a multiple of 4 × the intent count — 8, 16, 32 with the standard 2 intents. |
| `--order pure` | Unconstrained randomisation instead of balanced. |
| `--concurrency 8` | Parallel API calls (default 4). |
| `--model <id>` | Model to run (default `$SHELFPROOF_MODEL`, else `claude-sonnet-4-6`). Must be in `PRICING` and `SUPPORTS_TEMPERATURE`. |
| `--temperature <n>` | Sampling temperature (default `$SHELFPROOF_TEMPERATURE`, else 0.7). |
| `--allow-unpriced` | Permit a model with no price table (cost reports `n/a`). |

### Operational guarantees

**Resume-on-crash.** Each trial is written the moment it returns, and a unique
constraint on `(run, category, variant, trialIndex)` lets the runner skip cells
already recorded. Kill it at trial 137 and `npm run trials -- --resume-latest`
picks up at 137 without re-billing the first 136. Resume refuses to continue a
run under a different model, temperature, cell size or order mode — every trial
in a run must share those four, or the run's own metadata describes only some of
its trials.

**Infrastructure failures are not measurements.** A rate limit or dropped
connection is recorded as `api_error` and re-run on the next pass; leaving it in
place would silently remove that trial from the denominator forever. Parse and
ranking failures are left alone — those are the model's actual behaviour and the
design counts them as data. `--repair` re-runs just the `api_error` cells of an
existing run, including a finished one, overwriting them in place.

**Model constraint.** The default is `claude-sonnet-4-6`. The design requires
`temperature` 0.7, and the current frontier models won't take it — Opus 5 removed
`temperature`/`top_p`/`top_k` entirely (400), and Sonnet 5 rejects any non-default
value. The runner checks this at startup and refuses such a model rather than
turning all 240 calls into `api_error` rows. To use a different model, add it to
both `PRICING` and `SUPPORTS_TEMPERATURE` in `src/lib/cost.ts`. An unpriced model
reports cost as `n/a` rather than a confident-looking `$0.0000`.

If you want to run this on a model without `temperature`, the honest fix is to
drop the parameter and let the model's own sampling supply the variance — **not**
to keep 240 identical prompts and pretend the trials are independent.

**Provenance.** Seeding is an upsert, so listing text can change after a run has
referenced it. Every trial stores the content hash of the subject listing as it
was rendered; the dashboard flags trials whose listing has since moved; and
`npm run db:seed` refuses to rewrite content that recorded trials depend on
unless `--force` is passed. The clean path after a content edit is a new run.

---

## Results

> **No successful run has been recorded in this checkout.** The bench is built,
> tested and wired to a database; one 48-trial run was attempted and failed
> authentication against the Anthropic API, so there are no measurements to
> report. Fix `ANTHROPIC_API_KEY` and run
> `npm run trials -- --repair` to complete it.
>
> `npm run trials && npm run report` emits this section as markdown, per
> category, straight from the trial rows. Paste it here. Do not hand-transcribe
> it from the dashboard, and do not report a cell whose lift interval contains
> zero as a finding — `report` already marks those as "no measurable effect".

What to expect when you do run it, so the output is not misread:

- **At 8 trials per cell the noise band is wide.** A 5/8 versus 4/8 split looks
  like a 12.5-point lift and is statistically nothing. Expect most cells to land
  in "no measurable effect", and expect that to be the honest answer rather than
  a failure of the bench.
- **To detect 10–15 point effects, raise `--trials`.** The interval narrows
  roughly with √n, so 32 trials per cell — 960 trials, four times the cost — is
  the realistic setting for fine-grained comparisons. `/overview` pools across
  categories and gets some of this for free.
- **Watch mean rank as well as win rate.** An edit can move the subject from a
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

## Project layout

```
prisma/schema.prisma        Categories, listings, materialised variants, runs, trials
prisma/seed.ts              Idempotent seed; validates data and guards provenance
src/data/index.ts           Category registry
src/data/categories/*.ts    The 5 categories: 4 listings, 2 intents, 6 overrides each
src/data/variants.ts        Variant materialisation + authoring guards
src/lib/types.ts            Shared types, the variant list, variant labels
src/lib/db.ts               Prisma client singleton
src/lib/rng.ts              Seeded shuffle, per-intent balanced position assignment
src/lib/rng.test.ts         Tests for the balancing and variant-invariance invariants
src/lib/prompt.ts           System prompt, listing rendering, opaque product codes
src/lib/agent.ts            One LLM call, strict JSON parse, one corrective retry
src/lib/cost.ts             Price table, temperature-support gate, cost formatting
src/lib/content-hash.ts     Listing hashing for trial provenance
src/lib/analysis.ts         Wilson, Newcombe lift, verdicts, priority, pooling, position
src/lib/analysis.test.ts    Unit tests for the above
src/lib/queries.ts          Read side; db health, run scoping, pooled + position views
scripts/run-trials.ts       The runner: cost per cell, resume-on-crash, --repair
scripts/report.ts           Run results as markdown
src/app/layout.tsx          App shell: nav, run picker, footer
src/app/page.tsx            Category detail: hero, lift, win rate, table, drill-down
src/app/overview/page.tsx   Cross-category rollup: pooled lift, per-category matrix
src/app/methodology/page.tsx
src/app/components/         LiftChart, WinRateChart, PositionChart, Nav, UI primitives
torun.txt                   Operational runbook: setup, commands, troubleshooting
LICENSE                     MIT licence
```

---

## Development

```bash
npm run check        # typecheck + lint + unit tests — run before committing
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # unit tests
npm run db:studio    # browse the database
```

The unit tests cover the statistics and the randomisation invariants — the two
places where a silent error would produce plausible-looking but wrong findings.
They need no database and no API key.

---

## Licence

Released under the **MIT Licence** — see [`LICENSE`](LICENSE) for the full text.

Copyright © 2026 Maruri Sai Rama Linga Reddy.

You may use, copy, modify, merge, publish, distribute, sublicense and sell
copies of this software, provided the copyright notice and the licence text are
included in all copies or substantial portions. The software is provided "as
is", without warranty of any kind.

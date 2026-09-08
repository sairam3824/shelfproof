import { dbHealth, listRuns } from "../../lib/queries.ts";
import { Code, EmptyState, SectionHeading } from "../components/ui.tsx";

export const dynamic = "force-dynamic";

function Section({
  title,
  children,
  note,
}: {
  title: string;
  children: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <section className="card mt-5 p-6">
      <SectionHeading title={title} note={note} />
      <div className="secondary mt-3 space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default async function Methodology() {
  const health = await dbHealth();
  const runs = health.ok
    ? await listRuns().then((r) => r.slice(0, 8))
    : [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Methodology</h1>
      <p className="secondary mt-1 max-w-prose text-sm">
        What this bench measures, how it controls for the obvious confounds, and where it stops
        being able to tell you anything.
      </p>

      <Section title="The question">
        <p>
          Given a product listing and three fixed competitors, which single edit to that listing
          most increases the chance an LLM shopping assistant recommends it? Each edit is applied
          in isolation, so the answer is attributable to one change rather than to a redesign.
        </p>
      </Section>

      <Section title="Trial counts">
        <p>
          5 categories × 6 variants × 8 trials = <strong>240 trials</strong> per run. Each trial
          is one LLM call. Nothing is cached: identical prompts are re-sent and re-billed,
          because a cache would collapse the variance the design depends on.
        </p>
        <p>
          Within each cell of 8, the 2 shopper intents alternate, so every variant is tested 4
          times against each intent.
        </p>
      </Section>

      <Section
        title="Randomisation and position control"
        note="Position bias is the largest confound in this design — an LLM shown four listings does not weigh them equally by slot."
      >
        <ul className="ml-4 list-disc space-y-3">
          <li>
            <strong>Position is balanced within each intent.</strong> Across the 8 trials in a
            cell the subject occupies each of the 4 slots exactly twice — and, more importantly,
            each of the 4 slots exactly once <em>within each intent</em>. Balancing only across
            the cell is not enough: if slot were indexed on the trial number while intents
            alternate on the same counter, intent 0 would only ever see the subject in slots 1
            and 3 and intent 1 only in slots 2 and 4, and every per-intent reading would be
            measuring intent and position together. The slot is therefore indexed by the
            trial&rsquo;s ordinal <em>within its own intent</em>.
          </li>
          <li>
            <strong>Cell sizes are checked, not assumed.</strong> Balance needs a whole number of
            (intent × slot) blocks, so trials per cell must be a multiple of 4 × the intent
            count — 8, 16, 32 for the standard 2 intents. The runner refuses any other{" "}
            <Code>--trials</Code> value in balanced mode rather than silently producing a skewed
            design.
          </li>
          <li>
            <strong>Order is held constant across variants.</strong> The shuffle is seeded from
            (category, trial index) and deliberately excludes the variant, so at trial{" "}
            <em>k</em> all six variants see the identical arrangement. Lift is a difference
            between a variant and control, so position cancels out of that difference exactly.
          </li>
          <li>
            <strong>Products are identified by an opaque code</strong> (e.g. <Code>P4821</Code>),
            not by SKU and not by slot letter. A SKU would leak the brand into every listing
            regardless of the title, undermining the title variant; a slot letter would encode
            position into the answer, undermining the shuffle.
          </li>
        </ul>
        <p>
          The presented order and the subject&rsquo;s slot are stored on every trial row, and the
          dashboard plots win rate by slot so the claim above is checkable rather than merely
          asserted.
        </p>
      </Section>

      <Section title="Sampling">
        <p>
          <strong>temperature 0.7</strong>, extended thinking disabled, max 1024 output tokens.
          Repeated trials vary because sampling is stochastic; the trial index is stored on every
          row and is the seed for that trial&rsquo;s listing order, so the arrangement is
          reproducible even though the model&rsquo;s answer is not.
        </p>
        <p>
          The design therefore requires a model that still accepts a sampling parameter. Models
          that have removed <Code>temperature</Code> are rejected by the runner at startup rather
          than failing 240 times, one call at a time. The honest fix for such a model is to drop
          the parameter and let the model&rsquo;s own sampling supply the variance — not to send
          240 identical prompts and call the results independent.
        </p>
      </Section>

      <Section title="Validity">
        <p>
          The agent must return strict JSON with <Code>chosen_sku</Code>, <Code>ranking</Code> and{" "}
          <Code>reason</Code>. A response is rejected if it fails to parse, names a product not on
          the page, or returns a ranking that is not a permutation of the four codes. One
          corrective retry is issued; a second failure records the trial as invalid with its
          cause. Invalid trials are excluded from the denominator — never counted as losses.
        </p>
        <p>
          <strong>Infrastructure failures are not measurements.</strong> A rate limit or a dropped
          connection is recorded as <Code>api_error</Code> and re-run on the next pass, because
          leaving it in place would silently remove that trial from the denominator forever. Parse
          and ranking failures are left alone — those are the model&rsquo;s actual behaviour, and
          the design counts them as data.
        </p>
      </Section>

      <Section title="Confidence intervals">
        <p>
          Win rates carry a <strong>Wilson score interval</strong> at 95%. Wilson rather than the
          normal approximation because cells are small (n=8) and win rates frequently hit 0 or 1,
          where the normal interval collapses to zero width and would assert certainty that does
          not exist.
        </p>
        <p>
          Lift is the variant win rate minus the control win rate in the same category. Its
          interval is <strong>Newcombe&rsquo;s score interval for the difference of two
          proportions</strong>, composed from the two Wilson intervals. Simply subtracting the raw
          Wilson bounds would give a far too wide interval and would under-report real effects.
        </p>
        <p>
          <strong>Any lift whose 95% interval contains zero is reported as &ldquo;no measurable
          effect&rdquo;</strong> and is grouped separately from the ranked findings. At 8 trials
          per cell this band is wide: a 5/8 versus 4/8 split looks like a 12.5-point lift and is
          statistically nothing. The Overview pools all five categories per variant, which is
          where the design has enough power to see mid-sized effects.
        </p>
      </Section>

      <Section title="Mean rank">
        <p>
          Win rate is lossy — it cannot tell a narrow second place from a distant fourth. Mean
          rank of the subject across valid trials (1 = best, 4 = worst) is reported alongside it,
          with a standard error. An edit can move mean rank without moving win rate, and that is
          still a real effect on how the assistant reads the listing.
        </p>
      </Section>

      <Section
        title="Provenance"
        note="Seeding is an upsert, so listing text can change after a run has referenced it."
      >
        <p>
          Every trial stores the content hash of the subject listing as it was rendered for that
          trial. If a listing is later re-seeded with different text, the stored hash no longer
          matches and the dashboard flags those trials as stale instead of presenting the current
          text as what the agent read. The seed script also refuses to rewrite content that
          recorded trials depend on unless <Code>--force</Code> is passed.
        </p>
      </Section>

      {runs.length > 0 && (
        <section className="card mt-5">
          <div className="p-6 pb-0">
            <SectionHeading title="Runs" />
          </div>
          <div className="scroll-x mt-4">
            <table className="grid-table min-w-[560px]">
              <thead>
                <tr>
                  <th scope="col">Started</th>
                  <th scope="col">Model</th>
                  <th scope="col" className="num">
                    Temp
                  </th>
                  <th scope="col" className="num">
                    Cell
                  </th>
                  <th scope="col" className="num">
                    Trials
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="tnum">
                      {r.startedAt.toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="tnum">{r.model}</td>
                    <td className="num">{r.temperature ?? "n/a"}</td>
                    <td className="num">{r.trialsPerCell}</td>
                    <td className="num">{r._count.trials}</td>
                    <td className="secondary">{r.finishedAt ? "complete" : "unfinished"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!health.ok && (
        <div className="mt-5">
          <EmptyState
            title="Run history unavailable."
            body="The database is unreachable, so past runs cannot be listed. Everything above describes the design regardless."
            hint={<Code>npm run db:push</Code>}
          />
        </div>
      )}

      <Section title="What this design cannot tell you">
        <ul className="ml-4 list-disc space-y-2">
          <li>
            It measures one assistant, at one temperature, on one date. Model updates move these
            numbers, and a different assistant may rank differently.
          </li>
          <li>
            Listings are synthetic. They are built so each variant has headroom to change
            something, which makes effects easier to detect than on a real catalogue where a
            listing may already be well written.
          </li>
          <li>
            Four listings, not forty. Real search results are longer, and position effects at
            rank 20 are not modelled here at all.
          </li>
          <li>Two intents per category cannot represent the full distribution of shopper phrasing.</li>
          <li>
            Each variant changes exactly one field-group, so nothing here says whether two edits
            interact.
          </li>
          <li>
            It measures what the assistant recommends, not what a human then buys. Those are
            different outcomes and nothing here connects them.
          </li>
          <li>
            8 trials per cell only detects large effects. A real 10-point lift will usually land
            inside the noise band and be reported as no measurable effect — absence of a finding
            here is not evidence the edit does nothing.
          </li>
        </ul>
      </Section>
    </main>
  );
}

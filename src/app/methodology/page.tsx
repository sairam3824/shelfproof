import Link from "next/link";
import { prisma } from "../../lib/db.ts";

export const dynamic = "force-dynamic";

export default async function Methodology() {
  const runs = await prisma.run.findMany({
    orderBy: { startedAt: "desc" },
    include: { _count: { select: { trials: true } } },
    take: 5,
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="muted text-xs underline underline-offset-2">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Methodology</h1>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium">The question</h2>
        <p className="secondary text-sm">
          Given a product listing and three fixed competitors, which single edit to that listing
          most increases the chance an LLM shopping assistant recommends it? Each edit is applied
          in isolation so the answer is attributable to one change rather than a redesign.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium">Trial counts</h2>
        <p className="secondary text-sm">
          5 categories × 6 variants × 8 trials = <strong>240 trials</strong> per run. Each trial is
          one LLM call. Nothing is cached: identical prompts are re-sent and re-billed, because a
          cache would collapse the variance the design depends on.
        </p>
        <p className="secondary text-sm">
          Within each cell of 8 trials, the 2 shopper intents alternate, so every variant is tested
          4 times against each intent.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium">Randomisation and position control</h2>
        <p className="secondary text-sm">
          Position bias is the largest confound in this design — an LLM shown four listings does not
          weigh them equally by slot. Two controls address it:
        </p>
        <ul className="secondary list-disc space-y-2 pl-5 text-sm">
          <li>
            <strong>Balanced position assignment.</strong> Across the 8 trials in a cell, the
            subject occupies each of the 4 positions exactly twice. This removes position bias by
            construction. Pure randomisation removes it only in expectation, and at n=8 a fair
            shuffle can easily deal the subject the first slot five times — noise that would land
            directly on the measured win rate. (Pass <code>--order pure</code> to the runner for
            unconstrained randomisation instead.)
          </li>
          <li>
            <strong>Order is held constant across variants.</strong> The shuffle is seeded from
            (category, trial index) and deliberately excludes the variant, so at trial <em>k</em>{" "}
            all six variants see the identical arrangement. Lift is a difference between a variant
            and control, so position cancels out of that difference exactly.
          </li>
          <li>
            Products are identified to the agent by a stable opaque code (e.g. <code>P4821</code>),
            not by SKU and not by slot letter. A SKU would leak the brand into every listing
            regardless of the title, undermining the title variant; a slot letter would encode
            position into the answer, undermining the shuffle.
          </li>
        </ul>
        <p className="secondary text-sm">
          The presented order and the subject&rsquo;s position are stored on every trial row, so any
          result can be re-checked against position after the fact.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium">Sampling</h2>
        <p className="secondary text-sm">
          <strong>temperature 0.7</strong>, extended thinking disabled, max 1024 output tokens.
          Repeated trials vary because sampling is stochastic; the trial index is stored on every
          row and is the seed for that trial&rsquo;s listing order, so the arrangement is
          reproducible even though the model&rsquo;s answer is not.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium">Validity</h2>
        <p className="secondary text-sm">
          The agent must return strict JSON with <code>chosen_sku</code>, <code>ranking</code> and{" "}
          <code>reason</code>. A response is rejected if it fails to parse, names a product not on
          the page, or returns a ranking that is not a permutation of the four codes. One corrective
          retry is issued; a second failure records the trial as invalid with its cause. Invalid
          trials are excluded from the denominator — never counted as losses.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium">Confidence intervals</h2>
        <p className="secondary text-sm">
          Win rates carry a <strong>Wilson score interval</strong> at 95%. Wilson is used rather
          than the normal approximation because cells are small (n=8) and win rates frequently hit 0
          or 1, where the normal interval collapses to zero width and would assert certainty that
          does not exist.
        </p>
        <p className="secondary text-sm">
          Lift is the variant win rate minus the control win rate in the same category. Its interval
          is <strong>Newcombe&rsquo;s score interval for the difference of two proportions</strong>,
          composed from the two Wilson intervals. Simply subtracting the raw Wilson bounds would
          give a far too wide interval and would under-report real effects.
        </p>
        <p className="secondary text-sm">
          <strong>Any lift whose 95% interval contains zero is reported as &ldquo;no measurable
          effect&rdquo;</strong> and is grouped separately from the ranked findings. At 8 trials per
          cell this band is wide: a 5/8 versus 4/8 split looks like a 12.5-point lift and is
          statistically nothing.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium">Mean rank</h2>
        <p className="secondary text-sm">
          Win rate is lossy — it cannot tell a narrow second place from a distant fourth. Mean rank
          of the subject across valid trials (1 = best, 4 = worst) is reported alongside it, with a
          standard error. An edit can move mean rank without moving win rate, and that is still a
          real effect on how the assistant reads the listing.
        </p>
      </section>

      {runs.length > 0 && (
        <section className="mt-8 space-y-3">
          <h2 className="text-sm font-medium">Runs</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="secondary border-b text-left" style={{ borderColor: "var(--hairline)" }}>
                <th className="py-2 font-medium">Started</th>
                <th className="py-2 font-medium">Model</th>
                <th className="py-2 text-right font-medium">Temp</th>
                <th className="py-2 text-right font-medium">Trials</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b last:border-0" style={{ borderColor: "var(--hairline)" }}>
                  <td className="tnum py-2">{r.startedAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td className="py-2">{r.model}</td>
                  <td className="tnum py-2 text-right">{r.temperature}</td>
                  <td className="tnum py-2 text-right">{r._count.trials}</td>
                  <td className="secondary py-2">{r.finishedAt ? "complete" : "unfinished"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium">What this design cannot tell you</h2>
        <ul className="secondary list-disc space-y-2 pl-5 text-sm">
          <li>
            It measures one assistant, at one temperature, on one date. Model updates move these
            numbers, and a different assistant may rank differently.
          </li>
          <li>
            Listings are synthetic. They are built so each variant has headroom to change something,
            which makes effects easier to detect than on a real catalogue where a listing may
            already be well written.
          </li>
          <li>
            Four listings, not forty. Real search results are longer, and position effects at rank
            20 are not modelled here at all.
          </li>
          <li>
            Two intents per category cannot represent the full distribution of shopper phrasing.
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
      </section>
    </main>
  );
}

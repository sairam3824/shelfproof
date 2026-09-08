/** USD per million tokens, first-party Anthropic API list prices. */
export const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  // Standard rate. Sonnet 5 has introductory pricing of $2/$10 through
  // 2026-08-31, so a run before then is billed less than this reports.
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-fable-5": { input: 10, output: 50 },
};

/**
 * Models that still accept a `temperature` parameter.
 *
 * This experiment needs stochastic sampling: 8 trials per cell are only
 * independent draws if the model can vary its answer. Sampling parameters were
 * removed across the Claude 5 generation — Opus 5 rejects `temperature`
 * outright with a 400, and Sonnet 5 rejects any non-default value. Sending one
 * anyway turns all 240 calls into api_error rows, which is why the runner
 * checks this set at startup rather than discovering it 240 failures later.
 *
 * A model absent from PRICING is unknown to us and cannot be vetted either
 * way; the runner refuses those too unless --allow-unpriced is passed.
 */
export const SUPPORTS_TEMPERATURE = new Set([
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-haiku-4-5",
]);

export type TemperatureSupport = "yes" | "no" | "unknown";

export function temperatureSupport(model: string): TemperatureSupport {
  if (SUPPORTS_TEMPERATURE.has(model)) return "yes";
  if (PRICING[model]) return "no";
  return "unknown";
}

/** null when the model has no price table — an unknown cost, not a zero one. */
export function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const p = PRICING[model];
  if (!p) return null;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export function fmtUsd(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "n/a";
  return "$" + n.toFixed(n < 1 ? 4 : 2);
}

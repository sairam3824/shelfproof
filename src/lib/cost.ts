/** USD per million tokens, first-party Anthropic API list prices. */
export const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  // Standard rate. Sonnet 5 has introductory pricing of $2/$10 through
  // 2026-08-31, so a run before then is billed less than this reports.
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model];
  if (!p) return 0; // unknown model — report 0 rather than a wrong number
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export function fmtUsd(n: number): string {
  return "$" + n.toFixed(n < 1 ? 4 : 2);
}

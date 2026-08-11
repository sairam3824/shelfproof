import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./prompt.ts";

export type AgentAnswer = {
  chosenCode: string | null;
  ranking: string[];
  reason: string | null;
  raw: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  parseRetried: boolean;
  /** null when the answer is usable */
  invalidCause: "parse_failure" | "missing_sku" | "bad_ranking" | "api_error" | null;
};

const client = new Anthropic();

/** Pull a JSON object out of a response that may be fenced or have stray prose. */
function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function validate(
  parsed: unknown,
  validCodes: string[],
): { ok: true; chosen: string; ranking: string[]; reason: string } | { ok: false; cause: "parse_failure" | "missing_sku" | "bad_ranking" } {
  if (!parsed || typeof parsed !== "object") return { ok: false, cause: "parse_failure" };
  const o = parsed as Record<string, unknown>;

  const chosen = typeof o.chosen_sku === "string" ? o.chosen_sku.trim() : null;
  const reason = typeof o.reason === "string" ? o.reason : "";
  const ranking = Array.isArray(o.ranking)
    ? o.ranking.filter((r): r is string => typeof r === "string").map((r) => r.trim())
    : null;

  if (!chosen || !ranking) return { ok: false, cause: "parse_failure" };
  if (!validCodes.includes(chosen)) return { ok: false, cause: "missing_sku" };

  // ranking must be a permutation of the presented codes
  const sortedGot = [...ranking].sort().join(",");
  const sortedWant = [...validCodes].sort().join(",");
  if (ranking.length !== validCodes.length || sortedGot !== sortedWant) {
    return { ok: false, cause: "bad_ranking" };
  }

  return { ok: true, chosen, ranking, reason };
}

export async function askAgent(opts: {
  model: string;
  temperature: number;
  maxTokens: number;
  userPrompt: string;
  validCodes: string[];
}): Promise<AgentAnswer> {
  const started = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let raw = "";
  let parseRetried = false;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.userPrompt }];

  // Two attempts: the initial call, then one corrective retry on a bad parse.
  for (let attempt = 0; attempt < 2; attempt++) {
    let text = "";
    try {
      const res = await client.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        thinking: { type: "disabled" },
        system: SYSTEM_PROMPT,
        messages,
      });
      inputTokens += res.usage.input_tokens;
      outputTokens += res.usage.output_tokens;
      for (const block of res.content) {
        if (block.type === "text") text += block.text;
      }
    } catch (err) {
      return {
        chosenCode: null,
        ranking: [],
        reason: null,
        raw: raw + `\n[api_error] ${err instanceof Error ? err.message : String(err)}`,
        latencyMs: Date.now() - started,
        inputTokens,
        outputTokens,
        parseRetried,
        invalidCause: "api_error",
      };
    }

    raw = text;
    const result = validate(extractJson(text), opts.validCodes);

    if (result.ok) {
      return {
        chosenCode: result.chosen,
        ranking: result.ranking,
        reason: result.reason,
        raw,
        latencyMs: Date.now() - started,
        inputTokens,
        outputTokens,
        parseRetried,
        invalidCause: null,
      };
    }

    if (attempt === 0) {
      parseRetried = true;
      messages.push({ role: "assistant", content: text || "(empty)" });
      messages.push({
        role: "user",
        content:
          `That response could not be used (${result.cause}). Reply with only a JSON object, no code fences and no other text, with keys "chosen_sku", "ranking" and "reason". ` +
          `"ranking" must contain each of these product codes exactly once: ${opts.validCodes.join(", ")}. "chosen_sku" must be one of them.`,
      });
      continue;
    }

    // Second failure — record it and move on. The spec is explicit that we do
    // not keep retrying; an invalid trial is data, not something to paper over.
    return {
      chosenCode: null,
      ranking: [],
      reason: null,
      raw,
      latencyMs: Date.now() - started,
      inputTokens,
      outputTokens,
      parseRetried,
      invalidCause: result.cause,
    };
  }

  throw new Error("unreachable");
}

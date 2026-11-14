/**
 * The models that can write coaching tips (EDU-57), with their prices, and
 * one writer per provider. Only models on this list are accepted, so the
 * monthly budget is always worked out at a known price. A provider is
 * offered only when its key is set (ANTHROPIC_API_KEY, OPENAI_API_KEY).
 *
 * Prices are the providers' list prices per million tokens, standard tier,
 * short prompts (checked 2026-11-13: Anthropic's model table, and
 * developers.openai.com/api/docs/pricing). The cheapest model of each
 * provider is its default (owner decision).
 */
import Anthropic, { APIConnectionError as AnthropicConnectionError, APIError as AnthropicError } from "@anthropic-ai/sdk";
import OpenAI, { APIConnectionError as OpenAIConnectionError, APIError as OpenAIError } from "openai";

export type AiProvider = "anthropic" | "openai";

export interface AiModel {
  id: string;
  provider: AiProvider;
  label: string;
  /** Dollars per million tokens. */
  inputPerMillion: number;
  outputPerMillion: number;
}

/** Cheapest first within each provider; the first of each is its default. */
export const AI_MODELS: readonly AiModel[] = [
  { id: "claude-haiku-5-5", provider: "anthropic", label: "Claude Haiku 5.5", inputPerMillion: 0.1, outputPerMillion: 0.5 },
  { id: "claude-sonnet-5-5", provider: "anthropic", label: "Claude Sonnet 5.5", inputPerMillion: 2, outputPerMillion: 10 },
  { id: "claude-opus-5-5", provider: "anthropic", label: "Claude Opus 5.5", inputPerMillion: 4, outputPerMillion: 20 },
  { id: "gpt-6-luna", provider: "openai", label: "GPT-6 Luna", inputPerMillion: 0.1, outputPerMillion: 0.5 },
  { id: "gpt-6.1-terra", provider: "openai", label: "GPT-6.1 Terra", inputPerMillion: 1, outputPerMillion: 5 },
  { id: "gpt-6.1-sol", provider: "openai", label: "GPT-6.1 Sol", inputPerMillion: 2, outputPerMillion: 10 },
  { id: "gpt-6-astra", provider: "openai", label: "GPT-6 Astra", inputPerMillion: 10, outputPerMillion: 50 },
];

export const providerReady = (env: Env, provider: AiProvider) =>
  Boolean(provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY);

/** The models whose provider has a key, in list order. */
export const availableModels = (env: Env) => AI_MODELS.filter((m) => providerReady(env, m.provider));

export const findModel = (id: string) => AI_MODELS.find((m) => m.id === id);

/** Cost in millionths of a dollar, rounded up. Reasoning tokens are billed as output on both providers. */
export const costMicros = (model: AiModel, inputTokens: number, outputTokens: number) =>
  Math.ceil(inputTokens * model.inputPerMillion + outputTokens * model.outputPerMillion);

/** A rough cost per tip for the picker: about 2,500 tokens in and 1,500 out, reasoning included. */
export const approxCostPerTip = (model: AiModel) => costMicros(model, 2_500, 1_500) / 1_000_000;

export interface Insight {
  headline: string;
  tips: { title: string; detail: string }[];
  encouragement: string;
}

/** A call that cost money but produced nothing to show. */
export class InsightError extends Error {
  /** Millionths of a dollar the failed call cost. */
  readonly costMicros: number;
  constructor(message: string, spent: number) {
    super(message);
    this.costMicros = spent;
  }
}

/** What the model must return: enforced by both APIs (strict JSON schema) and checked again here. */
/**
 * Why a call for tips failed, in plain words for the drummer (and the owner,
 * who reads the same message): the provider's HTTP status says whether it's
 * the app's key, the account's credit, the model, or a busy service. The full
 * error still goes to the Worker log.
 */
export function failureReason(error: unknown): string {
  if (error instanceof InsightError) return "the AI didn't give a usable answer. Try again.";
  if (error instanceof AnthropicConnectionError || error instanceof OpenAIConnectionError) {
    return "the app couldn't reach the AI service. Try again in a little while.";
  }
  if (error instanceof AnthropicError || error instanceof OpenAIError) {
    const status = error.status ?? 0;
    if (status === 401) return "the AI service rejected the app's API key.";
    if (status === 403) return "the app's API key isn't allowed to use this model.";
    if (status === 404) return "this model isn't available to the app's AI account.";
    if (status === 400 && /credit|billing|balance/i.test(error.message)) return "the app's AI account is out of credit.";
    if (status === 400) return "the AI service refused the request.";
    if (status === 429) return "the AI service is limiting requests right now. Try again in a minute.";
    if (status >= 500) return "the AI service is busy right now. Try again in a little while.";
  }
  return "something went wrong. Try again in a little while.";
}

export const INSIGHT_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "One sentence: the most useful thing to know right now." },
    tips: {
      type: "array",
      description: "Two to four concrete things to practice next, most important first.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "A short imperative, e.g. 'Slow the snare down'." },
          detail: { type: "string", description: "Two or three sentences: what to do, at what tempo, and why." },
        },
        required: ["title", "detail"],
        additionalProperties: false,
      },
    },
    encouragement: { type: "string", description: "One honest, specific sentence of encouragement." },
  },
  required: ["headline", "tips", "encouragement"],
  additionalProperties: false,
} as const;

export const SYSTEM = `You are a patient drum teacher looking at a beginner's practice stats from an electronic drum kit app.
The student is very new to drums. Use plain words; explain any drum term you use.
Base every tip on the numbers you're given; don't invent sessions, exercises or results that aren't there.
Timing: a negative lean means early (rushing), positive means late (dragging); "spread" is how much the timing varies.
Strength is MIDI velocity, 1 (softest) to 127.
Give two to four tips, most useful first, each with a concrete exercise or tempo where you can.
If there's too little data to say much, say so kindly and suggest what to practice to get useful feedback.`;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

export function parseInsight(text: string): Insight | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(value) || typeof value.headline !== "string" || typeof value.encouragement !== "string") return null;
  if (!Array.isArray(value.tips)) return null;
  const tips = value.tips
    .filter((t): t is { title: string; detail: string } => isObject(t) && typeof t.title === "string" && typeof t.detail === "string")
    .slice(0, 4)
    .map((t) => ({ title: t.title, detail: t.detail }));
  if (tips.length === 0) return null;
  return { headline: value.headline, tips, encouragement: value.encouragement };
}

/** Writes one insight with the given model. Replaceable in tests. */
export type WriteInsight = (env: Env, model: AiModel, summary: string) => Promise<{ insight: Insight; costMicros: number }>;

const userMessage = (summary: string) => `Here are my practice stats (JSON):\n${summary}`;

async function writeWithClaude(env: Env, model: AiModel, summary: string) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const request = {
    model: model.id,
    max_tokens: 16000,
    // Medium effort, set explicitly (Haiku and Opus default to it; Sonnet defaults higher). Tips from a few numbers don't need more.
    output_config: { effort: "medium" as const, format: { type: "json_schema" as const, schema: INSIGHT_SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user" as const, content: userMessage(summary) }],
  };
  // Sonnet and Opus can fall back to a suitable model when a safety classifier declines; Haiku 5.5 can't.
  const response =
    model.id === "claude-haiku-5-5"
      ? await client.messages.create(request)
      : await client.beta.messages.create({ ...request, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  const cost = costMicros(model, response.usage.input_tokens, response.usage.output_tokens);
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    throw new InsightError(`No usable answer (${response.stop_reason})`, cost);
  }
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const insight = parseInsight(text);
  if (!insight) throw new InsightError("Answer didn't match the expected shape", cost);
  return { insight, costMicros: cost };
}

async function writeWithOpenAI(env: Env, model: AiModel, summary: string) {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: model.id,
    max_output_tokens: 16000,
    instructions: SYSTEM,
    input: userMessage(summary),
    text: { format: { type: "json_schema", name: "coaching_tips", schema: INSIGHT_SCHEMA, strict: true } },
  });
  const cost = response.usage ? costMicros(model, response.usage.input_tokens, response.usage.output_tokens) : 0;
  if (response.status === "incomplete") throw new InsightError(`No usable answer (${response.incomplete_details?.reason ?? "incomplete"})`, cost);
  // A refusal comes back as its own content item instead of text matching the schema.
  const refused = response.output.some((item) => item.type === "message" && item.content.some((c) => c.type === "refusal"));
  if (refused) throw new InsightError("No usable answer (refusal)", cost);
  const insight = parseInsight(response.output_text);
  if (!insight) throw new InsightError("Answer didn't match the expected shape", cost);
  return { insight, costMicros: cost };
}

export const writeInsight: WriteInsight = (env, model, summary) =>
  model.provider === "anthropic" ? writeWithClaude(env, model, summary) : writeWithOpenAI(env, model, summary);

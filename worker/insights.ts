/**
 * AI practice insights, for allow-listed accounts only (AI_ALLOWED, e.g.
 * "github:123,google:456"). The browser sends a summary of the practice
 * stats it already computes (no raw hits, no names); Claude turns it into a
 * few plain-language tips for a beginner drummer.
 *
 * Spending is bounded three ways: at most DAILY_LIMIT new insights per
 * account per day, a monthly budget across everyone (MONTHLY_BUDGET_MICROS,
 * from each call's token usage), and a cache: the same summary on the same
 * day returns the stored insight without calling Claude.
 */
import Anthropic from "@anthropic-ai/sdk";
import { sha256Hex } from "./auth/crypto";
import { json, problem } from "./http";
import { checkSpendAlerts, monthStart } from "./alerts";

/** The cheapest Claude model by default (owner decision, 2026-11-13); EDU-57 adds a choice. */
export const MODEL = "claude-haiku-5-5";
export const DAILY_LIMIT = 5;
/** $5 a month (owner decision, 2026-11-12). */
export const MONTHLY_BUDGET_MICROS = 5_000_000;
/** Claude Haiku 5.5 list prices for prompts under 100K tokens ($0.10 and $0.50 per million), in millionths of a dollar per token. */
const INPUT_MICROS_PER_TOKEN = 0.1;
const OUTPUT_MICROS_PER_TOKEN = 0.5;
const SUMMARY_MAX_BYTES = 20_000;

export interface Insight {
  headline: string;
  tips: { title: string; detail: string }[];
  encouragement: string;
}

/** What the model must return: checked by the API (structured outputs) and again here. */
const INSIGHT_SCHEMA = {
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

const SYSTEM = `You are a patient drum teacher looking at a beginner's practice stats from an electronic drum kit app.
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

/** Whether this user may use insights: one of their sign-ins is on the allow-list. */
export async function insightsAllowed(env: Env, userId: string): Promise<boolean> {
  const allowed = new Set(
    (env.AI_ALLOWED ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (allowed.size === 0 || !env.ANTHROPIC_API_KEY) return false;
  const { results } = await env.DB.prepare("SELECT provider, subject FROM identities WHERE user_id = ?")
    .bind(userId)
    .all<{ provider: string; subject: string }>();
  return results.some((r) => allowed.has(`${r.provider}:${r.subject}`));
}

/** Calls Claude for one insight. Replaceable in tests. */
export type WriteInsight = (env: Env, summary: string) => Promise<{ insight: Insight; costMicros: number }>;

export const writeWithClaude: WriteInsight = async (env, summary) => {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  // Haiku 5.5 has no server-side refusal fallback; a refusal is reported as a failure below.
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // Haiku 5.5 defaults to medium effort (set explicitly); tips from a few numbers don't need more.
    output_config: { effort: "medium", format: { type: "json_schema", schema: INSIGHT_SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: `Here are my practice stats (JSON):\n${summary}` }],
  });
  const { input_tokens, output_tokens } = response.usage;
  // Rounded up to whole millionths of a dollar.
  const costMicros = Math.ceil(input_tokens * INPUT_MICROS_PER_TOKEN + output_tokens * OUTPUT_MICROS_PER_TOKEN);
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    throw new InsightError(`No usable answer (${response.stop_reason})`, costMicros);
  }
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const insight = parseInsight(text);
  if (!insight) throw new InsightError("Answer didn't match the expected shape", costMicros);
  return { insight, costMicros };
};

/** A call that cost money but produced nothing to show. */
export class InsightError extends Error {
  constructor(
    message: string,
    readonly costMicros: number,
  ) {
    super(message);
  }
}

/** GET /api/insights: the latest insight and today's remaining count, or 404 when not allowed. */
export async function latestInsight(_request: Request, env: Env, userId: string, now = new Date()): Promise<Response> {
  if (!(await insightsAllowed(env, userId))) return problem(404, "not-found", "No such API route.");
  const row = await env.DB.prepare("SELECT body, created_at FROM insights WHERE user_id = ? ORDER BY id DESC LIMIT 1")
    .bind(userId)
    .first<{ body: string; created_at: string }>();
  return json({
    insight: row ? parseInsight(row.body) : null,
    createdAt: row?.created_at ?? null,
    remainingToday: await remainingToday(env, userId, now),
  });
}

async function remainingToday(env: Env, userId: string, now: Date): Promise<number> {
  const day = now.toISOString().slice(0, 10);
  const used = (await env.DB.prepare("SELECT COUNT(*) AS n FROM insights WHERE user_id = ? AND day = ?").bind(userId, day).first<number>("n")) ?? 0;
  return Math.max(0, DAILY_LIMIT - used);
}

/** POST /api/insights { summary }: a new insight (or today's for the same summary). */
export async function createInsight(
  request: Request,
  env: Env,
  userId: string,
  now = new Date(),
  write: WriteInsight = writeWithClaude,
): Promise<Response> {
  if (!(await insightsAllowed(env, userId))) return problem(404, "not-found", "No such API route.");

  const text = await request.text();
  if (text.length > SUMMARY_MAX_BYTES) return problem(413, "too-large", "The summary is too big.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return problem(400, "bad-json", "The body isn't JSON.");
  }
  if (!isObject(body) || !isObject(body.summary)) return problem(400, "bad-request", "Expected { summary: {...} }.");
  const summary = JSON.stringify(body.summary);
  const day = now.toISOString().slice(0, 10);
  const hash = await sha256Hex(summary);

  // Same stats, same day: no new call.
  const cached = await env.DB.prepare("SELECT body, created_at FROM insights WHERE user_id = ? AND day = ? AND summary_hash = ? ORDER BY id DESC LIMIT 1")
    .bind(userId, day, hash)
    .first<{ body: string; created_at: string }>();
  if (cached) {
    return json({ insight: parseInsight(cached.body), createdAt: cached.created_at, remainingToday: await remainingToday(env, userId, now), cached: true });
  }

  if ((await remainingToday(env, userId, now)) === 0) {
    return problem(429, "daily-limit", `That's ${DAILY_LIMIT} insights today. More tomorrow.`);
  }
  const spent = (await env.DB.prepare("SELECT COALESCE(SUM(cost_micros), 0) AS c FROM insights WHERE created_at >= ?").bind(monthStart(now)).first<number>("c")) ?? 0;
  if (spent >= MONTHLY_BUDGET_MICROS) {
    return problem(429, "monthly-budget", "Insights are paused until next month (the monthly budget is used up).");
  }

  let result: { insight: Insight; costMicros: number };
  try {
    result = await write(env, summary);
  } catch (error) {
    console.error("insight failed", error);
    // A failed call that still cost money counts against the budget, but not the daily limit.
    if (error instanceof InsightError && error.costMicros > 0) {
      await env.DB.prepare("INSERT INTO insights (user_id, created_at, day, summary_hash, body, cost_micros) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(userId, now.toISOString(), "failed", hash, "null", error.costMicros)
        .run();
      await checkSpendAlerts(env, now);
    }
    return problem(502, "insight-failed", "Couldn't write tips just now. Try again in a little while.");
  }

  const created = now.toISOString();
  await env.DB.prepare("INSERT INTO insights (user_id, created_at, day, summary_hash, body, cost_micros) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(userId, created, day, hash, JSON.stringify(result.insight), result.costMicros)
    .run();
  await checkSpendAlerts(env, now);
  return json({ insight: result.insight, createdAt: created, remainingToday: await remainingToday(env, userId, now), cached: false });
}

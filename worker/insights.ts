/**
 * AI practice insights, for allow-listed accounts only (AI_ALLOWED, e.g.
 * "github:123,google:456"). The browser sends a summary of the practice
 * stats it already computes (no raw hits, no names) and the model chosen in
 * the app (worker/aiModels.ts: Claude or OpenAI); the model turns it into a
 * few plain-language tips for a beginner drummer.
 *
 * Spending is bounded three ways, across every model: at most DAILY_LIMIT
 * new insights per account per day, a monthly budget across everyone
 * (MONTHLY_BUDGET_MICROS, from each call's token usage at that model's
 * price), and a cache: the same summary with the same model on the same day
 * returns the stored insight without a new call.
 */
import { sha256Hex } from "./auth/crypto";
import { json, problem } from "./http";
import { checkSpendAlerts, monthStart } from "./alerts";
import {
  InsightError,
  approxCostPerTip,
  availableModels,
  findModel,
  parseInsight,
  providerReady,
  writeInsight,
  type AiModel,
  type WriteInsight,
} from "./aiModels";

export { InsightError, parseInsight, type Insight, type WriteInsight } from "./aiModels";
import type { Insight } from "./aiModels";

export const DAILY_LIMIT = 5;
/** $5 a month (owner decision, 2026-11-12). */
export const MONTHLY_BUDGET_MICROS = 5_000_000;
const SUMMARY_MAX_BYTES = 20_000;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Whether this user may use insights: a provider has a key, and one of their sign-ins is on the allow-list. */
export async function insightsAllowed(env: Env, userId: string): Promise<boolean> {
  const allowed = new Set(
    (env.AI_ALLOWED ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (allowed.size === 0 || availableModels(env).length === 0) return false;
  const { results } = await env.DB.prepare("SELECT provider, subject FROM identities WHERE user_id = ?")
    .bind(userId)
    .all<{ provider: string; subject: string }>();
  return results.some((r) => allowed.has(`${r.provider}:${r.subject}`));
}

/** The models the app can offer, for the picker. */
const modelList = (env: Env) =>
  availableModels(env).map((m) => ({ id: m.id, provider: m.provider, label: m.label, approxCostPerTip: approxCostPerTip(m) }));

/** GET /api/insights: the latest insight, the models on offer and today's remaining count; 404 when not allowed. */
export async function latestInsight(_request: Request, env: Env, userId: string, now = new Date()): Promise<Response> {
  if (!(await insightsAllowed(env, userId))) return problem(404, "not-found", "No such API route.");
  const row = await env.DB.prepare("SELECT body, created_at, model FROM insights WHERE user_id = ? AND day != 'failed' ORDER BY id DESC LIMIT 1")
    .bind(userId)
    .first<{ body: string; created_at: string; model: string }>();
  return json({
    insight: row ? parseInsight(row.body) : null,
    createdAt: row?.created_at ?? null,
    model: row ? (findModel(row.model)?.label ?? row.model) : null,
    remainingToday: await remainingToday(env, userId, now),
    models: modelList(env),
  });
}

async function remainingToday(env: Env, userId: string, now: Date): Promise<number> {
  const day = now.toISOString().slice(0, 10);
  const used = (await env.DB.prepare("SELECT COUNT(*) AS n FROM insights WHERE user_id = ? AND day = ?").bind(userId, day).first<number>("n")) ?? 0;
  return Math.max(0, DAILY_LIMIT - used);
}

/** The requested model, if it's on the list and its provider has a key; the first available one if none was asked for. */
function chooseModel(env: Env, requested: unknown): AiModel | null {
  if (requested === undefined) return availableModels(env)[0] ?? null;
  if (typeof requested !== "string") return null;
  const model = findModel(requested);
  return model && providerReady(env, model.provider) ? model : null;
}

/** POST /api/insights { model?, summary }: a new insight (or today's for the same summary and model). */
export async function createInsight(
  request: Request,
  env: Env,
  userId: string,
  now = new Date(),
  write: WriteInsight = writeInsight,
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
  if (!isObject(body) || !isObject(body.summary)) return problem(400, "bad-request", "Expected { model, summary: {...} }.");
  const model = chooseModel(env, body.model);
  if (!model) return problem(400, "unknown-model", "That model isn't available.");
  const summary = JSON.stringify(body.summary);
  const day = now.toISOString().slice(0, 10);
  const hash = await sha256Hex(summary);
  const reply = async (insight: unknown, createdAt: string, cached: boolean) =>
    json({ insight, createdAt, model: model.label, remainingToday: await remainingToday(env, userId, now), cached });

  // Same stats, same model, same day: no new call.
  const hit = await env.DB.prepare(
    "SELECT body, created_at FROM insights WHERE user_id = ? AND day = ? AND summary_hash = ? AND model = ? ORDER BY id DESC LIMIT 1",
  )
    .bind(userId, day, hash, model.id)
    .first<{ body: string; created_at: string }>();
  if (hit) return reply(parseInsight(hit.body), hit.created_at, true);

  if ((await remainingToday(env, userId, now)) === 0) {
    return problem(429, "daily-limit", `That's ${DAILY_LIMIT} insights today. More tomorrow.`);
  }
  const spent = (await env.DB.prepare("SELECT COALESCE(SUM(cost_micros), 0) AS c FROM insights WHERE created_at >= ?").bind(monthStart(now)).first<number>("c")) ?? 0;
  if (spent >= MONTHLY_BUDGET_MICROS) {
    return problem(429, "monthly-budget", "Insights are paused until next month (the monthly budget is used up).");
  }

  const insert = env.DB.prepare("INSERT INTO insights (user_id, created_at, day, summary_hash, body, cost_micros, model) VALUES (?, ?, ?, ?, ?, ?, ?)");
  let result: { insight: Insight; costMicros: number };
  try {
    result = await write(env, model, summary);
  } catch (error) {
    console.error(`insight with ${model.id} failed`, error);
    // A failed call that still cost money counts against the budget, but not the daily limit.
    if (error instanceof InsightError && error.costMicros > 0) {
      await insert.bind(userId, now.toISOString(), "failed", hash, "null", error.costMicros, model.id).run();
      await checkSpendAlerts(env, now);
    }
    return problem(502, "insight-failed", "Couldn't write tips just now. Try again in a little while.");
  }

  const created = now.toISOString();
  await insert.bind(userId, created, day, hash, JSON.stringify(result.insight), result.costMicros, model.id).run();
  await checkSpendAlerts(env, now);
  return reply(result.insight, created, false);
}

/** AI practice insights from the server (allow-listed accounts only; see worker/insights.ts). */

export interface Insight {
  headline: string;
  tips: { title: string; detail: string }[];
  encouragement: string;
}

/** A model the server offers, with a rough cost per tip in dollars. */
export interface AiModelOption {
  id: string;
  provider: "anthropic" | "openai";
  label: string;
  approxCostPerTip: number;
}

/** A set of tips written before the current one (EDU-112). */
export interface EarlierInsight {
  id: number;
  createdAt: string;
  model: string;
  insight: Insight;
}

export interface InsightReply {
  insight: Insight | null;
  createdAt: string | null;
  /** The label of the model that wrote it. */
  model: string | null;
  remainingToday: number;
  /** Only on GET: the models on offer, cheapest first per provider. */
  models: AiModelOption[] | null;
  /** Only on GET: earlier sets of tips, newest first. */
  earlier: EarlierInsight[] | null;
}

function parseModels(x: unknown): AiModelOption[] | null {
  if (!Array.isArray(x)) return null;
  return x.filter(
    (m): m is AiModelOption =>
      isObject(m) &&
      typeof m.id === "string" &&
      (m.provider === "anthropic" || m.provider === "openai") &&
      typeof m.label === "string" &&
      typeof m.approxCostPerTip === "number",
  );
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function parseInsight(x: unknown): Insight | null {
  if (!isObject(x) || typeof x.headline !== "string" || typeof x.encouragement !== "string" || !Array.isArray(x.tips)) return null;
  const tips = x.tips.filter(
    (t): t is { title: string; detail: string } => isObject(t) && typeof t.title === "string" && typeof t.detail === "string",
  );
  return { headline: x.headline, tips, encouragement: x.encouragement };
}

function parseEarlier(x: unknown): EarlierInsight[] | null {
  if (!Array.isArray(x)) return null;
  return x.flatMap((e) => {
    if (!isObject(e) || typeof e.id !== "number" || typeof e.createdAt !== "string" || typeof e.model !== "string") return [];
    const insight = parseInsight(e.insight);
    return insight ? [{ id: e.id, createdAt: e.createdAt, model: e.model, insight }] : [];
  });
}

function parseReply(x: unknown): InsightReply {
  if (!isObject(x)) throw new Error("Unexpected reply");
  return {
    insight: parseInsight(x.insight),
    createdAt: typeof x.createdAt === "string" ? x.createdAt : null,
    model: typeof x.model === "string" ? x.model : null,
    remainingToday: typeof x.remainingToday === "number" ? x.remainingToday : 0,
    models: parseModels(x.models),
    earlier: parseEarlier(x.earlier),
  };
}

/** A refusal the drummer should read (daily limit, monthly budget, temporary failure). */
export class InsightUnavailable extends Error {}

async function reply(res: Response): Promise<InsightReply> {
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = isObject(body) && typeof body.message === "string" ? body.message : "Couldn't get tips just now.";
    throw new InsightUnavailable(message);
  }
  return parseReply(body);
}

export async function latestInsight(): Promise<InsightReply> {
  return reply(await fetch("/api/insights", { credentials: "same-origin" }));
}

export async function requestInsight(summary: object, model: string): Promise<InsightReply> {
  return reply(
    await fetch("/api/insights", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, summary }),
    }),
  );
}

/** Deletes one earlier set of tips, or every set with "all" (EDU-112). */
export async function deleteInsights(which: number | "all"): Promise<void> {
  const query = which === "all" ? "all=true" : `id=${which}`;
  const res = await fetch(`/api/insights?${query}`, { method: "DELETE", credentials: "same-origin" });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new InsightUnavailable(isObject(body) && typeof body.message === "string" ? body.message : "Couldn't delete the tips just now.");
  }
}

const MODEL_KEY = "edrum-coach:insights-model";

/** The model chosen last time in this browser, if any. */
export function savedModel(): string | null {
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
}

export function saveModel(id: string): void {
  try {
    localStorage.setItem(MODEL_KEY, id);
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

/** AI practice insights from the server (allow-listed accounts only; see worker/insights.ts). */

export interface Insight {
  headline: string;
  tips: { title: string; detail: string }[];
  encouragement: string;
}

export interface InsightReply {
  insight: Insight | null;
  createdAt: string | null;
  remainingToday: number;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function parseInsight(x: unknown): Insight | null {
  if (!isObject(x) || typeof x.headline !== "string" || typeof x.encouragement !== "string" || !Array.isArray(x.tips)) return null;
  const tips = x.tips.filter(
    (t): t is { title: string; detail: string } => isObject(t) && typeof t.title === "string" && typeof t.detail === "string",
  );
  return { headline: x.headline, tips, encouragement: x.encouragement };
}

function parseReply(x: unknown): InsightReply {
  if (!isObject(x)) throw new Error("Unexpected reply");
  return {
    insight: parseInsight(x.insight),
    createdAt: typeof x.createdAt === "string" ? x.createdAt : null,
    remainingToday: typeof x.remainingToday === "number" ? x.remainingToday : 0,
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

export async function requestInsight(summary: object): Promise<InsightReply> {
  return reply(
    await fetch("/api/insights", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary }),
    }),
  );
}

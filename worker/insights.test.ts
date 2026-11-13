import { afterEach, describe, expect, it, vi } from "vitest";
import { findOrCreateUser } from "./auth/oauth";
import { createSession } from "./auth/sessions";
import { handle } from "./index";
import { DAILY_LIMIT, InsightError, MONTHLY_BUDGET_MICROS, createInsight, parseInsight, type Insight, type WriteInsight } from "./insights";
import type { TestD1 } from "./testing/d1";
import { ORIGIN, request, testEnv } from "./testing/env";

let db: TestD1 | null = null;
afterEach(() => {
  db?.close();
  db = null;
  vi.restoreAllMocks();
});

const INSIGHT: Insight = {
  headline: "Your left hand rushes a little.",
  tips: [{ title: "Slow down", detail: "Play singles at 60 BPM." }],
  encouragement: "Your accuracy is climbing.",
};

async function setup(allowed = "github:42", key = "sk-test", openai = "") {
  const t = testEnv({ AI_ALLOWED: allowed, ANTHROPIC_API_KEY: key, OPENAI_API_KEY: openai });
  db = t.db;
  const signIn = async (subject: string) => {
    const userId = await findOrCreateUser(t.env.DB, "github", { subject, name: null, avatarUrl: null });
    return { userId, cookie: (await createSession(t.env.DB, userId, "github")).split(";")[0] ?? "" };
  };
  return { env: t.env, signIn };
}

const post = (cookie: string, summary: unknown, model?: string) =>
  request("/api/insights", { method: "POST", headers: { Cookie: cookie, Origin: ORIGIN }, body: JSON.stringify({ summary, model }) });

const fakeWriter = (costMicros = 60_000) => {
  const calls: string[] = [];
  const models: string[] = [];
  const write: WriteInsight = (_env, model, summary) => {
    calls.push(summary);
    models.push(model.id);
    return Promise.resolve({ insight: INSIGHT, costMicros });
  };
  return { write, calls, models };
};

const noon = new Date("2026-11-13T12:00:00Z");

/** A call that cost money and produced nothing (a refusal, say). */
const failing: WriteInsight = () => Promise.reject(new InsightError("refusal", 30_000));

describe("who can use insights", () => {
  it("only allow-listed accounts, and only with an API key; others get 404 and no flag", async () => {
    const { env, signIn } = await setup();
    const owner = await signIn("42");
    const other = await signIn("7");
    const me = async (cookie: string) => {
      const body: { user: { insights: boolean } } = await (await handle(request("/api/me", { headers: { Cookie: cookie } }), env)).json();
      return body.user.insights;
    };
    expect(await me(owner.cookie)).toBe(true);
    expect(await me(other.cookie)).toBe(false);
    expect((await handle(request("/api/insights", { headers: { Cookie: other.cookie } }), env)).status).toBe(404);
    expect((await handle(post(other.cookie, { a: 1 }), env)).status).toBe(404);

    db?.close();
    const { env: noKey, signIn: signInNoKey } = await setup("github:42", "");
    const owner2 = await signInNoKey("42");
    expect((await handle(request("/api/insights", { headers: { Cookie: owner2.cookie } }), noKey)).status).toBe(404);
  });
});

describe("writing insights", () => {
  it("writes one from the summary, stores it with its cost, and returns it later", async () => {
    const { env, signIn } = await setup();
    const { userId, cookie } = await signIn("42");
    const { write, calls } = fakeWriter();
    const res = await createInsight(post(cookie, { streak: 3 }), env, userId, noon, write);
    expect(await res.json()).toMatchObject({ insight: INSIGHT, remainingToday: DAILY_LIMIT - 1, cached: false });
    expect(calls).toEqual(['{"streak":3}']);
    expect(db?.query("SELECT day, cost_micros, model FROM insights")).toEqual([{ day: "2026-11-13", cost_micros: 60_000, model: "claude-haiku-5-5" }]);

    const latest = await handle(request("/api/insights", { headers: { Cookie: cookie } }), env);
    expect(await latest.json()).toMatchObject({ insight: INSIGHT, model: "Claude Haiku 5.5" });
  });

  it("returns today's insight for the same summary without paying again", async () => {
    const { env, signIn } = await setup();
    const { userId, cookie } = await signIn("42");
    const { write, calls } = fakeWriter();
    await createInsight(post(cookie, { streak: 3 }), env, userId, noon, write);
    const again = await createInsight(post(cookie, { streak: 3 }), env, userId, noon, write);
    expect(await again.json()).toMatchObject({ cached: true, remainingToday: DAILY_LIMIT - 1 });
    expect(calls).toHaveLength(1);
  });

  it("stops at the daily limit per account", async () => {
    const { env, signIn } = await setup();
    const { userId, cookie } = await signIn("42");
    const { write } = fakeWriter();
    for (let i = 0; i < DAILY_LIMIT; i++) {
      // oxlint-disable-next-line no-await-in-loop -- each one counts toward the limit
      await createInsight(post(cookie, { n: i }), env, userId, noon, write);
    }
    const over = await createInsight(post(cookie, { n: 99 }), env, userId, noon, write);
    expect(over.status).toBe(429);
    expect(await over.json()).toMatchObject({ error: "daily-limit" });
    // Tomorrow it's back.
    const tomorrow = await createInsight(post(cookie, { n: 99 }), env, userId, new Date("2026-11-14T08:00:00Z"), write);
    expect(tomorrow.status).toBe(200);
  });

  it("pauses everyone once the month's budget is spent, and resumes next month", async () => {
    const { env, signIn } = await setup();
    const { userId, cookie } = await signIn("42");
    const { write } = fakeWriter(MONTHLY_BUDGET_MICROS);
    await createInsight(post(cookie, { n: 1 }), env, userId, noon, write);
    const over = await createInsight(post(cookie, { n: 2 }), env, userId, noon, write);
    expect(over.status).toBe(429);
    expect(await over.json()).toMatchObject({ error: "monthly-budget" });
    const december = await createInsight(post(cookie, { n: 2 }), env, userId, new Date("2026-12-01T00:00:00Z"), write);
    expect(december.status).toBe(200);
  });

  it("counts a failed call's cost against the budget, not the daily limit", async () => {
    const { env, signIn } = await setup();
    const { userId, cookie } = await signIn("42");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await createInsight(post(cookie, { n: 1 }), env, userId, noon, failing);
    expect(res.status).toBe(502);
    expect(db?.query("SELECT day, cost_micros FROM insights")).toEqual([{ day: "failed", cost_micros: 30_000 }]);
    const ok = await createInsight(post(cookie, { n: 1 }), env, userId, noon, fakeWriter().write);
    expect(await ok.json()).toMatchObject({ remainingToday: DAILY_LIMIT - 1 });
  });

  it("refuses summaries that aren't an object or are too big", async () => {
    const { env, signIn } = await setup();
    const { userId, cookie } = await signIn("42");
    const { write, calls } = fakeWriter();
    expect((await createInsight(post(cookie, "text"), env, userId, noon, write)).status).toBe(400);
    expect((await createInsight(post(cookie, { big: "x".repeat(25_000) }), env, userId, noon, write)).status).toBe(413);
    expect(calls).toEqual([]);
  });

  it("goes with the account", async () => {
    const { env, signIn } = await setup();
    const { userId, cookie } = await signIn("42");
    await createInsight(post(cookie, { n: 1 }), env, userId, noon, fakeWriter().write);
    db?.query("DELETE FROM users");
    expect(db?.query("SELECT COUNT(*) AS n FROM insights")).toEqual([{ n: 0 }]);
  });
});

describe("parseInsight", () => {
  it("accepts the expected shape, keeps at most four tips, and rejects anything else", () => {
    expect(parseInsight(JSON.stringify(INSIGHT))).toEqual(INSIGHT);
    const many = { ...INSIGHT, tips: Array.from({ length: 6 }, (_, i) => ({ title: `t${i}`, detail: "d" })) };
    expect(parseInsight(JSON.stringify(many))?.tips).toHaveLength(4);
    expect(parseInsight("not json")).toBeNull();
    expect(parseInsight(JSON.stringify({ headline: "h", tips: [], encouragement: "e" }))).toBeNull();
  });
});

describe("choosing the model", () => {
  it("lists the models whose provider has a key, cheapest first, each with a rough cost per tip", async () => {
    const { env, signIn } = await setup("github:42", "sk-test", "sk-openai");
    const { cookie } = await signIn("42");
    const body: { models: { id: string; provider: string; approxCostPerTip: number }[] } = await (
      await handle(request("/api/insights", { headers: { Cookie: cookie } }), env)
    ).json();
    expect(body.models.map((m) => m.id)).toEqual([
      "claude-haiku-5-5",
      "claude-sonnet-5-5",
      "claude-opus-5-5",
      "gpt-6-luna",
      "gpt-6.1-terra",
      "gpt-6.1-sol",
      "gpt-6-astra",
    ]);
    const haiku = body.models[0]?.approxCostPerTip ?? 0;
    expect(haiku).toBeLessThan(0.01);
    expect(body.models.find((m) => m.id === "claude-opus-5-5")?.approxCostPerTip).toBeGreaterThan(haiku);

    const { env: claudeOnly, signIn: signInClaude } = await setup("github:42", "sk-test", "");
    const c = await signInClaude("42");
    const only: { models: { provider: string }[] } = await (await handle(request("/api/insights", { headers: { Cookie: c.cookie } }), claudeOnly)).json();
    expect(new Set(only.models.map((m) => m.provider))).toEqual(new Set(["anthropic"]));
  });

  it("writes with the chosen model, and works with only OpenAI set up", async () => {
    const { env, signIn } = await setup("github:42", "", "sk-openai");
    const { userId, cookie } = await signIn("42");
    const { write, models } = fakeWriter();
    const res = await createInsight(post(cookie, { n: 1 }, "gpt-6-luna"), env, userId, noon, write);
    expect(await res.json()).toMatchObject({ model: "GPT-6 Luna" });
    expect(models).toEqual(["gpt-6-luna"]);
    // No model given: the first available (OpenAI's cheapest, since Claude has no key).
    await createInsight(post(cookie, { n: 2 }), env, userId, noon, write);
    expect(models).toEqual(["gpt-6-luna", "gpt-6-luna"]);
  });

  it("refuses models not on the list, or whose provider has no key", async () => {
    const { env, signIn } = await setup("github:42", "sk-test", "");
    const { userId, cookie } = await signIn("42");
    const { write, calls } = fakeWriter();
    for (const model of ["gpt-6-luna", "o3-pro", "claude-opus-4-1"]) {
      // oxlint-disable-next-line no-await-in-loop -- each must be refused
      const res = await createInsight(post(cookie, { n: 1 }, model), env, userId, noon, write);
      expect(res.status).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it("caches per model: the same stats with another model is a new call", async () => {
    const { env, signIn } = await setup("github:42", "sk-test", "sk-openai");
    const { userId, cookie } = await signIn("42");
    const { write, models } = fakeWriter();
    await createInsight(post(cookie, { n: 1 }, "claude-haiku-5-5"), env, userId, noon, write);
    await createInsight(post(cookie, { n: 1 }, "claude-haiku-5-5"), env, userId, noon, write);
    await createInsight(post(cookie, { n: 1 }, "gpt-6-luna"), env, userId, noon, write);
    expect(models).toEqual(["claude-haiku-5-5", "gpt-6-luna"]);
  });

  it("is off when no provider has a key", async () => {
    const { env, signIn } = await setup("github:42", "", "");
    const { cookie } = await signIn("42");
    expect((await handle(request("/api/insights", { headers: { Cookie: cookie } }), env)).status).toBe(404);
  });
});

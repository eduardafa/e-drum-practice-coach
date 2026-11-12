import { afterEach, describe, expect, it } from "vitest";
import { findOrCreateUser } from "./auth/oauth";
import { createSession } from "./auth/sessions";
import { handle } from "./index";
import { PULL_LIMIT, PUSH_MAX_RECORDS } from "./records";
import type { TestD1 } from "./testing/d1";
import { ORIGIN, request, testEnv } from "./testing/env";

let db: TestD1 | null = null;
afterEach(() => {
  db?.close();
  db = null;
});

async function setup() {
  const t = testEnv();
  db = t.db;
  const cookieFor = async (subject: string) => {
    const userId = await findOrCreateUser(t.env.DB, "github", { subject, name: null, avatarUrl: null });
    return (await createSession(t.env.DB, userId, "github")).split(";")[0] ?? "";
  };
  return { env: t.env, cookieFor };
}

const record = (id: string, extra: Record<string, unknown> = {}) => ({
  v: 1,
  id,
  kind: "session",
  start: "2026-11-12T18:00:00Z",
  notes: [[0, 0, 3, 100]],
  ...extra,
});

const push = (env: Env, cookie: string, records: unknown[]) =>
  handle(
    request("/api/records", {
      method: "POST",
      headers: { Cookie: cookie, Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    }),
    env,
  );

const pull = async (env: Env, cookie: string, after = 0) => {
  const res = await handle(request(`/api/records?after=${after}`, { headers: { Cookie: cookie } }), env);
  const body: { records: { id: string }[]; next: number; more: boolean } = await res.json();
  return { status: res.status, body };
};

describe("records sync", () => {
  it("needs a signed-in user", async () => {
    const { env } = await setup();
    expect((await handle(request("/api/records"), env)).status).toBe(401);
    expect((await push(env, "", [record("a")])).status).toBe(401);
  });

  it("stores records once, however often they're sent, and returns them unchanged", async () => {
    const { env, cookieFor } = await setup();
    const me = await cookieFor("1");
    expect(await (await push(env, me, [record("a"), record("b")])).json()).toEqual({ stored: 2, known: 0, rejected: [] });
    expect(await (await push(env, me, [record("b"), record("c")])).json()).toEqual({ stored: 1, known: 1, rejected: [] });
    const { body } = await pull(env, me);
    expect(body.records).toEqual([record("a"), record("b"), record("c")]);
    expect(body.more).toBe(false);
  });

  it("returns only what's new since the last pull", async () => {
    const { env, cookieFor } = await setup();
    const me = await cookieFor("1");
    await push(env, me, [record("a")]);
    const first = await pull(env, me);
    await push(env, me, [record("b")]);
    const second = await pull(env, me, first.body.next);
    expect(second.body.records.map((r) => r.id)).toEqual(["b"]);
    expect((await pull(env, me, second.body.next)).body.records).toEqual([]);
  });

  it("keeps each drummer's records to themselves", async () => {
    const { env, cookieFor } = await setup();
    const ana = await cookieFor("1");
    const bea = await cookieFor("2");
    await push(env, ana, [record("same-id")]);
    await push(env, bea, [record("same-id", { bpm: 99 })]);
    expect((await pull(env, ana)).body.records).toEqual([record("same-id")]);
    expect((await pull(env, bea)).body.records).toEqual([record("same-id", { bpm: 99 })]);
  });

  it("pages large histories", async () => {
    const { env, cookieFor } = await setup();
    const me = await cookieFor("1");
    const ids = Array.from({ length: PULL_LIMIT + 5 }, (_, i) => `r${i}`);
    for (let i = 0; i < ids.length; i += PUSH_MAX_RECORDS) {
      // oxlint-disable-next-line no-await-in-loop -- uploads in order, as the app does
      await push(env, me, ids.slice(i, i + PUSH_MAX_RECORDS).map((id) => record(id)));
    }
    const page1 = await pull(env, me);
    expect(page1.body.records).toHaveLength(PULL_LIMIT);
    expect(page1.body.more).toBe(true);
    const page2 = await pull(env, me, page1.body.next);
    expect(page2.body.records.map((r) => r.id)).toEqual(ids.slice(PULL_LIMIT));
    expect(page2.body.more).toBe(false);
  });

  it("rejects malformed or oversized records by ID, keeping the rest", async () => {
    const { env, cookieFor } = await setup();
    const me = await cookieFor("1");
    const res = await push(env, me, [record("ok"), { id: "no-kind", v: 1 }, record("huge", { pad: "x".repeat(70_000) }), "junk"]);
    expect(await res.json()).toEqual({ stored: 1, known: 0, rejected: ["no-kind", "huge"] });
  });

  it("refuses too many records at once, bad JSON, uploads from other sites, and bad cursors", async () => {
    const { env, cookieFor } = await setup();
    const me = await cookieFor("1");
    const many = Array.from({ length: PUSH_MAX_RECORDS + 1 }, (_, i) => record(`m${i}`));
    expect((await push(env, me, many)).status).toBe(413);
    const bad = await handle(request("/api/records", { method: "POST", headers: { Cookie: me, Origin: ORIGIN }, body: "{" }), env);
    expect(bad.status).toBe(400);
    const foreign = await handle(
      request("/api/records", { method: "POST", headers: { Cookie: me, Origin: "https://evil.example" }, body: "{}" }),
      env,
    );
    expect(foreign.status).toBe(403);
    expect((await pull(env, me, -1)).status).toBe(400);
  });

  it("goes with the user", async () => {
    const { env, cookieFor } = await setup();
    const me = await cookieFor("1");
    await push(env, me, [record("a")]);
    db?.query("DELETE FROM users");
    expect(db?.query("SELECT COUNT(*) AS n FROM records")).toEqual([{ n: 0 }]);
  });
});

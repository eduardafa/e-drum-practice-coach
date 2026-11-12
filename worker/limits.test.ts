import { afterEach, describe, expect, it } from "vitest";
import { findOrCreateUser } from "./auth/oauth";
import { createSession } from "./auth/sessions";
import { handle } from "./index";
import { USER_MAX_BYTES } from "./records";
import type { TestD1 } from "./testing/d1";
import { ORIGIN, request, testEnv, testLimiter } from "./testing/env";

let db: TestD1 | null = null;
afterEach(() => {
  db?.close();
  db = null;
});

async function setup(overrides: Partial<Env> = {}) {
  const t = testEnv(overrides);
  db = t.db;
  const signIn = async (subject: string) => {
    const userId = await findOrCreateUser(t.env.DB, "github", { subject, name: "N", avatarUrl: null });
    return { userId, cookie: (await createSession(t.env.DB, userId, "github")).split(";")[0] ?? "" };
  };
  return { env: t.env, signIn };
}

const rec = (id: string) => ({ v: 1, id, kind: "session", start: "2026-11-12T18:00:00Z", notes: [] });

const send = (env: Env, method: string, path: string, cookie: string, body?: unknown) =>
  handle(
    request(path, {
      method,
      headers: { Cookie: cookie, Origin: ORIGIN, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );

const count = (table: string) => db?.query(`SELECT COUNT(*) AS n FROM ${table}`)[0]?.n;

describe("deleting an account", () => {
  it("removes the user, their sign-ins, sessions and synced records, and signs the browser out", async () => {
    const { env, signIn } = await setup();
    const ana = await signIn("1");
    const bea = await signIn("2");
    await send(env, "POST", "/api/records", ana.cookie, { records: [rec("a"), rec("b")] });
    await send(env, "POST", "/api/records", bea.cookie, { records: [rec("c")] });

    const res = await send(env, "DELETE", "/api/account", ana.cookie);
    expect(res.status).toBe(204);
    expect(res.headers.get("Set-Cookie")).toMatch(/^__Host-session=; .*Max-Age=0$/);
    expect(db?.query("SELECT id FROM users")).toEqual([{ id: bea.userId }]);
    expect(db?.query("SELECT user_id FROM identities")).toEqual([{ user_id: bea.userId }]);
    expect(db?.query("SELECT user_id FROM sessions")).toEqual([{ user_id: bea.userId }]);
    expect(db?.query("SELECT id FROM records")).toEqual([{ id: "c" }]);

    const me = await handle(request("/api/me", { headers: { Cookie: ana.cookie } }), env);
    const body: { user: unknown } = await me.json();
    expect(body.user).toBeNull();
  });

  it("needs the app's Origin and a session", async () => {
    const { env, signIn } = await setup();
    const ana = await signIn("1");
    const foreign = await handle(request("/api/account", { method: "DELETE", headers: { Cookie: ana.cookie } }), env);
    expect(foreign.status).toBe(403);
    expect((await send(env, "DELETE", "/api/account", "")).status).toBe(401);
    expect(count("users")).toBe(1);
  });
});

describe("deleting synced history", () => {
  it("removes this user's records only, and resets their totals", async () => {
    const { env, signIn } = await setup();
    const ana = await signIn("1");
    const bea = await signIn("2");
    await send(env, "POST", "/api/records", ana.cookie, { records: [rec("a"), rec("b")] });
    await send(env, "POST", "/api/records", bea.cookie, { records: [rec("c")] });
    const res = await send(env, "DELETE", "/api/records", ana.cookie);
    expect(await res.json()).toEqual({ deleted: 2 });
    expect(db?.query("SELECT id FROM records")).toEqual([{ id: "c" }]);
    expect(db?.query("SELECT record_count, record_bytes FROM users WHERE id = ?", ana.userId)).toEqual([{ record_count: 0, record_bytes: 0 }]);
    expect(count("users")).toBe(2); // the account stays
  });
});

describe("storage limit", () => {
  it("keeps a running total of what each drummer has synced, counting each record once", async () => {
    const { env, signIn } = await setup();
    const ana = await signIn("1");
    await send(env, "POST", "/api/records", ana.cookie, { records: [rec("a"), rec("b")] });
    await send(env, "POST", "/api/records", ana.cookie, { records: [rec("b"), rec("c")] });
    const bytes = 3 * JSON.stringify(rec("a")).length;
    expect(db?.query("SELECT record_count, record_bytes FROM users")).toEqual([{ record_count: 3, record_bytes: bytes }]);
  });

  it("refuses uploads past the limit", async () => {
    const { env, signIn } = await setup();
    const ana = await signIn("1");
    db?.query("UPDATE users SET record_bytes = ? WHERE id = ?", USER_MAX_BYTES - 10, ana.userId);
    const res = await send(env, "POST", "/api/records", ana.cookie, { records: [rec("a")] });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: "storage-full" });
    expect(count("records")).toBe(0);
  });
});

describe("rate limits", () => {
  it("limits sync calls per account", async () => {
    const API_LIMIT = testLimiter(2);
    const { env, signIn } = await setup({ API_LIMIT });
    const ana = await signIn("1");
    const bea = await signIn("2");
    const pull = (cookie: string) => handle(request("/api/records", { headers: { Cookie: cookie } }), env);
    expect((await pull(ana.cookie)).status).toBe(200);
    expect((await pull(ana.cookie)).status).toBe(200);
    const third = await pull(ana.cookie);
    expect(third.status).toBe(429);
    expect(third.headers.get("Retry-After")).toBe("60");
    expect((await pull(bea.cookie)).status).toBe(200); // another account isn't affected
    expect(API_LIMIT.calls).toEqual([`user:${ana.userId}`, `user:${ana.userId}`, `user:${ana.userId}`, `user:${bea.userId}`]);
  });

  it("limits sign-in attempts per IP address", async () => {
    const { env } = await setup({ AUTH_LIMIT: testLimiter(1) });
    const start = (ip: string) => handle(request("/api/auth/github/start", { headers: { "CF-Connecting-IP": ip } }), env);
    expect((await start("203.0.113.1")).status).toBe(302);
    expect((await start("203.0.113.1")).status).toBe(429);
    expect((await start("203.0.113.2")).status).toBe(302);
  });

  it("lets requests through if the limiter itself fails", async () => {
    const broken: RateLimit = { limit: () => Promise.reject(new Error("down")) };
    const { env } = await setup({ AUTH_LIMIT: broken });
    const original = console.error;
    console.error = () => {};
    try {
      expect((await handle(request("/api/auth/github/start"), env)).status).toBe(302);
    } finally {
      console.error = original;
    }
  });
});

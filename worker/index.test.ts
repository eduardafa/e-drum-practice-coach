import { afterEach, describe, expect, it } from "vitest";
import { handle } from "./index";
import { testD1, type TestD1 } from "./testing/d1";

const ORIGIN = "https://drums.example";

let db: TestD1 | null = null;
afterEach(() => {
  db?.close();
  db = null;
});

function env(options?: { migrate?: boolean }): Env {
  db = testD1(options);
  return { DB: db.binding, APP_ORIGIN: ORIGIN };
}

const get = (path: string, init?: RequestInit, origin = ORIGIN) => new Request(new URL(path, origin), init);

describe("API", () => {
  it("reports health with the last migration applied", async () => {
    const res = await handle(get("/api/health"), env());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, schema: "0001_users.sql" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
  });

  it("reports a database without migrations as unavailable", async () => {
    const res = await handle(get("/api/health"), env({ migrate: false }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "database" });
  });

  it("refuses every route on other origins, such as previews", async () => {
    const res = await handle(get("/api/health", undefined, "https://pr-7-drums.example"), env());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "unavailable" });
  });

  it("tells unknown routes from wrong methods", async () => {
    const e = env();
    expect((await handle(get("/api/nope"), e)).status).toBe(404);
    const res = await handle(get("/api/health", { method: "POST" }), e);
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET");
  });
});

describe("migrations", () => {
  it("create the users table", () => {
    env();
    expect(db?.query("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'users'")).toHaveLength(1);
  });
});

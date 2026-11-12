import { afterEach, describe, expect, it } from "vitest";
import { handle } from "./index";
import type { TestD1 } from "./testing/d1";
import { request as get, testEnv } from "./testing/env";

let db: TestD1 | null = null;
afterEach(() => {
  db?.close();
  db = null;
});

function env(options?: { migrate?: boolean }): Env {
  const t = testEnv({}, options);
  db = t.db;
  return t.env;
}

describe("API", () => {
  it("reports health with the last migration applied", async () => {
    const res = await handle(get("/api/health"), env());
    expect(res.status).toBe(200);
    // Whatever migration is newest, so adding one doesn't touch this test.
    const [last] = db?.query("SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1") ?? [];
    expect(last?.name).toMatch(/^\d{4}_.+\.sql$/);
    expect(await res.json()).toEqual({ ok: true, schema: last?.name });
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

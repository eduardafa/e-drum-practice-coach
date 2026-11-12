import { testD1, type TestD1 } from "./d1";

export const ORIGIN = "https://drums.example";

/** A rate limiter that allows `limit` calls per key, then refuses (no time window in tests). */
export function testLimiter(limit = Infinity): RateLimit & { calls: string[] } {
  const counts = new Map<string, number>();
  const calls: string[] = [];
  return {
    calls,
    limit: ({ key }) => {
      calls.push(key);
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return Promise.resolve({ success: n <= limit });
    },
  };
}

/** An Env over a fresh test database, with both providers set up unless overridden. */
export function testEnv(overrides: Partial<Env> = {}, options?: { migrate?: boolean }): { env: Env; db: TestD1 } {
  const db = testD1(options);
  return {
    db,
    env: {
      DB: db.binding,
      API_LIMIT: testLimiter(),
      AUTH_LIMIT: testLimiter(),
      APP_ORIGIN: ORIGIN,
      GITHUB_CLIENT_ID: "gh-client",
      GITHUB_CLIENT_SECRET: "gh-secret",
      GOOGLE_CLIENT_ID: "google-client",
      GOOGLE_CLIENT_SECRET: "google-secret",
      ...overrides,
    },
  };
}

export const request = (path: string, init?: RequestInit, origin = ORIGIN) => new Request(new URL(path, origin), init);

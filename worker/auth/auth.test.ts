import { afterEach, describe, expect, it, vi } from "vitest";
import { handle, type MeResponse } from "../index";
import type { TestD1 } from "../testing/d1";
import { ORIGIN, request, testEnv } from "../testing/env";
import { base64url, sha256, sha256Hex } from "./crypto";
import { findOrCreateUser } from "./oauth";
import { SESSION_DAYS, createSession, readSession } from "./sessions";

let db: TestD1 | null = null;
afterEach(() => {
  db?.close();
  db = null;
  vi.unstubAllGlobals();
});

function setup(overrides: Partial<Env> = {}): Env {
  const t = testEnv(overrides);
  db = t.db;
  return t.env;
}

const cookiePair = (setCookie: string) => setCookie.split(";")[0] ?? "";

/** The cookie a browser would send back after these Set-Cookie headers (deletions dropped). */
function jar(res: Response): string {
  return res.headers
    .getSetCookie()
    .filter((c) => !c.includes("Max-Age=0"))
    .map(cookiePair)
    .join("; ");
}

async function start(env: Env, provider: "github" | "google") {
  const res = await handle(request(`/api/auth/${provider}/start`), env);
  const location = new URL(res.headers.get("Location") ?? "");
  return { res, location, cookie: jar(res), state: location.searchParams.get("state") ?? "" };
}

const callback = (env: Env, provider: string, query: string, cookie: string) =>
  handle(request(`/api/auth/${provider}/callback?${query}`, { headers: { Cookie: cookie } }), env);

const me = async (env: Env, cookie = ""): Promise<MeResponse> =>
  (await handle(request("/api/me", { headers: { Cookie: cookie } }), env)).json();

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Fake GitHub: a token endpoint and a user endpoint. */
function fakeGitHub(
  userId = 583231,
  profile: Record<string, unknown> = { name: "Ana Drummer", avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4" },
) {
  const calls: { url: string; body: URLSearchParams | null }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init?: RequestInit) => {
      calls.push({ url: input, body: init?.body instanceof URLSearchParams ? init.body : null });
      if (input === "https://github.com/login/oauth/access_token") return Promise.resolve(jsonResponse({ access_token: "gho_x" }));
      if (input === "https://api.github.com/user") return Promise.resolve(jsonResponse({ id: userId, login: "someone", ...profile }));
      return Promise.resolve(new Response(null, { status: 404 }));
    }),
  );
  return calls;
}

const jwt = (claims: Record<string, unknown>) =>
  `${base64url(new TextEncoder().encode('{"alg":"RS256"}'))}.${base64url(new TextEncoder().encode(JSON.stringify(claims)))}.sig`;

function fakeGoogle(claims: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(jsonResponse({ access_token: "ya29", id_token: jwt(claims) }))),
  );
}

const googleClaims = (over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: "google-client",
  sub: "1098765",
  name: "Bea Beats",
  picture: "https://lh3.googleusercontent.com/a/abc=s96-c",
  exp: Math.floor(Date.now() / 1000) + 3600,
  ...over,
});

async function signedIn(env: Env) {
  fakeGitHub();
  const { cookie, state } = await start(env, "github");
  return jar(await callback(env, "github", `code=abc&state=${state}`, cookie));
}

const withCookie = (setCookie: string) => request("/api/me", { headers: { Cookie: cookiePair(setCookie) } });

describe("starting sign-in", () => {
  it("redirects to the provider with state and a PKCE challenge kept in a host-only cookie", async () => {
    const env = setup();
    const { res, location, state } = await start(env, "github");
    expect(res.status).toBe(302);
    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("gh-client");
    expect(location.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/github/callback`);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.has("scope")).toBe(false); // GitHub: no scope, public profile only

    const set = res.headers.getSetCookie()[0] ?? "";
    expect(set).toMatch(/^__Host-oauth=github\./);
    expect(set).toContain("HttpOnly; Secure; SameSite=Lax");
    const [, cookieState, verifier] = cookiePair(set).split("=")[1]?.split(".") ?? [];
    expect(cookieState).toBe(state);
    expect(location.searchParams.get("code_challenge")).toBe(base64url(await sha256(verifier ?? "")));
  });

  it("asks Google for openid and profile only, never email", async () => {
    const { location } = await start(setup(), "google");
    expect(location.searchParams.get("scope")).toBe("openid profile");
  });

  it("sends the drummer back when a provider isn't set up", async () => {
    const env = setup({ GOOGLE_CLIENT_SECRET: undefined });
    const { res } = await start(env, "google");
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/?signin=unavailable`);
    expect((await me(env)).providers).toEqual(["github"]);
  });
});

describe("finishing sign-in", () => {
  it("signs in with GitHub, keeping only the provider's user ID and a hashed session", async () => {
    const env = setup();
    const calls = fakeGitHub();
    const { cookie, state } = await start(env, "github");
    const res = await callback(env, "github", `code=abc&state=${state}`, cookie);

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/?signin=ok`);
    expect(calls[0]?.body?.get("code_verifier")).toBe(cookie.split(".")[2]);
    expect(calls[0]?.body?.get("client_secret")).toBe("gh-secret");

    expect(db?.query("SELECT provider, subject FROM identities")).toEqual([{ provider: "github", subject: "583231" }]);
    const session = jar(res);
    const token = session.split("=")[1] ?? "";
    expect(db?.query("SELECT token_hash FROM sessions")).toEqual([{ token_hash: await sha256Hex(token) }]);
    expect((await me(env, session)).user).toEqual({
      provider: "github",
      name: "Ana Drummer",
      avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4",
    });
  });

  it("finds the same user on the next sign-in", async () => {
    const env = setup();
    fakeGitHub();
    const first = await start(env, "github");
    await callback(env, "github", `code=c1&state=${first.state}`, first.cookie);
    const second = await start(env, "github");
    await callback(env, "github", `code=c2&state=${second.state}`, second.cookie);
    expect(db?.query("SELECT COUNT(*) AS n FROM users")).toEqual([{ n: 1 }]);
    expect(db?.query("SELECT COUNT(*) AS n FROM sessions")).toEqual([{ n: 2 }]);
  });

  it("signs in with Google from the ID token's subject", async () => {
    const env = setup();
    fakeGoogle(googleClaims());
    const { cookie, state } = await start(env, "google");
    const res = await callback(env, "google", `code=abc&state=${state}`, cookie);
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/?signin=ok`);
    expect(db?.query("SELECT provider, subject FROM identities")).toEqual([{ provider: "google", subject: "1098765" }]);
    expect(db?.query("SELECT name, avatar_url FROM users")).toEqual([
      { name: "Bea Beats", avatar_url: "https://lh3.googleusercontent.com/a/abc=s96-c" },
    ]);
  });

  it.each([
    ["for another app", { aud: "someone-else" }],
    ["expired", { exp: Math.floor(Date.now() / 1000) - 1 }],
    ["from another issuer", { iss: "https://evil.example" }],
  ])("rejects a Google ID token %s", async (_, over) => {
    const env = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    fakeGoogle(googleClaims(over));
    const { cookie, state } = await start(env, "google");
    const res = await callback(env, "google", `code=abc&state=${state}`, cookie);
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/?signin=failed`);
    expect(db?.query("SELECT * FROM users")).toEqual([]);
  });

  it("refreshes the name and picture at every sign-in", async () => {
    const env = setup();
    fakeGitHub();
    const first = await start(env, "github");
    await callback(env, "github", `code=c1&state=${first.state}`, first.cookie);
    vi.unstubAllGlobals();
    fakeGitHub(583231, { name: "Ana D.", avatar_url: "https://avatars.githubusercontent.com/u/583231?v=5" });
    const second = await start(env, "github");
    await callback(env, "github", `code=c2&state=${second.state}`, second.cookie);
    expect(db?.query("SELECT name, avatar_url FROM users")).toEqual([
      { name: "Ana D.", avatar_url: "https://avatars.githubusercontent.com/u/583231?v=5" },
    ]);
  });

  it("uses the GitHub username when no name is set, and ignores pictures from other hosts", async () => {
    const env = setup();
    fakeGitHub(1, { name: null, avatar_url: "https://evil.example/me.png" });
    const { cookie, state } = await start(env, "github");
    await callback(env, "github", `code=abc&state=${state}`, cookie);
    expect(db?.query("SELECT name, avatar_url FROM users")).toEqual([{ name: "someone", avatar_url: null }]);
  });

  it("refuses a callback whose state doesn't match this browser's cookie, without calling the provider", async () => {
    const env = setup();
    const calls = fakeGitHub();
    const { cookie } = await start(env, "github");
    const res = await callback(env, "github", "code=abc&state=forged", cookie);
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/?signin=failed`);
    expect(calls).toEqual([]);
    expect(res.headers.getSetCookie()).toEqual([expect.stringMatching(/^__Host-oauth=; .*Max-Age=0$/)]);
  });

  it("refuses a callback with no cookie, or one started for the other provider", async () => {
    const env = setup();
    fakeGitHub();
    const { cookie, state } = await start(env, "github");
    expect((await callback(env, "github", `code=abc&state=${state}`, "")).headers.get("Location")).toMatch(/failed$/);
    expect((await callback(env, "google", `code=abc&state=${state}`, cookie)).headers.get("Location")).toMatch(/failed$/);
  });

  it("reports a declined consent screen as canceled", async () => {
    const env = setup();
    const { cookie, state } = await start(env, "github");
    const res = await callback(env, "github", `error=access_denied&state=${state}`, cookie);
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/?signin=canceled`);
  });

  it("fails cleanly when the provider rejects the code", async () => {
    const env = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    // GitHub reports a bad code with status 200 and an error field.
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({ error: "bad_verification_code" }))));
    const { cookie, state } = await start(env, "github");
    const res = await callback(env, "github", `code=abc&state=${state}`, cookie);
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/?signin=failed`);
  });
});

describe("signing out", () => {
  it("ends this browser's session and clears its cookie", async () => {
    const env = setup();
    const session = await signedIn(env);
    const res = await handle(request("/api/auth/signout", { method: "POST", headers: { Cookie: session, Origin: ORIGIN } }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Set-Cookie")).toMatch(/^__Host-session=; .*Max-Age=0$/);
    expect(db?.query("SELECT * FROM sessions")).toEqual([]);
    expect((await me(env, session)).user).toBeNull();
  });

  it("refuses requests that don't come from the app", async () => {
    const env = setup();
    const session = await signedIn(env);
    const attempts: Record<string, string>[] = [{ Cookie: session }, { Cookie: session, Origin: "https://evil.example" }];
    const responses = await Promise.all(
      attempts.map((headers) => handle(request("/api/auth/signout", { method: "POST", headers }), env)),
    );
    expect(responses.map((r) => r.status)).toEqual([403, 403]);
    expect(db?.query("SELECT COUNT(*) AS n FROM sessions")).toEqual([{ n: 1 }]);
  });
});

describe("sessions", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const t0 = new Date("2026-11-12T12:00:00Z");

  async function userAndSession(env: Env) {
    const userId = await findOrCreateUser(env.DB, "github", { subject: "1", name: null, avatarUrl: null }, t0);
    return { userId, setCookie: await createSession(env.DB, userId, "github", t0) };
  }

  it("last 30 days, renewing in their second half", async () => {
    const env = setup();
    const { userId, setCookie } = await userAndSession(env);
    expect(setCookie).toContain(`Max-Age=${SESSION_DAYS * 24 * 60 * 60}`);

    const early = await readSession(env.DB, withCookie(setCookie), new Date(t0.getTime() + 5 * DAY));
    expect(early).toEqual({ userId, provider: "github", name: null, avatarUrl: null, setCookie: null });

    const late = await readSession(env.DB, withCookie(setCookie), new Date(t0.getTime() + 20 * DAY));
    expect(late?.setCookie).toMatch(/^__Host-session=/);
    // Renewed from day 20, so still valid on day 45.
    expect(await readSession(env.DB, withCookie(setCookie), new Date(t0.getTime() + 45 * DAY))).not.toBeNull();
  });

  it("expire, and expired ones are tidied up at the next sign-in", async () => {
    const env = setup();
    const { userId, setCookie } = await userAndSession(env);
    const later = new Date(t0.getTime() + 31 * DAY);
    expect(await readSession(env.DB, withCookie(setCookie), later)).toBeNull();
    await createSession(env.DB, userId, "github", later);
    expect(db?.query("SELECT COUNT(*) AS n FROM sessions")).toEqual([{ n: 1 }]);
  });

  it("ignore unknown tokens", async () => {
    const env = setup();
    expect(await readSession(env.DB, request("/api/me", { headers: { Cookie: "__Host-session=nope" } }))).toBeNull();
  });

  it("go with their user", async () => {
    const env = setup();
    const { userId } = await userAndSession(env);
    db?.query("DELETE FROM users WHERE id = ?", userId);
    expect(db?.query("SELECT COUNT(*) AS n FROM sessions")).toEqual([{ n: 0 }]);
    expect(db?.query("SELECT COUNT(*) AS n FROM identities")).toEqual([{ n: 0 }]);
  });
});

describe("profile cleaning", () => {
  it("keeps names short and pictures on the providers' own HTTPS hosts", async () => {
    const { cleanAvatarUrl, cleanName } = await import("./providers");
    expect(cleanName("  Ana  ")).toBe("Ana");
    expect(cleanName("")).toBeNull();
    expect(cleanName(42)).toBeNull();
    expect(cleanName("x".repeat(300))).toHaveLength(100);
    expect(cleanAvatarUrl("https://avatars.githubusercontent.com/u/1")).toBe("https://avatars.githubusercontent.com/u/1");
    expect(cleanAvatarUrl("https://lh3.googleusercontent.com/a/x")).toBe("https://lh3.googleusercontent.com/a/x");
    expect(cleanAvatarUrl("http://avatars.githubusercontent.com/u/1")).toBeNull();
    expect(cleanAvatarUrl("https://googleusercontent.com.evil.example/x")).toBeNull();
    expect(cleanAvatarUrl("javascript:alert(1)")).toBeNull();
    expect(cleanAvatarUrl(null)).toBeNull();
  });
});

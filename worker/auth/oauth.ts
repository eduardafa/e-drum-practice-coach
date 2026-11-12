/**
 * The sign-in round trip, the same for both providers:
 *
 * 1. /api/auth/<provider>/start makes a random `state` and a PKCE verifier,
 *    keeps both in a short-lived cookie, and redirects to the provider.
 * 2. The drummer signs in there; the provider redirects back to
 *    /api/auth/<provider>/callback with a one-time code and the state.
 * 3. The callback checks the state against the cookie (so nobody can finish
 *    a sign-in they didn't start in this browser), swaps the code for the
 *    provider's user ID (sending the verifier, so a stolen code is useless),
 *    finds or creates the user, starts a session, and returns to the app with
 *    ?signin=ok, failed, canceled or unavailable.
 */
import { OAUTH_COOKIE, clearCookie, cookie, readCookie } from "./cookies";
import { base64url, randomToken, sha256 } from "./crypto";
import { authorizeUrl, credentials, identify, type ProviderId } from "./providers";
import { createSession } from "./sessions";

/** Long enough to sign in (even creating an account), short enough to go stale. */
const OAUTH_COOKIE_SECONDS = 10 * 60;

export type SignInResult = "ok" | "failed" | "canceled" | "unavailable";

const callbackUrl = (env: Env, provider: ProviderId) => `${env.APP_ORIGIN}/api/auth/${provider}/callback`;

function backToApp(env: Env, result: SignInResult, setCookies: string[] = []): Response {
  const headers = new Headers({ Location: `${env.APP_ORIGIN}/?signin=${result}`, "Cache-Control": "no-store" });
  for (const c of setCookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

export async function startSignIn(env: Env, provider: ProviderId): Promise<Response> {
  const creds = credentials(env, provider);
  if (!creds) return backToApp(env, "unavailable");
  const state = randomToken();
  const verifier = randomToken();
  const challenge = base64url(await sha256(verifier));
  const headers = new Headers({
    Location: authorizeUrl(provider, creds, callbackUrl(env, provider), state, challenge),
    "Cache-Control": "no-store",
  });
  // base64url never contains ".", so the three parts split cleanly.
  headers.append("Set-Cookie", cookie(OAUTH_COOKIE, `${provider}.${state}.${verifier}`, OAUTH_COOKIE_SECONDS));
  return new Response(null, { status: 302, headers });
}

export async function finishSignIn(request: Request, env: Env, provider: ProviderId, now = new Date()): Promise<Response> {
  const url = new URL(request.url);
  const done = clearCookie(OAUTH_COOKIE); // one attempt per cookie, whatever happens
  const creds = credentials(env, provider);
  if (!creds) return backToApp(env, "unavailable", [done]);

  // The drummer said no, or closed the consent screen.
  const declined = url.searchParams.get("error");
  if (declined) return backToApp(env, declined === "access_denied" ? "canceled" : "failed", [done]);

  const [cookieProvider, state, verifier] = (readCookie(request, OAUTH_COOKIE) ?? "").split(".");
  const code = url.searchParams.get("code");
  if (!code || !state || !verifier || cookieProvider !== provider || url.searchParams.get("state") !== state) {
    return backToApp(env, "failed", [done]);
  }

  try {
    const subject = await identify(provider, creds, code, callbackUrl(env, provider), verifier, now);
    const userId = await findOrCreateUser(env.DB, provider, subject, now);
    return backToApp(env, "ok", [done, await createSession(env.DB, userId, provider, now)]);
  } catch (error) {
    console.error(`sign-in with ${provider} failed`, error);
    return backToApp(env, "failed", [done]);
  }
}

/** The user for this provider account, created on first sign-in. */
export async function findOrCreateUser(db: D1Database, provider: ProviderId, subject: string, now = new Date()): Promise<string> {
  const find = db.prepare("SELECT user_id FROM identities WHERE provider = ? AND subject = ?").bind(provider, subject);
  const existing = await find.first<string>("user_id");
  if (existing) return existing;

  const userId = crypto.randomUUID();
  const at = now.toISOString();
  try {
    // One transaction, so a user never exists without its identity.
    await db.batch([
      db.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").bind(userId, at),
      db.prepare("INSERT INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)").bind(provider, subject, userId, at),
    ]);
    return userId;
  } catch (error) {
    // The same account signing in twice at once: the other request won.
    const winner = await find.first<string>("user_id");
    if (winner) return winner;
    throw error;
  }
}

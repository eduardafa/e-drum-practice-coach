/**
 * The Worker behind the app. Cloudflare serves the built app from dist/
 * for every path except /api/*, which comes here (`run_worker_first` in
 * wrangler.jsonc). The API keeps synced practice history in D1.
 *
 * The API only answers on the production origin (APP_ORIGIN). Pull-request
 * previews are versions of this same Worker with the same database, so on
 * any other host it refuses with 503 rather than touch production data.
 */
import { finishSignIn, startSignIn } from "./auth/oauth";
import { PROVIDERS, configuredProviders, type ProviderId } from "./auth/providers";
import { endSession, readSession } from "./auth/sessions";
import { json, problem } from "./http";
import { deleteRecords, pullRecords, pushRecords } from "./records";
import { SESSION_COOKIE, clearCookie } from "./auth/cookies";

type Handler = (request: Request, env: Env) => Promise<Response>;

/** Every route: path, then method. */
const ROUTES = new Map<string, Partial<Record<string, Handler>>>([
  ["/api/health", { GET: (_, env) => health(env) }],
  ["/api/me", { GET: me }],
  ["/api/auth/signout", { POST: signOut }],
  ["/api/records", { GET: signedIn(pullRecords), POST: signedIn(pushRecords), DELETE: signedIn(deleteRecords) }],
  ["/api/account", { DELETE: signedIn(deleteAccount) }],
  ...PROVIDERS.flatMap((provider): [string, Partial<Record<string, Handler>>][] => [
    [`/api/auth/${provider}/start`, { GET: (_, env) => startSignIn(env, provider) }],
    [`/api/auth/${provider}/callback`, { GET: (request, env) => finishSignIn(request, env, provider) }],
  ]),
]);

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.origin !== env.APP_ORIGIN) {
    return problem(503, "unavailable", "Sync only runs on the main site, not on previews.");
  }

  const methods = ROUTES.get(url.pathname);
  if (!methods) return problem(404, "not-found", "No such API route.");
  const handler = methods[request.method];
  if (!handler) {
    const accepted = Object.keys(methods).join(", ");
    return problem(405, "method-not-allowed", `Use ${accepted}.`, { Allow: accepted });
  }

  // Anything that changes data must come from the app itself. SameSite=Lax
  // already keeps the session cookie off cross-site POSTs; this is the
  // second lock (and covers browsers that don't do SameSite).
  if (request.method !== "GET" && request.headers.get("Origin") !== env.APP_ORIGIN) {
    return problem(403, "forbidden", "Requests that change data must come from the app.");
  }

  // Sign-in is limited per IP address; signed-in calls per account (in signedIn).
  if (url.pathname.startsWith("/api/auth/") && !(await withinLimit(env.AUTH_LIMIT, `ip:${clientIp(request)}`))) {
    return tooMany();
  }

  return handler(request, env);
}

const clientIp = (request: Request) => request.headers.get("CF-Connecting-IP") ?? "unknown";

async function withinLimit(limiter: RateLimit, key: string): Promise<boolean> {
  try {
    return (await limiter.limit({ key })).success;
  } catch (error) {
    // A limiter outage shouldn't lock everyone out.
    console.error("rate limiter failed", error);
    return true;
  }
}

const tooMany = () => problem(429, "rate-limited", "Too many requests. Try again in a minute.", { "Retry-After": "60" });

/** Wraps a handler that needs a signed-in user: 401 otherwise, 429 over the per-account limit. */
function signedIn(handler: (request: Request, env: Env, userId: string) => Promise<Response>): Handler {
  return async (request, env) => {
    const session = await readSession(env.DB, request);
    if (!session) return problem(401, "signed-out", "Sign in to sync your history.");
    if (!(await withinLimit(env.API_LIMIT, `user:${session.userId}`))) return tooMany();
    const res = await handler(request, env, session.userId);
    if (session.setCookie) res.headers.append("Set-Cookie", session.setCookie);
    return res;
  };
}

/** The Worker answers, and the database answers with the last migration applied. */
async function health(env: Env): Promise<Response> {
  try {
    const row = await env.DB.prepare("SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1").first<{ name: string }>();
    return json({ ok: true, schema: row?.name ?? null });
  } catch (error) {
    console.error("health: database check failed", error);
    return problem(503, "database", "The database isn't answering.");
  }
}

export interface MeResponse {
  /** Null when signed out. Name and picture come from the provider at sign-in. */
  user: { id: string; provider: ProviderId; name: string | null; avatarUrl: string | null } | null;
  /** The sign-in options that are set up on the server. */
  providers: ProviderId[];
}

/** Who this browser is signed in as, and how it could sign in. */
async function me(request: Request, env: Env): Promise<Response> {
  const session = await readSession(env.DB, request);
  const body: MeResponse = {
    // The ID is this app's own random one: the app keys its sync progress by it.
    user: session && { id: session.userId, provider: session.provider, name: session.name, avatarUrl: session.avatarUrl },
    providers: configuredProviders(env),
  };
  return json(body, 200, session?.setCookie ? { "Set-Cookie": session.setCookie } : {});
}

async function signOut(request: Request, env: Env): Promise<Response> {
  return new Response(null, { status: 204, headers: { "Set-Cookie": await endSession(env.DB, request), "Cache-Control": "no-store" } });
}

/**
 * Deletes the account and everything stored with it: identities, sessions
 * and synced records all go with the user row (ON DELETE CASCADE).
 */
async function deleteAccount(_request: Request, env: Env, userId: string): Promise<Response> {
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
  return new Response(null, { status: 204, headers: { "Set-Cookie": clearCookie(SESSION_COOKIE), "Cache-Control": "no-store" } });
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      console.error("unhandled API error", error);
      return problem(500, "internal", "Something went wrong on the server.");
    }
  },
} satisfies ExportedHandler<Env>;

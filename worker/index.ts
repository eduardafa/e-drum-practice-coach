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

type Handler = (request: Request, env: Env) => Promise<Response>;

/** Every route: path, then method. */
const ROUTES = new Map<string, Partial<Record<string, Handler>>>([
  ["/api/health", { GET: (_, env) => health(env) }],
  ["/api/me", { GET: me }],
  ["/api/auth/signout", { POST: signOut }],
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
    const allowed = Object.keys(methods).join(", ");
    return problem(405, "method-not-allowed", `Use ${allowed}.`, { Allow: allowed });
  }

  // Anything that changes data must come from the app itself. SameSite=Lax
  // already keeps the session cookie off cross-site POSTs; this is the
  // second lock (and covers browsers that don't do SameSite).
  if (request.method !== "GET" && request.headers.get("Origin") !== env.APP_ORIGIN) {
    return problem(403, "forbidden", "Requests that change data must come from the app.");
  }

  return handler(request, env);
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
  user: { provider: ProviderId; name: string | null; avatarUrl: string | null } | null;
  /** The sign-in options that are set up on the server. */
  providers: ProviderId[];
}

/** Who this browser is signed in as, and how it could sign in. */
async function me(request: Request, env: Env): Promise<Response> {
  const session = await readSession(env.DB, request);
  const body: MeResponse = {
    user: session && { provider: session.provider, name: session.name, avatarUrl: session.avatarUrl },
    providers: configuredProviders(env),
  };
  return json(body, 200, session?.setCookie ? { "Set-Cookie": session.setCookie } : {});
}

async function signOut(request: Request, env: Env): Promise<Response> {
  return new Response(null, { status: 204, headers: { "Set-Cookie": await endSession(env.DB, request), "Cache-Control": "no-store" } });
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

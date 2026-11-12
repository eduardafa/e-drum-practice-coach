/**
 * The Worker behind the app. Cloudflare serves the built app from dist/
 * for every path except /api/*, which comes here (`run_worker_first` in
 * wrangler.jsonc). The API keeps synced practice history in D1.
 *
 * The API only answers on the production origin (APP_ORIGIN). Pull-request
 * previews are versions of this same Worker with the same database, so on
 * any other host it refuses with 503 rather than touch production data.
 */
import { json, problem } from "./http";

/** Paths the API knows, with the methods each accepts (for 405 vs 404). */
const ROUTES: Record<string, readonly string[]> = {
  "/api/health": ["GET"],
};

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.origin !== env.APP_ORIGIN) {
    return problem(503, "unavailable", "Sync only runs on the main site, not on previews.");
  }

  const methods = ROUTES[url.pathname];
  if (!methods) return problem(404, "not-found", "No such API route.");
  if (!methods.includes(request.method)) {
    return problem(405, "method-not-allowed", `Use ${methods.join(" or ")}.`, { Allow: methods.join(", ") });
  }

  switch (url.pathname) {
    case "/api/health":
      return health(env);
  }
  return problem(404, "not-found", "No such API route.");
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

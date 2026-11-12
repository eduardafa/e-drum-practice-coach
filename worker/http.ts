/**
 * JSON responses for the API. The static app's security headers come from
 * public/_headers, which only applies to assets, so API responses set their
 * own: never cached, never sniffed or framed, no referrer.
 */

const BASE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
} as const;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });
}

/** An error the app can act on: a stable `error` code plus a sentence for people. */
export function problem(status: number, error: string, message: string, headers: Record<string, string> = {}): Response {
  return json({ error, message }, status, headers);
}

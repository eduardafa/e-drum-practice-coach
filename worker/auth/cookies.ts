/**
 * Cookies, all with the `__Host-` prefix: the browser only accepts them from
 * this exact host over HTTPS with Path=/, so no other site or subdomain can
 * set or overwrite them. HttpOnly keeps them away from page scripts, and
 * SameSite=Lax keeps them off cross-site requests other than plain links,
 * which is what the sign-in redirect back from GitHub or Google is.
 */

export const SESSION_COOKIE = "__Host-session";
export const OAUTH_COOKIE = "__Host-oauth";

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/** A Set-Cookie value. `maxAge` 0 deletes the cookie. */
export function cookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export const clearCookie = (name: string) => cookie(name, "", 0);

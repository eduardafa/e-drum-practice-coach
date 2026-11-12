/**
 * Sessions: who a browser is signed in as. The browser keeps a random token
 * in the session cookie; the database keeps its SHA-256, so a copy of the
 * database can't be used to sign in. Sessions last 30 days and are renewed
 * when used in their second half, so a drummer who practices at least once every
 * two weeks stays signed in.
 */
import { SESSION_COOKIE, clearCookie, cookie, readCookie } from "./cookies";
import { randomToken, sha256Hex } from "./crypto";
import type { ProviderId } from "./providers";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_DAYS = 30;
const RENEW_BELOW_DAYS = 15;

export interface Session {
  userId: string;
  provider: ProviderId;
  /** The user's name and picture from the provider (EDU-54), if known. */
  name: string | null;
  avatarUrl: string | null;
  /** Set-Cookie to send back when the session was renewed. */
  setCookie: string | null;
}

const sessionCookie = (token: string) => cookie(SESSION_COOKIE, token, SESSION_DAYS * 24 * 60 * 60);

/** Starts a session for the user; returns the Set-Cookie header value. */
export async function createSession(db: D1Database, userId: string, provider: ProviderId, now = new Date()): Promise<string> {
  const token = randomToken();
  const expires = new Date(now.getTime() + SESSION_DAYS * DAY_MS);
  await db.batch([
    // Tidy up: expired sessions are useless, whoever they belonged to.
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now.toISOString()),
    db
      .prepare("INSERT INTO sessions (token_hash, user_id, provider, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(await sha256Hex(token), userId, provider, now.toISOString(), expires.toISOString()),
  ]);
  return sessionCookie(token);
}

/** The signed-in session for this request, or null. */
export async function readSession(db: D1Database, request: Request, now = new Date()): Promise<Session | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const hash = await sha256Hex(token);
  const row = await db
    .prepare(
      "SELECT s.user_id, s.provider, s.expires_at, u.name, u.avatar_url FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
    )
    .bind(hash)
    .first<{ user_id: string; provider: ProviderId; expires_at: string; name: string | null; avatar_url: string | null }>();
  if (!row) return null;
  const expires = new Date(row.expires_at).getTime();
  if (expires <= now.getTime()) return null;

  let setCookie: string | null = null;
  if (expires - now.getTime() < RENEW_BELOW_DAYS * DAY_MS) {
    const renewed = new Date(now.getTime() + SESSION_DAYS * DAY_MS);
    await db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").bind(renewed.toISOString(), hash).run();
    setCookie = sessionCookie(token);
  }
  return { userId: row.user_id, provider: row.provider, name: row.name, avatarUrl: row.avatar_url, setCookie };
}

/** Ends this browser's session (others stay signed in); returns the Set-Cookie that clears it. */
export async function endSession(db: D1Database, request: Request): Promise<string> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  return clearCookie(SESSION_COOKIE);
}

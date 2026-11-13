/**
 * The drummer's account on the sync server, as the app sees it. Signing in
 * is a plain link to /api/auth/<provider>/start: the browser leaves the app,
 * signs in with the provider, and comes back to /?signin=<result>.
 *
 * Anything that goes wrong here (offline, a preview, the server down) makes
 * the account "unavailable": practice and local history never depend on it.
 */

export type Provider = "github" | "google";

export const PROVIDER_LABEL: Record<Provider, string> = { github: "GitHub", google: "Google" };

export type Account =
  | { status: "loading" }
  /** Offline, a preview, local development, or the server not answering. */
  | { status: "unavailable" }
  | { status: "signed-out"; providers: Provider[] }
  | {
      status: "signed-in";
      /** This app's own ID for the account (sync progress is kept per account). */
      id: string;
      provider: Provider;
      name: string | null;
      avatarUrl: string | null;
      providers: Provider[];
    };

/** What /api/me answers (see worker/index.ts). */
interface MeResponse {
  user: { id: string; provider: Provider; name: string | null; avatarUrl: string | null } | null;
  providers: Provider[];
}

const isProvider = (x: unknown): x is Provider => x === "github" || x === "google";

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

function parseMe(body: unknown): MeResponse | null {
  if (!isRecord(body) || !Array.isArray(body.providers)) return null;
  const providers = body.providers.filter(isProvider);
  const { user } = body;
  if (user === null) return { user: null, providers };
  if (isRecord(user) && typeof user.id === "string" && isProvider(user.provider)) {
    const name = typeof user.name === "string" && user.name !== "" ? user.name : null;
    // Only HTTPS pictures, as the server and the CSP allow.
    const avatarUrl = typeof user.avatarUrl === "string" && user.avatarUrl.startsWith("https://") ? user.avatarUrl : null;
    return { user: { id: user.id, provider: user.provider, name, avatarUrl }, providers };
  }
  return null;
}

export async function fetchAccount(signal?: AbortSignal): Promise<Account> {
  try {
    const res = await fetch("/api/me", { signal, credentials: "same-origin" });
    // Vite's dev server answers unknown paths with index.html, hence the type check.
    if (!res.ok || !res.headers.get("Content-Type")?.startsWith("application/json")) return { status: "unavailable" };
    const me = parseMe(await res.json());
    if (!me) return { status: "unavailable" };
    return me.user
      ? { status: "signed-in", ...me.user, providers: me.providers }
      : { status: "signed-out", providers: me.providers };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: "unavailable" };
  }
}

/** Ends this browser's session. Throws if the server couldn't be reached. */
export async function signOut(): Promise<void> {
  const res = await fetch("/api/auth/signout", { method: "POST", credentials: "same-origin" });
  if (!res.ok) throw new Error(`Sign-out failed: ${res.status}`);
}

/** Deletes the account and everything synced to it. Throws if the server couldn't do it. */
export async function deleteAccount(): Promise<void> {
  const res = await fetch("/api/account", { method: "DELETE", credentials: "same-origin" });
  if (!res.ok) throw new Error(`Account deletion failed: ${res.status}`);
}

/** Deletes the account's synced history (the account stays). Throws if the server couldn't do it. */
export async function deleteSyncedHistory(): Promise<void> {
  const res = await fetch("/api/records", { method: "DELETE", credentials: "same-origin" });
  if (!res.ok) throw new Error(`Deleting synced history failed: ${res.status}`);
}

export const signInUrl = (provider: Provider) => `/api/auth/${provider}/start`;

export type SignInResult = "ok" | "failed" | "canceled" | "unavailable";

/** The ?signin= result the server redirected back with, if any. */
export function signInResult(search: string): SignInResult | null {
  const value = new URLSearchParams(search).get("signin");
  return value === "ok" || value === "failed" || value === "canceled" || value === "unavailable" ? value : null;
}

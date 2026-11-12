/**
 * GitHub and Google as OAuth 2.0 providers: where to send the drummer, how to
 * swap the returned code for tokens, and how to read the provider's stable
 * user ID from them. That ID is all the app keeps.
 *
 * Neither asks for more than sign-in: GitHub with no scope (public profile
 * only, and only its numeric ID is read), Google with `openid` (no email,
 * no profile).
 */
import { base64urlDecode } from "./crypto";

export type ProviderId = "github" | "google";
export const PROVIDERS: readonly ProviderId[] = ["github", "google"];

export const isProvider = (id: string): id is ProviderId => (PROVIDERS as readonly string[]).includes(id);

export interface Credentials {
  clientId: string;
  clientSecret: string;
}

/** The provider's client ID and secret, or null when it isn't set up. */
export function credentials(env: Env, id: ProviderId): Credentials | null {
  const [clientId, clientSecret] =
    id === "github" ? [env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET] : [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET];
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const configuredProviders = (env: Env) => PROVIDERS.filter((id) => credentials(env, id) !== null);

/** Thrown when a provider answers with something unusable; the drummer sees "sign-in failed". */
export class ProviderError extends Error {}

interface ProviderSpec {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  /** Extra authorization parameters. */
  params: Record<string, string>;
  /** The provider's stable user ID, from the token response. */
  subject(tokens: Record<string, unknown>, creds: Credentials, now: Date): Promise<string>;
}

const USER_AGENT = "e-drum-practice-coach";

const SPECS: Record<ProviderId, ProviderSpec> = {
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "",
    params: { allow_signup: "true" },
    async subject(tokens) {
      const token = tokens.access_token;
      if (typeof token !== "string") throw new ProviderError("GitHub sent no access token");
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": USER_AGENT },
      });
      if (!res.ok) throw new ProviderError(`GitHub user lookup failed: ${res.status}`);
      const user: { id?: unknown } = await res.json();
      if (typeof user.id !== "number") throw new ProviderError("GitHub user has no ID");
      // The token is dropped here: it was only needed to read the ID.
      return String(user.id);
    },
  },
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid",
    params: { prompt: "select_account" },
    subject(tokens, creds, now) {
      // The ID token came straight from Google's token endpoint over TLS, in
      // exchange for our client secret, so OpenID Connect (Core 3.1.3.7) lets
      // TLS stand in for checking its signature. Issuer, audience and expiry
      // are still checked.
      const idToken = tokens.id_token;
      if (typeof idToken !== "string") return Promise.reject(new ProviderError("Google sent no ID token"));
      const claims = decodeJwtPayload(idToken);
      const issuers = ["https://accounts.google.com", "accounts.google.com"];
      if (!issuers.includes(String(claims.iss))) return Promise.reject(new ProviderError("Wrong ID token issuer"));
      if (claims.aud !== creds.clientId) return Promise.reject(new ProviderError("ID token is for another app"));
      if (typeof claims.exp !== "number" || claims.exp * 1000 <= now.getTime()) {
        return Promise.reject(new ProviderError("ID token expired"));
      }
      if (typeof claims.sub !== "string" || claims.sub === "") return Promise.reject(new ProviderError("ID token has no subject"));
      return Promise.resolve(claims.sub);
    },
  },
};


function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const payload = jwt.split(".")[1];
  if (!payload) throw new ProviderError("Malformed ID token");
  let claims: unknown;
  try {
    claims = JSON.parse(base64urlDecode(payload));
  } catch {
    throw new ProviderError("Malformed ID token");
  }
  if (!isRecord(claims)) throw new ProviderError("Malformed ID token");
  return claims;
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

/** Where to send the drummer to sign in. */
export function authorizeUrl(id: ProviderId, creds: Credentials, redirectUri: string, state: string, challenge: string): string {
  const spec = SPECS[id];
  const url = new URL(spec.authorizeUrl);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(spec.scope ? { scope: spec.scope } : {}),
    ...spec.params,
  }).toString();
  return url.toString();
}

/** Swaps the authorization code for tokens and returns the provider's user ID. */
export async function identify(
  id: ProviderId,
  creds: Credentials,
  code: string,
  redirectUri: string,
  verifier: string,
  now = new Date(),
): Promise<string> {
  const spec = SPECS[id];
  const res = await fetch(spec.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": USER_AGENT },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code_verifier: verifier,
    }),
  });
  // GitHub reports errors with status 200 and an `error` field.
  const tokens: Record<string, unknown> = res.ok ? await res.json() : {};
  if (!res.ok || "error" in tokens) throw new ProviderError(`Token exchange failed: ${res.status} ${typeof tokens.error === "string" ? tokens.error : ""}`);
  return spec.subject(tokens, creds, now);
}

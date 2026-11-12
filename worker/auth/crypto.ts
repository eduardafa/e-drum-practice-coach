/** Random tokens and hashes, from Web Crypto (the same API in workerd and Node). */

export function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function base64urlDecode(text: string): string {
  const b64 = text.replaceAll("-", "+").replaceAll("_", "/");
  return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

/** 32 random bytes (256 bits) as base64url: unguessable. */
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export async function sha256Hex(text: string): Promise<string> {
  return [...(await sha256(text))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

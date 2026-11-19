/**
 * A random version 4 UUID, the same shape as crypto.randomUUID(). That function only exists on secure pages (https
 * or localhost), so opening the app from another device over plain http would throw; crypto.getRandomValues works on
 * every page.
 */
export function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // The version (4) and variant (10xx) bits, as RFC 9562 sets them.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Whether this is an iPhone or iPad, where no browser can connect a kit: Apple makes every browser there run on
 * Safari's engine, which has no Web MIDI. Chrome or Brave on an iPhone can't do it either, so "use another browser"
 * is the wrong advice there.
 *
 * iPadOS asks for the desktop site and reports itself as a Mac, so a "Macintosh" with a touch screen counts as an
 * iPad (Macs have no touch screen).
 */
export function appleMobileDevice(userAgent: string, maxTouchPoints: number): "iPhone" | "iPad" | null {
  if (/iPhone|iPod/.test(userAgent)) return "iPhone";
  if (/iPad/.test(userAgent)) return "iPad";
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return "iPad";
  return null;
}

/** appleMobileDevice for this browser. */
export function thisAppleMobileDevice(): "iPhone" | "iPad" | null {
  if (typeof navigator === "undefined") return null;
  return appleMobileDevice(navigator.userAgent, navigator.maxTouchPoints);
}

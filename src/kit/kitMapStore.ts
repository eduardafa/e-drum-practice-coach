/**
 * Recorded kit maps, per MIDI device name, in this browser. A per-browser
 * convenience like the settings: the app falls back to the standard map when
 * storage is unavailable.
 */
import { parseKitMaps, type KitMap } from "./kitMap";

const KEY = "edrum-coach:kit-maps:v1";

export function loadKitMaps(): Record<string, KitMap> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseKitMaps(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function saveKitMaps(maps: Readonly<Record<string, KitMap>>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(maps));
  } catch {
    // Storage full or blocked: the map just won't persist.
  }
}

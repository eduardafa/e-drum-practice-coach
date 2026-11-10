import { MAX_BPM, MIN_BPM, type MetronomeSettings } from "./audio/schedule";
import type { ScoringOptions } from "./timing/grid";

const KEY = "edrum-coach:settings:v1";

export interface SavedSettings {
  metronome?: MetronomeSettings;
  scoring?: ScoringOptions;
}

/** Per-browser convenience only; the app works fine when storage is unavailable. */
export function loadSettings(): SavedSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedSettings;
    const m = parsed.metronome;
    if (m && !(m.bpm >= MIN_BPM && m.bpm <= MAX_BPM && [1, 2, 3, 4].includes(m.subdivision))) {
      delete parsed.metronome;
    }
    return parsed;
  } catch {
    return {};
  }
}

export function saveSettings(settings: SavedSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage full or blocked: settings just won't persist.
  }
}

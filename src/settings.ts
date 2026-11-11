import { isSubdivision, MAX_BPM, MIN_BPM, type MetronomeSettings } from "./audio/schedule";
import { isSkillLevel, type SkillLevel } from "./profiles";
import type { ScoringOptions } from "./timing/grid";

const KEY = "edrum-coach:settings:v1";

export interface SavedSettings {
  metronome?: MetronomeSettings;
  scoring?: ScoringOptions;
  skillLevel?: SkillLevel;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function parseMetronome(value: unknown): MetronomeSettings | undefined {
  if (!isRecord(value)) return undefined;
  const { bpm, beatsPerBar, subdivision, clickSubdivisions } = value;
  if (
    inRange(bpm, MIN_BPM, MAX_BPM) &&
    inRange(beatsPerBar, 1, 16) &&
    isSubdivision(subdivision) &&
    typeof clickSubdivisions === "boolean"
  ) {
    return { bpm, beatsPerBar, subdivision, clickSubdivisions };
  }
  return undefined;
}

function parseScoring(value: unknown): ScoringOptions | undefined {
  if (!isRecord(value)) return undefined;
  const { toleranceMs, latencyOffsetMs } = value;
  if (inRange(toleranceMs, 0, 1000) && inRange(latencyOffsetMs, -1000, 1000)) {
    return { toleranceMs, latencyOffsetMs };
  }
  return undefined;
}

/**
 * Validates stored settings. Anything malformed or out of range is dropped
 * so the app falls back to defaults instead of running with bad values.
 */
export function parseSettings(raw: unknown): SavedSettings {
  if (!isRecord(raw)) return {};
  return {
    metronome: parseMetronome(raw.metronome),
    scoring: parseScoring(raw.scoring),
    skillLevel: isSkillLevel(raw.skillLevel) ? raw.skillLevel : undefined,
  };
}

/** Per-browser convenience only; the app works fine when storage is unavailable. */
export function loadSettings(): SavedSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parseSettings(parsed);
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

import { findExercise } from "./exercises/library";
import { isAccuracyMode, type AccuracyMode } from "./playalong/results";
import { isHandedness, type Handedness } from "./handedness";
import { isGetReadySec } from "./playalong/getReady";
import { SESSION_LOOPS } from "./playalong/session";
import { isVolume } from "./audio/volume";
import { isSubdivision, MAX_BPM, MIN_BPM, type MetronomeSettings } from "./audio/schedule";
import { isSkillLevel, type SkillLevel } from "./profiles";
import type { ScoringOptions } from "./timing/grid";

const KEY = "edrum-coach:settings:v1";

export interface SavedSettings {
  metronome?: MetronomeSettings;
  scoring?: ScoringOptions;
  skillLevel?: SkillLevel;
  /** The drummer has opened the metronome guide at least once. */
  guideSeen?: boolean;
  /** The exercise shown as notation, if any. */
  exerciseId?: string;
  /** Which accuracy the play-along results lead with. */
  accuracyMode?: AccuracyMode;
  /** How many loops a play-along session lasts. */
  sessionLoops?: number;
  /** The last tempo used for each exercise, by exercise id. */
  exerciseTempos?: Record<string, number>;
  /** Metronome click volume, as a gain (see audio/volume). */
  volume?: number;
  /** Seconds of get-ready countdown before a play-along session; 0 for none. */
  getReadySec?: number;
  /** Right- or left-handed (mirrored) kit. */
  handedness?: Handedness;
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

/** Keeps the tempos of exercises still in the library, within the metronome's range. */
function parseExerciseTempos(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  const tempos: Record<string, number> = {};
  for (const [id, bpm] of Object.entries(value)) {
    if (findExercise(id) !== undefined && inRange(bpm, MIN_BPM, MAX_BPM)) tempos[id] = bpm;
  }
  return Object.keys(tempos).length > 0 ? tempos : undefined;
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
    guideSeen: raw.guideSeen === true ? true : undefined,
    // Only ids still in the library: an exercise removed in an update is simply forgotten.
    exerciseId: typeof raw.exerciseId === "string" && findExercise(raw.exerciseId) ? raw.exerciseId : undefined,
    accuracyMode: isAccuracyMode(raw.accuracyMode) ? raw.accuracyMode : undefined,
    sessionLoops: SESSION_LOOPS.find((n) => n === raw.sessionLoops),
    exerciseTempos: parseExerciseTempos(raw.exerciseTempos),
    volume: isVolume(raw.volume) ? raw.volume : undefined,
    getReadySec: isGetReadySec(raw.getReadySec) ? raw.getReadySec : undefined,
    handedness: isHandedness(raw.handedness) ? raw.handedness : undefined,
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

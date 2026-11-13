/**
 * Songs opened before, in this browser: each one's name, length, when it was
 * last opened, and its beat grid, under its fingerprint. Never its audio:
 * reopening a song still means picking the file, but its grid comes back
 * without analyzing it again. Validated on load, like the settings.
 */
import type { BeatGrid } from "./beats";

export interface RememberedSong {
  fingerprint: string;
  title: string;
  /** Seconds. */
  duration: number;
  /** Temporal.Instant string. */
  lastOpened: string;
  grid: BeatGrid;
}

const KEY = "edrum-coach:songs:v1";
/** How many songs the list keeps; the oldest drops off. */
export const MAX_REMEMBERED = 12;
/** More beats than any song a drummer plays along to (20 minutes at 240 BPM). */
const MAX_BEATS = 4800;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseGrid(value: unknown): BeatGrid | null {
  if (!isRecord(value)) return null;
  const { beats, firstDownbeat, bpm } = value;
  if (!Array.isArray(beats) || beats.length > MAX_BEATS) return null;
  if (!beats.every((b, i): b is number => typeof b === "number" && Number.isFinite(b) && b >= 0 && (i === 0 || b > beats[i - 1]))) return null;
  if (typeof firstDownbeat !== "number" || !Number.isInteger(firstDownbeat) || firstDownbeat < 0 || firstDownbeat > 3) return null;
  if (typeof bpm !== "number" || !Number.isFinite(bpm) || bpm < 20 || bpm > 400) return null;
  return { beats, firstDownbeat, bpm };
}

function parseSong(value: unknown): RememberedSong | null {
  if (!isRecord(value)) return null;
  const { fingerprint, title, duration, lastOpened } = value;
  const grid = parseGrid(value.grid);
  if (typeof fingerprint !== "string" || fingerprint.length === 0 || fingerprint.length > 40) return null;
  if (typeof title !== "string" || title.length > 300) return null;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) return null;
  if (typeof lastOpened !== "string" || !grid) return null;
  try {
    Temporal.Instant.from(lastOpened);
  } catch {
    return null;
  }
  return { fingerprint, title, duration, lastOpened, grid };
}

/** The saved list, newest first; malformed entries are dropped. */
export function parseSongs(raw: unknown): RememberedSong[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((v) => parseSong(v) ?? []).slice(0, MAX_REMEMBERED);
}

/** The list with `song` at the front (replacing an older entry for the same song), capped. */
export function remember(songs: readonly RememberedSong[], song: RememberedSong): RememberedSong[] {
  return [song, ...songs.filter((s) => s.fingerprint !== song.fingerprint)].slice(0, MAX_REMEMBERED);
}

export function loadSongs(): RememberedSong[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseSongs(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveSongs(songs: readonly RememberedSong[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(songs));
  } catch {
    // Storage full or blocked: songs are just analyzed again next time.
  }
}

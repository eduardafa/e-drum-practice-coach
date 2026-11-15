/**
 * Drum tabs opened with a song, remembered in this browser under the song's
 * fingerprint (EDU-99), so reopening the song brings its tab back already
 * lined up. Kept apart from the song list (songStore) so that a tab that
 * doesn't fit never costs the song its beats: when storage is full, other
 * songs' tabs go first, then this one simply isn't remembered.
 *
 * Only what the app read from the MIDI file is kept (each note's beat, pad
 * and open hi-hat, plus the tab's name and how it was lined up), never the
 * file. Validated on load, like the settings.
 */
import { NITRO_MAX_PADS, type PadId } from "../kit/nitroMax";
import type { DrumTab, TabNote } from "./drumTab";

const KEY = "edrum-coach:song-tabs:v1";
/** More notes than a five-minute song of sixteenths on three pads; longer tabs aren't remembered. */
export const MAX_TAB_NOTES = 10_000;

export interface RememberedTab {
  fingerprint: string;
  name: string;
  /** Song beats the tab is moved by (tab beat b lands on song beat b + shift). */
  shift: number;
  tab: DrumTab;
}

/** How a note is written down: [beat, pad, 1 if an open hi-hat]. */
type StoredNote = [number, PadId, 0 | 1];

interface StoredTab {
  fingerprint: string;
  name: string;
  shift: number;
  beatsPerBar: number;
  skipped: number;
  firstNoteSeconds: number;
  notes: StoredNote[];
}

/** The part of Storage this needs, so tests can stand in a full one. */
export type TabStorage = Pick<Storage, "getItem" | "setItem">;

const PAD_IDS = new Set<string>(NITRO_MAX_PADS.map((p) => p.id));
const isPad = (x: unknown): x is PadId => typeof x === "string" && PAD_IDS.has(x);
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function parseNote(x: unknown): TabNote | null {
  if (!Array.isArray(x) || x.length !== 3) return null;
  const [beat, pad, open] = x as unknown[];
  if (!finite(beat) || beat < 0 || !isPad(pad) || (open !== 0 && open !== 1)) return null;
  return { beat, pad, open: open === 1 };
}

function parseTab(x: unknown): RememberedTab | null {
  if (!isRecord(x)) return null;
  const { fingerprint, name, shift, beatsPerBar, skipped, firstNoteSeconds, notes } = x;
  if (typeof fingerprint !== "string" || fingerprint.length === 0 || fingerprint.length > 40) return null;
  if (typeof name !== "string" || name.length > 300) return null;
  if (!finite(shift) || !Number.isInteger(shift) || Math.abs(shift) > 10_000) return null;
  if (!finite(beatsPerBar) || !Number.isInteger(beatsPerBar) || beatsPerBar < 1 || beatsPerBar > 16) return null;
  if (!finite(skipped) || !Number.isInteger(skipped) || skipped < 0) return null;
  if (!finite(firstNoteSeconds) || firstNoteSeconds < 0) return null;
  if (!Array.isArray(notes) || notes.length === 0 || notes.length > MAX_TAB_NOTES) return null;
  const parsed: TabNote[] = [];
  for (const n of notes) {
    const note = parseNote(n);
    // One bad note means the copy can't be trusted: drop the tab, not just the note.
    if (!note) return null;
    parsed.push(note);
  }
  return { fingerprint, name, shift, tab: { notes: parsed, beatsPerBar, skipped, firstNoteSeconds } };
}

/** The saved tabs, newest first; malformed entries are dropped. */
export function parseTabs(raw: unknown): RememberedTab[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => parseTab(x) ?? []);
}

function encode({ fingerprint, name, shift, tab }: RememberedTab): StoredTab {
  return {
    fingerprint,
    name,
    shift,
    beatsPerBar: tab.beatsPerBar,
    skipped: tab.skipped,
    firstNoteSeconds: tab.firstNoteSeconds,
    notes: tab.notes.map((n) => [n.beat, n.pad, n.open ? 1 : 0]),
  };
}

function read(storage: TabStorage): RememberedTab[] {
  try {
    const raw = storage.getItem(KEY);
    return raw ? parseTabs(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function write(storage: TabStorage, tabs: readonly RememberedTab[]): boolean {
  try {
    storage.setItem(KEY, JSON.stringify(tabs.map(encode)));
    return true;
  } catch {
    return false;
  }
}

/** The tab remembered for a song, if any. */
export function loadTab(fingerprint: string, storage: TabStorage = localStorage): RememberedTab | null {
  return read(storage).find((t) => t.fingerprint === fingerprint) ?? null;
}

export type SaveResult = "saved" | "too-long" | "full";

/**
 * Remembers a song's tab (replacing its old one), newest first. If storage is
 * full, other songs' tabs are dropped oldest first until it fits; if even
 * alone it doesn't fit, it isn't remembered and the others are left as they were.
 */
export function saveTab(entry: RememberedTab, storage: TabStorage = localStorage): SaveResult {
  if (entry.tab.notes.length > MAX_TAB_NOTES) return "too-long";
  const others = read(storage).filter((t) => t.fingerprint !== entry.fingerprint);
  for (let keep = others.length; keep >= 0; keep--) {
    if (write(storage, [entry, ...others.slice(0, keep)])) return "saved";
  }
  // Not even alone: keep what was there before, without this song's old copy.
  write(storage, others);
  return "full";
}

/** Forgets a song's tab ("Remove tab", or Forget on the song). */
export function forgetTab(fingerprint: string, storage: TabStorage = localStorage): void {
  const tabs = read(storage);
  if (tabs.some((t) => t.fingerprint === fingerprint)) write(storage, tabs.filter((t) => t.fingerprint !== fingerprint));
}

/** Drops the tabs of songs no longer remembered (the song list keeps the latest few). */
export function keepTabsFor(fingerprints: readonly string[], storage: TabStorage = localStorage): void {
  const keep = new Set(fingerprints);
  const tabs = read(storage);
  if (tabs.some((t) => !keep.has(t.fingerprint))) write(storage, tabs.filter((t) => keep.has(t.fingerprint)));
}

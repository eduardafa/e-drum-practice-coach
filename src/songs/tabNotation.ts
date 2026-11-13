/**
 * A drum tab as notation: its notes snapped to positions a staff can write,
 * cut into lines of a few bars, and where in the tab the song is now. MIDI
 * files carry exact timing (often a little off the grid); notation needs
 * 16th notes or triplets. Each beat is snapped to whichever of the two grids
 * fits its notes better, so swung or triplet beats stay triplets and straight
 * ones stay straight. Pure, so it's tested.
 */
import { TICKS_PER_QUARTER, type Exercise, type ExerciseNote } from "../exercises/types";
import type { BeatGrid } from "./beats";
import type { DrumTab } from "./drumTab";

/** Bars per line of notation. */
export const BARS_PER_LINE = 2;
const BEATS_PER_BAR = 4;
const STRAIGHT = TICKS_PER_QUARTER / 4; // a 16th note
const TRIPLET = TICKS_PER_QUARTER / 3; // an eighth-note triplet

export interface SnappedNote {
  /** Ticks from the start of the tab (TICKS_PER_QUARTER to a beat). */
  tick: number;
  pad: ExerciseNote["pad"];
  open: boolean;
}

const snapTo = (offset: number, step: number) => Math.round(offset / step) * step;

/** The tab's notes on the notation grid, in order; the same pad twice at one spot counts once. */
export function snapTab(tab: DrumTab): SnappedNote[] {
  const byBeat = new Map<number, DrumTab["notes"][number][]>();
  for (const n of tab.notes) {
    const beat = Math.floor(n.beat + 1e-9);
    const list = byBeat.get(beat) ?? [];
    list.push(n);
    byBeat.set(beat, list);
  }
  const out: SnappedNote[] = [];
  const seen = new Set<string>();
  for (const [beat, notes] of byBeat) {
    const offsets = notes.map((n) => (n.beat - beat) * TICKS_PER_QUARTER);
    const error = (step: number) => offsets.reduce((sum, o) => sum + Math.abs(o - snapTo(o, step)), 0);
    // Straight unless triplets fit clearly better.
    const step = error(TRIPLET) + 0.5 < error(STRAIGHT) ? TRIPLET : STRAIGHT;
    notes.forEach((n, i) => {
      const tick = beat * TICKS_PER_QUARTER + snapTo(offsets[i], step);
      const key = `${tick}:${n.pad}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ tick, pad: n.pad, open: n.open });
    });
  }
  return out.toSorted((a, b) => a.tick - b.tick || a.pad.localeCompare(b.pad));
}

/** Line `line` of the tab as an exercise the notation engraver can draw: BARS_PER_LINE bars of 4/4. */
export function tabLine(notes: readonly SnappedNote[], line: number): Exercise {
  const lineTicks = BARS_PER_LINE * BEATS_PER_BAR * TICKS_PER_QUARTER;
  const from = line * lineTicks;
  return {
    id: `tab-line-${line}`,
    name: `Bars ${line * BARS_PER_LINE + 1}–${(line + 1) * BARS_PER_LINE}`,
    category: "groove",
    description: "",
    timeSignature: { beats: BEATS_PER_BAR, unit: 4 },
    bars: BARS_PER_LINE,
    tempo: { min: 20, suggested: 100, max: 300 },
    notes: notes
      .filter((n) => n.tick >= from && n.tick < from + lineTicks)
      .map((n): ExerciseNote => {
        const note: ExerciseNote = { tick: n.tick - from, pad: n.pad, dynamic: "normal" };
        if (n.open) note.open = true;
        return note;
      }),
  };
}

/** How many lines the tab takes. */
export function lineCount(notes: readonly SnappedNote[]): number {
  const last = notes.at(-1)?.tick ?? 0;
  return Math.floor(last / (BARS_PER_LINE * BEATS_PER_BAR * TICKS_PER_QUARTER)) + 1;
}

/**
 * Where the song is in the tab, in tab beats, at song time `seconds`: the
 * inverse of placing the tab (tab beat b on song beat b + shift), moving
 * evenly through each song beat. Before the first beat or after the last,
 * it carries on at the nearest beat's pace.
 */
export function tabBeatAt(grid: BeatGrid, shift: number, seconds: number): number {
  const beats = grid.beats;
  if (beats.length < 2) return -shift;
  let i = 0;
  while (i + 2 < beats.length && beats[i + 1] <= seconds) i++;
  const gap = beats[i + 1] - beats[i];
  return i + (seconds - beats[i]) / gap - shift;
}

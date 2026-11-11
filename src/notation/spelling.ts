/**
 * Rhythm spelling: turns an exercise's tick positions into the notes and rests
 * a drummer would read on a staff.
 *
 * Drum notation has two voices: hands (stems up) and feet (stems down). In
 * each voice, a note is written as long as it can be until the next note in
 * that voice, never crossing a beat (so beams group by beat), and gaps become
 * rests. Drums don't sustain, so a note that can't be written with one value
 * is shortened and followed by rests instead of tied.
 *
 * Pure logic, separate from the engraving library, so every rule is tested.
 */
import type { PadId } from "../kit/nitroMax";
import { ticksPerBar, ticksPerBeat, type Exercise, type ExerciseNote, type TimeSignature } from "../exercises/types";

export type StaffVoice = "hands" | "feet";

const FEET: ReadonlySet<PadId> = new Set<PadId>(["kick", "hihatPedal"]);

export function voiceOf(pad: PadId): StaffVoice {
  return FEET.has(pad) ? "feet" : "hands";
}

/** VexFlow's names for note values. */
export type NoteValue = "w" | "h" | "q" | "8" | "16" | "32";

export interface SpelledEvent {
  /** Start, in ticks from the start of the exercise. */
  tick: number;
  /** Written length in ticks (a triplet eighth is 16). */
  ticks: number;
  value: NoteValue;
  dotted: boolean;
  /** Start tick of the triplet group this event belongs to, or null. */
  tuplet: number | null;
  /** The notes struck together; empty for a rest. */
  notes: ExerciseNote[];
}

export interface SpelledBar {
  /** null when the voice has nothing to play in this bar. */
  hands: SpelledEvent[] | null;
  feet: SpelledEvent[] | null;
}

/** Plain values from longest to shortest, with their length in ticks. */
const PLAIN: readonly [number, NoteValue][] = [
  [192, "w"],
  [96, "h"],
  [48, "q"],
  [24, "8"],
  [12, "16"],
  [6, "32"],
];
/** Values a note may take, including dotted ones. */
const NOTE_LENGTHS: readonly [number, NoteValue, boolean][] = [
  [192, "w", false],
  [144, "h", true],
  [96, "h", false],
  [72, "q", true],
  [48, "q", false],
  [36, "8", true],
  [24, "8", false],
  [18, "16", true],
  [12, "16", false],
  [6, "32", false],
];
/** Triplet values in a quarter-note beat: written value and real length. */
const TRIPLET: Readonly<Record<number, NoteValue>> = { 32: "q", 16: "8", 8: "16" };

/** 6/8, 9/8 and 12/8 group eighths in threes: the beat is a dotted quarter. */
export function isCompound(ts: TimeSignature): boolean {
  return ts.unit === 8 && ts.beats % 3 === 0 && ts.beats > 3;
}

/** The length of one beam group: a beat, or a dotted quarter in compound time. */
export function groupTicks(ts: TimeSignature): number {
  return isCompound(ts) ? 3 * ticksPerBeat(ts) : ticksPerBeat(ts);
}

function rest(tick: number, ticks: number, value: NoteValue, tuplet: number | null = null): SpelledEvent {
  return { tick, ticks, value, dotted: false, tuplet, notes: [] };
}

/**
 * Rests from `start` for `length` ticks: the longest plain value that fits and
 * starts on a multiple of itself, so rests line up with the beat.
 */
function rests(start: number, length: number, groupStart: number): SpelledEvent[] {
  const out: SpelledEvent[] = [];
  let at = start;
  while (at < start + length) {
    const left = start + length - at;
    const offset = at - groupStart;
    const fit = PLAIN.find(([t]) => t <= left && offset % t === 0);
    if (!fit) throw new Error(`can't spell a rest of ${left} ticks at offset ${offset}`);
    out.push(rest(at, fit[0], fit[1]));
    at += fit[0];
  }
  return out;
}

/** A note lasting up to `length` ticks: the longest value that fits, then rests. */
function noteThenRests(notes: ExerciseNote[], start: number, length: number, groupStart: number): SpelledEvent[] {
  const fit = NOTE_LENGTHS.find(([t]) => t <= length);
  if (!fit) throw new Error(`can't spell a note of ${length} ticks`);
  const [ticks, value, dotted] = fit;
  const event: SpelledEvent = { tick: start, ticks, value, dotted, tuplet: null, notes };
  return ticks === length ? [event] : [event, ...rests(start + ticks, length - ticks, groupStart)];
}

/** Spells one beam group of one voice. `onsets` maps tick to the notes struck there. */
function spellGroup(start: number, length: number, onsets: Map<number, ExerciseNote[]>, ts: TimeSignature): SpelledEvent[] {
  const ticks = [...onsets.keys()].filter((t) => t >= start && t < start + length).toSorted((a, b) => a - b);
  if (ticks.length === 0) return rests(start, length, start);

  const offsets = ticks.map((t) => t - start);
  const straight = offsets.every((o) => o % 6 === 0);
  if (!straight) {
    // Triplets: only inside a quarter-note beat, on the triplet-eighth or triplet-sixteenth grid.
    const step = offsets.every((o) => o % 16 === 0) ? 16 : 8;
    if (ts.unit !== 4 || length !== 48 || offsets.some((o) => o % step !== 0)) {
      throw new Error(`unsupported rhythm at tick ${start}: offsets ${offsets.join(", ")}`);
    }
    const out: SpelledEvent[] = [];
    // Rests before the first note, in triplet steps.
    for (let at = start; at < ticks[0]; at += step) out.push(rest(at, step, TRIPLET[step], start));
    ticks.forEach((t, i) => {
      const end = ticks[i + 1] ?? start + length;
      // Each note lasts one step; longer gaps get a triplet quarter when it fits, else rests.
      const len = end - t === 32 && step === 16 ? 32 : step;
      out.push({ tick: t, ticks: len, value: TRIPLET[len], dotted: false, tuplet: start, notes: onsets.get(t) ?? [] });
      for (let at = t + len; at < end; at += step) out.push(rest(at, step, TRIPLET[step], start));
    });
    return out;
  }

  const out: SpelledEvent[] = [];
  if (ticks[0] > start) out.push(...rests(start, ticks[0] - start, start));
  ticks.forEach((t, i) => {
    const end = ticks[i + 1] ?? start + length;
    out.push(...noteThenRests(onsets.get(t) ?? [], t, end - t, start));
  });
  return out;
}

/**
 * Merges full-beat rests into half rests on beats 1–2 and 3–4 of a 4/4 bar,
 * as notation books do.
 */
function mergeRests(events: SpelledEvent[], ts: TimeSignature, barStart: number): SpelledEvent[] {
  if (ts.beats !== 4 || ts.unit !== 4) return events;
  const out: SpelledEvent[] = [];
  for (let i = 0; i < events.length; i++) {
    const a = events[i];
    const b = events[i + 1];
    if (
      b &&
      a.notes.length === 0 &&
      b.notes.length === 0 &&
      a.ticks === 48 &&
      b.ticks === 48 &&
      a.tuplet === null &&
      b.tuplet === null &&
      (a.tick - barStart) % 96 === 0
    ) {
      out.push(rest(a.tick, 96, "h"));
      i++;
    } else {
      out.push(a);
    }
  }
  return out;
}

function spellVoice(exercise: Exercise, bar: number, voice: StaffVoice): SpelledEvent[] | null {
  const ts = exercise.timeSignature;
  const barTicks = ticksPerBar(ts);
  const barStart = bar * barTicks;
  const onsets = new Map<number, ExerciseNote[]>();
  for (const note of exercise.notes) {
    if (note.tick < barStart || note.tick >= barStart + barTicks || voiceOf(note.pad) !== voice) continue;
    const list = onsets.get(note.tick);
    if (list) list.push(note);
    else onsets.set(note.tick, [note]);
  }
  if (onsets.size === 0) return null;
  const group = groupTicks(ts);
  const events: SpelledEvent[] = [];
  for (let start = barStart; start < barStart + barTicks; start += group) {
    events.push(...spellGroup(start, Math.min(group, barStart + barTicks - start), onsets, ts));
  }
  return mergeRests(events, ts, barStart);
}

/** Spells one bar of an exercise (bars count from 0). */
export function spellBar(exercise: Exercise, bar: number): SpelledBar {
  return { hands: spellVoice(exercise, bar, "hands"), feet: spellVoice(exercise, bar, "feet") };
}

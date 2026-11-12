/**
 * Turns an exercise into the notes a drummer should play, in performance.now()
 * milliseconds: the same clock MIDI timestamps and the metronome grid use.
 */
import type { PadId } from "../kit/nitroMax";
import { exerciseLengthTicks, ticksPerBeat, type Dynamic, type Exercise } from "../exercises/types";

export interface ExpectedNote {
  /** Position in the timeline, from 0. */
  id: number;
  /** Which repetition of the exercise this note belongs to, from 0. */
  loop: number;
  /** Index of the note within the exercise. */
  index: number;
  /** When the note should be heard, in performance.now() ms. */
  time: number;
  pad: PadId;
  open: boolean;
  flam: boolean;
  dynamic: Dynamic;
  /** Hits within ± this many ms (on the right pad) can match this note. */
  windowMs: number;
}

export interface TimelineOptions {
  /** performance.now() time of tick 0 of the first loop. */
  startMs: number;
  /** Tempo, counting the exercise's beat unit (eighths in 6/8). */
  bpm: number;
  /** How many times the exercise repeats. */
  loops: number;
  /** Upper bound on any note's matching window, in ms. */
  maxWindowMs: number;
}

export const DEFAULT_MAX_WINDOW_MS = 100;

export function msPerTick(exercise: Pick<Exercise, "timeSignature">, bpm: number): number {
  return 60_000 / bpm / ticksPerBeat(exercise.timeSignature);
}

/**
 * The expected notes for every loop, sorted by time. Each note's window is
 * half the gap to its nearest neighbor on the same pad, capped at
 * maxWindowMs, so windows on a pad never overlap and a hit can belong to at
 * most one note.
 */
export function buildTimeline(exercise: Exercise, options: TimelineOptions): ExpectedNote[] {
  const tickMs = msPerTick(exercise, options.bpm);
  const loopMs = exerciseLengthTicks(exercise) * tickMs;
  const notes: ExpectedNote[] = [];
  for (let loop = 0; loop < options.loops; loop++) {
    exercise.notes.forEach((note, index) => {
      notes.push({
        id: notes.length,
        loop,
        index,
        time: options.startMs + loop * loopMs + note.tick * tickMs,
        pad: note.pad,
        open: note.open === true,
        flam: note.flam === true,
        dynamic: note.dynamic,
        windowMs: options.maxWindowMs,
      });
    });
  }

  // Narrow each window to half the gap to its neighbors on the same pad.
  const lastByPad = new Map<PadId, ExpectedNote>();
  for (const note of notes) {
    const prev = lastByPad.get(note.pad);
    if (prev) {
      const half = (note.time - prev.time) / 2;
      prev.windowMs = Math.min(prev.windowMs, half);
      note.windowMs = Math.min(note.windowMs, half);
    }
    lastByPad.set(note.pad, note);
  }
  return notes;
}

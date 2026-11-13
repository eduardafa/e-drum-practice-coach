/**
 * The exercise format: a groove or rudiment as a list of notes on a tick grid.
 *
 * Positions are integer ticks, 48 per quarter note. 48 divides by 2, 3, 4, 6,
 * 8, 12 and 16, so eighths, sixteenths, triplets and sextuplets all land on
 * whole ticks, with no floating-point drift when notes become times.
 */
import type { PadId } from "../kit/nitroMax";

export const TICKS_PER_QUARTER = 48;

export interface TimeSignature {
  /** Beats per bar: the top number. */
  beats: number;
  /** The note value of one beat: the bottom number (4 = quarter, 8 = eighth). */
  unit: 4 | 8;
}

export type Dynamic = "normal" | "accent" | "ghost";

export type Hand = "R" | "L";

export interface ExerciseNote {
  /** Position from the start of the exercise, in ticks. */
  tick: number;
  pad: PadId;
  dynamic: Dynamic;
  /** Open hi-hat. Only valid on the hi-hat. */
  open?: true;
  /** Played with a grace note just before the main stroke. */
  flam?: true;
  /** Suggested sticking, for rudiments. Shown to the drummer, never scored. */
  hand?: Hand;
}

export interface Exercise {
  /** Stable identifier: lowercase letters, digits and hyphens. Used to save progress. */
  id: string;
  name: string;
  category: "first-steps" | "groove" | "rudiment";
  description: string;
  timeSignature: TimeSignature;
  /** Length in bars. The exercise loops. */
  bars: number;
  /** Tempo range in BPM, counting the time signature's beat unit. */
  tempo: { min: number; suggested: number; max: number };
  /** Sorted by tick, then by pad. */
  notes: readonly ExerciseNote[];
}

export function ticksPerBeat(ts: TimeSignature): number {
  return (TICKS_PER_QUARTER * 4) / ts.unit;
}

export function ticksPerBar(ts: TimeSignature): number {
  return ts.beats * ticksPerBeat(ts);
}

export function exerciseLengthTicks(exercise: Pick<Exercise, "timeSignature" | "bars">): number {
  return exercise.bars * ticksPerBar(exercise.timeSignature);
}

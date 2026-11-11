/**
 * A small drum-tab view of an exercise: one row per pad, one cell per step.
 * Used for the previews in the library browser, where engraving a staff per
 * exercise would be heavy and hard to read at that size.
 */
import { NITRO_MAX_PADS, type PadId } from "../kit/nitroMax";
import { exerciseLengthTicks, ticksPerBeat, type Exercise, type ExerciseNote, type Hand } from "./types";

export type TabCell = Pick<ExerciseNote, "dynamic" | "open" | "flam"> | null;

export interface TabRow {
  pad: PadId;
  label: string;
  cells: TabCell[];
}

export interface Tab {
  /** Steps in the whole exercise. */
  steps: number;
  stepsPerBeat: number;
  /** Cymbals at the top, feet at the bottom, as on a drum staff. */
  rows: TabRow[];
  /** The hand for each step, for rudiments; null when the exercise gives no sticking. */
  sticking: (Hand | null)[] | null;
}

const ROW_ORDER: readonly PadId[] = ["crash", "ride", "hihat", "tom1", "snare", "tom2", "tom3", "kick", "hihatPedal"];

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export function tabOf(exercise: Exercise): Tab {
  const beat = ticksPerBeat(exercise.timeSignature);
  // The coarsest step every note lands on, and never coarser than a beat.
  const stepTicks = exercise.notes.reduce((step, n) => gcd(step, n.tick), beat);
  const steps = exerciseLengthTicks(exercise) / stepTicks;
  const rows = ROW_ORDER.filter((pad) => exercise.notes.some((n) => n.pad === pad)).map((pad) => {
    const cells: TabCell[] = Array.from({ length: steps }, () => null);
    for (const n of exercise.notes) {
      if (n.pad !== pad) continue;
      cells[n.tick / stepTicks] = { dynamic: n.dynamic, ...(n.open && { open: n.open }), ...(n.flam && { flam: n.flam }) };
    }
    return { pad, label: NITRO_MAX_PADS.find((p) => p.id === pad)?.label ?? pad, cells };
  });
  const sticking = exercise.notes.some((n) => n.hand) ? Array.from({ length: steps }, (): Hand | null => null) : null;
  if (sticking) for (const n of exercise.notes) if (n.hand) sticking[n.tick / stepTicks] = n.hand;
  return { steps, stepsPerBeat: beat / stepTicks, rows, sticking };
}

/** A time signature as written, e.g. "4/4" or "6/8". */
export function formatTimeSignature(exercise: Exercise): string {
  return `${exercise.timeSignature.beats}/${exercise.timeSignature.unit}`;
}

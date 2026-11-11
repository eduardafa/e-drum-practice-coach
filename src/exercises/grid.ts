/**
 * Builds exercises from drum-tab-like lane strings, so patterns are readable
 * in code:
 *
 *   lanes: {
 *     hihat: "x-x-x-x-x-x-x-x-",
 *     snare: "----X-------X---",
 *     kick:  "x-------x-------",
 *   }
 *
 * Each character is one step. Spaces and "|" are ignored, so bars and beats
 * can be separated for readability.
 *
 *   -  rest        x  note      X  accent     g  ghost note
 *   o  open hi-hat O  accented open hi-hat
 *   f  flam        F  accented flam
 *
 * An optional sticking string ("R", "L" or "-" per step) sets the hand of
 * every note on that step.
 */
import { NITRO_MAX_PADS, type PadId } from "../kit/nitroMax";
import { exerciseLengthTicks, ticksPerBar, type Exercise, type ExerciseNote } from "./types";
import { compareNotes } from "./validate";

export interface GridSpec extends Omit<Exercise, "notes"> {
  /** Steps per bar: 16 for sixteenths in 4/4, 12 for triplet eighths in 4/4, and so on. */
  stepsPerBar: number;
  lanes: Partial<Record<PadId, string>>;
  sticking?: string;
}

const STEP_SYMBOLS: Readonly<Record<string, Pick<ExerciseNote, "dynamic" | "open" | "flam"> | null>> = {
  "-": null,
  x: { dynamic: "normal" },
  X: { dynamic: "accent" },
  g: { dynamic: "ghost" },
  o: { dynamic: "normal", open: true },
  O: { dynamic: "accent", open: true },
  f: { dynamic: "normal", flam: true },
  F: { dynamic: "accent", flam: true },
};

/** Splits a pattern into steps, dropping the separators that are only there for readability. */
function steps(pattern: string): string[] {
  // Patterns are ASCII, so splitting by UTF-16 unit is safe; anything else fails as an unknown symbol.
  return pattern.replaceAll(/[\s|]/g, "").split("");
}

/** Turns a grid spec into an exercise. Throws on a malformed spec. */
export function fromGrid(spec: GridSpec): Exercise {
  const { stepsPerBar, lanes, sticking, ...meta } = spec;
  const barTicks = ticksPerBar(meta.timeSignature);
  if (!Number.isInteger(stepsPerBar) || stepsPerBar < 1 || barTicks % stepsPerBar !== 0) {
    throw new Error(`${meta.id}: ${stepsPerBar} steps don't divide a ${barTicks}-tick bar evenly`);
  }
  const stepTicks = barTicks / stepsPerBar;
  const totalSteps = exerciseLengthTicks(meta) / stepTicks;

  const hands = sticking === undefined ? null : steps(sticking);
  if (hands && hands.length !== totalSteps) {
    throw new Error(`${meta.id}: sticking has ${hands.length} steps, expected ${totalSteps}`);
  }
  const badHand = hands?.find((h) => h !== "R" && h !== "L" && h !== "-");
  if (badHand !== undefined) throw new Error(`${meta.id}: unknown sticking "${badHand}"`);

  const notes: ExerciseNote[] = [];
  for (const { id: pad } of NITRO_MAX_PADS) {
    const pattern = lanes[pad];
    if (pattern === undefined) continue;
    const laneSteps = steps(pattern);
    if (laneSteps.length !== totalSteps) {
      throw new Error(`${meta.id}: ${pad} lane has ${laneSteps.length} steps, expected ${totalSteps}`);
    }
    laneSteps.forEach((symbol, step) => {
      if (!Object.hasOwn(STEP_SYMBOLS, symbol)) throw new Error(`${meta.id}: unknown symbol "${symbol}" in ${pad} lane`);
      const parsed = STEP_SYMBOLS[symbol];
      if (!parsed) return;
      const note: ExerciseNote = { tick: step * stepTicks, pad, ...parsed };
      const hand = hands?.[step];
      if (hand === "R" || hand === "L") note.hand = hand;
      notes.push(note);
    });
  }
  notes.sort(compareNotes);
  return { ...meta, notes };
}

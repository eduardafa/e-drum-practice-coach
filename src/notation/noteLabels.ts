/**
 * What a written note means, in words: which drum, played with which hand
 * or foot, and where in the count. Shown when a note on the staff is tapped,
 * hovered or reached with the keyboard, so a beginner can read the notation
 * one note at a time. Pure, so it can be tested and reused outside the strip.
 *
 * The hand comes from the exercise's sticking when it has one (rudiments,
 * fills), else from the usual setup the timing-by-hand stats use; see
 * limbOf in src/history/limbs.ts. Both are written for a right-handed kit
 * and mirrored for a left-handed one.
 */
import type { Exercise, ExerciseNote } from "../exercises/types";
import type { Handedness } from "../handedness";
import { limbOf, type Limb } from "../history/limbs";
import { positionOf } from "../history/noteToFix";
import { STAFF_POSITIONS, padTitle } from "./staffKey";

const LIMB_SAID: Readonly<Record<Limb, string>> = {
  RH: "right hand",
  LH: "left hand",
  RF: "right foot",
  LF: "left foot",
};

/** How a note is played, beyond which drum: in the order a drummer would think of it. */
function extras(note: ExerciseNote): string[] {
  const out: string[] = [];
  if (note.dynamic === "accent") out.push("loud (accent)");
  if (note.dynamic === "ghost") out.push("very soft (ghost note)");
  if (note.open) out.push("open");
  if (note.flam) out.push("with a flam");
  return out;
}

/**
 * One note: "Snare, left hand", "Kick, right foot", "Hi-hat, right hand,
 * open". Toms in a groove have no set hand: "Tom 1, either hand".
 * `note` is as written in the exercise (right-handed); `handedness` mirrors it.
 */
export function noteLabel(note: ExerciseNote, handedness: Handedness): string {
  const limb = limbOf({ pad: note.pad, hand: note.hand ?? null }, handedness);
  return [padTitle(note.pad), limb ? LIMB_SAID[limb] : "either hand", ...extras(note)].join(", ");
}

/** Where a tick is in the count: "Beat 2", "The "&" of beat 2", with the bar when there are several. */
export function countLabel(tick: number, exercise: Pick<Exercise, "timeSignature" | "bars">): string {
  const p = positionOf(tick, exercise);
  if (!p) return "Between the counts";
  const bar = exercise.bars > 1 ? `Bar ${p.bar}, ` : "";
  const where = p.syllable ? `the ${p.syllable} of beat ${p.beat}` : `beat ${p.beat}`;
  const text = `${bar}${where}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Notes written at the same moment, read together: one tap target on the staff. */
export interface NoteGroup {
  tick: number;
  /** Indexes in exercise.notes, top of the staff first (as they're read). */
  indexes: number[];
  /** Where it falls in the count, e.g. "Beat 1". */
  count: string;
  /** One line per drum, e.g. ["Hi-hat, right hand", "Kick, right foot"]. */
  lines: string[];
}

/**
 * The exercise's notes grouped by the moment they're played, in time order:
 * a hi-hat and a kick on beat 1 are one group listing both drums. `exercise`
 * is as written (right-handed). Each group lists its drums from the top of the staff down.
 */
export function noteGroups(exercise: Exercise, handedness: Handedness): NoteGroup[] {
  const height = (i: number) => STAFF_POSITIONS[exercise.notes[i].pad].step;
  const byTick = new Map<number, number[]>();
  exercise.notes.forEach((n, i) => byTick.set(n.tick, [...(byTick.get(n.tick) ?? []), i]));
  return [...byTick]
    .toSorted(([a], [b]) => a - b)
    .map(([tick, indexes]) => {
      const sorted = indexes.toSorted((a, b) => height(b) - height(a));
      return {
        tick,
        indexes: sorted,
        count: countLabel(tick, exercise),
        lines: sorted.map((i) => noteLabel(exercise.notes[i], handedness)),
      };
    });
}

/** A group as one sentence, for screen readers: "Beat 1: Hi-hat, right hand; Kick, right foot". */
export function groupLabel(group: NoteGroup): string {
  return `${group.count}: ${group.lines.join("; ")}`;
}

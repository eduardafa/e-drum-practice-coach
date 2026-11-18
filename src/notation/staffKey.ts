/**
 * Where each drum sits on the five-line percussion staff, in one place: the
 * engraver draws from it, and the notation key explains it in words. Pure,
 * with no VexFlow, so the key and the note labels can be tested and reused
 * (a notation guide could show the same table).
 */
import type { PadId } from "../kit/nitroMax";
import { PAD_SAID } from "../kit/padNames";

export interface StaffPosition {
  /** The VexFlow key, written as a treble-clef pitch ("c/5"; "/x" for an x notehead). */
  key: string;
  /** Staff steps above the bottom line: 0 is the bottom line, 1 the space above it, 8 the top line. */
  step: number;
  /** Cymbals and the hi-hat pedal are written with an x instead of a round notehead. */
  head: "round" | "x";
  /** Where it is, in words a beginner can find on the staff. */
  where: string;
}

/**
 * Standard drum-kit positions: kick in the bottom space, snare in the
 * second space from the top, toms around it, cymbals as x noteheads on and
 * above the top line, hi-hat pedal as an x below the staff. Listed top to bottom.
 */
export const STAFF_POSITIONS: Readonly<Record<PadId, StaffPosition>> = {
  crash: { key: "a/5/x", step: 10, head: "x", where: "an x on a short line above the staff" },
  hihat: { key: "g/5/x", step: 9, head: "x", where: "an x just above the top line" },
  ride: { key: "f/5/x", step: 8, head: "x", where: "an x on the top line" },
  tom1: { key: "e/5", step: 7, head: "round", where: "the top space" },
  tom2: { key: "d/5", step: 6, head: "round", where: "the second line from the top" },
  snare: { key: "c/5", step: 5, head: "round", where: "the second space from the top" },
  tom3: { key: "a/4", step: 3, head: "round", where: "the second space from the bottom" },
  kick: { key: "f/4", step: 1, head: "round", where: "the bottom space" },
  hihatPedal: { key: "d/4/x", step: -1, head: "x", where: "an x below the staff" },
};

/** A drum's name to start a label with: "Snare", "Hi-hat pedal", "Tom 1". */
export function padTitle(pad: PadId): string {
  const said = PAD_SAID[pad];
  return said.charAt(0).toUpperCase() + said.slice(1);
}

export interface KeyEntry {
  pad: PadId;
  name: string;
  position: StaffPosition;
}

/** The key for the drums an exercise uses, from the top of the staff down, each drum once. */
export function staffKey(pads: Iterable<PadId>): KeyEntry[] {
  return [...new Set(pads)]
    .toSorted((a, b) => STAFF_POSITIONS[b].step - STAFF_POSITIONS[a].step)
    .map((pad) => ({ pad, name: padTitle(pad), position: STAFF_POSITIONS[pad] }));
}

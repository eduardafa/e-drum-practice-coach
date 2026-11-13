/**
 * Right- or left-handed kit. A left-handed drummer usually plays a mirrored
 * kit: hi-hat on the right played with the left hand, kick with the left
 * foot, written sticking led with the left hand. Exercises and saved records
 * stay written for a right-handed kit; these helpers mirror what's shown and
 * how notes are credited to limbs, so the data never changes with the setting.
 */
import type { Exercise, Hand } from "./exercises/types";
import type { PadInfo } from "./kit/nitroMax";

export type Handedness = "right" | "left";

export const DEFAULT_HANDEDNESS: Handedness = "right";

export function isHandedness(value: unknown): value is Handedness {
  return value === "right" || value === "left";
}

/** The other hand, on a left-handed kit. */
export function mirrorHand(hand: Hand, handedness: Handedness): Hand {
  if (handedness === "right") return hand;
  return hand === "R" ? "L" : "R";
}

/** Pads seen from the throne: flipped left to right on a left-handed kit. */
export function kitLayout(pads: readonly PadInfo[], handedness: Handedness): readonly PadInfo[] {
  return handedness === "right" ? pads : pads.map((p) => ({ ...p, x: 1 - p.x }));
}

const SIDE_SWAP: Readonly<Record<string, string>> = { right: "left", left: "right", Right: "Left", Left: "Right" };

/**
 * Swaps "right/left hand" and "right/left foot" in exercise text for a
 * left-handed kit. Only those phrases: "right on top of the click" stays.
 */
export function mirrorText(text: string, handedness: Handedness): string {
  if (handedness === "right") return text;
  return text.replace(/\b(right|left|Right|Left)(?= (?:hand|foot)\b)/g, (side) => SIDE_SWAP[side] ?? side);
}

/** An exercise as shown on a left-handed kit: sticking and description mirrored. Not for scoring or saving. */
export function displayedExercise(exercise: Exercise, handedness: Handedness): Exercise {
  if (handedness === "right") return exercise;
  return {
    ...exercise,
    description: mirrorText(exercise.description, handedness),
    notes: exercise.notes.map((n) => (n.hand ? { ...n, hand: mirrorHand(n.hand, handedness) } : n)),
  };
}

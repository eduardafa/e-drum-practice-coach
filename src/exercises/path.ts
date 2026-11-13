/**
 * Moving along the First steps path: after a session on one of its steps,
 * which exercise comes next, and whether the drummer is ready for it. Pure,
 * so the rule is tested without a results screen.
 */
import { findExercise, FIRST_STEPS } from "./library";
import type { Exercise } from "./types";

/** Where the path leads after its last step: the beat it builds up to. */
export const PATH_GOAL_ID = "rock-8ths";

export type PathAdvice =
  /** Good enough to move on: offer `next`. */
  | { kind: "ready"; next: Exercise }
  /** Not yet: say what accuracy moves on to `next`. */
  | { kind: "notYet"; next: Exercise; passMark: number };

/**
 * Advice after a session on `exercise` with `accuracy` (0 to 1, or null if
 * nothing was scored), or null when the exercise isn't on the path. Ready at
 * `passMark` or more, matching what the results screen shows (it rounds down).
 */
export function pathAdvice(exercise: Exercise, accuracy: number | null, passMark: number): PathAdvice | null {
  const index = FIRST_STEPS.findIndex((e) => e.id === exercise.id);
  if (index === -1) return null;
  const next = FIRST_STEPS[index + 1] ?? findExercise(PATH_GOAL_ID);
  if (!next) return null;
  return accuracy !== null && accuracy >= passMark ? { kind: "ready", next } : { kind: "notYet", next, passMark };
}

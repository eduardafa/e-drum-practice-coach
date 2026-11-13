/**
 * The First steps paths: numbered steps that build up to a goal beat, and
 * which exercise comes after each. Part 2 starts after part 1's goal, so
 * passing the Money beat leads straight on. After a session on a path, the
 * results screen offers what's next once the accuracy reaches the pass mark.
 * Pure, so the rules are tested without a results screen.
 */
import { findExercise, FIRST_STEPS, FIRST_STEPS_2 } from "./library";
import type { Exercise } from "./types";

export interface Path {
  id: string;
  title: string;
  steps: readonly Exercise[];
  /** The exercise that leads into step 1 (the previous path's goal), if any. */
  afterId: string | null;
  /** Where the path leads after its last step: the beat it builds up to. */
  goalId: string;
}

export const PATHS: readonly Path[] = [
  { id: "first-steps", title: "First steps", steps: FIRST_STEPS, afterId: null, goalId: "rock-8ths" },
  { id: "first-steps-2", title: "First steps, part 2", steps: FIRST_STEPS_2, afterId: "rock-8ths", goalId: "rock-16ths" },
];

/** Part 1's goal, the Money beat. */
export const PATH_GOAL_ID = PATHS[0].goalId;

export type PathAdvice =
  /** Good enough to move on: offer `next`. */
  | { kind: "ready"; next: Exercise }
  /** Not yet: say what accuracy moves on to `next`. */
  | { kind: "notYet"; next: Exercise; passMark: number };

/** The exercise that follows `exercise` on a path, or null if it's on none (or ends the last one). */
export function nextOnPath(exercise: Exercise): Exercise | null {
  for (const path of PATHS) {
    const index = path.steps.findIndex((e) => e.id === exercise.id);
    if (index !== -1) return path.steps[index + 1] ?? findExercise(path.goalId) ?? null;
    if (exercise.id === path.afterId) return path.steps[0] ?? null;
  }
  return null;
}

/**
 * Advice after a session on `exercise` with `accuracy` (0 to 1, or null if
 * nothing was scored), or null when nothing follows it on a path. Ready at
 * `passMark` or more, matching what the results screen shows (it rounds down).
 */
export function pathAdvice(exercise: Exercise, accuracy: number | null, passMark: number): PathAdvice | null {
  const next = nextOnPath(exercise);
  if (!next) return null;
  return accuracy !== null && accuracy >= passMark ? { kind: "ready", next } : { kind: "notYet", next, passMark };
}

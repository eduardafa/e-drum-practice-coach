/**
 * Progress along a First steps path, from saved sessions: for each step
 * (and the beat it leads to), the best run so far and whether it
 * passed. Uses the same pass rule as the results screen's Next button, over
 * all of history: a passed step stays passed.
 */
import { findExercise } from "../exercises/library";
import { PATHS, type Path } from "../exercises/path";
import type { Exercise } from "../exercises/types";
import type { AccuracyMode } from "../playalong/results";
import type { HistoryRecord } from "./record";

export type StepStatus = "passed" | "next" | "later";

export interface StepProgress {
  exercise: Exercise;
  /** The beat the path builds up to, after the numbered steps. */
  goal: boolean;
  /** Finished sessions on this exercise, tempo-trainer rounds included. */
  sessions: number;
  /** The most accurate run (the faster one on a tie), or null if none was scored. */
  best: { accuracy: number; bpm: number } | null;
  status: StepStatus;
}

export interface FirstStepsProgress {
  /** The numbered steps in order, then the goal. */
  rows: StepProgress[];
  /** How many numbered steps have passed (the goal isn't counted). */
  passedSteps: number;
  totalSteps: number;
  /** The first row not passed yet, or null when everything has. */
  next: StepProgress | null;
  /** Whether any numbered step has been played. */
  started: boolean;
  /** Started, or the exercise leading into it has passed: the History page shows the path then. */
  unlocked: boolean;
}

/** The best accuracy over `records` for one exercise, or null if none was scored. */
function bestRun(records: readonly HistoryRecord[], exerciseId: string, mode: AccuracyMode) {
  let sessions = 0;
  let best: StepProgress["best"] = null;
  for (const r of records) {
    if (r.kind !== "session" || r.exerciseId !== exerciseId) continue;
    sessions += 1;
    const accuracy = r.accuracy[mode];
    if (accuracy === null) continue;
    if (!best || accuracy > best.accuracy || (accuracy === best.accuracy && r.bpm > best.bpm)) {
      best = { accuracy, bpm: r.bpm };
    }
  }
  return { sessions, best };
}

export function firstStepsProgress(
  records: readonly HistoryRecord[],
  mode: AccuracyMode,
  passMark: number,
  path: Path = PATHS[0],
): FirstStepsProgress {
  const goal = findExercise(path.goalId);
  const exercises = goal ? [...path.steps, goal] : [...path.steps];

  let nextFound = false;
  const rows = exercises.map((exercise): StepProgress => {
    const { sessions, best } = bestRun(records, exercise.id, mode);
    const passed = best !== null && best.accuracy >= passMark;
    const status: StepStatus = passed ? "passed" : nextFound ? "later" : "next";
    if (status === "next") nextFound = true;
    return { exercise, goal: exercise === goal, sessions, best, status };
  });

  const steps = rows.filter((r) => !r.goal);
  const started = steps.some((r) => r.sessions > 0);
  const leadIn = path.afterId === null ? null : bestRun(records, path.afterId, mode).best;
  return {
    rows,
    passedSteps: steps.filter((r) => r.status === "passed").length,
    totalSteps: steps.length,
    next: rows.find((r) => r.status === "next") ?? null,
    started,
    unlocked: started || (leadIn !== null && leadIn.accuracy >= passMark),
  };
}

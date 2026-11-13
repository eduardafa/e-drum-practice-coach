/**
 * Progress along the First steps path, from saved sessions: for each step
 * (and the Money beat it leads to), the best run so far and whether it
 * passed. Uses the same pass rule as the results screen's Next button, over
 * all of history: a passed step stays passed.
 */
import { findExercise, FIRST_STEPS } from "../exercises/library";
import { PATH_GOAL_ID } from "../exercises/path";
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
  /** Whether any numbered step has been played; the History page shows the path from then on. */
  started: boolean;
}

export function firstStepsProgress(
  records: readonly HistoryRecord[],
  mode: AccuracyMode,
  passMark: number,
): FirstStepsProgress {
  const goal = findExercise(PATH_GOAL_ID);
  const path = goal ? [...FIRST_STEPS, goal] : [...FIRST_STEPS];

  let nextFound = false;
  const rows = path.map((exercise): StepProgress => {
    let sessions = 0;
    let best: StepProgress["best"] = null;
    for (const r of records) {
      if (r.kind !== "session" || r.exerciseId !== exercise.id) continue;
      sessions += 1;
      const accuracy = r.accuracy[mode];
      if (accuracy === null) continue;
      if (!best || accuracy > best.accuracy || (accuracy === best.accuracy && r.bpm > best.bpm)) {
        best = { accuracy, bpm: r.bpm };
      }
    }
    const passed = best !== null && best.accuracy >= passMark;
    const status: StepStatus = passed ? "passed" : nextFound ? "later" : "next";
    if (status === "next") nextFound = true;
    return { exercise, goal: exercise === goal, sessions, best, status };
  });

  const steps = rows.filter((r) => !r.goal);
  return {
    rows,
    passedSteps: steps.filter((r) => r.status === "passed").length,
    totalSteps: steps.length,
    next: rows.find((r) => r.status === "next") ?? null,
    started: steps.some((r) => r.sessions > 0),
  };
}

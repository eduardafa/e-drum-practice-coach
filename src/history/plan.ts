/**
 * Today's practice: a short plan built from progress along the First steps
 * paths. Warm up on something already passed, spend most of the time on the
 * step up next, and finish on the beat the path leads to. Built from history
 * every time, never stored. Pure, so each situation is tested.
 */
import { findExercise } from "../exercises/library";
import { PATHS } from "../exercises/path";
import type { Exercise } from "../exercises/types";
import type { AccuracyMode } from "../playalong/results";
import { firstStepsProgress, type FirstStepsProgress } from "./firstSteps";
import type { HistoryRecord } from "./record";

export type BlockKind = "warmup" | "focus" | "finish";

export interface PlanBlock {
  kind: BlockKind;
  exercise: Exercise;
  minutes: number;
  /** Learn (wait mode) for something never played; Play along otherwise. */
  mode: "learn" | "play";
}

export const BLOCK_MINUTES: Readonly<Record<BlockKind, number>> = { warmup: 3, focus: 10, finish: 2 };

/** The path being worked on: the first unlocked one with something left, else the last one. */
function currentPath(records: readonly HistoryRecord[], mode: AccuracyMode, passMark: number) {
  const all = PATHS.map((path) => ({ path, progress: firstStepsProgress(records, mode, passMark, path) }));
  return all.find(({ progress }, i) => (progress.unlocked || i === 0) && progress.next !== null) ?? all[all.length - 1];
}

/** The last passed row before the one up next, or the beat that leads into the path. */
function warmupFor(progress: FirstStepsProgress, afterId: string | null): Exercise | null {
  const nextIndex = progress.next ? progress.rows.indexOf(progress.next) : progress.rows.length;
  for (let i = nextIndex - 1; i >= 0; i--) if (progress.rows[i].status === "passed") return progress.rows[i].exercise;
  return afterId ? (findExercise(afterId) ?? null) : null;
}

export function practicePlan(records: readonly HistoryRecord[], mode: AccuracyMode, passMark: number): PlanBlock[] {
  const { path, progress } = currentPath(records, mode, passMark);
  const goal = progress.rows.at(-1);
  const next = progress.next;

  // Everything passed: warm up on the last step, then work on the goal beat (faster each week).
  if (!next) {
    const lastStep = path.steps.at(-1);
    return [
      ...(lastStep ? [{ kind: "warmup" as const, exercise: lastStep, minutes: BLOCK_MINUTES.warmup, mode: "play" as const }] : []),
      ...(goal ? [{ kind: "focus" as const, exercise: goal.exercise, minutes: BLOCK_MINUTES.focus, mode: "play" as const }] : []),
    ];
  }

  const blocks: PlanBlock[] = [];
  const warmup = warmupFor(progress, path.afterId);
  // The very first time: learn the first step without the click before playing it.
  if (warmup) blocks.push({ kind: "warmup", exercise: warmup, minutes: BLOCK_MINUTES.warmup, mode: "play" });
  else blocks.push({ kind: "warmup", exercise: next.exercise, minutes: BLOCK_MINUTES.warmup, mode: "learn" });

  blocks.push({
    kind: "focus",
    exercise: next.exercise,
    minutes: BLOCK_MINUTES.focus,
    mode: next.sessions === 0 && warmup ? "learn" : "play",
  });

  if (goal && goal !== next) blocks.push({ kind: "finish", exercise: goal.exercise, minutes: BLOCK_MINUTES.finish, mode: "play" });
  return blocks;
}

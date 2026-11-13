/**
 * Today's practice state: whether the plan panel is open, and the plan being
 * run (its blocks, the current one, and when it started).
 */
import { useState } from "react";
import { practicePlan, type PlanBlock } from "./history/plan";
import type { HistoryRecord } from "./history/record";
import type { AccuracyMode } from "./playalong/results";
import { DEFAULT_PASS_MARK } from "./playalong/trainer";
import type { RunningPlan } from "./PracticePlan";

interface Actions {
  /** Selects an exercise, as choosing it in the library does. */
  select: (exerciseId: string) => void;
  /** Starts a block's session: Learn or Play along. */
  run: (block: PlanBlock) => void;
}

export function usePracticePlan(history: readonly HistoryRecord[], accuracyMode: AccuracyMode, actions: Actions) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<RunningPlan | null>(null);
  const blocks = () => practicePlan(history, accuracyMode, DEFAULT_PASS_MARK);

  /** Moves to block `index`: selects its exercise, ready to start. */
  const goTo = (planBlocks: PlanBlock[], index: number) => {
    const block = planBlocks[index];
    if (!block) return;
    actions.select(block.exercise.id);
    setPlan({ blocks: planBlocks, index, blockStart: performance.now() });
  };

  return {
    open,
    toggle: () => setOpen((o) => !o),
    close: () => setOpen(false),
    plan,
    /** The plan as it would start now, for the panel. */
    blocks,
    start: () => {
      setOpen(false);
      goTo(blocks(), 0);
    },
    next: () => plan && goTo(plan.blocks, plan.index + 1),
    end: () => setPlan(null),
    run: actions.run,
  };
}

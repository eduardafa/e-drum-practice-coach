import { describe, expect, it } from "vitest";
import { findExercise, FIRST_STEPS, FIRST_STEPS_2, FIRST_STEPS_3, GROOVES } from "./library";
import { PATH_GOAL_ID, PATHS, pathAdvice } from "./path";

const PASS = 0.9;

describe("pathAdvice", () => {
  it("offers the following step at the pass mark or above", () => {
    const [first, second] = FIRST_STEPS;
    expect(pathAdvice(first, 0.9, PASS)).toEqual({ kind: "ready", next: second });
    expect(pathAdvice(first, 1, PASS)).toEqual({ kind: "ready", next: second });
  });

  it("says what to reach below the pass mark, or when nothing was scored", () => {
    const [first, second] = FIRST_STEPS;
    expect(pathAdvice(first, 0.89, PASS)).toEqual({ kind: "notYet", next: second, passMark: PASS });
    expect(pathAdvice(first, null, PASS)).toEqual({ kind: "notYet", next: second, passMark: PASS });
  });

  it("leads from the last step to the beat the path builds up to", () => {
    const last = FIRST_STEPS.at(-1);
    if (!last) throw new Error("the path is empty");
    expect(pathAdvice(last, 0.95, PASS)).toEqual({ kind: "ready", next: findExercise(PATH_GOAL_ID) });
  });

  it("walks every step in order", () => {
    FIRST_STEPS.slice(0, -1).forEach((step, i) => {
      expect(pathAdvice(step, 1, PASS)?.next).toBe(FIRST_STEPS[i + 1]);
    });
  });

  it("leads from part 1's goal into part 2, through part 2, then to its goal", () => {
    const moneyBeat = findExercise(PATH_GOAL_ID);
    if (!moneyBeat) throw new Error("missing goal");
    expect(pathAdvice(moneyBeat, 0.95, PASS)).toEqual({ kind: "ready", next: FIRST_STEPS_2[0] });
    FIRST_STEPS_2.slice(0, -1).forEach((step, i) => {
      expect(pathAdvice(step, 1, PASS)?.next).toBe(FIRST_STEPS_2[i + 1]);
    });
    const last = FIRST_STEPS_2.at(-1);
    if (!last) throw new Error("part 2 is empty");
    expect(pathAdvice(last, 1, PASS)?.next.id).toBe(PATHS[1].goalId);
  });

  it("leads from part 2's goal into part 3, through part 3, then to its goal", () => {
    const part2Goal = findExercise(PATHS[1].goalId);
    if (!part2Goal) throw new Error("missing goal");
    expect(pathAdvice(part2Goal, 0.95, PASS)).toEqual({ kind: "ready", next: FIRST_STEPS_3[0] });
    FIRST_STEPS_3.slice(0, -1).forEach((step, i) => {
      expect(pathAdvice(step, 1, PASS)?.next).toBe(FIRST_STEPS_3[i + 1]);
    });
    expect(pathAdvice(FIRST_STEPS_3[FIRST_STEPS_3.length - 1], 1, PASS)?.next.id).toBe(PATHS[2].goalId);
  });

  it("gives no advice for exercises that lead nowhere on a path, the last goal included", () => {
    const leadIns = new Set(PATHS.map((p) => p.afterId));
    for (const e of GROOVES.filter((g) => !leadIns.has(g.id))) expect(pathAdvice(e, 1, PASS)).toBeNull();
    const lastGoal = findExercise(PATHS.at(-1)?.goalId ?? "");
    if (!lastGoal) throw new Error("missing last goal");
    expect(pathAdvice(lastGoal, 1, PASS)).toBeNull();
  });

  it("chains the paths: each starts after the previous one's goal", () => {
    PATHS.slice(1).forEach((path, i) => expect(path.afterId).toBe(PATHS[i].goalId));
    for (const path of PATHS) expect(findExercise(path.goalId)).toBeDefined();
  });
});

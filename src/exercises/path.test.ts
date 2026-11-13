import { describe, expect, it } from "vitest";
import { findExercise, FIRST_STEPS, GROOVES } from "./library";
import { PATH_GOAL_ID, pathAdvice } from "./path";

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

  it("gives no advice for exercises off the path, the goal included", () => {
    for (const e of GROOVES) expect(pathAdvice(e, 1, PASS)).toBeNull();
  });
});

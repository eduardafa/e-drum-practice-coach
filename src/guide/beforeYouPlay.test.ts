import { describe, expect, it } from "vitest";
import { FIRST_STEPS, FIRST_STEPS_3 } from "../exercises/library";
import { PATH_GOAL_ID } from "../exercises/path";
import { beforeYouPlayChecks, isFirstStepsExercise, shouldOfferBeforeYouPlay } from "./beforeYouPlay";

describe("shouldOfferBeforeYouPlay", () => {
  const firstStep = FIRST_STEPS[0].id;

  it("offers the card for a First steps exercise until it's been seen", () => {
    expect(shouldOfferBeforeYouPlay(firstStep, false)).toBe(true);
    expect(shouldOfferBeforeYouPlay(firstStep, true)).toBe(false);
  });

  it("counts the steps of every First steps part", () => {
    expect(isFirstStepsExercise(FIRST_STEPS_3[0].id)).toBe(true);
  });

  it("doesn't offer it for other exercises, a goal beat, or no exercise", () => {
    expect(shouldOfferBeforeYouPlay("paradiddle", false)).toBe(false);
    expect(shouldOfferBeforeYouPlay(PATH_GOAL_ID, false)).toBe(false);
    expect(shouldOfferBeforeYouPlay(null, false)).toBe(false);
    expect(shouldOfferBeforeYouPlay(undefined, false)).toBe(false);
  });
});

const hihat = (h: "right" | "left") => beforeYouPlayChecks(h).find((c) => c.id === "hihat")?.text;

describe("beforeYouPlayChecks", () => {
  it("has a few checks of one sentence each", () => {
    const checks = beforeYouPlayChecks("right");
    expect(checks.length).toBeGreaterThanOrEqual(4);
    expect(checks.length).toBeLessThanOrEqual(5);
    for (const check of checks) expect(check.text.match(/[.!?](\s|$)/g)).toHaveLength(1);
  });

  it("puts the hi-hat under the left foot, or the right one on a left-handed kit", () => {
    expect(hihat("right")).toContain("left foot");
    expect(hihat("left")).toContain("right foot");
  });
});

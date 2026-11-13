import { describe, expect, it } from "vitest";
import { findExercise } from "./exercises/library";
import { displayedExercise, isHandedness, kitLayout, mirrorHand, mirrorText } from "./handedness";
import { NITRO_MAX_PADS } from "./kit/nitroMax";

describe("isHandedness", () => {
  it("accepts right and left only", () => {
    expect(isHandedness("right")).toBe(true);
    expect(isHandedness("left")).toBe(true);
    expect(isHandedness("ambidextrous")).toBe(false);
    expect(isHandedness(undefined)).toBe(false);
  });
});

describe("mirrorHand", () => {
  it("keeps the written hand on a right-handed kit and swaps it on a left-handed one", () => {
    expect(mirrorHand("R", "right")).toBe("R");
    expect(mirrorHand("R", "left")).toBe("L");
    expect(mirrorHand("L", "left")).toBe("R");
  });
});

describe("kitLayout", () => {
  it("flips pads left to right on a left-handed kit, keeping everything else", () => {
    const flipped = kitLayout(NITRO_MAX_PADS, "left");
    const hihat = flipped.find((p) => p.id === "hihat");
    const original = NITRO_MAX_PADS.find((p) => p.id === "hihat");
    expect(hihat?.x).toBeCloseTo(1 - (original?.x ?? 0));
    expect(hihat?.y).toBe(original?.y);
    expect(kitLayout(NITRO_MAX_PADS, "right")).toBe(NITRO_MAX_PADS);
  });
});

describe("mirrorText", () => {
  it("swaps the side of hands and feet", () => {
    expect(mirrorText("Kick with your right foot, snare with your left hand.", "left")).toBe(
      "Kick with your left foot, snare with your right hand.",
    );
    expect(mirrorText("Right hand leads.", "left")).toBe("Left hand leads.");
  });

  it("leaves other uses of right and left alone", () => {
    const text = "Land each hit right on top of the click, then go left to the toms.";
    expect(mirrorText(text, "left")).toBe(text);
  });

  it("changes nothing on a right-handed kit", () => {
    expect(mirrorText("with your right hand", "right")).toBe("with your right hand");
  });
});

describe("displayedExercise", () => {
  it("mirrors written sticking and the description, leaving timing and pads alone", () => {
    const paradiddle = findExercise("paradiddle");
    if (!paradiddle) throw new Error("missing exercise");
    const shown = displayedExercise(paradiddle, "left");
    expect(shown.notes.map((n) => n.hand).join("")).toBe("LRLLRLRRLRLLRLRR");
    expect(shown.notes.map((n) => [n.tick, n.pad])).toEqual(paradiddle.notes.map((n) => [n.tick, n.pad]));
    const step = findExercise("first-hihat-quarters");
    expect(step && displayedExercise(step, "left").description).toContain("with your left hand");
  });

  it("returns the exercise itself on a right-handed kit", () => {
    const e = findExercise("rock-8ths");
    expect(e && displayedExercise(e, "right")).toBe(e);
  });
});

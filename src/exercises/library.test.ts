import { describe, expect, it } from "vitest";
import { EXERCISES, findExercise, FIRST_STEPS, GROOVES, RUDIMENTS } from "./library";
import type { Exercise } from "./types";
import { validateExercise, validateLibrary } from "./validate";

function ticksOf(id: string, pad: string): number[] | undefined {
  return findExercise(id)
    ?.notes.filter((n) => n.pad === pad)
    .map((n) => n.tick);
}

describe("starter library", () => {
  it("passes validation as a whole (unique ids)", () => {
    expect(validateLibrary(EXERCISES)).toEqual([]);
  });

  it.each(EXERCISES.map((e) => [e.id, e] as const))("%s is valid", (_, exercise) => {
    expect(validateExercise(exercise)).toEqual([]);
  });

  it("has each category in its own list, first steps listed first", () => {
    expect(FIRST_STEPS.every((e) => e.category === "first-steps")).toBe(true);
    expect(GROOVES.every((e) => e.category === "groove")).toBe(true);
    expect(RUDIMENTS.every((e) => e.category === "rudiment")).toBe(true);
    expect(EXERCISES).toEqual([...FIRST_STEPS, ...GROOVES, ...RUDIMENTS]);
  });

  it.each(RUDIMENTS.map((e) => [e.id, e] as const))("%s gives every note a hand", (_, exercise) => {
    expect(exercise.notes.every((n) => n.hand === "R" || n.hand === "L")).toBe(true);
  });

  it("finds exercises by id", () => {
    expect(findExercise("paradiddle")?.name).toBe("Single paradiddle");
    expect(findExercise("nope")).toBeUndefined();
  });
});

function padsOf(exercise: Exercise): Set<string> {
  return new Set(exercise.notes.map((n) => n.pad));
}

describe("first steps", () => {
  it("are numbered in order", () => {
    expect(FIRST_STEPS.map((e) => e.name.match(/^Step (\d+):/)?.[1])).toEqual(
      FIRST_STEPS.map((_, i) => String(i + 1)),
    );
  });

  it("are 4/4, slow, and never ask for more than two pads at once", () => {
    for (const e of FIRST_STEPS) {
      expect(e.timeSignature).toEqual({ beats: 4, unit: 4 });
      expect(e.tempo.min).toBeLessThanOrEqual(40);
      expect(padsOf(e).size).toBeLessThanOrEqual(2);
    }
  });

  it("only use the Money beat's pads, at the Money beat's positions", () => {
    const money = findExercise("rock-8ths")?.notes ?? [];
    const inMoneyBeat = (pad: string, tick: number) => money.some((n) => n.pad === pad && n.tick === tick);
    for (const e of FIRST_STEPS.slice(1)) {
      for (const n of e.notes) expect(inMoneyBeat(n.pad, n.tick), `${e.id}: ${n.pad} at ${n.tick}`).toBe(true);
    }
    // Step 1 is the hi-hat on the beats only: a subset of the Money beat's hi-hat too.
    expect(ticksOf("first-hihat-quarters", "hihat")).toEqual([0, 48, 96, 144]);
  });

  it("show the hand on the hi-hat-only steps (right hand)", () => {
    for (const id of ["first-hihat-quarters", "first-hihat-eighths"]) {
      expect(findExercise(id)?.notes.every((n) => n.hand === "R")).toBe(true);
    }
  });
});

describe("specific patterns", () => {
  it("rock beat: snare on 2 and 4, kick on 1 and 3", () => {
    expect(ticksOf("rock-8ths", "snare")).toEqual([48, 144]);
    expect(ticksOf("rock-8ths", "kick")).toEqual([0, 96]);
  });

  it("paradiddle: RLRR LRLL with accents moving between hands", () => {
    const notes = findExercise("paradiddle")?.notes ?? [];
    expect(notes.map((n) => n.hand).join("")).toBe("RLRRLRLLRLRRLRLL");
    expect(notes.filter((n) => n.dynamic === "accent").map((n) => n.hand)).toEqual(["R", "L", "R", "L"]);
  });

  it("triplet singles: four beats of three, on whole ticks", () => {
    expect(ticksOf("triplet-singles", "snare")).toEqual(Array.from({ length: 12 }, (_, i) => i * 16));
  });

  it("6/8 groove: snare on the fourth eighth note", () => {
    expect(ticksOf("six-eight", "snare")).toEqual([72]);
  });

  it("open hi-hat: opens on the 'and' of 4, pedal closes on 1", () => {
    const notes = findExercise("open-hihat")?.notes ?? [];
    expect(notes.filter((n) => n.open).map((n) => n.tick)).toEqual([168]);
    expect(ticksOf("open-hihat", "hihatPedal")).toEqual([0]);
  });

  it("half-time: one accented backbeat on 3, the rest ghost notes", () => {
    const snare = findExercise("half-time-ghosts")?.notes.filter((n) => n.pad === "snare") ?? [];
    expect(snare.filter((n) => n.dynamic === "accent").map((n) => n.tick)).toEqual([96]);
    expect(snare.filter((n) => n.dynamic === "ghost")).toHaveLength(4);
  });
});

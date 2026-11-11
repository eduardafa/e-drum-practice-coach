import { describe, expect, it } from "vitest";
import { EXERCISES, findExercise, GROOVES, RUDIMENTS } from "./library";
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

  it("has grooves and rudiments in the right lists", () => {
    expect(GROOVES.every((e) => e.category === "groove")).toBe(true);
    expect(RUDIMENTS.every((e) => e.category === "rudiment")).toBe(true);
    expect(EXERCISES).toHaveLength(10);
  });

  it.each(RUDIMENTS.map((e) => [e.id, e] as const))("%s gives every note a hand", (_, exercise) => {
    expect(exercise.notes.every((n) => n.hand === "R" || n.hand === "L")).toBe(true);
  });

  it("finds exercises by id", () => {
    expect(findExercise("paradiddle")?.name).toBe("Single paradiddle");
    expect(findExercise("nope")).toBeUndefined();
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

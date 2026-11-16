import { describe, expect, it } from "vitest";
import { findExercise } from "../exercises/library";
import { validateExercise } from "../exercises/validate";
import { GROOVE_CHOICES, SIMPLE_BEAT, findGroove, grooveTab } from "./grooveTab";

/** The simple beat's beats (in quarter notes) on one pad. */
const at = (pad: string) => SIMPLE_BEAT.notes.filter((n) => n.pad === pad).map((n) => n.tick / 48);

describe("SIMPLE_BEAT", () => {
  it("is hi-hat on every beat, kick on 1 and 3, snare on 2 and 4, and a valid exercise", () => {
    expect(validateExercise(SIMPLE_BEAT)).toEqual([]);
    expect(at("hihat")).toEqual([0, 1, 2, 3]);
    expect(at("kick")).toEqual([0, 2]);
    expect(at("snare")).toEqual([1, 3]);
  });
});

describe("GROOVE_CHOICES", () => {
  it("starts with the simple beat and keeps only 4/4 First steps and Grooves", () => {
    expect(GROOVE_CHOICES[0]).toBe(SIMPLE_BEAT);
    expect(GROOVE_CHOICES.some((g) => g.id === "rock-8ths")).toBe(true);
    expect(GROOVE_CHOICES.some((g) => g.id === "first-hihat-quarters")).toBe(true);
    expect(GROOVE_CHOICES.some((g) => g.id === "six-eight")).toBe(false);
    expect(GROOVE_CHOICES.some((g) => g.category === "rudiment")).toBe(false);
    expect(findGroove("rock-8ths")?.name).toBe(findExercise("rock-8ths")?.name);
  });
});

describe("grooveTab", () => {
  it("repeats the groove across the song, in quarter notes, stopping at its length", () => {
    const tab = grooveTab(SIMPLE_BEAT, 10);
    expect(tab.beatsPerBar).toBe(4);
    // 2 full bars (8 notes each) and half a bar: beats 8 and 9.
    expect(tab.notes.filter((n) => n.pad === "hihat").map((n) => n.beat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(tab.notes.filter((n) => n.pad === "snare").map((n) => n.beat)).toEqual([1, 3, 5, 7, 9]);
    expect(tab.notes.every((n) => n.beat < 10)).toBe(true);
  });

  it("keeps eighth notes, open hi-hats, and two-bar grooves in place", () => {
    const money = findExercise("rock-8ths");
    const open = findExercise("open-hihat");
    const fill = findExercise("first2-first-fill");
    if (!money || !open || !fill) throw new Error("library changed");
    expect(grooveTab(money, 4).notes.filter((n) => n.pad === "hihat").map((n) => n.beat)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(grooveTab(open, 8).notes.some((n) => n.open)).toBe(true);
    // A two-bar groove repeats every 8 beats.
    const twoBars = grooveTab(fill, 16).notes.map((n) => `${n.beat}:${n.pad}`);
    expect(twoBars.filter((s) => Number(s.split(":")[0]) >= 8).map((s) => `${Number(s.split(":")[0]) - 8}:${s.split(":")[1]}`)).toEqual(
      twoBars.filter((s) => Number(s.split(":")[0]) < 8),
    );
  });
});

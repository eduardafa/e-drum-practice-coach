import { describe, expect, it } from "vitest";
import { EXERCISES, FILLS, findExercise, FIRST_STEPS, FIRST_STEPS_2, FIRST_STEPS_3, GROOVES, RUDIMENTS } from "./library";
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

  it("has each category in its own list, first steps (every part) listed first", () => {
    expect([...FIRST_STEPS, ...FIRST_STEPS_2, ...FIRST_STEPS_3].every((e) => e.category === "first-steps")).toBe(true);
    expect(GROOVES.every((e) => e.category === "groove")).toBe(true);
    expect(FILLS.every((e) => e.category === "fill")).toBe(true);
    expect(RUDIMENTS.every((e) => e.category === "rudiment")).toBe(true);
    expect(EXERCISES).toEqual([...FIRST_STEPS, ...FIRST_STEPS_2, ...FIRST_STEPS_3, ...GROOVES, ...FILLS, ...RUDIMENTS]);
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

describe("first steps, part 2", () => {
  it("are numbered in order, 4/4 and as slow as part 1", () => {
    expect(FIRST_STEPS_2.map((e) => e.name.match(/^Part 2, step (\d+):/)?.[1])).toEqual(
      FIRST_STEPS_2.map((_, i) => String(i + 1)),
    );
    for (const e of FIRST_STEPS_2) {
      expect(e.timeSignature).toEqual({ beats: 4, unit: 4 });
      expect(e.tempo.min).toBeLessThanOrEqual(40);
    }
  });

  it("step 1 adds one kick, on the 'and' of 3", () => {
    expect(ticksOf("first2-kick-and-of-3", "kick")).toEqual([0, 96, 120]);
    expect(ticksOf("first2-kick-and-of-3", "snare")).toEqual(ticksOf("rock-8ths", "snare"));
  });

  it("step 2 moves the right hand to the ride and nothing else", () => {
    expect(ticksOf("first2-ride", "ride")).toEqual(ticksOf("rock-8ths", "hihat"));
    expect(ticksOf("first2-ride", "hihat")).toEqual([]);
    expect(ticksOf("first2-ride", "kick")).toEqual(ticksOf("rock-8ths", "kick"));
  });

  it("step 4's fill is four snare eighths on 3 & 4 & of bar 2, with the hands off the hi-hat", () => {
    const bar2 = 192;
    expect(ticksOf("first2-first-fill", "snare")?.filter((t) => t >= bar2 + 96)).toEqual([288, 312, 336, 360]);
    expect(ticksOf("first2-first-fill", "hihat")?.some((t) => t >= bar2 + 96)).toBe(false);
  });

  it("step 5 crashes on 1 (with the kick) where the hi-hat was, after the same fill", () => {
    expect(ticksOf("first2-fill-crash", "crash")).toEqual([0]);
    expect(ticksOf("first2-fill-crash", "hihat")).not.toContain(0);
    expect(ticksOf("first2-fill-crash", "kick")).toContain(0);
    expect(ticksOf("first2-fill-crash", "snare")).toEqual(ticksOf("first2-first-fill", "snare"));
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

describe("first steps, part 3", () => {
  it("are numbered in order, 4/4 and as slow as part 1", () => {
    expect(FIRST_STEPS_3.map((e) => e.name.match(/^Part 3, step (\d+):/)?.[1])).toEqual(
      FIRST_STEPS_3.map((_, i) => String(i + 1)),
    );
    for (const e of FIRST_STEPS_3) {
      expect(e.timeSignature).toEqual({ beats: 4, unit: 4 });
      expect(e.tempo.min).toBeLessThanOrEqual(40);
    }
  });

  it("step 1 is the Money beat with the hi-hat loud on the counts and soft on the '&'", () => {
    const hihat = findExercise("first3-hihat-accents")?.notes.filter((n) => n.pad === "hihat");
    expect(hihat?.map((n) => n.tick)).toEqual(ticksOf("rock-8ths", "hihat"));
    expect(hihat?.map((n) => (n.dynamic === "accent" ? "X" : "x")).join("")).toBe("XxXxXxXx");
  });

  it("step 2 adds one ghost note, on the snare just before beat 1", () => {
    const ghosts = findExercise("first3-ghost-note")?.notes.filter((n) => n.dynamic === "ghost");
    expect(ghosts?.map((n) => [n.pad, n.tick])).toEqual([["snare", 168]]);
  });

  it("step 3 ends bar 2 with tom 1 then tom 2 on 3 & 4 &, and crashes on 1", () => {
    expect(ticksOf("first3-tom-fill", "tom1")).toEqual([288, 312]);
    expect(ticksOf("first3-tom-fill", "tom2")).toEqual([336, 360]);
    expect(ticksOf("first3-tom-fill", "crash")).toEqual([0]);
  });

  it("step 4 opens the hi-hat on the last '&' only, without scoring the pedal", () => {
    const notes = findExercise("first3-open-hihat")?.notes ?? [];
    expect(notes.filter((n) => n.open).map((n) => n.tick)).toEqual([168]);
    expect(notes.some((n) => n.pad === "hihatPedal")).toBe(false);
  });
});

describe("fills", () => {
  const bar = 4 * 48;

  it.each(FILLS.map((e) => [e.id, e] as const))("%s is a groove bar, then a fill bar that ends before the loop", (_, fill) => {
    expect(fill.bars).toBe(2);
    // Bar 1 is a groove: hi-hat or crash on beat 1 with the kick.
    expect(ticksOf(fill.id, "kick")?.[0]).toBe(0);
    // Only the fill bar has sticking.
    const sticked = fill.notes.filter((n) => n.hand);
    expect(sticked.length).toBeGreaterThan(0);
    expect(sticked.every((n) => n.tick >= bar)).toBe(true);
  });

  it("lists the fills easiest first: whole-bar fills on the snare before toms and sixteenths", () => {
    expect(FILLS.map((e) => e.id)).toEqual([
      "fill-snare-quarters",
      "fill-snare-eighths",
      "fill-down-the-toms",
      "fill-sixteenths-beat-4",
      "fill-sixteenths-around",
      "fill-toms-crash",
    ]);
  });

  it("alternates hands through every fill", () => {
    for (const fill of FILLS) {
      const hands = fill.notes.filter((n) => n.hand).map((n) => n.hand);
      expect(hands.every((h, i) => i === 0 || h !== hands[i - 1])).toBe(true);
    }
  });
});

describe("accents on 1 and 3", () => {
  it("accents only beats 1 and 3, alternating hands on eighth notes", () => {
    const exercise = findExercise("accents-1-3");
    expect(exercise?.notes.filter((n) => n.dynamic === "accent").map((n) => n.tick)).toEqual([0, 96]);
    expect(exercise?.notes.map((n) => n.hand).join("")).toBe("RLRLRLRL");
  });
});

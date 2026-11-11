import { describe, expect, it } from "vitest";
import { findExercise } from "./library";
import { metronomeForExercise, subdivisionFor } from "./practice";
import type { Exercise } from "./types";

function exercise(id: string): Exercise {
  const found = findExercise(id);
  if (!found) throw new Error(`missing exercise ${id}`);
  return found;
}

describe("subdivisionFor", () => {
  it("picks the finest grid the notes use", () => {
    expect(subdivisionFor(exercise("rock-8ths"))).toBe(2);
    expect(subdivisionFor(exercise("rock-16ths"))).toBe(4);
    expect(subdivisionFor(exercise("triplet-singles"))).toBe(3);
  });

  it("counts eighth-note beats in 6/8, so eighths need no subdivision", () => {
    expect(subdivisionFor(exercise("six-eight"))).toBe(1);
  });
});

describe("metronomeForExercise", () => {
  it("uses the suggested tempo and the time signature, and keeps the click choice", () => {
    expect(metronomeForExercise(exercise("six-eight"), true)).toEqual({
      bpm: 120,
      beatsPerBar: 6,
      subdivision: 1,
      clickSubdivisions: true,
    });
    expect(metronomeForExercise(exercise("paradiddle"), false)).toMatchObject({ bpm: 70, beatsPerBar: 4, subdivision: 4 });
  });
});

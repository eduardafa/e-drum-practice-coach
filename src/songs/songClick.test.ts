import { describe, expect, it } from "vitest";
import type { BeatGrid } from "./beats";
import { beatsUntil, firstBeatFrom, isDownbeat } from "./songClick";

const grid: BeatGrid = { beats: [0.5, 1, 1.5, 2, 2.5, 3, 3.5], firstDownbeat: 1, bpm: 120 };

describe("song click planning", () => {
  it("marks every fourth beat from the first beat 1 as a downbeat", () => {
    expect(grid.beats.map((_, i) => isDownbeat(grid, i))).toEqual([false, true, false, false, false, true, false]);
  });

  it("lists the beats from an index up to a song time", () => {
    expect(beatsUntil(grid, 2, 2.6).map((b) => b.time)).toEqual([1.5, 2, 2.5]);
    expect(beatsUntil(grid, 5, 10).map((b) => b.downbeat)).toEqual([true, false]);
  });

  it("finds the first beat at or after a position", () => {
    expect(firstBeatFrom(grid, 1)).toBe(1);
    expect(firstBeatFrom(grid, 1.1)).toBe(2);
    expect(firstBeatFrom(grid, 9)).toBe(grid.beats.length);
  });
});

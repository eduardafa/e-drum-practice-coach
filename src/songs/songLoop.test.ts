import { describe, expect, it } from "vitest";
import type { BeatGrid } from "./beats";
import { DEFAULT_LOOP_BARS, barLines, loopFrom, loopLabel, loopTo } from "./songLoop";

// 120 BPM from 0.5 s, beat 1 on the second beat (1 s): bars start at 1, 3, 5, 7, ... s.
const beats = Array.from({ length: 40 }, (_, i) => 0.5 + i * 0.5);
const grid: BeatGrid = { beats, firstDownbeat: 1, bpm: 120 };
const DURATION = 21;

describe("barLines", () => {
  it("lists every beat 1", () => {
    expect(barLines(grid).slice(0, 4)).toEqual([1, 3, 5, 7]);
  });
});

describe("loopFrom", () => {
  it(`starts at the bar the playhead is in, for ${DEFAULT_LOOP_BARS} bars`, () => {
    expect(loopFrom(grid, 6.2, DURATION)).toEqual({ start: 5, end: 13 });
  });

  it("counts a press just after a bar line as the bar before (reaction time)", () => {
    expect(loopFrom(grid, 7.1, DURATION)).toEqual({ start: 5, end: 13 });
    expect(loopFrom(grid, 7.3, DURATION)).toEqual({ start: 7, end: 15 });
  });

  it("uses the first bar before it, and stops at the song's end", () => {
    expect(loopFrom(grid, 0.2, DURATION)).toEqual({ start: 1, end: 9 });
    expect(loopFrom(grid, 19.5, DURATION)?.end).toBe(DURATION);
  });

  it("is null without bars", () => {
    expect(loopFrom({ beats: [], firstDownbeat: 0, bpm: 120 }, 3, DURATION)).toBeNull();
  });
});

describe("loopTo", () => {
  const loop = { start: 5, end: 13 };

  it("ends the loop at the bar line at or after the playhead", () => {
    expect(loopTo(grid, loop, 8.4, DURATION)).toEqual({ start: 5, end: 9 });
    expect(loopTo(grid, loop, 16, DURATION)).toEqual({ start: 5, end: 17 });
  });

  it("keeps at least one bar, even from before the start", () => {
    expect(loopTo(grid, loop, 5.5, DURATION)).toEqual({ start: 5, end: 7 });
    expect(loopTo(grid, loop, 2, DURATION)).toEqual({ start: 5, end: 7 });
  });
});

describe("loopLabel", () => {
  it("names the bars, counting the first beat 1 as bar 1", () => {
    expect(loopLabel(grid, { start: 5, end: 13 })).toBe("bars 3–6");
    expect(loopLabel(grid, { start: 5, end: 7 })).toBe("bar 3");
  });
});

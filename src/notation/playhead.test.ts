import { describe, expect, it } from "vitest";
import type { Count } from "../live/counts";
import { playheadTick, type PlayheadGrid } from "./playhead";

// 4/4 eighths at 120 BPM: a count every 250 ms; 48 ticks per beat.
const grid: PlayheadGrid = { countsPerBar: 8, countsPerBeat: 2, beatTicks: 48 };
const counts: Count[] = Array.from({ length: 16 }, (_, i) => ({
  time: 1000 + i * 250,
  index: i % 8,
  label: "",
  bar: Math.floor(i / 8),
}));

describe("playheadTick", () => {
  it("is null before the first click is heard", () => {
    expect(playheadTick(counts, 999, grid)).toBeNull();
    expect(playheadTick([], 5000, grid)).toBeNull();
  });

  it("is on the beat when its click is heard", () => {
    expect(playheadTick(counts, 1000, grid)).toBe(0);
    expect(playheadTick(counts, 1500, grid)).toBe(48);
  });

  it("moves between clicks in proportion to the time passed", () => {
    expect(playheadTick(counts, 1125, grid)).toBe(12);
    expect(playheadTick(counts, 1375, grid)).toBe(36);
  });

  it("counts bars, so a second bar continues past the first", () => {
    expect(playheadTick(counts, 3000, grid)).toBe(192);
    expect(playheadTick(counts, 3250, grid)).toBe(216);
  });

  it("stops at the last scheduled count instead of running ahead", () => {
    expect(playheadTick(counts, 99_999, grid)).toBe(15 * 24);
  });

  it("uses the exercise's beat: eighth-note beats in 6/8", () => {
    const sixEight: PlayheadGrid = { countsPerBar: 6, countsPerBeat: 1, beatTicks: 24 };
    const c: Count[] = [0, 1, 2].map((i) => ({ time: i * 500, index: i, label: "", bar: 0 }));
    expect(playheadTick(c, 750, sixEight)).toBe(36);
  });
});

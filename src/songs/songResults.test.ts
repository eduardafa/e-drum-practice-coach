import { describe, expect, it } from "vitest";
import type { BeatGrid } from "./beats";
import { driftByBar, hardestBar, type SongHit } from "./songResults";

// 120 BPM, beat 1 at 1 s: bars at 1, 3, 5, 7 ... s.
const grid: BeatGrid = { beats: Array.from({ length: 40 }, (_, i) => 0.5 + i * 0.5), firstDownbeat: 1, bpm: 120 };
const hit = (at: number, deltaMs: number, onTime = Math.abs(deltaMs) <= 35): SongHit => ({ at, deltaMs, onTime });

describe("driftByBar", () => {
  it("covers the bars from the first hit to the last, with each bar's average timing and on-time share", () => {
    const bars = driftByBar(grid, [hit(3, 5), hit(3.5, -5), hit(7, 60), hit(7.5, 40), hit(8, 10)], 21);
    expect(bars.map((b) => b.bar)).toEqual([2, 3, 4]);
    expect(bars[0]).toMatchObject({ start: 3, end: 5, hits: 2, meanMs: 0, onTime: 1 });
    expect(bars[1]).toMatchObject({ hits: 0, meanMs: null, onTime: null });
    expect(bars[2].meanMs).toBeCloseTo(110 / 3);
    expect(bars[2].onTime).toBeCloseTo(1 / 3);
  });

  it("counts an early hit on beat 1 in that bar, not the one before", () => {
    const bars = driftByBar(grid, [hit(2.97, -30), hit(4, 0)], 21);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ bar: 2, hits: 2 });
  });

  it("is empty with no hits", () => {
    expect(driftByBar(grid, [], 21)).toEqual([]);
  });
});

describe("hardestBar", () => {
  it("picks the bar with the lowest on-time share, among bars with enough hits", () => {
    const bars = driftByBar(grid, [hit(3, 5), hit(3.5, 5), hit(5, 50), hit(5.5, 10), hit(7, 90)], 21);
    expect(hardestBar(bars)?.bar).toBe(3);
  });

  it("breaks ties by how far off the bar is on average", () => {
    const bars = driftByBar(grid, [hit(3, 50), hit(3.5, 0), hit(5, -80), hit(5.5, 0)], 21);
    expect(hardestBar(bars)?.bar).toBe(3);
  });

  it("is null when everything was on time", () => {
    expect(hardestBar(driftByBar(grid, [hit(3, 5), hit(3.5, -5)], 21))).toBeNull();
  });
});

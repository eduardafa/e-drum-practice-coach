import { describe, expect, it } from "vitest";
import { scoreHit, TimingGrid } from "../timing/grid";
import type { BeatGrid } from "./beats";
import { cursorAt, takeSongSteps } from "./songSteps";

/** 8 beats at 120 BPM, then 8 at 150 BPM: a tempo change mid-song. Beat 1 on the second beat. */
const beats: number[] = [];
for (let i = 0, t = 1; i < 16; i++) {
  beats.push(+t.toFixed(6));
  t += i < 7 ? 0.5 : 0.4;
}
const grid: BeatGrid = { beats, firstDownbeat: 1, bpm: 120 };

describe("takeSongSteps", () => {
  it("gives every beat, counted in the bar from beat 1", () => {
    const steps = takeSongSteps(grid, 1, cursorAt(grid, 1, 0), 3.1);
    expect(steps.map((s) => s.time)).toEqual([1, 1.5, 2, 2.5, 3]);
    expect(steps.map((s) => s.label)).toEqual(["4", "1", "2", "3", "4"]);
    expect(steps.map((s) => s.downbeat)).toEqual([false, true, false, false, false]);
    expect(steps.map((s) => s.bar)).toEqual([0, 0, 0, 0, 0]);
  });

  it("splits each gap evenly for the counts in between, following a tempo change", () => {
    const steps = takeSongSteps(grid, 2, cursorAt(grid, 2, 4.4), 5.3);
    // Beat 7 (4.5 s) is the last 0.5 s gap; from beat 8 (4.9 s) beats are 0.4 s apart.
    expect(steps.map((s) => [+s.time.toFixed(3), s.label, +s.intervalSec.toFixed(3)])).toEqual([
      [4.5, "3", 0.2],
      [4.7, "&", 0.2],
      [4.9, "4", 0.2],
      [5.1, "&", 0.2],
    ]);
  });

  it("continues where it stopped, and ends after the last beat", () => {
    const cursor = cursorAt(grid, 1, 0);
    const first = takeSongSteps(grid, 1, cursor, 2);
    const rest = takeSongSteps(grid, 1, cursor, 100);
    expect(first.length + rest.length).toBe(beats.length);
    expect(rest[0].time).toBe(2);
    expect(takeSongSteps(grid, 1, cursor, 200)).toEqual([]);
  });

  it("starts from a chosen point in the song", () => {
    expect(takeSongSteps(grid, 4, cursorAt(grid, 4, 2.2), 2.6).map((s) => [s.time, s.label])).toEqual([
      [2.25, "&"],
      [2.375, "a"],
      [2.5, "3"],
    ]);
  });
});

describe("scoring hits against a song's steps", () => {
  // The song started at performance time 10 s: song time t is heard at 10000 + 1000 t ms.
  const timing = new TimingGrid(1024);
  for (const s of takeSongSteps(grid, 1, cursorAt(grid, 1, 0), 100)) {
    timing.add({ time: 10_000 + s.time * 1000, intervalMs: s.intervalSec * 1000, beat: s.beat, downbeat: s.downbeat });
  }
  const options = { toleranceMs: 15, latencyOffsetMs: 0 };

  it("scores hits before the tempo change against the slower beats", () => {
    expect(scoreHit(timing, 10_000 + 2000 - 30, options)).toMatchObject({ deltaMs: -30, verdict: "early" });
    expect(scoreHit(timing, 10_000 + 2500 + 10, options)).toMatchObject({ deltaMs: 10, verdict: "onTime" });
  });

  it("scores hits after it against the faster beats", () => {
    // Beat 12 is at 4.9 + 4 × 0.4 = 6.5 s.
    expect(scoreHit(timing, 10_000 + 6500 + 40, options)).toMatchObject({ deltaMs: 40, verdict: "late" });
    expect(scoreHit(timing, 10_000 + 6500 + 40, options)?.point.intervalMs).toBeCloseTo(400);
  });

  it("applies the latency offset as with the metronome", () => {
    expect(scoreHit(timing, 10_000 + 3000 + 25, { toleranceMs: 15, latencyOffsetMs: 20 })).toMatchObject({ deltaMs: 5, verdict: "onTime" });
  });
});

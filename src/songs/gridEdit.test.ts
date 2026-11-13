import { describe, expect, it } from "vitest";
import type { BeatGrid } from "./beats";
import { addTap, doubleTempo, gridFromTaps, halveTempo, MIN_TAPS, nearestBeat, nudge, setDownbeat, tapTime } from "./gridEdit";

/** A steady grid: `count` beats every `gap` s from `start`, beat 1 at index `first`. */
const steady = (count: number, gap: number, start = 0, first = 0): BeatGrid => ({
  beats: Array.from({ length: count }, (_, i) => +(start + i * gap).toFixed(6)),
  firstDownbeat: first,
  bpm: 60 / gap,
});
/** Song times of every beat 1. */
const downbeats = (g: BeatGrid) => g.beats.filter((_, i) => i >= g.firstDownbeat && (i - g.firstDownbeat) % 4 === 0);

describe("doubleTempo", () => {
  it("adds a beat halfway between each pair, doubling the tempo, with beat 1 at the same time", () => {
    const g = steady(9, 0.5, 1, 1);
    const d = doubleTempo(g);
    expect(d.beats.slice(0, 4)).toEqual([1, 1.25, 1.5, 1.75]);
    expect(d.bpm).toBeCloseTo(240);
    expect(downbeats(d)[0]).toBeCloseTo(downbeats(g)[0]);
  });
});

describe("halveTempo", () => {
  it("keeps every other beat in line with beat 1, halving the tempo", () => {
    const g = steady(16, 0.25, 0, 3);
    const h = halveTempo(g);
    expect(h.bpm).toBeCloseTo(120);
    expect(h.beats).toContain(g.beats[3]);
    expect(h.beats[1] - h.beats[0]).toBeCloseTo(0.5);
    expect(downbeats(h)[0]).toBeCloseTo(g.beats[3]);
  });

  it("undoes doubleTempo's beats, with beat 1 on one of the doubled grid's beat 1s", () => {
    const g = steady(12, 0.5, 0.2, 2);
    const doubled = doubleTempo(g);
    const back = halveTempo(doubled);
    expect(back.beats).toEqual(g.beats);
    expect(back.bpm).toBeCloseTo(g.bpm);
    expect(downbeats(doubled)).toContain(downbeats(back)[0]);
  });
});

describe("setDownbeat and nearestBeat", () => {
  it("moves the bar lines so the chosen beat is a beat 1", () => {
    const g = steady(12, 0.5);
    const s = setDownbeat(g, nearestBeat(g, 2.6));
    expect(downbeats(s)).toContain(2.5);
    expect(s.beats).toEqual(g.beats);
  });

  it("finds no beat in an empty grid", () => {
    expect(nearestBeat({ beats: [], firstDownbeat: 0, bpm: 120 }, 1)).toBe(-1);
  });
});

describe("nudge", () => {
  it("moves every beat by the given milliseconds", () => {
    expect(nudge(steady(3, 0.5, 1), 20).beats).toEqual([1.02, 1.52, 2.02]);
    expect(nudge(steady(3, 0.5, 1), -20).beats.map((b) => +b.toFixed(3))).toEqual([0.98, 1.48, 1.98]);
  });

  it("drops beats pushed before the start, keeping beat 1 on the same beats", () => {
    const g = steady(8, 0.5, 0.01, 1);
    const n = nudge(g, -20);
    expect(n.beats[0]).toBeCloseTo(0.49);
    expect(downbeats(n)[0]).toBeCloseTo(downbeats(g)[0] - 0.02);
  });
});

/** MIN_TAPS + 2 taps every `gap` s from `start`, each off by the next of `jitter` (cycled). */
const taps = (gap: number, start: number, jitter: number[] = []) =>
  Array.from({ length: MIN_TAPS + 2 }, (_, i) => start + i * gap + (jitter[i % jitter.length] ?? 0));

describe("gridFromTaps", () => {
  it("builds a grid over the whole song from slightly uneven taps, the first tap on beat 1", () => {
    const g = gridFromTaps(taps(0.5, 10.03, [0.015, -0.01, 0.005, -0.02]), 30);
    expect(g).not.toBeNull();
    if (!g) return;
    expect(g.bpm).toBeCloseTo(120, 0);
    expect(g.beats[0]).toBeLessThan(0.5);
    expect(g.beats.at(-1)).toBeGreaterThan(29.4);
    expect(Math.abs(downbeats(g).reduce((best, d) => (Math.abs(d - 10.03) < Math.abs(best - 10.03) ? d : best)) - 10.03)).toBeLessThan(0.03);
  });

  it("refuses too few taps or very uneven ones", () => {
    expect(gridFromTaps([1, 1.5, 2], 30)).toBeNull();
    expect(gridFromTaps(taps(0.5, 1, [0, 0.2]), 30)).toBeNull();
  });
});

describe("tapTime", () => {
  it("is the song position when the hit was played, less the latency", () => {
    expect(tapTime(10, 5000, 4900, 0)).toBeCloseTo(9.9);
    expect(tapTime(10, 5000, 4900, 20)).toBeCloseTo(9.88);
  });
});

describe("addTap", () => {
  it("collects steady taps", () => {
    let collected: number[] = [];
    for (const t of [1, 1.5, 2.01, 2.49, 3]) collected = addTap(collected, t).taps;
    expect(collected).toEqual([1, 1.5, 2.01, 2.49, 3]);
  });

  it("ignores a second hit right after a tap", () => {
    expect(addTap([1, 1.5], 1.55)).toEqual({ status: "ignored", taps: [1, 1.5] });
  });

  it("starts again after a long pause, with that tap as the first", () => {
    expect(addTap([1, 1.5], 5)).toEqual({ status: "added", taps: [5] });
  });

  it("clears the taps when one is far off the beat they set", () => {
    expect(addTap([1, 1.5, 2, 2.5], 3.25)).toEqual({ status: "off", taps: [] });
  });
});

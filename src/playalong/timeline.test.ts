import { describe, expect, it } from "vitest";
import { findExercise } from "../exercises/library";
import type { Exercise } from "../exercises/types";
import { buildTimeline, DEFAULT_MAX_WINDOW_MS, msPerTick } from "./timeline";

function exercise(id: string): Exercise {
  const found = findExercise(id);
  if (!found) throw new Error(`missing exercise ${id}`);
  return found;
}

const options = { startMs: 1000, bpm: 120, loops: 2, maxWindowMs: DEFAULT_MAX_WINDOW_MS };

describe("msPerTick", () => {
  it("counts the time signature's beat unit", () => {
    expect(msPerTick({ timeSignature: { beats: 4, unit: 4 } }, 120)).toBeCloseTo(500 / 48, 9);
    // 6/8 at 120 means 120 eighth notes a minute.
    expect(msPerTick({ timeSignature: { beats: 6, unit: 8 } }, 120)).toBeCloseTo(500 / 24, 9);
  });
});

describe("buildTimeline", () => {
  it("places notes at their times, loop after loop", () => {
    const notes = buildTimeline(exercise("rock-8ths"), options);
    const snare = notes.filter((n) => n.pad === "snare").map((n) => n.time);
    // Snare on beats 2 and 4 at 120 BPM (500 ms beats), then the same one bar (2000 ms) later.
    expect(snare).toEqual([1500, 2500, 3500, 4500]);
    expect(notes.at(-1)?.loop).toBe(1);
  });

  it("numbers notes in order and keeps them sorted by time", () => {
    const notes = buildTimeline(exercise("rock-16ths"), options);
    expect(notes.map((n) => n.id)).toEqual(notes.map((_, i) => i));
    expect(notes.every((n, i) => i === 0 || n.time >= notes[i - 1].time)).toBe(true);
  });

  it("caps windows at the maximum when notes on a pad are far apart", () => {
    const kick = buildTimeline(exercise("rock-8ths"), options).filter((n) => n.pad === "kick");
    expect(kick.every((n) => n.windowMs === DEFAULT_MAX_WINDOW_MS)).toBe(true);
  });

  it("narrows windows to half the gap for fast notes on one pad", () => {
    // Sixteenths at 120 BPM are 125 ms apart, so windows are 62.5 ms.
    const hihat = buildTimeline(exercise("rock-16ths"), options).filter((n) => n.pad === "hihat");
    expect(hihat[3].windowMs).toBeCloseTo(62.5, 9);
  });

  it("carries open, flam and dynamic", () => {
    const open = buildTimeline(exercise("open-hihat"), options).find((n) => n.open);
    expect(open?.pad).toBe("hihat");
    const flam = buildTimeline(exercise("flam-taps"), options).find((n) => n.flam);
    expect(flam?.dynamic).toBe("accent");
  });
});

import { describe, expect, it } from "vitest";
import { findExercise } from "./library";
import { FLAM_GAP_SEC, previewPlan } from "./preview";
import type { Exercise } from "./types";

function exercise(id: string): Exercise {
  const found = findExercise(id);
  if (!found) throw new Error(`missing exercise ${id}`);
  return found;
}

describe("previewPlan", () => {
  it("plays one loop of the money beat at the given tempo", () => {
    // 120 BPM: an eighth every 0.25 s, a bar of 2 s.
    const plan = previewPlan(exercise("rock-8ths"), 120);
    expect(plan.durationSec).toBeCloseTo(2);
    expect(plan.hits).toHaveLength(12);
    expect(plan.hits.filter((h) => h.pad === "snare").map((h) => h.time)).toEqual([0.5, 1.5]);
    expect(plan.beats).toEqual([
      { time: 0, downbeat: true },
      { time: 0.5, downbeat: false },
      { time: 1, downbeat: false },
      { time: 1.5, downbeat: false },
    ]);
  });

  it("counts 6/8 in eighth notes", () => {
    const plan = previewPlan(exercise("six-eight"), 120);
    expect(plan.durationSec).toBeCloseTo(3);
    expect(plan.beats).toHaveLength(6);
    expect(plan.beats.filter((b) => b.downbeat)).toHaveLength(1);
  });

  it("adds a quiet grace note before each flam", () => {
    const plan = previewPlan(exercise("flam-taps"), 60);
    const graces = plan.hits.filter((h) => h.grace);
    expect(graces).toHaveLength(8);
    expect(graces[0]).toMatchObject({ time: -FLAM_GAP_SEC, dynamic: "ghost" });
    expect(plan.hits[1]).toMatchObject({ time: 0, grace: false, dynamic: "accent" });
  });

  it("keeps open hi-hats and dynamics, sorted by time", () => {
    const plan = previewPlan(exercise("open-hihat"), 100);
    expect(plan.hits.filter((h) => h.open)).toHaveLength(1);
    expect(plan.hits.every((h, i) => i === 0 || plan.hits[i - 1].time <= h.time)).toBe(true);
  });
});

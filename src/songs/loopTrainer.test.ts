import { describe, expect, it } from "vitest";
import { DEFAULT_START_SPEED, nextLoopSpeed, passAccuracy, startSpeed } from "./loopTrainer";
import type { TabScore } from "./tabScoring";

describe("startSpeed", () => {
  it("starts at the chosen speed, or 70% from full speed", () => {
    expect(startSpeed(0.5)).toBe(0.5);
    expect(startSpeed(0.85)).toBe(0.85);
    expect(startSpeed(1)).toBe(DEFAULT_START_SPEED);
  });
});

describe("nextLoopSpeed", () => {
  it("goes up a speed at 90% or more, and finishes after a pass at full speed", () => {
    expect(nextLoopSpeed(0.5, 0.92)).toEqual({ outcome: "up", speed: 0.7 });
    expect(nextLoopSpeed(0.7, 0.9)).toEqual({ outcome: "up", speed: 0.85 });
    expect(nextLoopSpeed(0.85, 0.95)).toEqual({ outcome: "up", speed: 1 });
    expect(nextLoopSpeed(1, 0.91)).toEqual({ outcome: "done", speed: 1 });
  });

  it("goes down one below 70%, never below the slowest, and stays in between", () => {
    expect(nextLoopSpeed(0.85, 0.6)).toEqual({ outcome: "down", speed: 0.7 });
    expect(nextLoopSpeed(0.5, 0.3)).toEqual({ outcome: "stay", speed: 0.5 });
    expect(nextLoopSpeed(0.7, 0.8)).toEqual({ outcome: "stay", speed: 0.7 });
  });

  it("plays a pass again when there was too little to judge", () => {
    expect(nextLoopSpeed(0.7, null)).toEqual({ outcome: "stay", speed: 0.7 });
  });
});

const tab = (over: Partial<TabScore>): TabScore => ({ played: 0, hit: 0, onTime: 0, early: 0, late: 0, missed: 0, wrongDrum: 0, extra: 0, ...over });

describe("passAccuracy", () => {
  it("with a tab: on-time notes out of notes plus extra hits", () => {
    expect(passAccuracy(tab({ played: 20, hit: 19, onTime: 18, extra: 0 }), { scored: 0, onTime: 0 }, 16)).toBeCloseTo(0.9);
    // Hitting everything adds extras, which count against.
    expect(passAccuracy(tab({ played: 20, onTime: 20, extra: 20 }), { scored: 0, onTime: 0 }, 16)).toBeCloseTo(0.5);
    expect(passAccuracy(tab({}), { scored: 0, onTime: 0 }, 16)).toBeNull();
  });

  it("without a tab: hits on the beat, if there were about as many hits as beats", () => {
    expect(passAccuracy(null, { scored: 16, onTime: 15 }, 16)).toBeCloseTo(15 / 16);
    expect(passAccuracy(null, { scored: 3, onTime: 3 }, 16)).toBe(0);
    expect(passAccuracy(null, { scored: 0, onTime: 0 }, 16)).toBeNull();
  });
});

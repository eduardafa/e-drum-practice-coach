import { describe, expect, it } from "vitest";
import { MIN_BPM } from "../audio/schedule";
import { nextRound, normalizeConfig, type TrainerConfig } from "./trainer";

const config: TrainerConfig = { startBpm: 60, targetBpm: 80, passMark: 0.9, failMark: 0.7, step: 4 };

describe("nextRound", () => {
  it("speeds up after a passing round", () => {
    expect(nextRound(config, 60, 0.9)).toEqual({ outcome: "up", bpm: 64 });
    expect(nextRound(config, 60, 1)).toEqual({ outcome: "up", bpm: 64 });
  });

  it("slows down after a round below the fail mark", () => {
    expect(nextRound(config, 64, 0.69)).toEqual({ outcome: "down", bpm: 60 });
  });

  it("stays at the same tempo in between", () => {
    expect(nextRound(config, 64, 0.7)).toEqual({ outcome: "stay", bpm: 64 });
    expect(nextRound(config, 64, 0.89)).toEqual({ outcome: "stay", bpm: 64 });
  });

  it("doesn't overshoot the target", () => {
    expect(nextRound(config, 78, 0.95)).toEqual({ outcome: "up", bpm: 80 });
  });

  it("finishes after a passing round at the target", () => {
    expect(nextRound(config, 80, 0.92)).toEqual({ outcome: "done", bpm: 80 });
  });

  it("never goes below the minimum tempo", () => {
    expect(nextRound(config, MIN_BPM + 2, 0.1)).toEqual({ outcome: "down", bpm: MIN_BPM });
    expect(nextRound(config, MIN_BPM, 0.1)).toEqual({ outcome: "stay", bpm: MIN_BPM });
  });

  it("can go below the start tempo when a round falls apart", () => {
    expect(nextRound(config, 60, 0.5)).toEqual({ outcome: "down", bpm: 56 });
  });
});

describe("normalizeConfig", () => {
  it("raises a target below the start to the start", () => {
    expect(normalizeConfig({ ...config, targetBpm: 50 }).targetBpm).toBe(60);
  });

  it("keeps tempos in range and the fail mark at or below the pass mark", () => {
    const c = normalizeConfig({ startBpm: 5, targetBpm: 999, passMark: 1.2, failMark: 1.5, step: 0 });
    expect(c).toEqual({ startBpm: MIN_BPM, targetBpm: 300, passMark: 1, failMark: 1, step: 1 });
  });
});

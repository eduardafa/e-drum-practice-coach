import { describe, expect, it } from "vitest";
import type { GridPoint } from "../timing/grid";
import { standardDeviation } from "../timing/calibration";
import { LiveState, type LiveHit } from "./liveState";

const point: GridPoint = { time: 0, intervalMs: 500, downbeat: false, beat: true };
const hit = (deltaMs: number): LiveHit => ({
  pad: "snare",
  note: 38,
  zone: "head",
  velocity: 100,
  time: deltaMs,
  score: { deltaMs, verdict: "onTime", point },
});

describe("LiveState spread", () => {
  it("is unknown until there are two scored hits", () => {
    const live = new LiveState();
    expect(live.spreadMs).toBeNull();
    live.addHit(hit(10));
    expect(live.spreadMs).toBeNull();
  });

  it("matches the sample standard deviation of the deltas", () => {
    const deltas = [12, -30, 25, 4, -8, 40, -15, 3, 18, -22];
    const live = new LiveState();
    for (const d of deltas) live.addHit(hit(d));
    expect(live.spreadMs).toBeCloseTo(standardDeviation(deltas), 9);
  });

  it("ignores unscored hits and resets with the session", () => {
    const live = new LiveState();
    live.addHit(hit(10));
    live.addHit({ ...hit(500), score: null });
    live.addHit(hit(20));
    expect(live.spreadMs).toBeCloseTo(standardDeviation([10, 20]), 9);
    live.resetSession();
    expect(live.spreadMs).toBeNull();
  });
});

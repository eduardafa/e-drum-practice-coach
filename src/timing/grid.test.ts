import { describe, expect, it } from "vitest";
import { classify, scoreHit, TimingGrid } from "./grid";

function gridAt(times: number[], intervalMs = 500) {
  const g = new TimingGrid();
  for (const time of times) g.add({ time, intervalMs, beat: true, downbeat: false });
  return g;
}

describe("TimingGrid.nearest", () => {
  it("returns null when empty", () => {
    expect(new TimingGrid().nearest(100)).toBeNull();
  });

  it("finds the closest point on either side", () => {
    const g = gridAt([1000, 1500, 2000]);
    expect(g.nearest(1240)?.time).toBe(1000);
    expect(g.nearest(1260)?.time).toBe(1500);
    expect(g.nearest(0)?.time).toBe(1000);
    expect(g.nearest(9999)?.time).toBe(2000);
  });

  it("ignores out-of-order points and caps capacity", () => {
    const g = new TimingGrid(3);
    for (const t of [1, 2, 2, 1, 3, 4]) g.add({ time: t, intervalMs: 1, beat: true, downbeat: false });
    expect(g.size).toBe(3);
    expect(g.nearest(0)?.time).toBe(2);
  });
});

describe("scoreHit", () => {
  const g = gridAt([1000, 1500, 2000]);

  it("scores early, on time and late hits in ms", () => {
    expect(scoreHit(g, 1480, { toleranceMs: 10, latencyOffsetMs: 0 })).toMatchObject({ deltaMs: -20, verdict: "early" });
    expect(scoreHit(g, 1505, { toleranceMs: 10, latencyOffsetMs: 0 })).toMatchObject({ deltaMs: 5, verdict: "onTime" });
    expect(scoreHit(g, 1530, { toleranceMs: 10, latencyOffsetMs: 0 })).toMatchObject({ deltaMs: 30, verdict: "late" });
  });

  it("removes the latency offset before scoring", () => {
    expect(scoreHit(g, 1530, { toleranceMs: 10, latencyOffsetMs: 25 })).toMatchObject({ deltaMs: 5, verdict: "onTime" });
  });

  it("returns null outside every point's window", () => {
    expect(scoreHit(g, 2400, { toleranceMs: 10, latencyOffsetMs: 0 })).toBeNull();
    expect(scoreHit(new TimingGrid(), 1000)).toBeNull();
  });
});

describe("classify", () => {
  it("treats the tolerance boundary as on time", () => {
    expect(classify(15, 15)).toBe("onTime");
    expect(classify(-15.01, 15)).toBe("early");
  });
});

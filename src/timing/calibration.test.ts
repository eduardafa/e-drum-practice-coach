import { describe, expect, it } from "vitest";
import {
  computeCalibration,
  DEFAULT_CALIBRATION,
  median,
  quantile,
  rejectOutliers,
  standardDeviation,
} from "./calibration";

describe("quantile and median", () => {
  it("interpolates between neighbours", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10, 20, 30, 40, 50], 0.25)).toBe(20);
  });

  it("takes the middle value of an odd list, unsorted input", () => {
    expect(median([30, 10, 20])).toBe(20);
  });

  it("throws on an empty list", () => {
    expect(() => quantile([], 0.5)).toThrow("quantile of an empty list");
  });
});

describe("standardDeviation", () => {
  it("uses the sample formula", () => {
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });

  it("is zero for a single value", () => {
    expect(standardDeviation([5])).toBe(0);
  });
});

describe("rejectOutliers", () => {
  it("drops values beyond 1.5×IQR", () => {
    const { kept, rejected } = rejectOutliers([20, 21, 22, 23, 24, 25, 120, -60], 1.5);
    expect(rejected.toSorted((a, b) => a - b)).toEqual([-60, 120]);
    expect(kept).toHaveLength(6);
  });

  it("keeps everything when there are too few values to judge", () => {
    expect(rejectOutliers([1, 100, 1000], 1.5).rejected).toEqual([]);
  });
});

describe("computeCalibration", () => {
  const steady = [21, 24, 23, 22, 25, 23, 20, 24, 22, 23, 26, 21];

  it("returns the median of steady hits as the offset", () => {
    const result = computeCalibration(steady);
    expect(result).toMatchObject({ ok: true, offsetMs: 23, used: 12, rejected: 0 });
    expect(result.spreadMs).toBeLessThan(2);
  });

  it("ignores stray hits", () => {
    const result = computeCalibration([...steady, 180, -90]);
    expect(result).toMatchObject({ ok: true, offsetMs: 23, used: 12, rejected: 2 });
  });

  it("handles negative latency (hits register early)", () => {
    expect(computeCalibration(steady.map((d) => d - 40))).toMatchObject({ ok: true, offsetMs: -17 });
  });

  it("fails with too few hits", () => {
    expect(computeCalibration([20, 21, 22])).toMatchObject({ ok: false, reason: "tooFewHits", used: 3 });
  });

  it("fails when the playing is too uneven to measure", () => {
    const uneven = [0, 40, 10, 50, -10, 30, 60, 5, 45, 20, -5, 35];
    const result = computeCalibration(uneven);
    expect(result).toMatchObject({ ok: false, reason: "tooSpread" });
    expect(result.spreadMs).toBeGreaterThan(DEFAULT_CALIBRATION.maxSpreadMs);
  });

  it("fails when the offset is implausibly large", () => {
    expect(computeCalibration(steady.map((d) => d + 300))).toMatchObject({
      ok: false,
      reason: "outOfRange",
      offsetMs: 323,
    });
  });
});

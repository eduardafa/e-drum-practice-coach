import { describe, expect, it } from "vitest";
import {
  computeCalibration,
  isClearlyNegative,
  median,
  medianStandardError,
  quantile,
  rejectOutliers,
  standardDeviation,
} from "./calibration";

describe("quantile and median", () => {
  it("interpolates between neighbors", () => {
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

describe("medianStandardError", () => {
  it("is about 1.25 × SD / √n", () => {
    expect(medianStandardError(29, 53)).toBeCloseTo(4.99, 2);
    expect(medianStandardError(10, 12)).toBeCloseTo(3.62, 2);
  });

  it("shrinks as hits accumulate", () => {
    expect(medianStandardError(29, 12)).toBeGreaterThan(medianStandardError(29, 48));
  });

  it("is infinite with no hits", () => {
    expect(medianStandardError(10, 0)).toBe(Number.POSITIVE_INFINITY);
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

  it("is confident about steady hits", () => {
    const result = computeCalibration(steady);
    expect(result).toMatchObject({ ok: true, confident: true });
    expect(result.uncertaintyMs).toBeLessThan(1);
  });

  it("still returns a usable result for uneven playing, flagged as not confident", () => {
    const uneven = [0, 40, 10, 50, -10, 30, 60, 5, 45, 20, -5, 35];
    const result = computeCalibration(uneven);
    expect(result).toMatchObject({ ok: true, confident: false, offsetMs: 25 });
    expect(result.uncertaintyMs).toBeGreaterThan(5);
  });

  it("uses the target from the options", () => {
    const uneven = [0, 40, 10, 50, -10, 30, 60, 5, 45, 20, -5, 35];
    const loose = { minHits: 8, iqrFactor: 1.5, targetUncertaintyMs: 10, maxAbsOffsetMs: 200 };
    expect(computeCalibration(uneven, loose)).toMatchObject({ ok: true, confident: true });
  });

  it("fails when the offset is implausibly large", () => {
    expect(computeCalibration(steady.map((d) => d + 300))).toMatchObject({
      ok: false,
      reason: "outOfRange",
      offsetMs: 323,
    });
  });
});

describe("isClearlyNegative", () => {
  it("flags an offset below zero by more than its uncertainty", () => {
    expect(isClearlyNegative({ offsetMs: -25, uncertaintyMs: 10 })).toBe(true);
  });

  it("doesn't flag a small negative offset within its uncertainty", () => {
    expect(isClearlyNegative({ offsetMs: -3, uncertaintyMs: 5 })).toBe(false);
  });

  it("doesn't flag at exactly minus the uncertainty", () => {
    expect(isClearlyNegative({ offsetMs: -5, uncertaintyMs: 5 })).toBe(false);
  });

  it("never flags zero or positive offsets", () => {
    expect(isClearlyNegative({ offsetMs: 0, uncertaintyMs: 0 })).toBe(false);
    expect(isClearlyNegative({ offsetMs: 25, uncertaintyMs: 3 })).toBe(false);
  });
});

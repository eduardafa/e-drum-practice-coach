import { describe, expect, it } from "vitest";
import { ClockMapper } from "./clock";

describe("ClockMapper", () => {
  it("maps audio time to performance time using the first sample", () => {
    const m = new ClockMapper();
    m.update({ contextTime: 2, performanceTime: 5000 });
    expect(m.toPerformanceMs(2.5)).toBe(5500);
  });

  it("smooths small jitter", () => {
    const m = new ClockMapper(0.1);
    m.update({ contextTime: 0, performanceTime: 1000 });
    m.update({ contextTime: 1, performanceTime: 2010 }); // +10 ms jitter
    expect(m.toPerformanceMs(0)).toBeCloseTo(1001);
  });

  it("jumps on large discontinuities", () => {
    const m = new ClockMapper(0.1, 50);
    m.update({ contextTime: 0, performanceTime: 1000 });
    m.update({ contextTime: 1, performanceTime: 2200 });
    expect(m.toPerformanceMs(0)).toBe(1200);
  });

  it("throws before the first sample", () => {
    expect(() => new ClockMapper().toPerformanceMs(0)).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_VOLUME, formatVolume, isVolume, MAX_VOLUME, softClipCurve } from "./volume";

describe("isVolume", () => {
  it("accepts the slider's range, including the boost above 100%", () => {
    expect(isVolume(0)).toBe(true);
    expect(isVolume(DEFAULT_VOLUME)).toBe(true);
    expect(isVolume(MAX_VOLUME)).toBe(true);
  });

  it("rejects anything outside it", () => {
    expect(isVolume(-0.1)).toBe(false);
    expect(isVolume(MAX_VOLUME + 0.1)).toBe(false);
    expect(isVolume(Number.NaN)).toBe(false);
    expect(isVolume("1")).toBe(false);
  });
});

describe("formatVolume", () => {
  it("shows a percentage", () => {
    expect(formatVolume(1.5)).toBe("150%");
    expect(formatVolume(0.05)).toBe("5%");
  });
});

describe("softClipCurve", () => {
  const curve = softClipCurve(2, 4001);
  /** The curve's output for a signal level x (-2..2). */
  const at = (x: number) => curve[Math.round(((x / 2 + 1) / 2) * (curve.length - 1))];

  it("leaves quiet and normal levels unchanged", () => {
    for (const x of [0, 0.25, -0.5, 0.8]) expect(at(x)).toBeCloseTo(x, 3);
  });

  it("keeps boosted peaks under full scale", () => {
    expect(at(1)).toBeLessThan(1);
    expect(at(2)).toBeLessThan(1);
    expect(at(-2)).toBeGreaterThan(-1);
  });

  it("still makes a boost louder: it never flattens or turns back", () => {
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
    expect(at(1.45)).toBeGreaterThan(at(1));
  });
});

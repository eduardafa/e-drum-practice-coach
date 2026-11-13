import { describe, expect, it } from "vitest";
import { DEFAULT_VOLUME, formatVolume, isVolume, MAX_VOLUME } from "./volume";

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

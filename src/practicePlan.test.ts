import { describe, expect, it } from "vitest";
import { formatRemaining } from "./PracticePlan";

describe("formatRemaining", () => {
  it("shows minutes and seconds, rounding up, never negative", () => {
    expect(formatRemaining(425_000)).toBe("7:05");
    expect(formatRemaining(599_001)).toBe("10:00");
    expect(formatRemaining(1)).toBe("0:01");
    expect(formatRemaining(-5_000)).toBe("0:00");
  });
});

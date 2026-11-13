import { describe, expect, it } from "vitest";
import { beepTimes, DEFAULT_GET_READY_SEC, isGetReadySec, secondsLeft } from "./getReady";

describe("isGetReadySec", () => {
  it("accepts the offered lengths, including no countdown", () => {
    expect(isGetReadySec(0)).toBe(true);
    expect(isGetReadySec(DEFAULT_GET_READY_SEC)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isGetReadySec(7)).toBe(false);
    expect(isGetReadySec("5")).toBe(false);
    expect(isGetReadySec(null)).toBe(false);
  });
});

describe("secondsLeft", () => {
  it("counts down whole seconds, changing as each second starts", () => {
    const end = 10_000;
    expect(secondsLeft(end, 7_000)).toBe(3);
    expect(secondsLeft(end, 7_001)).toBe(3);
    expect(secondsLeft(end, 8_000)).toBe(2);
    expect(secondsLeft(end, 9_999)).toBe(1);
  });

  it("is null once the countdown is over", () => {
    expect(secondsLeft(10_000, 10_000)).toBeNull();
    expect(secondsLeft(10_000, 12_000)).toBeNull();
  });
});

describe("beepTimes", () => {
  it("beeps once per second, as each number appears", () => {
    expect(beepTimes(2.5, 3)).toEqual([2.5, 3.5, 4.5]);
  });

  it("doesn't beep without a countdown", () => {
    expect(beepTimes(2.5, 0)).toEqual([]);
  });
});

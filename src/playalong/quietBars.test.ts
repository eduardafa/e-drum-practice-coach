import { describe, expect, it } from "vitest";
import { isQuietBar, isQuietEvery, QUIET_EVERY_OPTIONS, quietEveryLabel } from "./quietBars";

const quietOf = (every: number, bars: number) => Array.from({ length: bars }, (_, bar) => bar).filter((bar) => isQuietBar(bar, every));

describe("isQuietBar", () => {
  it("leaves the click out of the last bar of each group, so the click comes first", () => {
    expect(quietOf(4, 12)).toEqual([3, 7, 11]);
    expect(quietOf(2, 6)).toEqual([1, 3, 5]);
  });

  it("never goes quiet when it's off, or during the count-in", () => {
    expect(quietOf(0, 8)).toEqual([]);
    expect(isQuietBar(-1, 4)).toBe(false);
    expect(isQuietBar(-1, 2)).toBe(false);
  });

  it("goes quiet one bar in `every`, however long the session", () => {
    for (const every of QUIET_EVERY_OPTIONS.filter((n) => n > 0)) {
      expect(quietOf(every, every * 5)).toHaveLength(5);
    }
  });
});

describe("the choices", () => {
  it("accepts only the offered choices", () => {
    for (const every of QUIET_EVERY_OPTIONS) expect(isQuietEvery(every)).toBe(true);
    expect(isQuietEvery(3)).toBe(false);
    expect(isQuietEvery("4")).toBe(false);
  });

  it("names each choice plainly", () => {
    expect(quietEveryLabel(0)).toBe("Click every bar");
    expect(quietEveryLabel(4)).toBe("Quiet bar: 1 in 4");
  });
});

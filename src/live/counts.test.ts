import { describe, expect, it } from "vitest";
import { barCounts, countAt, currentCount, type Count } from "./counts";

describe("barCounts", () => {
  it("counts quarter notes as beat numbers", () => {
    expect(barCounts(4, 1)).toEqual(["1", "2", "3", "4"]);
  });

  it("counts eighths with '&'", () => {
    expect(barCounts(4, 2).join(" ")).toBe("1 & 2 & 3 & 4 &");
  });

  it("counts sixteenths as '1 e & a'", () => {
    expect(barCounts(2, 4).join(" ")).toBe("1 e & a 2 e & a");
  });

  it("counts triplets as '1 trip let'", () => {
    expect(barCounts(2, 3).join(" ")).toBe("1 trip let 2 trip let");
  });
});

describe("countAt", () => {
  it("labels positions in a bar of eighths", () => {
    expect(countAt({ beatInBar: 0, subInBeat: 0 }, 4, 2)).toEqual({ index: 0, label: "1" });
    expect(countAt({ beatInBar: 1, subInBeat: 1 }, 4, 2)).toEqual({ index: 3, label: "&" });
    expect(countAt({ beatInBar: 3, subInBeat: 1 }, 4, 2)).toEqual({ index: 7, label: "&" });
  });

  it("labels sixteenths", () => {
    expect(countAt({ beatInBar: 2, subInBeat: 3 }, 4, 4)).toEqual({ index: 11, label: "a" });
  });

  it("clamps a position left over from a settings change", () => {
    expect(countAt({ beatInBar: 5, subInBeat: 0 }, 4, 1)).toEqual({ index: 3, label: "4" });
  });
});

describe("currentCount", () => {
  const counts: Count[] = [
    { time: 1000, index: 0, label: "1", bar: 0 },
    { time: 1250, index: 1, label: "&", bar: 0 },
    { time: 1500, index: 2, label: "2", bar: 0 },
  ];

  it("is null before the first count", () => {
    expect(currentCount(counts, 999)).toBeNull();
  });

  it("is the latest count already heard", () => {
    expect(currentCount(counts, 1250)?.label).toBe("&");
    expect(currentCount(counts, 1499)?.label).toBe("&");
    expect(currentCount(counts, 2000)?.label).toBe("2");
  });
});

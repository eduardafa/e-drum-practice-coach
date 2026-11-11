import { describe, expect, it } from "vitest";
import { barCounts, CountTracker, currentCount, type Count } from "./counts";

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

describe("CountTracker", () => {
  it("labels steps through the bar and restarts on the downbeat", () => {
    const tracker = new CountTracker();
    const steps = [true, false, false, false, false, false, false, false, true, false];
    const labels = steps.map((downbeat, i) => tracker.next({ downbeat, time: i * 250 }, 4, 2).label);
    expect(labels).toEqual(["1", "&", "2", "&", "3", "&", "4", "&", "1", "&"]);
  });

  it("keeps the step's time and position", () => {
    const tracker = new CountTracker();
    tracker.next({ downbeat: true, time: 1000 }, 4, 2);
    expect(tracker.next({ downbeat: false, time: 1250 }, 4, 2)).toEqual({ time: 1250, index: 1, label: "&" });
  });

  it("wraps around if a downbeat is missed", () => {
    const tracker = new CountTracker();
    tracker.next({ downbeat: true, time: 0 }, 2, 1);
    tracker.next({ downbeat: false, time: 1 }, 2, 1);
    expect(tracker.next({ downbeat: false, time: 2 }, 2, 1)).toMatchObject({ index: 0, label: "1" });
  });
});

describe("currentCount", () => {
  const counts: Count[] = [
    { time: 1000, index: 0, label: "1" },
    { time: 1250, index: 1, label: "&" },
    { time: 1500, index: 2, label: "2" },
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

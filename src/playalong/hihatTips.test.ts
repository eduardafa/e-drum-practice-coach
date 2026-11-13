import { describe, expect, it } from "vitest";
import { mirrorText } from "../handedness";
import { hihatTips } from "./hihatTips";

describe("hihatTips", () => {
  it("says nothing without mix-ups", () => {
    expect(hihatTips({ openInsteadOfClosed: 0, closedInsteadOfOpen: 0 })).toEqual([]);
  });

  it("explains open-instead-of-closed with the pedal foot, and counts in words", () => {
    const [tip] = hihatTips({ openInsteadOfClosed: 3, closedInsteadOfOpen: 0 });
    expect(tip).toMatch(/^3 hi-hat hits sounded open where the music says closed\./);
    expect(tip).toContain("left foot pressed down");
    expect(hihatTips({ openInsteadOfClosed: 1, closedInsteadOfOpen: 0 })[0]).toMatch(/^1 hi-hat hit sounded/);
  });

  it("explains closed-instead-of-open too", () => {
    const tips = hihatTips({ openInsteadOfClosed: 1, closedInsteadOfOpen: 2 });
    expect(tips).toHaveLength(2);
    expect(tips[1]).toMatch(/^2 hi-hat hits sounded closed where the music says open/);
  });

  it("names the right foot on a left-handed kit", () => {
    const [tip] = hihatTips({ openInsteadOfClosed: 2, closedInsteadOfOpen: 0 });
    expect(mirrorText(tip, "left")).toContain("right foot pressed down");
  });
});

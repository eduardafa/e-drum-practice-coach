import { describe, expect, it } from "vitest";
import { parseSettings } from "./settings";

const metronome = { bpm: 100, beatsPerBar: 4, subdivision: 2, clickSubdivisions: true };
const scoring = { toleranceMs: 12, latencyOffsetMs: -8 };

describe("parseSettings", () => {
  it("keeps valid settings", () => {
    expect(parseSettings({ metronome, scoring, skillLevel: "advanced", guideSeen: true })).toEqual({
      metronome,
      scoring,
      skillLevel: "advanced",
      guideSeen: true,
    });
  });

  it("keeps the First steps level", () => {
    expect(parseSettings({ skillLevel: "firstSteps" }).skillLevel).toBe("firstSteps");
  });

  it("only keeps guideSeen when it's true", () => {
    expect(parseSettings({ guideSeen: "yes" }).guideSeen).toBeUndefined();
  });

  it("drops an unknown skill level", () => {
    expect(parseSettings({ skillLevel: "expert" }).skillLevel).toBeUndefined();
  });

  it("drops out-of-range or malformed sections independently", () => {
    expect(parseSettings({ metronome: { ...metronome, bpm: 999 }, scoring })).toEqual({
      metronome: undefined,
      scoring,
      skillLevel: undefined,
      guideSeen: undefined,
    });
    expect(parseSettings({ metronome, scoring: { toleranceMs: "12" } })).toEqual({
      metronome,
      scoring: undefined,
      skillLevel: undefined,
      guideSeen: undefined,
    });
    expect(parseSettings({ metronome: { ...metronome, subdivision: 5 } }).metronome).toBeUndefined();
  });

  it("returns nothing for non-object input", () => {
    expect(parseSettings(null)).toEqual({});
    expect(parseSettings([1, 2])).toEqual({});
    expect(parseSettings("x")).toEqual({});
  });
});

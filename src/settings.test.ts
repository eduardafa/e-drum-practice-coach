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

  it("keeps an exercise that's in the library, and drops one that isn't", () => {
    expect(parseSettings({ exerciseId: "paradiddle" }).exerciseId).toBe("paradiddle");
    expect(parseSettings({ exerciseId: "removed-groove" }).exerciseId).toBeUndefined();
    expect(parseSettings({ exerciseId: 42 }).exerciseId).toBeUndefined();
  });

  it("keeps a known accuracy mode and session length", () => {
    expect(parseSettings({ accuracyMode: "strict", sessionLoops: 8 })).toMatchObject({ accuracyMode: "strict", sessionLoops: 8 });
    expect(parseSettings({ accuracyMode: "lenient", sessionLoops: 5 })).toMatchObject({
      accuracyMode: undefined,
      sessionLoops: undefined,
    });
  });

  it("keeps the tempo of each exercise still in the library, within range", () => {
    expect(
      parseSettings({ exerciseTempos: { "rock-8ths": 72, paradiddle: 500, gone: 80, "six-eight": "fast" } }),
    ).toMatchObject({ exerciseTempos: { "rock-8ths": 72 } });
    expect(parseSettings({ exerciseTempos: { gone: 80 } }).exerciseTempos).toBeUndefined();
    expect(parseSettings({ exerciseTempos: [72] }).exerciseTempos).toBeUndefined();
  });

  it("keeps a volume within the slider's range", () => {
    expect(parseSettings({ volume: 1.5 }).volume).toBe(1.5);
    expect(parseSettings({ volume: 3 }).volume).toBeUndefined();
    expect(parseSettings({ volume: "loud" }).volume).toBeUndefined();
  });

  it("keeps an offered get-ready countdown, including none", () => {
    expect(parseSettings({ getReadySec: 10 }).getReadySec).toBe(10);
    expect(parseSettings({ getReadySec: 0 }).getReadySec).toBe(0);
    expect(parseSettings({ getReadySec: 7 }).getReadySec).toBeUndefined();
  });

  it("keeps the next-pad setting only as a boolean", () => {
    expect(parseSettings({ showNextPad: false }).showNextPad).toBe(false);
    expect(parseSettings({ showNextPad: "no" }).showNextPad).toBeUndefined();
  });

  it("keeps a known kit setup", () => {
    expect(parseSettings({ handedness: "left" }).handedness).toBe("left");
    expect(parseSettings({ handedness: "both" }).handedness).toBeUndefined();
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

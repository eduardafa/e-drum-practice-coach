import { describe, expect, it } from "vitest";
import { COUNT_SPRITE } from "./countSprite";
import { type MetronomeSettings, type ScheduleCursor, stepInterval, takeStepsUntil } from "./schedule";
import {
  isSpokenCountSetting,
  MIN_SUBDIVISION_GAP_SEC,
  SPOKEN_SYLLABLES,
  speaksSubdivisions,
  spokenCountOn,
  spokenStep,
} from "./spokenCount";

const settings = (patch: Partial<MetronomeSettings> = {}): MetronomeSettings => ({
  bpm: 60,
  beatsPerBar: 4,
  subdivision: 2,
  clickSubdivisions: false,
  ...patch,
});
const cursor = (): ScheduleCursor => ({ nextTime: 0, beatInBar: 0, subInBeat: 0 });
/** Every syllable lasts 0.2 s, about as long as the real ones. */
const fixedLength = () => 0.2;

/** The syllables said over one bar (null where nothing is said). */
function barSaid(s: MetronomeSettings): Array<string | null> {
  const barSec = (60 / s.bpm) * s.beatsPerBar;
  return takeStepsUntil(cursor(), s, barSec - 1e-9).map((step) => spokenStep(step, s, fixedLength)?.syllable ?? null);
}

describe("spokenCountOn", () => {
  it("counts in First steps exercises by default, nowhere else", () => {
    expect(spokenCountOn("firstSteps", { category: "first-steps" })).toBe(true);
    expect(spokenCountOn("firstSteps", { category: "groove" })).toBe(false);
    expect(spokenCountOn("firstSteps", null)).toBe(false);
  });

  it("follows the drummer's choice of always or never", () => {
    expect(spokenCountOn("always", null)).toBe(true);
    expect(spokenCountOn("always", { category: "rudiment" })).toBe(true);
    expect(spokenCountOn("never", { category: "first-steps" })).toBe(false);
  });

  it("recognizes only the known settings", () => {
    expect(isSpokenCountSetting("always")).toBe(true);
    expect(isSpokenCountSetting("sometimes")).toBe(false);
    expect(isSpokenCountSetting(undefined)).toBe(false);
  });
});

describe("spokenStep", () => {
  it("says the beat numbers on quarter notes", () => {
    expect(barSaid(settings({ subdivision: 1 }))).toEqual(["1", "2", "3", "4"]);
  });

  it('says "and" between the beats on eighth notes', () => {
    expect(barSaid(settings({ subdivision: 2 }))).toEqual(["1", "&", "2", "&", "3", "&", "4", "&"]);
  });

  it('says "e and a" on sixteenths and "trip let" on triplets', () => {
    expect(barSaid(settings({ beatsPerBar: 2, subdivision: 4 }))).toEqual(["1", "e", "&", "a", "2", "e", "&", "a"]);
    expect(barSaid(settings({ beatsPerBar: 2, subdivision: 3 }))).toEqual(["1", "trip", "let", "2", "trip", "let"]);
  });

  it("follows the bar's length, as in 6/8", () => {
    expect(barSaid(settings({ beatsPerBar: 6, subdivision: 1 }))).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("says only the beats when the in-between counts come too fast", () => {
    const fast = settings({ bpm: 120, subdivision: 4 });
    expect(stepInterval(fast)).toBeLessThan(MIN_SUBDIVISION_GAP_SEC);
    expect(speaksSubdivisions(fast)).toBe(false);
    expect(barSaid({ ...fast, beatsPerBar: 2 })).toEqual(["1", null, null, null, "2", null, null, null]);
  });

  it("says nothing for a beat number it has no sound for", () => {
    const step = { beatInBar: 8, subInBeat: 0, intervalSec: 1 };
    expect(spokenStep(step, settings({ beatsPerBar: 12, subdivision: 1 }), fixedLength)).toBeNull();
  });

  it("plays the whole syllable when there's room before the next one", () => {
    const step = { beatInBar: 0, subInBeat: 0, intervalSec: 0.5 };
    expect(spokenStep(step, settings(), fixedLength)?.durationSec).toBeCloseTo(0.2);
  });

  it("cuts a syllable short before the next spoken step", () => {
    // 150 BPM eighths: 0.2 s apart, still said, so each syllable stops just short of the next.
    const s = settings({ bpm: 150 });
    const said = spokenStep({ beatInBar: 0, subInBeat: 0, intervalSec: stepInterval(s) }, s, fixedLength);
    expect(said?.durationSec).toBeGreaterThan(0);
    expect(said?.durationSec).toBeLessThan(stepInterval(s));
  });

  it("gives a beat the whole beat when the in-between counts aren't said", () => {
    // At 240 BPM sixteenths are too fast; the beat number may last up to the next beat (0.25 s), so all 0.2 s plays.
    const s = settings({ bpm: 240, subdivision: 4 });
    const said = spokenStep({ beatInBar: 1, subInBeat: 0, intervalSec: stepInterval(s) }, s, fixedLength);
    expect(said).toEqual({ syllable: "2", durationSec: 0.2 });
  });
});

describe("the count's sound file", () => {
  it("has a slice for every syllable the count says", () => {
    const missing = SPOKEN_SYLLABLES.filter((syllable) => !((COUNT_SPRITE[syllable]?.duration ?? 0) > 0));
    expect(missing).toEqual([]);
  });
});

/**
 * The spoken count ("one and two and"): when it's on, and which syllable is
 * said on which metronome step. Pure, so it can be tested without audio; the
 * metronome plays the syllables (see ./countVoice).
 */
import type { Exercise } from "../exercises/types";
import { countAt } from "../live/counts";
import type { MetronomeSettings } from "./schedule";

/** When the metronome counts out loud: in First steps exercises only (the default), always, or never. */
export type SpokenCountSetting = "firstSteps" | "always" | "never";

export const DEFAULT_SPOKEN_COUNT: SpokenCountSetting = "firstSteps";

export function isSpokenCountSetting(value: unknown): value is SpokenCountSetting {
  return value === "firstSteps" || value === "always" || value === "never";
}

/** Whether to count out loud for a run of the metronome: a session's exercise, or null for the plain metronome or calibration. */
export function spokenCountOn(setting: SpokenCountSetting, exercise: Pick<Exercise, "category"> | null): boolean {
  if (setting === "always") return true;
  if (setting === "never") return false;
  return exercise?.category === "first-steps";
}

/** Syllables with a recorded sound: the beat numbers up to 7 (the most beats per bar the app offers) and the in-between counts. */
export const SPOKEN_SYLLABLES = ["1", "2", "3", "4", "5", "6", "7", "&", "e", "a", "trip", "let"] as const;

export type SpokenSyllable = (typeof SPOKEN_SYLLABLES)[number];

function isSpokenSyllable(label: string): label is SpokenSyllable {
  return (SPOKEN_SYLLABLES as readonly string[]).includes(label);
}

/**
 * Below this many seconds between steps, only the beats are said: "and", "e"
 * and the like would run into each other (a syllable lasts about 0.2 s).
 * Eighths are said up to 160 BPM, sixteenths up to 80.
 */
export const MIN_SUBDIVISION_GAP_SEC = 0.1875;

/** Silence kept before the next syllable, so a cut-short one fades out instead of running into it. */
const CUT_GAP_SEC = 0.015;

/** Whether the in-between counts are said at these settings, not only the beats. */
export function speaksSubdivisions(settings: Pick<MetronomeSettings, "bpm" | "subdivision">): boolean {
  return settings.subdivision > 1 && 60 / settings.bpm / settings.subdivision >= MIN_SUBDIVISION_GAP_SEC;
}

/**
 * What to say on a step and for how long: the count's syllable ("1", "&",
 * "e"...), at most `syllableSec` long and cut short before the next spoken
 * step. Null when nothing is said: an in-between step at a tempo too fast to
 * say it, or a beat number with no sound (beat 8 and up).
 */
export function spokenStep(
  step: { beatInBar: number; subInBeat: number; intervalSec: number },
  settings: Pick<MetronomeSettings, "bpm" | "beatsPerBar" | "subdivision">,
  syllableSec: (syllable: SpokenSyllable) => number,
): { syllable: SpokenSyllable; durationSec: number } | null {
  const subdivisions = speaksSubdivisions(settings);
  if (step.subInBeat !== 0 && !subdivisions) return null;
  const { label } = countAt(step, settings.beatsPerBar, settings.subdivision);
  if (!isSpokenSyllable(label)) return null;
  // Time until the next spoken step: the next step if the in-between counts are said, else the next beat.
  const untilNextSec = subdivisions ? step.intervalSec : step.intervalSec * settings.subdivision;
  return { syllable: label, durationSec: Math.max(0, Math.min(syllableSec(label), untilNextSec - CUT_GAP_SEC)) };
}

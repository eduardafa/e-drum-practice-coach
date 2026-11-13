/**
 * The objects the whole app shares, created once when the page loads: the
 * saved settings, the coach (MIDI, metronome, scoring), the history store,
 * and the result of a sign-in redirect.
 */
import { signInResult as readSignInResult } from "./account/account";
import { HistoryStore } from "./history/store";
import { Coach, DEFAULT_METRONOME } from "./live/coach";
import { DEFAULT_SKILL_LEVEL, SKILL_PROFILES } from "./profiles";
import { loadSettings } from "./settings";
import { DEFAULT_SCORING } from "./timing/grid";

export const saved = loadSettings();
export const coach = new Coach(saved.metronome ?? DEFAULT_METRONOME);
export const historyStore = new HistoryStore();

/** Read once: the sign-in redirect lands on /?signin=<result>. */
export const SIGN_IN_RESULT = readSignInResult(window.location.search);

// A first-time drummer gets the on-time window of their (default) skill level.
coach.scoring = saved.scoring ?? {
  ...DEFAULT_SCORING,
  toleranceMs: SKILL_PROFILES[saved.skillLevel ?? DEFAULT_SKILL_LEVEL].toleranceMs,
};

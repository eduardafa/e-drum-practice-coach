/**
 * "How to play with the metronome": the guide's steps as data. Each step says
 * what to play, shows it on a one-bar grid of eighth-note counts
 * ("1 & 2 & 3 & 4 &"), and sets the metronome up for it.
 */
import type { MetronomeSettings } from "../audio/schedule";

/** One bar of eighth notes in 4/4: 8 counts. */
export const GUIDE_COUNTS = ["1", "&", "2", "&", "3", "&", "4", "&"] as const;

export interface GuideLane {
  label: string;
  /** One character per count: "x" play, "-" rest. */
  pattern: string;
}

export interface GuideStep {
  id: string;
  title: string;
  /** What to do, in plain words. */
  text: string;
  lanes: readonly GuideLane[];
  /** The metronome settings this step uses. */
  metronome: MetronomeSettings;
}

/** Slow enough to think about each hit: one click per second. */
export const GUIDE_START_BPM = 60;

const QUARTERS: MetronomeSettings = { bpm: GUIDE_START_BPM, beatsPerBar: 4, subdivision: 1, clickSubdivisions: false };
const EIGHTHS: MetronomeSettings = { bpm: GUIDE_START_BPM, beatsPerBar: 4, subdivision: 2, clickSubdivisions: true };

const HIHAT_ON_CLICKS: GuideLane = { label: "Hi-hat", pattern: "x-x-x-x-" };
const HIHAT_EIGHTHS: GuideLane = { label: "Hi-hat", pattern: "xxxxxxxx" };
const SNARE_2_4: GuideLane = { label: "Snare", pattern: "--x---x-" };
const KICK_1_3: GuideLane = { label: "Kick", pattern: "x---x---" };

export const METRONOME_GUIDE: readonly GuideStep[] = [
  {
    id: "hihat-clicks",
    title: "1. Hi-hat on every click",
    text: "Play the hi-hat exactly when you hear each click, counting out loud: \"1, 2, 3, 4\". Try to make each hit land on top of the click, not just before or after it.",
    lanes: [HIHAT_ON_CLICKS],
    metronome: QUARTERS,
  },
  {
    id: "hihat-eighths",
    title: "2. Hi-hat on every click and every \"&\"",
    text: "Now play the hi-hat twice per click: once on the click, and once exactly halfway to the next one. Count \"1 & 2 & 3 & 4 &\". The softer clicks mark the \"&\".",
    lanes: [HIHAT_EIGHTHS],
    metronome: EIGHTHS,
  },
  {
    id: "add-kick",
    title: "3. Add the kick on 1 and 3",
    text: "Keep the hi-hat going, and press the kick pedal together with the hi-hat on counts 1 and 3. Both should sound as one.",
    lanes: [HIHAT_EIGHTHS, KICK_1_3],
    metronome: EIGHTHS,
  },
  {
    id: "add-snare",
    title: "4. Add the snare on 2 and 4",
    text: "Add the snare together with the hi-hat on counts 2 and 4. That's the full money beat. When it feels steady for a minute, raise the tempo by 4 or 5 BPM.",
    lanes: [HIHAT_EIGHTHS, SNARE_2_4, KICK_1_3],
    metronome: EIGHTHS,
  },
];

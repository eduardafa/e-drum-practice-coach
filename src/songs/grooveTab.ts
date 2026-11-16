/**
 * A groove to play along to any song (EDU-89): a 4/4 pattern from the
 * library, repeated as a drum tab across the whole song, so everything a tab
 * has (notation with a playhead, next-pad rings, note-by-note scoring) works,
 * and every bar stretches to the song's own beats, tempo changes included.
 * It's a suggestion that fits the song's pulse, not what its drummer plays.
 */
import { EXERCISES } from "../exercises/library";
import { fromGrid } from "../exercises/grid";
import { TICKS_PER_QUARTER, type Exercise } from "../exercises/types";
import type { DrumTab, TabNote } from "./drumTab";

/**
 * The default for a beginner: hi-hat on every beat, kick on 1 and 3, snare on
 * 2 and 4. It fits most 4/4 pop and rock, and every note lands on a beat.
 */
export const SIMPLE_BEAT: Exercise = fromGrid({
  id: "song-simple-beat",
  name: "Simple beat",
  category: "groove",
  description: "Hi-hat on every beat, kick on 1 and 3, snare on 2 and 4.",
  timeSignature: { beats: 4, unit: 4 },
  bars: 1,
  tempo: { min: 40, suggested: 80, max: 200 },
  stepsPerBar: 4,
  lanes: {
    hihat: "x x x x",
    snare: "- x - x",
    kick: "x - x -",
  },
});

/** The grooves a song can follow: the simple beat, then the 4/4 First steps and Grooves (rudiments are for hands alone). */
export const GROOVE_CHOICES: readonly Exercise[] = [
  SIMPLE_BEAT,
  ...EXERCISES.filter(
    (e) => (e.category === "first-steps" || e.category === "groove") && e.timeSignature.beats === 4 && e.timeSignature.unit === 4,
  ),
];

export function findGroove(id: string): Exercise | undefined {
  return GROOVE_CHOICES.find((e) => e.id === id);
}

/**
 * The groove as a drum tab `beats` beats long (whole repeats, plus a part one
 * at the end), in quarter notes from its start: placed on the song with the
 * tab's shift, its beat 0 lands on the song's first beat 1.
 */
export function grooveTab(groove: Exercise, beats: number): DrumTab {
  const loopBeats = (groove.bars * groove.timeSignature.beats * 4) / groove.timeSignature.unit;
  const notes: TabNote[] = [];
  for (let start = 0; start < beats; start += loopBeats) {
    for (const n of groove.notes) {
      const beat = start + n.tick / TICKS_PER_QUARTER;
      if (beat >= beats) break;
      notes.push({ beat, pad: n.pad, open: n.open === true });
    }
  }
  return { notes, skipped: 0, beatsPerBar: 4, firstNoteSeconds: 0 };
}

const PREFERENCE_KEY = "edrum-coach:song-groove";
/** What a song without its own tab shows: a groove's id, or "none" for just the beat. */
export const NO_GROOVE = "none";

/** The groove chosen last for songs without a tab, in this browser: the simple beat the first time. */
export function loadGroovePreference(): string {
  try {
    const id = localStorage.getItem(PREFERENCE_KEY);
    return id === NO_GROOVE || (id && findGroove(id)) ? id : SIMPLE_BEAT.id;
  } catch {
    return SIMPLE_BEAT.id;
  }
}

export function saveGroovePreference(id: string): void {
  try {
    localStorage.setItem(PREFERENCE_KEY, id);
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

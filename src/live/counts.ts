/**
 * Labels every metronome step with how a drummer counts it: "1 & 2 &" for
 * eighths, "1 e & a" for sixteenths, "1 trip let" for triplets. Counts carry
 * the step's scheduled time, so a live count display can light up the right
 * syllable exactly when the click is heard. The label comes from the step's
 * position in the bar, so it stays right even if settings change mid-bar.
 */
import type { Subdivision } from "../audio/schedule";

/** Syllables after the beat number, per subdivision. */
const SUBDIVISION_SYLLABLES: Readonly<Record<Subdivision, readonly string[]>> = {
  1: [],
  2: ["&"],
  3: ["trip", "let"],
  4: ["e", "&", "a"],
};

/** The syllables of one bar: ["1", "&", "2", "&", ...]. */
export function barCounts(beatsPerBar: number, subdivision: Subdivision): string[] {
  const out: string[] = [];
  for (let beat = 1; beat <= beatsPerBar; beat++) {
    out.push(String(beat), ...SUBDIVISION_SYLLABLES[subdivision]);
  }
  return out;
}

export interface Count {
  /** When the step is heard, in performance.now() ms. */
  time: number;
  /** Position within the bar, from 0. */
  index: number;
  label: string;
  /** Bars since the metronome started, from 0, so multi-bar exercises know which bar is playing. */
  bar: number;
}

/** The count for a step at this position in the bar. */
export function countAt(
  position: { beatInBar: number; subInBeat: number },
  beatsPerBar: number,
  subdivision: Subdivision,
): { index: number; label: string } {
  const labels = barCounts(beatsPerBar, subdivision);
  const index = Math.min(position.beatInBar * subdivision + position.subInBeat, labels.length - 1);
  return { index, label: labels[index] };
}

/** The count being heard at `now`: the latest one at or before it, or null. */
export function currentCount(counts: readonly Count[], now: number): Count | null {
  let current: Count | null = null;
  for (const count of counts) {
    if (count.time > now) break;
    current = count;
  }
  return current;
}

/**
 * Labels every metronome step with how a drummer counts it: "1 & 2 &" for
 * eighths, "1 e & a" for sixteenths, "1 trip let" for triplets. The labels
 * carry the step's scheduled time, so a live count display can light up the
 * right syllable exactly when the click is heard.
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
}

/**
 * Turns the metronome's step stream into counts. A downbeat restarts the bar;
 * every other step moves one position along it.
 */
export class CountTracker {
  private index = -1;

  next(step: { downbeat: boolean; time: number }, beatsPerBar: number, subdivision: Subdivision): Count {
    const labels = barCounts(beatsPerBar, subdivision);
    this.index = step.downbeat ? 0 : (this.index + 1) % labels.length;
    return { time: step.time, index: this.index, label: labels[this.index] };
  }

  reset(): void {
    this.index = -1;
  }
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

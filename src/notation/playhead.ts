/**
 * Where the playhead is, in exercise ticks, from the metronome's counts.
 *
 * Counts carry the time each click is heard (on the same clock the scoring
 * uses), their position in the bar and the bar number. The playhead sits at
 * the latest count heard and moves towards the next one in proportion to the
 * time passed, so it follows the audio rather than counting frames, and
 * can't drift.
 */
import type { Count } from "../live/counts";

export interface PlayheadGrid {
  /** Metronome counts per bar (beats × subdivision). */
  countsPerBar: number;
  /** Metronome counts per beat (the subdivision). */
  countsPerBeat: number;
  /** Exercise ticks per metronome beat. */
  beatTicks: number;
}

/**
 * The exercise tick being heard at `now`, not wrapped (the layout wraps it),
 * or null before the first count. `counts` must be sorted by time.
 */
export function playheadTick(counts: readonly Count[], now: number, grid: PlayheadGrid): number | null {
  let i = -1;
  while (i + 1 < counts.length && counts[i + 1].time <= now) i++;
  if (i < 0) return null;
  const current = counts[i];
  const next = counts[i + 1];
  const fraction = next && next.time > current.time ? Math.min(1, (now - current.time) / (next.time - current.time)) : 0;
  const position = current.bar * grid.countsPerBar + current.index + fraction;
  return (position * grid.beatTicks) / grid.countsPerBeat;
}

/**
 * Choosing a section of a song to repeat (EDU-121), snapped to bars: the loop
 * always starts and ends on a beat 1 of the song's beat grid, so it repeats
 * in time. Pure, so the snapping is tested without audio.
 */
import type { BeatGrid } from "./beats";
import type { SongLoop } from "./player";
import { isDownbeat } from "./songClick";

/** How many bars "Loop from here" covers until the end is chosen. */
export const DEFAULT_LOOP_BARS = 4;
/** A press this soon after a bar line still counts as that bar (reaction time). */
const GRACE_SEC = 0.15;

/** The song time of every beat 1, in order. */
export function barLines(grid: BeatGrid): number[] {
  return grid.beats.filter((_, i) => isDownbeat(grid, i));
}

/** The index (in barLines) of the bar playing at `seconds`, or -1 before the first. */
function barAt(bars: readonly number[], seconds: number): number {
  let i = -1;
  while (i + 1 < bars.length && bars[i + 1] <= seconds) i++;
  return i;
}

/**
 * "Loop from here": from the bar the playhead is in (or the first bar), for
 * DEFAULT_LOOP_BARS bars, or to the song's end if that comes first.
 * Null when the grid has no bars.
 */
export function loopFrom(grid: BeatGrid, position: number, duration: number): SongLoop | null {
  const bars = barLines(grid);
  if (bars.length === 0) return null;
  const i = Math.max(0, barAt(bars, position - GRACE_SEC));
  const start = bars[i];
  const end = bars[i + DEFAULT_LOOP_BARS] ?? duration;
  return end > start ? { start, end } : null;
}

/**
 * "Loop to here": ends the loop at the bar line at or after the playhead,
 * keeping at least one bar (and the song's end if there's no bar line after).
 */
export function loopTo(grid: BeatGrid, loop: SongLoop, position: number, duration: number): SongLoop {
  const bars = barLines(grid);
  const after = bars.find((b) => b >= position - GRACE_SEC && b > loop.start) ?? duration;
  const minEnd = bars.find((b) => b > loop.start) ?? duration;
  return { start: loop.start, end: Math.max(after, minEnd) };
}

/** "bars 9–12" (or "bar 9"), counting the first beat 1 as bar 1. */
export function loopLabel(grid: BeatGrid, loop: SongLoop): string {
  const bars = barLines(grid);
  const first = barAt(bars, loop.start + 0.001) + 1;
  // The last bar that starts before the loop's end.
  const last = barAt(bars, loop.end - 0.001) + 1;
  if (first < 1) return "the start";
  return last > first ? `bars ${first}–${last}` : `bar ${first}`;
}

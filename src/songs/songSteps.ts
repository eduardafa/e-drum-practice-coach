/**
 * A song's beats as scoring steps: every beat, and the counts between beats
 * when the drummer chose a subdivision ("1 & 2 &"), each with its place in
 * the bar. The steps between two beats split that gap evenly, so a song that
 * speeds up or slows down is followed beat by beat. Pure, so it's tested.
 */
import type { Subdivision } from "../audio/schedule";
import { countAt } from "../live/counts";
import type { BeatGrid } from "./beats";

/** Songs are counted in 4/4. */
export const SONG_BEATS_PER_BAR = 4;

export interface SongStep {
  /** Song time, seconds. */
  time: number;
  /** Time to the next step, seconds: the scoring window. */
  intervalSec: number;
  beat: boolean;
  downbeat: boolean;
  /** Position in the bar ("1", "&", …) for the live count. */
  index: number;
  label: string;
  /** Bars from the song's first beat 1 (0 for any beats before it). */
  bar: number;
}

/** The next step to take: beat `beat`, count `sub` within it. */
export interface SongCursor {
  beat: number;
  sub: number;
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The gap after beat `i`: to the next beat, or the one before it for the last beat. */
function gapAfter(beats: readonly number[], i: number): number {
  if (i + 1 < beats.length) return beats[i + 1] - beats[i];
  return i > 0 ? beats[i] - beats[i - 1] : 0.5;
}

function stepAt(grid: BeatGrid, subdivision: Subdivision, cursor: SongCursor): SongStep {
  const gap = gapAfter(grid.beats, cursor.beat) / subdivision;
  const fromOne = cursor.beat - grid.firstDownbeat;
  const beatInBar = mod(fromOne, SONG_BEATS_PER_BAR);
  const { index, label } = countAt({ beatInBar, subInBeat: cursor.sub }, SONG_BEATS_PER_BAR, subdivision);
  return {
    time: grid.beats[cursor.beat] + cursor.sub * gap,
    intervalSec: gap,
    beat: cursor.sub === 0,
    downbeat: cursor.sub === 0 && beatInBar === 0,
    index,
    label,
    bar: Math.max(0, Math.floor(fromOne / SONG_BEATS_PER_BAR)),
  };
}

function advance(cursor: SongCursor, subdivision: Subdivision): void {
  cursor.sub += 1;
  if (cursor.sub >= subdivision) {
    cursor.sub = 0;
    cursor.beat += 1;
  }
}

/** The cursor at the first step at or after song time `seconds`. */
export function cursorAt(grid: BeatGrid, subdivision: Subdivision, seconds: number): SongCursor {
  const cursor: SongCursor = { beat: 0, sub: 0 };
  // The beat whose span holds `seconds`, then the first count in it not before `seconds`.
  while (cursor.beat + 1 < grid.beats.length && grid.beats[cursor.beat + 1] <= seconds) cursor.beat += 1;
  while (cursor.beat < grid.beats.length && stepAt(grid, subdivision, cursor).time < seconds) advance(cursor, subdivision);
  return cursor;
}

/** Takes the steps from `cursor` up to song time `until` (exclusive), moving the cursor past them. */
export function takeSongSteps(grid: BeatGrid, subdivision: Subdivision, cursor: SongCursor, until: number): SongStep[] {
  const steps: SongStep[] = [];
  while (cursor.beat < grid.beats.length) {
    const step = stepAt(grid, subdivision, cursor);
    if (step.time >= until) break;
    steps.push(step);
    advance(cursor, subdivision);
  }
  return steps;
}

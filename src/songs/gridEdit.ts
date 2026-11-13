/**
 * Corrections to a song's beat grid, for when beat finding gets it wrong:
 * twice or half the tempo (the classic octave mistake), which beat is beat 1,
 * a small nudge earlier or later, or a grid built from the drummer's own taps.
 * Each returns a new grid. Pure, so every correction is tested.
 */
import type { BeatGrid } from "./beats";

/** Beats in a bar: grids assume 4/4. */
const BAR = 4;

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The median gap between beats, in seconds (0 for fewer than two beats). */
function medianGap(beats: readonly number[]): number {
  const gaps = beats.slice(1).map((b, i) => b - beats[i]).toSorted((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] ?? 0;
}

/** A grid from beat times, with its tempo measured from them. */
function gridOf(beats: number[], firstDownbeat: number, fallbackBpm: number): BeatGrid {
  const gap = medianGap(beats);
  return { beats, firstDownbeat: mod(firstDownbeat, BAR), bpm: gap > 0 ? 60 / gap : fallbackBpm };
}

/** Twice as fast: a beat added halfway between each pair. Beat 1 stays where it was. */
export function doubleTempo(grid: BeatGrid): BeatGrid {
  const beats = grid.beats.flatMap((b, i) => (i + 1 < grid.beats.length ? [b, (b + grid.beats[i + 1]) / 2] : [b]));
  // The old beat 1 at index d is now at 2d; at the new tempo a bar is half as long, so keep it in 0..3.
  return gridOf(beats, 2 * grid.firstDownbeat, grid.bpm * 2);
}

/** Half as fast: every other beat, keeping the ones in line with beat 1. */
export function halveTempo(grid: BeatGrid): BeatGrid {
  const beats = grid.beats.filter((_, i) => mod(i - grid.firstDownbeat, 2) === 0);
  // The kept beats before the old beat 1 are those at d − 2, d − 4, …: floor(d / 2) of them.
  return gridOf(beats, Math.floor(grid.firstDownbeat / 2), grid.bpm / 2);
}

/** Makes beat `index` a beat 1 (the bar lines move; the beats don't). */
export function setDownbeat(grid: BeatGrid, index: number): BeatGrid {
  return { ...grid, firstDownbeat: mod(index, BAR) };
}

/** The index of the beat closest to `seconds` (−1 for an empty grid). */
export function nearestBeat(grid: BeatGrid, seconds: number): number {
  let best = -1;
  grid.beats.forEach((b, i) => {
    if (best === -1 || Math.abs(b - seconds) < Math.abs(grid.beats[best] - seconds)) best = i;
  });
  return best;
}

/** Every beat moved by `ms` (negative is earlier). Beats pushed before the start are dropped, keeping beat 1 aligned. */
export function nudge(grid: BeatGrid, ms: number): BeatGrid {
  const shifted = grid.beats.map((b) => b + ms / 1000);
  const dropped = shifted.findIndex((b) => b >= 0);
  if (dropped <= 0) return { ...grid, beats: dropped === -1 ? [] : shifted };
  return { ...grid, beats: shifted.slice(dropped), firstDownbeat: mod(grid.firstDownbeat - dropped, BAR) };
}

/** Taps needed before a grid can be built from them. */
export const MIN_TAPS = 8;

/**
 * A grid from the drummer's taps (song times, in seconds), the first tap on a
 * beat 1. The taps are one per beat, so the beat period and the time of the
 * first tap's beat are the straight line through them (least squares: every
 * tap counts, and early and late taps cancel out). The beats then extend over
 * the whole song. Null if there are too few taps or they're too uneven to
 * trust (a gap more than 20% off the median, such as a skipped beat).
 */
export function gridFromTaps(taps: readonly number[], duration: number): BeatGrid | null {
  if (taps.length < MIN_TAPS) return null;
  const sorted = taps.toSorted((a, b) => a - b);
  const median = medianGap(sorted);
  if (median <= 0) return null;
  const gaps = sorted.slice(1).map((t, i) => t - sorted[i]);
  if (gaps.some((g) => Math.abs(g - median) > 0.2 * median)) return null;
  // Fit tap i ≈ first + i × period.
  const n = sorted.length;
  const meanI = (n - 1) / 2;
  const meanT = sorted.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  sorted.forEach((t, i) => {
    num += (i - meanI) * (t - meanT);
    den += (i - meanI) ** 2;
  });
  const period = num / den;
  const first = meanT - period * meanI;
  // Beats before the first tap, back to the start of the song.
  const before = Math.floor(first / period);
  const beats: number[] = [];
  for (let t = first - before * period; t <= duration; t += period) beats.push(t);
  return { beats, firstDownbeat: mod(before, BAR), bpm: 60 / period };
}

/**
 * Where in the song a hit was played, in seconds: the song position now, less
 * how long ago the hit came in, less the measured latency (positive when hits
 * arrive late; see ScoringOptions).
 */
export function tapTime(position: number, nowMs: number, hitMs: number, latencyOffsetMs: number): number {
  return position - (nowMs - hitMs + latencyOffsetMs) / 1000;
}

/** Hits closer together than this are one tap (a flam or a double trigger). */
const SAME_TAP_SEC = 0.2;
/** A longer pause than this starts the taps again: no song has beats that slow. */
const RESTART_AFTER_SEC = 2;

export type TapResult =
  | { status: "added"; taps: number[] }
  /** Too close to the last tap to be a new beat. */
  | { status: "ignored"; taps: number[] }
  /** Far off the beat the taps had set: start again on a beat 1. */
  | { status: "off"; taps: number[] };

/** Adds tap `t` (song seconds) to the taps so far, keeping them steady enough for gridFromTaps. */
export function addTap(taps: readonly number[], t: number): TapResult {
  const last = taps.at(-1);
  if (last === undefined) return { status: "added", taps: [t] };
  const gap = t - last;
  if (gap < 0 || gap > RESTART_AFTER_SEC) return { status: "added", taps: [t] };
  if (gap < SAME_TAP_SEC) return { status: "ignored", taps: [...taps] };
  const median = medianGap(taps);
  if (taps.length >= 3 && Math.abs(gap - median) > 0.2 * median) return { status: "off", taps: [] };
  return { status: "added", taps: [...taps, t] };
}

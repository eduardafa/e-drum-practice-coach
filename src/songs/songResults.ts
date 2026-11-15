/**
 * How a song play-along went (EDU-124): the numbers for the whole run, and
 * where in the song the drummer drifted, bar by bar, so the tricky part
 * stands out and can be looped. Pure: the coach collects the hits, this sums
 * them up.
 */
import type { BeatGrid } from "./beats";
import { barLines } from "./songLoop";
import type { TabScore } from "./tabScoring";

/** A scored hit: where in the song (seconds) and how far off the beat (ms; negative early). */
export interface SongHit {
  at: number;
  deltaMs: number;
  onTime: boolean;
}

/** One bar of the drift timeline. */
export interface BarDrift {
  /** Counting the song's first beat 1 as bar 1. */
  bar: number;
  start: number;
  end: number;
  hits: number;
  /** Average timing in ms (negative early), or null with no hits. */
  meanMs: number | null;
  /** Share of hits on time, 0 to 1, or null with no hits. */
  onTime: number | null;
}

/** Everything the results screen shows about one play-along (also rebuilt from a saved song record). */
export interface SongRun {
  title: string;
  /** Playback speed it was played at. */
  speed: number;
  /** Where in the song the drummer drifted, bar by bar. */
  bars: BarDrift[];
  /** Whole-run numbers, as the side panel showed them. */
  scored: number;
  onTimeHits: number;
  meanMs: number | null;
  spreadMs: number | null;
  /** With a drum tab: its note-by-note score. */
  tab: TabScore | null;
}

/** Fewer scored hits than this, and there's nothing worth a results screen. */
export const MIN_RESULT_HITS = 4;
/** A bar needs this many hits before its colour means anything. */
export const MIN_BAR_HITS = 2;

/**
 * The bars from the first hit's bar to the last hit's, each with its hits'
 * average timing and on-time share. Empty without hits or bars.
 */
export function driftByBar(grid: BeatGrid, hits: readonly SongHit[], duration: number): BarDrift[] {
  const lines = barLines(grid);
  if (hits.length === 0 || lines.length === 0) return [];
  // A hit just before a bar line (early on its beat 1) belongs to that bar: half a beat of grace.
  const grace = grid.bpm > 0 ? 30 / grid.bpm : 0;
  const barOf = (t: number) => {
    let i = 0;
    while (i + 1 < lines.length && lines[i + 1] <= t + grace) i++;
    return i;
  };
  const first = barOf(Math.min(...hits.map((h) => h.at)));
  const last = barOf(Math.max(...hits.map((h) => h.at)));
  const bars: BarDrift[] = [];
  for (let i = first; i <= last; i++) {
    const start = lines[i];
    const end = lines[i + 1] ?? duration;
    const inBar = hits.filter((h) => h.at >= start - grace && h.at < end - grace);
    const n = inBar.length;
    bars.push({
      bar: i + 1,
      start,
      end,
      hits: n,
      meanMs: n === 0 ? null : inBar.reduce((s, h) => s + h.deltaMs, 0) / n,
      onTime: n === 0 ? null : inBar.filter((h) => h.onTime).length / n,
    });
  }
  return bars;
}

/**
 * The bar to practice: of the bars with enough hits, the one with the lowest
 * on-time share (ties: furthest off the beat on average). Null when every bar
 * is fine (all on time) or none has enough hits.
 */
export function hardestBar(bars: readonly BarDrift[]): BarDrift | null {
  let worst: BarDrift | null = null;
  for (const b of bars) {
    if (b.hits < MIN_BAR_HITS || b.onTime === null || b.meanMs === null) continue;
    if (b.onTime >= 1) continue;
    if (
      !worst ||
      b.onTime < (worst.onTime ?? 1) ||
      (b.onTime === worst.onTime && Math.abs(b.meanMs) > Math.abs(worst.meanMs ?? 0))
    ) {
      worst = b;
    }
  }
  return worst;
}

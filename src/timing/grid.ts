/**
 * The timing grid: every point in time a hit "should" land on, expressed in
 * the performance.now() clock (milliseconds), plus the scoring rules.
 *
 * The metronome adds grid points as it schedules clicks, so grid points are
 * already in the same clock as MIDI event timestamps.
 * See docs/decisions/0002-timing-model.md.
 */

export interface GridPoint {
  /** When the click is heard, in performance.now() milliseconds. */
  time: number;
  /** Distance to the next grid point, in ms. Defines the scoring window. */
  intervalMs: number;
  /** True on the first beat of the bar. */
  downbeat: boolean;
  /** True on a quarter-note beat (false on subdivisions). */
  beat: boolean;
}

export type Verdict = "early" | "onTime" | "late";

export interface HitScore {
  /** Hit time minus grid time, in ms. Negative = early, positive = late. */
  deltaMs: number;
  verdict: Verdict;
  point: GridPoint;
}

/** Fixed-capacity, time-ordered store of recent and upcoming grid points. */
export class TimingGrid {
  private points: GridPoint[] = [];

  constructor(private readonly capacity = 256) {}

  /** Points must be added in increasing time order (which the scheduler guarantees). */
  add(point: GridPoint): void {
    const last = this.points[this.points.length - 1];
    if (last && point.time <= last.time) return;
    this.points.push(point);
    if (this.points.length > this.capacity) this.points.shift();
  }

  clear(): void {
    this.points = [];
  }

  get size(): number {
    return this.points.length;
  }

  /** The grid point closest to `time`, or null when the grid is empty. */
  nearest(time: number): GridPoint | null {
    const pts = this.points;
    if (pts.length === 0) return null;
    // Binary search for the first point at or after `time`.
    let lo = 0;
    let hi = pts.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (pts[mid].time < time) lo = mid + 1;
      else hi = mid;
    }
    const after = pts[lo];
    const before = pts[lo - 1];
    if (!after) return before;
    if (!before) return after;
    return time - before.time <= after.time - time ? before : after;
  }
}

export interface ScoringOptions {
  /** |delta| at or below this counts as on time. */
  toleranceMs: number;
  /**
   * Measured system latency to remove from every hit, in ms. Positive values
   * mean hits arrive later than they were played relative to the click.
   */
  latencyOffsetMs: number;
}

export const DEFAULT_SCORING: ScoringOptions = { toleranceMs: 15, latencyOffsetMs: 0 };

/**
 * Scores a hit against the nearest grid point. Returns null when there is no
 * grid point close enough, meaning the metronome isn't running or the hit
 * falls outside every point's window.
 */
export function scoreHit(
  grid: TimingGrid,
  hitTime: number,
  options: ScoringOptions = DEFAULT_SCORING,
): HitScore | null {
  const corrected = hitTime - options.latencyOffsetMs;
  const point = grid.nearest(corrected);
  if (!point) return null;
  const deltaMs = corrected - point.time;
  // A hit can't belong to a point more than half an interval away.
  if (Math.abs(deltaMs) > point.intervalMs / 2) return null;
  return { deltaMs, verdict: classify(deltaMs, options.toleranceMs), point };
}

export function classify(deltaMs: number, toleranceMs: number): Verdict {
  if (Math.abs(deltaMs) <= toleranceMs) return "onTime";
  return deltaMs < 0 ? "early" : "late";
}

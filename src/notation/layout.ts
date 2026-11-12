/**
 * Where things are on an engraved staff, for the playhead. Pure, so the
 * mapping from time to position can be tested without a browser.
 */

/** Where one note of the exercise is drawn: its index in exercise.notes and its notehead's center. */
export interface NoteMark {
  index: number;
  x: number;
  y: number;
}

/** A point on the staff: a tick position and its x coordinate in px. */
export interface StaffPoint {
  tick: number;
  x: number;
}

export interface StaffLayout {
  /** Engraved width and height in px, before the staff is scaled to fit the page. */
  width: number;
  height: number;
  /** The playhead's vertical span in engraved px: from above the cymbals to below the kick. */
  playheadTop: number;
  playheadHeight: number;
  /** One point per written note or rest, plus the end of the last bar; sorted by tick. */
  points: StaffPoint[];
  /** The exercise's length in ticks; the playhead wraps here. */
  lengthTicks: number;
  /** Every note's notehead, for marking hit results on the staff. */
  marks: NoteMark[];
}

/**
 * The playhead's x for a tick. Ticks past the end wrap around, because
 * exercises loop. Between two points the position is interpolated, so the
 * playhead glides through a bar instead of jumping from note to note.
 */
export function xAtTick(layout: StaffLayout, tick: number): number {
  const { points, lengthTicks } = layout;
  if (points.length === 0) return 0;
  const t = ((tick % lengthTicks) + lengthTicks) % lengthTicks;
  let i = 0;
  while (i < points.length - 1 && points[i + 1].tick <= t) i++;
  const a = points[i];
  const b = points[i + 1];
  if (!b || b.tick === a.tick) return a.x;
  return a.x + ((t - a.tick) / (b.tick - a.tick)) * (b.x - a.x);
}

/** Merges points that share a tick (both voices write something there), keeping the leftmost x. */
export function mergePoints(points: readonly StaffPoint[]): StaffPoint[] {
  const byTick = new Map<number, number>();
  for (const p of points) byTick.set(p.tick, Math.min(p.x, byTick.get(p.tick) ?? Infinity));
  return [...byTick].map(([tick, x]) => ({ tick, x })).toSorted((a, b) => a.tick - b.tick);
}

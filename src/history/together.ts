/**
 * Hits written together (EDU-139): when two drums are written on the same
 * beat, like the hi-hat and kick on 1, did they land together, or did one
 * limb come in after the other? Beginners often split them by a few tens of
 * milliseconds. Each hit can still be inside the on-time window, so the score
 * doesn't show it, but it's audible: a "flam" instead of one sound.
 *
 * Works from a saved session record: each note's timing is already relative
 * to where it was written, so the gap between two notes written together is
 * simply the difference of their timings. Which notes are written together
 * comes from the exercise's ticks, passed in by the caller.
 */
import type { PadId } from "../kit/nitroMax";
import { PAD_SAID } from "../kit/padNames";
import type { SessionRecord } from "./record";

/** A gap smaller than this (median, in ms) sounds like one hit. */
export const APART_MS = 20;

/** At least this share of the gaps must lean the same way to call it a habit, not noise. */
export const SAME_WAY_SHARE = 0.75;

/** Fewer pairs than this, and there's too little to tell. */
export const MIN_PAIRS = 4;

export interface ApartResult {
  /** The drum that tends to land first, and the one that comes after it. */
  first: PadId;
  second: PadId;
  /** Median gap between them, in ms, always positive. */
  gapMs: number;
  /** How many times the two were played together in the session. */
  pairs: number;
}

function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The pair of drums that most clearly lands apart when written together, or
 * null: nothing is written together, too few were played, or they land
 * together.
 *
 * `ticks` is each note's position in the exercise, by index, like
 * `record.voices`.
 */
export function apartHits(record: Pick<SessionRecord, "voices" | "notes">, ticks: readonly number[]): ApartResult | null {
  if (ticks.length !== record.voices.length) return null;

  // Each loop's timing per note, for notes that were hit.
  const timing = new Map<string, number>();
  for (const [index, loop, deltaMs] of record.notes) {
    if (deltaMs !== null) timing.set(`${loop}:${index}`, deltaMs);
  }
  const loops = new Set(record.notes.map(([, loop]) => loop));

  // Notes written at the same tick, on different drums.
  const byTick = new Map<number, number[]>();
  ticks.forEach((tick, index) => byTick.set(tick, [...(byTick.get(tick) ?? []), index]));

  // Gaps per pair of drums, as "b minus a", with a and b in a fixed order.
  const gaps = new Map<string, { a: PadId; b: PadId; values: number[] }>();
  for (const indexes of byTick.values()) {
    for (let i = 0; i < indexes.length; i++) {
      for (let j = i + 1; j < indexes.length; j++) {
        let [x, y] = [indexes[i], indexes[j]];
        if (record.voices[x].pad === record.voices[y].pad) continue;
        if (record.voices[x].pad > record.voices[y].pad) [x, y] = [y, x];
        const key = `${record.voices[x].pad}+${record.voices[y].pad}`;
        const entry = gaps.get(key) ?? { a: record.voices[x].pad, b: record.voices[y].pad, values: [] };
        for (const loop of loops) {
          const tx = timing.get(`${loop}:${x}`);
          const ty = timing.get(`${loop}:${y}`);
          if (tx !== undefined && ty !== undefined) entry.values.push(ty - tx);
        }
        gaps.set(key, entry);
      }
    }
  }

  let worst: ApartResult | null = null;
  for (const { a, b, values } of gaps.values()) {
    if (values.length < MIN_PAIRS) continue;
    const mid = median(values);
    if (Math.abs(mid) < APART_MS) continue;
    const sameWay = values.filter((v) => Math.sign(v) === Math.sign(mid)).length / values.length;
    if (sameWay < SAME_WAY_SHARE) continue;
    const result: ApartResult = mid > 0
      ? { first: a, second: b, gapMs: mid, pairs: values.length }
      : { first: b, second: a, gapMs: -mid, pairs: values.length };
    if (!worst || result.gapMs > worst.gapMs) worst = result;
  }
  return worst;
}

const FEET: ReadonlySet<PadId> = new Set(["kick", "hihatPedal"]);

/** One plain tip: what lands late, by about how much, and what to think about. */
export function apartTip(result: ApartResult): string {
  const gap = Math.max(5, Math.round(result.gapMs / 5) * 5);
  const said = `When they're played together, your ${PAD_SAID[result.second]} lands about ${gap} ms after the ${PAD_SAID[result.first]}.`;
  const firstFoot = FEET.has(result.first);
  if (firstFoot !== FEET.has(result.second)) {
    return `${said} Think of hand and foot as one motion: they come down at the same time.`;
  }
  if (firstFoot) return `${said} Press both feet down at the same moment.`;
  return `${said} Bring both sticks down from the same height, at the same time.`;
}

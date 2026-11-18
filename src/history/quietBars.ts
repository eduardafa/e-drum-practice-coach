/**
 * How time held in the quiet bars (EDU-145): with the click dropping out for
 * a bar, did the drummer speed up, slow down, or keep time? Compares the
 * typical timing (median, so one stray hit doesn't swing it) of the notes in
 * quiet bars with the notes in bars that had the click. Comparing against the
 * drummer's own clicked bars, not against zero, means a drummer who always
 * plays a little late isn't told they slowed down.
 *
 * Works from a saved session record and its exercise, so it says the same
 * thing on the results screen and in a session opened from History.
 */
import { FIRST_STEPS, FIRST_STEPS_2 } from "../exercises/library";
import { PATHS } from "../exercises/path";
import { ticksPerBar, type Exercise } from "../exercises/types";
import { isQuietBar } from "../playalong/quietBars";
import type { SessionRecord } from "./record";

/** A shift smaller than this (median, in ms) between quiet and clicked bars counts as keeping time. */
export const DRIFT_MS = 20;

/** Fewer hits than this in the quiet bars (or in the clicked ones), and there's too little to tell. */
export const MIN_HITS = 4;

/** If fewer than this share of the quiet bars' notes were played, the drummer stopped rather than drifted. */
export const PLAYED_SHARE = 0.5;

/** A change this big (ms) from the first half of the quiet bar to the second counts as the drift growing. */
export const GROWING_MS = 10;

export type QuietBarsResult =
  /** Most notes in the quiet bars weren't played. */
  | { kind: "stopped"; missed: number; notes: number }
  /** Timing in the quiet bars was close to timing with the click. */
  | { kind: "steady"; quietMs: number; clickMs: number }
  /** Faster (earlier) or slower (later) without the click; `growing` when it built up through the bar. */
  | { kind: "rushed" | "dragged"; quietMs: number; clickMs: number; growing: boolean };

function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * How the quiet bars went, or null: the click never dropped out, or too few
 * notes were played to tell.
 */
export function quietBarsResult(
  record: Pick<SessionRecord, "notes" | "quietEvery">,
  exercise: Pick<Exercise, "bars" | "timeSignature" | "notes">,
): QuietBarsResult | null {
  const every = record.quietEvery ?? 0;
  if (every < 2) return null;
  const barTicks = ticksPerBar(exercise.timeSignature);

  const quiet: { deltaMs: number; secondHalf: boolean }[] = [];
  const clicked: number[] = [];
  let quietNotes = 0;
  for (const [index, loop, deltaMs] of record.notes) {
    const tick = exercise.notes[index]?.tick;
    if (tick === undefined) continue;
    const bar = loop * exercise.bars + Math.floor(tick / barTicks);
    if (isQuietBar(bar, every)) {
      quietNotes++;
      if (deltaMs !== null) quiet.push({ deltaMs, secondHalf: tick % barTicks >= barTicks / 2 });
    } else if (deltaMs !== null) {
      clicked.push(deltaMs);
    }
  }

  if (quietNotes >= MIN_HITS && quiet.length / quietNotes < PLAYED_SHARE) {
    return { kind: "stopped", missed: quietNotes - quiet.length, notes: quietNotes };
  }
  if (quiet.length < MIN_HITS || clicked.length < MIN_HITS) return null;

  const quietMs = median(quiet.map((q) => q.deltaMs));
  const clickMs = median(clicked);
  const shift = quietMs - clickMs;
  if (Math.abs(shift) < DRIFT_MS) return { kind: "steady", quietMs, clickMs };

  // Did it build up through the bar? Compare the bar's second half with its first.
  const first = quiet.filter((q) => !q.secondHalf).map((q) => q.deltaMs);
  const second = quiet.filter((q) => q.secondHalf).map((q) => q.deltaMs);
  const trend = first.length && second.length ? median(second) - median(first) : 0;
  const growing = Math.abs(trend) >= GROWING_MS && Math.sign(trend) === Math.sign(shift);
  return { kind: shift < 0 ? "rushed" : "dragged", quietMs, clickMs, growing };
}

/** "25 ms early", "10 ms late", or "right on time" for timing close to zero. */
function timing(ms: number, roundTo: number): string {
  const amount = Math.round(Math.abs(ms) / roundTo) * roundTo;
  if (amount === 0) return "right on time";
  return `${amount} ms ${ms < 0 ? "early" : "late"}`;
}

/** The results' sentence about the quiet bars, in plain words, with one thing to try when it drifted. */
export function quietBarsText(result: QuietBarsResult): string {
  switch (result.kind) {
    case "stopped":
      return `${result.missed} of the ${result.notes} notes in the quiet bars weren't played. Keep playing when the click goes quiet: count out loud, and it comes back on the next bar.`;
    case "steady":
      return "You kept time without the click: about the same timing as with it.";
    case "rushed":
    case "dragged": {
      const sped = result.kind === "rushed";
      const said = `In the quiet bars you ${sped ? "sped up" : "slowed down"}: your hits came about ${timing(result.quietMs, 5)} on average, compared with ${timing(result.clickMs, 1)} with the click.`;
      const growing = result.growing ? " It grew as the bar went on." : "";
      const tip = sped
        ? " Count out loud through the quiet bar and don't hurry: the click comes back on the next 1."
        : " Count out loud through the quiet bar and keep the hits moving: the click comes back on the next 1.";
      return said + growing + tip;
    }
  }
}

/** Steps where keeping time without the click is the natural next skill: late in part 1, and all of part 2. */
const SUGGEST_AFTER: ReadonlySet<string> = new Set([
  ...FIRST_STEPS.slice(-2).map((e) => e.id),
  PATHS[0].goalId,
  ...FIRST_STEPS_2.map((e) => e.id),
  PATHS[1].goalId,
]);

/**
 * Whether the results should suggest trying quiet bars: a good run (at the
 * pass mark) of a step late in First steps, played with the click on every bar.
 */
export function suggestQuietBars(
  record: Pick<SessionRecord, "exerciseId" | "quietEvery">,
  accuracy: number | null,
  passMark: number,
): boolean {
  return (
    !record.quietEvery &&
    accuracy !== null &&
    accuracy >= passMark &&
    SUGGEST_AFTER.has(record.exerciseId)
  );
}

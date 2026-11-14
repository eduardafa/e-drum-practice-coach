/**
 * Scores a play-along session: accuracy, counts, timing and a per-pad
 * breakdown, from the matcher's per-note results.
 *
 * Two accuracy modes, both always computed so the results screen can show
 * either:
 * - strict: on-time notes ÷ (notes + extra hits).
 * - partial: each note earns credit by how close it was. Full credit inside
 *   the on-time window, falling in a straight line to nothing at three times
 *   the window, so "slightly late" still counts for something. Divided by
 *   (notes + extra hits) too.
 * Extra hits are in both denominators, so hitting every pad can't score well.
 *
 * Plain data in, plain data out: serializable for practice history later.
 */
import type { PadId } from "../kit/nitroMax";
import type { ExtraReasons, HihatMixups, NoteResult } from "./matcher";
import type { ExpectedNote } from "./timeline";

export type AccuracyMode = "partial" | "strict";

export const ACCURACY_MODES: readonly AccuracyMode[] = ["partial", "strict"];

export function isAccuracyMode(value: unknown): value is AccuracyMode {
  return value === "partial" || value === "strict";
}

/** Partial credit reaches zero at this many times the on-time window. */
export const ZERO_CREDIT_FACTOR = 3;

/** Credit for one hit, from 0 to 1, by how far it was from the note. */
export function partialCredit(deltaMs: number, toleranceMs: number): number {
  const off = Math.abs(deltaMs);
  if (off <= toleranceMs) return 1;
  const zero = toleranceMs * ZERO_CREDIT_FACTOR;
  if (off >= zero) return 0;
  return 1 - (off - toleranceMs) / (zero - toleranceMs);
}

export interface Counts {
  /** Notes resolved so far (hit or missed). */
  notes: number;
  onTime: number;
  early: number;
  late: number;
  missed: number;
}

export interface PadResults extends Counts {
  pad: PadId;
  /** Average timing of this pad's hits: negative is early. Null with no hits. */
  meanDeltaMs: number | null;
}

export interface SessionResults extends Counts {
  extra: number;
  /** 0 to 1 per mode; null until something has been resolved or played. */
  accuracy: Record<AccuracyMode, number | null>;
  /** Average timing over all hits: negative is early. */
  meanDeltaMs: number | null;
  /** Standard deviation of the hits' timing: the consistency. */
  spreadMs: number | null;
  /** Pads in the order they first appear in the exercise. */
  pads: PadResults[];
  /** How many of the extra hits were hi-hat open/closed mix-ups. */
  hihat: HihatMixups;
  /** Why the rest of the extra hits were extra. */
  extraReasons: ExtraReasons;
}

function emptyCounts(): Counts {
  return { notes: 0, onTime: 0, early: 0, late: 0, missed: 0 };
}

/**
 * Results over the notes resolved so far, so the same function gives the
 * live accuracy during a session and the final results after it.
 */
export function summarize(
  notes: readonly ExpectedNote[],
  resultOf: (note: ExpectedNote) => NoteResult,
  extra: number,
  toleranceMs: number,
  hihat: HihatMixups = { openInsteadOfClosed: 0, closedInsteadOfOpen: 0 },
  extraReasons: ExtraReasons = { wrongDrum: 0, twice: 0, farFromNotes: 0 },
): SessionResults {
  const total = emptyCounts();
  const pads = new Map<PadId, PadResults & { sumDelta: number; hits: number }>();
  const deltas: number[] = [];
  let credit = 0;

  for (const note of notes) {
    let pad = pads.get(note.pad);
    if (!pad) {
      pad = { pad: note.pad, ...emptyCounts(), meanDeltaMs: null, sumDelta: 0, hits: 0 };
      pads.set(note.pad, pad);
    }
    const result = resultOf(note);
    if (result.status === "pending") continue;
    total.notes++;
    pad.notes++;
    if (result.status === "missed") {
      total.missed++;
      pad.missed++;
      continue;
    }
    total[result.verdict]++;
    pad[result.verdict]++;
    credit += partialCredit(result.deltaMs, toleranceMs);
    deltas.push(result.deltaMs);
    pad.sumDelta += result.deltaMs;
    pad.hits++;
  }

  const denominator = total.notes + extra;
  const mean = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;
  const spread =
    mean === null || deltas.length < 2
      ? null
      : Math.sqrt(deltas.reduce((sum, d) => sum + (d - mean) ** 2, 0) / (deltas.length - 1));

  return {
    ...total,
    extra,
    accuracy: {
      partial: denominator ? credit / denominator : null,
      strict: denominator ? total.onTime / denominator : null,
    },
    meanDeltaMs: mean,
    spreadMs: spread,
    pads: [...pads.values()].map((p) => ({
      pad: p.pad,
      notes: p.notes,
      onTime: p.onTime,
      early: p.early,
      late: p.late,
      missed: p.missed,
      meanDeltaMs: p.hits ? p.sumDelta / p.hits : null,
    })),
    hihat,
    extraReasons,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Why the extra hits were extra, in plain words, biggest reason first: what
 * the results screen shows next to the count, so a beginner can tell a wrong
 * drum from a doubled stroke or a hit far from any note.
 */
export function extraBreakdown(results: Pick<SessionResults, "extraReasons" | "hihat">): string[] {
  const { wrongDrum, twice, farFromNotes } = results.extraReasons;
  const hihat = results.hihat.openInsteadOfClosed + results.hihat.closedInsteadOfOpen;
  const parts: [number, string][] = [
    [wrongDrum, wrongDrum === 1 ? "1 on a drum that isn't written there" : `${wrongDrum} on drums that aren't written there`],
    [hihat, plural(hihat, "hi-hat open/closed mix-up", "hi-hat open/closed mix-ups")],
    [twice, `${plural(twice, "note", "notes")} hit twice`],
    [farFromNotes, `${farFromNotes} too far from any note (much too early or late)`],
  ];
  return parts
    .filter(([n]) => n > 0)
    .toSorted((a, b) => b[0] - a[0])
    .map(([, text]) => text);
}

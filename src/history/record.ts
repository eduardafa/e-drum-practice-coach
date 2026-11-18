/**
 * Practice history records: one per finished play-along session, one per
 * tempo-trainer run, and one per song play-along (EDU-125). Plain, versioned JSON, so they can be stored in
 * IndexedDB now and uploaded unchanged to a backend later.
 *
 * Dates are Temporal strings: the start as an Instant (an exact moment) and
 * the length as a Duration. The time zone the session was played in is kept
 * too, so a session counts for the calendar day it was played on, even after
 * traveling. Hit timing never touches Temporal: it stays on performance.now().
 *
 * Each record carries what later stats need without looking anything up:
 * the exercise's voices (pad, dynamic, hand per note), every note's result
 * with its velocity, and the extra hits. A 16-loop session is a few hundred
 * small tuples.
 */
import type { Dynamic, Exercise, Hand } from "../exercises/types";
import type { PadId } from "../kit/nitroMax";
import type { NoteResult, PlayedHit } from "../playalong/matcher";
import type { AccuracyMode, SessionResults } from "../playalong/results";
import type { ExpectedNote } from "../playalong/timeline";
import type { BarDrift } from "../songs/songResults";
import type { TabScore } from "../songs/tabScoring";
import type { RoundRecord, TrainerConfig } from "../playalong/trainer";

export const RECORD_VERSION = 1;

/** One note's outcome: [note index in the exercise, loop, timing in ms (null if missed), velocity (null if unknown)]. */
export type NoteTuple = [index: number, loop: number, deltaMs: number | null, velocity: number | null];

/** A hit that matched no note: [pad (null if unmapped), velocity]. */
export type ExtraTuple = [pad: PadId | null, velocity: number | null];

interface RecordBase {
  v: typeof RECORD_VERSION;
  id: string;
  /** Temporal.Instant string: when the session (its count-in) started. */
  start: string;
  /** Temporal.Duration string: how long it lasted. */
  duration: string;
  /** IANA time zone it was played in, e.g. "Europe/Lisbon". */
  timeZone: string;
  exerciseId: string;
  /** As named when played, in case the library renames it later. */
  exerciseName: string;
}

export interface SessionRecord extends RecordBase {
  kind: "session";
  bpm: number;
  loops: number;
  toleranceMs: number;
  latencyOffsetMs: number;
  accuracy: Record<AccuracyMode, number | null>;
  counts: { notes: number; onTime: number; early: number; late: number; missed: number; extra: number };
  meanDeltaMs: number | null;
  spreadMs: number | null;
  /** Per note of the exercise, by index. */
  voices: { pad: PadId; dynamic: Dynamic; hand: Hand | null }[];
  notes: NoteTuple[];
  extras: ExtraTuple[];
  /** Set when the session was a tempo-trainer round: the id of its TrainerRecord. */
  trainerRunId: string | null;
  /**
   * Set when the click went quiet for one bar in this many (EDU-145), so the
   * results can compare quiet and clicked bars. Absent: a click on every bar
   * (and every record saved before the option existed).
   */
  quietEvery?: number;
}

export interface TrainerRecord extends RecordBase {
  kind: "trainer";
  config: TrainerConfig;
  rounds: RoundRecord[];
  reason: "target" | "stopped";
}

/** A bar of a song's drift timeline: [bar, start s, end s, hits, average ms (null: no hits), on-time share (null: no hits)]. */
export type BarTuple = [bar: number, start: number, end: number, hits: number, meanMs: number | null, onTime: number | null];

/**
 * A song play-along (EDU-125). The song is named by its title and fingerprint
 * (`exerciseId` is "song:" + fingerprint, `exerciseName` its title); its audio
 * is never kept. The drift is kept per bar, which is all the results screen
 * needs, on any device, without the song's beats.
 */
export interface SongRecord extends RecordBase {
  kind: "song";
  fingerprint: string;
  /** Playback speed: 1, or 0.85, 0.7, 0.5 from a slowed copy. */
  speed: number;
  /** The loop played, [start, end] in song seconds, or null for the song as it came. */
  section: [start: number, end: number] | null;
  toleranceMs: number;
  latencyOffsetMs: number;
  /** Scored hits, and how many were on the beat. */
  scored: number;
  onTime: number;
  meanDeltaMs: number | null;
  spreadMs: number | null;
  /** With a drum tab open: its note-by-note score. */
  tab: TabScore | null;
  bars: BarTuple[];
  /** Set for a "speed up as I get it" pass: shared by the passes of one run. */
  loopRunId: string | null;
}

export type HistoryRecord = SessionRecord | TrainerRecord | SongRecord;

/** Whether a record counts as practice for streaks and practice time: a session or a song play-along. */
export const isPractice = (r: HistoryRecord): r is SessionRecord | SongRecord => r.kind === "session" || r.kind === "song";

/** When and where a record happened, measured by the caller. */
export interface RecordMeta {
  id: string;
  start: Temporal.Instant;
  /** From performance.now(), which never jumps, unlike the wall clock. */
  durationMs: number;
  timeZone: string;
}

const round1 = (ms: number) => Math.round(ms * 10) / 10;

function base(meta: RecordMeta, exercise: Exercise): RecordBase {
  return {
    v: RECORD_VERSION,
    id: meta.id,
    start: meta.start.toString(),
    duration: Temporal.Duration.from({ milliseconds: Math.max(0, Math.round(meta.durationMs)) })
      .round({ largestUnit: "hours", smallestUnit: "milliseconds" })
      .toString(),
    timeZone: meta.timeZone,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
  };
}

export interface SessionInput {
  exercise: Exercise;
  bpm: number;
  loops: number;
  scoring: { toleranceMs: number; latencyOffsetMs: number };
  results: SessionResults;
  outcomes: { notes: readonly { note: ExpectedNote; result: NoteResult }[]; extraHits: readonly PlayedHit[] };
  trainerRunId: string | null;
  /** One bar in this many had no click; 0 for none. */
  quietEvery?: number;
}

export function sessionRecord(meta: RecordMeta, input: SessionInput): SessionRecord {
  const { exercise, results } = input;
  const notes: NoteTuple[] = [];
  for (const { note, result } of input.outcomes.notes) {
    if (result.status === "pending") continue;
    notes.push(
      result.status === "missed"
        ? [note.index, note.loop, null, null]
        : [note.index, note.loop, round1(result.deltaMs), result.velocity ?? null],
    );
  }
  return {
    ...base(meta, exercise),
    kind: "session",
    bpm: input.bpm,
    loops: input.loops,
    toleranceMs: input.scoring.toleranceMs,
    latencyOffsetMs: input.scoring.latencyOffsetMs,
    accuracy: { ...results.accuracy },
    counts: {
      notes: results.notes,
      onTime: results.onTime,
      early: results.early,
      late: results.late,
      missed: results.missed,
      extra: results.extra,
    },
    meanDeltaMs: results.meanDeltaMs === null ? null : round1(results.meanDeltaMs),
    spreadMs: results.spreadMs === null ? null : round1(results.spreadMs),
    voices: exercise.notes.map((n) => ({ pad: n.pad, dynamic: n.dynamic, hand: n.hand ?? null })),
    notes,
    extras: input.outcomes.extraHits.map((h) => [h.pad, h.velocity ?? null]),
    trainerRunId: input.trainerRunId,
    ...(input.quietEvery ? { quietEvery: input.quietEvery } : {}),
  };
}

export function trainerRecord(
  meta: RecordMeta,
  exercise: Exercise,
  config: TrainerConfig,
  rounds: readonly RoundRecord[],
  reason: "target" | "stopped",
): TrainerRecord {
  return { ...base(meta, exercise), kind: "trainer", config: { ...config }, rounds: rounds.map((r) => ({ ...r })), reason };
}

// ---- Reading records back -------------------------------------------------

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNumOrNull = (v: unknown) => v === null || isNum(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** Whether `value` is a string that `parse` accepts (Temporal parsers throw on bad input). */
function parsesAs(value: unknown, parse: (s: string) => unknown): boolean {
  if (!isStr(value)) return false;
  try {
    parse(value);
    return true;
  } catch {
    return false;
  }
}

function validBase(r: Rec): boolean {
  return (
    r.v === RECORD_VERSION &&
    isStr(r.id) &&
    parsesAs(r.start, (s) => Temporal.Instant.from(s)) &&
    parsesAs(r.duration, (s) => Temporal.Duration.from(s)) &&
    parsesAs(r.timeZone, (s) => Temporal.Now.zonedDateTimeISO(s)) &&
    isStr(r.exerciseId) &&
    typeof r.exerciseName === "string"
  );
}

function validSession(r: Rec): boolean {
  const { accuracy, counts } = r;
  return (
    isNum(r.bpm) &&
    isNum(r.loops) &&
    isNum(r.toleranceMs) &&
    isNum(r.latencyOffsetMs) &&
    isRec(accuracy) &&
    isNumOrNull(accuracy.partial) &&
    isNumOrNull(accuracy.strict) &&
    isRec(counts) &&
    ["notes", "onTime", "early", "late", "missed", "extra"].every((k) => isNum(counts[k])) &&
    isNumOrNull(r.meanDeltaMs) &&
    isNumOrNull(r.spreadMs) &&
    Array.isArray(r.voices) &&
    r.voices.every((v) => isRec(v) && isStr(v.pad)) &&
    Array.isArray(r.notes) &&
    r.notes.every((n) => Array.isArray(n) && n.length === 4 && isNum(n[0]) && isNum(n[1]) && isNumOrNull(n[2]) && isNumOrNull(n[3])) &&
    Array.isArray(r.extras) &&
    r.extras.every((e) => Array.isArray(e) && e.length === 2 && isNumOrNull(e[1])) &&
    (r.trainerRunId === null || isStr(r.trainerRunId)) &&
    (r.quietEvery === undefined || (isNum(r.quietEvery) && r.quietEvery >= 2))
  );
}

function validTrainer(r: Rec): boolean {
  const { config } = r;
  return (
    isRec(config) &&
    ["startBpm", "targetBpm", "passMark", "failMark", "step"].every((k) => isNum(config[k])) &&
    Array.isArray(r.rounds) &&
    r.rounds.every((x) => isRec(x) && isNum(x.bpm) && isNum(x.accuracy) && typeof x.outcome === "string") &&
    (r.reason === "target" || r.reason === "stopped")
  );
}

const TAB_KEYS = ["played", "hit", "onTime", "early", "late", "missed", "wrongDrum", "extra"] as const;

function validSong(r: Rec): boolean {
  const { section, tab } = r;
  return (
    isStr(r.fingerprint) &&
    isNum(r.speed) &&
    r.speed > 0 &&
    r.speed <= 1 &&
    (section === null || (Array.isArray(section) && section.length === 2 && isNum(section[0]) && isNum(section[1]))) &&
    isNum(r.toleranceMs) &&
    isNum(r.latencyOffsetMs) &&
    isNum(r.scored) &&
    isNum(r.onTime) &&
    isNumOrNull(r.meanDeltaMs) &&
    isNumOrNull(r.spreadMs) &&
    (tab === null || (isRec(tab) && TAB_KEYS.every((k) => isNum(tab[k])))) &&
    Array.isArray(r.bars) &&
    r.bars.every(
      (b) =>
        Array.isArray(b) &&
        b.length === 6 &&
        isNum(b[0]) &&
        isNum(b[1]) &&
        isNum(b[2]) &&
        isNum(b[3]) &&
        isNumOrNull(b[4]) &&
        isNumOrNull(b[5]),
    ) &&
    (r.loopRunId === null || isStr(r.loopRunId))
  );
}

/** The input for a song record: what the results screen showed, and about which song. */
export interface SongInput {
  title: string;
  fingerprint: string;
  speed: number;
  section: { start: number; end: number } | null;
  scoring: { toleranceMs: number; latencyOffsetMs: number };
  scored: number;
  onTime: number;
  meanMs: number | null;
  spreadMs: number | null;
  tab: TabScore | null;
  bars: readonly BarDrift[];
  loopRunId: string | null;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

export function songRecord(meta: RecordMeta, input: SongInput): SongRecord {
  return {
    v: RECORD_VERSION,
    id: meta.id,
    start: meta.start.toString(),
    duration: Temporal.Duration.from({ milliseconds: Math.max(0, Math.round(meta.durationMs)) })
      .round({ largestUnit: "hours", smallestUnit: "milliseconds" })
      .toString(),
    timeZone: meta.timeZone,
    exerciseId: `song:${input.fingerprint}`,
    exerciseName: input.title,
    kind: "song",
    fingerprint: input.fingerprint,
    speed: input.speed,
    section: input.section ? [round3(input.section.start), round3(input.section.end)] : null,
    toleranceMs: input.scoring.toleranceMs,
    latencyOffsetMs: input.scoring.latencyOffsetMs,
    scored: input.scored,
    onTime: input.onTime,
    meanDeltaMs: input.meanMs === null ? null : round1(input.meanMs),
    spreadMs: input.spreadMs === null ? null : round1(input.spreadMs),
    tab: input.tab,
    bars: input.bars.map((b) => [
      b.bar,
      round3(b.start),
      round3(b.end),
      b.hits,
      b.meanMs === null ? null : round1(b.meanMs),
      b.onTime === null ? null : round3(b.onTime),
    ]),
    loopRunId: input.loopRunId,
  };
}

/** A song record's bars, back in the results screen's shape. */
export function songBars(record: SongRecord): BarDrift[] {
  return record.bars.map(([bar, start, end, hits, meanMs, onTime]) => ({ bar, start, end, hits, meanMs, onTime }));
}

/**
 * Checks a stored record. Anything malformed, or from a newer version this
 * build doesn't understand, is skipped rather than breaking the history.
 */
export function parseRecord(raw: unknown): HistoryRecord | null {
  if (!isRec(raw) || !validBase(raw)) return null;
  // The checks above and below establish the shape field by field.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  if (raw.kind === "session" && validSession(raw)) return raw as unknown as SessionRecord;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  if (raw.kind === "trainer" && validTrainer(raw)) return raw as unknown as TrainerRecord;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  if (raw.kind === "song" && validSong(raw)) return raw as unknown as SongRecord;
  return null;
}

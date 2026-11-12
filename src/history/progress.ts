/**
 * How an exercise is improving: accuracy and tempo per calendar day, or per
 * week over longer spans, from the practice history.
 *
 * Like streaks, periods are calendar dates where each session was played
 * (see practiceDate), never 24- or 168-hour blocks, so a week with a
 * daylight-saving change is still seven dates. Only periods with practice
 * get a point: a day off isn't 0% accuracy.
 */
import type { AccuracyMode } from "../playalong/results";
import type { HistoryRecord, SessionRecord } from "./record";
import { practiceDate } from "./streak";

export type ProgressRange = "7d" | "30d" | "all";
export type Grouping = "day" | "week";

export const PROGRESS_RANGES: readonly { id: ProgressRange; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All time" },
];

/** The first date in a range ending `today` (both included), or null for all time. */
export function rangeStart(range: ProgressRange, today: Temporal.PlainDate): Temporal.PlainDate | null {
  if (range === "7d") return today.subtract({ days: 6 });
  if (range === "30d") return today.subtract({ days: 29 });
  return null;
}

/** All time switches to weeks once the practice spans more dates than this. */
const DAILY_LIMIT_DAYS = 31;

export interface ProgressPoint {
  /** First date of the period (the day itself, or the first day of the week). */
  start: Temporal.PlainDate;
  /** Last date of the period. */
  end: Temporal.PlainDate;
  /** Accuracy over every note played in the period, 0..1. */
  accuracy: number | null;
  /** The fastest tempo played in the period. */
  bpm: number;
  sessions: number;
}

export interface Progress {
  grouping: Grouping;
  /** Oldest first. */
  points: ProgressPoint[];
}

const isSession = (r: HistoryRecord): r is SessionRecord => r.kind === "session";

/** The exercises with saved sessions, most recently played first. */
export function practicedExercises(records: readonly HistoryRecord[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  // Records come newest first, so the first name seen is the latest one.
  for (const r of records) if (isSession(r) && !seen.has(r.exerciseId)) seen.set(r.exerciseId, r.exerciseName);
  return [...seen].map(([id, name]) => ({ id, name }));
}

/**
 * The first day of the week containing `date`. `firstDay` is 1 (Monday)
 * to 7 (Sunday), as in Intl.Locale's week info.
 */
export function weekStart(date: Temporal.PlainDate, firstDay = 1): Temporal.PlainDate {
  return date.subtract({ days: (date.dayOfWeek - firstDay + 7) % 7 });
}

/**
 * Accuracy and tempo for one exercise over a range ending `today`. Trainer
 * rounds count: they are sessions played like any other.
 */
export function progress(
  records: readonly HistoryRecord[],
  exerciseId: string,
  range: ProgressRange,
  today: Temporal.PlainDate,
  mode: AccuracyMode,
  firstDay = 1,
): Progress {
  const from = rangeStart(range, today);
  const sessions = records
    .filter(isSession)
    .filter((r) => r.exerciseId === exerciseId)
    .map((r) => ({ record: r, date: practiceDate(r) }))
    .filter(({ date }) => from === null || Temporal.PlainDate.compare(date, from) >= 0);

  const oldest = sessions.reduce<Temporal.PlainDate | null>(
    (min, { date }) => (min === null || Temporal.PlainDate.compare(date, min) < 0 ? date : min),
    null,
  );
  const grouping: Grouping =
    range === "all" && oldest !== null && oldest.until(today).days >= DAILY_LIMIT_DAYS ? "week" : "day";

  const periods = new Map<string, { start: Temporal.PlainDate; records: SessionRecord[] }>();
  for (const { record, date } of sessions) {
    const start = grouping === "week" ? weekStart(date, firstDay) : date;
    const key = start.toString();
    const period = periods.get(key) ?? { start, records: [] };
    period.records.push(record);
    periods.set(key, period);
  }

  const points = [...periods.values()]
    .toSorted((a, b) => Temporal.PlainDate.compare(a.start, b.start))
    .map(({ start, records: rs }): ProgressPoint => {
      // Weighted by notes, so a 16-loop session counts more than a 2-loop one.
      let weighted = 0;
      let notes = 0;
      for (const r of rs) {
        const a = r.accuracy[mode];
        if (a === null) continue;
        weighted += a * r.counts.notes;
        notes += r.counts.notes;
      }
      return {
        start,
        end: grouping === "week" ? start.add({ days: 6 }) : start,
        accuracy: notes > 0 ? weighted / notes : null,
        bpm: Math.max(...rs.map((r) => r.bpm)),
        sessions: rs.length,
      };
    });
  return { grouping, points };
}

// Floored like every score in the app (99.9% is not 100%), with a little
// slack so an average like 0.7999999999999999 still reads 80%.
export const formatPercent = (value: number) => `${Math.floor(value * 100 + 1e-9)}%`;

const accuracyText = (p: ProgressPoint) => (p.accuracy === null ? "no score" : formatPercent(p.accuracy));

/** "over 5 days", "over 3 weeks". */
function spanLabel(first: Temporal.PlainDate, last: Temporal.PlainDate): string {
  const days = first.until(last).days + 1;
  if (days < 14) return `over ${days} days`;
  return `over ${Math.round(days / 7)} weeks`;
}

/**
 * One sentence for screen readers and the chart caption, e.g.
 * "Money beat: 72% → 88% over 2 weeks, 70 → 84 BPM."
 */
export function progressSummary(name: string, { points }: Progress): string {
  const first = points.at(0);
  const last = points.at(-1);
  if (!first || !last) return `${name}: no sessions in this range.`;
  const sessions = points.reduce((n, p) => n + p.sessions, 0);
  const plural = sessions === 1 ? "session" : "sessions";
  if (points.length === 1) {
    return `${name}: ${accuracyText(last)} at up to ${last.bpm} BPM, ${sessions} ${plural}.`;
  }
  const tempo = first.bpm === last.bpm ? `steady at ${last.bpm} BPM` : `${first.bpm} → ${last.bpm} BPM`;
  return `${name}: ${accuracyText(first)} → ${accuracyText(last)} ${spanLabel(first.start, last.end)}, ${tempo}, ${sessions} ${plural}.`;
}

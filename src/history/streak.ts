/**
 * Practice streaks and time, from history records.
 *
 * Days are calendar dates (Temporal.PlainDate), never 24-hour blocks: a
 * session counts for the date it was played on in the time zone it was
 * played in. So 23:59 and 00:01 are two days, a 23- or 25-hour
 * daylight-saving day is still one day, and traveling doesn't move past
 * sessions to another date.
 */
import type { HistoryRecord, SessionRecord } from "./record";

/** The calendar date a record was played on, where it was played. */
export function practiceDate(record: HistoryRecord): Temporal.PlainDate {
  return Temporal.Instant.from(record.start).toZonedDateTimeISO(record.timeZone).toPlainDate();
}

const isSession = (r: HistoryRecord): r is SessionRecord => r.kind === "session";

export interface Streak {
  /** Days in a row with practice, ending today, or yesterday if not yet today. */
  current: number;
  practicedToday: boolean;
  longest: number;
}

/**
 * The streak as of `today` (the drummer's date now). A streak that reached
 * yesterday is still alive today: it only breaks once a whole day passes
 * without practice. Trainer runs count through their rounds, which are
 * sessions.
 */
export function streak(records: readonly HistoryRecord[], today: Temporal.PlainDate): Streak {
  const days = new Set(records.filter(isSession).map((r) => practiceDate(r).toString()));
  const practicedToday = days.has(today.toString());

  let current = 0;
  let day = practicedToday ? today : today.subtract({ days: 1 });
  while (days.has(day.toString())) {
    current++;
    day = day.subtract({ days: 1 });
  }

  let longest = 0;
  let run = 0;
  let previous: Temporal.PlainDate | null = null;
  for (const d of [...days].toSorted().map((s) => Temporal.PlainDate.from(s))) {
    run = previous && Temporal.PlainDate.compare(previous.add({ days: 1 }), d) === 0 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = d;
  }
  return { current, practicedToday, longest };
}

/** Total time spent in sessions on a calendar date. */
export function practiceTimeOn(records: readonly HistoryRecord[], date: Temporal.PlainDate): Temporal.Duration {
  let total = Temporal.Duration.from({ seconds: 0 });
  for (const r of records) {
    if (isSession(r) && Temporal.PlainDate.compare(practiceDate(r), date) === 0) {
      total = total.add(Temporal.Duration.from(r.duration));
    }
  }
  return total.round({ largestUnit: "hours", smallestUnit: "seconds" });
}

/** "12 min", "1 h 05 min", or "40 s" under a minute. */
export function formatPracticeTime(duration: Temporal.Duration): string {
  const seconds = Math.round(duration.total("seconds"));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

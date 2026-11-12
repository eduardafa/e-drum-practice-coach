import { describe, expect, it } from "vitest";
import type { HistoryRecord } from "./record";
import { formatPracticeTime, practiceDate, practiceTimeOn, streak } from "./streak";

/** A minimal session record started at a local wall-clock time in a zone. */
function session(local: string, timeZone = "Europe/Lisbon", duration = "PT5M"): HistoryRecord {
  const start = Temporal.PlainDateTime.from(local).toZonedDateTime(timeZone).toInstant().toString();
  return {
    v: 1,
    id: `${local}-${timeZone}`,
    kind: "session",
    start,
    duration,
    timeZone,
    exerciseId: "rock-8ths",
    exerciseName: "Money beat",
    bpm: 80,
    loops: 4,
    toleranceMs: 35,
    latencyOffsetMs: 0,
    accuracy: { partial: 0.9, strict: 0.8 },
    counts: { notes: 48, onTime: 40, early: 4, late: 2, missed: 2, extra: 0 },
    meanDeltaMs: 3,
    spreadMs: 12,
    voices: [],
    notes: [],
    extras: [],
    trainerRunId: null,
  };
}

const day = (s: string) => Temporal.PlainDate.from(s);

describe("practiceDate", () => {
  it("uses the date where the session was played", () => {
    // 23:30 in New York is already the next day in Lisbon; it still counts for the New York date.
    expect(practiceDate(session("2026-03-10T23:30", "America/New_York")).toString()).toBe("2026-03-10");
  });
});

describe("streak", () => {
  it("counts days in a row ending today", () => {
    const records = [session("2026-11-09T18:00"), session("2026-11-10T18:00"), session("2026-11-11T08:00")];
    expect(streak(records, day("2026-11-11"))).toEqual({ current: 3, practisedToday: true, longest: 3 });
  });

  it("keeps a streak that reached yesterday alive until today ends", () => {
    const records = [session("2026-11-09T18:00"), session("2026-11-10T18:00")];
    expect(streak(records, day("2026-11-11"))).toMatchObject({ current: 2, practisedToday: false });
  });

  it("breaks after a whole day without practice, but remembers the longest", () => {
    const records = [session("2026-11-01T18:00"), session("2026-11-02T18:00"), session("2026-11-03T18:00"), session("2026-11-09T18:00")];
    expect(streak(records, day("2026-11-11"))).toEqual({ current: 0, practisedToday: false, longest: 3 });
  });

  it("treats 23:59 and 00:01 as two days, and two sessions on one day as one", () => {
    const records = [session("2026-11-10T23:59"), session("2026-11-11T00:01"), session("2026-11-11T19:00")];
    expect(streak(records, day("2026-11-11")).current).toBe(2);
  });

  it("counts calendar days across a daylight-saving change", () => {
    // Lisbon's clocks went back on 2026-10-25 (a 25-hour day). Late-evening sessions either side.
    const records = [session("2026-10-24T23:30"), session("2026-10-25T23:30"), session("2026-10-26T23:30")];
    expect(streak(records, day("2026-10-26")).current).toBe(3);
    // And forwards on 2026-03-29 (a 23-hour day).
    const spring = [session("2026-03-28T00:30"), session("2026-03-29T00:30"), session("2026-03-30T00:30")];
    expect(streak(spring, day("2026-03-30")).current).toBe(3);
  });

  it("ignores trainer-run records (their rounds are sessions)", () => {
    const run: HistoryRecord = {
      ...session("2026-11-11T10:00"),
      kind: "trainer",
      config: { startBpm: 60, targetBpm: 80, passMark: 0.9, failMark: 0.7, step: 4 },
      rounds: [],
      reason: "stopped",
    };
    expect(streak([run], day("2026-11-11")).current).toBe(0);
  });
});

describe("practice time", () => {
  it("adds up the sessions on a date", () => {
    const records = [session("2026-11-11T08:00", "Europe/Lisbon", "PT4M30S"), session("2026-11-11T20:00", "Europe/Lisbon", "PT8M"), session("2026-11-10T20:00")];
    expect(formatPracticeTime(practiceTimeOn(records, day("2026-11-11")))).toBe("13 min");
  });

  it("formats short and long times for people", () => {
    expect(formatPracticeTime(Temporal.Duration.from({ seconds: 40 }))).toBe("40 s");
    expect(formatPracticeTime(Temporal.Duration.from({ minutes: 65 }))).toBe("1 h 05 min");
  });
});

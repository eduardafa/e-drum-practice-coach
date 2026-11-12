import { describe, expect, it } from "vitest";
import { progress, progressSummary, practisedExercises, weekStart, type Progress } from "./progress";
import type { HistoryRecord } from "./record";

interface Opts {
  timeZone?: string;
  exerciseId?: string;
  exerciseName?: string;
  bpm?: number;
  accuracy?: number | null;
  notes?: number;
}

/** A session record started at a local wall-clock time. */
function session(local: string, opts: Opts = {}): HistoryRecord {
  const { timeZone = "Europe/Lisbon", exerciseId = "rock-8ths", exerciseName = "Money beat", bpm = 80, accuracy = 0.9, notes = 48 } = opts;
  return {
    v: 1,
    id: `${local}-${exerciseId}-${bpm}`,
    kind: "session",
    start: Temporal.PlainDateTime.from(local).toZonedDateTime(timeZone).toInstant().toString(),
    duration: "PT1M",
    timeZone,
    exerciseId,
    exerciseName,
    bpm,
    loops: 4,
    toleranceMs: 35,
    latencyOffsetMs: 0,
    accuracy: { partial: accuracy, strict: accuracy === null ? null : accuracy - 0.1 },
    counts: { notes, onTime: 0, early: 0, late: 0, missed: 0, extra: 0 },
    meanDeltaMs: null,
    spreadMs: null,
    voices: [],
    notes: [],
    extras: [],
    trainerRunId: null,
  };
}

const day = (s: string) => Temporal.PlainDate.from(s);
const starts = (p: Progress) => p.points.map((x) => x.start.toString());

describe("weekStart", () => {
  it("goes back to Monday by default, or to the locale's first day", () => {
    expect(weekStart(day("2026-11-12")).toString()).toBe("2026-11-09"); // Thursday → Monday
    expect(weekStart(day("2026-11-09")).toString()).toBe("2026-11-09");
    expect(weekStart(day("2026-11-12"), 7).toString()).toBe("2026-11-08"); // Sunday-first weeks
    expect(weekStart(day("2026-11-08"), 7).toString()).toBe("2026-11-08");
  });
});

describe("progress by day", () => {
  it("groups sessions by the calendar date they were played on", () => {
    const records = [
      session("2026-11-10T23:59", { accuracy: 0.6 }),
      session("2026-11-11T00:01", { accuracy: 0.7 }),
      session("2026-11-11T19:00", { accuracy: 0.9 }),
    ];
    const p = progress(records, "rock-8ths", "7d", day("2026-11-11"), "partial");
    expect(p.grouping).toBe("day");
    expect(starts(p)).toEqual(["2026-11-10", "2026-11-11"]);
    expect(p.points[1]?.sessions).toBe(2);
    expect(p.points[1]?.accuracy).toBeCloseTo(0.8);
    // An average that lands a hair under a whole percent still reads as that percent.
    expect(progressSummary("Money beat", p)).toBe("Money beat: 60% → 80% over 2 days, steady at 80 BPM, 3 sessions.");
  });

  it("weights accuracy by notes and takes the fastest tempo", () => {
    const records = [
      session("2026-11-11T10:00", { accuracy: 1, notes: 96, bpm: 70 }),
      session("2026-11-11T11:00", { accuracy: 0.4, notes: 32, bpm: 84 }),
    ];
    const [point] = progress(records, "rock-8ths", "7d", day("2026-11-11"), "partial").points;
    expect(point?.accuracy).toBeCloseTo((96 + 0.4 * 32) / 128);
    expect(point?.bpm).toBe(84);
  });

  it("uses the chosen accuracy mode and skips sessions without a score", () => {
    const records = [session("2026-11-11T10:00", { accuracy: 0.9 }), session("2026-11-11T11:00", { accuracy: null })];
    const [point] = progress(records, "rock-8ths", "7d", day("2026-11-11"), "strict").points;
    expect(point?.accuracy).toBeCloseTo(0.8);
    expect(point?.sessions).toBe(2);
  });

  it("keeps only the exercise asked for and the dates in range", () => {
    const records = [
      session("2026-11-05T10:00"), // the first of the last 7 days
      session("2026-11-04T10:00"), // one day too early
      session("2026-11-11T10:00", { exerciseId: "single-strokes" }),
    ];
    expect(starts(progress(records, "rock-8ths", "7d", day("2026-11-11"), "partial"))).toEqual(["2026-11-05"]);
    expect(starts(progress(records, "rock-8ths", "30d", day("2026-11-11"), "partial"))).toEqual(["2026-11-04", "2026-11-05"]);
  });

  it("keeps a daylight-saving day as one day", () => {
    // 2026-03-29 in Lisbon is 23 hours long; both ends of it are one point.
    const records = [session("2026-03-29T00:30"), session("2026-03-29T23:30")];
    expect(starts(progress(records, "rock-8ths", "7d", day("2026-03-30"), "partial"))).toEqual(["2026-03-29"]);
  });
});

describe("progress by week", () => {
  it("stays daily for all time while the practice spans under a month", () => {
    const records = [session("2026-10-20T10:00"), session("2026-11-11T10:00")];
    expect(progress(records, "rock-8ths", "all", day("2026-11-11"), "partial").grouping).toBe("day");
  });

  it("groups all time by week once it spans a month or more", () => {
    const records = [
      session("2026-09-01T10:00", { bpm: 60 }), // Tuesday
      session("2026-09-06T21:00", { bpm: 64 }), // Sunday, same week
      session("2026-09-07T08:00", { bpm: 66 }), // Monday, next week
      session("2026-11-11T10:00", { bpm: 80 }),
    ];
    const p = progress(records, "rock-8ths", "all", day("2026-11-11"), "partial");
    expect(p.grouping).toBe("week");
    expect(starts(p)).toEqual(["2026-08-31", "2026-09-07", "2026-11-09"]);
    expect(p.points[0]).toMatchObject({ bpm: 64, sessions: 2 });
    expect(p.points[0]?.end.toString()).toBe("2026-09-06");
  });

  it("keeps weeks with a daylight-saving change as seven dates", () => {
    // Clocks go forward on Sunday 2026-03-29 and back on Sunday 2026-10-25 in Lisbon.
    const records = [
      session("2026-03-23T00:10"), // Monday
      session("2026-03-29T23:50"), // Sunday, after the change: same week
      session("2026-03-30T00:10"), // Monday: next week
      session("2026-10-19T00:10"),
      session("2026-10-25T23:50"),
      session("2026-10-26T00:10"),
    ];
    const p = progress(records, "rock-8ths", "all", day("2026-11-11"), "partial");
    expect(starts(p)).toEqual(["2026-03-23", "2026-03-30", "2026-10-19", "2026-10-26"]);
    expect(p.points.map((x) => x.sessions)).toEqual([2, 1, 2, 1]);
  });

  it("follows the locale's first day of the week", () => {
    const records = [session("2026-09-06T21:00"), session("2026-09-07T08:00"), session("2026-11-11T10:00")];
    const p = progress(records, "rock-8ths", "all", day("2026-11-11"), "partial", 7);
    expect(starts(p)).toEqual(["2026-09-06", "2026-11-08"]); // Sunday and Monday share a Sunday-first week
  });

  it("puts a session played abroad in the week of its own local date", () => {
    // Sunday 23:30 in New York is already Monday in Lisbon; it stays in the Sunday's week.
    const records = [session("2026-09-06T23:30", { timeZone: "America/New_York" }), session("2026-11-11T10:00")];
    expect(starts(progress(records, "rock-8ths", "all", day("2026-11-11"), "partial"))[0]).toBe("2026-08-31");
  });
});

describe("practisedExercises", () => {
  it("lists exercises most recently played first, with their latest name", () => {
    const records = [
      session("2026-11-11T10:00", { exerciseId: "single-strokes", exerciseName: "Singles" }),
      session("2026-11-10T10:00", { exerciseName: "Money beat" }),
      session("2026-11-09T10:00", { exerciseId: "single-strokes", exerciseName: "Old name" }),
    ];
    expect(practisedExercises(records)).toEqual([
      { id: "single-strokes", name: "Singles" },
      { id: "rock-8ths", name: "Money beat" },
    ]);
  });
});

describe("progressSummary", () => {
  it("says where accuracy and tempo started and ended", () => {
    const records = [
      session("2026-10-29T10:00", { accuracy: 0.72, bpm: 70 }),
      session("2026-11-11T10:00", { accuracy: 0.88, bpm: 84 }),
    ];
    const p = progress(records, "rock-8ths", "30d", day("2026-11-11"), "partial");
    expect(progressSummary("Money beat", p)).toBe("Money beat: 72% → 88% over 2 weeks, 70 → 84 BPM, 2 sessions.");
  });

  it("handles one point, a steady tempo and an empty range", () => {
    const one = progress([session("2026-11-11T10:00")], "rock-8ths", "7d", day("2026-11-11"), "partial");
    expect(progressSummary("Money beat", one)).toBe("Money beat: 90% at up to 80 BPM, 1 session.");
    const two = progress([session("2026-11-10T10:00"), session("2026-11-11T10:00")], "rock-8ths", "7d", day("2026-11-11"), "partial");
    expect(progressSummary("Money beat", two)).toBe("Money beat: 90% → 90% over 2 days, steady at 80 BPM, 2 sessions.");
    expect(progressSummary("Money beat", progress([], "rock-8ths", "7d", day("2026-11-11"), "partial"))).toBe(
      "Money beat: no sessions in this range.",
    );
  });
});

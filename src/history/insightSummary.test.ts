import { describe, expect, it } from "vitest";
import { insightSummary } from "./insightSummary";
import { parseRecord, type HistoryRecord } from "./record";

function session(id: string, day: string, accuracy: number, bpm: number): HistoryRecord {
  const r = parseRecord({
    v: 1,
    id,
    kind: "session",
    start: `${day}T18:00:00Z`,
    duration: "PT2M",
    timeZone: "Europe/Lisbon",
    exerciseId: "money-beat",
    exerciseName: "Money beat",
    bpm,
    loops: 4,
    toleranceMs: 35,
    latencyOffsetMs: 0,
    accuracy: { partial: accuracy, strict: accuracy - 0.1 },
    counts: { notes: 2, onTime: 2, early: 0, late: 0, missed: 0, extra: 0 },
    meanDeltaMs: 6,
    spreadMs: 4,
    voices: [
      { pad: "snare", dynamic: "accent", hand: null },
      { pad: "snare", dynamic: "ghost", hand: null },
    ],
    notes: [
      [0, 0, 9, 110],
      [1, 0, 3, 95],
    ],
    extras: [],
    trainerRunId: null,
  });
  if (!r) throw new Error("bad fixture");
  return r;
}

const today = Temporal.PlainDate.from("2026-11-13");

describe("insightSummary", () => {
  it("summarizes the last 30 days with the History page's numbers", () => {
    const records = [session("b", "2026-11-12", 0.9, 84), session("a", "2026-11-01", 0.7, 76), session("old", "2026-09-01", 0.2, 50)];
    const s = insightSummary(records, today, "partial");
    expect(s.sessions).toBe(2);
    expect(s.exercises).toEqual([
      { name: "Money beat", sessions: 2, accuracyFirst: 0.7, accuracyLatest: 0.9, fastestBpmFirst: 76, fastestBpmLatest: 84 },
    ]);
    expect(s.timingByLimb).toHaveProperty("Left hand");
    expect(s.strengthByDynamic).toEqual({
      accent: { meanStrength: 110, spread: 0, notes: 2 },
      ghost: { meanStrength: 95, spread: 0, notes: 2 },
    });
  });

  it("carries no IDs or exact dates, and is the same for the same history", () => {
    const records = [session("secret-id-123", "2026-11-12", 0.9, 84)];
    const text = JSON.stringify(insightSummary(records, today, "strict"));
    expect(text).not.toContain("secret-id-123");
    expect(text).not.toContain("2026-11-12");
    expect(text).toBe(JSON.stringify(insightSummary(records, today, "strict")));
  });
});

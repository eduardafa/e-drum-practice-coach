import { describe, expect, it } from "vitest";
import { FIRST_STEPS } from "../exercises/library";
import { PATH_GOAL_ID } from "../exercises/path";
import { firstStepsProgress } from "./firstSteps";
import type { HistoryRecord, SessionRecord } from "./record";

const PASS = 0.9;
const [STEP1, STEP2, STEP3] = FIRST_STEPS.map((e) => e.id);

let n = 0;
function session(exerciseId: string, partial: number | null, bpm = 60, strict = partial): SessionRecord {
  n += 1;
  return {
    v: 1,
    id: `s${n}`,
    kind: "session",
    start: "2026-11-13T12:00:00Z",
    duration: "PT1M",
    timeZone: "America/Toronto",
    exerciseId,
    exerciseName: exerciseId,
    bpm,
    loops: 4,
    toleranceMs: 35,
    latencyOffsetMs: 0,
    accuracy: { partial, strict },
    counts: { notes: 16, onTime: 0, early: 0, late: 0, missed: 0, extra: 0 },
    meanDeltaMs: null,
    spreadMs: null,
    voices: [],
    notes: [],
    extras: [],
    trainerRunId: null,
  };
}

describe("firstStepsProgress", () => {
  it("hasn't started without a First steps session, and points at step 1", () => {
    const p = firstStepsProgress([session(PATH_GOAL_ID, 0.95)], "partial", PASS);
    expect(p.started).toBe(false);
    expect(p.next?.exercise.id).toBe(STEP1);
    expect(p.totalSteps).toBe(FIRST_STEPS.length);
  });

  it("lists the numbered steps in order, then the goal", () => {
    const p = firstStepsProgress([], "partial", PASS);
    expect(p.rows.map((r) => r.exercise.id)).toEqual([...FIRST_STEPS.map((e) => e.id), PATH_GOAL_ID]);
    expect(p.rows.map((r) => r.goal)).toEqual([...FIRST_STEPS.map(() => false), true]);
  });

  it("keeps each step's best run and session count; a tie goes to the faster run", () => {
    const p = firstStepsProgress(
      [session(STEP1, 0.7, 60), session(STEP1, 0.92, 60), session(STEP1, 0.92, 64), session(STEP1, null)],
      "partial",
      PASS,
    );
    expect(p.rows[0]).toMatchObject({ sessions: 4, best: { accuracy: 0.92, bpm: 64 }, status: "passed" });
  });

  it("marks passed steps, the first unpassed one as next, and the rest as later", () => {
    const p = firstStepsProgress([session(STEP1, 0.95), session(STEP2, 0.8), session(STEP3, 0.91)], "partial", PASS);
    expect(p.rows.map((r) => r.status).slice(0, 4)).toEqual(["passed", "next", "passed", "later"]);
    expect(p.passedSteps).toBe(2);
    expect(p.next?.exercise.id).toBe(STEP2);
    expect(p.started).toBe(true);
  });

  it("passes exactly at the pass mark, in the chosen accuracy mode", () => {
    const records = [session(STEP1, 0.9, 60, 0.85)];
    expect(firstStepsProgress(records, "partial", PASS).rows[0].status).toBe("passed");
    expect(firstStepsProgress(records, "strict", PASS).rows[0].status).toBe("next");
  });

  it("has no next row once every step and the goal have passed", () => {
    const records = [...FIRST_STEPS.map((e) => session(e.id, 0.95)), session(PATH_GOAL_ID, 0.9)];
    const p = firstStepsProgress(records, "partial", PASS);
    expect(p.passedSteps).toBe(FIRST_STEPS.length);
    expect(p.next).toBeNull();
  });

  it("ignores tempo-trainer summaries; their rounds are saved as sessions and do count", () => {
    const trainer: HistoryRecord = {
      v: 1,
      id: "run-1",
      kind: "trainer",
      start: "2026-11-13T12:00:00Z",
      duration: "PT5M",
      timeZone: "America/Toronto",
      exerciseId: STEP1,
      exerciseName: STEP1,
      config: { startBpm: 60, targetBpm: 80, passMark: 0.9, failMark: 0.7, step: 4 },
      rounds: [{ bpm: 60, accuracy: 0.99, outcome: "up" }],
      reason: "stopped",
    };
    expect(firstStepsProgress([trainer], "partial", PASS).rows[0].sessions).toBe(0);
    const round: HistoryRecord = { ...session(STEP1, 0.95), trainerRunId: "run-1" };
    expect(firstStepsProgress([trainer, round], "partial", PASS).rows[0]).toMatchObject({ sessions: 1, status: "passed" });
  });
});

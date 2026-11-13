import { describe, expect, it } from "vitest";
import { FIRST_STEPS, FIRST_STEPS_2 } from "../exercises/library";
import { PATH_GOAL_ID, PATHS } from "../exercises/path";
import { practicePlan } from "./plan";
import type { HistoryRecord, SessionRecord } from "./record";

const PASS = 0.9;
let n = 0;
function session(exerciseId: string, accuracy: number): SessionRecord {
  n += 1;
  return {
    v: 1,
    id: `p${n}`,
    kind: "session",
    start: "2026-11-13T12:00:00Z",
    duration: "PT1M",
    timeZone: "America/Toronto",
    exerciseId,
    exerciseName: exerciseId,
    bpm: 60,
    loops: 4,
    toleranceMs: 35,
    latencyOffsetMs: 0,
    accuracy: { partial: accuracy, strict: accuracy },
    counts: { notes: 16, onTime: 0, early: 0, late: 0, missed: 0, extra: 0 },
    meanDeltaMs: null,
    spreadMs: null,
    voices: [],
    notes: [],
    extras: [],
    trainerRunId: null,
  };
}

const summary = (records: HistoryRecord[]) =>
  practicePlan(records, "partial", PASS).map((b) => `${b.kind}:${b.exercise.id}:${b.mode}:${b.minutes}`);

describe("practicePlan", () => {
  it("starts a first-timer by learning step 1 without the click, then playing it, then the goal", () => {
    expect(summary([])).toEqual([
      `warmup:${FIRST_STEPS[0].id}:learn:3`,
      `focus:${FIRST_STEPS[0].id}:play:10`,
      `finish:${PATH_GOAL_ID}:play:2`,
    ]);
  });

  it("warms up on the last passed step, focuses on the next, and learns it first if it's new", () => {
    expect(summary([session(FIRST_STEPS[0].id, 0.95)])).toEqual([
      `warmup:${FIRST_STEPS[0].id}:play:3`,
      `focus:${FIRST_STEPS[1].id}:learn:10`,
      `finish:${PATH_GOAL_ID}:play:2`,
    ]);
  });

  it("plays the focus step with the click once it's been tried", () => {
    const plan = practicePlan([session(FIRST_STEPS[0].id, 0.95), session(FIRST_STEPS[1].id, 0.7)], "partial", PASS);
    expect(plan[1]).toMatchObject({ kind: "focus", mode: "play" });
    expect(plan[1].exercise.id).toBe(FIRST_STEPS[1].id);
  });

  it("works on the goal itself, with no separate finish, once every step has passed (learning it first if new)", () => {
    const records = FIRST_STEPS.map((e) => session(e.id, 0.95));
    expect(summary(records)).toEqual([
      `warmup:${FIRST_STEPS.at(-1)?.id}:play:3`,
      `focus:${PATH_GOAL_ID}:learn:10`,
    ]);
    expect(summary([...records, session(PATH_GOAL_ID, 0.6)])[1]).toBe(`focus:${PATH_GOAL_ID}:play:10`);
  });

  it("moves on to part 2 once the Money beat passes, warming up on the Money beat", () => {
    const records = [...FIRST_STEPS.map((e) => session(e.id, 0.95)), session(PATH_GOAL_ID, 0.92)];
    expect(summary(records)).toEqual([
      `warmup:${PATH_GOAL_ID}:play:3`,
      `focus:${FIRST_STEPS_2[0].id}:learn:10`,
      `finish:${PATHS[1].goalId}:play:2`,
    ]);
  });

  it("keeps working on the last goal once everything has passed", () => {
    const records = [
      ...FIRST_STEPS.map((e) => session(e.id, 0.95)),
      session(PATH_GOAL_ID, 0.95),
      ...FIRST_STEPS_2.map((e) => session(e.id, 0.95)),
      session(PATHS[1].goalId, 0.95),
    ];
    expect(summary(records)).toEqual([
      `warmup:${FIRST_STEPS_2.at(-1)?.id}:play:3`,
      `focus:${PATHS[1].goalId}:play:10`,
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { type MetronomeSettings, type ScheduleCursor, takeStepsUntil } from "./schedule";

const base: MetronomeSettings = { bpm: 120, beatsPerBar: 4, subdivision: 1, clickSubdivisions: false };
const cursorAt = (t = 0): ScheduleCursor => ({ nextTime: t, beatInBar: 0, subInBeat: 0 });

describe("takeStepsUntil", () => {
  it("schedules quarter notes with downbeats every bar", () => {
    const steps = takeStepsUntil(cursorAt(), base, 4);
    expect(steps.map((s) => s.time)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(steps.map((s) => s.downbeat)).toEqual([true, false, false, false, true, false, false, false]);
  });

  it("emits subdivisions that aren't beats", () => {
    const steps = takeStepsUntil(cursorAt(), { ...base, subdivision: 4 }, 0.5);
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.beat)).toEqual([true, false, false, false]);
    expect(steps[1].intervalSec).toBeCloseTo(0.125);
  });

  it("continues from where the cursor left off", () => {
    const c = cursorAt();
    takeStepsUntil(c, base, 1);
    const next = takeStepsUntil(c, base, 2);
    expect(next.map((s) => s.time)).toEqual([1, 1.5]);
  });

  it("applies tempo changes from the next step", () => {
    const c = cursorAt();
    takeStepsUntil(c, base, 0.6); // steps at 0 and 0.5; next at 1.0
    const next = takeStepsUntil(c, { ...base, bpm: 60 }, 3.5);
    expect(next.map((s) => s.time)).toEqual([1, 2, 3]);
  });

  it("snaps to the next beat when the subdivision shrinks mid-beat", () => {
    const c = cursorAt();
    takeStepsUntil(c, { ...base, subdivision: 4 }, 0.3); // three 16ths, now mid-beat
    const [step] = takeStepsUntil(c, base, c.nextTime + 0.01);
    expect(step.beat).toBe(true);
    expect(step.downbeat).toBe(false);
  });
});

describe("step positions", () => {
  it("report the beat and subdivision of every step", () => {
    const cursor = { nextTime: 0, beatInBar: 0, subInBeat: 0 };
    const steps = takeStepsUntil(cursor, { bpm: 120, beatsPerBar: 4, subdivision: 2, clickSubdivisions: false }, 2.0);
    expect(steps.map((s) => `${s.beatInBar}.${s.subInBeat}`)).toEqual(["0.0", "0.1", "1.0", "1.1", "2.0", "2.1", "3.0", "3.1"]);
  });
});

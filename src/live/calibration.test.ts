import { describe, expect, it } from "vitest";
import { CalibrationSession, type CalibrationPlan } from "./calibration";

const PLAN: CalibrationPlan = { countInBeats: 4, clicks: 16, settleClicks: 4 };
const INTERVAL = 750; // 80 BPM

/** Schedules every click, starting at t = 1000 ms. */
function scheduled(): CalibrationSession {
  const s = new CalibrationSession(PLAN);
  for (let i = 0; i < 20; i++) s.addClick(1000 + i * INTERVAL, INTERVAL);
  return s;
}

const clickTime = (i: number) => 1000 + i * INTERVAL;

describe("CalibrationSession", () => {
  it("reports when the last click has been scheduled", () => {
    const s = new CalibrationSession(PLAN);
    for (let i = 0; i < 19; i++) expect(s.addClick(clickTime(i), INTERVAL)).toBe(false);
    expect(s.addClick(clickTime(19), INTERVAL)).toBe(true);
    expect(s.endTime).toBe(clickTime(19) + INTERVAL / 2);
  });

  it("ignores hits during the count-in", () => {
    const s = scheduled();
    expect(s.addHit(clickTime(2) + 20)).toBeNull();
  });

  it("records the raw delta of the first hit per click only", () => {
    const s = scheduled();
    expect(s.addHit(clickTime(5) + 25)).toBe(25);
    expect(s.addHit(clickTime(5) + 40)).toBeNull();
    expect(s.addHit(clickTime(6) - 10)).toBe(-10);
  });

  it("ignores hits far from any click", () => {
    const s = scheduled();
    expect(s.addHit(clickTime(19) + INTERVAL)).toBeNull();
  });

  it("drops the settle-in clicks from the measurement", () => {
    const s = scheduled();
    for (let i = 4; i < 20; i++) s.addHit(clickTime(i) + (i < 8 ? 90 : 20));
    expect(s.measuredDeltas()).toEqual(Array(12).fill(20));
  });

  it("walks through count-in, listening and done", () => {
    const s = scheduled();
    expect(s.progress(clickTime(0) - 1)).toEqual({ phase: "countIn", beat: 0, countInBeats: 4 });
    expect(s.progress(clickTime(3))).toMatchObject({ phase: "countIn", beat: 4 });
    s.addHit(clickTime(4) + 22);
    const listening = s.progress(clickTime(5));
    expect(listening).toMatchObject({ phase: "listening", clicksHeard: 2 });
    expect(listening.phase === "listening" && listening.hits.slice(0, 3)).toEqual([true, false, false]);

    for (let i = 8; i < 20; i++) s.addHit(clickTime(i) + 22 + (i % 3));
    const done = s.progress(clickTime(19) + INTERVAL);
    expect(done).toMatchObject({ phase: "done", result: { ok: true, offsetMs: 23, used: 12 } });
  });

  it("fails when the drummer barely plays", () => {
    const s = scheduled();
    s.addHit(clickTime(10) + 20);
    expect(s.progress(clickTime(19) + INTERVAL)).toMatchObject({
      phase: "done",
      result: { ok: false, reason: "tooFewHits" },
    });
  });
});

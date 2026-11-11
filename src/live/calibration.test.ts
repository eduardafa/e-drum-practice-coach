import { describe, expect, it } from "vitest";
import { SKILL_PROFILES } from "../profiles";
import { calibrationSetup, CalibrationSession, type CalibrationPlan } from "./calibration";

const PLAN: CalibrationPlan = { countInBeats: 4, settleClicks: 4, minClicks: 16, maxClicks: 80, confirmHits: 5 };
const OPTIONS = { minHits: 8, iqrFactor: 1.5, targetUncertaintyMs: 5, maxAbsOffsetMs: 200 };
const INTERVAL = 857; // 70 BPM
const clickTime = (i: number) => 1000 + i * INTERVAL;

/** Small seeded PRNG (mulberry32), so simulated drummers are repeatable. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normally distributed jitter (Box–Muller). */
function gaussian(random: () => number, sd: number): number {
  const u = 1 - random();
  const v = random();
  return sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Simulates a drummer who hits every click `offset` ms late on average, with
 * the given spread. Clicks are scheduled as the metronome would, and the run
 * stops when the session says no more clicks are needed.
 */
function simulate(session: CalibrationSession, offset: number, spread: number, seed: number) {
  const random = rng(seed);
  let clicks = 0;
  for (let i = 0; ; i++) {
    clicks = i + 1;
    const last = session.addClick(clickTime(i), INTERVAL);
    session.addHit(clickTime(i) + offset + gaussian(random, spread));
    if (last || session.finished) break;
  }
  const done = session.progress(clickTime(clicks + 1));
  if (done.phase !== "done") throw new Error("run didn't finish");
  return { result: done.result, clicksAfterCountIn: clicks - PLAN.countInBeats };
}

describe("calibrationSetup", () => {
  it("takes tempo, limit and target from the skill level", () => {
    const beginner = calibrationSetup("beginner");
    expect(beginner.metronome.bpm).toBe(SKILL_PROFILES.beginner.calibration.bpm);
    expect(beginner.plan.maxClicks).toBe(80);
    expect(beginner.options.targetUncertaintyMs).toBe(7);
    expect(calibrationSetup("advanced").options.targetUncertaintyMs).toBe(3);
  });
});

/** A short run with every click already scheduled. */
function scheduled(): CalibrationSession {
  const s = new CalibrationSession({ ...PLAN, maxClicks: 16 }, OPTIONS);
  for (let i = 0; i < 20; i++) s.addClick(clickTime(i), INTERVAL);
  return s;
}

describe("CalibrationSession: hit matching", () => {

  it("ignores hits during the count-in", () => {
    expect(scheduled().addHit(clickTime(2) + 20)).toBeNull();
  });

  it("records the raw delta of the first hit per click only", () => {
    const s = scheduled();
    expect(s.addHit(clickTime(5) + 25)).toBe(25);
    expect(s.addHit(clickTime(5) + 40)).toBeNull();
    expect(s.addHit(clickTime(6) - 10)).toBe(-10);
  });

  it("ignores hits far from any click", () => {
    expect(scheduled().addHit(clickTime(19) + INTERVAL)).toBeNull();
  });

  it("drops the settle-in clicks from the measurement", () => {
    const s = scheduled();
    for (let i = 4; i < 8; i++) s.addHit(clickTime(i) + 90);
    s.addHit(clickTime(8) + 20);
    expect(s.measuredDeltas()).toEqual([20]);
  });
});

describe("CalibrationSession: adaptive length", () => {
  it("lets a steady drummer finish soon after the minimum", () => {
    const { result, clicksAfterCountIn } = simulate(new CalibrationSession(PLAN, OPTIONS), 25, 6, 1);
    // The minimum, plus the hits that confirm the estimate is on target.
    expect(clicksAfterCountIn).toBe(PLAN.minClicks + PLAN.confirmHits - 1);
    expect(result).toMatchObject({ ok: true, confident: true });
    expect(Math.abs((result.offsetMs ?? 0) - 25)).toBeLessThanOrEqual(5);
  });

  it("gives a ±29 ms beginner a confident result within the beginner limit", () => {
    const { result, clicksAfterCountIn } = simulate(new CalibrationSession(PLAN, OPTIONS), 25, 29, 7);
    expect(result).toMatchObject({ ok: true, confident: true });
    expect(clicksAfterCountIn).toBeGreaterThan(PLAN.minClicks);
    expect(clicksAfterCountIn).toBeLessThanOrEqual(PLAN.maxClicks);
  });

  it("is accurate for ±29 ms drummers across many runs", () => {
    const errors = Array.from({ length: 200 }, (_, seed) => {
      const { result } = simulate(new CalibrationSession(PLAN, OPTIONS), 25, 29, seed + 100);
      if (!result.ok) throw new Error(`seed ${seed}: ${result.reason}`);
      return Math.abs(result.offsetMs - 25);
    });
    const within = (ms: number) => errors.filter((e) => e <= ms).length / errors.length;
    // A ±5 ms standard error means about two thirds of runs land within 5 ms,
    // and nearly all within 10 ms.
    expect(within(5)).toBeGreaterThanOrEqual(0.6);
    expect(within(10)).toBeGreaterThanOrEqual(0.93);
  });

  it("with the real Beginner profile, a ±29 ms drummer finishes in about 30 clicks", () => {
    const { plan, options } = calibrationSetup("beginner");
    const runs = Array.from({ length: 100 }, (_, seed) => {
      const { result, clicksAfterCountIn } = simulate(new CalibrationSession(plan, options), 25, 29, seed + 500);
      if (!result.ok) throw new Error(`seed ${seed}: ${result.reason}`);
      return { error: Math.abs(result.offsetMs - 25), clicks: clicksAfterCountIn, confident: result.confident };
    });
    const mean = runs.reduce((sum, r) => sum + r.clicks, 0) / runs.length;
    expect(mean).toBeLessThan(40);
    expect(runs.every((r) => r.confident)).toBe(true);
    expect(runs.filter((r) => r.error <= 14).length / runs.length).toBeGreaterThanOrEqual(0.93);
  });

  it("still gives a usable result when the limit comes first", () => {
    const short = new CalibrationSession({ ...PLAN, maxClicks: 20 }, OPTIONS);
    const { result, clicksAfterCountIn } = simulate(short, 25, 45, 3);
    expect(clicksAfterCountIn).toBe(20);
    expect(result).toMatchObject({ ok: true, confident: false });
    expect(result.uncertaintyMs).toBeGreaterThan(5);
  });

  it("stops accepting clicks and hits once finished", () => {
    const s = new CalibrationSession(PLAN, OPTIONS);
    simulate(s, 25, 6, 1);
    expect(s.finished).toBe(true);
    expect(s.addClick(clickTime(40), INTERVAL)).toBe(true);
    expect(s.addHit(clickTime(40) + 25)).toBeNull();
  });

  it("fails with too few hits when the drummer barely plays", () => {
    const s = new CalibrationSession({ ...PLAN, maxClicks: 16 }, OPTIONS);
    for (let i = 0; i < 20; i++) s.addClick(clickTime(i), INTERVAL);
    s.addHit(clickTime(10) + 20);
    expect(s.progress(clickTime(20))).toMatchObject({ phase: "done", result: { ok: false, reason: "tooFewHits" } });
  });
});

describe("CalibrationSession: progress", () => {
  it("walks through count-in and listening, reporting the uncertainty", () => {
    const s = new CalibrationSession(PLAN, OPTIONS);
    for (let i = 0; i < 30; i++) s.addClick(clickTime(i), INTERVAL);
    expect(s.progress(clickTime(0) - 1)).toEqual({ phase: "countIn", beat: 0, countInBeats: 4 });
    expect(s.progress(clickTime(3))).toMatchObject({ phase: "countIn", beat: 4 });
    expect(s.progress(clickTime(5))).toMatchObject({ phase: "listening", clicksHeard: 2, hits: 0, uncertaintyMs: null });
    for (let i = 8; i < 20; i++) s.addHit(clickTime(i) + 20 + (i % 2 ? 30 : -30));
    const listening = s.progress(clickTime(19));
    expect(listening).toMatchObject({ phase: "listening", hits: 12, targetUncertaintyMs: 5 });
    expect(listening.phase === "listening" && listening.uncertaintyMs).toBeGreaterThan(5);
  });
});

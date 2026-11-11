/**
 * One calibration run: a count-in, then a fixed number of clicks the drummer
 * plays along to. Tracks click times and the raw delta of the first hit near
 * each click. No browser APIs, so it can be unit-tested.
 *
 * All times are performance.now() milliseconds.
 */
import type { MetronomeSettings } from "../audio/schedule";
import {
  computeCalibration,
  DEFAULT_CALIBRATION,
  type CalibrationOptions,
  type CalibrationResult,
} from "../timing/calibration";

export interface CalibrationPlan {
  /** Clicks before measuring starts, so the drummer can lock in. */
  countInBeats: number;
  /** Clicks the drummer plays along to. */
  clicks: number;
  /** Leading measured clicks to discard while the drummer settles. */
  settleClicks: number;
}

export const CALIBRATION_PLAN: CalibrationPlan = { countInBeats: 4, clicks: 16, settleClicks: 4 };

/** A moderate, steady tempo that is easy to lock onto. */
export const CALIBRATION_METRONOME: MetronomeSettings = {
  bpm: 80,
  beatsPerBar: 4,
  subdivision: 1,
  clickSubdivisions: false,
};

export type CalibrationProgress =
  | { phase: "countIn"; beat: number; countInBeats: number }
  | { phase: "listening"; clicksHeard: number; hits: boolean[] }
  | { phase: "done"; result: CalibrationResult };

export class CalibrationSession {
  private readonly clickTimes: number[] = [];
  private intervalMs = 0;
  /** Raw delta per click index (count-in clicks included in the index). */
  private readonly deltas = new Map<number, number>();
  private result: CalibrationResult | null = null;

  constructor(
    readonly plan: CalibrationPlan = CALIBRATION_PLAN,
    private readonly options: CalibrationOptions = DEFAULT_CALIBRATION,
  ) {}

  get totalClicks(): number {
    return this.plan.countInBeats + this.plan.clicks;
  }

  /** Records a scheduled click. Returns true once every click has been scheduled. */
  addClick(time: number, intervalMs: number): boolean {
    if (this.clickTimes.length < this.totalClicks) {
      this.clickTimes.push(time);
      this.intervalMs = intervalMs;
    }
    return this.clickTimes.length >= this.totalClicks;
  }

  /**
   * Assigns a hit to the nearest click. Hits during the count-in, more than
   * half an interval from any click, or after a click already has a hit
   * (flams, double strokes) are ignored. Returns the raw delta when counted.
   */
  addHit(time: number): number | null {
    let index = -1;
    let best = Infinity;
    for (let i = 0; i < this.clickTimes.length; i++) {
      const d = Math.abs(time - this.clickTimes[i]);
      if (d < best) {
        best = d;
        index = i;
      }
    }
    if (index < this.plan.countInBeats || best > this.intervalMs / 2) return null;
    if (this.deltas.has(index)) return null;
    const delta = time - this.clickTimes[index];
    this.deltas.set(index, delta);
    return delta;
  }

  /** When the run ends: half an interval after the last click. */
  get endTime(): number | null {
    if (this.clickTimes.length < this.totalClicks) return null;
    return this.clickTimes[this.clickTimes.length - 1] + this.intervalMs / 2;
  }

  /** Deltas used for the estimate: measured clicks after the settle-in period. */
  measuredDeltas(): number[] {
    const first = this.plan.countInBeats + this.plan.settleClicks;
    const out: number[] = [];
    for (let i = first; i < this.totalClicks; i++) {
      const d = this.deltas.get(i);
      if (d !== undefined) out.push(d);
    }
    return out;
  }

  progress(now: number): CalibrationProgress {
    const end = this.endTime;
    if (end !== null && now >= end) {
      this.result ??= computeCalibration(this.measuredDeltas(), this.options);
      return { phase: "done", result: this.result };
    }
    let heard = 0;
    while (heard < this.clickTimes.length && this.clickTimes[heard] <= now) heard++;
    if (heard <= this.plan.countInBeats) {
      return { phase: "countIn", beat: heard, countInBeats: this.plan.countInBeats };
    }
    const hits = Array.from({ length: this.plan.clicks }, (_, i) =>
      this.deltas.has(this.plan.countInBeats + i),
    );
    return { phase: "listening", clicksHeard: heard - this.plan.countInBeats, hits };
  }
}

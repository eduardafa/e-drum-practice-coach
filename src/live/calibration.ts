/**
 * One calibration run: a count-in, then clicks the drummer plays along to,
 * until the latency offset is known precisely enough or the click limit is
 * reached. Tracks click times and the raw delta of the first hit near each
 * click. No browser APIs, so it can be unit-tested.
 *
 * The run adapts to the drummer: a steady player reaches the precision target
 * after the minimum number of clicks; a less steady one plays longer and gets
 * an equally precise result, or the best estimate so far, with its
 * uncertainty, if the limit comes first.
 *
 * All times are performance.now() milliseconds.
 */
import type { MetronomeSettings } from "../audio/schedule";
import { SKILL_PROFILES, type SkillLevel } from "../profiles";
import {
  computeCalibration,
  DEFAULT_CALIBRATION,
  type CalibrationOptions,
  type CalibrationResult,
} from "../timing/calibration";

export interface CalibrationPlan {
  /** Clicks before measuring starts, so the drummer can lock in. */
  countInBeats: number;
  /** Leading measured clicks to discard while the drummer settles. */
  settleClicks: number;
  /** Fewest clicks after the count-in before the run may finish early. */
  minClicks: number;
  /** Most clicks after the count-in; the run ends here even if not yet precise. */
  maxClicks: number;
  /**
   * Consecutive hits the estimate must stay on target before the run stops.
   * Stopping at the first lucky dip would stop too early too often; 5 brings
   * accuracy in line with the target (checked by simulation, see ADR 0007).
   */
  confirmHits: number;
}

export interface CalibrationSetup {
  plan: CalibrationPlan;
  options: CalibrationOptions;
  metronome: MetronomeSettings;
}

/** The calibration run for a skill level. */
export function calibrationSetup(level: SkillLevel): CalibrationSetup {
  const { bpm, maxClicks, targetUncertaintyMs } = SKILL_PROFILES[level].calibration;
  return {
    plan: { countInBeats: 4, settleClicks: 4, minClicks: 16, maxClicks, confirmHits: 5 },
    options: { ...DEFAULT_CALIBRATION, targetUncertaintyMs },
    metronome: { bpm, beatsPerBar: 4, subdivision: 1, clickSubdivisions: false },
  };
}

export type CalibrationProgress =
  | { phase: "countIn"; beat: number; countInBeats: number }
  | {
      phase: "listening";
      clicksHeard: number;
      maxClicks: number;
      /** Hits counted towards the estimate so far. */
      hits: number;
      /** Current uncertainty of the estimate, or null before there are enough hits. */
      uncertaintyMs: number | null;
      targetUncertaintyMs: number;
    }
  | { phase: "done"; result: CalibrationResult };

export class CalibrationSession {
  private readonly clickTimes: number[] = [];
  private intervalMs = 0;
  /** Raw delta per click index (count-in clicks included in the index). */
  private readonly deltas = new Map<number, number>();
  /** Set when the precision target is reached. */
  private finishedAt: number | null = null;
  /** Consecutive hits with the estimate on target. */
  private onTargetStreak = 0;
  private result: CalibrationResult | null = null;

  constructor(
    readonly plan: CalibrationPlan,
    readonly options: CalibrationOptions = DEFAULT_CALIBRATION,
  ) {}

  private get maxTotalClicks(): number {
    return this.plan.countInBeats + this.plan.maxClicks;
  }

  /** True once the precision target is reached; no more clicks are needed. */
  get finished(): boolean {
    return this.finishedAt !== null;
  }

  /**
   * Records a scheduled click. Returns true when no more clicks are needed:
   * the target was reached, or this was the last allowed click.
   */
  addClick(time: number, intervalMs: number): boolean {
    if (this.finished) return true;
    if (this.clickTimes.length < this.maxTotalClicks) {
      this.clickTimes.push(time);
      this.intervalMs = intervalMs;
    }
    return this.clickTimes.length >= this.maxTotalClicks;
  }

  /**
   * Assigns a hit to the nearest click. Hits during the count-in, more than
   * half an interval from any click, after a click already has a hit (flams,
   * double strokes), or after the run finished are ignored. Returns the raw
   * delta when counted.
   */
  addHit(time: number): number | null {
    if (this.finished) return null;
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

    const clicksAfterCountIn = index - this.plan.countInBeats + 1;
    if (clicksAfterCountIn >= this.plan.minClicks) {
      const estimate = computeCalibration(this.measuredDeltas(), this.options);
      this.onTargetStreak = estimate.ok && estimate.confident ? this.onTargetStreak + 1 : 0;
      if (this.onTargetStreak >= this.plan.confirmHits) this.finishedAt = time;
    }
    return delta;
  }

  /** When the run ends: on reaching the target, or half an interval after the last allowed click. */
  get endTime(): number | null {
    if (this.finishedAt !== null) return this.finishedAt;
    if (this.clickTimes.length < this.maxTotalClicks) return null;
    return this.clickTimes[this.clickTimes.length - 1] + this.intervalMs / 2;
  }

  /** Deltas used for the estimate: measured clicks after the settle-in period. */
  measuredDeltas(): number[] {
    const first = this.plan.countInBeats + this.plan.settleClicks;
    const out: number[] = [];
    for (let i = first; i < this.clickTimes.length; i++) {
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
    const deltas = this.measuredDeltas();
    const estimate = computeCalibration(deltas, this.options);
    return {
      phase: "listening",
      clicksHeard: heard - this.plan.countInBeats,
      maxClicks: this.plan.maxClicks,
      hits: deltas.length,
      uncertaintyMs: estimate.ok ? estimate.uncertaintyMs : null,
      targetUncertaintyMs: this.options.targetUncertaintyMs,
    };
  }
}

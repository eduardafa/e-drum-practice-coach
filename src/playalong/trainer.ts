/**
 * Tempo trainer rules: after each round, speed up if it was clean, slow down
 * if it fell apart, otherwise play it again at the same tempo.
 *
 * Pure, so every rule is tested. The UI runs the rounds and asks nextRound
 * what to do after each one.
 */
import { MIN_BPM, stepBpm } from "../audio/schedule";

export interface TrainerConfig {
  startBpm: number;
  /** The trainer finishes after a passing round at this tempo. */
  targetBpm: number;
  /** Accuracy (0 to 1) at or above which the tempo goes up. */
  passMark: number;
  /** Accuracy below which the tempo goes down. */
  failMark: number;
  /** BPM added or removed per step. */
  step: number;
}

export const DEFAULT_PASS_MARK = 0.9;
export const DEFAULT_FAIL_MARK = 0.7;
export const DEFAULT_STEP = 4;

export type RoundOutcome = "up" | "down" | "stay" | "done";

export interface RoundRecord {
  bpm: number;
  accuracy: number;
  outcome: RoundOutcome;
}

/** Keeps a config sensible: tempos in range, target not below start, fail mark not above pass mark. */
export function normalizeConfig(config: TrainerConfig): TrainerConfig {
  // stepBpm with no step rounds and clamps to MIN_BPM..MAX_BPM.
  const startBpm = stepBpm(config.startBpm, 0);
  const passMark = Math.min(1, Math.max(0, config.passMark));
  return {
    startBpm,
    targetBpm: Math.max(startBpm, stepBpm(config.targetBpm, 0)),
    passMark,
    failMark: Math.min(passMark, Math.max(0, config.failMark)),
    step: Math.max(1, Math.round(config.step)),
  };
}

/** What happens after a round played at `bpm` with `accuracy`: the outcome and the next tempo. */
export function nextRound(config: TrainerConfig, bpm: number, accuracy: number): { outcome: RoundOutcome; bpm: number } {
  if (accuracy >= config.passMark) {
    if (bpm >= config.targetBpm) return { outcome: "done", bpm };
    return { outcome: "up", bpm: Math.min(config.targetBpm, bpm + config.step) };
  }
  if (accuracy < config.failMark && bpm > MIN_BPM) {
    return { outcome: "down", bpm: Math.max(MIN_BPM, bpm - config.step) };
  }
  return { outcome: "stay", bpm };
}

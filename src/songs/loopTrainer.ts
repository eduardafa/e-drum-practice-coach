/**
 * Speeding a looped section up as the drummer gets it (EDU-123), the way the
 * tempo trainer does for exercises: one pass of the loop per round, then up a
 * speed at the pass mark, down one below the fail mark, the same speed in
 * between, finished after a pass at full speed. The marks are the trainer's,
 * so "steady" means the same thing across the app. Pure; the rounds are run
 * by useLoopTrainer.
 */
import type { TabScore } from "./tabScoring";
import { DEFAULT_FAIL_MARK, DEFAULT_PASS_MARK, type RoundOutcome } from "../playalong/trainer";

/** The speeds a song plays at, slowest first (see SongPanel's Speed menu). */
export const LOOP_SPEEDS = [0.5, 0.7, 0.85, 1] as const;
/** Where a run starts when the song is at full speed. */
export const DEFAULT_START_SPEED = 0.7;

export interface LoopRound {
  speed: number;
  /** 0 to 1, or null when too little was played to judge. */
  accuracy: number | null;
  outcome: RoundOutcome;
}

/** The speed a run starts at: the one chosen in the Speed menu, or 70% from full speed. */
export function startSpeed(current: number): number {
  return current < 1 ? current : DEFAULT_START_SPEED;
}

/** After a pass at `speed` with `accuracy`: what happens and the next speed. A pass that couldn't be judged is played again. */
export function nextLoopSpeed(speed: number, accuracy: number | null): { outcome: RoundOutcome; speed: number } {
  const i = LOOP_SPEEDS.findIndex((s) => s >= speed - 1e-9);
  const at = i === -1 ? LOOP_SPEEDS.length - 1 : i;
  if (accuracy === null) return { outcome: "stay", speed };
  if (accuracy >= DEFAULT_PASS_MARK) {
    if (at === LOOP_SPEEDS.length - 1) return { outcome: "done", speed };
    return { outcome: "up", speed: LOOP_SPEEDS[at + 1] };
  }
  if (accuracy < DEFAULT_FAIL_MARK && at > 0) return { outcome: "down", speed: LOOP_SPEEDS[at - 1] };
  return { outcome: "stay", speed };
}

/**
 * How a pass went, 0 to 1. With a drum tab: notes hit on time, out of the
 * notes played plus extra hits (so hitting everything can't pass). Without
 * one: the share of hits on the beat, as long as there were about as many
 * hits as beats (`minHits`), so a few lucky hits can't pass either.
 * Null when there's too little to judge.
 */
export function passAccuracy(tab: TabScore | null, hits: { scored: number; onTime: number }, minHits: number): number | null {
  if (tab) {
    const total = tab.played + tab.extra;
    return total === 0 ? null : tab.onTime / total;
  }
  if (hits.scored < Math.max(1, minHits)) return hits.scored === 0 ? null : 0;
  return hits.onTime / hits.scored;
}

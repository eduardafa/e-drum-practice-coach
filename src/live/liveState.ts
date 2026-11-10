/**
 * Mutable state shared by the MIDI handler (writer) and the canvas renderer
 * and stats panel (readers). Deliberately outside React: hits arrive faster
 * than React should re-render, and the renderer reads it every frame.
 */
import type { PadId } from "../kit/nitroMax";
import type { HitScore } from "../timing/grid";

export interface LiveHit {
  pad: PadId | null;
  note: number;
  zone: string | null;
  velocity: number;
  /** performance.now() ms. */
  time: number;
  score: HitScore | null;
}

export interface Beat {
  time: number;
  downbeat: boolean;
}

const MAX_RECENT_HITS = 64;
const MAX_BEATS = 16;

export class LiveState {
  /** Most recent hit per pad, for the flash animation. */
  readonly lastHitByPad = new Map<PadId, LiveHit>();
  /** Recent hits, oldest first, for the timing strip. */
  readonly recentHits: LiveHit[] = [];
  /** Upcoming and recent beats, for the beat pulse. */
  readonly beats: Beat[] = [];
  lastHit: LiveHit | null = null;

  /** Running totals of the current metronome session. */
  scoredHits = 0;
  onTimeHits = 0;
  sumDeltaMs = 0;
  sumAbsDeltaMs = 0;

  addHit(hit: LiveHit): void {
    this.lastHit = hit;
    if (hit.pad) this.lastHitByPad.set(hit.pad, hit);
    this.recentHits.push(hit);
    if (this.recentHits.length > MAX_RECENT_HITS) this.recentHits.shift();
    if (hit.score) {
      this.scoredHits += 1;
      if (hit.score.verdict === "onTime") this.onTimeHits += 1;
      this.sumDeltaMs += hit.score.deltaMs;
      this.sumAbsDeltaMs += Math.abs(hit.score.deltaMs);
    }
  }

  addBeat(beat: Beat): void {
    this.beats.push(beat);
    if (this.beats.length > MAX_BEATS) this.beats.shift();
  }

  resetSession(): void {
    this.scoredHits = 0;
    this.onTimeHits = 0;
    this.sumDeltaMs = 0;
    this.sumAbsDeltaMs = 0;
    this.beats.length = 0;
  }
}

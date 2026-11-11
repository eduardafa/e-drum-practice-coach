/**
 * Mutable state shared by the MIDI handler (writer) and the canvas renderer
 * and stats panel (readers). Deliberately outside React: hits arrive faster
 * than React should re-render, and the renderer reads it every frame.
 */
import type { PadId } from "../kit/nitroMax";
import type { HitScore } from "../timing/grid";
import type { Count } from "./counts";

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
const MAX_COUNTS = 64;

export class LiveState {
  /** Most recent hit per pad, for the flash animation. */
  readonly lastHitByPad = new Map<PadId, LiveHit>();
  /** Recent hits, oldest first, for the timing strip. */
  readonly recentHits: LiveHit[] = [];
  /** Upcoming and recent beats, for the beat pulse. */
  readonly beats: Beat[] = [];
  /** Upcoming and recent counts ("1", "&", ...), for the live count. */
  readonly counts: Count[] = [];
  lastHit: LiveHit | null = null;

  /** Running totals of the current metronome session. */
  scoredHits = 0;
  onTimeHits = 0;
  sumDeltaMs = 0;
  sumAbsDeltaMs = 0;
  /** Running mean and sum of squared deviations (Welford's algorithm) for the spread. */
  private deltaMean = 0;
  private deltaM2 = 0;

  /** Standard deviation of this session's scored deltas: how steady the drummer is. */
  get spreadMs(): number | null {
    return this.scoredHits >= 2 ? Math.sqrt(this.deltaM2 / (this.scoredHits - 1)) : null;
  }

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
      // Welford's update: numerically stable, and needs no list of past hits.
      const before = hit.score.deltaMs - this.deltaMean;
      this.deltaMean += before / this.scoredHits;
      this.deltaM2 += before * (hit.score.deltaMs - this.deltaMean);
    }
  }

  addCount(count: Count): void {
    this.counts.push(count);
    if (this.counts.length > MAX_COUNTS) this.counts.shift();
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
    this.deltaMean = 0;
    this.deltaM2 = 0;
    this.beats.length = 0;
    this.counts.length = 0;
  }
}

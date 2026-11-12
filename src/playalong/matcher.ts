/**
 * Matches the drummer's hits to an exercise's expected notes.
 *
 * Rules:
 * - A hit can only match a note on the same pad, within that note's window
 *   (see buildTimeline), so a wrong pad or a wildly late hit is never scored
 *   against the wrong note.
 * - Snare head, rim and cross-stick all count as snare. Open and closed
 *   hi-hat are different notes.
 * - A flam is two strokes; the one closest to the beat is scored and the other
 *   is absorbed. On any other note, a second hit in its window is an extra.
 * - A note is missed once its window has passed without a hit, which tick()
 *   decides.
 * - The latency offset is removed from every hit, exactly as in v1 scoring.
 *
 * Pure logic, so every rule can be unit-tested.
 */
import type { PadId } from "../kit/nitroMax";
import { classify, type ScoringOptions, type Verdict } from "../timing/grid";
import type { ExpectedNote } from "./timeline";

export interface PlayedHit {
  pad: PadId | null;
  zone: string | null;
  /** performance.now() ms, before latency correction. */
  time: number;
  /** MIDI velocity, 1 to 127, kept for practice history. */
  velocity?: number;
}

export type NoteResult =
  | { status: "pending" }
  | { status: "hit"; deltaMs: number; verdict: Verdict; velocity?: number }
  | { status: "missed" };

export type MatchEvent =
  | { kind: "hit"; note: ExpectedNote; deltaMs: number; verdict: Verdict }
  /** A second stroke on a flam, or a closer one that replaced the first. Not an extra. */
  | { kind: "flamStroke"; note: ExpectedNote }
  | { kind: "extra"; hit: PlayedHit }
  | { kind: "missed"; note: ExpectedNote };

export interface MatchSummary {
  expected: number;
  hit: number;
  onTime: number;
  early: number;
  late: number;
  missed: number;
  extra: number;
  /** Notes whose window hasn't passed yet. */
  pending: number;
}

/** Hi-hat zones that sound open. */
function isOpenZone(zone: string | null): boolean {
  return zone !== null && zone.includes("open");
}

/** Whether a played hit can count for an expected note, ignoring timing. */
export function voiceMatches(note: ExpectedNote, hit: PlayedHit): boolean {
  if (hit.pad !== note.pad) return false;
  if (note.pad === "hihat") return isOpenZone(hit.zone) === note.open;
  return true;
}

function hitResult(deltaMs: number, verdict: Verdict, velocity: number | undefined): NoteResult {
  return velocity === undefined ? { status: "hit", deltaMs, verdict } : { status: "hit", deltaMs, verdict, velocity };
}

export class NoteMatcher {
  private readonly results: NoteResult[];
  /** Every note before this index is resolved. */
  private cursor = 0;
  private readonly extras: PlayedHit[] = [];
  /**
   * The widest window. Windows differ per note, so window starts aren't in time
   * order; scans stop once a note is further away than any window could reach.
   */
  private readonly maxWindowMs: number;

  constructor(
    readonly notes: readonly ExpectedNote[],
    private readonly scoring: ScoringOptions,
  ) {
    this.results = notes.map(() => ({ status: "pending" }));
    this.maxWindowMs = notes.reduce((max, n) => Math.max(max, n.windowMs), 0);
  }

  resultOf(note: ExpectedNote): NoteResult {
    return this.results[note.id];
  }

  /** Matches one hit. Call tick() first so notes whose window passed are already resolved. */
  hit(hit: PlayedHit): MatchEvent {
    const time = hit.time - this.scoring.latencyOffsetMs;
    let best: ExpectedNote | null = null;
    // Windows on a pad don't overlap, so at most one note on this pad contains the hit.
    // Scan from the cursor while notes could still reach back to this hit.
    for (let i = this.cursor; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.time - this.maxWindowMs > time) break;
      if (Math.abs(time - note.time) <= note.windowMs && voiceMatches(note, hit)) {
        best = note;
        break;
      }
    }
    if (!best) return this.extra(hit);

    const deltaMs = time - best.time;
    const current = this.results[best.id];
    if (current.status === "hit") {
      // A flam's other stroke: keep whichever is closer to the beat.
      if (!best.flam) return this.extra(hit);
      if (Math.abs(deltaMs) < Math.abs(current.deltaMs)) {
        this.results[best.id] = hitResult(deltaMs, classify(deltaMs, this.scoring.toleranceMs), hit.velocity);
      }
      return { kind: "flamStroke", note: best };
    }
    if (current.status === "missed") return this.extra(hit);

    const verdict = classify(deltaMs, this.scoring.toleranceMs);
    this.results[best.id] = hitResult(deltaMs, verdict, hit.velocity);
    return { kind: "hit", note: best, deltaMs, verdict };
  }

  /** Resolves notes whose window has fully passed by `now` (performance.now() ms): unhit ones are missed. */
  tick(now: number): MatchEvent[] {
    const corrected = now - this.scoring.latencyOffsetMs;
    const events: MatchEvent[] = [];
    for (let i = this.cursor; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.time - this.maxWindowMs > corrected) break;
      if (this.results[note.id].status === "pending" && note.time + note.windowMs < corrected) {
        this.results[note.id] = { status: "missed" };
        events.push({ kind: "missed", note });
      }
    }
    while (this.cursor < this.notes.length && this.results[this.cursor].status !== "pending") this.cursor++;
    return events;
  }

  summary(): MatchSummary {
    const s: MatchSummary = {
      expected: this.notes.length,
      hit: 0,
      onTime: 0,
      early: 0,
      late: 0,
      missed: 0,
      extra: this.extras.length,
      pending: 0,
    };
    for (const r of this.results) {
      if (r.status === "pending") s.pending++;
      else if (r.status === "missed") s.missed++;
      else {
        s.hit++;
        if (r.verdict === "onTime") s.onTime++;
        else if (r.verdict === "early") s.early++;
        else s.late++;
      }
    }
    return s;
  }

  /** Hits that matched no note, in the order played. */
  extraHits(): readonly PlayedHit[] {
    return this.extras;
  }

  private extra(hit: PlayedHit): MatchEvent {
    this.extras.push(hit);
    return { kind: "extra", hit };
  }
}

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
  /** Extra hits that were hi-hat mix-ups, counted among `extra`. */
  hihat: HihatMixups;
  /** Why the other extra hits were extra (with the hi-hat mix-ups, these add up to `extra`). */
  extraReasons: ExtraReasons;
}

/** Why a hit matched no note, so the results can explain extra hits instead of just counting them. */
export interface ExtraReasons {
  /** A drum that isn't written at that moment, while other notes are (open/closed hi-hat mix-ups are counted apart). */
  wrongDrum: number;
  /** A second hit on a note that was already played. */
  twice: number;
  /** Not near any note: too early or too late for every note on that drum. */
  farFromNotes: number;
}

/**
 * Hi-hat hits that landed in a hi-hat note's window but sounded the other
 * way: open where the music says closed (usually a foot resting loosely on
 * the pedal), or closed where it says open. They're scored as extra hits,
 * like any wrong voice; this only explains them.
 */
export interface HihatMixups {
  openInsteadOfClosed: number;
  closedInsteadOfOpen: number;
}

/** Hi-hat zones that sound open. */
function isOpenZone(zone: string | null): boolean {
  return zone !== null && zone.includes("open");
}

/** Whether a played hit can count for an expected note, ignoring timing. */
export function voiceMatches(note: Pick<ExpectedNote, "pad" | "open">, hit: PlayedHit): boolean {
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
  private readonly mixups: HihatMixups = { openInsteadOfClosed: 0, closedInsteadOfOpen: 0 };
  private readonly reasons: ExtraReasons = { wrongDrum: 0, twice: 0, farFromNotes: 0 };
  /**
   * The widest window. Windows differ per note, so window starts aren't in time
   * order; scans stop once a note is further away than any window could reach.
   */
  private maxWindowMs: number;
  private readonly list: ExpectedNote[];

  constructor(notes: readonly ExpectedNote[], private readonly scoring: ScoringOptions) {
    this.list = [...notes];
    this.results = notes.map(() => ({ status: "pending" }));
    this.maxWindowMs = notes.reduce((max, n) => Math.max(max, n.windowMs), 0);
  }

  /** The notes being matched, in time order. */
  get notes(): readonly ExpectedNote[] {
    return this.list;
  }

  /**
   * Adds a note after the others (a song's notes are added as the song gets
   * near them). Its id must be the next position and it must not come before
   * the last note.
   */
  add(note: ExpectedNote): void {
    const last = this.list.at(-1);
    if (note.id !== this.list.length || (last && note.time < last.time)) {
      throw new Error("Notes are added in time order, with the next id");
    }
    this.list.push(note);
    this.results.push({ status: "pending" });
    this.maxWindowMs = Math.max(this.maxWindowMs, note.windowMs);
  }

  /**
   * Whether a hit lands in any note's window, on any pad and whatever that
   * note's result: for telling a wrong drum from a stray hit after hit()
   * called it an extra.
   */
  nearAnyNote(hit: PlayedHit): boolean {
    const time = hit.time - this.scoring.latencyOffsetMs;
    for (const note of this.list) {
      if (note.time - this.maxWindowMs > time) break;
      if (Math.abs(time - note.time) <= note.windowMs) return true;
    }
    return false;
  }

  resultOf(note: ExpectedNote): NoteResult {
    return this.results[note.id];
  }

  /** Matches one hit. Call tick() first so notes whose window passed are already resolved. */
  hit(hit: PlayedHit): MatchEvent {
    const time = hit.time - this.scoring.latencyOffsetMs;
    let best: ExpectedNote | null = null;
    /** A pending hi-hat note in reach that this hit would match if it were open (or closed) instead. */
    let otherVoice: ExpectedNote | null = null;
    // Windows on a pad don't overlap, so at most one note on this pad contains the hit.
    // Scan from the cursor while notes could still reach back to this hit.
    for (let i = this.cursor; i < this.list.length; i++) {
      const note = this.list[i];
      if (note.time - this.maxWindowMs > time) break;
      if (Math.abs(time - note.time) <= note.windowMs) {
        if (voiceMatches(note, hit)) {
          best = note;
          break;
        }
        if (!otherVoice && note.pad === "hihat" && hit.pad === "hihat" && this.results[note.id].status === "pending") {
          otherVoice = note;
        }
      }
    }
    if (!best) {
      if (otherVoice) {
        if (otherVoice.open) this.mixups.closedInsteadOfOpen++;
        else this.mixups.openInsteadOfClosed++;
      } else if (this.nearAnyNote(hit)) {
        this.reasons.wrongDrum++;
      } else {
        this.reasons.farFromNotes++;
      }
      return this.extra(hit);
    }

    const deltaMs = time - best.time;
    const current = this.results[best.id];
    if (current.status === "hit") {
      // A flam's other stroke: keep whichever is closer to the beat.
      if (!best.flam) {
        this.reasons.twice++;
        return this.extra(hit);
      }
      if (Math.abs(deltaMs) < Math.abs(current.deltaMs)) {
        this.results[best.id] = hitResult(deltaMs, classify(deltaMs, this.scoring.toleranceMs), hit.velocity);
      }
      return { kind: "flamStroke", note: best };
    }
    if (current.status === "missed") {
      this.reasons.farFromNotes++;
      return this.extra(hit);
    }

    const verdict = classify(deltaMs, this.scoring.toleranceMs);
    this.results[best.id] = hitResult(deltaMs, verdict, hit.velocity);
    return { kind: "hit", note: best, deltaMs, verdict };
  }

  /** Resolves notes whose window has fully passed by `now` (performance.now() ms): unhit ones are missed. */
  tick(now: number): MatchEvent[] {
    const corrected = now - this.scoring.latencyOffsetMs;
    const events: MatchEvent[] = [];
    for (let i = this.cursor; i < this.list.length; i++) {
      const note = this.list[i];
      if (note.time - this.maxWindowMs > corrected) break;
      if (this.results[note.id].status === "pending" && note.time + note.windowMs < corrected) {
        this.results[note.id] = { status: "missed" };
        events.push({ kind: "missed", note });
      }
    }
    while (this.cursor < this.list.length && this.results[this.cursor].status !== "pending") this.cursor++;
    return events;
  }

  summary(): MatchSummary {
    const s: MatchSummary = {
      expected: this.list.length,
      hit: 0,
      onTime: 0,
      early: 0,
      late: 0,
      missed: 0,
      extra: this.extras.length,
      pending: 0,
      hihat: { ...this.mixups },
      extraReasons: { ...this.reasons },
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

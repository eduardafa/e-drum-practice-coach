/**
 * One play-along run: a bar of count-in, then the exercise repeated a set
 * number of times, scored note by note.
 *
 * The session doesn't own a clock. The coach tells it when the count-in bar
 * ends (begin), passes every hit in (hit), and calls tick(now) regularly so
 * notes whose window has passed are marked missed. Pure, so a whole session
 * can be tested with made-up times.
 */
import type { Exercise } from "../exercises/types";
import type { ScoringOptions } from "../timing/grid";
import { NoteMatcher, type MatchEvent, type NoteResult, type PlayedHit } from "./matcher";
import { summarize, type SessionResults } from "./results";
import { buildTimeline, DEFAULT_MAX_WINDOW_MS, type ExpectedNote } from "./timeline";

export type SessionPhase = "countIn" | "playing" | "done";

/** Session lengths offered, in loops of the exercise. */
export const SESSION_LOOPS = [2, 4, 8, 16] as const;
export const DEFAULT_SESSION_LOOPS = 4;

export class PlayAlongSession {
  phase: SessionPhase = "countIn";
  private matcher: NoteMatcher | null = null;
  private notes: readonly ExpectedNote[] = [];
  /** The first loop as it will be played, known from the count-in, for showing what comes first. */
  private previewNotes: readonly ExpectedNote[] = [];
  /** When the last note's window closes: the session ends after this, so late strokes still count. */
  private endMs = Infinity;

  constructor(
    readonly exercise: Exercise,
    readonly loops: number,
    /** Tempo, counting the exercise's beat unit. */
    readonly bpm: number,
    private readonly scoring: ScoringOptions,
  ) {}

  /**
   * The count-in has started and the first loop will start at `startMs`: plans
   * that loop for display (the kit view's cues) without scoring anything yet.
   */
  preview(startMs: number): void {
    if (this.phase !== "countIn") return;
    this.previewNotes = buildTimeline(this.exercise, {
      startMs,
      bpm: this.bpm,
      loops: 1,
      maxWindowMs: DEFAULT_MAX_WINDOW_MS,
    });
  }

  /** The notes to show as upcoming: the planned first loop during the count-in, the whole run once playing. */
  upcomingNotes(): readonly ExpectedNote[] {
    if (this.phase === "countIn") return this.previewNotes;
    return this.phase === "playing" ? this.notes : [];
  }

  /** The count-in is over: the first loop starts at `startMs` (performance.now() ms). */
  begin(startMs: number): void {
    if (this.phase !== "countIn") return;
    this.notes = buildTimeline(this.exercise, {
      startMs,
      bpm: this.bpm,
      loops: this.loops,
      maxWindowMs: DEFAULT_MAX_WINDOW_MS,
    });
    this.matcher = new NoteMatcher(this.notes, this.scoring);
    this.endMs = Math.max(...this.notes.map((n) => n.time + n.windowMs)) + this.scoring.latencyOffsetMs;
    this.phase = "playing";
  }

  /** Scores a hit. Hits during the count-in or after the end are ignored. */
  hit(hit: PlayedHit): MatchEvent | null {
    if (this.phase !== "playing" || !this.matcher) return null;
    this.matcher.tick(hit.time);
    return this.matcher.hit(hit);
  }

  /** Marks notes whose window has passed as missed, and ends the session after the last one. */
  tick(now: number): MatchEvent[] {
    if (this.phase !== "playing" || !this.matcher) return [];
    const events = this.matcher.tick(now);
    if (now > this.endMs && this.matcher.summary().pending === 0) this.phase = "done";
    return events;
  }

  /** The loop being played, from 0, or null outside the playing phase. */
  currentLoop(now: number): number | null {
    if (this.phase !== "playing") return null;
    const upcoming = this.notes.find((n) => n.time >= now - this.scoring.latencyOffsetMs);
    return upcoming?.loop ?? this.loops - 1;
  }

  /** Results over the notes resolved so far: live during the session, final once it's done. */
  results(): SessionResults {
    const matcher = this.matcher;
    const summary = matcher?.summary();
    return summarize(
      this.notes,
      (note) => matcher?.resultOf(note) ?? { status: "pending" },
      summary?.extra ?? 0,
      this.scoring.toleranceMs,
      summary?.hihat,
    );
  }

  /** Every expected note with its result, and the hits that matched no note: what practice history keeps. */
  outcomes(): { notes: { note: ExpectedNote; result: NoteResult }[]; extraHits: readonly PlayedHit[] } {
    const matcher = this.matcher;
    return {
      notes: this.notes.map((note) => ({ note, result: matcher?.resultOf(note) ?? { status: "pending" } })),
      extraHits: matcher?.extraHits() ?? [],
    };
  }

  /**
   * The latest result for each note of the exercise (by index into
   * exercise.notes): this loop's if resolved, otherwise the previous loop's,
   * so the staff shows how each note went last time until it's played again.
   */
  latestResults(): Map<number, NoteResult> {
    const latest = new Map<number, NoteResult>();
    if (!this.matcher) return latest;
    for (const note of this.notes) {
      const result = this.matcher.resultOf(note);
      if (result.status !== "pending") latest.set(note.index, result);
    }
    return latest;
  }
}

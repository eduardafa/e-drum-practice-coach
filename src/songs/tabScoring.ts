/**
 * Scores each note of a drum tab while the drummer plays along to the song:
 * the right pad, in time. The exercises' matcher does the matching (a hit
 * only counts for a note on its own pad, within that note's window); this
 * feeds it the tab's notes as the song gets near them, on the same clock as
 * the hits, and tells a wrong drum from a stray hit: a note missed while a
 * hit on another pad (or the other hi-hat sound) landed in its window was a
 * wrong drum. Decided when the note is missed, since a beat often has two
 * notes (snare and hi-hat) and one hit can't say which it was meant for.
 *
 * Pure apart from the time mapping it's handed, so it's tested with made-up times.
 */
import { NoteMatcher, voiceMatches, type MatchEvent, type NoteResult, type PlayedHit } from "../playalong/matcher";
import { DEFAULT_MAX_WINDOW_MS, type ExpectedNote } from "../playalong/timeline";
import type { ScoringOptions } from "../timing/grid";
import type { PlacedNote } from "./drumTab";

/**
 * Each note's window in seconds, by position in `notes` (sorted by time):
 * half the gap to the nearest note on the same pad, capped, as for exercises,
 * so windows on a pad never overlap.
 */
export function tabWindows(notes: readonly PlacedNote[], maxSec = DEFAULT_MAX_WINDOW_MS / 1000): number[] {
  const windows = notes.map(() => maxSec);
  const lastByPad = new Map<string, number>();
  notes.forEach((note, i) => {
    const prev = lastByPad.get(note.pad);
    if (prev !== undefined) {
      const half = (note.time - notes[prev].time) / 2;
      windows[prev] = Math.min(windows[prev], half);
      windows[i] = Math.min(windows[i], half);
    }
    lastByPad.set(note.pad, i);
  });
  return windows;
}

export interface TabScore {
  /** Notes whose window has closed (hit or missed). */
  played: number;
  hit: number;
  onTime: number;
  early: number;
  late: number;
  missed: number;
  /** Notes missed because another drum was hit in their place. */
  wrongDrum: number;
  /** Hits near no note at all. */
  extra: number;
}

/** A tab note's result, and whether another drum was hit in its place. */
export interface TabNoteResult {
  result: NoteResult;
  wrongDrum: boolean;
}

/** How a written note went, for its mark on the staff: not yet, a wrong drum, missed, or the hit's timing. */
export type TabMark = "pending" | "wrongDrum" | "missed" | "onTime" | "early" | "late";

/**
 * The mark for a written note standing for these tab notes (usually one; two
 * strokes snapped to one spot share a note): a miss shows over a hit, since
 * part of it went wrong, and a wrong drum over a plain miss.
 */
export function tabMark(ids: readonly number[], results: ReadonlyMap<number, TabNoteResult>): TabMark {
  let mark: TabMark = "pending";
  for (const id of ids) {
    const r = results.get(id);
    if (!r || r.result.status === "pending") continue;
    if (r.result.status === "missed") {
      if (r.wrongDrum) return "wrongDrum";
      mark = "missed";
    } else if (mark === "pending") {
      mark = r.result.verdict;
    }
  }
  return mark;
}

export class SongTabScoring {
  private readonly matcher: NoteMatcher;
  private readonly windows: number[];
  /** Next note (position in `notes`) to hand to the matcher. */
  private next: number;
  /** The tab note id behind each of the matcher's notes. */
  private readonly tabIds: number[] = [];
  /** And the other way: the matcher's position for each tab note id handed to it. */
  private readonly positionOf = new Map<number, number>();
  /** Tab note ids missed with another drum hit in their window. */
  private readonly wrong = new Set<number>();
  /** Extra hits that landed in some note's window: wrong drums, not stray hits. */
  private readonly wrongHits: PlayedHit[] = [];
  private strayHits = 0;

  constructor(
    private readonly notes: readonly PlacedNote[],
    private readonly scoring: ScoringOptions,
    /** Song time (seconds) to score from: notes before it are left out. */
    fromSec: number,
  ) {
    this.matcher = new NoteMatcher([], scoring);
    this.windows = tabWindows(notes);
    const first = notes.findIndex((n, i) => n.time + this.windows[i] >= fromSec);
    this.next = first === -1 ? notes.length : first;
  }

  /**
   * Hands the matcher every note up to `untilSec` of song time.
   * `toPerformanceMs` maps song time to performance.now() ms, or null if it
   * can't yet (the note is then tried again next time).
   */
  plan(untilSec: number, toPerformanceMs: (songSec: number) => number | null): void {
    while (this.next < this.notes.length && this.notes[this.next].time <= untilSec) {
      const note = this.notes[this.next];
      const time = toPerformanceMs(note.time);
      if (time === null) return;
      const expected: ExpectedNote = {
        id: this.tabIds.length,
        loop: 0,
        index: note.id,
        time,
        pad: note.pad,
        open: note.open,
        flam: false,
        dynamic: "normal",
        windowMs: this.windows[this.next] * 1000,
      };
      this.matcher.add(expected);
      this.positionOf.set(note.id, this.tabIds.length);
      this.tabIds.push(note.id);
      this.next++;
    }
  }

  /** Scores a hit (performance.now() ms, like the MIDI timestamp). */
  hit(hit: PlayedHit): MatchEvent {
    this.tick(hit.time);
    const event = this.matcher.hit(hit);
    if (event.kind === "extra") {
      if (this.matcher.nearAnyNote(hit)) this.wrongHits.push(hit);
      else this.strayHits++;
    }
    return event;
  }

  /** Marks notes whose window has passed as missed (a wrong drum if one was hit in it). Call often. */
  tick(now: number): void {
    for (const event of this.matcher.tick(now)) {
      if (event.kind !== "missed") continue;
      const { note } = event;
      // Each wrong hit explains one missed note at most.
      const i = this.wrongHits.findIndex(
        (h) => Math.abs(h.time - this.scoring.latencyOffsetMs - note.time) <= note.windowMs && !voiceMatches(note, h),
      );
      if (i === -1) continue;
      this.wrongHits.splice(i, 1);
      this.wrong.add(note.index);
    }
    // Wrong hits older than any open window can't matter again.
    const oldest = now - this.scoring.latencyOffsetMs - DEFAULT_MAX_WINDOW_MS * 2;
    while (this.wrongHits.length > 0 && this.wrongHits[0].time - this.scoring.latencyOffsetMs < oldest) this.wrongHits.shift();
  }

  /** How a tab note (by its id) went so far, or null if it isn't being scored. */
  resultOf(tabId: number): TabNoteResult | null {
    const index = this.positionOf.get(tabId);
    if (index === undefined) return null;
    const note = this.matcher.notes[index];
    return { result: this.matcher.resultOf(note), wrongDrum: this.wrong.has(tabId) };
  }

  /** Every scored tab note's result, by tab note id. */
  results(): Map<number, TabNoteResult> {
    const out = new Map<number, TabNoteResult>();
    this.matcher.notes.forEach((note, i) => {
      const id = this.tabIds[i];
      out.set(id, { result: this.matcher.resultOf(note), wrongDrum: this.wrong.has(id) });
    });
    return out;
  }

  score(): TabScore {
    const s = this.matcher.summary();
    return {
      played: s.hit + s.missed,
      hit: s.hit,
      onTime: s.onTime,
      early: s.early,
      late: s.late,
      missed: s.missed,
      wrongDrum: this.wrong.size,
      extra: this.strayHits,
    };
  }
}

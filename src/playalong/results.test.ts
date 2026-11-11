import { describe, expect, it } from "vitest";
import { findExercise } from "../exercises/library";
import type { Exercise } from "../exercises/types";
import type { NoteResult } from "./matcher";
import { partialCredit, summarize } from "./results";
import { buildTimeline, DEFAULT_MAX_WINDOW_MS, type ExpectedNote } from "./timeline";

const TOLERANCE = 20;

function exercise(id: string): Exercise {
  const found = findExercise(id);
  if (!found) throw new Error(`missing exercise ${id}`);
  return found;
}

// Money beat, one loop: 8 hi-hats, 2 snares, 2 kicks = 12 notes.
const notes = buildTimeline(exercise("rock-8ths"), { startMs: 0, bpm: 120, loops: 1, maxWindowMs: DEFAULT_MAX_WINDOW_MS });

const hit = (deltaMs: number): NoteResult => ({
  status: "hit",
  deltaMs,
  verdict: Math.abs(deltaMs) <= TOLERANCE ? "onTime" : deltaMs < 0 ? "early" : "late",
});
const all = (result: NoteResult) => () => result;
/** Halfway through: the first six notes hit on time, the rest still to come. */
const halfway = (note: ExpectedNote): NoteResult => (note.index < 6 ? hit(0) : { status: "pending" });
const kickLate = (note: ExpectedNote): NoteResult => (note.pad === "kick" ? hit(30) : hit(0));
const alternating = (note: ExpectedNote): NoteResult => hit(note.index % 2 === 0 ? -10 : 10);

describe("partialCredit", () => {
  it("gives full credit inside the on-time window", () => {
    expect(partialCredit(0, 20)).toBe(1);
    expect(partialCredit(-20, 20)).toBe(1);
  });

  it("falls in a straight line to nothing at three times the window", () => {
    expect(partialCredit(40, 20)).toBe(0.5);
    expect(partialCredit(-50, 20)).toBe(0.25);
    expect(partialCredit(60, 20)).toBe(0);
    expect(partialCredit(95, 20)).toBe(0);
  });
});

describe("summarize", () => {
  it("a perfect run scores 100% in both modes", () => {
    const r = summarize(notes, all(hit(0)), 0, TOLERANCE);
    expect(r.accuracy).toEqual({ partial: 1, strict: 1 });
    expect(r).toMatchObject({ notes: 12, onTime: 12, missed: 0, extra: 0, meanDeltaMs: 0, spreadMs: 0 });
  });

  it("all misses score 0%, with no timing", () => {
    const r = summarize(notes, all({ status: "missed" }), 0, TOLERANCE);
    expect(r.accuracy).toEqual({ partial: 0, strict: 0 });
    expect(r).toMatchObject({ missed: 12, meanDeltaMs: null, spreadMs: null });
  });

  it("extra hits lower both modes", () => {
    const r = summarize(notes, all(hit(0)), 4, TOLERANCE);
    expect(r.accuracy.strict).toBeCloseTo(12 / 16);
    expect(r.accuracy.partial).toBeCloseTo(12 / 16);
  });

  it("slightly late hits: nothing in strict, half credit in partial", () => {
    const r = summarize(notes, all(hit(40)), 0, TOLERANCE);
    expect(r.accuracy).toEqual({ partial: 0.5, strict: 0 });
    expect(r).toMatchObject({ late: 12, meanDeltaMs: 40 });
  });

  it("only counts resolved notes, so it works live during a session", () => {
    const r = summarize(notes, halfway, 0, TOLERANCE);
    expect(r.notes).toBe(6);
    expect(r.accuracy.strict).toBe(1);
  });

  it("is null before anything has happened", () => {
    expect(summarize(notes, all({ status: "pending" }), 0, TOLERANCE).accuracy).toEqual({ partial: null, strict: null });
  });

  it("breaks results down per pad, so a dragging kick shows up", () => {
    const r = summarize(notes, kickLate, 0, TOLERANCE);
    expect(r.pads.map((p) => p.pad).toSorted()).toEqual(["hihat", "kick", "snare"]);
    expect(r.pads.find((p) => p.pad === "kick")).toMatchObject({ notes: 2, late: 2, meanDeltaMs: 30 });
    expect(r.pads.find((p) => p.pad === "hihat")).toMatchObject({ notes: 8, onTime: 8, meanDeltaMs: 0 });
  });

  it("measures consistency as the spread of the hits", () => {
    const r = summarize(notes, alternating, 0, TOLERANCE);
    expect(r.meanDeltaMs).toBe(0);
    expect(r.spreadMs).toBeCloseTo(Math.sqrt((12 * 100) / 11));
  });
});

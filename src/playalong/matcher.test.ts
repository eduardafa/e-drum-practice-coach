import { describe, expect, it } from "vitest";
import { findExercise } from "../exercises/library";
import { fromGrid } from "../exercises/grid";
import type { Exercise } from "../exercises/types";
import { NoteMatcher, voiceMatches, type PlayedHit } from "./matcher";
import { buildTimeline, DEFAULT_MAX_WINDOW_MS, type ExpectedNote } from "./timeline";

const SCORING = { toleranceMs: 20, latencyOffsetMs: 0 };

function exercise(id: string): Exercise {
  const found = findExercise(id);
  if (!found) throw new Error(`missing exercise ${id}`);
  return found;
}

function setup(ex: Exercise, scoring = SCORING, bpm = 120, loops = 1) {
  const notes = buildTimeline(ex, { startMs: 1000, bpm, loops, maxWindowMs: DEFAULT_MAX_WINDOW_MS });
  return { notes, matcher: new NoteMatcher(notes, scoring) };
}

const on = (note: ExpectedNote, offset = 0, zone: string | null = "head"): PlayedHit => ({
  pad: note.pad,
  zone: note.pad === "hihat" ? (note.open ? "open" : "closed") : zone,
  time: note.time + offset,
});

// Rock beat at 120 BPM: snare on 2 and 4 is at 1500 and 2500 ms.
const rock = () => setup(exercise("rock-8ths"));
const firstSnare = (notes: ExpectedNote[]) => {
  const note = notes.find((n) => n.pad === "snare");
  if (!note) throw new Error("no snare");
  return note;
};

describe("NoteMatcher: timing", () => {
  it("scores an on-time hit", () => {
    const { notes, matcher } = rock();
    const snare = firstSnare(notes);
    expect(matcher.hit(on(snare, 5))).toEqual({ kind: "hit", note: snare, deltaMs: 5, verdict: "onTime" });
  });

  it("scores early and late hits by the tolerance", () => {
    const { notes, matcher } = rock();
    const [s1, s2] = notes.filter((n) => n.pad === "snare");
    expect(matcher.hit(on(s1, -35))).toMatchObject({ kind: "hit", verdict: "early", deltaMs: -35 });
    expect(matcher.hit(on(s2, 40))).toMatchObject({ kind: "hit", verdict: "late", deltaMs: 40 });
  });

  it("removes the latency offset before scoring", () => {
    const { notes, matcher } = setup(exercise("rock-8ths"), { toleranceMs: 20, latencyOffsetMs: 30 });
    expect(matcher.hit(on(firstSnare(notes), 30))).toMatchObject({ kind: "hit", deltaMs: 0, verdict: "onTime" });
  });
});

describe("NoteMatcher: misses and extras", () => {
  it("marks a note missed once its window has passed", () => {
    const { notes, matcher } = rock();
    const snare = firstSnare(notes);
    expect(matcher.tick(snare.time + snare.windowMs - 1).some((e) => e.kind === "missed" && e.note === snare)).toBe(false);
    const events = matcher.tick(snare.time + snare.windowMs + 1);
    expect(events).toContainEqual({ kind: "missed", note: snare });
    expect(matcher.resultOf(snare)).toEqual({ status: "missed" });
  });

  it("counts a hit outside every window as extra", () => {
    const { notes, matcher } = rock();
    // Halfway between beats 1 and 2 there's a hi-hat note, but no snare.
    expect(matcher.hit({ pad: "snare", zone: "head", time: firstSnare(notes).time - 250 })).toMatchObject({
      kind: "extra",
    });
  });

  it("counts a hit on the wrong pad as extra, and leaves the note to be missed", () => {
    const { notes, matcher } = rock();
    const snare = firstSnare(notes);
    expect(matcher.hit({ pad: "tom1", zone: "head", time: snare.time })).toMatchObject({ kind: "extra" });
    expect(matcher.tick(snare.time + 200)).toContainEqual({ kind: "missed", note: snare });
  });

  it("counts a second hit on a normal note as extra", () => {
    const { notes, matcher } = rock();
    const snare = firstSnare(notes);
    matcher.hit(on(snare));
    expect(matcher.hit(on(snare, 10))).toMatchObject({ kind: "extra" });
  });

  it("counts an unmapped hit as extra", () => {
    const { notes, matcher } = rock();
    expect(matcher.hit({ pad: null, zone: null, time: notes[0].time })).toMatchObject({ kind: "extra" });
  });
});

describe("NoteMatcher: zones", () => {
  it("accepts snare rim and cross-stick as snare", () => {
    const { notes, matcher } = rock();
    const [s1, s2] = notes.filter((n) => n.pad === "snare");
    expect(matcher.hit({ pad: "snare", zone: "rim", time: s1.time })).toMatchObject({ kind: "hit" });
    expect(matcher.hit({ pad: "snare", zone: "cross-stick", time: s2.time })).toMatchObject({ kind: "hit" });
  });

  it("treats open and closed hi-hat as different notes", () => {
    const { notes, matcher } = setup(exercise("open-hihat"));
    const open = notes.find((n) => n.open);
    const closed = notes.find((n) => n.pad === "hihat" && !n.open);
    if (!open || !closed) throw new Error("fixture");
    expect(matcher.hit({ pad: "hihat", zone: "closed", time: open.time })).toMatchObject({ kind: "extra" });
    expect(matcher.hit({ pad: "hihat", zone: "open edge", time: open.time })).toMatchObject({ kind: "hit" });
    expect(matcher.hit({ pad: "hihat", zone: "open", time: closed.time })).toMatchObject({ kind: "extra" });
  });

  it("checks voices independently of timing", () => {
    const note: ExpectedNote = { id: 0, loop: 0, index: 0, time: 0, pad: "hihat", open: false, flam: false, dynamic: "normal", windowMs: 50 };
    expect(voiceMatches(note, { pad: "hihat", zone: "closed edge", time: 0 })).toBe(true);
    expect(voiceMatches(note, { pad: "hihat", zone: "open", time: 0 })).toBe(false);
    expect(voiceMatches(note, { pad: "ride", zone: "bow", time: 0 })).toBe(false);
  });
});

describe("NoteMatcher: fast notes and flams", () => {
  it("keeps sixteenths on one pad apart at a fast tempo", () => {
    // Single strokes at 160 BPM: sixteenths are 93.75 ms apart, windows about 47 ms.
    const { notes, matcher } = setup(exercise("single-strokes"), SCORING, 160);
    const [a, b, c] = notes;
    // Hit a late and b early: each must land on its own note, not on the neighbour.
    expect(matcher.hit(on(a, 40))).toMatchObject({ kind: "hit", note: a, deltaMs: 40 });
    expect(matcher.hit(on(b, -40))).toMatchObject({ kind: "hit", note: b, deltaMs: -40 });
    expect(matcher.hit(on(c, 0))).toMatchObject({ kind: "hit", note: c });
  });

  it("finds a note with a wide window behind notes with narrow ones", () => {
    // Fast hi-hat sixteenths (narrow windows) next to a lone kick (wide window).
    const ex = fromGrid({
      id: "window-mix",
      name: "Window mix",
      category: "groove",
      description: "Test.",
      timeSignature: { beats: 4, unit: 4 },
      bars: 1,
      tempo: { min: 60, suggested: 120, max: 200 },
      stepsPerBar: 16,
      lanes: { hihat: "xxxx xxxx xxxx xxxx", kick: "---- x--- ---- ----" },
    });
    const { notes, matcher } = setup(ex);
    const kick = notes.find((n) => n.pad === "kick");
    if (!kick) throw new Error("fixture");
    expect(matcher.hit({ pad: "kick", zone: "head", time: kick.time - 90 })).toMatchObject({ kind: "hit", note: kick });
  });

  it("scores the stroke of a flam closest to the beat and absorbs the other", () => {
    const { notes, matcher } = setup(exercise("flam-taps"));
    const flam = notes.find((n) => n.flam);
    if (!flam) throw new Error("fixture");
    // Grace note 30 ms early, main stroke 4 ms late.
    expect(matcher.hit(on(flam, -30))).toMatchObject({ kind: "hit", deltaMs: -30 });
    expect(matcher.hit(on(flam, 4))).toEqual({ kind: "flamStroke", note: flam });
    expect(matcher.resultOf(flam)).toEqual({ status: "hit", deltaMs: 4, verdict: "onTime" });
    expect(matcher.summary().extra).toBe(0);
  });
});

describe("NoteMatcher: a whole run", () => {
  it("summarises a loop with every kind of outcome", () => {
    const { notes, matcher } = setup(exercise("rock-8ths"), SCORING, 120, 2);
    // Play everything perfectly except: skip the first snare, rush the first kick, add one stray crash.
    const skipped = firstSnare(notes);
    const rushed = notes.find((n) => n.pad === "kick");
    for (const note of notes) {
      matcher.tick(note.time);
      if (note === skipped) continue;
      matcher.hit(on(note, note === rushed ? -45 : 3));
    }
    matcher.hit({ pad: "crash", zone: "bow", time: notes[5].time });
    matcher.tick((notes.at(-1)?.time ?? 0) + 1000);
    expect(matcher.summary()).toEqual({
      expected: notes.length,
      hit: notes.length - 1,
      onTime: notes.length - 2,
      early: 1,
      late: 0,
      missed: 1,
      extra: 1,
      pending: 0,
    });
  });
});

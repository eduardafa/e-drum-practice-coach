import { describe, expect, it } from "vitest";
import { findExercise } from "../exercises/library";
import type { Exercise } from "../exercises/types";
import { PlayAlongSession } from "../playalong/session";
import { parseRecord, sessionRecord, songBars, songRecord, trainerRecord, type RecordMeta } from "./record";

const SCORING = { toleranceMs: 20, latencyOffsetMs: 0 };

function exercise(id: string): Exercise {
  const found = findExercise(id);
  if (!found) throw new Error(`missing exercise ${id}`);
  return found;
}

const META: RecordMeta = {
  id: "abc",
  start: Temporal.Instant.from("2026-11-11T18:30:00Z"),
  durationMs: 95_432.4,
  timeZone: "Europe/Lisbon",
};

/** One loop of the money beat at 120 BPM: every note on time, except the last snare missed, plus a stray tom. */
function playedSession(): PlayAlongSession {
  const session = new PlayAlongSession(exercise("rock-8ths"), 1, 120, SCORING);
  session.begin(10_000);
  for (let step = 0; step < 8; step++) {
    const time = 10_000 + step * 250;
    session.hit({ pad: "hihat", zone: "closed", time: time + 2, velocity: 70 });
    if (step === 0 || step === 4) session.hit({ pad: "kick", zone: null, time, velocity: 110 });
    if (step === 2) session.hit({ pad: "snare", zone: "head", time: time - 5, velocity: 100 });
  }
  session.hit({ pad: "tom1", zone: "head", time: 10_600, velocity: 50 });
  session.tick(12_500);
  return session;
}

function record() {
  const session = playedSession();
  return sessionRecord(META, {
    exercise: session.exercise,
    bpm: session.bpm,
    loops: session.loops,
    scoring: SCORING,
    results: session.results(),
    outcomes: session.outcomes(),
    trainerRunId: null,
  });
}

describe("sessionRecord", () => {
  it("keeps when, where and how long, as Temporal strings", () => {
    expect(record()).toMatchObject({
      v: 1,
      kind: "session",
      start: "2026-11-11T18:30:00Z",
      duration: "PT1M35.432S",
      timeZone: "Europe/Lisbon",
      exerciseId: "rock-8ths",
      exerciseName: "Money beat",
      bpm: 120,
      loops: 1,
    });
  });

  it("keeps the score and every note's outcome with its velocity", () => {
    const r = record();
    expect(r.counts).toEqual({ notes: 12, onTime: 11, early: 0, late: 0, missed: 1, extra: 1 });
    expect(r.notes).toHaveLength(12);
    expect(r.notes).toContainEqual([r.voices.findIndex((v) => v.pad === "snare"), 0, -5, 100]);
    expect(r.notes.filter((n) => n[2] === null)).toEqual([[r.voices.findLastIndex((v) => v.pad === "snare"), 0, null, null]]);
    expect(r.extras).toEqual([["tom1", 50]]);
    expect(r.voices[0]).toEqual({ pad: "hihat", dynamic: "normal", hand: null });
  });

  it("keeps each rudiment note's hand", () => {
    const session = new PlayAlongSession(exercise("paradiddle"), 1, 80, SCORING);
    const r = sessionRecord(META, {
      exercise: session.exercise,
      bpm: 80,
      loops: 1,
      scoring: SCORING,
      results: session.results(),
      outcomes: session.outcomes(),
      trainerRunId: "run-1",
    });
    expect(r.voices.map((v) => v.hand).join("")).toBe("RLRRLRLLRLRRLRLL");
    expect(r.trainerRunId).toBe("run-1");
  });

  it("keeps how often the click went quiet, and leaves it out when it never did (EDU-145)", () => {
    const session = playedSession();
    const input = {
      exercise: session.exercise,
      bpm: session.bpm,
      loops: session.loops,
      scoring: SCORING,
      results: session.results(),
      outcomes: session.outcomes(),
      trainerRunId: null,
    };
    expect(sessionRecord(META, { ...input, quietEvery: 4 }).quietEvery).toBe(4);
    expect(sessionRecord(META, { ...input, quietEvery: 0 })).not.toHaveProperty("quietEvery");
    expect(record()).not.toHaveProperty("quietEvery");
  });
});

describe("parseRecord", () => {
  it("reads back a session and a trainer record after a JSON round trip", () => {
    const s = record();
    expect(parseRecord(JSON.parse(JSON.stringify(s)))).toEqual(s);
    const t = trainerRecord(
      META,
      exercise("rock-8ths"),
      { startBpm: 60, targetBpm: 68, passMark: 0.9, failMark: 0.7, step: 4 },
      [
        { bpm: 60, accuracy: 0.95, outcome: "up" },
        { bpm: 64, accuracy: 0.92, outcome: "up" },
      ],
      "stopped",
    );
    expect(parseRecord(JSON.parse(JSON.stringify(t)))).toEqual(t);
    const quiet = { ...s, quietEvery: 4 };
    expect(parseRecord(JSON.parse(JSON.stringify(quiet)))).toEqual(quiet);
  });

  it("skips malformed records and newer versions", () => {
    const s = record();
    expect(parseRecord(null)).toBeNull();
    expect(parseRecord({ ...s, v: 2 })).toBeNull();
    expect(parseRecord({ ...s, start: "yesterday" })).toBeNull();
    expect(parseRecord({ ...s, timeZone: "Mars/Olympus" })).toBeNull();
    expect(parseRecord({ ...s, bpm: "fast" })).toBeNull();
    expect(parseRecord({ ...s, notes: [[1, 0, 3]] })).toBeNull();
    expect(parseRecord({ ...s, kind: "concert" })).toBeNull();
    expect(parseRecord({ ...s, quietEvery: "often" })).toBeNull();
  });
});

describe("song records (EDU-125)", () => {
  const input = {
    title: "Ghosts I",
    fingerprint: "8c-197gw",
    speed: 0.7,
    section: { start: 4.5046712, end: 12.5039456 },
    scoring: SCORING,
    scored: 41,
    onTime: 30,
    meanMs: 14.123,
    spreadMs: 29.456,
    tab: null,
    bars: [
      { bar: 6, start: 11.0047, end: 13.004, hits: 4, meanMs: 34.21, onTime: 0.5 },
      { bar: 7, start: 13.004, end: 15.0039, hits: 0, meanMs: null, onTime: null },
    ],
    loopRunId: "loop-1-abcd",
  };

  it("names the song by title and fingerprint, compacts the bars, and reads back after a JSON round trip", () => {
    const r = songRecord(META, input);
    expect(r).toMatchObject({ kind: "song", exerciseId: "song:8c-197gw", exerciseName: "Ghosts I", speed: 0.7, section: [4.505, 12.504] });
    expect(r.bars).toEqual([
      [6, 11.005, 13.004, 4, 34.2, 0.5],
      [7, 13.004, 15.004, 0, null, null],
    ]);
    expect(parseRecord(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(songBars(r)[0]).toEqual({ bar: 6, start: 11.005, end: 13.004, hits: 4, meanMs: 34.2, onTime: 0.5 });
  });

  it("keeps a drum tab's score, and no audio at all", () => {
    const tab = { played: 20, hit: 18, onTime: 15, early: 2, late: 1, missed: 2, wrongDrum: 1, extra: 3 };
    const r = songRecord(META, { ...input, tab, section: null, loopRunId: null });
    expect(parseRecord(JSON.parse(JSON.stringify(r)))).toMatchObject({ tab, section: null, loopRunId: null });
    expect(Object.keys(r)).not.toContain("audio");
  });

  it("rejects a malformed song record instead of breaking the history", () => {
    const r = songRecord(META, input);
    expect(parseRecord({ ...r, speed: 2 })).toBeNull();
    expect(parseRecord({ ...r, bars: [[1, 0, 2, 3]] })).toBeNull();
    expect(parseRecord({ ...r, tab: { played: 1 } })).toBeNull();
    expect(parseRecord({ ...r, fingerprint: "" })).toBeNull();
  });

  it("is skipped by a kind this build doesn't know, as older builds skip song records", () => {
    expect(parseRecord({ ...songRecord(META, input), kind: "lesson" })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { findExercise } from "../exercises/library";
import type { Exercise } from "../exercises/types";
import { PlayAlongSession } from "./session";

const SCORING = { toleranceMs: 20, latencyOffsetMs: 0 };

function exercise(id: string): Exercise {
  const found = findExercise(id);
  if (!found) throw new Error(`missing exercise ${id}`);
  return found;
}

// Money beat at 120 BPM: an eighth note every 250 ms, a loop every 2000 ms.
const START = 10_000;
const EIGHTH = 250;
const LOOP = 2000;

/** Plays every note of the money beat for `loops` loops, `offset` ms late. */
function playMoneyBeat(session: PlayAlongSession, loops: number, offset = 0): void {
  for (let loop = 0; loop < loops; loop++) {
    for (let step = 0; step < 8; step++) {
      const time = START + loop * LOOP + step * EIGHTH + offset;
      session.hit({ pad: "hihat", zone: "closed", time });
      if (step === 0 || step === 4) session.hit({ pad: "kick", zone: null, time });
      if (step === 2 || step === 6) session.hit({ pad: "snare", zone: "head", time });
    }
  }
}

describe("PlayAlongSession", () => {
  it("ignores hits during the count-in", () => {
    const session = new PlayAlongSession(exercise("rock-8ths"), 2, 120, SCORING);
    expect(session.hit({ pad: "snare", zone: "head", time: 9000 })).toBeNull();
    expect(session.phase).toBe("countIn");
  });

  it("scores a perfect run and ends after the last note's window", () => {
    const session = new PlayAlongSession(exercise("rock-8ths"), 2, 120, SCORING);
    session.begin(START);
    playMoneyBeat(session, 2);
    session.tick(START + 2 * LOOP - EIGHTH + 10);
    expect(session.phase).toBe("playing");
    session.tick(START + 2 * LOOP + 200);
    expect(session.phase).toBe("done");
    const r = session.results();
    expect(r).toMatchObject({ notes: 24, onTime: 24, missed: 0, extra: 0 });
    expect(r.accuracy).toEqual({ partial: 1, strict: 1 });
  });

  it("marks notes nobody played as missed", () => {
    const session = new PlayAlongSession(exercise("rock-8ths"), 1, 120, SCORING);
    session.begin(START);
    session.tick(START + LOOP + 200);
    expect(session.phase).toBe("done");
    expect(session.results()).toMatchObject({ missed: 12, accuracy: { partial: 0, strict: 0 } });
  });

  it("gives partial credit for a slightly late run", () => {
    const session = new PlayAlongSession(exercise("rock-8ths"), 1, 120, SCORING);
    session.begin(START);
    playMoneyBeat(session, 1, 40);
    session.tick(START + LOOP + 200);
    expect(session.results().accuracy).toEqual({ partial: 0.5, strict: 0 });
  });

  it("knows which loop is playing", () => {
    const session = new PlayAlongSession(exercise("rock-8ths"), 3, 120, SCORING);
    expect(session.currentLoop(START)).toBeNull();
    session.begin(START);
    expect(session.currentLoop(START + 100)).toBe(0);
    expect(session.currentLoop(START + LOOP + 100)).toBe(1);
  });

  it("keeps the latest result of each note across loops", () => {
    const session = new PlayAlongSession(exercise("rock-8ths"), 2, 120, SCORING);
    session.begin(START);
    playMoneyBeat(session, 1);
    // Second loop: only the first hi-hat, 50 ms late.
    session.hit({ pad: "hihat", zone: "closed", time: START + LOOP + 50 });
    session.tick(START + LOOP + 100);
    const latest = session.latestResults();
    expect(latest.size).toBe(12);
    expect(latest.get(0)).toMatchObject({ status: "hit", verdict: "late" });
    expect(latest.get(2)).toMatchObject({ status: "hit", verdict: "onTime" });
  });
});

describe("PlayAlongSession: upcoming notes for the kit view", () => {
  it("shows the planned first loop during the count-in, the whole run while playing, and nothing after", () => {
    const step1 = findExercise("first-hihat-quarters");
    if (!step1) throw new Error("missing exercise");
    const session = new PlayAlongSession(step1, 2, 60, { toleranceMs: 35, latencyOffsetMs: 0 });
    expect(session.upcomingNotes()).toEqual([]);
    session.preview(5000);
    expect(session.upcomingNotes().map((n) => n.time)).toEqual([5000, 6000, 7000, 8000]);
    session.begin(5000);
    expect(session.upcomingNotes()).toHaveLength(8);
    session.tick(20_000);
    expect(session.phase).toBe("done");
    expect(session.upcomingNotes()).toEqual([]);
  });

  it("ignores a preview once playing", () => {
    const step1 = findExercise("first-hihat-quarters");
    if (!step1) throw new Error("missing exercise");
    const session = new PlayAlongSession(step1, 1, 60, { toleranceMs: 35, latencyOffsetMs: 0 });
    session.begin(1000);
    session.preview(9000);
    expect(session.upcomingNotes()[0]?.time).toBe(1000);
  });
});


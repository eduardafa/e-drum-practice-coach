import { describe, expect, it } from "vitest";
import { findExercise } from "../exercises/library";
import type { PadId } from "../kit/nitroMax";
import {
  LEAN_MS,
  MIN_HITS,
  UNEVEN_MS,
  describeTendency,
  formatLean,
  limbOf,
  tendency,
  timingStats,
  type Limb,
  type TimingStat,
} from "./limbs";
import type { HistoryRecord, NoteTuple, SessionRecord } from "./record";

type Voice = SessionRecord["voices"][number];

function session(local: string, voices: Voice[], notes: NoteTuple[]): HistoryRecord {
  return {
    v: 1,
    id: local,
    kind: "session",
    start: Temporal.PlainDateTime.from(local).toZonedDateTime("Europe/Lisbon").toInstant().toString(),
    duration: "PT1M",
    timeZone: "Europe/Lisbon",
    exerciseId: "x",
    exerciseName: "X",
    bpm: 80,
    loops: 1,
    toleranceMs: 35,
    latencyOffsetMs: 0,
    accuracy: { partial: 0.9, strict: 0.8 },
    counts: { notes: notes.length, onTime: 0, early: 0, late: 0, missed: 0, extra: 0 },
    meanDeltaMs: null,
    spreadMs: null,
    voices,
    notes,
    extras: [],
    trainerRunId: null,
  };
}

const v = (pad: PadId, hand: "R" | "L" | null = null): Voice => ({ pad, dynamic: "normal", hand });

describe("limbOf", () => {
  it("uses the right-handed groove setup when no sticking is written", () => {
    expect(limbOf(v("hihat"))).toBe("RH");
    expect(limbOf(v("ride"))).toBe("RH");
    expect(limbOf(v("crash"))).toBe("RH");
    expect(limbOf(v("snare"))).toBe("LH");
    expect(limbOf(v("kick"))).toBe("RF");
    expect(limbOf(v("hihatPedal"))).toBe("LF");
  });

  it("leaves groove toms without a hand", () => {
    expect(limbOf(v("tom1"))).toBeNull();
    expect(limbOf(v("tom3"))).toBeNull();
  });

  it("follows the sticking, so a rudiment's snare notes split between hands", () => {
    expect(limbOf(v("snare", "R"))).toBe("RH");
    expect(limbOf(v("snare", "L"))).toBe("LH");
    expect(limbOf(v("tom1", "L"))).toBe("LH");
  });

  it("assigns every note of the starter library's money beat and paradiddle", () => {
    const money = findExercise("rock-8ths");
    const paradiddle = findExercise("paradiddle");
    expect(money?.notes.every((n) => limbOf({ pad: n.pad, hand: n.hand ?? null }) !== null)).toBe(true);
    expect(paradiddle?.notes.slice(0, 8).map((n) => limbOf({ pad: n.pad, hand: n.hand ?? null }))).toEqual([
      "RH", "LH", "RH", "RH", "LH", "RH", "LH", "LH",
    ]);
  });
});

describe("timingStats", () => {
  const voices = [v("hihat"), v("snare"), v("kick"), v("tom1")];

  it("averages timing per limb and per pad, counting misses apart", () => {
    const records = [
      session("2026-11-11T10:00", voices, [
        [0, 0, 10, 90],
        [0, 1, 20, 90],
        [1, 0, -6, 80],
        [1, 1, null, null],
        [2, 0, 4, 100],
        [3, 0, 30, 70],
      ]),
    ];
    const { limbs, pads, sessions } = timingStats(records, null);
    expect(sessions).toBe(1);
    expect(limbs.get("RH")).toMatchObject({ hits: 2, missed: 0, meanMs: 15 });
    expect(limbs.get("RH")?.spreadMs).toBeCloseTo(Math.sqrt(50));
    expect(limbs.get("LH")).toMatchObject({ hits: 1, missed: 1, meanMs: -6, spreadMs: null });
    expect(limbs.get("RF")).toMatchObject({ hits: 1, meanMs: 4 });
    // The groove's tom counts for its pad only.
    expect(pads.get("tom1")).toMatchObject({ hits: 1, meanMs: 30 });
    expect([...limbs.keys()].toSorted()).toEqual(["LH", "RF", "RH"]);
  });

  it("only counts sessions from the start of the range", () => {
    const records = [
      session("2026-11-10T23:59", voices, [[0, 0, 50, null]]),
      session("2026-11-11T00:01", voices, [[0, 0, 10, null]]),
    ];
    const { limbs, sessions } = timingStats(records, Temporal.PlainDate.from("2026-11-11"));
    expect(sessions).toBe(1);
    expect(limbs.get("RH")?.meanMs).toBe(10);
  });

  it("skips trainer records and notes the voices don't describe", () => {
    const records = [session("2026-11-11T10:00", [v("hihat")], [[5, 0, 10, null]])];
    expect(timingStats(records, null).limbs.size).toBe(0);
  });
});

const stat = (meanMs: number, spreadMs = 10, hits = MIN_HITS): TimingStat => ({ hits, missed: 0, meanMs, spreadMs });
const of = (entries: [Limb, TimingStat][]) => new Map(entries);

describe("tendency", () => {

  it("needs enough hits before saying anything", () => {
    expect(tendency(of([["LH", stat(30, 10, MIN_HITS - 1)]]))).toEqual({ kind: "not-enough" });
    expect(tendency(new Map())).toEqual({ kind: "not-enough" });
  });

  it("reports everything leaning the same way as a whole", () => {
    expect(tendency(of([["RH", stat(12)], ["LH", stat(14)], ["RF", stat(10)]]))).toEqual({ kind: "overall", direction: "late", ms: 12 });
    expect(tendency(of([["RH", stat(-10)], ["LH", stat(-9)]]))).toEqual({ kind: "overall", direction: "early", ms: 10 });
  });

  it("picks the limb furthest from the click", () => {
    expect(tendency(of([["RH", stat(2)], ["LH", stat(12)], ["RF", stat(-5)]]))).toEqual({ kind: "limb", limb: "LH", direction: "late", ms: 12 });
    expect(tendency(of([["RH", stat(3)], ["RF", stat(-LEAN_MS)]]))).toEqual({ kind: "limb", limb: "RF", direction: "early", ms: LEAN_MS });
  });

  it("falls back to the least steady limb, then to balanced", () => {
    expect(tendency(of([["RH", stat(2, 12)], ["LH", stat(-3, UNEVEN_MS + 5)]]))).toEqual({ kind: "uneven", limb: "LH", ms: UNEVEN_MS + 5 });
    expect(tendency(of([["RH", stat(2, 12)], ["LH", stat(-3, 14)]]))).toEqual({ kind: "balanced" });
  });

  it("treats a single limb leaning off the click as that limb, not the whole", () => {
    expect(tendency(of([["LH", stat(15)]]))).toMatchObject({ kind: "limb", limb: "LH" });
  });
});

describe("describeTendency", () => {
  it("says what's happening and suggests practice, in plain words", () => {
    expect(describeTendency({ kind: "limb", limb: "LH", direction: "late", ms: 12 }).headline).toBe(
      "Your left hand drags: it's 12 ms late on average.",
    );
    expect(describeTendency({ kind: "limb", limb: "LH", direction: "late", ms: 12 }).tip).toMatch(/slow single strokes/);
    expect(describeTendency({ kind: "limb", limb: "RF", direction: "early", ms: 9 }).headline).toBe(
      "Your right foot (kick) is 9 ms early on average.",
    );
    expect(describeTendency({ kind: "overall", direction: "late", ms: 14 }).tip).toMatch(/Calibrate latency/);
  });
});

describe("formatLean", () => {
  it("writes the direction in words", () => {
    expect(formatLean(12.4)).toBe("12 ms late");
    expect(formatLean(-4.6)).toBe("5 ms early");
    expect(formatLean(0.3)).toBe("on the click");
  });
});

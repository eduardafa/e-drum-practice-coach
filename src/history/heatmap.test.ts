import { describe, expect, it } from "vitest";
import type { Dynamic } from "../exercises/types";
import type { PadId } from "../kit/nitroMax";
import { DYNAMIC_GAP, HEAT_COLORS, binOf, bins, dynamicsNote, heatmap, type VelocityStat } from "./heatmap";
import type { ExtraTuple, HistoryRecord, NoteTuple, SessionRecord } from "./record";
import { RunningStats } from "./running";

type Voice = SessionRecord["voices"][number];

function session(local: string, voices: Voice[], notes: NoteTuple[], extras: ExtraTuple[] = []): HistoryRecord {
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
    counts: { notes: notes.length, onTime: 0, early: 0, late: 0, missed: 0, extra: extras.length },
    meanDeltaMs: null,
    spreadMs: null,
    voices,
    notes,
    extras,
    trainerRunId: null,
  };
}

const v = (pad: PadId, dynamic: Dynamic = "normal"): Voice => ({ pad, dynamic, hand: null });

describe("RunningStats", () => {
  it("matches the two-pass mean and sample standard deviation", () => {
    const acc = new RunningStats();
    for (const x of [2, 4, 4, 4, 5, 5, 7, 9]) acc.add(x);
    expect(acc.mean).toBe(5);
    expect(acc.spread).toBeCloseTo(Math.sqrt(32 / 7));
    const one = new RunningStats();
    one.add(3);
    expect([one.mean, one.spread]).toEqual([3, null]);
    expect(new RunningStats().mean).toBeNull();
  });
});

describe("heatmap", () => {
  const voices = [v("snare", "accent"), v("snare", "ghost"), v("kick")];

  it("counts played notes and extras per pad, skipping misses", () => {
    const records = [
      session(
        "2026-11-11T10:00",
        voices,
        [
          [0, 0, 3, 110],
          [1, 0, -2, 40],
          [2, 0, null, null], // missed: not a hit
          [2, 1, 5, 100],
        ],
        [
          ["snare", 70],
          ["tom1", null],
          [null, 90], // unmapped note
        ],
      ),
    ];
    const { pads, sessions } = heatmap(records);
    expect(sessions).toBe(1);
    expect(pads.get("snare")).toMatchObject({ hits: 3, extras: 1 });
    expect(pads.get("snare")?.velocity.mean).toBeCloseTo((110 + 40 + 70) / 3);
    expect(pads.get("kick")).toMatchObject({ hits: 1, extras: 0, velocity: { n: 1, mean: 100, spread: null } });
    expect(pads.get("tom1")).toMatchObject({ hits: 1, extras: 1, velocity: { n: 0, mean: null } });
    expect(pads.size).toBe(3);
  });

  it("groups strength by the dynamic the exercise asked for, leaving extras out", () => {
    const records = [
      session(
        "2026-11-11T10:00",
        voices,
        [
          [0, 0, 0, 100],
          [0, 1, 0, 120],
          [1, 0, 0, 30],
          [2, 0, 0, 80],
          [2, 1, 0, null], // hit, velocity unknown
        ],
        [["snare", 127]],
      ),
    ];
    const { dynamics, pads } = heatmap(records);
    expect(dynamics.get("accent")).toMatchObject({ n: 2, mean: 110 });
    expect(dynamics.get("ghost")).toMatchObject({ n: 1, mean: 30 });
    expect(dynamics.get("normal")).toMatchObject({ n: 1, mean: 80 });
    expect(pads.get("kick")?.hits).toBe(2);
  });

  it("only counts sessions from the start of the range", () => {
    const records = [
      session("2026-11-10T23:59", voices, [[2, 0, 0, 60]]),
      session("2026-11-11T00:01", voices, [[2, 0, 0, 90]]),
    ];
    const { pads, sessions } = heatmap(records, Temporal.PlainDate.from("2026-11-11"));
    expect(sessions).toBe(1);
    expect(pads.get("kick")?.velocity.mean).toBe(90);
  });
});

describe("bins", () => {
  it("splits hit counts into five equal ranges from 1 to the most hit pad", () => {
    expect(bins("hits", 100).map((b) => [b.min, b.max])).toEqual([
      [1, 20],
      [21, 40],
      [41, 60],
      [61, 80],
      [81, 100],
    ]);
  });

  it("uses fewer bins for small counts, spread across the whole colour ramp", () => {
    const two = bins("hits", 2);
    expect(two.map((b) => [b.min, b.max, b.step])).toEqual([
      [1, 1, 0],
      [2, 2, HEAT_COLORS.length - 1],
    ]);
    expect(bins("hits", 0)).toHaveLength(1);
  });

  it("uses the fixed MIDI velocity range for strength", () => {
    const b = bins("strength", 3);
    expect(b[0]?.min).toBe(1);
    expect(b.at(-1)?.max).toBe(127);
    expect(b).toHaveLength(5);
  });

  it("places values in their bin, and nothing for no value", () => {
    const b = bins("hits", 100);
    expect(binOf(20, b)?.step).toBe(0);
    expect(binOf(21, b)?.step).toBe(1);
    expect(binOf(100, b)?.step).toBe(4);
    expect(binOf(0, b)).toBeNull();
    expect(binOf(null, b)).toBeNull();
    expect(binOf(64.4, bins("strength", 0))?.step).toBe(2);
  });
});

const stat = (mean: number): VelocityStat => ({ n: 10, mean, spread: 8 });
const of = (entries: [Dynamic, VelocityStat][]) => new Map(entries);

describe("dynamicsNote", () => {

  it("compares accents with ghost notes first", () => {
    expect(dynamicsNote(of([["accent", stat(110)], ["ghost", stat(40)]]))).toMatch(/clearly different/);
    expect(dynamicsNote(of([["accent", stat(100)], ["ghost", stat(100 - DYNAMIC_GAP)], ["normal", stat(80)]]))).toMatch(/too alike/);
  });

  it("then accents or ghosts against normal notes", () => {
    expect(dynamicsNote(of([["accent", stat(110)], ["normal", stat(80)]]))).toMatch(/stand out from/);
    expect(dynamicsNote(of([["accent", stat(90)], ["normal", stat(80)]]))).toMatch(/don't stand out/);
    expect(dynamicsNote(of([["ghost", stat(70)], ["normal", stat(80)]]))).toMatch(/nearly as loud/);
  });

  it("says nothing when only one dynamic was played", () => {
    expect(dynamicsNote(of([["normal", stat(80)]]))).toBeNull();
  });
});

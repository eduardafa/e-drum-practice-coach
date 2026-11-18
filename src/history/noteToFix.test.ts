import { describe, expect, it } from "vitest";
import type { Exercise, ExerciseNote } from "../exercises/types";
import type { PadId } from "../kit/nitroMax";
import { noteToFix, noteToFixHeadline, noteToFixTip, type NoteToFix } from "./noteToFix";
import type { NoteTuple, SessionRecord } from "./record";

const Q = 48;
const TOLERANCE = 35;

/** The Money beat's quarter notes: kick on 1, snare on 2, kick on 3, snare on 4. */
const BEAT: [PadId, number][] = [
  ["kick", 0],
  ["snare", Q],
  ["kick", 2 * Q],
  ["snare", 3 * Q],
];

function exercise(notes: [PadId, number][] = BEAT, bars = 1): Pick<Exercise, "notes" | "timeSignature" | "bars"> {
  return {
    notes: notes.map(([pad, tick]): ExerciseNote => ({ pad, tick, dynamic: "normal" })),
    timeSignature: { beats: 4, unit: 4 },
    bars,
  };
}

/** A session where each loop's timings are given per note, in ms (null: missed). */
function session(loops: (number | null)[][], pads = BEAT.map(([p]) => p)): Pick<SessionRecord, "voices" | "notes" | "toleranceMs"> {
  return {
    voices: pads.map((pad) => ({ pad, dynamic: "normal" as const, hand: null })),
    notes: loops.flatMap((timings, loop) => timings.map((deltaMs, index): NoteTuple => [index, loop, deltaMs, 90])),
    toleranceMs: TOLERANCE,
  };
}

const LATE = TOLERANCE + 20;
const loops = (n: number, timings: (number | null)[]) => Array.from({ length: n }, () => timings);

describe("noteToFix", () => {
  it("finds the one note that's late most loops", () => {
    const played = [...loops(6, [0, 5, 0, LATE]), ...loops(2, [0, 5, 0, 0])];
    expect(noteToFix(session(played), exercise())).toMatchObject({
      problem: "late",
      pad: "snare",
      indexes: [3],
      where: "on beat 4",
      say: "4",
      times: 6,
      of: 8,
    });
  });

  it("finds a note that's skipped, and one that's rushed", () => {
    expect(noteToFix(session(loops(4, [0, null, 0, 0])), exercise())).toMatchObject({ problem: "missed", indexes: [1] });
    expect(noteToFix(session(loops(4, [0, 0, -LATE, 0])), exercise())).toMatchObject({ problem: "early", indexes: [2] });
  });

  it("names the same drum with the same problem together: the kick late on 1 and 3", () => {
    expect(noteToFix(session(loops(4, [LATE, 0, LATE, 0])), exercise())).toMatchObject({
      pad: "kick",
      indexes: [0, 2],
      where: "on beats 1 and 3",
      times: 8,
      of: 8,
    });
  });

  it("says nothing when the session went well, or a slip happened once", () => {
    expect(noteToFix(session(loops(8, [0, 5, -5, 10])), exercise())).toBeNull();
    expect(noteToFix(session([[0, 0, 0, LATE], ...loops(7, [0, 0, 0, 0])]), exercise())).toBeNull();
  });

  it("says nothing when the note goes wrong less than half the time", () => {
    const played = [...loops(3, [0, 0, 0, LATE]), ...loops(5, [0, 0, 0, 0])];
    expect(noteToFix(session(played), exercise())).toBeNull();
  });

  it("says nothing when everything is late: that's the whole session, not one note", () => {
    expect(noteToFix(session(loops(8, [LATE, LATE, LATE, LATE])), exercise())).toBeNull();
    expect(noteToFix(session(loops(8, [LATE, LATE, LATE, 2 * LATE])), exercise())).toBeNull();
  });

  it("names offbeats by how they're counted", () => {
    const hats: [PadId, number][] = [
      ["hihat", 0],
      ["hihat", Q / 2],
      ["hihat", Q + Q / 4],
      ["hihat", Q + (3 * Q) / 4],
    ];
    const ex = exercise(hats);
    const pads = hats.map(([p]) => p);
    expect(noteToFix(session(loops(4, [0, null, 0, 0]), pads), ex)).toMatchObject({ where: 'on the "&" of beat 1', say: "and" });
    expect(noteToFix(session(loops(4, [0, 0, null, 0]), pads), ex)).toMatchObject({ where: 'on the "e" of beat 2', say: "e" });
    expect(noteToFix(session(loops(4, [0, 0, 0, null]), pads), ex)).toMatchObject({ where: 'on the "a" of beat 2', say: "a" });
  });

  it("says which bar in a longer exercise", () => {
    const twoBars: [PadId, number][] = [...BEAT, ...BEAT.map(([p, t]): [PadId, number] => [p, t + 4 * Q])];
    const played = loops(4, [0, 0, 0, 0, 0, 0, LATE, 0]);
    expect(noteToFix(session(played, twoBars.map(([p]) => p)), exercise(twoBars, 2))).toMatchObject({
      where: "on beat 3 in bar 2",
    });
  });

  it("gives up when the exercise no longer matches the record", () => {
    expect(noteToFix(session(loops(4, [0, null, 0, 0])), exercise(BEAT.slice(0, 3)))).toBeNull();
  });
});

const fix = (problem: NoteToFix["problem"]): NoteToFix => ({
  problem,
  pad: "snare",
  indexes: [1],
  where: "on beat 2",
  say: "2",
  times: 6,
  of: 8,
});

describe("the words", () => {

  it("says what went wrong, where, and how often", () => {
    expect(noteToFixHeadline(fix("late"))).toBe("The snare on beat 2 was late 6 of 8 times.");
    expect(noteToFixHeadline({ ...fix("missed"), pad: "hihatPedal" })).toBe("The hi-hat pedal on beat 2 was missed 6 of 8 times.");
  });

  it("has a tip for each problem, counting the note's own word", () => {
    expect(noteToFixTip(fix("late"))).toContain('"2"');
    expect(noteToFixTip(fix("early"))).toContain("rushing");
    expect(noteToFixTip(fix("missed"))).toContain("Learn");
  });
});

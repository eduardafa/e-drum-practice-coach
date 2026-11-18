import { describe, expect, it } from "vitest";
import { findExercise } from "../exercises/library";
import type { Exercise, ExerciseNote } from "../exercises/types";
import { countLabel, groupLabel, noteGroups, noteLabel } from "./noteLabels";
import { STAFF_POSITIONS, staffKey } from "./staffKey";

const note = (n: Partial<ExerciseNote> & Pick<ExerciseNote, "pad">): ExerciseNote => ({ tick: 0, dynamic: "normal", ...n });

function exercise(id: string): Exercise {
  const found = findExercise(id);
  if (!found) throw new Error(`no exercise ${id}`);
  return found;
}

const FOUR_FOUR = { timeSignature: { beats: 4, unit: 4 }, bars: 1 } as const;

describe("noteLabel", () => {
  it("names the drum and the usual hand or foot on a right-handed kit", () => {
    expect(noteLabel(note({ pad: "snare" }), "right")).toBe("Snare, left hand");
    expect(noteLabel(note({ pad: "hihat" }), "right")).toBe("Hi-hat, right hand");
    expect(noteLabel(note({ pad: "kick" }), "right")).toBe("Kick, right foot");
    expect(noteLabel(note({ pad: "hihatPedal" }), "right")).toBe("Hi-hat pedal, left foot");
  });

  it("uses the written sticking when there is one", () => {
    expect(noteLabel(note({ pad: "snare", hand: "R" }), "right")).toBe("Snare, right hand");
    expect(noteLabel(note({ pad: "hihat", hand: "L" }), "right")).toBe("Hi-hat, left hand");
  });

  it("swaps sides on a left-handed kit", () => {
    expect(noteLabel(note({ pad: "hihat" }), "left")).toBe("Hi-hat, left hand");
    expect(noteLabel(note({ pad: "kick" }), "left")).toBe("Kick, left foot");
    expect(noteLabel(note({ pad: "snare", hand: "R" }), "left")).toBe("Snare, left hand");
  });

  it("says a tom with no sticking can be played with either hand", () => {
    expect(noteLabel(note({ pad: "tom1" }), "right")).toBe("Tom 1, either hand");
  });

  it("adds how the note is played", () => {
    expect(noteLabel(note({ pad: "snare", dynamic: "ghost" }), "right")).toBe("Snare, left hand, very soft (ghost note)");
    expect(noteLabel(note({ pad: "hihat", dynamic: "accent", open: true }), "right")).toBe("Hi-hat, right hand, loud (accent), open");
    expect(noteLabel(note({ pad: "snare", hand: "R", flam: true }), "right")).toBe("Snare, right hand, with a flam");
  });
});

describe("countLabel", () => {
  it("names beats and the syllables between them", () => {
    expect(countLabel(0, FOUR_FOUR)).toBe("Beat 1");
    expect(countLabel(48 + 24, FOUR_FOUR)).toBe('The "&" of beat 2');
    expect(countLabel(12, FOUR_FOUR)).toBe('The "e" of beat 1');
  });

  it("adds the bar when the exercise has several", () => {
    expect(countLabel(192 + 48, { ...FOUR_FOUR, bars: 2 })).toBe("Bar 2, beat 2");
  });
});

describe("noteGroups", () => {
  it("lists every drum played together, from the top of the staff down", () => {
    const money = exercise("first-hihat-kick");
    const [first] = noteGroups(money, "right");
    expect(first.tick).toBe(0);
    expect(first.lines).toEqual(["Hi-hat, right hand", "Kick, right foot"]);
    expect(groupLabel(first)).toBe("Beat 1: Hi-hat, right hand; Kick, right foot");
  });

  it("covers each note exactly once, in time order", () => {
    const ex = exercise("first3-tom-fill");
    const groups = noteGroups(ex, "right");
    expect(groups.flatMap((g) => g.indexes).toSorted((a, b) => a - b)).toEqual(ex.notes.map((_, i) => i));
    const ticks = groups.map((g) => g.tick);
    expect(ticks).toEqual(ticks.toSorted((a, b) => a - b));
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it("follows a rudiment's sticking", () => {
    const groups = noteGroups(exercise("paradiddle"), "right");
    expect(groups.slice(0, 4).map((g) => g.lines[0])).toEqual([
      "Snare, right hand, loud (accent)",
      "Snare, left hand",
      "Snare, right hand",
      "Snare, right hand",
    ]);
  });
});

describe("staffKey", () => {
  it("lists only the drums used, top of the staff first, each once", () => {
    const key = staffKey(["kick", "hihat", "snare", "kick"]);
    expect(key.map((k) => k.name)).toEqual(["Hi-hat", "Snare", "Kick"]);
  });

  it("puts the kick in the bottom space and the snare two spaces up", () => {
    expect(STAFF_POSITIONS.kick).toMatchObject({ step: 1, head: "round" });
    expect(STAFF_POSITIONS.snare).toMatchObject({ step: 5, head: "round" });
    expect(STAFF_POSITIONS.hihat.head).toBe("x");
  });
});

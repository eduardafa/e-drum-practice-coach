import { describe, expect, it } from "vitest";
import { exerciseLengthTicks, ticksPerBar, ticksPerBeat, type Exercise } from "./types";
import { validateExercise, validateLibrary } from "./validate";

const valid: Exercise = {
  id: "test-beat",
  name: "Test beat",
  category: "groove",
  description: "Kick and snare.",
  timeSignature: { beats: 4, unit: 4 },
  bars: 1,
  tempo: { min: 60, suggested: 80, max: 120 },
  notes: [
    { tick: 0, pad: "snare", dynamic: "normal" },
    { tick: 0, pad: "kick", dynamic: "normal" },
    { tick: 96, pad: "snare", dynamic: "accent" },
  ],
};

const withChanges = (patch: Partial<Exercise>): Exercise => ({ ...valid, ...patch });

describe("tick arithmetic", () => {
  it("uses 48 ticks per quarter note", () => {
    expect(ticksPerBeat({ beats: 4, unit: 4 })).toBe(48);
    expect(ticksPerBar({ beats: 4, unit: 4 })).toBe(192);
  });

  it("handles eighth-note meters", () => {
    expect(ticksPerBeat({ beats: 6, unit: 8 })).toBe(24);
    expect(ticksPerBar({ beats: 6, unit: 8 })).toBe(144);
  });

  it("measures a multi-bar exercise", () => {
    expect(exerciseLengthTicks({ timeSignature: { beats: 3, unit: 4 }, bars: 2 })).toBe(288);
  });
});

describe("validateExercise", () => {
  it("accepts a valid exercise", () => {
    expect(validateExercise(valid)).toEqual([]);
  });

  it.each<[string, Partial<Exercise>, string]>([
    ["a bad id", { id: "Test Beat" }, "id"],
    ["an empty name", { name: " " }, "name is empty"],
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- deliberately invalid input
    ["a 7/16 meter", { timeSignature: { beats: 7, unit: 16 as 4 } }, "unit"],
    ["zero bars", { bars: 0 }, "bars"],
    ["a tempo range out of order", { tempo: { min: 100, suggested: 80, max: 120 } }, "min ≤ suggested ≤ max"],
    ["a tempo beyond the metronome", { tempo: { min: 60, suggested: 80, max: 400 } }, "within"],
    ["no notes", { notes: [] }, "no notes"],
    ["a note past the end", { notes: [{ tick: 192, pad: "kick", dynamic: "normal" }] }, "tick must be"],
    ["a fractional tick", { notes: [{ tick: 12.5, pad: "kick", dynamic: "normal" }] }, "tick must be"],
    ["an open snare", { notes: [{ tick: 0, pad: "snare", dynamic: "normal", open: true }] }, "only the hi-hat"],
    [
      "a duplicate note",
      { notes: [{ tick: 0, pad: "kick", dynamic: "normal" }, { tick: 0, pad: "kick", dynamic: "accent" }] },
      "same pad at the same tick",
    ],
    [
      "notes out of order",
      { notes: [{ tick: 48, pad: "kick", dynamic: "normal" }, { tick: 0, pad: "kick", dynamic: "normal" }] },
      "out of order",
    ],
  ])("rejects %s", (_, patch, message) => {
    expect(validateExercise(withChanges(patch)).join("\n")).toContain(message);
  });

  it("orders pads at the same tick by kit layout", () => {
    const swapped = withChanges({
      notes: [
        { tick: 0, pad: "kick", dynamic: "normal" },
        { tick: 0, pad: "snare", dynamic: "normal" },
      ],
    });
    expect(validateExercise(swapped).join("\n")).toContain("out of order");
  });
});

describe("validateLibrary", () => {
  it("rejects duplicate ids", () => {
    expect(validateLibrary([valid, valid])).toContain('duplicate id "test-beat"');
  });

  it("prefixes each problem with the exercise id", () => {
    expect(validateLibrary([withChanges({ bars: 0 })])[0]).toMatch(/^test-beat: bars/);
  });
});

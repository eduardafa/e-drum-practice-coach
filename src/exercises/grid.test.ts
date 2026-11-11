import { describe, expect, it } from "vitest";
import { fromGrid, type GridSpec } from "./grid";
import { validateExercise } from "./validate";

const base: GridSpec = {
  id: "grid-test",
  name: "Grid test",
  category: "groove",
  description: "For tests.",
  timeSignature: { beats: 4, unit: 4 },
  bars: 1,
  tempo: { min: 60, suggested: 80, max: 120 },
  stepsPerBar: 8,
  lanes: {},
};

describe("fromGrid", () => {
  it("turns lane strings into sorted notes", () => {
    const exercise = fromGrid({
      ...base,
      lanes: {
        kick: "x--- x---",
        snare: "--X- --X-",
        hihat: "xxxx xxxo",
      },
    });
    expect(validateExercise(exercise)).toEqual([]);
    expect(exercise.notes.slice(0, 3)).toEqual([
      { tick: 0, pad: "hihat", dynamic: "normal" },
      { tick: 0, pad: "kick", dynamic: "normal" },
      { tick: 24, pad: "hihat", dynamic: "normal" },
    ]);
    expect(exercise.notes.find((n) => n.pad === "snare")).toEqual({ tick: 48, pad: "snare", dynamic: "accent" });
    expect(exercise.notes.at(-1)).toEqual({ tick: 168, pad: "hihat", dynamic: "normal", open: true });
  });

  it("reads ghost notes and flams", () => {
    const { notes } = fromGrid({ ...base, lanes: { snare: "g-f-F---" } });
    expect(notes).toEqual([
      { tick: 0, pad: "snare", dynamic: "ghost" },
      { tick: 48, pad: "snare", dynamic: "normal", flam: true },
      { tick: 96, pad: "snare", dynamic: "accent", flam: true },
    ]);
  });

  it("applies sticking to the notes on each step", () => {
    const { notes } = fromGrid({ ...base, lanes: { snare: "xxxx----" }, sticking: "RLRR----" });
    expect(notes.map((n) => n.hand)).toEqual(["R", "L", "R", "R"]);
  });

  it("supports triplet grids", () => {
    const { notes } = fromGrid({ ...base, stepsPerBar: 12, lanes: { snare: "x--x--x--x--" } });
    expect(notes.map((n) => n.tick)).toEqual([0, 48, 96, 144]);
  });

  it("supports multi-bar exercises", () => {
    const { notes } = fromGrid({ ...base, bars: 2, lanes: { kick: "x------- | x-------" } });
    expect(notes.map((n) => n.tick)).toEqual([0, 192]);
  });

  it.each<[string, Partial<GridSpec>, string]>([
    ["a lane of the wrong length", { lanes: { kick: "x---" } }, "kick lane has 4 steps, expected 8"],
    ["an unknown symbol", { lanes: { kick: "x--?x---" } }, 'unknown symbol "?"'],
    ["steps that don't divide the bar", { stepsPerBar: 7, lanes: { kick: "x------" } }, "don't divide"],
    ["sticking of the wrong length", { lanes: { kick: "x-------" }, sticking: "RL" }, "sticking has 2 steps"],
    ["unknown sticking", { lanes: { kick: "x-------" }, sticking: "RLRRLRLX" }, 'unknown sticking "X"'],
  ])("throws on %s", (_, patch, message) => {
    expect(() => fromGrid({ ...base, ...patch })).toThrow(message);
  });
});

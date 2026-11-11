import { describe, expect, it } from "vitest";
import { EXERCISES, findExercise } from "./library";
import { formatTimeSignature, tabOf } from "./tab";

function tab(id: string) {
  const exercise = findExercise(id);
  if (!exercise) throw new Error(`missing exercise ${id}`);
  return tabOf(exercise);
}

const symbols = (cells: ReturnType<typeof tabOf>["rows"][number]["cells"]) =>
  cells.map((c) => (c === null ? "-" : c.open ? "o" : c.flam ? "f" : c.dynamic === "accent" ? "X" : c.dynamic === "ghost" ? "g" : "x")).join("");

describe("tabOf", () => {
  it("lays the money beat out in eighths, cymbals on top and kick at the bottom", () => {
    const t = tab("rock-8ths");
    expect(t).toMatchObject({ steps: 8, stepsPerBeat: 2 });
    expect(t.rows.map((r) => r.pad)).toEqual(["hihat", "snare", "kick"]);
    expect(t.rows.map((r) => symbols(r.cells))).toEqual(["xxxxxxxx", "--x---x-", "x---x---"]);
  });

  it("uses sixteenths and keeps dynamics and open hi-hats", () => {
    expect(symbols(tab("half-time-ghosts").rows[1].cells)).toBe("---g---gX--g--g-");
    const open = tab("open-hihat");
    expect(open.rows.map((r) => r.pad)).toEqual(["hihat", "snare", "kick", "hihatPedal"]);
    expect(symbols(open.rows[0].cells)).toBe("xxxxxxxo");
  });

  it("uses triplets for triplet exercises and marks flams", () => {
    expect(tab("triplet-singles")).toMatchObject({ steps: 12, stepsPerBeat: 3 });
    expect(symbols(tab("flam-taps").rows[0].cells)).toBe("fxfxfxfxfxfxfxfx");
  });

  it("gives every library exercise whole steps with every note on one", () => {
    for (const e of EXERCISES) {
      const t = tabOf(e);
      expect(Number.isInteger(t.steps)).toBe(true);
      expect(t.rows.reduce((n, r) => n + r.cells.filter(Boolean).length, 0)).toBe(e.notes.length);
    }
  });

  it("writes time signatures as on the page", () => {
    expect(formatTimeSignature(findExercise("six-eight")!)).toBe("6/8");
  });
});

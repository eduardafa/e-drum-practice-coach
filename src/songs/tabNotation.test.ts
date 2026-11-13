import { describe, expect, it } from "vitest";
import type { BeatGrid } from "./beats";
import { drumTabFrom, placeTab, type DrumTab } from "./drumTab";
import { readMidiDrums } from "./midiFile";
import { midiFile, rockBeat } from "./midiTestFiles";
import { BARS_PER_LINE, lineCount, snapTab, tabBeatAt, tabLine } from "./tabNotation";

const tab = (notes: [number, DrumTab["notes"][number]["pad"]][]): DrumTab => ({
  notes: notes.map(([beat, pad]) => ({ beat, pad, open: false })),
  skipped: 0,
  beatsPerBar: 4,
  firstNoteSeconds: 0,
});

describe("snapTab", () => {
  it("snaps slightly-off notes to 16ths", () => {
    const snapped = snapTab(tab([[0.02, "kick"], [0.49, "hihat"], [0.77, "snare"]]));
    expect(snapped.map((n) => [n.tick, n.pad])).toEqual([
      [0, "kick"],
      [24, "hihat"],
      [36, "snare"],
    ]);
  });

  it("keeps a beat of triplets as triplets", () => {
    const snapped = snapTab(tab([[1, "snare"], [1.34, "snare"], [1.66, "snare"]]));
    expect(snapped.map((n) => n.tick)).toEqual([48, 64, 80]);
  });

  it("moves a note snapped to the end of a beat onto the next beat, without doubling it", () => {
    const snapped = snapTab(tab([[0.99, "kick"], [1, "kick"]]));
    expect(snapped).toEqual([{ tick: 48, pad: "kick", open: false }]);
  });
});

describe("tabLine and lineCount", () => {
  const part = readMidiDrums(midiFile(480, [rockBeat(480, 5)]));
  const snapped = snapTab(drumTabFrom(part));

  it("cuts the tab into lines of two bars of 4/4, starting each at tick 0", () => {
    const line1 = tabLine(snapped, 1);
    expect(line1.bars).toBe(BARS_PER_LINE);
    expect(line1.timeSignature).toEqual({ beats: 4, unit: 4 });
    // A rock beat bar: 8 hi-hats, 2 kicks, 2 snares; two bars per line.
    expect(line1.notes).toHaveLength(24);
    expect(line1.notes[0]).toEqual({ tick: 0, pad: "hihat", dynamic: "normal" });
    expect(Math.max(...line1.notes.map((n) => n.tick))).toBeLessThan(2 * 192);
  });

  it("counts the lines, the last one partly empty", () => {
    expect(lineCount(snapped)).toBe(3);
    expect(tabLine(snapped, 2).notes).toHaveLength(12);
  });
});

describe("tabBeatAt", () => {
  const grid: BeatGrid = { beats: [1, 1.5, 2, 2.4, 2.8], firstDownbeat: 0, bpm: 120 };

  it("is the inverse of placing the tab", () => {
    const t = tab([[0, "kick"], [1.5, "snare"], [2.25, "hihat"]]);
    for (const note of placeTab(t, grid, 1)) {
      expect(tabBeatAt(grid, 1, note.time)).toBeCloseTo(t.notes[note.id].beat);
    }
  });

  it("carries on at the nearest beat's pace before the first beat and after the last", () => {
    expect(tabBeatAt(grid, 0, 0.5)).toBeCloseTo(-1);
    expect(tabBeatAt(grid, 0, 3.2)).toBeCloseTo(5);
  });
});

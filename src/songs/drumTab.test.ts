import { describe, expect, it } from "vitest";
import type { BeatGrid } from "./beats";
import { drumTabFrom, guessShift, placeTab } from "./drumTab";
import { readMidiDrums } from "./midiFile";
import { hit, midiFile, rockBeat, tempo } from "./midiTestFiles";

const PPQ = 480;
/** A song with 40 beats that speeds up from 0.5 s to 0.4 s beats halfway, beat 1 on beat 2. */
const beats: number[] = [];
for (let i = 0, t = 2; i < 40; i++) {
  beats.push(+t.toFixed(6));
  t += i < 19 ? 0.5 : 0.4;
}
const grid: BeatGrid = { beats, firstDownbeat: 2, bpm: 120 };
const mod4 = (n: number) => ((n % 4) + 4) % 4;

describe("drumTabFrom", () => {
  it("keeps the kit's pads in beats, leaves out the rest, and counts them", () => {
    const tab = drumTabFrom(
      readMidiDrums(midiFile(PPQ, [[tempo(0, 120), hit(960, 36), hit(0, 56), hit(240, 46), hit(240, 38), hit(0, 40)]])),
    );
    expect(tab.notes).toEqual([
      { beat: 2, pad: "kick", open: false },
      { beat: 2.5, pad: "hihat", open: true },
      { beat: 3, pad: "snare", open: false },
    ]);
    expect(tab.skipped).toBe(1); // the cowbell; the snare rim at the same moment as the snare head counts once
    expect(tab.firstNoteSeconds).toBeCloseTo(1);
  });
});

describe("placeTab", () => {
  const tab = drumTabFrom(readMidiDrums(midiFile(PPQ, [rockBeat(PPQ, 8)])));

  it("puts tab beat 0 on song beat `shift`, and the eighths halfway through each song beat", () => {
    const placed = placeTab(tab, grid, 2);
    expect(placed.slice(0, 4).map((n) => [n.time, n.pad])).toEqual([
      [3, "kick"],
      [3, "hihat"],
      [3.25, "hihat"],
      [3.5, "snare"],
    ]);
  });

  it("follows the song's tempo change, beat by beat", () => {
    const placed = placeTab(tab, grid, 2);
    // Tab beat 20 is song beat 22, after the change: 2 + 19 × 0.5 + 3 × 0.4 = 12.7 s; its "&" is 0.2 s later.
    const at20 = placed.filter((n) => n.pad === "hihat" && Math.abs(n.time - 12.7) < 0.25).map((n) => +n.time.toFixed(3));
    expect(at20).toEqual([12.5, 12.7, 12.9]);
  });

  it("leaves out notes before the song's first beat or after its last", () => {
    expect(placeTab(tab, grid, -4).every((n) => n.time >= 2)).toBe(true);
    const late = placeTab(tab, grid, 30);
    expect(late.length).toBeLessThan(tab.notes.length);
    expect(late.at(-1)!.time).toBeLessThanOrEqual(beats.at(-1)! + 0.4);
  });
});

describe("guessShift", () => {
  it("puts the first note near where the file's timing says, on a bar line", () => {
    // The file's first note is on its beat 6, at 3 s at 120 BPM; the song's beat at 3 s is beat 2.
    const tab = drumTabFrom(readMidiDrums(midiFile(PPQ, [[tempo(0, 120), hit(6 * PPQ, 36)]])));
    const shift = guessShift(tab, grid);
    expect(mod4(shift - grid.firstDownbeat)).toBe(0);
    // Keeping bar lines on bar lines can move it by up to two beats (here 1 s).
    expect(Math.abs(placeTab(tab, grid, shift)[0].time - 3)).toBeLessThanOrEqual(1);
  });

  it("keeps tab bar lines on song bar lines even when the timing points between them", () => {
    const tab = drumTabFrom(readMidiDrums(midiFile(PPQ, [[tempo(0, 120), hit(0, 36)]])));
    for (const shift of [guessShift(tab, grid), guessShift(tab, { ...grid, firstDownbeat: 3 })]) {
      expect(Number.isInteger(shift)).toBe(true);
    }
    expect(mod4(guessShift(tab, { ...grid, firstDownbeat: 3 }) - 3)).toBe(0);
  });
});

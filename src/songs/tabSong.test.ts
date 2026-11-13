import { describe, expect, it } from "vitest";
import { drumTabFrom, placeTab } from "./drumTab";
import { readMidiDrums } from "./midiFile";
import { hit, midiFile, rockBeat, tempo } from "./midiTestFiles";
import { tabTimeline } from "./tabSong";

const PPQ = 480;

describe("tabTimeline", () => {
  it("has a beat per quarter note at the file's tempo, to a bar past the last note", () => {
    const part = readMidiDrums(midiFile(PPQ, [[tempo(0, 120)], rockBeat(PPQ, 2)]));
    const { grid, duration } = tabTimeline(part, drumTabFrom(part), 1);
    // The last note is on beat 7.5 (bar 2), so the beats run to the end of bar 3.
    expect(grid.beats).toHaveLength(12);
    expect(grid.beats.slice(0, 3)).toEqual([0, 0.5, 1]);
    expect(grid.bpm).toBeCloseTo(120);
    expect(grid.firstDownbeat).toBe(0);
    expect(duration).toBeCloseTo(6);
  });

  it("slows everything down at a lower speed", () => {
    const part = readMidiDrums(midiFile(PPQ, [[tempo(0, 120)], rockBeat(PPQ, 2)]));
    const { grid, duration } = tabTimeline(part, drumTabFrom(part), 0.5);
    expect(grid.bpm).toBeCloseTo(60);
    expect(grid.beats[2]).toBeCloseTo(2);
    expect(duration).toBeCloseTo(12);
  });

  it("follows the file's tempo changes, and places the tab on its own beats exactly", () => {
    const part = readMidiDrums(midiFile(PPQ, [[tempo(0, 120), tempo(4 * PPQ, 60)], [hit(0, 36), hit(6 * PPQ, 38)]]));
    const tab = drumTabFrom(part);
    const { grid } = tabTimeline(part, tab, 1);
    expect(grid.beats.slice(3, 7)).toEqual([1.5, 2, 3, 4]);
    expect(placeTab(tab, grid, 0).map((n) => [n.time, n.pad])).toEqual([
      [0, "kick"],
      [4, "snare"],
    ]);
  });
});

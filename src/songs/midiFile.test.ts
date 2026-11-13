import { describe, expect, it } from "vitest";
import { MidiError, readMidiDrums, secondsAt } from "./midiFile";
import { hit, midiFile, rockBeat, tempo, type TestEvent } from "./midiTestFiles";

describe("readMidiDrums", () => {
  it("reads the drum notes on channel 10 with their ticks, the resolution and the time signature", () => {
    const part = readMidiDrums(
      midiFile(480, [
        [[0, 0xff, 0x58, 4, 3, 2, 24, 8], tempo(0, 90)],
        [hit(0, 36), hit(240, 42, 80), hit(240, 38)],
      ]),
    );
    expect(part.ppq).toBe(480);
    expect(part.beatsPerBar).toBe(3);
    expect(part.notes).toEqual([
      { tick: 0, note: 36, velocity: 100 },
      { tick: 240, note: 42, velocity: 80 },
      { tick: 480, note: 38, velocity: 100 },
    ]);
    expect(part.tempos).toEqual([{ tick: 0, usPerQuarter: 666_667 }]);
  });

  it("skips other channels, note offs, running status and other events", () => {
    const events: TestEvent[] = [
      [0, 0x90, 60, 100], // piano, channel 1
      [0, 0xc9, 5], // program change on the drum channel
      [0, 0xb9, 7, 100], // controller
      [0, 0xf0, 2, 1, 0xf7], // sysex
      [0, 0xff, 0x03, 4, 0x44, 0x72, 0x75, 0x6d], // track name "Drum"
      hit(0, 36),
      [120, 42, 90], // running status: another note on, channel 10
      [120, 0x89, 36, 0], // note off
      [0, 0x99, 38, 0], // note on with velocity 0 is a note off
    ];
    const part = readMidiDrums(midiFile(480, [events], 0));
    expect(part.notes.map((n) => [n.tick, n.note])).toEqual([
      [0, 36],
      [120, 42],
    ]);
  });

  it("assumes 120 BPM and 4/4 when the file doesn't say", () => {
    const part = readMidiDrums(midiFile(96, [[hit(0, 36)]]));
    expect(part.tempos).toEqual([{ tick: 0, usPerQuarter: 500_000 }]);
    expect(part.beatsPerBar).toBe(4);
  });

  it("explains files it can't use", () => {
    expect(() => readMidiDrums(new TextEncoder().encode("not a midi file at all"))).toThrow(MidiError);
    expect(() => readMidiDrums(midiFile(480, [[[0, 0x90, 60, 100]]]))).toThrow(/channel 10/);
    const cut = midiFile(480, [rockBeat(480, 2)]).slice(0, 40);
    expect(() => readMidiDrums(cut)).toThrow(/ends too early/);
  });
});

describe("secondsAt", () => {
  it("follows tempo changes", () => {
    const part = readMidiDrums(midiFile(480, [[tempo(0, 120), tempo(1920, 60), hit(0, 36)]]));
    expect(secondsAt(part, 960)).toBeCloseTo(1); // two beats at 120
    expect(secondsAt(part, 1920)).toBeCloseTo(2); // a bar at 120
    expect(secondsAt(part, 2400)).toBeCloseTo(3); // then a beat at 60
  });
});

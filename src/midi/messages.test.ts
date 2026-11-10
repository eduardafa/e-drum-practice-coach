import { describe, expect, it } from "vitest";
import { parseMidiMessage } from "./messages";

describe("parseMidiMessage", () => {
  it("parses note-on on any channel", () => {
    expect(parseMidiMessage([0x99, 38, 100])).toEqual({ kind: "noteOn", channel: 9, note: 38, velocity: 100 });
    expect(parseMidiMessage([0x90, 36, 1])).toEqual({ kind: "noteOn", channel: 0, note: 36, velocity: 1 });
  });

  it("treats note-on with velocity 0 as note-off", () => {
    expect(parseMidiMessage([0x99, 38, 0])).toBeNull();
  });

  it("ignores note-off, aftertouch and system messages", () => {
    expect(parseMidiMessage([0x89, 38, 64])).toBeNull();
    expect(parseMidiMessage([0xa9, 49, 10])).toBeNull(); // cymbal choke aftertouch
    expect(parseMidiMessage([0xf8])).toBeNull(); // clock
    expect(parseMidiMessage([0xfe])).toBeNull(); // active sensing
  });

  it("parses control change (hi-hat pedal position)", () => {
    expect(parseMidiMessage([0xb9, 4, 90])).toEqual({ kind: "controlChange", channel: 9, controller: 4, value: 90 });
  });

  it("rejects truncated messages", () => {
    expect(parseMidiMessage([])).toBeNull();
    expect(parseMidiMessage([0x99, 38])).toBeNull();
  });
});

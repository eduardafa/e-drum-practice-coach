/**
 * Pure parsing of raw MIDI bytes into the events the app cares about.
 * Kept free of browser APIs so it can be unit-tested.
 */

export type MidiEvent =
  | { kind: "noteOn"; channel: number; note: number; velocity: number }
  | { kind: "controlChange"; channel: number; controller: number; value: number };

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const POLY_AFTERTOUCH = 0xa0;
const CONTROL_CHANGE = 0xb0;

/**
 * Returns the parsed event, or null for messages we ignore
 * (note off, note-on with velocity 0, clock, active sensing, sysex, ...).
 */
export function parseMidiMessage(data: ArrayLike<number>): MidiEvent | null {
  if (data.length < 1) return null;
  const status = data[0];
  // System messages (0xF0–0xFF): clock, active sensing, sysex. Not hits.
  if (status >= 0xf0) return null;

  const type = status & 0xf0;
  const channel = status & 0x0f;

  switch (type) {
    case NOTE_ON: {
      if (data.length < 3) return null;
      const velocity = data[2];
      // Running-status convention: note-on with velocity 0 means note-off.
      if (velocity === 0) return null;
      return { kind: "noteOn", channel, note: data[1], velocity };
    }
    case CONTROL_CHANGE: {
      if (data.length < 3) return null;
      return { kind: "controlChange", channel, controller: data[1], value: data[2] };
    }
    case NOTE_OFF:
    case POLY_AFTERTOUCH:
    default:
      return null;
  }
}

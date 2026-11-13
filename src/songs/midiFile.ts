/**
 * Reads the drum part of a Standard MIDI File (.mid): the notes on MIDI
 * channel 10, where General MIDI puts drums, with the file's tempo changes
 * and resolution so note positions can be turned into beats or seconds.
 * Only what a drum tab needs; everything else in the file is skipped.
 * Pure (bytes in, data out), so it's tested with files built in the tests.
 */

export interface MidiDrumNote {
  /** Position in MIDI ticks from the start. */
  tick: number;
  /** General MIDI drum note number (36 kick, 38 snare, 42 closed hi-hat…). */
  note: number;
  velocity: number;
}

export interface MidiTempo {
  tick: number;
  /** Microseconds per quarter note. */
  usPerQuarter: number;
}

export interface MidiDrumPart {
  /** Ticks per quarter note. */
  ppq: number;
  /** Drum notes in time order. */
  notes: MidiDrumNote[];
  /** Tempo changes in time order, starting at tick 0. */
  tempos: MidiTempo[];
  /** The first time signature in the file, as beats per bar (4 if none). */
  beatsPerBar: number;
}

/** General MIDI drums are on channel 10, which is 9 when counting from 0. */
const DRUM_CHANNEL = 9;
/** 120 BPM, the MIDI default until a tempo event says otherwise. */
const DEFAULT_US_PER_QUARTER = 500_000;
/** Enough for any song's drum part; a file far past this isn't a drum tab. */
export const MAX_DRUM_NOTES = 50_000;

export class MidiError extends Error {}

class Reader {
  pos = 0;
  constructor(
    private readonly bytes: Uint8Array,
    readonly end = bytes.length,
  ) {}

  byte(): number {
    if (this.pos >= this.end) throw new MidiError("The file ends too early.");
    return this.bytes[this.pos++];
  }

  uint(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) v = v * 256 + this.byte();
    return v;
  }

  /** A variable-length quantity: 7 bits per byte, high bit set on all but the last. */
  varLen(): number {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.byte();
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new MidiError("A length in the file is too long.");
  }

  ascii(n: number): string {
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.byte());
    return s;
  }

  skip(n: number): void {
    if (this.pos + n > this.end) throw new MidiError("The file ends too early.");
    this.pos += n;
  }
}

/** The drum part of a MIDI file, or a MidiError saying why it can't be read. */
export function readMidiDrums(bytes: Uint8Array): MidiDrumPart {
  const r = new Reader(bytes);
  if (bytes.length < 14 || r.ascii(4) !== "MThd") throw new MidiError("This isn't a MIDI file.");
  const headerLength = r.uint(4);
  r.uint(2); // Format 0, 1 or 2: all are read the same way here.
  const trackCount = r.uint(2);
  const division = r.uint(2);
  if (division & 0x8000) throw new MidiError("This MIDI file counts time in video frames, which isn't supported.");
  if (division === 0) throw new MidiError("This MIDI file has no time resolution.");
  r.skip(headerLength - 6);

  const notes: MidiDrumNote[] = [];
  const tempos: MidiTempo[] = [];
  let beatsPerBar: number | null = null;

  for (let t = 0; t < trackCount && r.pos < bytes.length; t++) {
    const id = r.ascii(4);
    const length = r.uint(4);
    const end = r.pos + length;
    if (end > bytes.length) throw new MidiError("The file ends too early.");
    if (id !== "MTrk") {
      r.skip(length);
      continue;
    }
    const tr = new Reader(bytes, end);
    tr.pos = r.pos;
    let tick = 0;
    let running = 0;
    while (tr.pos < end) {
      tick += tr.varLen();
      let status = tr.byte();
      if (status < 0x80) {
        // Running status: the data byte belongs to the previous event type.
        if (!running) throw new MidiError("The file has an event with no type.");
        tr.pos -= 1;
        status = running;
      } else if (status < 0xf0) {
        running = status;
      }
      const kind = status & 0xf0;
      if (status === 0xff) {
        const type = tr.byte();
        const len = tr.varLen();
        if (type === 0x2f) break;
        if (type === 0x51 && len === 3) tempos.push({ tick, usPerQuarter: tr.uint(3) });
        else if (type === 0x58 && len >= 1 && beatsPerBar === null) {
          beatsPerBar = tr.byte() || 4;
          tr.skip(len - 1);
        } else tr.skip(len);
      } else if (status === 0xf0 || status === 0xf7) {
        tr.skip(tr.varLen());
      } else if (kind === 0x90 || kind === 0x80 || kind === 0xa0 || kind === 0xb0 || kind === 0xe0) {
        const a = tr.byte();
        const b = tr.byte();
        if (kind === 0x90 && b > 0 && (status & 0x0f) === DRUM_CHANNEL) {
          notes.push({ tick, note: a, velocity: b });
          if (notes.length > MAX_DRUM_NOTES) throw new MidiError("This file has far more drum notes than a song.");
        }
      } else if (kind === 0xc0 || kind === 0xd0) {
        tr.byte();
      } else {
        throw new MidiError("The file has an event this app can't read.");
      }
    }
    r.pos = end;
  }

  if (notes.length === 0) throw new MidiError("No drum part found: there are no notes on MIDI channel 10, where drums go.");
  notes.sort((a, b) => a.tick - b.tick || a.note - b.note);
  tempos.sort((a, b) => a.tick - b.tick);
  if (tempos[0]?.tick !== 0) tempos.unshift({ tick: 0, usPerQuarter: DEFAULT_US_PER_QUARTER });
  return { ppq: division, notes, tempos, beatsPerBar: beatsPerBar ?? 4 };
}

/** Seconds from the start of the file to `tick`, following its tempo changes. */
export function secondsAt(part: Pick<MidiDrumPart, "ppq" | "tempos">, tick: number): number {
  let seconds = 0;
  for (let i = 0; i < part.tempos.length; i++) {
    const tempo = part.tempos[i];
    if (tempo.tick >= tick) break;
    const until = Math.min(tick, part.tempos[i + 1]?.tick ?? Infinity);
    seconds += ((until - tempo.tick) / part.ppq) * (tempo.usPerQuarter / 1e6);
  }
  return seconds;
}

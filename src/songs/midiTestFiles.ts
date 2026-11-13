/** Builds small Standard MIDI Files for tests: a header, then tracks of [delta ticks, ...event bytes]. */

function varLen(n: number): number[] {
  const out = [n & 0x7f];
  for (let v = n >> 7; v > 0; v >>= 7) out.unshift((v & 0x7f) | 0x80);
  return out;
}

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number) => [(n >>> 8) & 255, n & 255];
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

export type TestEvent = [delta: number, ...bytes: number[]];

export function midiFile(ppq: number, tracks: TestEvent[][], format = 1): Uint8Array {
  const bytes = [...ascii("MThd"), ...u32(6), ...u16(format), ...u16(tracks.length), ...u16(ppq)];
  for (const events of tracks) {
    const body: number[] = [];
    for (const [delta, ...ev] of events) body.push(...varLen(delta), ...ev);
    body.push(0, 0xff, 0x2f, 0);
    bytes.push(...ascii("MTrk"), ...u32(body.length), ...body);
  }
  return new Uint8Array(bytes);
}

/** A tempo event: `bpm` quarter notes a minute. */
export const tempo = (delta: number, bpm: number): TestEvent => {
  const us = Math.round(60e6 / bpm);
  return [delta, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255];
};

/** A drum hit (note on, channel 10) and nothing else: drum parts don't need note offs. */
export const hit = (delta: number, note: number, velocity = 100): TestEvent => [delta, 0x99, note, velocity];

/**
 * `bars` bars of a basic rock beat at `ppq`: closed hi-hat eighths, kick on 1
 * and 3, snare on 2 and 4.
 */
export function rockBeat(ppq: number, bars: number): TestEvent[] {
  const events: TestEvent[] = [];
  let last = 0;
  for (let bar = 0; bar < bars; bar++) {
    for (let eighth = 0; eighth < 8; eighth++) {
      const tick = (bar * 4 + eighth / 2) * ppq;
      const notes = [42];
      if (eighth === 0 || eighth === 4) notes.push(36);
      if (eighth === 2 || eighth === 6) notes.push(38);
      notes.forEach((n, i) => events.push(hit(i === 0 ? tick - last : 0, n)));
      last = tick;
    }
  }
  return events;
}

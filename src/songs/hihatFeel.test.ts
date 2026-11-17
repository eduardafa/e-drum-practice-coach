import { describe, expect, it } from "vitest";
import { feelAt, feelFromContrast, hihatStep } from "./hihatFeel";

const RATE = 44100;

/** A repeatable pseudo-random source, so the noise is the same on every run. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/**
 * A short song: a bass note on every eighth (low, with a soft attack) and a
 * closed hi-hat (bright noise burst) on the given quarters of each beat.
 * Returns the samples and its beat times.
 */
function song(bpm: number, hatSlots: readonly number[], { beats = 48, hatLevel = 0.3 } = {}) {
  const beat = 60 / bpm;
  const lead = 0.5;
  const samples = new Float32Array(Math.ceil((lead + beats * beat + 1) * RATE));
  const r = random(7);
  const times: number[] = [];
  for (let b = 0; b < beats; b++) {
    const t = lead + b * beat;
    times.push(t);
    for (let e = 0; e < 2; e++) {
      const n0 = Math.round((t + (e * beat) / 2) * RATE);
      // A 5 ms attack, like a played note: a note that starts at full level clicks across every frequency, as a hi-hat would.
      for (let i = 0; i < 0.2 * RATE; i++) {
        samples[n0 + i] += 0.3 * Math.min(1, i / (0.005 * RATE)) * Math.sin((2 * Math.PI * 55 * i) / RATE) * Math.exp(-i / (0.08 * RATE));
      }
    }
    for (const slot of hatSlots) {
      const n0 = Math.round((t + (slot * beat) / 4) * RATE);
      let p1 = 0, p2 = 0;
      for (let i = 0; i < 0.06 * RATE; i++) {
        const w = r() * 2 - 1;
        samples[n0 + i] += hatLevel * (w - 2 * p1 + p2) * 0.3 * Math.exp(-i / (0.012 * RATE));
        p2 = p1;
        p1 = w;
      }
    }
  }
  return { samples, beats: times, beat };
}

describe("hihatStep", () => {
  it("hears eighth notes: two hi-hat notes per beat", () => {
    const { samples, beats, beat } = song(110, [0, 2]);
    expect(hihatStep(samples, RATE, beats)).toBeCloseTo(beat / 2, 2);
  });

  it("hears sixteenth notes and quarter notes", () => {
    const sixteenths = song(95, [0, 1, 2, 3]);
    expect(hihatStep(sixteenths.samples, RATE, sixteenths.beats)).toBeCloseTo(sixteenths.beat / 4, 2);
    const quarters = song(90, [0]);
    expect(hihatStep(quarters.samples, RATE, quarters.beats)).toBeCloseTo(quarters.beat, 2);
  });

  it("says nothing without a hi-hat, with too few beats, or below 16 kHz sampling", () => {
    const none = song(100, []);
    expect(hihatStep(none.samples, RATE, none.beats)).toBeNull();
    const short = song(100, [0, 2], { beats: 8 });
    expect(hihatStep(short.samples, RATE, short.beats)).toBeNull();
    const eighths = song(100, [0, 2]);
    expect(hihatStep(eighths.samples, 11025, eighths.beats)).toBeNull();
  });
});

describe("feelFromContrast", () => {
  it("reads which quarters of the beat rise well above the background", () => {
    expect(feelFromContrast([7.8, 0.9, 6.2, 1])).toBe(2);
    expect(feelFromContrast([7.7, 5.4, 5.9, 5.5])).toBe(4);
    expect(feelFromContrast([7.3, 0.9, 1.1, 1])).toBe(1);
    // Off-beat hi-hat only ("&"): still eighth notes.
    expect(feelFromContrast([1.2, 0.9, 6.3, 1.1])).toBe(2);
  });

  it("stays quiet when a quarter is neither clearly played nor clearly empty, or the pattern is odd", () => {
    expect(feelFromContrast([7.8, 1.7, 6.2, 1])).toBeNull();
    expect(feelFromContrast([1.3, 1, 1, 1])).toBeNull();
    // "e" and "a" without the "&": not a groove pattern.
    expect(feelFromContrast([7, 4, 1, 4])).toBeNull();
  });
});

describe("feelAt", () => {
  it("turns the hi-hat step into notes per beat at the current tempo", () => {
    const step = 60 / 100 / 2; // eighths at 100 BPM
    expect(feelAt(step, 100)).toBe(2);
    // The drummer corrected the beat to twice as fast: the same hi-hat is now one per beat.
    expect(feelAt(step, 200)).toBe(1);
    // Half as fast: four per beat.
    expect(feelAt(step, 50)).toBe(4);
    // A tempo the step doesn't divide.
    expect(feelAt(step, 140)).toBeNull();
  });
});

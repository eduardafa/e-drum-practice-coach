import { describe, expect, it } from "vitest";
import { findBeats } from "./beats";
import { TEST_RATE, testSong, type TestSongOptions } from "./testSongs";

/** F-measure: the share of beats found within ±70 ms, balancing missed and extra ones (one-to-one). */
function fMeasure(found: readonly number[], truth: readonly number[], tolerance = 0.07): number {
  const used = new Set<number>();
  let hits = 0;
  for (const f of found) {
    let best = -1, bestError = tolerance;
    truth.forEach((t, i) => {
      const error = Math.abs(t - f);
      if (!used.has(i) && error <= bestError) {
        bestError = error;
        best = i;
      }
    });
    if (best >= 0) {
      used.add(best);
      hits++;
    }
  }
  const precision = found.length ? hits / found.length : 0, recall = truth.length ? hits / truth.length : 0;
  return precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
}

/** The best F over the true grid at the same, half (either phase) or double tempo. */
function fAnyLevel(found: readonly number[], truth: readonly number[]): number {
  const halves = [truth.filter((_, i) => i % 2 === 0), truth.filter((_, i) => i % 2 === 1)];
  const double = truth.flatMap((t, i) => (i + 1 < truth.length ? [t, (t + truth[i + 1]) / 2] : [t]));
  return Math.max(...[truth, ...halves, double].map((grid) => fMeasure(found, grid)));
}

function analyze(o: TestSongOptions) {
  const song = testSong(o);
  return { song, grid: findBeats(song.samples, TEST_RATE) };
}

describe("findBeats", () => {
  it("finds the beats and tempo of a steady song", () => {
    const { song, grid } = analyze({ bpm: 120, seconds: 20 });
    expect(fMeasure(grid.beats, song.beats)).toBeGreaterThan(0.95);
    expect(grid.bpm).toBeCloseTo(120, -0.5);
  });

  it("follows a gradual tempo change", () => {
    const { song, grid } = analyze({ bpm: 100, endBpm: 112, seconds: 30, seed: 3 });
    expect(fMeasure(grid.beats, song.beats)).toBeGreaterThan(0.9);
  });

  it("puts no beats in silence before the music starts", () => {
    const { song, grid } = analyze({ bpm: 128, seconds: 20, lead: 4, hats: 4, seed: 4 });
    expect(fMeasure(grid.beats, song.beats)).toBeGreaterThan(0.95);
    expect(grid.beats[0]).toBeGreaterThan(3.9);
  });

  it("handles a syncopated kick and a half-time feel", () => {
    const syncopated = analyze({ bpm: 90, seconds: 20, kick: [0, 3, 5], seed: 2 });
    expect(fMeasure(syncopated.grid.beats, syncopated.song.beats)).toBeGreaterThan(0.9);
    const halfTime = analyze({ bpm: 75, seconds: 24, snare: [4], seed: 5 });
    expect(fMeasure(halfTime.grid.beats, halfTime.song.beats)).toBeGreaterThan(0.9);
  });

  it("lands on the beat even at the wrong tempo level for a fast, noisy song (octave ambiguity)", () => {
    // 150 BPM can come out as 75: the beats found are still on the beat, every other one.
    const { song, grid } = analyze({ bpm: 150, seconds: 20, hats: 4, noise: 0.12, seed: 6 });
    expect(fAnyLevel(grid.beats, song.beats)).toBeGreaterThan(0.9);
  });

  it("guesses beat 1 from where the kick lands", () => {
    // Kick only on beat 1: the guess should land on a true downbeat (every 4th beat from the first).
    const { song, grid } = analyze({ bpm: 110, seconds: 20, kick: [0], seed: 7 });
    const downbeat = grid.beats[grid.firstDownbeat];
    const nearest = song.beats.reduce((best, t, i) => (Math.abs(t - downbeat) < Math.abs(song.beats[best] - downbeat) ? i : best), 0);
    expect(Math.abs(song.beats[nearest] - downbeat)).toBeLessThan(0.07);
    expect(nearest % 4).toBe(0);
  });

  it("reports progress up to 1, and copes with silence", () => {
    const steps: number[] = [];
    const grid = findBeats(new Float32Array(TEST_RATE * 3), TEST_RATE, (done) => steps.push(done));
    expect(steps.at(-1)).toBe(1);
    expect(steps.every((v, i) => i === 0 || v >= steps[i - 1])).toBe(true);
    expect(grid.beats.length).toBeLessThan(10);
  });
});

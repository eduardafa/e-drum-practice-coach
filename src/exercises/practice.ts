/**
 * Metronome settings that fit an exercise: its suggested tempo, its beats per
 * bar, and a subdivision fine enough to score every note.
 */
import type { MetronomeSettings, Subdivision } from "../audio/schedule";
import { ticksPerBeat, type Exercise } from "./types";

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** The smallest subdivision of the beat that every note lands on. */
export function subdivisionFor(exercise: Exercise): Subdivision {
  const beat = ticksPerBeat(exercise.timeSignature);
  let step = beat;
  for (const note of exercise.notes) step = gcd(step, note.tick % beat);
  const perBeat = beat / step;
  if (perBeat === 1 || perBeat === 2 || perBeat === 3 || perBeat === 4) return perBeat;
  // Sextuplets and the like: score against triplets if they divide by three, else sixteenths.
  return perBeat % 3 === 0 ? 3 : 4;
}

/** Keeps the drummer's own choice of clicking on subdivisions. */
export function metronomeForExercise(exercise: Exercise, clickSubdivisions: boolean): MetronomeSettings {
  return {
    bpm: exercise.tempo.suggested,
    beatsPerBar: exercise.timeSignature.beats,
    subdivision: subdivisionFor(exercise),
    clickSubdivisions,
  };
}

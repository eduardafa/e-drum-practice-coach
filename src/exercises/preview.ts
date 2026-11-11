/**
 * What a preview plays: one loop of an exercise as drum sounds, with a quiet
 * click on every beat so the drummer hears where the beat falls. Times are
 * seconds from the start of the loop; the player adds the audio-clock start.
 * A flam on the first note puts its grace note slightly before zero.
 */
import type { PadId } from "../kit/nitroMax";
import { exerciseLengthTicks, ticksPerBeat, type Dynamic, type Exercise } from "./types";

/** A flam's grace note sounds this long before the main stroke. */
export const FLAM_GAP_SEC = 0.03;

export interface PreviewHit {
  time: number;
  pad: PadId;
  dynamic: Dynamic;
  open: boolean;
  /** A quiet grace note just before a flam's main stroke. */
  grace: boolean;
}

export interface PreviewPlan {
  hits: PreviewHit[];
  beats: { time: number; downbeat: boolean }[];
  /** Length of the loop: the next downbeat would fall here. */
  durationSec: number;
}

export function previewPlan(exercise: Exercise, bpm: number): PreviewPlan {
  const beatTicks = ticksPerBeat(exercise.timeSignature);
  const secPerTick = 60 / bpm / beatTicks;
  const hits: PreviewHit[] = [];
  for (const n of exercise.notes) {
    const time = n.tick * secPerTick;
    const open = n.open === true;
    if (n.flam) hits.push({ time: time - FLAM_GAP_SEC, pad: n.pad, dynamic: "ghost", open, grace: true });
    hits.push({ time, pad: n.pad, dynamic: n.dynamic, open, grace: false });
  }
  hits.sort((a, b) => a.time - b.time);
  const lengthTicks = exerciseLengthTicks(exercise);
  const beats = Array.from({ length: lengthTicks / beatTicks }, (_, i) => ({
    time: i * beatTicks * secPerTick,
    downbeat: i % exercise.timeSignature.beats === 0,
  }));
  return { hits, beats, durationSec: lengthTicks * secPerTick };
}

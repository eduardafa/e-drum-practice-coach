/**
 * Wait mode: learning what to play before playing it in time. There's no
 * clock; the exercise is split into steps (the notes that sound together),
 * and the session waits on each step until every one of its pads has been
 * hit, then moves to the next, looping a set number of times. Wrong pads are
 * counted but never block. Pure, so a whole run is tested with made-up hits.
 */
import { exerciseLengthTicks, type Exercise } from "../exercises/types";
import type { PadId } from "../kit/nitroMax";
import type { PadCue } from "./cues";
import { voiceMatches, type PlayedHit } from "./matcher";

interface StepNote {
  pad: PadId;
  open: boolean;
  flam: boolean;
}

export interface LearnStep {
  tick: number;
  notes: StepNote[];
}

export type LearnEvent = "correct" | "wrong" | "advanced" | "done" | "ignored";

/** A flam's second stroke can follow the step it completed by this much without counting as wrong. */
const FLAM_STROKE_MS = 150;
/** How faintly the step after the current one is cued, as a preview. */
const NEXT_STEP_CUE = 0.3;

/** The exercise's notes grouped by tick, in order. */
export function learnSteps(exercise: Exercise): LearnStep[] {
  const byTick = new Map<number, StepNote[]>();
  for (const n of exercise.notes) {
    const notes = byTick.get(n.tick) ?? [];
    notes.push({ pad: n.pad, open: n.open === true, flam: n.flam === true });
    byTick.set(n.tick, notes);
  }
  return [...byTick].toSorted(([a], [b]) => a - b).map(([tick, notes]) => ({ tick, notes }));
}

export class LearnSession {
  readonly steps: readonly LearnStep[];
  private readonly lengthTicks: number;
  private loop = 0;
  private stepIndex = 0;
  /** Which notes of the current step have been hit. */
  private played: boolean[];
  private wrong = 0;
  /** The step just completed and when, so a flam's second stroke isn't counted as wrong. */
  private lastCompleted: { step: LearnStep; time: number } | null = null;

  constructor(
    readonly exercise: Exercise,
    readonly loops: number,
  ) {
    this.steps = learnSteps(exercise);
    this.lengthTicks = exerciseLengthTicks(exercise);
    this.played = this.freshStep();
  }

  get done(): boolean {
    return this.loop >= this.loops || this.steps.length === 0;
  }

  /** The loop being played, from 0 (equal to `loops` once done). */
  get currentLoop(): number {
    return this.loop;
  }

  get wrongHits(): number {
    return this.wrong;
  }

  /** Matches one hit against the current step. */
  hit(hit: PlayedHit): LearnEvent {
    if (this.done) return "ignored";
    // A flam is two strokes close together. The second belongs to the step it just completed,
    // even if the next step is on the same pad (flam taps), so check it first.
    const last = this.lastCompleted;
    if (last && hit.time - last.time <= FLAM_STROKE_MS && last.step.notes.some((n) => n.flam && voiceMatches(n, hit))) {
      this.lastCompleted = null;
      return "ignored";
    }
    const step = this.steps[this.stepIndex];
    const index = step.notes.findIndex((n, i) => !this.played[i] && voiceMatches(n, hit));
    if (index === -1) {
      this.wrong++;
      return "wrong";
    }
    this.played[index] = true;
    if (!this.played.every(Boolean)) return "correct";

    this.lastCompleted = { step, time: hit.time };
    this.stepIndex++;
    if (this.stepIndex >= this.steps.length) {
      this.stepIndex = 0;
      this.loop++;
    }
    this.played = this.freshStep();
    return this.done ? "done" : "advanced";
  }

  /** The pads still to hit in this step at full strength, and the next step's pads faintly. */
  cues(): PadCue[] {
    if (this.done) return [];
    const cues = new Map<PadId, number>();
    const next = this.steps[(this.stepIndex + 1) % this.steps.length];
    const isLastStep = this.stepIndex === this.steps.length - 1 && this.loop === this.loops - 1;
    if (!isLastStep) for (const n of next.notes) cues.set(n.pad, NEXT_STEP_CUE);
    this.steps[this.stepIndex].notes.forEach((n, i) => {
      if (!this.played[i]) cues.set(n.pad, 1);
    });
    return [...cues].map(([pad, strength]) => ({ pad, strength }));
  }

  /** The current step's position, counting loops, for the staff's playhead (the layout wraps it); null once done. */
  currentTick(): number | null {
    if (this.done) return null;
    return this.loop * this.lengthTicks + this.steps[this.stepIndex].tick;
  }

  private freshStep(): boolean[] {
    return (this.steps[this.stepIndex]?.notes ?? []).map(() => false);
  }
}

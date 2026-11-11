/**
 * Plays one loop of an exercise so the drummer can hear it before playing.
 *
 * A loop is at most a few dozen strokes over a few seconds, so every stroke
 * is scheduled on the audio clock up front: Web Audio plays scheduled nodes
 * sample-accurately, and nothing can change mid-loop (tempo is fixed). The
 * metronome needs a lookahead scheduler because it runs indefinitely and its
 * tempo can change while it plays; a preview does neither. Stopping
 * disconnects the preview's output, which silences anything still scheduled.
 */
import { previewPlan } from "../exercises/preview";
import type { Exercise } from "../exercises/types";
import { playClick, playPad } from "./voices";

/** Room to schedule the first stroke (and a flam's grace note before it). */
const START_DELAY_SEC = 0.1;
/** Let the last stroke ring before calling the preview finished. */
const TAIL_SEC = 0.4;

interface Playing {
  exerciseId: string;
  ctx: AudioContext;
  out: GainNode;
  startTime: number;
  durationSec: number;
  timer: ReturnType<typeof setTimeout>;
}

export class PreviewPlayer {
  private playing: Playing | null = null;

  /** The exercise being previewed, or null. */
  get exerciseId(): string | null {
    return this.playing?.exerciseId ?? null;
  }

  /** Plays one loop at `bpm`, replacing any preview already playing. `onEnd` runs when it finishes by itself. */
  play(ctx: AudioContext, exercise: Exercise, bpm: number, volume: number, onEnd: () => void): void {
    this.stop();
    const plan = previewPlan(exercise, bpm);
    const out = ctx.createGain();
    out.gain.value = volume;
    out.connect(ctx.destination);
    const startTime = ctx.currentTime + START_DELAY_SEC;
    for (const beat of plan.beats) playClick(ctx, out, startTime + beat.time, beat.downbeat ? "downbeat" : "beat", 0.25);
    for (const hit of plan.hits) playPad(ctx, out, hit.pad, startTime + hit.time, hit.dynamic, hit.open);
    const timer = setTimeout(
      () => {
        this.stop();
        onEnd();
      },
      (START_DELAY_SEC + plan.durationSec + TAIL_SEC) * 1000,
    );
    this.playing = { exerciseId: exercise.id, ctx, out, startTime, durationSec: plan.durationSec, timer };
  }

  stop(): void {
    const p = this.playing;
    if (!p) return;
    clearTimeout(p.timer);
    p.out.disconnect();
    this.playing = null;
  }

  /** How far through the loop the preview is, 0 to 1, or null before it starts and after the loop. */
  progress(): number | null {
    const p = this.playing;
    if (!p) return null;
    // What's heard now was scheduled outputLatency ago.
    const elapsed = p.ctx.currentTime - (p.ctx.outputLatency || 0) - p.startTime;
    return elapsed < 0 || elapsed >= p.durationSec ? null : elapsed / p.durationSec;
  }
}

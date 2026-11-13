/**
 * The guide track: the exercise's drum sounds playing along with the click
 * during a session, so a beginner hears what the pattern should sound like.
 * One loop is scheduled at a time, on the audio clock, when the metronome
 * schedules that loop's first beat, so it stays locked to the click. Every
 * stroke goes through one gain node, and stopping disconnects it, which
 * silences anything still scheduled (as the preview does).
 */
import type { PreviewPlan } from "../exercises/preview";
import { playPad } from "./voices";

/** Quieter than the click, so the drummer's own playing stays on top. */
export const GUIDE_LEVEL = 0.45;

/** The strokes of one loop starting at `loopStart` (audio seconds), skipping any already in the past. */
export function guideStrokes(plan: PreviewPlan, loopStart: number, now: number): PreviewPlan["hits"] {
  return plan.hits
    .filter((h) => loopStart + h.time >= now)
    .map((h) => ({ time: loopStart + h.time, pad: h.pad, dynamic: h.dynamic, open: h.open, grace: h.grace }));
}

export class GuideTrack {
  private out: GainNode | null = null;

  /** Schedules one loop of `plan` starting at `loopStart` (audio-clock seconds). */
  scheduleLoop(ctx: BaseAudioContext, plan: PreviewPlan, loopStart: number, volume: number): void {
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.connect(ctx.destination);
    }
    this.out.gain.value = Math.min(1, volume) * GUIDE_LEVEL;
    for (const h of guideStrokes(plan, loopStart, ctx.currentTime)) playPad(ctx, this.out, h.pad, h.time, h.dynamic, h.open);
  }

  /** Silences everything scheduled. The next loop starts a fresh output. */
  stop(): void {
    this.out?.disconnect();
    this.out = null;
  }
}

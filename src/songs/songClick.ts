/**
 * A click on a song's beats, to hear whether the grid lines up: the higher
 * click on each beat 1. Clicks are scheduled a little ahead on the audio
 * clock (like the metronome), so they land exactly on the beat whatever the
 * frame rate; a pause, seek or grid change cancels the ones not yet played.
 */
import { playClick } from "../audio/voices";
import type { BeatGrid } from "./beats";
import { planWindows, type PassCursor, type SongPlayer } from "./player";

/** How far ahead clicks are scheduled, in seconds of song. More than a few frames, so a slow frame doesn't drop one. */
const LOOKAHEAD_SEC = 0.25;

export interface SongBeat {
  /** Index in the grid. */
  index: number;
  /** Song time, seconds. */
  time: number;
  downbeat: boolean;
}

/** Whether beat `index` of the grid is a beat 1. */
export function isDownbeat(grid: BeatGrid, index: number): boolean {
  return index >= grid.firstDownbeat && (index - grid.firstDownbeat) % 4 === 0;
}

/** The grid's beats from index `from` on, up to song time `until` (inclusive). */
export function beatsUntil(grid: BeatGrid, from: number, until: number): SongBeat[] {
  const out: SongBeat[] = [];
  for (let i = Math.max(0, from); i < grid.beats.length && grid.beats[i] <= until; i++) {
    out.push({ index: i, time: grid.beats[i], downbeat: isDownbeat(grid, i) });
  }
  return out;
}

/** The index of the first beat at or after song time `seconds` (the beat count if none). */
export function firstBeatFrom(grid: BeatGrid, seconds: number): number {
  const i = grid.beats.findIndex((b) => b >= seconds);
  return i === -1 ? grid.beats.length : i;
}

export class SongClick {
  private scheduled: OscillatorNode[] = [];
  /** Where planning got to, pass by pass (EDU-121: a loop's new pass starts again from its start). */
  private cursor: PassCursor = { pass: -1, next: 0 };
  /** What the scheduled clicks were planned against; any change means replanning. */
  private plannedFor: { run: number; grid: BeatGrid } | null = null;

  /** Call often (every frame) while the song panel is open. Does nothing but cancel when `grid` is null. */
  tick(ctx: AudioContext | null, out: AudioNode | null, player: SongPlayer, grid: BeatGrid | null, volume = 1): void {
    if (!ctx || !out || !grid || !player.playing) {
      this.cancel();
      return;
    }
    if (this.plannedFor?.run !== player.run || this.plannedFor.grid !== grid) {
      this.cancel();
      this.plannedFor = { run: player.run, grid };
      this.cursor = { pass: -1, next: 0 };
    }
    planWindows(
      player.windows(LOOKAHEAD_SEC),
      ctx.currentTime + LOOKAHEAD_SEC,
      this.cursor,
      grid.beats.length,
      (i) => grid.beats[i],
      (sec) => firstBeatFrom(grid, sec),
      (i, at) => {
        // A beat already under way is skipped rather than clicked late.
        if (at < ctx.currentTime) return;
        this.scheduled.push(playClick(ctx, out, at, isDownbeat(grid, i) ? "downbeat" : "beat", volume));
      },
    );
    // Forget the clicks that have played.
    if (this.scheduled.length > 16) this.scheduled = this.scheduled.slice(-8);
  }

  /** Silences clicks scheduled but not yet played. */
  cancel(): void {
    for (const osc of this.scheduled) {
      try {
        osc.stop();
      } catch {
        // Already stopped.
      }
    }
    this.scheduled = [];
    this.plannedFor = null;
  }
}

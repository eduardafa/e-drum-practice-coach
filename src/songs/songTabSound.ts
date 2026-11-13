/**
 * "Hear the tab": the tab's drum sounds played over the song, to check it
 * lines up. Like the beat click, sounds are scheduled a little ahead on the
 * audio clock from the song's position. They go through their own gain node,
 * so a pause, seek or new placement silences the ones not yet played by
 * disconnecting it.
 */
import { playPad } from "../audio/voices";
import type { PlacedNote } from "./drumTab";
import type { SongPlayer } from "./player";

/** How far ahead sounds are scheduled, in seconds of song. */
const LOOKAHEAD_SEC = 0.25;

/** The index of the first note at or after song time `seconds` (notes in time order). */
export function firstNoteFrom(notes: readonly PlacedNote[], seconds: number): number {
  let lo = 0, hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (notes[mid].time < seconds) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class SongTabSound {
  private out: GainNode | null = null;
  private next = 0;
  private plannedFor: { run: number; notes: readonly PlacedNote[] } | null = null;

  /** Call every frame while the song is shown; `notes` null (or not playing) silences it. */
  tick(ctx: AudioContext | null, player: SongPlayer, notes: readonly PlacedNote[] | null, volume: number): void {
    if (!ctx || !notes || !player.playing) {
      this.cancel();
      return;
    }
    if (this.plannedFor?.run !== player.run || this.plannedFor.notes !== notes || !this.out) {
      this.cancel();
      this.out = ctx.createGain();
      this.out.connect(ctx.destination);
      this.plannedFor = { run: player.run, notes };
      this.next = firstNoteFrom(notes, player.position());
    }
    this.out.gain.value = volume;
    const until = player.position() + LOOKAHEAD_SEC;
    while (this.next < notes.length && notes[this.next].time <= until) {
      const note = notes[this.next++];
      const at = player.audioTimeAt(note.time);
      if (at !== null && at >= ctx.currentTime) playPad(ctx, this.out, note.pad, at, "normal", note.open);
    }
  }

  cancel(): void {
    this.out?.disconnect();
    this.out = null;
    this.plannedFor = null;
  }
}

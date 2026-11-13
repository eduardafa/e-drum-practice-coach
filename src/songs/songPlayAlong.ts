/**
 * Drumming along to a song, scored against its beats. Like the metronome's
 * scheduler, it runs a little ahead of the music: each tick turns the song's
 * next steps (beats, and the counts between them) into audio-clock times,
 * maps those to performance.now() with the same clock mapping, and writes
 * them to the timing grid (for scoring) and the live counts (for the big
 * count and beat pulse). So hits are scored exactly as against clicks:
 * latency calibration and the on-time window apply unchanged.
 */
import { ClockMapper, sampleClocks } from "../audio/clock";
import type { Subdivision } from "../audio/schedule";
import type { LiveState } from "../live/liveState";
import type { TimingGrid } from "../timing/grid";
import type { BeatGrid } from "./beats";
import type { SongPlayer } from "./player";
import { cursorAt, takeSongSteps, type SongCursor } from "./songSteps";

/** How far ahead steps are planned, in seconds of song: well over a tick, so a late tick never misses one. */
const LOOKAHEAD_SEC = 0.5;

export class SongPlayAlong {
  private readonly clock = new ClockMapper();
  private cursor: SongCursor | null = null;
  /** The playback run the steps were planned for; a seek starts a new one. */
  private run = -1;

  constructor(
    readonly grid: BeatGrid,
    readonly subdivision: Subdivision,
  ) {}

  /** Plans the steps due soon. Call every few tens of ms while the song plays. */
  tick(ctx: AudioContext, player: SongPlayer, timing: TimingGrid, live: LiveState): void {
    if (!player.playing) return;
    this.clock.update(sampleClocks(ctx));
    if (player.run !== this.run || !this.cursor) {
      // Started, or moved to another point: plan again from where the song is.
      this.run = player.run;
      this.cursor = cursorAt(this.grid, this.subdivision, player.position());
      timing.clear();
      live.beats.length = 0;
      live.counts.length = 0;
    }
    for (const step of takeSongSteps(this.grid, this.subdivision, this.cursor, player.position() + LOOKAHEAD_SEC)) {
      const at = player.audioTimeAt(step.time);
      if (at === null) continue;
      const time = this.clock.toPerformanceMs(at);
      timing.add({ time, intervalMs: step.intervalSec * 1000, beat: step.beat, downbeat: step.downbeat });
      live.addCount({ time, index: step.index, label: step.label, bar: step.bar });
      if (step.beat) live.addBeat({ time, downbeat: step.downbeat });
    }
  }
}

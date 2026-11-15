/**
 * Drumming along to a song, scored against its beats. Like the metronome's
 * scheduler, it runs a little ahead of the music: each tick turns the song's
 * next steps (beats, and the counts between them) into audio-clock times,
 * maps those to performance.now() with the same clock mapping, and writes
 * them to the timing grid (for scoring) and the live counts (for the big
 * count and beat pulse). So hits are scored exactly as against clicks:
 * latency calibration and the on-time window apply unchanged.
 *
 * With a drum tab open, each of its notes is scored too (the right pad, in
 * time), through SongTabScoring, with the same clock mapping.
 */
import { ClockMapper, sampleClocks } from "../audio/clock";
import type { Subdivision } from "../audio/schedule";
import type { LiveState } from "../live/liveState";
import type { PlayedHit } from "../playalong/matcher";
import type { ScoringOptions } from "../timing/grid";
import type { TimingGrid } from "../timing/grid";
import type { BeatGrid } from "./beats";
import type { PlacedNote } from "./drumTab";
import { windowAudioTime, windowUntil, type SongPlayer } from "./player";
import { cursorAt, takeSongSteps, type SongCursor } from "./songSteps";
import { SongTabScoring } from "./tabScoring";

/** How far ahead steps are planned, in seconds of song: well over a tick, so a late tick never misses one. */
const LOOKAHEAD_SEC = 0.5;

export class SongPlayAlong {
  private readonly clock = new ClockMapper();
  private cursor: SongCursor | null = null;
  /** The playback run the steps were planned for; a seek starts a new one. */
  private run = -1;
  /** The loop pass the cursors are in (EDU-121): each new pass plans again from the loop's start. */
  private pass = -1;
  private tabScoring: SongTabScoring | null = null;

  constructor(
    readonly grid: BeatGrid,
    readonly subdivision: Subdivision,
    private readonly scoring: ScoringOptions,
    /** The drum tab's notes in song time, or null when no tab is open. */
    private tab: readonly PlacedNote[] | null = null,
  ) {}

  /** The open tab changed (opened, moved, removed): its scoring starts again from where the song is. */
  setTab(tab: readonly PlacedNote[] | null): void {
    this.tab = tab;
    this.tabScoring = null;
  }

  /** The tab's note-by-note scoring for this stretch of playing, or null with no tab. */
  get tabScore(): SongTabScoring | null {
    return this.tabScoring;
  }

  /** Scores a hit against the tab's notes, if a tab is open. */
  hit(hit: PlayedHit): void {
    this.tabScoring?.hit(hit);
  }

  /** Plans the steps due soon. Call every few tens of ms while the song plays. */
  tick(ctx: AudioContext, player: SongPlayer, timing: TimingGrid, live: LiveState): void {
    if (!player.playing) return;
    this.clock.update(sampleClocks(ctx));
    if (player.run !== this.run || !this.cursor) {
      // Started, or moved to another point: plan again from where the song is.
      this.run = player.run;
      this.pass = -1;
      this.cursor = cursorAt(this.grid, this.subdivision, player.position());
      timing.clear();
      live.beats.length = 0;
      live.counts.length = 0;
      this.tabScoring = null;
    }
    if (this.tab && !this.tabScoring) this.tabScoring = new SongTabScoring(this.tab, this.scoring, player.position());
    const horizon = ctx.currentTime + LOOKAHEAD_SEC;
    for (const w of player.windows(LOOKAHEAD_SEC)) {
      if (w.pass < this.pass) continue;
      if (w.pass > this.pass) {
        // The first window carries on from the cursors set above; a later pass is the loop
        // again, so the counts and the tab's notes start over from its start.
        if (this.pass >= 0) {
          this.cursor = cursorAt(this.grid, this.subdivision, w.from);
          this.tabScoring?.rewind(w.from);
        }
        this.pass = w.pass;
      }
      const until = windowUntil(w, horizon);
      for (const step of takeSongSteps(this.grid, this.subdivision, this.cursor, Math.min(until, w.to))) {
        const time = this.clock.toPerformanceMs(windowAudioTime(w, step.time));
        timing.add({ time, intervalMs: step.intervalSec * 1000, beat: step.beat, downbeat: step.downbeat });
        live.addCount({ time, index: step.index, label: step.label, bar: step.bar });
        if (step.beat) live.addBeat({ time, downbeat: step.downbeat });
      }
      // Up to, not including, the loop's end: a note there is the next pass's first.
      this.tabScoring?.plan(Math.min(until, w.to - 1e-6), (sec) => this.clock.toPerformanceMs(windowAudioTime(w, sec)));
    }
    this.tabScoring?.tick(performance.now());
  }
}

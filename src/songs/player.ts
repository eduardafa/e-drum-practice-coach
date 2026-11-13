/**
 * Plays an opened song on the app's audio context (the metronome's), so the
 * song and anything scored against it share one clock. An AudioBufferSourceNode
 * can only start once, so each play or seek starts a new one from the wanted
 * offset; the position is worked out from the audio clock, never from timers.
 */

export interface PlayState {
  /** Song position (s) when playback last started or paused. */
  offset: number;
  /** Audio-clock time (s) when playback last started (or will start, after a countdown), or null while paused. */
  startedAt: number | null;
}

/** Where in the song playback is at audio time `now`, kept within 0..duration. Before a delayed start, where it will start. */
export function positionAt(state: PlayState, now: number, duration: number): number {
  const pos = state.startedAt === null ? state.offset : state.offset + Math.max(0, now - state.startedAt);
  return Math.min(duration, Math.max(0, pos));
}

/** The audio-clock time at which song position `seconds` plays, or null while paused. */
export function audioTimeAt(state: PlayState, seconds: number): number | null {
  return state.startedAt === null ? null : state.startedAt + (seconds - state.offset);
}

export class SongPlayer {
  private buffer: AudioBuffer | null = null;
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private state: PlayState = { offset: 0, startedAt: null };
  private runs = 0;
  /** Called when the song reaches its end by itself. */
  onEnded: (() => void) | null = null;

  get loaded(): boolean {
    return this.buffer !== null;
  }

  get playing(): boolean {
    return this.state.startedAt !== null;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  /** Replaces the song; playback stops and returns to the start. */
  load(buffer: AudioBuffer | null): void {
    this.stop();
    this.buffer = buffer;
    this.state = { offset: 0, startedAt: null };
  }

  /**
   * Counts each start of playback (a play, resume or seek while playing), so
   * anything scheduled against the song knows when its timing went stale.
   */
  get run(): number {
    return this.runs;
  }

  /** The audio-clock time at which song position `seconds` plays, or null while paused. */
  audioTimeAt(seconds: number): number | null {
    return audioTimeAt(this.state, seconds);
  }

  /** The current position in seconds. */
  position(): number {
    return this.ctx ? positionAt(this.state, this.ctx.currentTime, this.duration) : this.state.offset;
  }

  /**
   * Starts (or resumes) playback on `ctx`, from the current position, or from
   * the start if it's at the end. `at` delays the start to that audio time
   * (after a get-ready countdown); by default it starts now.
   */
  play(ctx: AudioContext, volume: number, at = ctx.currentTime): void {
    if (!this.buffer || this.playing) return;
    this.ctx = ctx;
    if (!this.gain || this.gain.context !== ctx) {
      this.gain = ctx.createGain();
      this.gain.connect(ctx.destination);
    }
    this.gain.gain.value = volume;
    const from = this.state.offset >= this.duration - 0.05 ? 0 : this.state.offset;
    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.gain);
    source.addEventListener(
      "ended",
      () => {
        // Only a source that ran to the end clears the state; a stopped one was replaced on purpose.
        if (this.source !== source) return;
        this.source = null;
        this.state = { offset: this.duration, startedAt: null };
        this.onEnded?.();
      },
      { once: true },
    );
    const when = Math.max(at, ctx.currentTime);
    source.start(when, from);
    this.source = source;
    this.runs += 1;
    this.state = { offset: from, startedAt: when };
  }

  /** Pauses, keeping the position. */
  pause(): void {
    if (!this.playing) return;
    const pos = this.position();
    this.stopSource();
    this.state = { offset: pos, startedAt: null };
  }

  /** Stops and goes back to the start (as for a new song or another mode taking over). */
  stop(): void {
    this.stopSource();
    this.state = { offset: 0, startedAt: null };
  }

  /** Moves to `seconds`, continuing to play if it was playing. */
  seek(seconds: number, volume: number): void {
    const target = Math.min(this.duration, Math.max(0, seconds));
    const ctx = this.ctx;
    const wasPlaying = this.playing;
    this.stopSource();
    this.state = { offset: target, startedAt: null };
    if (wasPlaying && ctx) this.play(ctx, volume);
  }

  private stopSource(): void {
    const source = this.source;
    this.source = null;
    if (source) {
      try {
        source.stop();
      } catch {
        // Already ended.
      }
      source.disconnect();
    }
  }
}

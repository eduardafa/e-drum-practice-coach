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
  /**
   * Song seconds per second of audio (EDU-122): 0.7 plays at 70% speed, from a
   * slowed copy of the audio. Everything here is in song time; this converts.
   */
  rate?: number;
}

/** A section of the song that repeats (EDU-121), in song seconds: from `start` up to (not including) `end`. */
export interface SongLoop {
  start: number;
  end: number;
}

/**
 * Where in the song playback is at audio time `now`, kept within 0..duration.
 * Before a delayed start, where it will start. With a loop, past its end it
 * wraps back to its start, as the audio does.
 */
export function positionAt(state: PlayState, now: number, duration: number, loop: SongLoop | null = null): number {
  const rate = state.rate ?? 1;
  let pos = state.startedAt === null ? state.offset : state.offset + Math.max(0, now - state.startedAt) * rate;
  if (loop && state.startedAt !== null && pos >= loop.end) {
    pos = loop.start + ((pos - loop.end) % (loop.end - loop.start));
  }
  return Math.min(duration, Math.max(0, pos));
}

/**
 * A stretch of the song that plays without a jump: song time `from` up to
 * (not including) `to`, heard from audio time `audioStart`. Without a loop
 * there's one, to the end of the song. With one, the first runs to the loop's
 * end and each later `pass` is the loop again.
 */
export interface PlayWindow {
  pass: number;
  from: number;
  to: number;
  audioStart: number;
  /** Song seconds per audio second (EDU-122); 1 at full speed. */
  rate: number;
}

/** The audio time at which song time `seconds` plays in this window. */
export const windowAudioTime = (w: PlayWindow, seconds: number) => w.audioStart + (seconds - w.from) / w.rate;

/** The last song time in this window whose audio time is before `audioUntil`. */
export const windowUntil = (w: PlayWindow, audioUntil: number) => Math.min(w.to, w.from + (audioUntil - w.audioStart) * w.rate);

/** Where a scheduler got to in a list of timed items: the loop pass, and the next item in it. */
export interface PassCursor {
  pass: number;
  next: number;
}

/**
 * Walks the windows (from songWindows), handing `emit` each item due before
 * audio time `audioUntil`, with the audio time it plays at. Items are indexes
 * into a list sorted by song time (`timeOf` gives each one's time, `firstFrom`
 * the first at or after a song time). `cursor` carries on across calls: within
 * a pass it moves on, and a new pass starts again from its window's start. An
 * item at a window's end belongs to the next pass (a loop's end is its start).
 */
export function planWindows(
  windows: readonly PlayWindow[],
  audioUntil: number,
  cursor: PassCursor,
  count: number,
  timeOf: (i: number) => number,
  firstFrom: (seconds: number) => number,
  emit: (i: number, audioTime: number) => void,
): void {
  for (const w of windows) {
    if (w.pass < cursor.pass) continue;
    if (w.pass > cursor.pass) {
      cursor.pass = w.pass;
      cursor.next = firstFrom(w.from);
    }
    const until = windowUntil(w, audioUntil);
    while (cursor.next < count) {
      const t = timeOf(cursor.next);
      if (t > until || t >= w.to) break;
      emit(cursor.next, windowAudioTime(w, t));
      cursor.next += 1;
    }
  }
}

/** No loop pass is shorter than this, so a window list stays short. */
const MAX_PASSES = 8;

/**
 * The windows that play between audio times `now` and `now + ahead`, in
 * order: what schedulers plan clicks, sounds and scoring against, so a loop's
 * jump back is exact on the audio clock. Empty while paused.
 */
export function songWindows(state: PlayState, loop: SongLoop | null, duration: number, now: number, ahead: number): PlayWindow[] {
  if (state.startedAt === null) return [];
  const rate = state.rate ?? 1;
  const horizon = now + ahead;
  const first: PlayWindow = { pass: 0, from: state.offset, to: loop ? loop.end : duration, audioStart: state.startedAt, rate };
  // Audio seconds the first window and each loop pass last.
  const firstEnd = first.audioStart + (first.to - first.from) / rate;
  const out: PlayWindow[] = [];
  if (firstEnd > now) out.push(first);
  if (!loop) return out;
  const length = (loop.end - loop.start) / rate;
  // The pass playing at `now`, then on until the horizon.
  const sinceFirstEnd = now - firstEnd;
  let pass = Math.max(1, sinceFirstEnd > 0 ? Math.floor(sinceFirstEnd / length) + 1 : 1);
  for (let n = 0; n < MAX_PASSES; n++, pass++) {
    const audioStart = firstEnd + (pass - 1) * length;
    if (audioStart >= horizon) break;
    out.push({ pass, from: loop.start, to: loop.end, audioStart, rate });
  }
  return out;
}

/** The audio-clock time at which song position `seconds` plays, or null while paused. */
export function audioTimeAt(state: PlayState, seconds: number): number | null {
  return state.startedAt === null ? null : state.startedAt + (seconds - state.offset) / (state.rate ?? 1);
}

export class SongPlayer {
  /** The song as opened: its length and time are the song's. */
  private original: AudioBuffer | null = null;
  /** What plays: the original, or a slowed copy of it (EDU-122). */
  private buffer: AudioBuffer | null = null;
  /** Song seconds per audio second of `buffer`. */
  private rate = 1;
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private state: PlayState = { offset: 0, startedAt: null };
  private loopState: SongLoop | null = null;
  private runs = 0;
  /** Called when the song reaches its end by itself. */
  onEnded: (() => void) | null = null;

  get loaded(): boolean {
    return this.buffer !== null;
  }

  get playing(): boolean {
    return this.state.startedAt !== null;
  }

  /** The song's length in seconds (of the song, whatever the speed). */
  get duration(): number {
    return this.original?.duration ?? 0;
  }

  /** The playback speed: 1, or e.g. 0.7 while a slowed copy plays. */
  get speed(): number {
    return this.rate;
  }

  /** Replaces the song; playback stops and returns to the start, at full speed, with no loop. */
  load(buffer: AudioBuffer | null): void {
    this.stop();
    this.original = buffer;
    this.buffer = buffer;
    this.rate = 1;
    this.loopState = null;
    this.state = { offset: 0, startedAt: null };
  }

  /**
   * Plays at `speed` from now on (EDU-122): `slowed` is the song stretched to
   * that speed (its length is the song's divided by `speed`); full speed goes
   * back to the original. Carries on from the same song position, starting a
   * new run, so everything scheduled plans again.
   */
  setSpeed(speed: number, slowed: AudioBuffer | null, volume: number): void {
    if (!this.original) return;
    if (speed === 1 || !slowed) {
      this.buffer = this.original;
      this.rate = 1;
    } else {
      this.buffer = slowed;
      this.rate = speed;
    }
    this.seek(this.position(), volume);
  }

  /**
   * Counts each start of playback (a play, resume or seek while playing), so
   * anything scheduled against the song knows when its timing went stale.
   */
  get run(): number {
    return this.runs;
  }

  /** The current position in seconds. */
  position(): number {
    return this.ctx ? positionAt(this.state, this.ctx.currentTime, this.duration, this.loopState) : this.state.offset;
  }

  /** The section that repeats, or null. */
  get loop(): SongLoop | null {
    return this.loopState;
  }

  /**
   * Sets (or clears, with null) the section that repeats. While playing,
   * playback carries on from where it is, moved into the section if it's
   * outside; that starts a new run, so everything scheduled plans again.
   */
  setLoop(loop: SongLoop | null, volume: number): void {
    const valid = loop && loop.end - loop.start >= 0.25 && loop.start >= 0 && loop.end <= this.duration ? loop : null;
    this.loopState = valid;
    this.seek(this.position(), volume);
  }

  /**
   * The audio time at which this run's first pass ends: the loop's end (or the
   * song's), reached from where playback started. Null while paused.
   */
  firstPassEnd(): number | null {
    const { startedAt, offset } = this.state;
    if (startedAt === null) return null;
    const end = this.loopState ? this.loopState.end : this.duration;
    return startedAt + (end - offset) / this.rate;
  }

  /** What plays in the next `ahead` seconds of audio, window by window (see songWindows). */
  windows(ahead: number): PlayWindow[] {
    return this.ctx ? songWindows(this.state, this.loopState, this.duration, this.ctx.currentTime, ahead) : [];
  }

  /** `seconds` moved into the loop, if there is one and it's outside it. */
  private intoLoop(seconds: number): number {
    const loop = this.loopState;
    return loop && (seconds < loop.start || seconds >= loop.end) ? loop.start : seconds;
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
    const from = this.intoLoop(this.state.offset >= this.duration - 0.05 ? 0 : this.state.offset);
    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    // The audio itself repeats the section, sample-accurately, with no timer involved.
    if (this.loopState) {
      source.loop = true;
      // In the playing buffer's own time: a slowed copy is longer by 1 / rate.
      source.loopStart = this.loopState.start / this.rate;
      source.loopEnd = this.loopState.end / this.rate;
    }
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
    source.start(when, from / this.rate);
    this.source = source;
    this.runs += 1;
    this.state = { offset: from, startedAt: when, rate: this.rate };
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

  /** Moves to `seconds` (into the loop, if one is set), continuing to play if it was playing. */
  seek(seconds: number, volume: number): void {
    const target = this.intoLoop(Math.min(this.duration, Math.max(0, seconds)));
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

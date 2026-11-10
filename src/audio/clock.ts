/**
 * Maps the Web Audio clock (AudioContext.currentTime, in seconds) onto the
 * performance.now() clock (ms) that MIDI timestamps use.
 *
 * The two clocks drift apart slowly and jitter a bit when sampled, so we
 * keep a smoothed offset instead of trusting any single sample.
 */

export interface ClockSample {
  /** Audio clock time, in seconds. */
  contextTime: number;
  /** performance.now() time at which that audio frame is heard, in ms. */
  performanceTime: number;
}

export class ClockMapper {
  /** performanceTime - contextTime * 1000, smoothed. */
  private offsetMs: number | null = null;

  /**
   * @param smoothing weight given to each new sample (0..1). Low values
   *   reject jitter, high values follow drift faster.
   * @param maxJumpMs a sample this far from the current estimate replaces
   *   it outright (e.g. after the tab was suspended or the output device changed).
   */
  constructor(
    private readonly smoothing = 0.1,
    private readonly maxJumpMs = 50,
  ) {}

  update(sample: ClockSample): void {
    const raw = sample.performanceTime - sample.contextTime * 1000;
    if (this.offsetMs === null || Math.abs(raw - this.offsetMs) > this.maxJumpMs) {
      this.offsetMs = raw;
    } else {
      this.offsetMs += (raw - this.offsetMs) * this.smoothing;
    }
  }

  get ready(): boolean {
    return this.offsetMs !== null;
  }

  reset(): void {
    this.offsetMs = null;
  }

  /** When a frame scheduled at `contextTime` will be heard, in performance.now() ms. */
  toPerformanceMs(contextTime: number): number {
    if (this.offsetMs === null) throw new Error("ClockMapper used before first update()");
    return contextTime * 1000 + this.offsetMs;
  }
}

/**
 * Reads one clock sample from a live AudioContext.
 *
 * getOutputTimestamp() reports what the speakers are playing right now and
 * so already includes output latency. Before audio starts flowing it returns
 * zeros, and some browsers lack it, so we fall back to currentTime plus the
 * reported latencies.
 */
export function sampleClocks(ctx: AudioContext): ClockSample {
  const ts = typeof ctx.getOutputTimestamp === "function" ? ctx.getOutputTimestamp() : null;
  if (ts && ts.contextTime && ts.performanceTime) {
    return { contextTime: ts.contextTime, performanceTime: ts.performanceTime };
  }
  const latencySec = (ctx.baseLatency ?? 0) + (ctx.outputLatency ?? 0);
  return {
    contextTime: ctx.currentTime,
    performanceTime: performance.now() + latencySec * 1000,
  };
}

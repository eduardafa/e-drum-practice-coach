/**
 * Slows audio down without changing its pitch (EDU-122), with WSOLA
 * (waveform-similarity overlap-add): the output is built from short
 * overlapping slices of the input, laid down at a steady pace, each taken from
 * a little further along the input than the last, but each nudged a few ms so
 * its waveform lines up with how the previous slice would have continued. That
 * keeps the waves in phase, so there's no warble, and the pitch stays put
 * because every slice plays at its original rate.
 *
 * The slowed copy is made once, ahead of time, and then played like the
 * original, so everything stays on the audio clock that scoring uses. Pure and
 * chunked: `Stretcher.step` does a bounded amount of work, so the page can stay
 * responsive (and show progress) while a whole song is done.
 */

/** Slice length: about 23 ms at 44.1 kHz, short enough for drums, long enough for bass. */
const FRAME = 1024;
/** Output pace: slices overlap by half, where a Hann window sums to exactly 1. */
const HOP = FRAME / 2;
/** How far (in samples) a slice may be nudged to line up: about ±9 ms, a period of most bass notes. */
const SEARCH = 384;
/** The search compares every 4th sample, at every 4th offset, then refines around the best: fast enough for a whole song. */
const COARSE = 4;

const hann = (() => {
  const w = new Float32Array(FRAME);
  // Periodic Hann: shifted by half a frame, copies sum to exactly 1.
  for (let i = 0; i < FRAME; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME);
  return w;
})();

export class Stretcher {
  /** The slowed channels, filled in as `step` runs. */
  readonly output: Float32Array<ArrayBuffer>[];
  private readonly mono: Float32Array;
  private readonly frames: number;
  private frame = 0;
  /** Where in the input the last slice was taken from. */
  private previous = 0;

  constructor(
    private readonly input: readonly Float32Array[],
    /** Playback speed, e.g. 0.7 for 70%: below 1 makes it longer. */
    readonly speed: number,
  ) {
    const length = input[0]?.length ?? 0;
    // Full speed has nothing to stretch: a straight copy.
    if (speed === 1) {
      this.output = input.map((c) => c.slice());
      this.mono = new Float32Array(0);
      this.frames = 0;
      return;
    }
    const outLength = Math.ceil(length / speed);
    this.output = input.map(() => new Float32Array(outLength));
    this.frames = Math.ceil(outLength / HOP);
    // The lining-up uses one mono mix, so every channel moves together.
    this.mono = new Float32Array(length);
    for (const channel of input) for (let i = 0; i < length; i++) this.mono[i] += channel[i] / input.length;
  }

  /** 0 to 1. */
  get progress(): number {
    return this.frames === 0 ? 1 : this.frame / this.frames;
  }

  get done(): boolean {
    return this.frame >= this.frames;
  }

  /** Lays down up to `maxFrames` more slices; returns whether it's finished. */
  step(maxFrames: number): boolean {
    const length = this.mono.length;
    const last = Math.max(0, length - FRAME);
    const end = Math.min(this.frames, this.frame + maxFrames);
    for (; this.frame < end; this.frame++) {
      const nominal = Math.min(last, Math.round(this.frame * HOP * this.speed));
      const from = this.frame === 0 ? 0 : this.align(nominal, Math.min(last, this.previous + HOP), last);
      const at = this.frame * HOP;
      for (let c = 0; c < this.input.length; c++) {
        const src = this.input[c];
        const dst = this.output[c];
        const n = Math.min(FRAME, dst.length - at, src.length - from);
        for (let i = 0; i < n; i++) dst[at + i] += src[from + i] * hann[i];
      }
      this.previous = from;
    }
    return this.done;
  }

  /**
   * The input position near `nominal` whose start best matches `target` (how
   * the previous slice would have carried on), by cross-correlation over the
   * overlap: coarse first, then sample by sample around the best.
   */
  private align(nominal: number, target: number, last: number): number {
    const lo = Math.max(0, nominal - SEARCH);
    const hi = Math.min(last, nominal + SEARCH);
    const overlap = FRAME - HOP;
    const score = (pos: number, stride: number) => {
      let sum = 0;
      for (let i = 0; i < overlap; i += stride) sum += this.mono[pos + i] * this.mono[target + i];
      return sum;
    };
    let best = nominal;
    let bestScore = -Infinity;
    for (let pos = lo; pos <= hi; pos += COARSE) {
      const s = score(pos, COARSE);
      if (s > bestScore) [best, bestScore] = [pos, s];
    }
    const coarse = best;
    bestScore = -Infinity;
    for (let pos = Math.max(lo, coarse - COARSE); pos <= Math.min(hi, coarse + COARSE); pos++) {
      const s = score(pos, 1);
      if (s > bestScore) [best, bestScore] = [pos, s];
    }
    return best;
  }
}

/**
 * Stretches everything, a chunk at a time, yielding to the page between
 * chunks; `onProgress` gets 0 to 1. Rejects with "canceled" if `signal` aborts.
 */
export async function stretchChannels(
  input: readonly Float32Array[],
  speed: number,
  onProgress?: (done: number) => void,
  signal?: AbortSignal,
): Promise<Float32Array<ArrayBuffer>[]> {
  if (signal?.aborted) throw new Error("canceled");
  const stretcher = new Stretcher(input, speed);
  while (!stretcher.step(200)) {
    onProgress?.(stretcher.progress);
    // oxlint-disable-next-line no-await-in-loop -- one chunk at a time, letting the page draw in between
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (signal?.aborted) throw new Error("canceled");
  }
  onProgress?.(1);
  return stretcher.output;
}

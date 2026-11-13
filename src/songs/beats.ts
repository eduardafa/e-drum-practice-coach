/**
 * Finding the beats in a song (decision record 0047): an onset-strength
 * envelope from the log spectral flux, the tempo from its weighted
 * autocorrelation, and the beats by dynamic programming (Ellis 2007), which
 * follows gradual tempo drift. Beat 1 is guessed as the bar position with
 * the strongest low-frequency hits (kick and bass usually land there); the
 * drummer can correct it. Pure, so it's tested on generated songs.
 */

/** Analysis works at about this rate: enough for onsets, a fraction of the work. */
const ANALYSIS_RATE = 11025;
/** Window and hop in analysis samples: about 46 ms and 11.6 ms at 11 kHz. */
const WINDOW = 512;
const HOP = 128;
/** Bins below about 200 Hz, where kick and bass live: the downbeat guess listens there. */
const LOW_BINS = 9;
/** How strongly the beat spacing is held to the tempo; higher follows drift less. */
const TIGHTNESS = 100;

export interface BeatGrid {
  /** Beat times in seconds from the start of the song, in order. */
  beats: number[];
  /** Index into `beats` of the first beat 1 (0 to 3). Assumes 4 beats a bar. */
  firstDownbeat: number;
  /** The overall tempo found, in beats per minute. */
  bpm: number;
}

export interface Envelope {
  /** Onset strength per frame, normalized; peaks are note and drum starts. */
  onset: Float32Array;
  /** The same, only from the lowest frequencies. */
  low: Float32Array;
  /** Frames per second. */
  fps: number;
  /** Seconds from a frame's start to where a sharp onset in it peaks. */
  lag: number;
}

/** In-place radix-2 FFT; `re` and `im` must have a power-of-two length. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle), wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

/** Removes the slowly changing level (mean over about a second), keeps the peaks, scales to unit RMS. */
function emphasizePeaks(raw: Float32Array, fps: number): Float32Array {
  const w = Math.max(1, Math.round(fps));
  const out = new Float32Array(raw.length);
  let sum = 0;
  for (let i = 0; i < raw.length; i++) {
    sum += raw[i];
    if (i >= w) sum -= raw[i - w];
    out[i] = Math.max(0, raw[i] - sum / Math.min(i + 1, w));
  }
  let sq = 0;
  for (const v of out) sq += v * v;
  const rms = Math.sqrt(sq / Math.max(1, out.length)) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= rms;
  return out;
}

/** Onset strength over time, from how much louder each frequency gets frame to frame. */
export function onsetEnvelope(samples: Float32Array, sampleRate: number, onProgress?: (done: number) => void): Envelope {
  const factor = Math.max(1, Math.round(sampleRate / ANALYSIS_RATE));
  const x = new Float32Array(Math.floor(samples.length / factor));
  for (let i = 0; i < x.length; i++) {
    let s = 0;
    for (let k = 0; k < factor; k++) s += samples[i * factor + k];
    x[i] = s / factor;
  }
  const rate = sampleRate / factor;
  const fps = rate / HOP;
  const window = Float32Array.from({ length: WINDOW }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / WINDOW));
  const frames = Math.max(0, Math.floor((x.length - WINDOW) / HOP));
  const onset = new Float32Array(frames), low = new Float32Array(frames);
  const re = new Float64Array(WINDOW), im = new Float64Array(WINDOW);
  let prev = new Float32Array(WINDOW / 2), cur = new Float32Array(WINDOW / 2);
  const reportEvery = Math.max(1, Math.floor(frames / 20));
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < WINDOW; i++) {
      re[i] = x[f * HOP + i] * window[i];
      im[i] = 0;
    }
    fft(re, im);
    let flux = 0, lowFlux = 0;
    for (let b = 1; b < WINDOW / 2; b++) {
      cur[b] = Math.log1p(1000 * Math.hypot(re[b], im[b]));
      const rise = cur[b] - prev[b];
      if (rise > 0) {
        flux += rise;
        if (b <= LOW_BINS) lowFlux += rise;
      }
    }
    onset[f] = flux;
    low[f] = lowFlux;
    [prev, cur] = [cur, prev];
    if (onProgress && f % reportEvery === 0) onProgress(f / frames);
  }
  // A sharp onset makes the flux peak about three quarters into the window (measured in the spike).
  return { onset: emphasizePeaks(onset, fps), low: emphasizePeaks(low, fps), fps, lag: (0.75 * WINDOW) / rate };
}

/** The beat period in frames: autocorrelation over 40–240 BPM, weighted toward about 120 BPM (human tempo preference). */
export function estimatePeriod(onset: Float32Array, fps: number): number {
  const lo = Math.max(1, Math.floor((fps * 60) / 240)), hi = Math.ceil((fps * 60) / 40);
  let best = lo, bestScore = -Infinity;
  for (let lag = lo; lag <= hi && lag < onset.length; lag++) {
    let s = 0;
    for (let i = lag; i < onset.length; i++) s += onset[i] * onset[i - lag];
    // A spread of 0.8 octaves: with a full octave, a short drifting song with eighth-note hi-hats
    // locked onto 215 BPM (double); 0.7–0.9 all fix it while keeping half-time songs at their tempo.
    const preference = Math.exp(-0.5 * (Math.log2(lag / (fps * 0.5)) / 0.8) ** 2);
    const score = (preference * s) / (onset.length - lag);
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  return best;
}

/** The chain of beat frames that best lands on onsets while keeping about `period` apart (Ellis 2007). */
function beatFrames(onset: Float32Array, period: number): number[] {
  const n = onset.length;
  const score = new Float32Array(n), back = new Int32Array(n).fill(-1);
  const from = Math.round(2 * period), to = Math.round(period / 2);
  for (let t = 0; t < n; t++) {
    let best = 0, arg = -1;
    for (let tau = Math.max(0, t - from); tau <= t - to; tau++) {
      const v = score[tau] - TIGHTNESS * Math.log((t - tau) / period) ** 2;
      if (arg === -1 || v > best) {
        best = v;
        arg = tau;
      }
    }
    score[t] = onset[t] + (arg >= 0 ? best : 0);
    back[t] = arg;
  }
  let t = n - 1;
  for (let i = Math.max(0, n - period); i < n; i++) if (score[i] > score[t]) t = i;
  const frames: number[] = [];
  for (; t >= 0; t = back[t]) frames.push(t);
  return frames.toReversed();
}

/** The strongest value of `env` within a few frames of `frame`. */
function strengthNear(env: Float32Array, frame: number): number {
  let m = 0;
  for (let k = -3; k <= 3; k++) m = Math.max(m, env[frame + k] ?? 0);
  return m;
}

/** Drops beats at the start and end that land in silence (well below a typical beat's strength). */
function trimSilence(frames: number[], onset: Float32Array): number[] {
  const strength = frames.map((f) => strengthNear(onset, f));
  const median = strength.toSorted((a, b) => a - b)[Math.floor(strength.length / 2)] ?? 0;
  let a = 0, b = frames.length;
  // "At most" rather than "below", so pure silence (a median of 0) keeps no beats at all.
  while (a < b && strength[a] <= 0.2 * median) a++;
  while (b > a && strength[b - 1] <= 0.2 * median) b--;
  return frames.slice(a, b);
}

/** Which of the first four beats is beat 1: the bar position with the strongest low-frequency hits. */
export function guessFirstDownbeat(frames: number[], low: Float32Array): number {
  let best = 0, bestMean = -1;
  for (let phase = 0; phase < Math.min(4, frames.length); phase++) {
    let sum = 0, count = 0;
    for (let i = phase; i < frames.length; i += 4) {
      sum += strengthNear(low, frames[i]);
      count++;
    }
    const mean = count ? sum / count : 0;
    if (mean > bestMean) {
      bestMean = mean;
      best = phase;
    }
  }
  return best;
}

/** The beat grid of a song: its beats, its first beat 1 and its tempo. `onProgress` gets 0 to 1. */
export function findBeats(samples: Float32Array, sampleRate: number, onProgress?: (done: number) => void): BeatGrid {
  // The envelope is most of the work; the rest is quick.
  const env = onsetEnvelope(samples, sampleRate, (done) => onProgress?.(done * 0.9));
  const period = estimatePeriod(env.onset, env.fps);
  const frames = trimSilence(beatFrames(env.onset, period), env.onset);
  onProgress?.(1);
  return {
    beats: frames.map((f) => f / env.fps + env.lag),
    firstDownbeat: guessFirstDownbeat(frames, env.low),
    bpm: (60 * env.fps) / period,
  };
}

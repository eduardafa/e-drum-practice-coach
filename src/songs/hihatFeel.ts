/**
 * How fast a song's hi-hat moves (EDU-130): one hit per beat, two (eighth
 * notes) or four (sixteenth notes), to suggest a groove that fits better than
 * the default.
 *
 * The drum-hits spike (EDU-90) found kick and snare too unreliable to read
 * from a full mix, but the hi-hat reliable: little else in a song lives above
 * 7 kHz. So this listens only there: a high-pass filter, the energy per short
 * frame, and how much it rises (a hit's attack). Then, on the beats already
 * found, it compares each quarter of a beat ("1 e & a") with the points
 * halfway between them, where nothing is played: a quarter that usually rises
 * well above that background has a hi-hat note. Comparing with the song's own
 * background, not its loudest hits, keeps a loud band over quiet hats from
 * looking like notes everywhere. When the answer isn't clear it says nothing.
 *
 * The result is the time between hi-hat notes in seconds, not "eighths":
 * eighths at the found tempo become quarters if the drummer corrects the
 * tempo to twice as fast, and an absolute step still reads right then.
 */

/** Hi-hat notes per beat that a groove can be suggested for. */
export type HihatFeel = 1 | 2 | 4;

/** Below this rate there's nothing above 7 kHz to listen to. */
const MIN_SAMPLE_RATE = 16000;
const CUTOFF_HZ = 7000;
/** Frame length for the energy, in samples at 44.1 kHz (scaled with the rate): about 6 ms. */
const HOP_44K = 256;
/** Too few beats to tell a pattern from chance. */
const MIN_BEATS = 16;
/** A quarter of the beat is played when its typical rise is at least this many times the background... */
const PLAYED = 2;
/** ...and empty at most this many. In between, the answer isn't clear. */
const EMPTY = 1.5;
/** The background never counts as less than this share of the strongest quarter (drums alone can be dead silent in between). */
const MIN_BACKGROUND = 0.05;
/**
 * The strongest quarter must rise by at least this share of the song's overall
 * level: below that it's other instruments' attacks leaking up, not a cymbal.
 */
const MIN_LEVEL = 0.01;

/** Coefficients of a second-order high-pass (RBJ cookbook biquad), normalized by a0. */
function highPassCoefficients(sampleRate: number) {
  const w = (2 * Math.PI * CUTOFF_HZ) / sampleRate;
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  return { b0: (1 + cos) / 2 / a0, b1: -(1 + cos) / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

/**
 * The rise in high-frequency energy per frame: peaks are hi-hat (and cymbal)
 * attacks, and the song's overall level (RMS). Filters one sample at a time, so a long song is never copied, with
 * the two filter stages written out in the loop (it's the hot path: a call
 * per sample made it four times slower).
 */
export function highRise(samples: Float32Array, sampleRate: number): { rise: Float32Array; fps: number; level: number } {
  // Two stages in a row, for a steeper slope: guitars and voices still reach into 5–7 kHz. (b2 equals b0.)
  const { b0, b1, a1, a2 } = highPassCoefficients(sampleRate);
  let px1 = 0, px2 = 0, py1 = 0, py2 = 0; // first stage
  let qy1 = 0, qy2 = 0; // second stage (its input is the first stage's output)
  const hop = Math.max(64, Math.round((HOP_44K * sampleRate) / 44100));
  const frames = Math.floor(samples.length / hop);
  const rise = new Float32Array(frames);
  let previous = 0;
  let total = 0;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      const x0 = samples[i];
      total += x0 * x0;
      const p0 = b0 * x0 + b1 * px1 + b0 * px2 - a1 * py1 - a2 * py2;
      const q0 = b0 * p0 + b1 * py1 + b0 * py2 - a1 * qy1 - a2 * qy2;
      px2 = px1;
      px1 = x0;
      qy2 = qy1;
      qy1 = q0;
      py2 = py1;
      py1 = p0;
      sum += q0 * q0;
    }
    const level = Math.sqrt(sum / hop);
    rise[f] = Math.max(0, level - previous);
    previous = level;
  }
  return { rise, fps: sampleRate / hop, level: frames ? Math.sqrt(total / (frames * hop)) : 0 };
}

/** The strongest rise from 20 ms before `t` to 30 ms after it: a hit near that moment. */
function strengthAt(rise: Float32Array, fps: number, t: number): number {
  const from = Math.max(0, Math.floor((t - 0.02) * fps));
  const to = Math.min(rise.length - 1, Math.ceil((t + 0.03) * fps));
  let best = 0;
  for (let f = from; f <= to; f++) if (rise[f] > best) best = rise[f];
  return best;
}

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[values.length >> 1];
}

/**
 * How strongly each quarter of a beat ("1", "e", "&", "a") usually rises,
 * as a multiple of the background halfway between them, or null with too
 * few beats or too little up there to be a cymbal.
 */
export function slotContrast(
  rise: Float32Array,
  fps: number,
  beats: readonly number[],
  level: number,
): [number, number, number, number] | null {
  if (beats.length < MIN_BEATS) return null;
  // Eighths of a beat: the even ones are "1 e & a", the odd ones the background between them.
  const columns: number[][] = Array.from({ length: 8 }, () => []);
  for (let i = 0; i + 1 < beats.length; i++) {
    const period = beats[i + 1] - beats[i];
    for (let k = 0; k < 8; k++) columns[k].push(strengthAt(rise, fps, beats[i] + (k * period) / 8));
  }
  const slots = [0, 2, 4, 6].map((k) => median(columns[k]));
  const strongest = Math.max(...slots);
  if (!(strongest > MIN_LEVEL * level)) return null;
  const background = Math.max(median([...columns[1], ...columns[3], ...columns[5], ...columns[7]]), MIN_BACKGROUND * strongest);
  const [one, e, and, a] = slots.map((v) => v / background);
  return [one, e, and, a];
}

/** Hits per beat from the four quarters' contrast, or null when the pattern isn't clear. */
export function feelFromContrast(contrast: readonly number[]): HihatFeel | null {
  if (contrast.some((c) => c > EMPTY && c < PLAYED)) return null;
  const pattern = contrast.map((c) => (c >= PLAYED ? "x" : "-")).join("");
  if (pattern === "xxxx") return 4;
  if (pattern === "x-x-" || pattern === "--x-") return 2;
  if (pattern === "x---") return 1;
  return null;
}

/**
 * The time between the song's hi-hat notes, in seconds, measured on the beats
 * found for it, or null when the song gives no clear answer (no hi-hat, a
 * pattern that changes, too short, or audio sampled too low to hear it).
 */
export function hihatStep(samples: Float32Array, sampleRate: number, beats: readonly number[]): number | null {
  if (sampleRate < MIN_SAMPLE_RATE) return null;
  const { rise, fps, level } = highRise(samples, sampleRate);
  const contrast = slotContrast(rise, fps, beats, level);
  const feel = contrast && feelFromContrast(contrast);
  if (!feel) return null;
  const beat = (beats[beats.length - 1] - beats[0]) / (beats.length - 1);
  return beat / feel;
}

/**
 * Hits per beat at a tempo, from a hi-hat step: 1, 2 or 4 when the step fits
 * one closely (within 15%), else null (the drummer may have changed the
 * tempo to something it doesn't divide).
 */
export function feelAt(step: number, bpm: number): HihatFeel | null {
  const perBeat = 60 / bpm / step;
  for (const feel of [1, 2, 4] as const) if (Math.abs(perBeat / feel - 1) <= 0.15) return feel;
  return null;
}

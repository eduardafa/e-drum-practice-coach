/**
 * Generated songs with exactly known beat times, for testing beat finding
 * (moved from the decision-0047 spike). Only the tests import this.
 */
export const TEST_RATE = 44100;

export interface TestSongOptions {
  bpm: number;
  /** Tempo at the end, for a gradual drift. */
  endBpm?: number;
  seconds: number;
  /** Silence before the music starts. */
  lead?: number;
  /** Kick positions within a bar, in eighth notes (0 = beat 1). */
  kick?: number[];
  /** Snare positions within a bar, in eighth notes. */
  snare?: number[];
  /** Hi-hat hits per beat (0 for none). */
  hats?: number;
  /** White noise added over everything, as an amplitude. */
  noise?: number;
  seed?: number;
}

function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function addKick(buf: Float32Array, t: number): void {
  const n0 = Math.round(t * TEST_RATE);
  let phase = 0;
  for (let i = 0; i < 0.35 * TEST_RATE && n0 + i < buf.length; i++) {
    const x = i / TEST_RATE;
    phase += (2 * Math.PI * (50 + 70 * Math.exp(-x * 30))) / TEST_RATE;
    buf[n0 + i] += 0.9 * Math.sin(phase) * Math.exp(-x * 9);
  }
}

function addNoiseHit(buf: Float32Array, t: number, amp: number, decay: number, len: number, rnd: () => number, bright: boolean): void {
  const n0 = Math.round(t * TEST_RATE);
  let prev = 0;
  for (let i = 0; i < len * TEST_RATE && n0 + i < buf.length; i++) {
    const v = rnd() * 2 - 1;
    buf[n0 + i] += amp * (bright ? v - prev : v) * Math.exp(-(i / TEST_RATE) * decay);
    prev = v;
  }
}

function addBass(buf: Float32Array, t: number, seconds: number, freq: number): void {
  const n0 = Math.round(t * TEST_RATE);
  for (let i = 0; i < seconds * TEST_RATE && n0 + i < buf.length; i++) {
    const x = i / TEST_RATE;
    buf[n0 + i] += 0.3 * Math.min(1, x / 0.01) * Math.exp(-x * 2) * Math.sin(2 * Math.PI * freq * x);
  }
}

/** A drum-and-bass test song and the exact time of each of its beats. */
export function testSong(o: TestSongOptions): { samples: Float32Array; beats: number[] } {
  const rnd = random(o.seed ?? 1);
  const lead = o.lead ?? 0;
  const samples = new Float32Array(Math.ceil((lead + o.seconds + 1) * TEST_RATE));
  const kick = o.kick ?? [0, 4], snare = o.snare ?? [2, 6], hats = o.hats ?? 2;
  const beats: number[] = [];
  for (let t = lead; t < lead + o.seconds; ) {
    beats.push(t);
    const bpm = o.bpm + ((o.endBpm ?? o.bpm) - o.bpm) * ((t - lead) / o.seconds);
    t += 60 / bpm;
  }
  beats.forEach((t, i) => {
    const len = (beats[i + 1] ?? t + 60 / o.bpm) - t;
    for (let e = 0; e < 2; e++) {
      const pos = (i % 4) * 2 + e;
      if (kick.includes(pos)) addKick(samples, t + (e * len) / 2);
      if (snare.includes(pos)) addNoiseHit(samples, t + (e * len) / 2, 0.6, 18, 0.2, rnd, false);
    }
    for (let h = 0; h < hats; h++) addNoiseHit(samples, t + (h * len) / hats, 0.25, 80, 0.05, rnd, true);
    addBass(samples, t, len * 0.9, [55, 49, 44, 49][Math.floor(i / 4) % 4]);
  });
  if (o.noise) for (let i = 0; i < samples.length; i++) samples[i] += o.noise * (rnd() * 2 - 1);
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < samples.length; i++) samples[i] /= peak * 1.05;
  return { samples, beats };
}

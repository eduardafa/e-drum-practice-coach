/**
 * Synthesised sounds: the metronome click and a simple voice per pad for
 * exercise previews. Built from oscillators and filtered noise, so no samples
 * are shipped (smaller bundle, no licensing questions). They only need to
 * tell the pads apart, not to sound like a real kit.
 */
import type { Dynamic } from "../exercises/types";
import type { PadId } from "../kit/nitroMax";

const CLICK_DURATION_SEC = 0.03;

/** A short sine blip: higher on the downbeat, lower off the beat. */
export function playClick(
  ctx: BaseAudioContext,
  out: AudioNode,
  time: number,
  kind: "downbeat" | "beat" | "sub",
  volume: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = kind === "downbeat" ? 1600 : kind === "beat" ? 1100 : 800;
  const peak = volume * (kind === "sub" ? 0.4 : 1);
  // Fast attack and exponential decay give a crisp, clearly placed transient.
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), time + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + CLICK_DURATION_SEC);
  osc.connect(gain).connect(out);
  osc.start(time);
  osc.stop(time + CLICK_DURATION_SEC + 0.01);
}

const DYNAMIC_GAIN: Record<Dynamic, number> = { ghost: 0.22, normal: 0.6, accent: 1 };

/** One second of white noise per audio context, shared by every noisy voice. */
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noise(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/** An envelope: instant attack to `peak`, exponential decay over `decay` seconds. */
function envelope(ctx: BaseAudioContext, out: AudioNode, time: number, peak: number, decay: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  gain.connect(out);
  return gain;
}

/** Filtered noise: hi-hats, cymbals and the snare's wires. */
function noiseBurst(
  ctx: BaseAudioContext,
  out: AudioNode,
  time: number,
  peak: number,
  decay: number,
  filter: { type: BiquadFilterType; frequency: number },
): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const biquad = ctx.createBiquadFilter();
  biquad.type = filter.type;
  biquad.frequency.value = filter.frequency;
  src.connect(biquad).connect(envelope(ctx, out, time, peak, decay));
  src.start(time);
  src.stop(time + decay + 0.02);
}

/** A sine whose pitch drops quickly: kick and toms. */
function pitchSweep(
  ctx: BaseAudioContext,
  out: AudioNode,
  time: number,
  peak: number,
  decay: number,
  from: number,
  to: number,
): void {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(from, time);
  osc.frequency.exponentialRampToValueAtTime(to, time + decay * 0.6);
  osc.connect(envelope(ctx, out, time, peak, decay));
  osc.start(time);
  osc.stop(time + decay + 0.02);
}

/** Schedules one stroke on a pad at `time` (audio-clock seconds). */
export function playPad(
  ctx: BaseAudioContext,
  out: AudioNode,
  pad: PadId,
  time: number,
  dynamic: Dynamic,
  open = false,
): void {
  const peak = DYNAMIC_GAIN[dynamic];
  switch (pad) {
    case "kick":
      pitchSweep(ctx, out, time, peak, 0.35, 140, 45);
      return;
    case "snare":
      pitchSweep(ctx, out, time, peak * 0.5, 0.1, 260, 180);
      noiseBurst(ctx, out, time, peak * 0.7, 0.18, { type: "highpass", frequency: 1500 });
      return;
    case "hihat":
      noiseBurst(ctx, out, time, peak * 0.4, open ? 0.4 : 0.05, { type: "highpass", frequency: 7000 });
      return;
    case "hihatPedal":
      noiseBurst(ctx, out, time, peak * 0.3, 0.04, { type: "highpass", frequency: 5000 });
      return;
    case "tom1":
      pitchSweep(ctx, out, time, peak, 0.3, 260, 170);
      return;
    case "tom2":
      pitchSweep(ctx, out, time, peak, 0.32, 200, 130);
      return;
    case "tom3":
      pitchSweep(ctx, out, time, peak, 0.36, 150, 95);
      return;
    case "crash":
      noiseBurst(ctx, out, time, peak * 0.4, 1.2, { type: "highpass", frequency: 4000 });
      return;
    case "ride":
      noiseBurst(ctx, out, time, peak * 0.3, 0.6, { type: "bandpass", frequency: 6000 });
      return;
  }
}

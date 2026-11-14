/**
 * The metronome volume, as a gain: 1 is the click at full scale, and up to
 * MAX_VOLUME boosts it further. Above 1 a soft clipper on the click bus
 * rounds the peaks off under full scale, so the boost makes the click louder
 * (more of it sits near full scale) rather than harshly clipped. Laptop
 * speakers next to an acoustic-sounding kit need that headroom.
 */
export const MIN_VOLUME = 0;
export const MAX_VOLUME = 2;
export const DEFAULT_VOLUME = 1;

export function isVolume(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= MIN_VOLUME && value <= MAX_VOLUME;
}

/** Below this level the soft clipper passes sound unchanged; above it, peaks bend smoothly toward full scale. */
const CLIP_KNEE = 0.8;
/**
 * The level the clipper bends toward: a little under full scale, since the
 * WaveShaper's oversampling filter overshoots a sharp click by a few percent.
 */
const CLIP_CEILING = 0.94;

/**
 * The soft clipper's curve for a WaveShaperNode: input -1..1 stands for
 * -maxGain..maxGain (the bus gain is scaled down by maxGain first, because a
 * WaveShaper clamps anything outside -1..1). Unchanged up to CLIP_KNEE, then a
 * tanh bend that approaches but never reaches CLIP_CEILING. A fixed curve with no state,
 * unlike a compressor, so nothing can get stuck between clicks.
 */
export function softClipCurve(maxGain = MAX_VOLUME, points = 4097): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  const room = CLIP_CEILING - CLIP_KNEE;
  for (let i = 0; i < points; i++) {
    const x = ((i / (points - 1)) * 2 - 1) * maxGain;
    const size = Math.abs(x);
    const y = size <= CLIP_KNEE ? size : CLIP_KNEE + room * Math.tanh((size - CLIP_KNEE) / room);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

/** "150%" for 1.5. */
export function formatVolume(volume: number): string {
  return `${Math.round(volume * 100)}%`;
}

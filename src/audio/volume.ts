/**
 * The metronome volume, as a gain: 1 is the click at full scale, and up to
 * MAX_VOLUME boosts it further. Above 1 a limiter on the click bus keeps the
 * peaks from clipping, so the boost makes the click louder (more of it sits
 * near full scale) rather than distorted. Laptop speakers next to an
 * acoustic-sounding kit need that headroom.
 */
export const MIN_VOLUME = 0;
export const MAX_VOLUME = 2;
export const DEFAULT_VOLUME = 1;

export function isVolume(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= MIN_VOLUME && value <= MAX_VOLUME;
}

/** "150%" for 1.5. */
export function formatVolume(volume: number): string {
  return `${Math.round(volume * 100)}%`;
}

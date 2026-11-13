/**
 * The get-ready countdown before a play-along session: a few seconds to get
 * from the laptop to the kit before the count-in bar starts. The number is
 * shown large and a soft beep marks each second, so it can be followed from
 * the drum throne without reading the screen closely.
 */

/** Countdown lengths offered, in seconds; 0 is no countdown. */
export const GET_READY_OPTIONS = [0, 3, 5, 10, 15] as const;
export const DEFAULT_GET_READY_SEC = 5;

export function isGetReadySec(value: unknown): value is (typeof GET_READY_OPTIONS)[number] {
  return GET_READY_OPTIONS.some((n) => n === value);
}

/**
 * The number to show at `nowMs` for a countdown ending at `endMs`
 * (performance.now() ms): 5, 4, 3, 2, 1, changing on each beep. Null once it's over.
 */
export function secondsLeft(endMs: number, nowMs: number): number | null {
  const left = endMs - nowMs;
  return left > 0 ? Math.ceil(left / 1000) : null;
}

/** When to beep for a countdown of `seconds` starting at `startSec` (audio-clock seconds): once per second. */
export function beepTimes(startSec: number, seconds: number): number[] {
  return Array.from({ length: Math.max(0, Math.floor(seconds)) }, (_, i) => startSec + i);
}

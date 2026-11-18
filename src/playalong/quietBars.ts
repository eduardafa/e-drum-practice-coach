/**
 * Keeping time on your own (EDU-145): during a play-along session the click
 * goes quiet for one bar out of every few, and the drummer keeps playing.
 * Notes in a quiet bar are still scored against where they're written, so the
 * results can say whether the drummer sped up or slowed down without it.
 *
 * Bars are counted from the first bar of the exercise (after the count-in),
 * across loops, so a one-bar exercise and a two-bar one go quiet at the same
 * pace. The last bar of each group is the quiet one: the click plays first,
 * so there's a tempo to hold, and it comes back on the next bar's 1.
 */

/** How often a bar goes quiet: 0 for never (a click on every bar), else one bar in this many. */
export type QuietEvery = 0 | 2 | 4;

/** The choices offered next to the session length, gentlest first after "off". */
export const QUIET_EVERY_OPTIONS: readonly QuietEvery[] = [0, 4, 2];

export function isQuietEvery(value: unknown): value is QuietEvery {
  return value === 0 || value === 2 || value === 4;
}

/** What each choice is called in the menu. */
export function quietEveryLabel(every: QuietEvery): string {
  return every === 0 ? "Click every bar" : `Quiet bar: 1 in ${every}`;
}

/**
 * Whether bar `bar` of the exercise (from 0, the first bar after the count-in,
 * counted across loops) has no click. Never during the count-in (negative bars).
 */
export function isQuietBar(bar: number, every: number): boolean {
  return every >= 2 && bar >= 0 && (bar + 1) % every === 0;
}

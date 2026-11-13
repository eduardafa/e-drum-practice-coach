/**
 * Plain-words tips for a session's hi-hat mix-ups (see HihatMixups): what
 * happened, and what the pedal foot should do about it. Written for a
 * right-handed kit; the results screen mirrors "left foot" on a left-handed one.
 */
import type { HihatMixups } from "./matcher";

function hits(n: number): string {
  return n === 1 ? "1 hi-hat hit" : `${n} hi-hat hits`;
}

export function hihatTips(mixups: HihatMixups): string[] {
  const tips: string[] = [];
  if (mixups.openInsteadOfClosed > 0) {
    tips.push(
      `${hits(mixups.openInsteadOfClosed)} sounded open where the music says closed. Keep your left foot pressed down on the hi-hat pedal, so the two cymbals stay together.`,
    );
  }
  if (mixups.closedInsteadOfOpen > 0) {
    tips.push(
      `${hits(mixups.closedInsteadOfOpen)} sounded closed where the music says open (the "o" notes). Lift your left foot just before those hits, then press it down again.`,
    );
  }
  return tips;
}

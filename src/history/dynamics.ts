/**
 * Dynamics per note (EDU-127): of the accents played, how many were clearly
 * louder than the normal notes, and of the ghost notes, how many were clearly
 * softer. Timing accuracy is scored elsewhere and isn't touched: this is
 * reported next to it.
 *
 * "Louder" is measured against the drummer's own normal notes in the same
 * session (their median velocity), not fixed numbers, because kits, velocity
 * curves and players differ. With too few normal notes to measure, the middle
 * of everything played is the reference instead.
 *
 * Works from a saved session record, which already carries each note's
 * dynamic and velocity, so the results screen and a session opened from
 * History (even one synced from another device) give the same answer, with no
 * change to the record format.
 */
import type { Dynamic } from "../exercises/types";
import type { SessionRecord } from "./record";

/** How much louder (or softer) than the reference a note must be to count, in MIDI velocity (1 to 127). */
export const NOTE_GAP = 15;

/** Below this share, the tip asks for more contrast. */
export const GOOD_SHARE = 0.75;

/** Fewer normal notes than this, and the middle of all notes is the reference instead. */
const MIN_NORMAL = 2;

export interface DynamicCount {
  /** Notes of this dynamic that were played (hit, with a known velocity). */
  played: number;
  /** Of those, how many were loud enough (accents) or soft enough (ghost notes). */
  good: number;
}

export interface DynamicsResult {
  /** Null when the exercise has no accents. */
  accents: DynamicCount | null;
  /** Null when the exercise has no ghost notes. */
  ghosts: DynamicCount | null;
  /** The velocity accents and ghost notes were compared with. */
  reference: number;
  /**
   * Every hit had the exact same velocity: the keyboard, or a kit set to a
   * fixed velocity. Then loud and soft can't be told apart, and the counts
   * mean nothing.
   */
  sameStrength: boolean;
}

function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The dynamics of one session, or null when there's nothing to say: the
 * exercise asks for no accents or ghost notes, or none of them was played
 * with a known velocity.
 */
export function sessionDynamics(record: Pick<SessionRecord, "voices" | "notes">): DynamicsResult | null {
  const hasAccents = record.voices.some((v) => v.dynamic === "accent");
  const hasGhosts = record.voices.some((v) => v.dynamic === "ghost");
  if (!hasAccents && !hasGhosts) return null;

  const played: Record<Dynamic, number[]> = { normal: [], accent: [], ghost: [] };
  for (const [index, , deltaMs, velocity] of record.notes) {
    const voice = record.voices[index];
    if (!voice || deltaMs === null || velocity === null) continue;
    played[voice.dynamic].push(velocity);
  }
  if (played.accent.length === 0 && played.ghost.length === 0) return null;

  const all = [...played.normal, ...played.accent, ...played.ghost];
  const reference = played.normal.length >= MIN_NORMAL ? median(played.normal) : median(all);
  const sameStrength = all.length > 1 && all.every((v) => v === all[0]);

  return {
    accents: hasAccents
      ? { played: played.accent.length, good: played.accent.filter((v) => v >= reference + NOTE_GAP).length }
      : null,
    ghosts: hasGhosts
      ? { played: played.ghost.length, good: played.ghost.filter((v) => v <= reference - NOTE_GAP).length }
      : null,
    reference,
    sameStrength,
  };
}

const share = (c: DynamicCount | null) => (c && c.played > 0 ? c.good / c.played : null);

/** One plain tip for a beginner: what to change, or that the contrast is good. */
export function dynamicsTip(result: DynamicsResult): string {
  if (result.sameStrength) {
    return "Every hit had the same strength, so loud and soft can't be told apart. The keyboard always plays at one strength: try it on the kit.";
  }
  const accents = share(result.accents);
  const ghosts = share(result.ghosts);
  const weakAccents = accents !== null && accents < GOOD_SHARE;
  const weakGhosts = ghosts !== null && ghosts < GOOD_SHARE;
  if (weakAccents && weakGhosts) {
    return "Loud and soft notes sound too alike. Lift the stick high for accents, and play ghost notes from just above the pad.";
  }
  if (weakAccents) {
    return "Your accents don't stand out yet. Lift the stick higher for accented notes, and keep the other notes low.";
  }
  if (weakGhosts) {
    return "Your ghost notes are nearly as loud as the others. Play them from just above the pad, barely touching it.";
  }
  return "Nice control: your loud and soft notes are clearly different.";
}

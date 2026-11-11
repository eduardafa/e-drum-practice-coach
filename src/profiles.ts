/**
 * Skill levels. A level sets expectations: the on-time window, and how
 * calibration runs. Calibration still adapts to how steadily the drummer
 * actually plays; the level only sets its tempo, precision target and how
 * long it may keep listening.
 */

export type SkillLevel = "firstSteps" | "beginner" | "intermediate" | "advanced";

export const SKILL_LEVELS: readonly SkillLevel[] = ["firstSteps", "beginner", "intermediate", "advanced"];

export const DEFAULT_SKILL_LEVEL: SkillLevel = "beginner";

export function isSkillLevel(value: unknown): value is SkillLevel {
  return value === "firstSteps" || value === "beginner" || value === "intermediate" || value === "advanced";
}

export interface SkillProfile {
  label: string;
  /**
   * On-time window, in ms either side of the click. About 1.2 times the level's
   * typical spread, so roughly three hits in four count as on time: achievable,
   * but still a challenge.
   */
  toleranceMs: number;
  /** Typical spread (SD of hit timing) of a drummer at this level, in ms. */
  typicalSpreadMs: number;
  calibration: {
    /** Calibration tempo. Slower is easier to play steadily. */
    bpm: number;
    /** Most clicks to listen for after the count-in, before giving the best estimate so far. */
    maxClicks: number;
    /** Stop as soon as the offset is known to within this many ms. */
    targetUncertaintyMs: number;
  };
}

export const SKILL_PROFILES: Readonly<Record<SkillLevel, SkillProfile>> = {
  firstSteps: {
    label: "First steps",
    toleranceMs: 70,
    typicalSpreadMs: 60,
    // ±12 ms is a sixth of the ±70 ms window (Beginner's ratio too), and keeps a
    // ±69 ms player's run near a minute; ±10 would take about 80 s (simulated).
    calibration: { bpm: 60, maxClicks: 96, targetUncertaintyMs: 12 },
  },
  beginner: {
    label: "Beginner",
    toleranceMs: 35,
    typicalSpreadMs: 29,
    // ±7 ms is ample next to a ±35 ms window, and halves the run for a ±29 ms player.
    calibration: { bpm: 70, maxClicks: 80, targetUncertaintyMs: 7 },
  },
  intermediate: {
    label: "Intermediate",
    toleranceMs: 20,
    typicalSpreadMs: 17,
    calibration: { bpm: 80, maxClicks: 48, targetUncertaintyMs: 4 },
  },
  advanced: {
    label: "Advanced",
    toleranceMs: 10,
    typicalSpreadMs: 8,
    calibration: { bpm: 90, maxClicks: 32, targetUncertaintyMs: 3 },
  },
};

/** The level whose on-time window matches this tolerance, or null for a custom value. */
export function levelForTolerance(toleranceMs: number): SkillLevel | null {
  return SKILL_LEVELS.find((level) => SKILL_PROFILES[level].toleranceMs === toleranceMs) ?? null;
}

/** Fewest hits before a spread is trusted enough to suggest a level. */
export const MIN_HITS_FOR_SUGGESTION = 32;

/**
 * Ms a spread must be past the boundary between two levels before a different
 * level is suggested, so the suggestion doesn't flip back and forth for a
 * drummer whose spread sits near a boundary.
 */
export const SUGGESTION_MARGIN_MS = 3;

/** The level whose typical spread is closest to this one. */
export function closestLevel(spreadMs: number): SkillLevel {
  let best: SkillLevel = SKILL_LEVELS[0];
  for (const level of SKILL_LEVELS) {
    const gap = Math.abs(SKILL_PROFILES[level].typicalSpreadMs - spreadMs);
    if (gap < Math.abs(SKILL_PROFILES[best].typicalSpreadMs - spreadMs)) best = level;
  }
  return best;
}

/**
 * A different level to suggest for a drummer at `current` with this spread,
 * or null to keep the current one. A suggestion needs the spread to be at
 * least SUGGESTION_MARGIN_MS past the boundary (the midpoint between the two
 * levels' typical spreads).
 */
export function suggestLevel(current: SkillLevel, spreadMs: number): SkillLevel | null {
  const closest = closestLevel(spreadMs);
  if (closest === current) return null;
  const boundary = (SKILL_PROFILES[current].typicalSpreadMs + SKILL_PROFILES[closest].typicalSpreadMs) / 2;
  return Math.abs(spreadMs - boundary) >= SUGGESTION_MARGIN_MS ? closest : null;
}

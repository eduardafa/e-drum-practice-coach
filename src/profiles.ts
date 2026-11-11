/**
 * Skill levels. A level sets expectations: how calibration runs now, and the
 * on-time window later (EDU-31). Calibration still adapts to how steadily the
 * drummer actually plays; the level only sets its tempo, precision target
 * and how long it may keep listening.
 */

export type SkillLevel = "beginner" | "intermediate" | "advanced";

export const SKILL_LEVELS: readonly SkillLevel[] = ["beginner", "intermediate", "advanced"];

export const DEFAULT_SKILL_LEVEL: SkillLevel = "beginner";

export function isSkillLevel(value: unknown): value is SkillLevel {
  return value === "beginner" || value === "intermediate" || value === "advanced";
}

export interface SkillProfile {
  label: string;
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
  beginner: { label: "Beginner", calibration: { bpm: 70, maxClicks: 80, targetUncertaintyMs: 5 } },
  intermediate: { label: "Intermediate", calibration: { bpm: 80, maxClicks: 48, targetUncertaintyMs: 4 } },
  advanced: { label: "Advanced", calibration: { bpm: 90, maxClicks: 32, targetUncertaintyMs: 3 } },
};

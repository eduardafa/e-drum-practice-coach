import { describe, expect, it } from "vitest";
import { closestLevel, levelForTolerance, SKILL_LEVELS, SKILL_PROFILES, suggestLevel } from "./profiles";

describe("skill profiles", () => {
  it("tighten from beginner to advanced", () => {
    const windows = SKILL_LEVELS.map((l) => SKILL_PROFILES[l].toleranceMs);
    expect(windows).toEqual([35, 20, 10]);
  });

  it("set each window at about 1.2 times the level's typical spread", () => {
    for (const level of SKILL_LEVELS) {
      const { toleranceMs, typicalSpreadMs } = SKILL_PROFILES[level];
      expect(toleranceMs / typicalSpreadMs).toBeGreaterThan(1.1);
      expect(toleranceMs / typicalSpreadMs).toBeLessThan(1.35);
    }
  });
});

describe("levelForTolerance", () => {
  it("recognises each level's window", () => {
    expect(levelForTolerance(35)).toBe("beginner");
    expect(levelForTolerance(10)).toBe("advanced");
  });

  it("returns null for a custom window", () => {
    expect(levelForTolerance(15)).toBeNull();
  });
});

describe("closestLevel", () => {
  it.each([
    [30, "beginner"],
    [29, "beginner"],
    [18, "intermediate"],
    [8, "advanced"],
    [2, "advanced"],
    [60, "beginner"],
  ] as const)("±%i ms is closest to %s", (spread, level) => {
    expect(closestLevel(spread)).toBe(level);
  });
});

describe("suggestLevel", () => {
  it("suggests Beginner to a ±30 ms drummer on Advanced", () => {
    expect(suggestLevel("advanced", 30)).toBe("beginner");
  });

  it("suggests Advanced to a ±8 ms drummer on Beginner", () => {
    expect(suggestLevel("beginner", 8)).toBe("advanced");
  });

  it("suggests nothing when the level already fits", () => {
    expect(suggestLevel("beginner", 29)).toBeNull();
    expect(suggestLevel("intermediate", 17)).toBeNull();
  });

  it("doesn't flip near a boundary", () => {
    // The beginner/intermediate boundary is at 23 ms (midway between 29 and 17).
    expect(suggestLevel("beginner", 22)).toBeNull();
    expect(suggestLevel("intermediate", 24)).toBeNull();
    expect(suggestLevel("beginner", 19)).toBe("intermediate");
    expect(suggestLevel("intermediate", 27)).toBe("beginner");
  });
});

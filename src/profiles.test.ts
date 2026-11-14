import { describe, expect, it } from "vitest";
import { closestLevel, levelForTolerance, reachForTolerance, SKILL_LEVELS, SKILL_PROFILES, suggestLevel } from "./profiles";

describe("skill profiles", () => {
  it("tighten from beginner to advanced", () => {
    const windows = SKILL_LEVELS.map((l) => SKILL_PROFILES[l].toleranceMs);
    expect(windows).toEqual([70, 35, 20, 10]);
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
  it("recognizes each level's window", () => {
    expect(levelForTolerance(70)).toBe("firstSteps");
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
    [60, "firstSteps"],
    [69, "firstSteps"],
    [40, "beginner"],
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

  it("suggests First steps to a ±69 ms drummer on Beginner", () => {
    expect(suggestLevel("beginner", 69)).toBe("firstSteps");
  });

  it("suggests Beginner once a First steps drummer tightens to about ±40 ms", () => {
    expect(suggestLevel("firstSteps", 40)).toBe("beginner");
  });

  it("doesn't flip near the First steps / Beginner boundary", () => {
    // The boundary is at 44.5 ms (midway between 60 and 29).
    expect(suggestLevel("beginner", 46)).toBeNull();
    expect(suggestLevel("firstSteps", 43)).toBeNull();
    expect(suggestLevel("beginner", 48)).toBe("firstSteps");
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

describe("reachForTolerance", () => {
  it("lets less steady levels' hits land further from a note and still count", () => {
    expect(SKILL_LEVELS.map((level) => reachForTolerance(SKILL_PROFILES[level].toleranceMs))).toEqual([300, 200, 150, 100]);
  });

  it("uses the nearest level for a window set by hand", () => {
    expect(reachForTolerance(60)).toBe(300);
    expect(reachForTolerance(30)).toBe(200);
    expect(reachForTolerance(5)).toBe(100);
  });
});

import { describe, expect, it } from "vitest";
import { FIRST_STEPS } from "../exercises/library";
import { PATHS } from "../exercises/path";
import type { Exercise } from "../exercises/types";
import { isQuietBar } from "../playalong/quietBars";
import { DRIFT_MS, quietBarsResult, quietBarsText, suggestQuietBars } from "./quietBars";
import type { NoteTuple } from "./record";

/** One bar of 4/4, a note on each beat (48 ticks per quarter). */
const ONE_BAR: Pick<Exercise, "bars" | "timeSignature" | "notes"> = {
  bars: 1,
  timeSignature: { beats: 4, unit: 4 },
  notes: [0, 48, 96, 144].map((tick) => ({ tick, pad: "hihat" as const, dynamic: "normal" as const })),
};

/**
 * A session of `loops` one-bar loops with one bar in `every` quiet: each note's
 * timing comes from `clicked` or `quiet` (by beat, 0 to 3; null is missed).
 */
function played(every: number, loops: number, clicked: (beat: number) => number | null, quiet: (beat: number) => number | null) {
  const notes: NoteTuple[] = [];
  for (let loop = 0; loop < loops; loop++) {
    for (let beat = 0; beat < 4; beat++) {
      const deltaMs = isQuietBar(loop, every) ? quiet(beat) : clicked(beat);
      notes.push([beat, loop, deltaMs, deltaMs === null ? null : 90]);
    }
  }
  return { notes, quietEvery: every };
}

describe("quietBarsResult", () => {
  it("finds rushing: earlier in the quiet bars than with the click", () => {
    const result = quietBarsResult(played(4, 8, () => 3, () => -25), ONE_BAR);
    expect(result).toEqual({ kind: "rushed", quietMs: -25, clickMs: 3, growing: false });
  });

  it("finds dragging, and when it grew through the bar", () => {
    const result = quietBarsResult(played(4, 8, () => 0, (beat) => 10 + beat * 15), ONE_BAR);
    expect(result).toMatchObject({ kind: "dragged", growing: true });
  });

  it("compares with the drummer's own clicked bars, not with zero", () => {
    // Always a little late, the same with or without the click: that's keeping time.
    expect(quietBarsResult(played(2, 8, () => 30, () => 30 + DRIFT_MS - 1), ONE_BAR)).toMatchObject({ kind: "steady" });
  });

  it("says the drummer stopped when most quiet-bar notes weren't played", () => {
    expect(quietBarsResult(played(4, 8, () => 0, () => null), ONE_BAR)).toEqual({ kind: "stopped", missed: 8, notes: 8 });
  });

  it("says nothing when the click never went quiet, or too little was played", () => {
    expect(quietBarsResult({ ...played(4, 8, () => 0, () => -40), quietEvery: undefined }, ONE_BAR)).toBeNull();
    // The quiet bar went fine, but nothing with the click to compare it with.
    expect(quietBarsResult(played(4, 4, () => null, () => -40), ONE_BAR)).toBeNull();
  });

  it("counts bars across a multi-bar exercise's loops", () => {
    // Two bars per loop, one in two quiet: the second bar of every loop.
    const twoBars = { ...ONE_BAR, bars: 2, notes: [0, 96, 192, 288].map((tick) => ({ tick, pad: "snare" as const, dynamic: "normal" as const })) };
    const notes: NoteTuple[] = [];
    for (let loop = 0; loop < 4; loop++) {
      notes.push([0, loop, 0, 80], [1, loop, 0, 80], [2, loop, -30, 80], [3, loop, -30, 80]);
    }
    expect(quietBarsResult({ notes, quietEvery: 2 }, twoBars)).toMatchObject({ kind: "rushed", quietMs: -30, clickMs: 0 });
  });
});

describe("quietBarsText", () => {
  it("says which way and by about how much, against the click", () => {
    expect(quietBarsText({ kind: "rushed", quietMs: -26, clickMs: 3, growing: false })).toMatch(
      /^In the quiet bars you sped up: your hits came about 25 ms early on average, compared with 3 ms late with the click\./,
    );
    expect(quietBarsText({ kind: "dragged", quietMs: 31, clickMs: 0, growing: true })).toMatch(
      /slowed down: .*30 ms late .* right on time with the click\. It grew as the bar went on\./,
    );
  });

  it("keeps it short when time held", () => {
    expect(quietBarsText({ kind: "steady", quietMs: 2, clickMs: 1 })).toBe("You kept time without the click: about the same timing as with it.");
  });
});

describe("suggestQuietBars", () => {
  const late = PATHS[0].goalId;
  it("suggests quiet bars after a good run late in First steps, with the click on every bar", () => {
    expect(suggestQuietBars({ exerciseId: late }, 0.95, 0.9)).toBe(true);
    expect(suggestQuietBars({ exerciseId: PATHS[1].steps[0].id }, 0.95, 0.9)).toBe(true);
  });

  it("not before the basics, below the pass mark, or when quiet bars were already on", () => {
    expect(suggestQuietBars({ exerciseId: FIRST_STEPS[0].id }, 1, 0.9)).toBe(false);
    expect(suggestQuietBars({ exerciseId: late }, 0.5, 0.9)).toBe(false);
    expect(suggestQuietBars({ exerciseId: late, quietEvery: 4 }, 1, 0.9)).toBe(false);
  });
});

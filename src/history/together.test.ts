import { describe, expect, it } from "vitest";
import type { PadId } from "../kit/nitroMax";
import type { NoteTuple, SessionRecord } from "./record";
import { APART_MS, apartHits, apartTip, MIN_PAIRS } from "./together";

/** Hi-hat and kick together on 1, snare alone on 3. */
const PADS: PadId[] = ["hihat", "kick", "snare"];
const TICKS = [0, 0, 96];

/** A session where each loop's timings are [hi-hat, kick, snare] in ms (null: missed). */
function session(loops: (number | null)[][], pads = PADS): Pick<SessionRecord, "voices" | "notes"> {
  return {
    voices: pads.map((pad) => ({ pad, dynamic: "normal" as const, hand: null })),
    notes: loops.flatMap((timings, loop) =>
      timings.map((deltaMs, index): NoteTuple => [index, loop, deltaMs, deltaMs === null ? null : 90]),
    ),
  };
}

const repeat = (timings: (number | null)[], times = 8) => Array.from({ length: times }, () => timings);

describe("apartHits", () => {
  it("finds the kick landing after the hi-hat, by the median gap", () => {
    const loops = [[0, 30, 0], [5, 35, 0], [-5, 20, 0], [0, 40, 0], [10, 40, 0], [0, 25, 0]];
    expect(apartHits(session(loops), TICKS)).toEqual({ first: "hihat", second: "kick", gapMs: 30, pairs: 6 });
  });

  it("works either way round: a hand that comes after the foot", () => {
    expect(apartHits(session(repeat([25, -5, 0])), TICKS)).toMatchObject({ first: "kick", second: "hihat", gapMs: 30 });
  });

  it("says nothing when they land together, even if both are late", () => {
    expect(apartHits(session(repeat([40, 45, 40])), TICKS)).toBeNull();
    expect(apartHits(session(repeat([0, APART_MS - 1, 0])), TICKS)).toBeNull();
  });

  it("says nothing when the gap goes both ways: that's noise, not a habit", () => {
    const loops = [[0, 30, 0], [30, 0, 0], [0, 30, 0], [30, 0, 0], [0, 30, 0], [0, 30, 0]];
    expect(apartHits(session(loops), TICKS)).toBeNull();
  });

  it("needs enough pairs, and skips loops where either note was missed", () => {
    expect(apartHits(session(repeat([0, 40, 0], MIN_PAIRS - 1)), TICKS)).toBeNull();
    const withMisses = [...repeat([0, 40, 0], MIN_PAIRS - 1), [null, 40, 0], [0, null, 0]];
    expect(apartHits(session(withMisses), TICKS)).toBeNull();
    expect(apartHits(session(repeat([0, 40, 0], MIN_PAIRS)), TICKS)).toMatchObject({ pairs: MIN_PAIRS });
  });

  it("says nothing when no two drums are written together", () => {
    expect(apartHits(session(repeat([0, 40, 0])), [0, 48, 96])).toBeNull();
  });

  it("picks the pair furthest apart", () => {
    // Hi-hat, kick and snare all on 1: the snare is further behind than the kick.
    const result = apartHits(session(repeat([0, 25, 60])), [0, 0, 0]);
    expect(result).toMatchObject({ first: "hihat", second: "snare", gapMs: 60 });
  });

  it("gives up when the exercise no longer matches the record", () => {
    expect(apartHits(session(repeat([0, 40, 0])), [0, 0])).toBeNull();
  });
});

describe("apartTip", () => {
  it("says which drum lands late, rounded to 5 ms, with a tip for hand and foot", () => {
    const tip = apartTip({ first: "hihat", second: "kick", gapMs: 31, pairs: 8 });
    expect(tip).toContain("your kick lands about 30 ms after the hi-hat");
    expect(tip).toContain("hand and foot");
  });

  it("has a tip for two hands and for two feet", () => {
    expect(apartTip({ first: "hihat", second: "snare", gapMs: 25, pairs: 8 })).toContain("both sticks");
    expect(apartTip({ first: "kick", second: "hihatPedal", gapMs: 25, pairs: 8 })).toContain("both feet");
  });
});

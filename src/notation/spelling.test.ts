import { describe, expect, it } from "vitest";
import { fromGrid, type GridSpec } from "../exercises/grid";
import { EXERCISES, findExercise } from "../exercises/library";
import { ticksPerBar, type Exercise } from "../exercises/types";
import { groupTicks, isCompound, spellBar, voiceOf, type SpelledEvent } from "./spelling";

function exercise(id: string): Exercise {
  const found = findExercise(id);
  if (!found) throw new Error(`missing exercise ${id}`);
  return found;
}

const base: GridSpec = {
  id: "spelling-test",
  name: "Spelling test",
  category: "groove",
  description: "For tests.",
  timeSignature: { beats: 4, unit: 4 },
  bars: 1,
  tempo: { min: 60, suggested: 80, max: 120 },
  stepsPerBar: 16,
  lanes: {},
};

/** "q", "8.", "r16" (a rest), "t8" (a triplet eighth): compact, readable expectations. */
function shape(events: SpelledEvent[] | null): string[] | null {
  return (
    events?.map((e) => `${e.notes.length === 0 ? "r" : ""}${e.tuplet === null ? "" : "t"}${e.value}${e.dotted ? "." : ""}`) ??
    null
  );
}

describe("voices", () => {
  it("puts the feet down and everything else up", () => {
    expect(voiceOf("kick")).toBe("feet");
    expect(voiceOf("hihatPedal")).toBe("feet");
    expect(voiceOf("snare")).toBe("hands");
    expect(voiceOf("hihat")).toBe("hands");
    expect(voiceOf("ride")).toBe("hands");
  });

  it("groups eighths in threes in compound time", () => {
    expect(isCompound({ beats: 6, unit: 8 })).toBe(true);
    expect(isCompound({ beats: 3, unit: 8 })).toBe(false);
    expect(groupTicks({ beats: 6, unit: 8 })).toBe(72);
    expect(groupTicks({ beats: 4, unit: 4 })).toBe(48);
  });
});

describe("spellBar: the starter library", () => {
  it("rock beat: eighths on top, kick as quarters with quarter rests", () => {
    const bar = spellBar(exercise("rock-8ths"), 0);
    expect(shape(bar.hands)).toEqual(Array(8).fill("8"));
    expect(shape(bar.feet)).toEqual(["q", "rq", "q", "rq"]);
  });

  it("puts hi-hat and snare struck together in one chord", () => {
    const hands = spellBar(exercise("rock-8ths"), 0).hands ?? [];
    expect(hands[2].notes.map((n) => n.pad).toSorted()).toEqual(["hihat", "snare"]);
  });

  it("sixteenth groove: the kick on 3 and its 'and' are two eighths", () => {
    const bar = spellBar(exercise("rock-16ths"), 0);
    expect(shape(bar.hands)).toEqual(Array(16).fill("16"));
    expect(shape(bar.feet)).toEqual(["q", "rq", "8", "8", "rq"]);
  });

  it("half-time ghosts: eighth, sixteenth, sixteenth where the ghost note falls", () => {
    const hands = spellBar(exercise("half-time-ghosts"), 0).hands;
    expect(shape(hands)?.slice(0, 3)).toEqual(["8", "16", "16"]);
  });

  it("6/8: eighths in two groups of three, kick as a dotted quarter", () => {
    const bar = spellBar(exercise("six-eight"), 0);
    expect(shape(bar.hands)).toEqual(Array(6).fill("8"));
    expect(shape(bar.feet)).toEqual(["q.", "rq", "r8"]);
  });

  it("triplets: twelve triplet eighths, grouped per beat", () => {
    const hands = spellBar(exercise("triplet-singles"), 0).hands ?? [];
    expect(shape(hands)).toEqual(Array(12).fill("t8"));
    expect(new Set(hands.map((e) => e.tuplet))).toEqual(new Set([0, 48, 96, 144]));
  });

  it("rudiments without feet have no feet voice", () => {
    expect(spellBar(exercise("paradiddle"), 0).feet).toBeNull();
  });

  it("keeps accents, flams and sticking on the notes", () => {
    const flams = spellBar(exercise("flam-taps"), 0).hands ?? [];
    expect(flams[0].notes[0]).toMatchObject({ flam: true, dynamic: "accent", hand: "R" });
    expect(flams[1].notes[0]).toMatchObject({ dynamic: "normal", hand: "R" });
  });

  it("fills every bar of every exercise exactly, in both voices", () => {
    for (const ex of EXERCISES) {
      for (let bar = 0; bar < ex.bars; bar++) {
        const spelled = spellBar(ex, bar);
        for (const events of [spelled.hands, spelled.feet]) {
          if (!events) continue;
          const total = events.reduce((sum, e) => sum + e.ticks, 0);
          expect({ id: ex.id, bar, total }).toEqual({ id: ex.id, bar, total: ticksPerBar(ex.timeSignature) });
          events.slice(1).forEach((e, i) => expect(e.tick).toBe(events[i].tick + events[i].ticks));
        }
      }
    }
  });

  it("writes every note of every exercise exactly once", () => {
    for (const ex of EXERCISES) {
      const written = Array.from({ length: ex.bars }, (_, bar) => spellBar(ex, bar)).flatMap((b) =>
        [...(b.hands ?? []), ...(b.feet ?? [])].flatMap((e) => e.notes),
      );
      expect({ id: ex.id, written: written.length }).toEqual({ id: ex.id, written: ex.notes.length });
    }
  });
});

describe("spellBar: rests and offbeats", () => {
  it("an offbeat sixteenth: sixteenth rest, then a dotted eighth", () => {
    const ex = fromGrid({ ...base, lanes: { snare: "-x-- ---- ---- ----" } });
    expect(shape(spellBar(ex, 0).hands)).toEqual(["r16", "8.", "rq", "rh"]);
  });

  it("the last sixteenth of a beat: eighth rest, sixteenth rest, then the note", () => {
    const ex = fromGrid({ ...base, lanes: { snare: "---x ---- ---- ----" } });
    expect(shape(spellBar(ex, 0).hands)).toEqual(["r8", "r16", "16", "rq", "rh"]);
  });

  it("merges empty beats into half rests on 1–2 and 3–4 only", () => {
    const onThree = fromGrid({ ...base, stepsPerBar: 4, lanes: { snare: "--x-" } });
    expect(shape(spellBar(onThree, 0).hands)).toEqual(["rh", "q", "rq"]);
    const onTwo = fromGrid({ ...base, stepsPerBar: 4, lanes: { snare: "-x--" } });
    expect(shape(spellBar(onTwo, 0).hands)).toEqual(["rq", "q", "rh"]);
  });

  it("a triplet with a gap: triplet eighth, then a triplet quarter", () => {
    const ex = fromGrid({ ...base, stepsPerBar: 12, lanes: { snare: "xx- --- --- ---" } });
    expect(shape(spellBar(ex, 0).hands)).toEqual(["t8", "tq", "rq", "rh"]);
  });

  it("spells each bar of a two-bar exercise separately", () => {
    const ex = fromGrid({ ...base, bars: 2, stepsPerBar: 4, lanes: { kick: "x--- ---x" } });
    expect(shape(spellBar(ex, 0).feet)).toEqual(["q", "rq", "rh"]);
    expect(shape(spellBar(ex, 1).feet)).toEqual(["rh", "rq", "q"]);
    expect(spellBar(ex, 1).feet?.[2].tick).toBe(192 + 144);
  });

  it("rejects rhythms it can't write instead of drawing them wrong", () => {
    const ex = fromGrid({ ...base, stepsPerBar: 48, lanes: { snare: `xx${"-".repeat(46)}` } });
    expect(() => spellBar(ex, 0)).toThrow(/unsupported rhythm/);
  });
});

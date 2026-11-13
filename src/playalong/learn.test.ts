import { describe, expect, it } from "vitest";
import { findExercise } from "../exercises/library";
import type { Exercise } from "../exercises/types";
import type { PadId } from "../kit/nitroMax";
import { LearnSession, learnSteps } from "./learn";
import type { PlayedHit } from "./matcher";

function exercise(id: string): Exercise {
  const found = findExercise(id);
  if (!found) throw new Error(`missing exercise ${id}`);
  return found;
}

let clock = 0;
function hit(pad: PadId, zone: string | null = pad === "hihat" ? "closed" : "head", time = (clock += 1000)): PlayedHit {
  return { pad, zone, time };
}

describe("learnSteps", () => {
  it("groups notes that sound together, in order", () => {
    const steps = learnSteps(exercise("rock-8ths"));
    expect(steps).toHaveLength(8);
    expect(steps[0].notes.map((n) => n.pad).toSorted()).toEqual(["hihat", "kick"]);
    expect(steps[2].notes.map((n) => n.pad).toSorted()).toEqual(["hihat", "snare"]);
    expect(steps[1].notes.map((n) => n.pad)).toEqual(["hihat"]);
  });
});

describe("LearnSession", () => {
  it("waits until every pad of a step is hit, in any order, then moves on", () => {
    const s = new LearnSession(exercise("rock-8ths"), 1);
    expect(s.currentTick()).toBe(0);
    expect(s.hit(hit("kick"))).toBe("correct");
    expect(s.currentTick()).toBe(0);
    expect(s.hit(hit("hihat"))).toBe("advanced");
    expect(s.currentTick()).toBe(24);
  });

  it("counts wrong pads without moving on", () => {
    const s = new LearnSession(exercise("rock-8ths"), 1);
    expect(s.hit(hit("snare"))).toBe("wrong");
    expect(s.hit(hit("hihat", "open"))).toBe("wrong"); // open where the music says closed
    expect(s.wrongHits).toBe(2);
    expect(s.currentTick()).toBe(0);
  });

  it("counts a second hit on a pad already played in this step as wrong", () => {
    const s = new LearnSession(exercise("rock-8ths"), 1);
    s.hit(hit("kick"));
    expect(s.hit(hit("kick"))).toBe("wrong");
  });

  it("loops, then finishes after the set number of loops", () => {
    const s = new LearnSession(exercise("first-hihat-quarters"), 2);
    for (let i = 0; i < 4; i++) s.hit(hit("hihat"));
    expect(s.currentLoop).toBe(1);
    expect(s.currentTick()).toBe(192); // loop 2, step 1: one 4/4 bar later
    for (let i = 0; i < 3; i++) expect(s.hit(hit("hihat"))).toBe("advanced");
    expect(s.hit(hit("hihat"))).toBe("done");
    expect(s.done).toBe(true);
    expect(s.hit(hit("hihat"))).toBe("ignored");
    expect(s.currentTick()).toBeNull();
    expect(s.cues()).toEqual([]);
  });

  it("cues the pads still needed at full strength, and the next step's faintly", () => {
    const s = new LearnSession(exercise("rock-8ths"), 1);
    expect(s.cues().toSorted((a, b) => a.pad.localeCompare(b.pad))).toEqual([
      { pad: "hihat", strength: 1 },
      { pad: "kick", strength: 1 },
    ]);
    s.hit(hit("kick"));
    // Kick done; hi-hat still needed (and it's also the next step).
    expect(s.cues()).toEqual([{ pad: "hihat", strength: 1 }]);
    s.hit(hit("hihat"));
    // Step 2 is hi-hat alone; step 3 (hi-hat + snare) previews the snare.
    expect(s.cues().toSorted((a, b) => a.pad.localeCompare(b.pad))).toEqual([
      { pad: "hihat", strength: 1 },
      { pad: "snare", strength: 0.3 },
    ]);
  });

  it("doesn't count a flam's second stroke as wrong", () => {
    const s = new LearnSession(exercise("flam-taps"), 1);
    const first = s.steps[0].notes[0];
    expect(first.flam).toBe(true);
    expect(s.hit(hit(first.pad, "head", 10_000))).not.toBe("wrong");
    expect(s.hit(hit(first.pad, "head", 10_040))).toBe("ignored");
    expect(s.wrongHits).toBe(0);
    // Only one stroke is absorbed: the next hit, even soon after, plays the next step.
    expect(s.hit(hit(first.pad, "head", 10_080))).not.toBe("ignored");
  });
});

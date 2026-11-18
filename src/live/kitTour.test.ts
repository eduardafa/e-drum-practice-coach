import { describe, expect, it } from "vitest";
import type { PadId } from "../kit/nitroMax";
import { KitTour, QUIZ_LENGTH, TOUR_PADS } from "./kitTour";

/** Hits every tour pad in order, skipping some. */
function finishTour(tour: KitTour, skip: PadId[] = []) {
  for (const { pad } of TOUR_PADS) {
    if (skip.includes(pad)) tour.skip();
    else tour.hit({ pad });
  }
}

describe("KitTour", () => {
  it("lights each pad in turn and moves on only when that pad is hit", () => {
    const tour = new KitTour();
    expect(tour.phase).toBe("tour");
    expect(tour.current).toBe("hihat");
    expect(tour.cues()).toEqual([{ pad: "hihat", strength: 1 }]);
    expect(tour.progress).toEqual({ at: 1, of: TOUR_PADS.length });

    tour.hit({ pad: "snare" });
    expect(tour.current).toBe("hihat");
    expect(tour.feedback).toEqual({ kind: "wrong", asked: "hihat", hit: "snare" });

    tour.hit({ pad: "hihat" });
    expect(tour.current).toBe("snare");
    expect(tour.feedback).toEqual({ kind: "right", pad: "hihat" });
  });

  it("then quizzes without lighting the pad, until a wrong hit", () => {
    const tour = new KitTour();
    finishTour(tour);
    expect(tour.phase).toBe("quiz");
    expect(tour.progress).toEqual({ at: 1, of: QUIZ_LENGTH });
    const asked = tour.current;
    expect(asked).not.toBeNull();
    expect(tour.cues()).toEqual([]);

    tour.hit({ pad: asked === "kick" ? "snare" : "kick" });
    expect(tour.cues()).toEqual([{ pad: asked, strength: 1 }]);
    tour.hit({ pad: asked });
    expect(tour.cues()).toEqual([]);
    expect(tour.progress.at).toBe(2);
  });

  it("counts the questions answered right on the first hit", () => {
    const tour = new KitTour();
    finishTour(tour);
    // First question wrong once, the rest right.
    const first = tour.current;
    tour.hit({ pad: null });
    tour.hit({ pad: first });
    while (tour.current) tour.hit({ pad: tour.current });
    expect(tour.phase).toBe("done");
    expect(tour.score).toEqual({ right: QUIZ_LENGTH - 1, of: QUIZ_LENGTH });
    expect(tour.cues()).toEqual([]);
  });

  it("never asks for the same pad twice in a row, and uses every pad before repeating", () => {
    for (const seed of [0, 0.3, 0.6, 0.99]) {
      const tour = new KitTour(() => seed);
      finishTour(tour);
      const asked: PadId[] = [];
      while (tour.current) {
        asked.push(tour.current);
        tour.hit({ pad: tour.current });
      }
      expect(asked).toHaveLength(QUIZ_LENGTH);
      expect(new Set(asked).size).toBe(QUIZ_LENGTH);
      expect(asked.every((p, i) => i === 0 || p !== asked[i - 1])).toBe(true);
    }
  });

  it("leaves skipped pads out of the quiz, and repeats pads (never back to back) on a small kit", () => {
    const keep = new Set<PadId>(["hihat", "snare", "kick"]);
    const tour = new KitTour(() => 0);
    finishTour(
      tour,
      TOUR_PADS.map((p) => p.pad).filter((p) => !keep.has(p)),
    );
    const asked: PadId[] = [];
    while (tour.current) {
      asked.push(tour.current);
      tour.hit({ pad: tour.current });
    }
    expect(asked).toHaveLength(QUIZ_LENGTH);
    expect(asked.every((p) => keep.has(p))).toBe(true);
    expect(asked.every((p, i) => i === 0 || p !== asked[i - 1])).toBe(true);
  });

  it("tells subscribers about every change", () => {
    const tour = new KitTour();
    let calls = 0;
    const off = tour.subscribe(() => calls++);
    tour.hit({ pad: "kick" });
    tour.hit({ pad: "hihat" });
    tour.skip();
    off();
    tour.hit({ pad: "kick" });
    expect(calls).toBe(3);
    expect(tour.version).toBe(4);
  });
});

import { describe, expect, it } from "vitest";
import { findExercise } from "../exercises/library";
import { previewPlan } from "../exercises/preview";
import { guideStrokes } from "./guideTrack";

function plan(id: string, bpm: number) {
  const exercise = findExercise(id);
  if (!exercise) throw new Error(`missing exercise ${id}`);
  return previewPlan(exercise, bpm);
}

describe("guideStrokes", () => {
  it("places one loop's strokes from the loop's start on the audio clock", () => {
    const strokes = guideStrokes(plan("first-hihat-quarters", 60), 10, 0);
    expect(strokes.map((s) => [s.time, s.pad])).toEqual([
      [10, "hihat"],
      [11, "hihat"],
      [12, "hihat"],
      [13, "hihat"],
    ]);
  });

  it("skips strokes already in the past", () => {
    expect(guideStrokes(plan("first-hihat-quarters", 60), 10, 11.5).map((s) => s.time)).toEqual([12, 13]);
  });

  it("keeps a flam's grace note just before its stroke", () => {
    const strokes = guideStrokes(plan("flam-taps", 60), 10, 0);
    expect(strokes[0]).toMatchObject({ grace: true, dynamic: "ghost" });
    expect(strokes[0].time).toBeLessThan(10);
  });
});

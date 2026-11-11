import { describe, expect, it } from "vitest";
import { mergePoints, xAtTick, type StaffLayout } from "./layout";

// One 4/4 bar: notes on each beat, bar end at 400 px.
const layout: StaffLayout = {
  width: 420,
  height: 150,
  lengthTicks: 192,
  points: [
    { tick: 0, x: 100 },
    { tick: 48, x: 175 },
    { tick: 96, x: 250 },
    { tick: 144, x: 325 },
    { tick: 192, x: 400 },
  ],
};

describe("xAtTick", () => {
  it("is exactly on a note at its tick", () => {
    expect(xAtTick(layout, 0)).toBe(100);
    expect(xAtTick(layout, 96)).toBe(250);
  });

  it("glides between notes", () => {
    expect(xAtTick(layout, 24)).toBe(137.5);
    expect(xAtTick(layout, 168)).toBe(362.5);
  });

  it("wraps around when the exercise loops", () => {
    expect(xAtTick(layout, 192)).toBe(100);
    expect(xAtTick(layout, 192 + 48)).toBe(175);
    expect(xAtTick(layout, -48)).toBe(325);
  });

  it("copes with an empty layout", () => {
    expect(xAtTick({ ...layout, points: [] }, 10)).toBe(0);
  });
});

describe("mergePoints", () => {
  it("keeps one point per tick, the leftmost, sorted", () => {
    expect(
      mergePoints([
        { tick: 48, x: 180 },
        { tick: 0, x: 102 },
        { tick: 0, x: 100 },
        { tick: 48, x: 175 },
      ]),
    ).toEqual([
      { tick: 0, x: 100 },
      { tick: 48, x: 175 },
    ]);
  });
});

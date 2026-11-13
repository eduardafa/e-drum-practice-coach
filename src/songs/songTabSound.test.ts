import { describe, expect, it } from "vitest";
import type { PlacedNote } from "./drumTab";
import { firstNoteFrom } from "./songTabSound";

const notes: PlacedNote[] = [0.5, 1, 1, 1.5].map((time, id) => ({ id, time, pad: "snare", open: false }));

describe("firstNoteFrom", () => {
  it("finds the first note at or after a song time", () => {
    expect(firstNoteFrom(notes, 0)).toBe(0);
    expect(firstNoteFrom(notes, 1)).toBe(1);
    expect(firstNoteFrom(notes, 1.2)).toBe(3);
    expect(firstNoteFrom(notes, 9)).toBe(4);
  });
});

import { describe, expect, it } from "vitest";
import type { PlacedNote } from "../songs/drumTab";
import { songTabCues } from "./coach";

const note = (id: number, time: number, pad: PlacedNote["pad"]): PlacedNote => ({ id, time, pad, open: false });
const tab = [note(0, 1, "kick"), note(1, 1.25, "hihat"), note(2, 1.5, "snare"), note(3, 5, "crash")];

describe("songTabCues", () => {
  it("lights the pads coming up in the next 0.6 s, brighter the closer they are", () => {
    const cues = songTabCues(tab, 0.9);
    expect(cues.map((c) => c.pad).toSorted()).toEqual(["hihat", "kick", "snare"]);
    const kick = cues.find((c) => c.pad === "kick")!.strength;
    const snare = cues.find((c) => c.pad === "snare")!.strength;
    expect(kick).toBeGreaterThan(snare);
  });

  it("lets a pad fade just after its note, and shows nothing far from any note", () => {
    expect(songTabCues(tab, 1.05).map((c) => c.pad)).toContain("kick");
    expect(songTabCues(tab, 3)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { isSubdivision, MAX_BPM, MIN_BPM } from "../audio/schedule";
import { findExercise } from "../exercises/library";
import { GUIDE_COUNTS, METRONOME_GUIDE } from "./metronomeGuide";

describe("metronome guide", () => {
  it("has four steps with unique ids", () => {
    expect(METRONOME_GUIDE.map((s) => s.id)).toHaveLength(4);
    expect(new Set(METRONOME_GUIDE.map((s) => s.id)).size).toBe(4);
  });

  it.each(METRONOME_GUIDE.map((s) => [s.id, s] as const))("%s has valid patterns and settings", (_, step) => {
    for (const lane of step.lanes) expect(lane.pattern).toMatch(new RegExp(`^[x-]{${GUIDE_COUNTS.length}}$`));
    const { bpm, beatsPerBar, subdivision } = step.metronome;
    expect(bpm).toBeGreaterThanOrEqual(MIN_BPM);
    expect(bpm).toBeLessThanOrEqual(MAX_BPM);
    expect(beatsPerBar).toBe(4);
    expect(isSubdivision(subdivision)).toBe(true);
  });

  it("scores the '&' as soon as the hi-hat plays it", () => {
    for (const step of METRONOME_GUIDE) {
      const playsOffbeats = step.lanes.some((l) => l.pattern.split("").some((c, i) => c === "x" && i % 2 === 1));
      expect(step.metronome.subdivision).toBe(playsOffbeats ? 2 : 1);
    }
  });

  it("ends with the money beat, matching the library's rock beat", () => {
    const last = METRONOME_GUIDE.at(-1);
    const rock = findExercise("rock-8ths");
    if (!last || !rock) throw new Error("fixture");
    const lane = (label: string) => last.lanes.find((l) => l.label === label)?.pattern;
    // The library's rock beat is 8 steps per bar; tick / 24 gives the eighth-note count.
    const fromLibrary = (pad: string) =>
      [...Array(8)].map((_, i) => (rock.notes.some((n) => n.pad === pad && n.tick === i * 24) ? "x" : "-")).join("");
    expect(lane("Hi-hat")).toBe(fromLibrary("hihat"));
    expect(lane("Snare")).toBe(fromLibrary("snare"));
    expect(lane("Kick")).toBe(fromLibrary("kick"));
  });
});

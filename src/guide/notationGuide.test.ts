import { describe, expect, it } from "vitest";
import { EXERCISES, findExercise } from "../exercises/library";
import { ticksPerBar } from "../exercises/types";
import { validateExercise } from "../exercises/validate";
import { spellBar } from "../notation/spelling";
import { NOTATION_GUIDE, NOTATION_GUIDE_TRY_ID } from "./notationGuide";

const pages = NOTATION_GUIDE.map((p) => [p.id, p] as const);

describe("notation guide", () => {
  it("has pages with unique ids, titles and text", () => {
    expect(NOTATION_GUIDE.length).toBeGreaterThan(0);
    expect(new Set(NOTATION_GUIDE.map((p) => p.id)).size).toBe(NOTATION_GUIDE.length);
    for (const page of NOTATION_GUIDE) {
      expect(page.title.trim()).not.toBe("");
      expect(page.text.length).toBeGreaterThan(0);
    }
  });

  it.each(pages)("%s has a valid example", (_, page) => {
    expect(validateExercise(page.example)).toEqual([]);
    // The engraver spells every bar first; an unsupported rhythm would throw here.
    for (let bar = 0; bar < page.example.bars; bar++) expect(() => spellBar(page.example, bar)).not.toThrow();
  });

  it.each(pages)("%s's counts line up with its notes", (_, page) => {
    if (!page.count) return;
    const counts = page.count.split(" ");
    const barTicks = ticksPerBar(page.example.timeSignature);
    expect(barTicks % counts.length).toBe(0);
    const step = barTicks / counts.length;
    for (const note of page.example.notes) expect(note.tick % step).toBe(0);
  });

  it("gives the examples ids of their own, so a Listen never stands for a library exercise", () => {
    const libraryIds = new Set(EXERCISES.map((e) => e.id));
    const ids = NOTATION_GUIDE.map((p) => p.example.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(libraryIds.has(id)).toBe(false);
  });

  it("ends by offering an exercise that exists", () => {
    expect(findExercise(NOTATION_GUIDE_TRY_ID)).toBeDefined();
  });
});

import { describe, expect, it } from "vitest";
import { define, GLOSSARY, lookupTerm } from "./glossary";

describe("glossary", () => {
  it.each(GLOSSARY)("gives $word one plain, non-empty sentence", ({ word, definition }) => {
    expect(word.trim()).not.toBe("");
    // One sentence: starts with a capital, ends with a period, and no period in between.
    expect(definition).toMatch(/^[A-Z][^.]*\.$/);
  });

  it("lists each word once", () => {
    const words = GLOSSARY.map((e) => e.word.toLowerCase());
    expect(new Set(words).size).toBe(words.length);
  });

  it("finds words ignoring case, spacing and a plural s", () => {
    const ghost = GLOSSARY.find((e) => e.word === "ghost note");
    expect(lookupTerm("ghost note")).toBe(ghost);
    expect(lookupTerm("Ghost Note")).toBe(ghost);
    expect(lookupTerm("  ghost   NOTES ")).toBe(ghost);
    expect(lookupTerm("bpm")).toBe(GLOSSARY.find((e) => e.word === "BPM"));
    expect(lookupTerm("Grooves")?.word).toBe("groove");
  });

  it("finds nothing for a word that isn't in the list", () => {
    expect(lookupTerm("cowbell solo")).toBeUndefined();
    expect(lookupTerm("")).toBeUndefined();
  });

  it("defines every listed word", () => {
    for (const { word, definition } of GLOSSARY) expect(define(word)).toBe(definition);
  });
});

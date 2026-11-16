import { describe, expect, it } from "vitest";
import type { DrumTab } from "./drumTab";
import { MAX_TAB_NOTES, forgetTab, keepTabsFor, loadTab, parseTabs, saveTab, type RememberedTab, type TabStorage } from "./tabStore";

/** A Storage stand-in that refuses writes over `limit` characters, like a full quota. */
function memory(limit = Infinity): TabStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (v.length > limit) throw new DOMException("full", "QuotaExceededError");
      data.set(k, v);
    },
  };
}

/** How many characters one tab takes once saved (as the compact form actually written). */
function storedSize(e: RememberedTab): number {
  const probe = memory();
  saveTab(e, probe);
  return [...probe.data.values()][0]?.length ?? 0;
}

const tab = (notes = 4): DrumTab => ({
  notes: Array.from({ length: notes }, (_, i) => ({ beat: i / 2, pad: i % 2 ? "snare" : "hihat", open: i === 2 })),
  beatsPerBar: 4,
  skipped: 1,
  firstNoteSeconds: 0.5,
});
const entry = (fingerprint: string, notes = 4, shift = 3): RememberedTab => ({ fingerprint, name: `Tab ${fingerprint}`, shift, tab: tab(notes) });

describe("saving and loading a song's tab", () => {
  it("brings back the notes, name and shift exactly", () => {
    const storage = memory();
    expect(saveTab(entry("a"), storage)).toBe("saved");
    expect(loadTab("a", storage)).toEqual(entry("a"));
    expect(loadTab("b", storage)).toBeNull();
  });

  it("replaces a song's old tab or shift, keeping one entry per song, newest first", () => {
    const storage = memory();
    saveTab(entry("a"), storage);
    saveTab(entry("b"), storage);
    saveTab(entry("a", 4, -2), storage);
    const saved = parseTabs(JSON.parse(storage.data.values().next().value ?? "[]"));
    expect(saved.map((t) => [t.fingerprint, t.shift])).toEqual([
      ["a", -2],
      ["b", 3],
    ]);
  });

  it("doesn't remember a tab over the note cap", () => {
    const storage = memory();
    expect(saveTab(entry("a", MAX_TAB_NOTES + 1), storage)).toBe("too-long");
    expect(loadTab("a", storage)).toBeNull();
  });
});

describe("when storage is full", () => {
  it("drops other songs' tabs, oldest first, to make room", () => {
    const storage = memory(storedSize(entry("x", 200)) * 2.5);
    saveTab(entry("old", 200), storage);
    saveTab(entry("mid", 200), storage);
    expect(saveTab(entry("new", 200), storage)).toBe("saved");
    expect(loadTab("new", storage)).not.toBeNull();
    expect(loadTab("mid", storage)).not.toBeNull();
    expect(loadTab("old", storage)).toBeNull();
  });

  it("gives up on a tab that doesn't fit even alone, leaving the others", () => {
    const storage = memory(storedSize(entry("x", 50)) * 1.5);
    saveTab(entry("small", 50), storage);
    expect(saveTab(entry("huge", 2000), storage)).toBe("full");
    expect(loadTab("huge", storage)).toBeNull();
    expect(loadTab("small", storage)).not.toBeNull();
  });
});

describe("forgetting", () => {
  it("forgets one song's tab (Remove tab, or Forget on the song)", () => {
    const storage = memory();
    saveTab(entry("a"), storage);
    saveTab(entry("b"), storage);
    forgetTab("a", storage);
    expect(loadTab("a", storage)).toBeNull();
    expect(loadTab("b", storage)).not.toBeNull();
  });

  it("keeps only the tabs of songs still remembered", () => {
    const storage = memory();
    for (const f of ["a", "b", "c"]) saveTab(entry(f), storage);
    keepTabsFor(["c", "a"], storage);
    expect([loadTab("a", storage), loadTab("b", storage), loadTab("c", storage)].map((t) => t?.fingerprint ?? null)).toEqual(["a", null, "c"]);
  });
});

const stored = (over: Record<string, unknown> = {}) => ({
  fingerprint: "a",
  name: "A",
  shift: 0,
  beatsPerBar: 4,
  skipped: 0,
  firstNoteSeconds: 0,
  notes: [[0, "kick", 0]],
  ...over,
});

describe("parseTabs", () => {
  it("drops a whole tab with any bad note, an unknown pad, or bad numbers", () => {
    expect(parseTabs([stored()])).toHaveLength(1);
    expect(parseTabs([stored({ notes: [[0, "kick", 0], [1, "cowbell", 0]] })])).toEqual([]);
    expect(parseTabs([stored({ notes: [[-1, "kick", 0]] })])).toEqual([]);
    expect(parseTabs([stored({ notes: [] })])).toEqual([]);
    expect(parseTabs([stored({ shift: 1.5 })])).toEqual([]);
    expect(parseTabs([stored({ beatsPerBar: 0 })])).toEqual([]);
    expect(parseTabs([stored({ fingerprint: "" })])).toEqual([]);
    expect(parseTabs("not a list")).toEqual([]);
  });
});

describe("a groove as a song's tab (EDU-89)", () => {
  it("keeps the groove's id, and older entries without one still load", () => {
    const storage = memory();
    saveTab({ ...entry("g"), groove: "rock-8ths" }, storage);
    saveTab(entry("m"), storage);
    expect(loadTab("g", storage)?.groove).toBe("rock-8ths");
    expect(loadTab("m", storage)?.groove).toBeUndefined();
  });
});

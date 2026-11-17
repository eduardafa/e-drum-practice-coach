import { describe, expect, it } from "vitest";
import { parseBeatsRequest } from "./beatsMessages";
import { MAX_REMEMBERED, parseGrid, parseLoop, parseSongs, remember, type RememberedSong } from "./songStore";

const grid = { beats: [0.5, 1, 1.5, 2], firstDownbeat: 1, bpm: 120 };
const song = (fingerprint: string, title = fingerprint): RememberedSong => ({
  fingerprint,
  title,
  duration: 180,
  lastOpened: "2026-11-13T19:00:00Z",
  grid,
});

describe("parseGrid", () => {
  it("keeps a valid grid", () => {
    expect(parseGrid(grid)).toEqual(grid);
  });

  it("drops grids with beats out of order, a bad downbeat or a silly tempo", () => {
    expect(parseGrid({ ...grid, beats: [1, 0.5] })).toBeNull();
    expect(parseGrid({ ...grid, beats: [0.5, Number.NaN] })).toBeNull();
    expect(parseGrid({ ...grid, firstDownbeat: 4 })).toBeNull();
    expect(parseGrid({ ...grid, bpm: 1000 })).toBeNull();
    expect(parseGrid("grid")).toBeNull();
  });
});

describe("parseSongs", () => {
  it("keeps valid songs and drops malformed ones", () => {
    const parsed = parseSongs([song("a"), { ...song("b"), lastOpened: "yesterday" }, { ...song("c"), grid: null }, 7]);
    expect(parsed.map((s) => s.fingerprint)).toEqual(["a"]);
    expect(parseSongs({ not: "a list" })).toEqual([]);
  });

  it("keeps the beats as found next to a corrected grid, dropping a malformed copy", () => {
    const corrected = { ...grid, firstDownbeat: 2 };
    expect(parseSongs([{ ...song("a"), grid: corrected, found: grid }])[0]).toMatchObject({ grid: corrected, found: grid });
    const [bad] = parseSongs([{ ...song("a"), found: { beats: "no" } }]);
    expect(bad.grid).toEqual(grid);
    expect(bad.found).toBeUndefined();
  });
});

describe("remember", () => {
  it("puts the song first, replacing its older entry", () => {
    const list = remember([song("a"), song("b")], song("b", "B again"));
    expect(list.map((s) => s.title)).toEqual(["B again", "a"]);
  });

  it("keeps at most a dozen songs, dropping the oldest", () => {
    let list: RememberedSong[] = [];
    for (let i = 0; i < MAX_REMEMBERED + 3; i++) list = remember(list, song(`s${i}`));
    expect(list).toHaveLength(MAX_REMEMBERED);
    expect(list[0].fingerprint).toBe(`s${MAX_REMEMBERED + 2}`);
  });
});

describe("parseBeatsRequest", () => {
  it("accepts samples and a sample rate, and nothing else", () => {
    const samples = new Float32Array(10);
    expect(parseBeatsRequest({ samples, sampleRate: 44100 })).toEqual({ samples, sampleRate: 44100 });
    expect(parseBeatsRequest({ samples: [0, 1], sampleRate: 44100 })).toBeNull();
    expect(parseBeatsRequest({ samples, sampleRate: 5 })).toBeNull();
    expect(parseBeatsRequest(null)).toBeNull();
  });
});

describe("a song's loop (EDU-121)", () => {
  it("is kept when it fits the song, and dropped on its own when it doesn't", () => {
    expect(parseSongs([{ ...song("a"), loop: { start: 10, end: 18 } }])[0]?.loop).toEqual({ start: 10, end: 18 });
    const bad = parseSongs([{ ...song("b"), loop: { start: 18, end: 10 } }]);
    expect(bad).toHaveLength(1);
    expect(bad[0]?.loop).toBeUndefined();
  });

  it("must lie within the song", () => {
    expect(parseLoop({ start: 0, end: 180 }, 180)).toEqual({ start: 0, end: 180 });
    expect(parseLoop({ start: 170, end: 190 }, 180)).toBeNull();
    expect(parseLoop({ start: -1, end: 5 }, 180)).toBeNull();
    expect(parseLoop("loop", 180)).toBeNull();
  });
});

describe("a song's hi-hat step (EDU-130)", () => {
  it("is kept when it's a sensible time between notes, and dropped on its own otherwise", () => {
    expect(parseSongs([{ ...song("a"), hihatStep: 0.25 }])[0]?.hihatStep).toBe(0.25);
    for (const bad of [0, -1, 5, Number.NaN, "0.25"]) {
      const parsed = parseSongs([{ ...song("b"), hihatStep: bad }]);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]?.hihatStep).toBeUndefined();
    }
  });
});

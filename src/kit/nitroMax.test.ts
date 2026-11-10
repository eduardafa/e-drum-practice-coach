import { describe, expect, it } from "vitest";
import { lookupNote, NITRO_MAX_NOTE_MAP, NITRO_MAX_PADS } from "./nitroMax";

describe("Nitro Max kit", () => {
  it("maps every note to a pad that is drawn", () => {
    const drawn = new Set(NITRO_MAX_PADS.map((p) => p.id));
    for (const m of Object.values(NITRO_MAX_NOTE_MAP)) expect(drawn.has(m.pad)).toBe(true);
  });

  it("looks up known and unknown notes", () => {
    expect(lookupNote(36)).toEqual({ pad: "kick", zone: "head" });
    expect(lookupNote(127)).toBeNull();
  });
});

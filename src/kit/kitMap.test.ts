import { describe, expect, it } from "vitest";
import { effectiveMap, KitMapping, MAPPING_TARGETS, parseKitMaps, targetLabel } from "./kitMap";
import { lookupNote, NITRO_MAX_NOTE_MAP } from "./nitroMax";

describe("MAPPING_TARGETS", () => {
  it("covers every pad, with the main zone of each required", () => {
    const required = new Set(MAPPING_TARGETS.filter((t) => !t.optional).map((t) => t.pad));
    expect(required).toEqual(new Set(["kick", "snare", "hihat", "hihatPedal", "tom1", "tom2", "tom3", "crash", "ride"]));
  });

  it("only uses zones the Nitro Max map knows, so scoring treats them the same", () => {
    const known = new Set(Object.values(NITRO_MAX_NOTE_MAP).map((m) => `${m.pad}/${m.zone}`));
    for (const t of MAPPING_TARGETS) expect(known.has(`${t.pad}/${t.zone}`), `${t.pad}/${t.zone}`).toBe(true);
  });
});

describe("effectiveMap", () => {
  it("is the Nitro Max map without a custom one", () => {
    expect(effectiveMap(undefined)).toBe(NITRO_MAX_NOTE_MAP);
  });

  it("lets recorded notes override the defaults and keeps the rest", () => {
    const map = effectiveMap({ 37: { pad: "tom1", zone: "head" } });
    expect(lookupNote(37, map)).toEqual({ pad: "tom1", zone: "head" }); // was snare cross-stick
    expect(lookupNote(38, map)).toEqual({ pad: "snare", zone: "head" });
  });
});

describe("parseKitMaps", () => {
  it("keeps valid maps per device and drops anything malformed", () => {
    const maps = parseKitMaps({
      "TD-07": { "38": { pad: "snare", zone: "head" }, "200": { pad: "kick", zone: "head" }, "40": { pad: "gong", zone: "x" } },
      Empty: { "12": "nope" },
      Bad: 4,
    });
    expect(maps).toEqual({ "TD-07": { 38: { pad: "snare", zone: "head" } } });
    expect(parseKitMaps("nope")).toEqual({});
  });
});

describe("KitMapping", () => {
  it("records a note per target in order, then is done", () => {
    const m = new KitMapping();
    expect(m.current?.pad).toBe("kick");
    MAPPING_TARGETS.forEach((t, i) => expect(m.capture(100 - i)).toEqual({ kind: "captured", target: t }));
    expect(m.done).toBe(true);
    expect(m.capture(5)).toEqual({ kind: "done" });
    expect(m.result()[100]).toEqual({ pad: "kick", zone: "head" });
  });

  it("refuses a note another pad already sends", () => {
    const m = new KitMapping();
    m.capture(36);
    expect(m.capture(36)).toEqual({ kind: "duplicate", existing: MAPPING_TARGETS[0] });
    expect(m.current?.pad).toBe("snare");
  });

  it("can skip a target, which keeps the default for it", () => {
    const m = new KitMapping();
    m.skip();
    m.capture(38);
    expect(m.result()).toEqual({ 38: { pad: "snare", zone: "head" } });
    expect(m.progress).toEqual({ at: 3, of: MAPPING_TARGETS.length });
  });
});

describe("targetLabel", () => {
  it("names extra zones", () => {
    expect(targetLabel({ pad: "snare", zone: "rim" }, "Snare")).toBe("Snare (rim)");
    expect(targetLabel({ pad: "snare", zone: "head" }, "Snare")).toBe("Snare");
  });
});

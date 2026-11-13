import { describe, expect, it } from "vitest";
import { CUE_FADE_MS, cueLeadMs, cuesAt } from "./cues";

const LEAD = 500;

describe("cuesAt", () => {
  it("shows nothing before the lead time or after the fade", () => {
    expect(cuesAt([{ time: 1000, pad: "snare" }], 1000 - LEAD - 1, LEAD)).toEqual([]);
    expect(cuesAt([{ time: 1000, pad: "snare" }], 1000 + CUE_FADE_MS + 1, LEAD)).toEqual([]);
  });

  it("grows from faint to full as the note approaches, then fades", () => {
    const at = (now: number) => cuesAt([{ time: 1000, pad: "snare" }], now, LEAD)[0]?.strength ?? 0;
    expect(at(1000 - LEAD)).toBeCloseTo(0.25);
    expect(at(1000 - LEAD / 2)).toBeCloseTo(0.625);
    expect(at(1000)).toBe(1);
    expect(at(1000 + CUE_FADE_MS / 2)).toBeCloseTo(0.5);
  });

  it("lights several pads at once, keeping the strongest cue per pad", () => {
    const cues = cuesAt(
      [
        { time: 1000, pad: "hihat" },
        { time: 1000, pad: "kick" },
        { time: 1250, pad: "hihat" },
      ],
      1000,
      LEAD,
    );
    expect(cues).toEqual([
      { pad: "hihat", strength: 1 },
      { pad: "kick", strength: 1 },
    ]);
  });
});

describe("cueLeadMs", () => {
  it("is one beat, within limits", () => {
    expect(cueLeadMs(750)).toBe(750);
    expect(cueLeadMs(200)).toBe(350);
    expect(cueLeadMs(1500)).toBe(1000);
  });
});

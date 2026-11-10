import { describe, expect, it } from "vitest";
import { pickDefaultDevice } from "./connection";

describe("pickDefaultDevice", () => {
  it("prefers the Alesis kit over other inputs", () => {
    expect(
      pickDefaultDevice([
        { id: "a", name: "Midi Through Port-0" },
        { id: "b", name: "Nitro Max MIDI 1" },
      ]),
    ).toBe("b");
  });

  it("falls back to the first device, or null", () => {
    expect(pickDefaultDevice([{ id: "a", name: "Keyboard" }])).toBe("a");
    expect(pickDefaultDevice([])).toBeNull();
  });
});

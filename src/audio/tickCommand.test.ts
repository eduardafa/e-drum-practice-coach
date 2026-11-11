import { describe, expect, it } from "vitest";
import { parseTickCommand } from "./tickCommand";

describe("parseTickCommand", () => {
  it("accepts start with a valid interval", () => {
    expect(parseTickCommand({ cmd: "start", intervalMs: 25 })).toEqual({ cmd: "start", intervalMs: 25 });
  });

  it("accepts stop and drops extra fields", () => {
    expect(parseTickCommand({ cmd: "stop", intervalMs: 25 })).toEqual({ cmd: "stop" });
  });

  it.each([
    ["a missing interval", { cmd: "start" }],
    ["a string interval", { cmd: "start", intervalMs: "25" }],
    ["a negative interval", { cmd: "start", intervalMs: -5 }],
    ["a zero interval", { cmd: "start", intervalMs: 0 }],
    ["an interval that is too long", { cmd: "start", intervalMs: 60_000 }],
    ["NaN", { cmd: "start", intervalMs: Number.NaN }],
    ["Infinity", { cmd: "start", intervalMs: Number.POSITIVE_INFINITY }],
    ["an unknown command", { cmd: "explode" }],
    ["a string", "tick"],
    ["null", null],
    ["an array", ["start", 25]],
  ])("rejects %s", (_, data) => {
    expect(parseTickCommand(data)).toBeNull();
  });
});

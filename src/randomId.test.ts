import { describe, expect, it } from "vitest";
import { randomId } from "./randomId";

describe("randomId", () => {
  it("is a version 4 UUID", () => {
    expect(randomId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("differs every time", () => {
    const ids = new Set(Array.from({ length: 1000 }, randomId));
    expect(ids.size).toBe(1000);
  });
});

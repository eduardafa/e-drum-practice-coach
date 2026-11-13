import { describe, expect, it } from "vitest";
import { HihatPedal } from "./hihatPedal";

describe("HihatPedal", () => {
  it("knows nothing until the kit sends a position", () => {
    const pedal = new HihatPedal();
    expect(pedal.pressed()).toBeNull();
    expect(pedal.state()).toBeNull();
    pedal.learn(false);
    expect(pedal.inverted).toBe(false);
  });

  it("reads high values as pressed by default", () => {
    const pedal = new HihatPedal();
    pedal.observe(127);
    expect(pedal.pressed()).toBe(1);
    expect(pedal.state()).toBe("closed");
    pedal.observe(64);
    expect(pedal.state()).toBe("half");
    pedal.observe(0);
    expect(pedal.state()).toBe("open");
  });

  it("learns from closed and open hits when this kit uses low values for pressed", () => {
    const pedal = new HihatPedal();
    for (let i = 0; i < 3; i++) {
      pedal.observe(5);
      pedal.learn(false); // closed hits with the pedal at 5
      pedal.observe(120);
      pedal.learn(true); // open hits with the pedal at 120
    }
    expect(pedal.inverted).toBe(true);
    pedal.observe(5);
    expect(pedal.state()).toBe("closed");
  });

  it("keeps the default when the hits agree with it, or there are too few", () => {
    const agrees = new HihatPedal();
    for (let i = 0; i < 3; i++) {
      agrees.observe(125);
      agrees.learn(false);
      agrees.observe(10);
      agrees.learn(true);
    }
    expect(agrees.inverted).toBe(false);

    const few = new HihatPedal();
    few.observe(5);
    few.learn(false);
    few.observe(120);
    few.learn(true);
    expect(few.inverted).toBe(false);
  });

  it("clamps out-of-range values", () => {
    const pedal = new HihatPedal();
    pedal.observe(200);
    expect(pedal.pressed()).toBe(1);
  });
});

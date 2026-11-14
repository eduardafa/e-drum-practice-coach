import { afterEach, describe, expect, it, vi } from "vitest";
import { MidiConnection, pickDefaultDevice } from "./connection";

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

const permissions = (state: PermissionState | "throws") => ({
  query: () => (state === "throws" ? Promise.reject(new TypeError("unknown permission")) : Promise.resolve({ state } as PermissionStatus)),
});

describe("MidiConnection.reconnectIfAllowed", () => {
  const input = { id: "kit", name: "Nitro Max MIDI 1", state: "connected", addEventListener: () => {}, removeEventListener: () => {}, open: () => Promise.resolve() };
  const access = { inputs: new Map([["kit", input]]), addEventListener: () => {}, removeEventListener: () => {} };

  afterEach(() => vi.unstubAllGlobals());

  function stubMidi() {
    const requestMIDIAccess = vi.fn<() => Promise<typeof access>>(() => Promise.resolve(access));
    vi.stubGlobal("navigator", { requestMIDIAccess });
    return requestMIDIAccess;
  }

  it("connects and picks the kit when MIDI is already allowed", async () => {
    const request = stubMidi();
    const midi = new MidiConnection();
    expect(await midi.reconnectIfAllowed(permissions("granted"))).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    expect(midi.getStatus()).toMatchObject({ state: "ready", selectedId: "kit" });
  });

  it("never asks: without the permission it leaves it to the button", async () => {
    const request = stubMidi();
    const results = await Promise.all(
      (["prompt", "denied", "throws"] as const).map((state) => new MidiConnection().reconnectIfAllowed(permissions(state))),
    );
    expect(results).toEqual([false, false, false]);
    expect(await new MidiConnection().reconnectIfAllowed(undefined)).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("stays quiet when an allowed reconnect fails anyway: the button is back, not an error", async () => {
    vi.stubGlobal("navigator", { requestMIDIAccess: () => Promise.reject(new Error("no MIDI here")) });
    const midi = new MidiConnection();
    expect(await midi.reconnectIfAllowed(permissions("granted"))).toBe(false);
    expect(midi.getStatus()).toEqual({ state: "idle" });
  });

  it("asks the browser once when a reconnect and a click overlap", async () => {
    const request = stubMidi();
    const midi = new MidiConnection();
    await Promise.all([midi.reconnectIfAllowed(permissions("granted")), midi.connect()]);
    expect(request).toHaveBeenCalledOnce();
  });
});

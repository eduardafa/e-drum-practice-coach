/**
 * Web MIDI connection: permission, device list, hot-plug and hit delivery.
 */
import { parseMidiMessage, type MidiEvent } from "./messages";

export interface MidiDevice {
  id: string;
  name: string;
}

export interface TimedMidiEvent {
  event: MidiEvent;
  /** When the message arrived, in performance.now() milliseconds. */
  time: number;
}

export type MidiStatus =
  | { state: "unsupported" }
  | { state: "idle" }
  | { state: "requesting" }
  | { state: "denied"; message: string }
  | { state: "ready"; devices: MidiDevice[]; selectedId: string | null };

/** Name fragments that identify the kit's USB MIDI port. */
const PREFERRED_DEVICE = /nitro|alesis/i;

export function isWebMidiSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";
}

export function pickDefaultDevice(devices: MidiDevice[]): string | null {
  return (devices.find((d) => PREFERRED_DEVICE.test(d.name)) ?? devices[0])?.id ?? null;
}

/** The part of the Permissions API used to check for MIDI access (a stand-in in tests). */
interface PermissionQuery {
  query(descriptor: PermissionDescriptor): Promise<{ state: PermissionState }>;
}

export class MidiConnection {
  private access: MIDIAccess | null = null;
  private selected: MIDIInput | null = null;
  private status: MidiStatus = isWebMidiSupported() ? { state: "idle" } : { state: "unsupported" };
  private statusListeners = new Set<(s: MidiStatus) => void>();
  private eventListeners = new Set<(e: TimedMidiEvent) => void>();
  private readonly handleStateChange = () => this.refresh();
  private readonly handleMidiMessage = (msg: MIDIMessageEvent) => this.handleMessage(msg);

  getStatus(): MidiStatus {
    return this.status;
  }

  onStatus(listener: (s: MidiStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Delivered synchronously from the MIDI callback: keep listeners cheap. */
  onEvent(listener: (e: TimedMidiEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  async connect(): Promise<void> {
    await this.requestAccess(false);
  }

  /** Asks for MIDI access. `quiet`: a failure goes back to idle (Connect kit) instead of showing "denied". */
  private async requestAccess(quiet: boolean): Promise<void> {
    // Already connected, or a request is on its way (a reconnect on load and a click can overlap).
    if (!isWebMidiSupported() || this.access || this.status.state === "requesting") return;
    this.setStatus({ state: "requesting" });
    try {
      // sysex: false keeps the permission prompt minimal; drum hits don't need it.
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (err) {
      this.setStatus(quiet ? { state: "idle" } : { state: "denied", message: err instanceof Error ? err.message : String(err) });
      return;
    }
    this.access.addEventListener("statechange", this.handleStateChange);
    this.refresh(true);
  }

  /**
   * Connects on page load when the browser already allows MIDI for this site,
   * so a reload doesn't leave the kit disconnected until Connect kit is
   * pressed again. Never prompts: without the permission (the first visit, or
   * a browser that can't tell) it does nothing and the button asks. If the
   * attempt fails anyway, it stays quiet and the button is there as before.
   * Resolves with whether it connected.
   */
  async reconnectIfAllowed(
    permissions: PermissionQuery | undefined = typeof navigator === "undefined" ? undefined : navigator.permissions,
  ): Promise<boolean> {
    if (!isWebMidiSupported() || this.access || !permissions) return false;
    try {
      const permission = await permissions.query({ name: "midi" });
      if (permission.state !== "granted") return false;
    } catch {
      return false;
    }
    await this.requestAccess(true);
    return this.access !== null;
  }

  select(id: string | null): void {
    if (this.selected) this.selected.removeEventListener("midimessage", this.handleMidiMessage);
    this.selected = null;
    if (this.access && id) {
      const input = this.access.inputs.get(id);
      if (input) {
        input.addEventListener("midimessage", this.handleMidiMessage);
        // Only the onmidimessage setter opens the port implicitly, so open it explicitly.
        input.open().catch((err: unknown) => console.error("Could not open MIDI input", err));
        this.selected = input;
      }
    }
    if (this.status.state === "ready") {
      this.setStatus({ ...this.status, selectedId: this.selected?.id ?? null });
    }
  }

  dispose(): void {
    this.select(null);
    this.access?.removeEventListener("statechange", this.handleStateChange);
    this.access = null;
    this.statusListeners.clear();
    this.eventListeners.clear();
  }

  private refresh(initial = false): void {
    if (!this.access) return;
    const devices: MidiDevice[] = [];
    this.access.inputs.forEach((input) => {
      if (input.state === "connected") devices.push({ id: input.id, name: input.name ?? input.id });
    });

    const currentId = this.selected?.id ?? null;
    const stillThere = currentId !== null && devices.some((d) => d.id === currentId);
    this.setStatus({ state: "ready", devices, selectedId: stillThere ? currentId : null });

    // Auto-select on first connect, and re-select when the kit is plugged back in.
    if (initial || !stillThere) this.select(stillThere ? currentId : pickDefaultDevice(devices));
  }

  private handleMessage(msg: MIDIMessageEvent): void {
    if (!msg.data) return;
    const event = parseMidiMessage(msg.data);
    if (!event) return;
    // msg.timeStamp is in the performance.now() clock: when the browser
    // received the message, which is earlier and more stable than calling
    // performance.now() here.
    const timed = { event, time: msg.timeStamp };
    for (const l of this.eventListeners) l(timed);
  }

  private setStatus(status: MidiStatus): void {
    this.status = status;
    for (const l of this.statusListeners) l(status);
  }
}

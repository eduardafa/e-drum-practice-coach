/**
 * Mapping any e-drum kit: which MIDI note each pad (and zone) sends. The
 * Nitro Max's factory map (General MIDI) is the default; a drummer whose kit
 * differs hits each pad once, and the notes recorded override the defaults
 * for that kit (saved per MIDI device name). Pure, so the rules are tested.
 */
import { NITRO_MAX_NOTE_MAP, type NoteMapping, type PadId } from "./nitroMax";

export type KitMap = Readonly<Record<number, NoteMapping>>;

export interface MappingTarget {
  pad: PadId;
  zone: string;
  /** What to do, for a beginner. */
  prompt: string;
  /** Rims, edges and the bell: worth mapping, fine to skip. */
  optional: boolean;
}

/** In playing order: the main pads first within each, then their extra zones. */
export const MAPPING_TARGETS: readonly MappingTarget[] = [
  { pad: "kick", zone: "head", prompt: "Press the kick pedal.", optional: false },
  { pad: "snare", zone: "head", prompt: "Hit the middle of the snare.", optional: false },
  { pad: "snare", zone: "rim", prompt: "Hit the snare's rim: stick on the edge and the head together.", optional: true },
  { pad: "hihat", zone: "closed", prompt: "Keep the hi-hat pedal pressed down and hit the hi-hat.", optional: false },
  { pad: "hihat", zone: "open", prompt: "Lift your foot off the hi-hat pedal and hit the hi-hat.", optional: false },
  { pad: "hihatPedal", zone: "pedal", prompt: "Press the hi-hat pedal down without hitting anything.", optional: false },
  { pad: "tom1", zone: "head", prompt: "Hit tom 1 (the small tom, top left).", optional: false },
  { pad: "tom2", zone: "head", prompt: "Hit tom 2 (top right).", optional: false },
  { pad: "tom3", zone: "head", prompt: "Hit tom 3 (the floor tom).", optional: false },
  { pad: "crash", zone: "bow", prompt: "Hit the crash cymbal.", optional: false },
  { pad: "crash", zone: "edge", prompt: "Hit the crash on its very edge.", optional: true },
  { pad: "ride", zone: "bow", prompt: "Hit the ride cymbal, between the middle and the edge.", optional: false },
  { pad: "ride", zone: "bell", prompt: "Hit the ride's bell, the raised middle.", optional: true },
];

/** The map in use: a kit's recorded notes over the Nitro Max defaults (recorded notes win). */
export function effectiveMap(custom: KitMap | undefined): KitMap {
  return custom ? { ...NITRO_MAX_NOTE_MAP, ...custom } : NITRO_MAX_NOTE_MAP;
}

function isPadId(value: unknown): value is PadId {
  return MAPPING_TARGETS.some((t) => t.pad === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseKitMap(value: unknown): KitMap | undefined {
  if (!isRecord(value)) return undefined;
  const map: Record<number, NoteMapping> = {};
  for (const [key, entry] of Object.entries(value)) {
    const note = Number(key);
    if (!Number.isInteger(note) || note < 0 || note > 127 || !isRecord(entry)) continue;
    const { pad, zone } = entry;
    if (isPadId(pad) && typeof zone === "string" && zone.length <= 30) {
      map[note] = { pad, zone };
    }
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

/** Saved maps by device name; anything malformed is dropped. */
export function parseKitMaps(raw: unknown): Record<string, KitMap> {
  if (!isRecord(raw)) return {};
  const maps: Record<string, KitMap> = {};
  for (const [device, value] of Object.entries(raw)) {
    const map = parseKitMap(value);
    if (map && device.length <= 200) maps[device] = map;
  }
  return maps;
}

export type CaptureResult =
  | { kind: "captured"; target: MappingTarget }
  /** Another target already has this note: two pads can't share a note. */
  | { kind: "duplicate"; existing: MappingTarget }
  | { kind: "done" };

/** One mapping run: steps through the targets, recording the note sent for each. */
export class KitMapping {
  private index = 0;
  private readonly notes = new Map<number, MappingTarget>();

  get current(): MappingTarget | null {
    return MAPPING_TARGETS[this.index] ?? null;
  }

  /** Position from 1, and the total, for "3 of 13". */
  get progress(): { at: number; of: number } {
    return { at: Math.min(this.index + 1, MAPPING_TARGETS.length), of: MAPPING_TARGETS.length };
  }

  get done(): boolean {
    return this.current === null;
  }

  capture(note: number): CaptureResult {
    const target = this.current;
    if (!target) return { kind: "done" };
    const existing = this.notes.get(note);
    if (existing) return { kind: "duplicate", existing };
    this.notes.set(note, target);
    this.index++;
    return { kind: "captured", target };
  }

  skip(): void {
    if (!this.done) this.index++;
  }

  /** The notes recorded so far, as a map. */
  result(): KitMap {
    const map: Record<number, NoteMapping> = {};
    for (const [note, t] of this.notes) map[note] = { pad: t.pad, zone: t.zone };
    return map;
  }
}

/** A label for a target, like "snare (rim)". */
export function targetLabel(t: Pick<MappingTarget, "pad" | "zone">, padLabel: string): string {
  return t.zone === "head" || t.zone === "bow" || t.zone === "pedal" ? padLabel : `${padLabel} (${t.zone})`;
}

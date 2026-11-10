/**
 * Alesis Nitro Max: MIDI note map and on-screen layout.
 *
 * The note numbers are the module's factory defaults, which follow
 * General MIDI percussion. They can be changed on the module, so the map is
 * data rather than logic.
 */

export type PadId =
  | "kick"
  | "snare"
  | "hihat"
  | "hihatPedal"
  | "tom1"
  | "tom2"
  | "tom3"
  | "crash"
  | "ride";

export interface PadInfo {
  id: PadId;
  label: string;
  /** Centre and radius in normalized kit coordinates (0..1 on both axes; y grows down). */
  x: number;
  y: number;
  r: number;
  /** Cymbals are drawn as metallic discs, drums as mesh heads. */
  shape: "drum" | "cymbal" | "pedal";
}

export interface NoteMapping {
  pad: PadId;
  /** Which part of the pad was struck, for display only. */
  zone: string;
}

export const NITRO_MAX_NOTE_MAP: Readonly<Record<number, NoteMapping>> = {
  36: { pad: "kick", zone: "head" },
  38: { pad: "snare", zone: "head" },
  40: { pad: "snare", zone: "rim" },
  37: { pad: "snare", zone: "cross-stick" },
  48: { pad: "tom1", zone: "head" },
  50: { pad: "tom1", zone: "rim" },
  45: { pad: "tom2", zone: "head" },
  47: { pad: "tom2", zone: "rim" },
  43: { pad: "tom3", zone: "head" },
  58: { pad: "tom3", zone: "rim" },
  46: { pad: "hihat", zone: "open" },
  26: { pad: "hihat", zone: "open edge" },
  42: { pad: "hihat", zone: "closed" },
  22: { pad: "hihat", zone: "closed edge" },
  44: { pad: "hihatPedal", zone: "pedal" },
  49: { pad: "crash", zone: "bow" },
  55: { pad: "crash", zone: "edge" },
  51: { pad: "ride", zone: "bow" },
  59: { pad: "ride", zone: "edge" },
  53: { pad: "ride", zone: "bell" },
};

/** Layout as seen from the drummer's throne, right-handed setup. */
export const NITRO_MAX_PADS: readonly PadInfo[] = [
  { id: "crash", label: "Crash", x: 0.22, y: 0.18, r: 0.11, shape: "cymbal" },
  { id: "ride", label: "Ride", x: 0.8, y: 0.22, r: 0.12, shape: "cymbal" },
  { id: "hihat", label: "Hi-hat", x: 0.12, y: 0.45, r: 0.095, shape: "cymbal" },
  { id: "tom1", label: "Tom 1", x: 0.4, y: 0.3, r: 0.075, shape: "drum" },
  { id: "tom2", label: "Tom 2", x: 0.58, y: 0.3, r: 0.075, shape: "drum" },
  { id: "tom3", label: "Tom 3", x: 0.72, y: 0.55, r: 0.085, shape: "drum" },
  { id: "snare", label: "Snare", x: 0.32, y: 0.58, r: 0.09, shape: "drum" },
  { id: "kick", label: "Kick", x: 0.5, y: 0.72, r: 0.12, shape: "drum" },
  { id: "hihatPedal", label: "HH pedal", x: 0.17, y: 0.86, r: 0.055, shape: "pedal" },
];

export function lookupNote(
  note: number,
  map: Readonly<Record<number, NoteMapping>> = NITRO_MAX_NOTE_MAP,
): NoteMapping | null {
  return map[note] ?? null;
}

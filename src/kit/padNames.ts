import type { PadId } from "./nitroMax";

/** Each drum's name as said mid-sentence, e.g. "your kick lands after the hi-hat". */
export const PAD_SAID: Readonly<Record<PadId, string>> = {
  crash: "crash",
  ride: "ride",
  hihat: "hi-hat",
  tom1: "tom 1",
  tom2: "tom 2",
  tom3: "tom 3",
  snare: "snare",
  kick: "kick",
  hihatPedal: "hi-hat pedal",
};

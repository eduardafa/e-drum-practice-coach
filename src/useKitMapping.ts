/**
 * "Map your kit" state: the recorded maps by MIDI device name, the connected
 * kit's name and map (kept in the coach), and the mapping run.
 */
import { useEffect, useState } from "react";
import { coach } from "./appState";
import { effectiveMap, type KitMap, type KitMapping } from "./kit/kitMap";
import { loadKitMaps, saveKitMaps } from "./kit/kitMapStore";
import type { MidiStatus } from "./midi/connection";

/** `beforeStart` lets App close its panels before the mapping panel opens. */
export function useKitMapping(midi: MidiStatus, beforeStart: () => void) {
  const [kitMaps, setKitMaps] = useState<Record<string, KitMap>>(loadKitMaps);
  const [mapping, setMapping] = useState(false);
  const kitName =
    midi.state === "ready" && midi.selectedId ? (midi.devices.find((d) => d.id === midi.selectedId)?.name ?? null) : null;
  const kitMap = kitName === null ? undefined : kitMaps[kitName];

  // The connected kit's recorded map, over the standard one.
  useEffect(() => {
    coach.noteMap = effectiveMap(kitMap);
  }, [kitMap]);

  const store = (next: Record<string, KitMap>) => {
    setKitMaps(next);
    saveKitMaps(next);
  };

  const start = () => {
    beforeStart();
    coach.startMapping();
    setMapping(true);
  };

  const end = () => {
    coach.endMapping();
    setMapping(false);
  };

  const save = (run: KitMapping) => {
    if (kitName === null) return;
    store({ ...kitMaps, [kitName]: run.result() });
    end();
  };

  const reset = () => {
    if (kitName === null) return;
    const { [kitName]: _removed, ...rest } = kitMaps;
    store(rest);
  };

  return { kitName, kitMapNotes: kitMap ? Object.keys(kitMap).length : 0, mapping, start, end, save, reset };
}

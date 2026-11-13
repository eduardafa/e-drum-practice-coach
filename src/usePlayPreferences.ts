/**
 * The play preferences from Settings: click volume, kit setup (handedness),
 * the next-pad rings, the guide track and the small metronome. Keeps the coach in
 * step with them, gives the kit renderer the getters it reads every frame,
 * and the part of the saved settings they own.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { coach, saved } from "./appState";
import { DEFAULT_HANDEDNESS, type Handedness } from "./handedness";
import type { RendererOptions } from "./render/kitRenderer";
import type { SavedSettings } from "./settings";

export type SavedPreferences = Pick<SavedSettings, "volume" | "handedness" | "showNextPad" | "guideTrack" | "showMetronome">;

export function usePlayPreferences() {
  const [volume, setVolume] = useState(saved.volume ?? coach.metronome.volume);
  const [handedness, setHandedness] = useState<Handedness>(saved.handedness ?? DEFAULT_HANDEDNESS);
  const [showNextPad, setShowNextPad] = useState(saved.showNextPad ?? true);
  const [guideTrack, setGuideTrack] = useState(saved.guideTrack === true);
  const [showMetronome, setShowMetronome] = useState(saved.showMetronome ?? true);
  /** The small metronome while it's shown, so the kit view can leave room for it. */
  const metronomeRef = useRef<HTMLDivElement>(null);

  // The kit renderer runs outside React and reads these every frame.
  const handednessRef = useRef(handedness);
  const showNextPadRef = useRef(showNextPad);
  useEffect(() => {
    handednessRef.current = handedness;
    showNextPadRef.current = showNextPad;
  }, [handedness, showNextPad]);
  const [renderer] = useState<Pick<RendererOptions, "getHandedness" | "getCues" | "getTopInset">>(() => ({
    getHandedness: () => handednessRef.current,
    getCues: (now) => (showNextPadRef.current ? coach.cuesAt(now) : []),
    getTopInset: () => (metronomeRef.current ? metronomeRef.current.offsetHeight + 16 : 0),
  }));

  useEffect(() => {
    coach.metronome.volume = volume;
  }, [volume]);

  useEffect(() => {
    coach.guideEnabled = guideTrack;
  }, [guideTrack]);

  const toSave = useMemo<SavedPreferences>(
    () => ({ volume, handedness, showNextPad, guideTrack: guideTrack || undefined, showMetronome }),
    [volume, handedness, showNextPad, guideTrack, showMetronome],
  );

  return {
    volume,
    setVolume,
    handedness,
    setHandedness,
    showNextPad,
    setShowNextPad,
    guideTrack,
    setGuideTrack,
    showMetronome,
    setShowMetronome,
    metronomeRef,
    renderer,
    toSave,
  };
}

import { useState } from "react";
import { Segmented } from "./Segmented";
import { THEME_CHOICES, applyTheme, savedTheme, type ThemeChoice } from "./theme";

/** System / Light / Dark, in Settings. */
export function ThemeSetting() {
  const [choice, setChoice] = useState<ThemeChoice>(savedTheme);
  const choose = (next: ThemeChoice) => {
    setChoice(next);
    applyTheme(next);
  };
  return (
    <>
      <Segmented options={THEME_CHOICES} value={choice} onChange={choose} label="Theme" name="theme" />
      <p className="hint">System follows your device's light or dark setting. Saved in this browser.</p>
    </>
  );
}

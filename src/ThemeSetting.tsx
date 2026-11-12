import { useState } from "react";
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
      <fieldset className="library-filters theme-choice">
        <legend className="visually-hidden">Theme</legend>
        {THEME_CHOICES.map((t) => (
          <button
            key={t.id}
            className={`secondary ${choice === t.id ? "selected" : ""}`}
            aria-pressed={choice === t.id}
            onClick={() => choose(t.id)}
          >
            {t.label}
          </button>
        ))}
      </fieldset>
      <p className="hint">System follows your device's light or dark setting. Saved in this browser.</p>
    </>
  );
}

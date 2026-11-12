/**
 * Light and dark themes. The colors themselves are CSS tokens written with
 * light-dark() in App.css, so the browser picks the right value from
 * `color-scheme`: the device's setting by default, or the drummer's choice,
 * set as data-theme on <html>. public/theme.js applies a saved choice before
 * the first paint.
 */

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_CHOICES: readonly { id: ThemeChoice; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

/** Same key as public/theme.js. */
const KEY = "edrum-coach:theme";

export function savedTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/** Shows and remembers the choice (in this browser only). */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

/** Calls back whenever the colors on screen may change: a new choice, or the device switching. */
export function onThemeChange(callback: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", callback);
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    media.removeEventListener("change", callback);
    observer.disconnect();
  };
}

/**
 * Resolves CSS color tokens (e.g. "--early") to concrete colors, for code
 * that paints with them, such as the kit view's canvas. A custom property
 * reads back as its source text (a light-dark() expression), so each token is
 * applied to a hidden element and its computed color read instead.
 */
export function withColorProbe<T>(read: (token: (name: string) => string) => T): T {
  const probe = document.createElement("span");
  probe.hidden = true;
  document.body.append(probe);
  const style = getComputedStyle(probe);
  try {
    return read((name) => {
      probe.style.color = `var(${name})`;
      return style.color;
    });
  } finally {
    probe.remove();
  }
}

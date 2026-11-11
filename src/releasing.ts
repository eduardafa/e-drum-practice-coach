import type { MouseEvent } from "react";

/**
 * Buttons give up focus after a click: Space is the kick key, and a focused
 * button would otherwise be pressed again by every kick.
 */
export function releasing(action: () => void) {
  return (e: MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    action();
  };
}

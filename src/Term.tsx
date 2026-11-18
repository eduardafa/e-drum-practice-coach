import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { define, type GlossaryWord } from "./glossary";

interface Props {
  /** The glossary word to explain. */
  word: GlossaryWord;
  /** The text shown, when it differs from the word ("Grooves", "Latency offset"). */
  children?: ReactNode;
}

/**
 * A drumming word with its one-line definition from the glossary (EDU-143).
 * The word is a small button with a dotted underline: focusing, hovering or
 * tapping it shows the definition just below, and Esc or moving away hides it.
 * Screen readers hear the definition as the button's description.
 */
export function Term({ word, children }: Props) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [tapped, setTapped] = useState(false);
  // Esc hides it until the next focus, hover or tap.
  const [dismissed, setDismissed] = useState(false);
  const open = (focused || hovered || tapped) && !dismissed;
  const definitionRef = useRef<HTMLSpanElement>(null);

  // Keep the definition on screen: a word near the right edge (BPM by the tempo) shifts it left.
  useLayoutEffect(() => {
    const box = definitionRef.current;
    if (!open || !box) return;
    box.style.translate = "";
    const { left, right } = box.getBoundingClientRect();
    const margin = 8;
    const overRight = right - (document.documentElement.clientWidth - margin);
    const shift = overRight > 0 ? -Math.min(overRight, left - margin) : 0;
    box.style.translate = shift === 0 ? "" : `${shift}px 0`;
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape" && open) {
      // Only the definition closes, not the panel around it.
      e.stopPropagation();
      setDismissed(true);
      setTapped(false);
    } else if (e.key === "Enter" || e.key === " ") {
      // Shows the definition; doesn't reach the drum keys (Space is the kick).
      e.stopPropagation();
    }
  };

  return (
    <span className="term">
      <button
        type="button"
        className="term-word"
        aria-describedby={id}
        onFocus={() => {
          setFocused(true);
          setDismissed(false);
        }}
        onBlur={() => {
          setFocused(false);
          setTapped(false);
        }}
        onMouseEnter={() => {
          setHovered(true);
          setDismissed(false);
        }}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          setTapped(true);
          setDismissed(false);
        }}
        onKeyDown={onKeyDown}
      >
        {children ?? word}
      </button>
      <span ref={definitionRef} id={id} role="tooltip" className="term-definition" hidden={!open}>
        {define(word)}
      </span>
    </span>
  );
}

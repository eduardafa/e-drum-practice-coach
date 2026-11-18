import { useEffect, useMemo, useRef, useState } from "react";
import { saved } from "./appState";
import { beforeYouPlayChecks, shouldOfferBeforeYouPlay } from "./guide/beforeYouPlay";
import { useHandedness } from "./HandednessContext";
import type { SavedSettings } from "./settings";

/**
 * Whether the "Before you play" card is open, and whether it has been
 * dismissed once (saved, so it opens on its own only the first time). It opens
 * when a First steps exercise is chosen, or is already chosen on load, and
 * again whenever the metronome guide's button asks for it.
 */
export function useBeforeYouPlay() {
  const [seen, setSeen] = useState(saved.beforeYouPlaySeen === true);
  const [open, setOpen] = useState(() => shouldOfferBeforeYouPlay(saved.exerciseId, seen));

  const toSave = useMemo<Pick<SavedSettings, "beforeYouPlaySeen">>(() => ({ beforeYouPlaySeen: seen || undefined }), [seen]);

  return {
    open,
    /** After choosing an exercise: opens the card if it's the drummer's first First steps exercise. */
    offerFor: (exerciseId: string | null) => {
      if (shouldOfferBeforeYouPlay(exerciseId, seen)) setOpen(true);
    },
    reopen: () => setOpen(true),
    /** "Got it", Esc or a press outside: dismissed for good. */
    close: () => {
      setOpen(false);
      setSeen(true);
    },
    toSave,
  };
}

/**
 * The setup checks a beginner should make before the first hit, which the app
 * can't measure. A modal <dialog>: focus starts on "Got it" and stays inside;
 * Esc, the backdrop and "Got it" all close it natively, then focus goes back
 * to the button that opened it, if it's still there.
 */
export function BeforeYouPlayDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const handedness = useHandedness();
  const checks = beforeYouPlayChecks(handedness);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Light dismiss: a press on the backdrop closes it, like Esc (closedby isn't in React's types yet).
    dialog.setAttribute("closedby", "any");
    if (!dialog.open) dialog.showModal();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="before-you-play"
      aria-labelledby="before-you-play-title"
      aria-describedby="before-you-play-intro"
      // Esc, a backdrop press and "Got it" all end up here.
      onClose={onClose}
    >
      <h2 id="before-you-play-title">Before you play</h2>
      <p id="before-you-play-intro" className="hint">
        The app can't see how you sit or hold the sticks, so check these first.
      </p>
      <ul className="before-you-play-checks">
        {checks.map((check) => (
          <li key={check.id}>
            <strong>{check.title}.</strong> {check.text}
          </li>
        ))}
      </ul>
      <div className="before-you-play-actions">
        {/* Focused when the dialog opens (the first focusable element), so Enter or Space dismisses it. */}
        <button className="primary" onClick={() => ref.current?.close()}>
          Got it
        </button>
      </div>
      <p className="hint">You can open this again from "How to play with the metronome".</p>
    </dialog>
  );
}

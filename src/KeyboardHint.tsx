/** The keyboard fallback's keys, for trying the app without a kit. */
export function KeyboardHint() {
  return (
    <p className="hint keys">
      No kit? Use the keyboard: <kbd>Space</kbd> kick, <kbd>S</kbd> snare, <kbd>A</kbd> hi-hat, <kbd>Q</kbd>{" "}
      crash, <kbd>W</kbd>/<kbd>E</kbd>/<kbd>D</kbd> toms, <kbd>R</kbd> ride.
    </p>
  );
}

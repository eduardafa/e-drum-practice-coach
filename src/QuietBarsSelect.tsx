import { QUIET_EVERY_OPTIONS, quietEveryLabel, type QuietEvery } from "./playalong/quietBars";

interface Props {
  value: QuietEvery;
  onChange: (every: QuietEvery) => void;
}

/**
 * Keeping time on your own (EDU-145): the click on every bar, or quiet for one
 * bar in four (or two) during a play-along. Sits next to the session length.
 */
export function QuietBarsSelect({ value, onChange }: Props) {
  return (
    <select
      aria-label="Quiet bars"
      title="Keep time on your own: the click goes quiet for one bar. Keep playing, it comes back on the next bar."
      value={value}
      onChange={(e) => {
        e.currentTarget.blur();
        const every = QUIET_EVERY_OPTIONS.find((n) => n === Number(e.target.value));
        if (every !== undefined) onChange(every);
      }}
    >
      {QUIET_EVERY_OPTIONS.map((n) => (
        <option key={n} value={n}>
          {quietEveryLabel(n)}
        </option>
      ))}
    </select>
  );
}

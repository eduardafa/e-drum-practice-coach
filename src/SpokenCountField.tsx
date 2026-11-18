import { isSpokenCountSetting, type SpokenCountSetting } from "./audio/spokenCount";

interface Props {
  spokenCount: SpokenCountSetting;
  onSpokenCountChange: (setting: SpokenCountSetting) => void;
  countWithClick: boolean;
  onCountWithClickChange: (on: boolean) => void;
}

/**
 * The metronome's spoken count in Settings: when it counts out loud ("one
 * and two and", like a teacher), and whether the click keeps playing too.
 */
export function SpokenCountField({ spokenCount, onSpokenCountChange, countWithClick, onCountWithClickChange }: Props) {
  return (
    <>
      <label className="field">
        <span>Count out loud</span>
        <select
          value={spokenCount}
          onChange={(e) => {
            if (isSpokenCountSetting(e.target.value)) onSpokenCountChange(e.target.value);
          }}
        >
          <option value="firstSteps">In First steps</option>
          <option value="always">Always</option>
          <option value="never">Never</option>
        </select>
      </label>
      <label className="field checkbox">
        <input
          type="checkbox"
          checked={countWithClick}
          disabled={spokenCount === "never"}
          onChange={(e) => onCountWithClickChange(e.target.checked)}
        />
        <span>Keep the click while counting</span>
      </label>
      <p className="hint">
        A voice counts the beats, "one, two, three, four", and the "and" between them, so you always know where you
        are in the bar. In between counts are left out when the tempo is too fast to say them.
      </p>
    </>
  );
}

import { isSubdivision, type MetronomeSettings } from "./audio/schedule";
import { KeyboardHint } from "./KeyboardHint";
import { isSkillLevel, levelForTolerance, SKILL_LEVELS, SKILL_PROFILES, type SkillLevel } from "./profiles";
import { releasing } from "./releasing";
import { formatDelta } from "./render/kitRenderer";
import type { ScoringOptions } from "./timing/grid";

interface Props {
  metronome: MetronomeSettings;
  onMetronomeChange: (patch: Partial<MetronomeSettings>) => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
  scoring: ScoringOptions;
  onScoringChange: (patch: Partial<ScoringOptions>) => void;
  skillLevel: SkillLevel;
  onSkillLevelChange: (level: SkillLevel) => void;
  onCalibrate: () => void;
  onClose: () => void;
}

/**
 * The set-once settings, opened over the kit view so the side panel only
 * holds what's used while playing. Tempo stays in the side panel.
 */
export function SettingsPanel({
  metronome,
  onMetronomeChange,
  volume,
  onVolumeChange,
  scoring,
  onScoringChange,
  skillLevel,
  onSkillLevelChange,
  onCalibrate,
  onClose,
}: Props) {
  const windowLevel = levelForTolerance(scoring.toleranceMs);

  return (
    <section className="overlay settings" aria-labelledby="settings-title">
      <div className="overlay-header">
        <h2 id="settings-title">Settings</h2>
        <button className="secondary" onClick={releasing(onClose)} aria-label="Close settings">
          Close <kbd>Esc</kbd>
        </button>
      </div>

      <h3>Metronome</h3>
      <label className="field">
        <span>Beats per bar</span>
        <select
          value={metronome.beatsPerBar}
          onChange={(e) => onMetronomeChange({ beatsPerBar: Number(e.target.value) })}
        >
          {[2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Score against</span>
        <select
          value={metronome.subdivision}
          onChange={(e) => {
            const subdivision = Number(e.target.value);
            if (isSubdivision(subdivision)) onMetronomeChange({ subdivision });
          }}
        >
          <option value={1}>Quarter notes</option>
          <option value={2}>Eighth notes</option>
          <option value={3}>Triplets</option>
          <option value={4}>Sixteenth notes</option>
        </select>
      </label>
      <label className="field checkbox">
        <input
          type="checkbox"
          checked={metronome.clickSubdivisions}
          onChange={(e) => onMetronomeChange({ clickSubdivisions: e.target.checked })}
        />
        <span>Click on subdivisions</span>
      </label>
      <label className="field">
        <span>Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
        />
      </label>

      <h3>Scoring</h3>
      <label className="field">
        <span>Skill level</span>
        <select
          value={skillLevel}
          onChange={(e) => {
            if (isSkillLevel(e.target.value)) onSkillLevelChange(e.target.value);
          }}
        >
          {SKILL_LEVELS.map((level) => (
            <option key={level} value={level}>
              {SKILL_PROFILES[level].label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>On-time window</span>
        <input
          type="range"
          min={5}
          max={80}
          value={scoring.toleranceMs}
          onChange={(e) => onScoringChange({ toleranceMs: Number(e.target.value) })}
        />
        <span className="unit">±{scoring.toleranceMs} ms</span>
      </label>
      <p className="hint">
        {windowLevel === null
          ? `Custom window. ${SKILL_PROFILES[skillLevel].label} uses ±${SKILL_PROFILES[skillLevel].toleranceMs} ms.`
          : `${SKILL_PROFILES[windowLevel].label} window.`}
      </p>
      <label className="field">
        <span>Latency offset</span>
        <input
          type="range"
          min={-200}
          max={200}
          value={scoring.latencyOffsetMs}
          onChange={(e) => onScoringChange({ latencyOffsetMs: Number(e.target.value) })}
        />
        <span className="unit">{formatDelta(scoring.latencyOffsetMs)}</span>
      </label>
      <button className="secondary" onClick={releasing(onCalibrate)}>
        Calibrate latency
      </button>
      <p className="hint">
        Calibrate to measure your setup's delay. The skill level sets the calibration tempo and how long it may
        listen; steadier playing finishes sooner. Fine-tune the offset by hand if needed.
      </p>

      <h3>Keyboard</h3>
      <KeyboardHint />
    </section>
  );
}

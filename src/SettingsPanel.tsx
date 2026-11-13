import { useRef, useState, type KeyboardEvent } from "react";
import { formatVolume, MAX_VOLUME, MIN_VOLUME } from "./audio/volume";
import { isSubdivision, type MetronomeSettings } from "./audio/schedule";
import { ThemeSetting } from "./ThemeSetting";
import { isHandedness, type Handedness } from "./handedness";
import { isAccuracyMode, type AccuracyMode } from "./playalong/results";
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
  accuracyMode: AccuracyMode;
  onAccuracyModeChange: (mode: AccuracyMode) => void;
  handedness: Handedness;
  onHandednessChange: (handedness: Handedness) => void;
  showNextPad: boolean;
  onShowNextPadChange: (show: boolean) => void;
  onCalibrate: () => void;
  onClose: () => void;
}

const TABS = [
  { id: "metronome", label: "Metronome" },
  { id: "scoring", label: "Scoring" },
  { id: "appearance", label: "Appearance" },
] as const;

type Tab = (typeof TABS)[number]["id"];

/**
 * The set-once settings, opened over the kit view so the side panel only
 * holds what's used while playing. Tempo stays in the side panel. Grouped
 * in tabs so each group fits without scrolling.
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
  accuracyMode,
  onAccuracyModeChange,
  handedness,
  onHandednessChange,
  showNextPad,
  onShowNextPadChange,
  onCalibrate,
  onClose,
}: Props) {
  const windowLevel = levelForTolerance(scoring.toleranceMs);
  const [tab, setTab] = useState<Tab>("metronome");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Tabs as screen readers expect: arrows move between them (and show the
  // new one), Home and End jump to the ends. Arrow keys aren't drum keys.
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TABS.length - 1;
    const next =
      e.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    const target = TABS[next];
    if (!target) return;
    setTab(target.id);
    tabRefs.current[next]?.focus();
  };

  return (
    <section className="overlay settings" aria-labelledby="settings-title">
      <div className="overlay-header">
        <h2 id="settings-title">Settings</h2>
        <button className="secondary" onClick={releasing(onClose)} aria-label="Close settings">
          Close <kbd>Esc</kbd>
        </button>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="Settings">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            id={`settings-tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`settings-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={tab === t.id ? "selected" : ""}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "metronome" && (
        <div id="settings-panel-metronome" role="tabpanel" aria-labelledby="settings-tab-metronome">
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
              min={MIN_VOLUME}
              max={MAX_VOLUME}
              step={0.05}
              value={volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
            />
            <span className="unit">{formatVolume(volume)}</span>
          </label>
          <p className="hint">
            Above 100% the click is boosted. If it's still hard to hear, turn up your computer's volume or use
            headphones.
          </p>
        </div>
      )}

      {tab === "scoring" && (
        <div id="settings-panel-scoring" role="tabpanel" aria-labelledby="settings-tab-scoring">
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

          <h3>Play along</h3>
          <label className="field">
            <span>Accuracy</span>
            <select
              value={accuracyMode}
              onChange={(e) => {
                if (isAccuracyMode(e.target.value)) onAccuracyModeChange(e.target.value);
              }}
            >
              <option value="partial">Partial credit</option>
              <option value="strict">Strict</option>
            </select>
          </label>
          <p className="hint">
            {accuracyMode === "partial"
              ? "A hit inside your on-time window counts fully; a bit outside still counts for part, less the further off it is. Gentler while you're learning."
              : "Only hits inside your on-time window count. Clear and demanding."}{" "}
            Both are shown at the end of a session.
          </p>
          <label className="field checkbox">
            <input type="checkbox" checked={showNextPad} onChange={(e) => onShowNextPadChange(e.target.checked)} />
            <span>Light up the next pad</span>
          </label>
          <p className="hint">
            During a session, a ring shows which pad to hit next, growing brighter as the note comes up. Turn it off
            once you can read the pattern from the notation.
          </p>
        </div>
      )}

      {tab === "appearance" && (
        <div id="settings-panel-appearance" role="tabpanel" aria-labelledby="settings-tab-appearance">
          <h3>Theme</h3>
          <ThemeSetting />
          <h3>Kit setup</h3>
          <label className="field">
            <span>Played</span>
            <select
              value={handedness}
              onChange={(e) => {
                if (isHandedness(e.target.value)) onHandednessChange(e.target.value);
              }}
            >
              <option value="right">Right-handed</option>
              <option value="left">Left-handed (mirrored kit)</option>
            </select>
          </label>
          <p className="hint">
            Left-handed mirrors the kit drawing, the hands shown on exercises (R and L swap), and which hand or foot
            gets credit in History's timing. Exercises themselves and your saved sessions don't change.
          </p>
        </div>
      )}
    </section>
  );
}

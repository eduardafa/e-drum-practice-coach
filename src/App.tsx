import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MAX_BPM, MIN_BPM, parseBpm, stepBpm, type MetronomeSettings } from "./audio/schedule";
import { CalibrationPanel } from "./CalibrationPanel";
import { KeyboardHint } from "./KeyboardHint";
import { LiveCount } from "./LiveCount";
import { MetronomeGuide } from "./MetronomeGuide";
import { NotationStrip } from "./NotationStrip";
import { findExercise } from "./exercises/library";
import { metronomeForExercise } from "./exercises/practice";
import { Coach, DEFAULT_METRONOME } from "./live/coach";
import type { MidiStatus } from "./midi/connection";
import {
  DEFAULT_SKILL_LEVEL,
  levelForTolerance,
  MIN_HITS_FOR_SUGGESTION,
  SKILL_PROFILES,
  suggestLevel,
  type SkillLevel,
} from "./profiles";
import { releasing } from "./releasing";
import { formatDelta, KitRenderer } from "./render/kitRenderer";
import { SettingsPanel } from "./SettingsPanel";
import { DEFAULT_SCORING, type ScoringOptions } from "./timing/grid";
import { loadSettings, saveSettings } from "./settings";

/** Keyboard fallback so the app can be tried without a kit. */
const KEY_TO_NOTE: Record<string, number> = {
  Space: 36, // kick
  KeyS: 38, // snare
  KeyA: 42, // closed hi-hat
  KeyZ: 44, // hi-hat pedal
  KeyQ: 49, // crash
  KeyW: 48, // tom 1
  KeyE: 45, // tom 2
  KeyD: 43, // tom 3
  KeyR: 51, // ride
};

const saved = loadSettings();
const coach = new Coach(saved.metronome ?? DEFAULT_METRONOME);
// A first-time drummer gets the on-time window of their (default) skill level.
coach.scoring = saved.scoring ?? {
  ...DEFAULT_SCORING,
  toleranceMs: SKILL_PROFILES[saved.skillLevel ?? DEFAULT_SKILL_LEVEL].toleranceMs,
};

function useMidiStatus(): MidiStatus {
  return useSyncExternalStore(
    (cb) => coach.midi.onStatus(cb),
    () => coach.midi.getStatus(),
  );
}

interface Stats {
  scored: number;
  onTimePct: number | null;
  meanMs: number | null;
  spreadMs: number | null;
}

function readStats(): Stats {
  const l = coach.live;
  return {
    scored: l.scoredHits,
    onTimePct: l.scoredHits ? (100 * l.onTimeHits) / l.scoredHits : null,
    meanMs: l.scoredHits ? l.sumDeltaMs / l.scoredHits : null,
    spreadMs: l.spreadMs,
  };
}

/** Polls the live state a few times a second; per-hit React renders aren't needed. */
function useStats(): Stats {
  const [stats, setStats] = useState(readStats);
  useEffect(() => {
    const id = setInterval(() => setStats(readStats()), 150);
    return () => clearInterval(id);
  }, []);
  return stats;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const midi = useMidiStatus();
  const stats = useStats();
  const [metronome, setMetronome] = useState<MetronomeSettings>(
    saved.metronome ?? DEFAULT_METRONOME,
  );
  const [scoring, setScoring] = useState<ScoringOptions>(coach.scoring);
  const [running, setRunning] = useState(false);
  const [volume, setVolume] = useState(coach.metronome.volume);
  const [calibrating, setCalibrating] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exerciseId, setExerciseId] = useState<string | null>(saved.exerciseId ?? null);
  const exercise = exerciseId === null ? null : (findExercise(exerciseId) ?? null);
  /** What's typed in the tempo box while it has focus; null shows the current tempo. */
  const [tempoDraft, setTempoDraft] = useState<string | null>(null);
  /** Set by Escape so the blur that follows throws the draft away instead of applying it. */
  const discardTempoDraft = useRef(false);
  const [guideSeen, setGuideSeen] = useState(saved.guideSeen === true);
  /** Whether this opening of the guide is the drummer's first. */
  const [guideFirstOpen, setGuideFirstOpen] = useState(false);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>(saved.skillLevel ?? DEFAULT_SKILL_LEVEL);
  /** The level a calibration run started with, so its panel describes that run. */
  const [calibrationLevel, setCalibrationLevel] = useState<SkillLevel>(skillLevel);
  /** A suggested level the drummer said "not now" to; not suggested again this page session. */
  const [dismissedSuggestion, setDismissedSuggestion] = useState<SkillLevel | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new KitRenderer(canvas, coach.live, {
      getToleranceMs: () => coach.scoring.toleranceMs,
    });
    renderer.start();
    return () => renderer.dispose();
  }, []);

  useEffect(() => {
    coach.metronome.setSettings(metronome);
    coach.scoring = scoring;
    saveSettings({ metronome, scoring, skillLevel, guideSeen: guideSeen || undefined, exerciseId: exerciseId ?? undefined });
  }, [metronome, scoring, skillLevel, guideSeen, exerciseId]);

  useEffect(() => {
    coach.metronome.volume = volume;
  }, [volume]);

  const toggleMetronome = async () => {
    if (coach.calibrating) return;
    if (coach.metronome.running) {
      coach.stopMetronome();
      setRunning(false);
    } else {
      await coach.startMetronome();
      setRunning(true);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" && (settingsOpen || guideOpen)) {
        setSettingsOpen(false);
        setGuideOpen(false);
        return;
      }
      if (e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === "KeyM") {
        void toggleMetronome();
        return;
      }
      const note = KEY_TO_NOTE[e.code];
      if (note !== undefined) {
        e.preventDefault();
        coach.simulateHit(note, 100, e.timeStamp);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Only one panel is open over the kit view at a time.
  const openGuide = () => {
    setSettingsOpen(false);
    setGuideFirstOpen(!guideSeen);
    setGuideOpen(true);
    setGuideSeen(true);
  };

  const toggleSettings = () => {
    setGuideOpen(false);
    setSettingsOpen((open) => !open);
  };

  const startCalibration = async () => {
    setGuideOpen(false);
    setSettingsOpen(false);
    setRunning(false);
    setCalibrating(true);
    setCalibrationLevel(skillLevel);
    await coach.startCalibration(skillLevel);
  };

  /** Switching level also applies its on-time window; the slider stays for fine-tuning. */
  const applySkillLevel = (level: SkillLevel) => {
    setSkillLevel(level);
    setScoring((s) => ({ ...s, toleranceMs: SKILL_PROFILES[level].toleranceMs }));
  };

  const suggestion =
    stats.scored >= MIN_HITS_FOR_SUGGESTION && stats.spreadMs !== null
      ? suggestLevel(skillLevel, stats.spreadMs)
      : null;
  const windowLevel = levelForTolerance(scoring.toleranceMs);
  const levelSummary =
    windowLevel === skillLevel
      ? `${SKILL_PROFILES[skillLevel].label} · ±${scoring.toleranceMs} ms window`
      : `${SKILL_PROFILES[skillLevel].label} · custom ±${scoring.toleranceMs} ms window`;

  const endCalibration = (offsetMs: number | null) => {
    coach.endCalibration();
    setCalibrating(false);
    if (offsetMs !== null) setScoring((s) => ({ ...s, latencyOffsetMs: offsetMs }));
  };

  /** Picking an exercise sets the metronome to fit it: suggested tempo, its beats, fine enough to score every note. */
  const selectExercise = (id: string | null) => {
    setExerciseId(id);
    const picked = id === null ? undefined : findExercise(id);
    if (picked) setMetronome((m) => metronomeForExercise(picked, m.clickSubdivisions));
  };

  const updateMetronome = (patch: Partial<MetronomeSettings>) =>
    setMetronome((m) => ({ ...m, ...patch }));
  const updateScoring = (patch: Partial<ScoringOptions>) => setScoring((s) => ({ ...s, ...patch }));

  return (
    <div className="app">
      <header className="topbar">
        <h1>E-drum Practice Coach</h1>
        <MidiPanel status={midi} />
      </header>

      <main className="stage">
        <NotationStrip coach={coach} exercise={exercise} onSelect={selectExercise} />
        <canvas ref={canvasRef} className="kit-canvas" aria-label="Live view of the drum kit" />
        {guideOpen && !calibrating && (
          <MetronomeGuide
            coach={coach}
            running={running}
            basicsOpen={guideFirstOpen}
            onApply={(settings) => setMetronome(settings)}
            onToggleMetronome={() => void toggleMetronome()}
            onClose={() => setGuideOpen(false)}
          />
        )}
        {settingsOpen && !calibrating && (
          <SettingsPanel
            metronome={metronome}
            onMetronomeChange={updateMetronome}
            volume={volume}
            onVolumeChange={setVolume}
            scoring={scoring}
            onScoringChange={updateScoring}
            skillLevel={skillLevel}
            onSkillLevelChange={applySkillLevel}
            onCalibrate={() => void startCalibration()}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {calibrating && (
          <CalibrationPanel
            coach={coach}
            level={calibrationLevel}
            currentLevel={skillLevel}
            onSwitchLevel={applySkillLevel}
            currentOffsetMs={scoring.latencyOffsetMs}
            onRetry={() => void startCalibration()}
            onClose={endCalibration}
          />
        )}
      </main>

      <aside className="controls">
        <fieldset className="group play" disabled={calibrating}>
          {!guideSeen && (
            <output className="suggestion first-visit">
              <p>New to playing with a metronome? Learn to count and play along.</p>
              <button className="primary" onClick={releasing(openGuide)}>
                Open the guide
              </button>
            </output>
          )}
          <div className="play-row">
            <button
              className={`primary start ${running ? "active" : ""}`}
              onClick={releasing(() => void toggleMetronome())}
            >
              {running ? "Stop" : "Start"} <kbd>M</kbd>
            </button>
            <button
              className={`secondary ${settingsOpen ? "selected" : ""}`}
              aria-expanded={settingsOpen}
              onClick={releasing(toggleSettings)}
            >
              <span className="icon" aria-hidden>
                ⚙
              </span>
              Settings
            </button>
          </div>
          <LiveCount coach={coach} />
          <div className="tempo">
            <label htmlFor="tempo">Tempo</label>
            <button
              className="secondary step"
              aria-label="Slower"
              title="1 BPM slower (Shift: 5)"
              onClick={(e) => {
                const delta = e.shiftKey ? -5 : -1;
                releasing(() => updateMetronome({ bpm: stepBpm(metronome.bpm, delta) }))(e);
              }}
            >
              −
            </button>
            <input
              id="tempo"
              type="number"
              className="num"
              min={MIN_BPM}
              max={MAX_BPM}
              value={tempoDraft ?? metronome.bpm}
              onFocus={(e) => {
                setTempoDraft(String(metronome.bpm));
                e.currentTarget.select();
              }}
              // Typing "120" passes through "1" and "12": apply only values in range while typing,
              // and settle the rest (clamped, or back to the tempo if not a number) on Enter or blur.
              onChange={(e) => {
                setTempoDraft(e.target.value);
                const bpm = Number(e.target.value);
                if (e.target.value !== "" && bpm >= MIN_BPM && bpm <= MAX_BPM) updateMetronome({ bpm: Math.round(bpm) });
              }}
              onBlur={() => {
                const bpm = tempoDraft === null || discardTempoDraft.current ? null : parseBpm(tempoDraft);
                if (bpm !== null) updateMetronome({ bpm });
                discardTempoDraft.current = false;
                setTempoDraft(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  discardTempoDraft.current = true;
                  e.currentTarget.blur();
                }
              }}
            />
            <button
              className="secondary step"
              aria-label="Faster"
              title="1 BPM faster (Shift: 5)"
              onClick={(e) => {
                const delta = e.shiftKey ? 5 : 1;
                releasing(() => updateMetronome({ bpm: stepBpm(metronome.bpm, delta) }))(e);
              }}
            >
              +
            </button>
            <span className="unit">BPM</span>
          </div>

          <h2>This session</h2>
          <dl className="tiles">
            <div>
              <dt>On time</dt>
              <dd>{stats.onTimePct === null ? "—" : `${stats.onTimePct.toFixed(0)}%`}</dd>
              <dd className="tile-note">
                {stats.scored === 0 ? "no hits yet" : stats.scored === 1 ? "of 1 hit" : `of ${stats.scored} hits`}
              </dd>
            </div>
            <div>
              <dt>Average</dt>
              <dd>{stats.meanMs === null ? "—" : formatDelta(stats.meanMs)}</dd>
              <dd className="tile-note">
                {stats.meanMs === null || Math.round(stats.meanMs) === 0 ? "\u00a0" : stats.meanMs < 0 ? "early" : "late"}
              </dd>
            </div>
            <div>
              <dt>Consistency</dt>
              <dd>{stats.spreadMs === null ? "—" : `±${stats.spreadMs.toFixed(0)} ms`}</dd>
              <dd className="tile-note">spread</dd>
            </div>
          </dl>
          <p className="level-summary">{levelSummary}</p>
          {suggestion !== null && suggestion !== dismissedSuggestion && stats.spreadMs !== null && (
            <output className="suggestion">
              <p>
                Your hits vary by ±{stats.spreadMs.toFixed(0)} ms. The {SKILL_PROFILES[suggestion].label} window (±
                {SKILL_PROFILES[suggestion].toleranceMs} ms) fits you best right now.
              </p>
              <div className="calibration-actions">
                <button className="primary" onClick={releasing(() => applySkillLevel(suggestion))}>
                  Switch to {SKILL_PROFILES[suggestion].label}
                </button>
                <button className="secondary" onClick={releasing(() => setDismissedSuggestion(suggestion))}>
                  Not now
                </button>
              </div>
            </output>
          )}
          {/* Until the guide is opened, the first-visit prompt above stands in for this link. */}
          {guideSeen && (
            <button className="link-button" onClick={releasing(openGuide)}>
              How to play with the metronome
            </button>
          )}
        </fieldset>

        {/* Settings always lists the keys; here only while no kit is playing. */}
        {!(midi.state === "ready" && midi.selectedId) && <KeyboardHint />}
      </aside>
    </div>
  );
}

function MidiPanel({ status }: { status: MidiStatus }) {
  switch (status.state) {
    case "unsupported":
      return (
        <div className="midi warn">
          This browser doesn't support Web MIDI. Use Chrome, Edge or Firefox.
        </div>
      );
    case "idle":
      return (
        <button className="primary" onClick={() => void coach.midi.connect()}>
          Connect kit
        </button>
      );
    case "requesting":
      return <div className="midi">Waiting for MIDI permission…</div>;
    case "denied":
      return <div className="midi warn">MIDI access denied: {status.message}</div>;
    case "ready":
      if (status.devices.length === 0) {
        return <div className="midi warn">No MIDI devices found. Plug in the kit over USB.</div>;
      }
      return (
        <label className="midi">
          <span className={`dot ${status.selectedId ? "on" : ""}`} aria-hidden />
          <select
            value={status.selectedId ?? ""}
            onChange={(e) => coach.midi.select(e.target.value || null)}
          >
            <option value="">No input</option>
            {status.devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      );
  }
}

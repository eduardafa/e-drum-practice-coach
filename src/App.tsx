import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MAX_BPM, MIN_BPM, parseBpm, stepBpm, type MetronomeSettings } from "./audio/schedule";
import { CalibrationPanel } from "./CalibrationPanel";
import { KeyboardHint } from "./KeyboardHint";
import { LiveCount } from "./LiveCount";
import { MetronomeGuide } from "./MetronomeGuide";
import { NotationStrip, type SessionView } from "./NotationStrip";
import type { AccuracyMode } from "./playalong/results";
import { DEFAULT_SESSION_LOOPS, type PlayAlongSession } from "./playalong/session";
import { ResultsPanel } from "./ResultsPanel";
import { nextRound, type RoundRecord, type TrainerConfig } from "./playalong/trainer";
import { TrainerPanel, type TrainerStage } from "./TrainerPanel";
import { findExercise } from "./exercises/library";
import { metronomeForExercise, startingTempo } from "./exercises/practice";
import type { Exercise } from "./exercises/types";
import { LibraryPanel } from "./LibraryPanel";
import { HistoryPanel, type HistoryStatus } from "./HistoryPanel";
import { sessionRecord, trainerRecord, type HistoryRecord } from "./history/record";
import { HistoryStore } from "./history/store";
import { formatPracticeTime, practiceTimeOn, streak } from "./history/streak";
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
/** The pause between tempo-trainer rounds, to read the score before the next count-in. */
const BETWEEN_ROUNDS_MS = 3000;
const coach = new Coach(saved.metronome ?? DEFAULT_METRONOME);
const historyStore = new HistoryStore();
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
  /** The metronome stops by itself when a play-along session ends. */
  running: boolean;
  session: (Omit<SessionView, "accuracy"> & { accuracy: Record<AccuracyMode, number | null> }) | null;
}

function readStats(): Stats {
  const l = coach.live;
  const now = performance.now();
  // Also resolves missed notes when no exercise is drawn to do it every frame.
  coach.tickSession(now);
  const session = coach.session;
  return {
    scored: l.scoredHits,
    onTimePct: l.scoredHits ? (100 * l.onTimeHits) / l.scoredHits : null,
    meanMs: l.scoredHits ? l.sumDeltaMs / l.scoredHits : null,
    spreadMs: l.spreadMs,
    running: coach.metronome.running,
    session: session
      ? {
          phase: session.phase,
          loop: session.currentLoop(now),
          loops: session.loops,
          accuracy: session.results().accuracy,
        }
      : null,
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
  const [sessionLoops, setSessionLoops] = useState(saved.sessionLoops ?? DEFAULT_SESSION_LOOPS);
  const [accuracyMode, setAccuracyMode] = useState<AccuracyMode>(saved.accuracyMode ?? "partial");
  /** The last tempo used for each exercise, so choosing one again picks up where the drummer left off. */
  const [exerciseTempos, setExerciseTempos] = useState<Record<string, number>>(saved.exerciseTempos ?? {});
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>("loading");
  /** The running tempo-trainer run: its id (rounds point to it) and when it started. */
  const trainerRun = useRef<{ id: string; start: Temporal.Instant; timeZone: string; perf: number } | null>(null);
  /** The exercise whose preview is playing in the library, or null. */
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  /** The tempo trainer: null when off; "round" while a round is being played (no panel then). */
  const [trainer, setTrainer] = useState<TrainerStage | { kind: "round" } | null>(null);
  const [trainerConfig, setTrainerConfig] = useState<TrainerConfig | null>(null);
  const [trainerRounds, setTrainerRounds] = useState<RoundRecord[]>([]);
  /** The last trainer round already scored, so a finished session is counted once. */
  const [scoredSession, setScoredSession] = useState<PlayAlongSession | null>(null);
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
    saveSettings({
      metronome,
      scoring,
      skillLevel,
      guideSeen: guideSeen || undefined,
      exerciseId: exerciseId ?? undefined,
      accuracyMode,
      sessionLoops,
      exerciseTempos,
    });
  }, [metronome, scoring, skillLevel, guideSeen, exerciseId, accuracyMode, sessionLoops, exerciseTempos]);

  // Remember the tempo of the exercise on the staff, however it changed (− / +, typed, a retry, the trainer).
  if (exerciseId !== null && exerciseTempos[exerciseId] !== metronome.bpm) {
    setExerciseTempos({ ...exerciseTempos, [exerciseId]: metronome.bpm });
  }

  useEffect(() => {
    const load = async () => {
      try {
        setHistory(await historyStore.all());
        setHistoryStatus("ready");
      } catch (error) {
        console.warn("Practice history is unavailable:", error);
        setHistoryStatus("off");
      }
    };
    void load();
  }, []);

  /** Shows a new record straight away; if it can't be stored, history is switched off. */
  const saveRecord = (record: HistoryRecord) => {
    setHistory((records) => [record, ...records]);
    historyStore.add(record).catch((error: unknown) => {
      console.warn("Couldn't save to practice history:", error);
      setHistoryStatus("off");
    });
  };
  const saveRecordRef = useRef(saveRecord);
  useEffect(() => {
    saveRecordRef.current = saveRecord;
  });

  // Every session that finishes by itself is saved, including tempo-trainer rounds.
  useEffect(
    () =>
      coach.onSessionEnd((session, timing) => {
        saveRecordRef.current(
          sessionRecord(
            { id: crypto.randomUUID(), start: timing.start, durationMs: timing.durationMs, timeZone: timing.timeZone },
            {
              exercise: session.exercise,
              bpm: session.bpm,
              loops: session.loops,
              scoring: coach.scoring,
              results: session.results(),
              outcomes: session.outcomes(),
              trainerRunId: trainerRun.current?.id ?? null,
            },
          ),
        );
      }),
    [],
  );

  const clearHistory = () => {
    setHistory([]);
    historyStore.clear().catch((error: unknown) => {
      console.warn("Couldn't clear practice history:", error);
      setHistoryStatus("off");
    });
  };

  const sessionView = useMemo<SessionView | null>(
    () => stats.session && { ...stats.session, accuracy: stats.session.accuracy[accuracyMode] },
    [stats.session, accuracyMode],
  );

  // A finished session stops the clicks by itself; keep the Start button in step.
  if (running && !stats.running && stats.session?.phase === "done") setRunning(false);

  useEffect(() => {
    coach.metronome.volume = volume;
  }, [volume]);

  const stopPreview = () => {
    coach.preview.stop();
    setPreviewingId(null);
  };

  const closeLibrary = () => {
    stopPreview();
    setLibraryOpen(false);
  };

  const toggleLibrary = () => {
    if (libraryOpen) {
      closeLibrary();
      return;
    }
    setHistoryOpen(false);
    setSettingsOpen(false);
    setGuideOpen(false);
    setLibraryOpen(true);
  };

  /** Plays one loop; the metronome stops so the two don't clash. */
  const previewExercise = (picked: Exercise, bpm: number) => {
    setPreviewingId(picked.id);
    setRunning(false);
    void coach.startPreview(picked, bpm, () => setPreviewingId((id) => (id === picked.id ? null : id)));
  };

  const stopTrainer = () => {
    coach.endSession();
    setRunning(false);
    setTrainer({ kind: "finished", reason: "stopped" });
  };

  const toggleMetronome = async () => {
    if (coach.calibrating) return;
    stopPreview();
    if (trainer?.kind === "round" || trainer?.kind === "between") {
      stopTrainer();
      return;
    }
    // Stopping during a session abandons it; starting plain clicks clears a finished one.
    coach.endSession();
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
      if (e.code === "Escape" && (settingsOpen || guideOpen || libraryOpen || historyOpen)) {
        setSettingsOpen(false);
        setGuideOpen(false);
        setHistoryOpen(false);
        closeLibrary();
        return;
      }
      // While browsing, keys move around the library: Space and Enter press its buttons, not the drums.
      if (libraryOpen) return;
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

  const toggleHistory = () => {
    closeLibrary();
    setSettingsOpen(false);
    setGuideOpen(false);
    setHistoryOpen((open) => !open);
  };

  // Only one panel is open over the kit view at a time.
  const openGuide = () => {
    closeLibrary();
    setHistoryOpen(false);
    setSettingsOpen(false);
    setGuideFirstOpen(!guideSeen);
    setGuideOpen(true);
    setGuideSeen(true);
  };

  const toggleSettings = () => {
    closeLibrary();
    setHistoryOpen(false);
    setGuideOpen(false);
    setSettingsOpen((open) => !open);
  };

  /** Starts a play-along session at `bpm` (the current tempo, or a retry's new tempo). */
  const startSession = async (bpm: number) => {
    if (!exercise || coach.calibrating) return;
    closeLibrary();
    setHistoryOpen(false);
    setGuideOpen(false);
    setSettingsOpen(false);
    const settings = await coach.startSession(exercise, sessionLoops, bpm);
    setMetronome(settings);
    setRunning(true);
  };

  // The latest startSession, for the between-rounds timer (which mustn't restart on every render).
  const startSessionRef = useRef(startSession);
  useEffect(() => {
    startSessionRef.current = startSession;
  });

  const stopSession = () => {
    coach.endSession();
    setRunning(false);
  };

  const startTrainer = (config: TrainerConfig) => {
    trainerRun.current = {
      id: crypto.randomUUID(),
      start: Temporal.Now.instant(),
      timeZone: Temporal.Now.timeZoneId(),
      perf: performance.now(),
    };
    setTrainerConfig(config);
    setTrainerRounds([]);
    setTrainer({ kind: "round" });
    void startSession(config.startBpm);
  };

  // A trainer round has finished: score it, then pick the next tempo or finish. Done while
  // rendering (guarded so each session counts once); the next round's session replaces this one.
  const finished = coach.session;
  // Read the phase from the coach's session itself: the polled stats can still describe the
  // previous round for up to 150 ms after the next one has started.
  if (trainer?.kind === "round" && finished?.phase === "done" && finished !== scoredSession && trainerConfig) {
    const accuracy = finished.results().accuracy[accuracyMode] ?? 0;
    const next = nextRound(trainerConfig, finished.bpm, accuracy);
    setScoredSession(finished);
    setTrainerRounds((rounds) => [...rounds, { bpm: finished.bpm, accuracy, outcome: next.outcome }]);
    setTrainer(next.outcome === "done" ? { kind: "finished", reason: "target" } : { kind: "between", nextBpm: next.bpm });
  }

  // A finished trainer run (target reached, or stopped after at least one round) is saved once.
  useEffect(() => {
    const run = trainerRun.current;
    if (trainer?.kind !== "finished" || !run || !exercise || !trainerConfig) return;
    trainerRun.current = null;
    if (trainerRounds.length === 0) return;
    saveRecordRef.current(
      trainerRecord(
        { id: run.id, start: run.start, durationMs: performance.now() - run.perf, timeZone: run.timeZone },
        exercise,
        trainerConfig,
        trainerRounds,
        trainer.reason,
      ),
    );
  }, [trainer, exercise, trainerConfig, trainerRounds]);

  // Between rounds: a short pause to read the score, then the next round starts with a count-in.
  useEffect(() => {
    if (trainer?.kind !== "between") return;
    const { nextBpm } = trainer;
    const id = setTimeout(() => {
      setTrainer({ kind: "round" });
      void startSessionRef.current(nextBpm);
    }, BETWEEN_ROUNDS_MS);
    return () => clearTimeout(id);
    // Only when the stage changes: the app re-renders every 150 ms, which must not restart the pause.
  }, [trainer]);

  const startCalibration = async () => {
    closeLibrary();
    coach.endSession();
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

  const todayKey = Temporal.Now.plainDateISO().toString();
  const practiceSummary = useMemo(() => {
    const today = Temporal.PlainDate.from(todayKey);
    const { current } = streak(history, today);
    const time = practiceTimeOn(history, today);
    if (history.length === 0) return "No practice saved yet";
    const days = current === 1 ? "1-day streak" : `${current}-day streak`;
    return time.total("seconds") > 0 ? `${days} · ${formatPracticeTime(time)} today` : days;
  }, [history, todayKey]);

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

  /**
   * Choosing an exercise sets the metronome to fit it: the drummer's last tempo for it (or its
   * suggested tempo), its beats, and fine enough to score every note.
   */
  const selectExercise = (id: string | null) => {
    closeLibrary();
    coach.endSession();
    setTrainer(null);
    setExerciseId(id);
    const picked = id === null ? undefined : findExercise(id);
    if (picked) {
      setMetronome((m) => metronomeForExercise(picked, m.clickSubdivisions, startingTempo(picked, exerciseTempos)));
    }
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
        <NotationStrip
          coach={coach}
          exercise={exercise}
          onSelect={selectExercise}
          onBrowse={toggleLibrary}
          libraryOpen={libraryOpen}
          session={sessionView}
          loops={sessionLoops}
          onLoopsChange={setSessionLoops}
          onPlay={() => void startSession(metronome.bpm)}
          onStop={trainer ? stopTrainer : stopSession}
          onTrain={() => {
            coach.endSession();
            setTrainer({ kind: "setup" });
          }}
          trainerStatus={
            trainer?.kind === "round" || trainer?.kind === "between"
              ? `Tempo trainer, round ${trainerRounds.length + 1}${trainerConfig ? ` (target ${trainerConfig.targetBpm} BPM)` : ""} · `
              : null
          }
        />
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
            accuracyMode={accuracyMode}
            onAccuracyModeChange={setAccuracyMode}
            onCalibrate={() => void startCalibration()}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {libraryOpen && !calibrating && (
          <LibraryPanel
            selectedId={exerciseId}
            tempos={exerciseTempos}
            player={coach.preview}
            previewingId={previewingId}
            onPreview={previewExercise}
            onStopPreview={stopPreview}
            onSelect={selectExercise}
            onClose={closeLibrary}
          />
        )}
        {historyOpen && !calibrating && (
          <HistoryPanel
            records={history}
            status={historyStatus}
            accuracyMode={accuracyMode}
            onClear={clearHistory}
            onClose={() => setHistoryOpen(false)}
          />
        )}
        {exercise && trainer && trainer.kind !== "round" && !libraryOpen && !historyOpen && !calibrating && (
          <TrainerPanel
            exercise={exercise}
            stage={trainer}
            config={trainerConfig}
            rounds={trainerRounds}
            onStart={startTrainer}
            onStop={stopTrainer}
            onClose={() => {
              coach.endSession();
              setTrainer(null);
            }}
          />
        )}
        {exercise && !trainer && stats.session?.phase === "done" && coach.session && !libraryOpen && !historyOpen && !calibrating && (
          <ResultsPanel
            exercise={exercise}
            results={coach.session.results()}
            mode={accuracyMode}
            bpm={coach.session.bpm}
            loops={coach.session.loops}
            onRetry={(change) => void startSession(stepBpm(coach.session?.bpm ?? metronome.bpm, change))}
            onClose={() => coach.endSession()}
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
          {historyStatus !== "loading" && (
            <div className="practice-line">
              <span>{historyStatus === "off" ? "History is off in this browser" : practiceSummary}</span>
              <button
                className={`link-button ${historyOpen ? "selected" : ""}`}
                aria-expanded={historyOpen}
                onClick={releasing(toggleHistory)}
              >
                History
              </button>
            </div>
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

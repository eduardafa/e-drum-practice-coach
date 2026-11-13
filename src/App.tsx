import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MAX_BPM, MIN_BPM, parseBpm, stepBpm, type MetronomeSettings } from "./audio/schedule";
import { CalibrationPanel } from "./CalibrationPanel";
import { KeyboardHint } from "./KeyboardHint";
import { LiveCount } from "./LiveCount";
import { BigCount } from "./BigCount";
import { practicePlan, type PlanBlock } from "./history/plan";
import { PracticePlanBanner, PracticePlanPanel, type RunningPlan } from "./PracticePlan";
import { MetronomeGuide } from "./MetronomeGuide";
import { NotationStrip, type LearnView, type SessionView } from "./NotationStrip";
import { LearnSummary } from "./LearnSummary";
import type { AccuracyMode } from "./playalong/results";
import { DEFAULT_GET_READY_SEC } from "./playalong/getReady";
import { GetReady } from "./GetReady";
import { DEFAULT_HANDEDNESS, type Handedness } from "./handedness";
import { HandednessContext } from "./HandednessContext";
import { DEFAULT_SESSION_LOOPS, type PlayAlongSession } from "./playalong/session";
import { ResultsPanel } from "./ResultsPanel";
import { nextRound, type RoundRecord, type TrainerConfig } from "./playalong/trainer";
import { TrainerPanel, type TrainerStage } from "./TrainerPanel";
import { findExercise } from "./exercises/library";
import { metronomeForExercise, startingTempo } from "./exercises/practice";
import type { Exercise } from "./exercises/types";
import { LibraryPanel } from "./LibraryPanel";
import { HistoryPage, type HistoryStatus } from "./HistoryPage";
import { useAccount } from "./account/useAccount";
import { useSync } from "./history/useSync";
import { localLedger } from "./history/sync";
import { deleteAccount, deleteSyncedHistory } from "./account/account";
import { AccountMenu } from "./AccountMenu";
import { signInResult as readSignInResult } from "./account/account";
import { sessionRecord, trainerRecord, type HistoryRecord, type SessionRecord } from "./history/record";
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
import { DEFAULT_PASS_MARK } from "./playalong/trainer";

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

/** The two pages: practice at /, history at /history. */
type View = "practice" | "history";
const viewOf = (path: string): View => (path.replace(/\/+$/, "") === "/history" ? "history" : "practice");

/** Read once: the sign-in redirect lands on /?signin=<result>. */
const SIGN_IN_RESULT = readSignInResult(window.location.search);
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
  learn: LearnView | null;
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
          countdown: coach.countdownAt(now),
          loop: session.currentLoop(now),
          loops: session.loops,
          accuracy: session.results().accuracy,
        }
      : null,
    learn: coach.learn
      ? { loop: coach.learn.currentLoop, loops: coach.learn.loops, wrongHits: coach.learn.wrongHits, done: coach.learn.done }
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
  const [volume, setVolume] = useState(saved.volume ?? coach.metronome.volume);
  const [calibrating, setCalibrating] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exerciseId, setExerciseId] = useState<string | null>(saved.exerciseId ?? null);
  const exercise = exerciseId === null ? null : (findExercise(exerciseId) ?? null);
  const [sessionLoops, setSessionLoops] = useState(saved.sessionLoops ?? DEFAULT_SESSION_LOOPS);
  const [getReadySec, setGetReadySec] = useState(saved.getReadySec ?? DEFAULT_GET_READY_SEC);
  const [handedness, setHandedness] = useState<Handedness>(saved.handedness ?? DEFAULT_HANDEDNESS);
  /** For the kit renderer, which reads it every frame outside React. */
  const handednessRef = useRef(handedness);
  handednessRef.current = handedness;
  const [showNextPad, setShowNextPad] = useState(saved.showNextPad ?? true);
  const [guideTrack, setGuideTrack] = useState(saved.guideTrack === true);
  const [showBigCount, setShowBigCount] = useState(saved.showBigCount ?? true);
  /** Today's practice: the plan shown before starting, and the plan being run. */
  const [planOpen, setPlanOpen] = useState(false);
  const [plan, setPlan] = useState<RunningPlan | null>(null);
  /** The big count while it's shown, so the kit view can leave room for it. */
  const bigCountRef = useRef<HTMLOListElement>(null);
  const showNextPadRef = useRef(showNextPad);
  showNextPadRef.current = showNextPad;
  const [accuracyMode, setAccuracyMode] = useState<AccuracyMode>(saved.accuracyMode ?? "partial");
  /** The last tempo used for each exercise, so choosing one again picks up where the drummer left off. */
  const [exerciseTempos, setExerciseTempos] = useState<Record<string, number>>(saved.exerciseTempos ?? {});
  const [libraryOpen, setLibraryOpen] = useState(false);
  // Reloading /history opens History directly; back and forward switch pages.
  const [view, setView] = useState<View>(() => viewOf(window.location.pathname));
  // Coming back from signing in opens the account menu, with the result.
  const [accountOpen, setAccountOpen] = useState(SIGN_IN_RESULT !== null);
  const { account, signOut, markSignedOut } = useAccount();
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>("loading");
  /** The session that just ended, as saved, for the results screen's heatmap. */
  const [lastSession, setLastSession] = useState<SessionRecord | null>(null);
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
      getHandedness: () => handednessRef.current,
      getCues: (now) => (showNextPadRef.current ? coach.cuesAt(now) : []),
      getTopInset: () => (bigCountRef.current ? bigCountRef.current.offsetHeight + 16 : 0),
    });
    renderer.start();
    return () => renderer.dispose();
  }, []);

  useEffect(() => {
    coach.metronome.setSettings(metronome);
    coach.guideEnabled = guideTrack;
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
      volume,
      getReadySec,
      handedness,
      showNextPad,
      guideTrack: guideTrack || undefined,
      showBigCount,
    });
  }, [
    metronome,
    scoring,
    skillLevel,
    guideSeen,
    exerciseId,
    accuracyMode,
    sessionLoops,
    exerciseTempos,
    volume,
    getReadySec,
    handedness,
    showNextPad,
    guideTrack,
    showBigCount,
  ]);

  // Remember the tempo of the exercise on the staff, however it changed (− / +, typed, a retry, the trainer).
  if (exerciseId !== null && exerciseTempos[exerciseId] !== metronome.bpm) {
    setExerciseTempos({ ...exerciseTempos, [exerciseId]: metronome.bpm });
  }

  // Drop ?signin= from the address, so reloading doesn't show the message again.
  useEffect(() => {
    if (SIGN_IN_RESULT === null) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("signin");
    window.history.replaceState(null, "", url);
  }, []);

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

  // While signed in, history syncs with the account: records from other
  // devices are added here, and this browser's records are uploaded.
  const reloadHistory = () => {
    historyStore.all().then(setHistory, (error: unknown) => console.warn("Couldn't reload practice history:", error));
  };
  // Which records were synced with which account (kept in localStorage).
  const [ledger] = useState(localLedger);
  const userId = account.status === "signed-in" ? account.id : null;
  const { status: syncStatus, syncNow } = useSync(
    userId,
    historyStore,
    ledger,
    historyStatus === "ready",
    reloadHistory,
    markSignedOut,
  );

  /** Shows a new record straight away; if it can't be stored, history is switched off. Then syncs it. */
  const saveRecord = (record: HistoryRecord) => {
    setHistory((records) => [record, ...records]);
    historyStore.add(record).then(syncNow, (error: unknown) => {
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
        const record = sessionRecord(
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
        );
        setLastSession(record);
        saveRecordRef.current(record);
      }),
    [],
  );

  /**
   * Clears this browser's history and, if asked (signed in only), the copy
   * synced to the account too. Other devices keep their own copies either
   * way. Resolves false if the account's copy couldn't be deleted.
   */
  const clearHistory = async (alsoAccount: boolean): Promise<boolean> => {
    setHistory([]);
    try {
      await historyStore.clear();
    } catch (error) {
      console.warn("Couldn't clear practice history:", error);
      setHistoryStatus("off");
    }
    if (!alsoAccount || !userId) return true;
    try {
      await deleteSyncedHistory();
      return true;
    } catch (error) {
      console.warn("Couldn't delete synced history:", error);
      return false;
    }
  };

  /** Deletes the account and everything synced to it; history in this browser stays. */
  const deleteMyAccount = async (): Promise<boolean> => {
    if (!userId) return false;
    try {
      await deleteAccount();
    } catch (error) {
      console.warn("Couldn't delete the account:", error);
      return false;
    }
    ledger.forget(userId);
    markSignedOut();
    return true;
  };

  /** For a shared computer: remove this account's synced records from this browser, then sign out. */
  const signOutAndRemove = async (): Promise<boolean> => {
    if (!userId) return false;
    const ok = await signOut();
    if (!ok) return false;
    try {
      await historyStore.deleteMany(ledger.ownedBy(userId));
    } catch (error) {
      console.warn("Couldn't remove history from this browser:", error);
    }
    ledger.forget(userId);
    reloadHistory();
    return true;
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
    setAccountOpen(false);
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

  const panelOpen = settingsOpen || guideOpen || libraryOpen || accountOpen;
  const closePanels = () => {
    setAccountOpen(false);
    setSettingsOpen(false);
    setGuideOpen(false);
    closeLibrary();
  };
  const closeTrainer = () => {
    coach.endSession();
    setTrainer(null);
  };
  const showTrainer = Boolean(exercise && trainer && trainer.kind !== "round" && !libraryOpen && view === "practice" && !calibrating);
  const showLearnSummary = Boolean(
    exercise && stats.learn?.done && coach.learn && !libraryOpen && view === "practice" && !calibrating,
  );

  const showResults = Boolean(
    exercise && !trainer && stats.session?.phase === "done" && coach.session && !libraryOpen && view === "practice" && !calibrating,
  );

  /**
   * What the Close (or Cancel) button of the panel in front does, or null
   * when nothing closable is open. Esc and a press outside both run it, so
   * every panel with a Close button closes the same three ways. Between
   * trainer rounds there's only "Stop the trainer", so nothing closes then.
   */
  const closeFront = (): (() => void) | null => {
    if (panelOpen) return closePanels;
    if (calibrating) return () => endCalibration(null);
    if (showTrainer && (trainer?.kind === "setup" || trainer?.kind === "finished")) return closeTrainer;
    if (showResults) return () => coach.endSession();
    if (showLearnSummary) return () => coach.endLearn();
    if (planOpen) return () => setPlanOpen(false);
    return null;
  };

  // A press outside the panel in front closes it. Presses inside a panel are
  // its own, and the buttons that open one (they carry aria-expanded) toggle
  // it themselves.
  useEffect(() => {
    const close = closeFront();
    if (!close) return;
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest(".overlay, .guide, .calibration, .account-menu, [aria-expanded]")) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const close = e.code === "Escape" ? closeFront() : null;
      if (close) {
        close();
        return;
      }
      // On the History page, Esc goes back like its button; no drum or metronome keys there.
      if (view === "history") {
        if (e.code === "Escape") backToPractice();
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

  const toggleAccount = () => {
    const next = !accountOpen;
    closePanels();
    setAccountOpen(next);
  };

  // History is a page of its own, with its own address, so the browser's
  // back button returns to practice. No router: two pages and pushState.
  useEffect(() => {
    const onPop = () => setView(viewOf(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    document.title = view === "history" ? "History · E-drum Practice Coach" : "E-drum Practice Coach";
  }, [view]);

  const openHistory = () => {
    closePanels();
    window.history.pushState({ view: "history" }, "", "/history");
    setView("history");
  };

  const backToPractice = () => {
    // Opened from practice: going back keeps the browser's history tidy.
    const state: unknown = window.history.state;
    if (typeof state === "object" && state !== null && "view" in state && state.view === "history") window.history.back();
    else {
      window.history.pushState(null, "", "/");
      setView("practice");
    }
  };

  // Only one panel is open over the kit view at a time.
  const openGuide = () => {
    closeLibrary();
    setAccountOpen(false);
    setSettingsOpen(false);
    setGuideFirstOpen(!guideSeen);
    setGuideOpen(true);
    setGuideSeen(true);
  };

  const toggleSettings = () => {
    closeLibrary();
    setAccountOpen(false);
    setGuideOpen(false);
    setSettingsOpen((open) => !open);
  };

  /**
   * Starts a play-along session at `bpm` (the current tempo, or a retry's new tempo), after the
   * get-ready countdown unless `countdown` is false (later tempo-trainer rounds: the drummer is at the kit).
   */
  const startSession = async (bpm: number, countdown = true, chosen: Exercise | null = exercise) => {
    if (!chosen || coach.calibrating) return;
    closeLibrary();
    setGuideOpen(false);
    setSettingsOpen(false);
    const settings = await coach.startSession(chosen, sessionLoops, bpm, countdown ? getReadySec : 0);
    setMetronome(settings);
    setRunning(true);
  };

  /** Moves today's plan to block `index`: selects its exercise, ready to start. */
  const goToBlock = (blocks: PlanBlock[], index: number) => {
    const block = blocks[index];
    if (!block) return;
    selectExercise(block.exercise.id);
    setPlan({ blocks, index, blockStart: performance.now() });
  };

  const startPlan = () => {
    setPlanOpen(false);
    goToBlock(practicePlan(history, accuracyMode, DEFAULT_PASS_MARK), 0);
  };

  /** Starts the current block's session: Learn or Play along on the block's exercise. */
  const startBlock = (block: PlanBlock) => {
    if (block.mode === "learn") startLearn();
    else void startSession(metronome.bpm);
  };

  /** Wait mode on the current exercise: no click, the kit view shows the pads to hit and waits for them. */
  const startLearn = () => {
    if (!exercise || coach.calibrating) return;
    closeLibrary();
    setGuideOpen(false);
    setSettingsOpen(false);
    stopPreview();
    coach.startLearn(exercise, sessionLoops);
    setRunning(false);
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
      void startSessionRef.current(nextBpm, false);
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

  // A declaration, so the close rule above can refer to it.
  function endCalibration(offsetMs: number | null) {
    coach.endCalibration();
    setCalibrating(false);
    if (offsetMs !== null) setScoring((s) => ({ ...s, latencyOffsetMs: offsetMs }));
  }

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
    <HandednessContext.Provider value={handedness}>
      <div className={`app ${view === "history" ? "history-view" : ""}`}>
        <header className="topbar">
          <h1>E-drum Practice Coach</h1>
          <div className="topbar-actions">
            <AccountMenu
              account={account}
              signInResult={SIGN_IN_RESULT}
              open={accountOpen}
              syncStatus={syncStatus}
              onToggle={toggleAccount}
              onSignOut={signOut}
              onSignOutAndRemove={signOutAndRemove}
              onDeleteAccount={deleteMyAccount}
            />
            <MidiPanel status={midi} />
          </div>
        </header>

        <main className="stage" hidden={view === "history"}>
          <NotationStrip
            coach={coach}
            exercise={exercise}
            onSelect={selectExercise}
            onBrowse={toggleLibrary}
            libraryOpen={libraryOpen}
            session={sessionView}
            loops={sessionLoops}
            onLoopsChange={setSessionLoops}
            getReadySec={getReadySec}
            onGetReadyChange={setGetReadySec}
            onPlay={() => void startSession(metronome.bpm)}
            onStop={trainer ? stopTrainer : stats.learn && !stats.learn.done ? () => coach.endLearn() : stopSession}
            onLearn={startLearn}
            learn={stats.learn}
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
          <div className="kit-area">
            <canvas ref={canvasRef} className="kit-canvas" aria-label="Live view of the drum kit" />
            {showBigCount && <BigCount coach={coach} ref={bigCountRef} />}
          </div>
          <GetReady coach={coach} />
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
              handedness={handedness}
              onHandednessChange={setHandedness}
              showNextPad={showNextPad}
              onShowNextPadChange={setShowNextPad}
              guideTrack={guideTrack}
              onGuideTrackChange={setGuideTrack}
              showBigCount={showBigCount}
              onShowBigCountChange={setShowBigCount}
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
          {showTrainer && exercise && trainer && trainer.kind !== "round" && (
            <TrainerPanel
              exercise={exercise}
              stage={trainer}
              config={trainerConfig}
              rounds={trainerRounds}
              onStart={startTrainer}
              onStop={stopTrainer}
              onClose={closeTrainer}
            />
          )}
          {planOpen && !plan && (
            <PracticePlanPanel
              blocks={practicePlan(history, accuracyMode, DEFAULT_PASS_MARK)}
              onStart={startPlan}
              onClose={() => setPlanOpen(false)}
            />
          )}
          {showLearnSummary && exercise && coach.learn && (
            <LearnSummary
              exercise={exercise}
              loops={coach.learn.loops}
              wrongHits={coach.learn.wrongHits}
              onPlayAlong={() => void startSession(metronome.bpm)}
              onAgain={startLearn}
              onClose={() => coach.endLearn()}
            />
          )}
          {showResults && exercise && coach.session && (
            <ResultsPanel
              exercise={exercise}
              results={coach.session.results()}
              mode={accuracyMode}
              bpm={coach.session.bpm}
              loops={coach.session.loops}
              record={lastSession}
              onRetry={(change) => void startSession(stepBpm(coach.session?.bpm ?? metronome.bpm, change))}
              onNext={(next) => {
                // Select it (staff, tempo memory), then start it at once: the countdown gives time to get ready.
                selectExercise(next.id);
                void startSession(startingTempo(next, exerciseTempos), true, next);
              }}
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

        <aside className="controls" hidden={view === "history"}>
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
            {plan ? (
              <PracticePlanBanner
                plan={plan}
                now={performance.now()}
                onStartBlock={startBlock}
                onNext={() => goToBlock(plan.blocks, plan.index + 1)}
                onEnd={() => setPlan(null)}
              />
            ) : (
              historyStatus === "ready" && (
                <button
                  className={`secondary plan-button ${planOpen ? "selected" : ""}`}
                  aria-expanded={planOpen}
                  onClick={releasing(() => setPlanOpen((open) => !open))}
                >
                  Today's practice
                </button>
              )
            )}
            {historyStatus !== "loading" && (
              <div className="practice-line">
                <span>{historyStatus === "off" ? "History is off in this browser" : practiceSummary}</span>
                <button className="secondary history-button" onClick={releasing(openHistory)}>
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

          {/* The keys, while no kit is playing. */}
          {!(midi.state === "ready" && midi.selectedId) && <KeyboardHint />}
        </aside>

        {view === "history" && (
          <main className="history-view-main">
            <HistoryPage
              records={history}
              status={historyStatus}
              accuracyMode={accuracyMode}
              selectedExerciseId={exerciseId}
              onClear={clearHistory}
              onBack={backToPractice}
              signedIn={account.status === "signed-in"}
              insights={account.status === "signed-in" && account.insights}
            />
          </main>
        )}
      </div>
    </HandednessContext.Provider>
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

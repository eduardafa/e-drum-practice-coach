import { useEffect, useState } from "react";
import type { CalibrationProgress } from "./live/calibration";
import type { Coach } from "./live/coach";
import { SKILL_PROFILES, type SkillLevel } from "./profiles";
import { formatDelta } from "./render/kitRenderer";
import type { CalibrationResult } from "./timing/calibration";

interface Props {
  coach: Coach;
  level: SkillLevel;
  currentOffsetMs: number;
  onRetry: () => void;
  /** Called with the offset to apply, or null to keep the current one. */
  onClose: (offsetMs: number | null) => void;
}

/** Polls the run a few times a second; the count-in needs to feel responsive. */
function useProgress(coach: Coach): CalibrationProgress | null {
  const [progress, setProgress] = useState(() => coach.calibrationProgress(performance.now()));
  useEffect(() => {
    const id = setInterval(() => setProgress(coach.calibrationProgress(performance.now())), 60);
    return () => clearInterval(id);
  }, [coach]);
  return progress;
}

export function CalibrationPanel({ coach, level, currentOffsetMs, onRetry, onClose }: Props) {
  const progress = useProgress(coach);
  const profile = SKILL_PROFILES[level];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") onClose(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <section className="calibration" aria-labelledby="calibration-title">
      <h2 id="calibration-title">Latency calibration</h2>
      <p className="calibration-meta">
        {profile.label} · {profile.calibration.bpm} BPM · target ±{profile.calibration.targetUncertaintyMs} ms
      </p>
      {progress?.phase === "done" ? (
        <Result
          result={progress.result}
          level={level}
          currentOffsetMs={currentOffsetMs}
          onRetry={onRetry}
          onClose={onClose}
        />
      ) : (
        <>
          <p>
            Hit any pad on each click, as steadily as you can, after the four count-in clicks. Keep going
            until the measurement is precise enough. Steadier playing finishes sooner.
          </p>
          {progress?.phase === "listening" ? (
            <Listening progress={progress} />
          ) : (
            <p className="calibration-count" aria-live="polite">
              {progress?.phase === "countIn" && progress.beat > 0 ? progress.beat : "Listen…"}
            </p>
          )}
          <p className="hint">
            Using the laptop keyboard? It's less precise than the kit, so expect a longer run. Your own tempo
            and settings come back when calibration ends.
          </p>
          <div className="calibration-actions">
            <button className="secondary" onClick={() => onClose(null)}>
              Cancel <kbd>Esc</kbd>
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function Listening({ progress }: { progress: Extract<CalibrationProgress, { phase: "listening" }> }) {
  const { clicksHeard, maxClicks, hits, uncertaintyMs, targetUncertaintyMs } = progress;
  // Precision meter: full when the uncertainty reaches the target.
  const precision = uncertaintyMs === null ? 0 : Math.min(1, targetUncertaintyMs / uncertaintyMs);
  return (
    <div className="calibration-progress">
      <meter className="meter" aria-label="Measurement precision" min={0} max={1} value={precision} />
      <dl className="stats">
        <dt>Precision</dt>
        <dd>
          {uncertaintyMs === null ? "measuring…" : `±${uncertaintyMs.toFixed(1)} ms`} (target ±{targetUncertaintyMs} ms)
        </dd>
        <dt>Hits counted</dt>
        <dd>{hits}</dd>
        <dt>Click</dt>
        <dd>
          {clicksHeard} of up to {maxClicks}
        </dd>
      </dl>
    </div>
  );
}

function Result({
  result,
  level,
  currentOffsetMs,
  onRetry,
  onClose,
}: { result: CalibrationResult } & Omit<Props, "coach">) {
  if (!result.ok) {
    return (
      <>
        <p className="calibration-headline warn">{failureMessage(result)}</p>
        <div className="calibration-actions">
          <button className="primary" onClick={onRetry}>
            Try again
          </button>
          <button className="secondary" onClick={() => onClose(null)}>
            Cancel
          </button>
        </div>
      </>
    );
  }

  const { offsetMs, spreadMs, uncertaintyMs, confident, used, rejected } = result;
  const amount =
    offsetMs === 0
      ? "no measurable delay"
      : offsetMs > 0
        ? `${confident ? "" : "about "}${offsetMs} ms`
        : `${confident ? "" : "about "}${-offsetMs} ms early`;
  return (
    <>
      <p className="calibration-headline">
        {offsetMs < 0 ? `Your hits register ${amount}` : `Your setup adds ${amount}`} (±{uncertaintyMs.toFixed(0)} ms).
      </p>
      {confident ? null : (
        <p className="calibration-note">
          Your hits varied by ±{spreadMs.toFixed(0)} ms, so the run reached its {SKILL_PROFILES[level].label} limit
          before the measurement got to ±{SKILL_PROFILES[level].calibration.targetUncertaintyMs} ms. It's still a good
          starting point. Calibrate again as your playing gets steadier.
        </p>
      )}
      <dl className="stats">
        <dt>Your consistency</dt>
        <dd>±{spreadMs.toFixed(0)} ms</dd>
        <dt>Hits used</dt>
        <dd>
          {used} of {used + rejected}
        </dd>
        <dt>Current offset</dt>
        <dd>{formatDelta(currentOffsetMs)}</dd>
      </dl>
      <div className="calibration-actions">
        <button className="primary" onClick={() => onClose(offsetMs)}>
          {confident ? "Use" : "Use anyway:"} {formatDelta(offsetMs)}
        </button>
        <button className="secondary" onClick={onRetry}>
          Try again
        </button>
        <button className="secondary" onClick={() => onClose(null)}>
          Cancel
        </button>
      </div>
    </>
  );
}

function failureMessage(result: Extract<CalibrationResult, { ok: false }>): string {
  switch (result.reason) {
    case "tooFewHits":
      return `Only ${result.used} hits could be measured. Hit a pad on every click and try again.`;
    case "outOfRange":
      return `The measured delay (${formatDelta(result.offsetMs ?? 0)}) is unusually large. Check that the kit is connected over USB, not Bluetooth audio, and try again.`;
  }
}

import { useEffect, useState } from "react";
import type { CalibrationProgress } from "./live/calibration";
import type { Coach } from "./live/coach";
import { formatDelta } from "./render/kitRenderer";
import type { CalibrationResult } from "./timing/calibration";

interface Props {
  coach: Coach;
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

export function CalibrationPanel({ coach, currentOffsetMs, onRetry, onClose }: Props) {
  const progress = useProgress(coach);

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
      {progress?.phase === "done" ? (
        <Result
          result={progress.result}
          currentOffsetMs={currentOffsetMs}
          onRetry={onRetry}
          onClose={onClose}
        />
      ) : (
        <>
          <p>
            Hit any pad exactly on each click, as steadily as you can. Start playing after the four
            count-in clicks.
          </p>
          {progress?.phase === "listening" ? (
            <ol className="calibration-clicks" aria-label="Clicks">
              {progress.hits.map((hit, i) => (
                <li
                  // oxlint-disable-next-line react/no-array-index-key -- fixed-length, never reordered
                  key={i}
                  className={hit ? "hit" : i < progress.clicksHeard ? "missed" : ""}
                />
              ))}
            </ol>
          ) : (
            <p className="calibration-count" aria-live="polite">
              {progress?.phase === "countIn" && progress.beat > 0 ? progress.beat : "Listen…"}
            </p>
          )}
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

function Result({
  result,
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

  const { offsetMs, spreadMs, used, rejected } = result;
  return (
    <>
      <p className="calibration-headline">
        {offsetMs === 0
          ? "Your setup adds no measurable delay."
          : offsetMs > 0
            ? `Your setup adds ${offsetMs} ms.`
            : `Your hits register ${-offsetMs} ms early.`}
      </p>
      <dl className="stats">
        <dt>Your consistency</dt>
        <dd>±{spreadMs.toFixed(1)} ms</dd>
        <dt>Hits used</dt>
        <dd>
          {used} of {used + rejected}
        </dd>
        <dt>Current offset</dt>
        <dd>{formatDelta(currentOffsetMs)}</dd>
      </dl>
      <div className="calibration-actions">
        <button className="primary" onClick={() => onClose(offsetMs)}>
          Use {formatDelta(offsetMs)}
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
    case "tooSpread":
      return `Your hits varied by ±${(result.spreadMs ?? 0).toFixed(0)} ms, too much to measure the delay. Try again, playing as steadily as you can.`;
    case "outOfRange":
      return `The measured delay (${formatDelta(result.offsetMs ?? 0)}) is unusually large. Check that the kit is connected over USB, not Bluetooth audio, and try again.`;
  }
}

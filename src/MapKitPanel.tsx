import { MAPPING_TARGETS, targetLabel, type CaptureResult, type KitMapping } from "./kit/kitMap";
import { NITRO_MAX_PADS, type PadId } from "./kit/nitroMax";
import { releasing } from "./releasing";

function padLabel(pad: PadId): string {
  return NITRO_MAX_PADS.find((p) => p.id === pad)?.label ?? pad;
}

function feedbackText(feedback: CaptureResult | null): string | null {
  if (!feedback) return null;
  if (feedback.kind === "captured") return `Got it: ${targetLabel(feedback.target, padLabel(feedback.target.pad))}.`;
  if (feedback.kind === "duplicate") {
    return `That note is already the ${targetLabel(feedback.existing, padLabel(feedback.existing.pad)).toLowerCase()}. Hit the pad asked for, or skip.`;
  }
  return null;
}

/**
 * "Map your kit": one pad at a time, lit on the kit view, the drummer hits it
 * and the note it sends is recorded. Extra zones (rims, edges, the bell) can
 * be skipped; skipped ones keep the standard note.
 */
export function MapKitPanel({
  mapping,
  feedback,
  deviceName,
  onSkip,
  onSave,
  onRestart,
  onCancel,
}: {
  mapping: KitMapping;
  feedback: CaptureResult | null;
  deviceName: string;
  onSkip: () => void;
  onSave: () => void;
  onRestart: () => void;
  onCancel: () => void;
}) {
  const target = mapping.current;
  const recorded = Object.keys(mapping.result()).length;
  const message = feedbackText(feedback);

  return (
    <section className="calibration map-kit" aria-labelledby="map-kit-title">
      <h2 id="map-kit-title">Map your kit · {deviceName}</h2>
      {target ? (
        <>
          <p className="calibration-meta">
            {mapping.progress.at} of {mapping.progress.of}
            {target.optional ? " · optional" : ""}
          </p>
          <p className="map-kit-prompt">{target.prompt}</p>
          <p className="hint">The pad to hit glows on the kit below.</p>
          {message && (
            <output className={`map-kit-feedback ${feedback?.kind === "duplicate" ? "warn" : ""}`}>{message}</output>
          )}
          <div className="calibration-actions">
            <button className={target.optional ? "primary" : "secondary"} onClick={releasing(onSkip)}>
              {target.optional ? "Skip (my pad doesn't have this)" : "Skip"}
            </button>
            <button className="secondary" onClick={releasing(onCancel)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="results-score">
            {recorded} of {MAPPING_TARGETS.length}
          </p>
          <p className="calibration-meta">
            pads and zones recorded. Anything skipped keeps the standard note. Saved for this kit in this browser.
          </p>
          <div className="calibration-actions">
            <button className="primary" onClick={releasing(onSave)} disabled={recorded === 0}>
              Save
            </button>
            <button className="secondary" onClick={releasing(onRestart)}>
              Start over
            </button>
            <button className="secondary" onClick={releasing(onCancel)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  );
}

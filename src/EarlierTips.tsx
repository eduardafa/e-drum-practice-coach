import { useState } from "react";
import type { EarlierInsight } from "./account/insights";
import { writtenWhen } from "./history/writtenWhen";
import { InsightTipList } from "./InsightTipList";
import { releasing } from "./releasing";

interface Props {
  earlier: readonly EarlierInsight[];
  /** Resolves once the server has deleted it; rejects with a message to show. */
  onDelete: (id: number) => Promise<void>;
}

/**
 * Earlier sets of Coach's notes tips (EDU-112), newest first. Each is a
 * <details>: closed it shows when, who and the headline; open it shows the
 * tips and a Delete button that asks first.
 */
export function EarlierTips({ earlier, onDelete }: Props) {
  if (earlier.length === 0) return null;
  const now = Temporal.Now.zonedDateTimeISO();
  return (
    <section className="insights-earlier" aria-labelledby="insights-earlier-title">
      <h4 id="insights-earlier-title" className="insights-earlier-title">
        Earlier tips <span className="insights-earlier-count">{earlier.length}</span>
      </h4>
      <ul className="insights-earlier-list">
        {earlier.map((e) => (
          <EarlierSet key={e.id} set={e} when={writtenWhen(e.createdAt, now)} onDelete={onDelete} />
        ))}
      </ul>
    </section>
  );
}

function EarlierSet({ set, when, onDelete }: { set: EarlierInsight; when: string | null; onDelete: Props["onDelete"] }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onDelete(set.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the tips just now.");
      setDeleting(false);
      setConfirming(false);
    }
  };
  return (
    <li>
      <details className="insights-earlier-set">
        <summary>
          <span className="insights-earlier-when">{[when, set.model].filter(Boolean).join(" · ")}</span>
          <span className="insights-earlier-headline">{set.insight.headline}</span>
        </summary>
        <div className="insights-earlier-body">
          <InsightTipList tips={set.insight.tips} />
          <p className="insights-encouragement">{set.insight.encouragement}</p>
          {error && <p className="hint warn-note">{error}</p>}
          <div className="insights-delete">
            {confirming ? (
              <>
                <span>Delete these tips? This can't be undone.</span>
                <button className="primary danger" disabled={deleting} onClick={releasing(() => void remove())}>
                  {deleting ? "Deleting" : "Delete"}
                </button>
                <button className="secondary" disabled={deleting} onClick={releasing(() => setConfirming(false))}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="secondary" onClick={releasing(() => setConfirming(true))}>
                Delete these tips
              </button>
            )}
          </div>
        </div>
      </details>
    </li>
  );
}

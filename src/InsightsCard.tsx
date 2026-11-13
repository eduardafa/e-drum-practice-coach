import { useEffect, useState } from "react";
import { InsightUnavailable, latestInsight, requestInsight, type InsightReply } from "./account/insights";
import { insightSummary } from "./history/insightSummary";
import type { HistoryRecord } from "./history/record";
import type { AccuracyMode } from "./playalong/results";
import { releasing } from "./releasing";

interface Props {
  records: readonly HistoryRecord[];
  accuracyMode: AccuracyMode;
}

/**
 * Coaching tips written by Claude from the practice summary (EDU-53). Only
 * rendered for allow-listed accounts. Shows the latest tips on arrival and
 * asks for new ones only when the drummer presses the button.
 */
export function InsightsCard({ records, accuracyMode }: Props) {
  const [reply, setReply] = useState<InsightReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    latestInsight().then(
      (r) => live && setReply(r),
      () => {}, // no tips yet, or offline: the button still works
    );
    return () => {
      live = false;
    };
  }, []);

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      setReply(await requestInsight(insightSummary(records, Temporal.Now.plainDateISO(), accuracyMode)));
    } catch (e) {
      setError(e instanceof InsightUnavailable ? e.message : "Couldn't get tips just now. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const insight = reply?.insight;
  const left = reply?.remainingToday;
  return (
    <section className="insights" aria-labelledby="insights-title" aria-busy={busy}>
      <div className="insights-head">
        <h3 id="insights-title">Coach's notes</h3>
        <button className="secondary" disabled={busy || left === 0} onClick={releasing(() => void ask())}>
          {busy ? "Thinking…" : insight ? "New tips" : "Get coaching tips"}
        </button>
      </div>
      {error && <p className="hint warn-note">{error}</p>}
      {!insight && !busy && !error && (
        <p className="hint">Tips on what to practice next, written from your last 30 days of practice.</p>
      )}
      {insight && (
        <>
          <p className="insights-headline">{insight.headline}</p>
          <ol className="insights-tips">
            {insight.tips.map((t) => (
              <li key={t.title}>
                <strong>{t.title}</strong> {t.detail}
              </li>
            ))}
          </ol>
          <p className="insights-encouragement">{insight.encouragement}</p>
        </>
      )}
      <p className="hint">
        Written by Claude from your practice numbers only (no names or raw hits).
        {left !== undefined && ` ${left} of 5 left today.`} <a href="/privacy">Privacy</a>
      </p>
    </section>
  );
}

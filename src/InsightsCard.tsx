import { useEffect, useState } from "react";
import {
  InsightUnavailable,
  deleteInsights,
  latestInsight,
  requestInsight,
  saveModel,
  savedModel,
  type AiModelOption,
  type EarlierInsight,
  type InsightReply,
} from "./account/insights";
import { insightSummary } from "./history/insightSummary";
import type { HistoryRecord } from "./history/record";
import type { AccuracyMode } from "./playalong/results";
import { releasing } from "./releasing";
import { useHandedness } from "./HandednessContext";
import { SparkleIcon } from "./SparkleIcon";
import { writtenWhen } from "./history/writtenWhen";
import { EarlierTips } from "./EarlierTips";
import { InsightTipList } from "./InsightTipList";

interface Props {
  records: readonly HistoryRecord[];
  accuracyMode: AccuracyMode;
}

const PROVIDER_LABEL = { anthropic: "Claude", openai: "OpenAI" } as const;

/** Shared, so an empty list is the same array on every render. */
const NO_EARLIER: readonly EarlierInsight[] = [];

/** "about $0.001" below a cent, "about $0.04" above. */
const cost = (dollars: number) => "about $" + dollars.toFixed(dollars < 0.01 ? 3 : 2);

/**
 * Coaching tips written by AI from the practice summary (EDU-53), with the
 * provider and model chosen here (EDU-57; the cheapest is the default, and
 * the choice is remembered in this browser). Only rendered for allow-listed
 * accounts. Shows the latest tips on arrival and asks for new ones only when
 * the drummer presses the button.
 */
export function InsightsCard({ records, accuracyMode }: Props) {
  const handedness = useHandedness();
  const [reply, setReply] = useState<InsightReply | null>(null);
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [chosen, setChosen] = useState<string | null>(savedModel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const r = await latestInsight();
        if (!live) return;
        setReply(r);
        setModels(r.models ?? []);
      } catch {
        // No tips yet, or offline: the card still shows, without the model choice.
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, []);

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!model) return;
      const fresh = await requestInsight(insightSummary(records, Temporal.Now.plainDateISO(), accuracyMode, handedness), model.id);
      // Read the list again so the set that was showing moves into Earlier tips.
      // If that fails, show the new tips and keep the list as it was.
      try {
        setReply(await latestInsight());
      } catch {
        setReply((prev) => ({ ...fresh, earlier: prev?.earlier ?? null }));
      }
    } catch (e) {
      setError(e instanceof InsightUnavailable ? e.message : "Couldn't get tips just now. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const deleteOne = async (id: number) => {
    await deleteInsights(id);
    setReply((prev) => (prev ? { ...prev, earlier: (prev.earlier ?? []).filter((e) => e.id !== id) } : prev));
  };

  const deleteAll = async () => {
    setConfirmingClear(false);
    setError(null);
    try {
      await deleteInsights("all");
      setReply((prev) => (prev ? { ...prev, insight: null, createdAt: null, model: null, earlier: [] } : prev));
    } catch (e) {
      setError(e instanceof InsightUnavailable ? e.message : "Couldn't delete the tips just now.");
    }
  };

  // The saved choice if it's still offered, else the cheapest (first) model.
  const model = models.find((m) => m.id === chosen) ?? models[0] ?? null;
  const providers = [...new Set(models.map((m) => m.provider))];
  const choose = (id: string) => {
    setChosen(id);
    saveModel(id);
  };
  const insight = reply?.insight;
  const earlier = reply?.earlier ?? NO_EARLIER;
  const hasTips = Boolean(insight) || earlier.length > 0;
  const left = reply?.remainingToday;
  const when = reply?.createdAt ? writtenWhen(reply.createdAt, Temporal.Now.zonedDateTimeISO()) : null;
  // Who wrote the tips on screen, and when; while busy, who's writing; before any tips, what the card is for.
  const byline =
    busy && model
      ? `Writing new tips with ${model.label}`
      : insight && reply?.model
        ? [reply.model, when].filter(Boolean).join(" · ")
        : "Tips on what to practice next, from your last 30 days";
  return (
    <section className="insights" aria-labelledby="insights-title" aria-busy={busy}>
      <header className="insights-head">
        <span className="insights-badge" aria-hidden="true">
          <SparkleIcon />
        </span>
        <div className="insights-title">
          <h3 id="insights-title">Coach's notes</h3>
          <p className="insights-byline">{byline}</p>
        </div>
        {busy ? (
          // Not a button while busy: a status line (<output> is announced, like role=status), with dots that pulse.
          <output className="insights-thinking">
            <SparkleIcon />
            Thinking
            <span className="thinking-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </output>
        ) : (
          <button
            className="secondary insights-ask"
            disabled={left === 0 || !model}
            onClick={releasing(() => void ask())}
          >
            <SparkleIcon />
            {insight ? "New tips" : "Get coaching tips"}
          </button>
        )}
      </header>

      {error && <p className="hint warn-note">{error}</p>}
      {busy ? (
        // Where the tips will appear: a headline and two tips, as shimmering lines.
        <div className="insights-placeholder" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : (
        insight && (
          <div className="insights-body">
            <p className="insights-headline">{insight.headline}</p>
            <InsightTipList tips={insight.tips} />
            <p className="insights-encouragement">{insight.encouragement}</p>
          </div>
        )
      )}

      {!busy && <EarlierTips earlier={earlier} onDelete={deleteOne} />}

      {/* Settings and fine print, after the content. */}
      <footer className="insights-foot">
        {model && (
          <div className="insights-model">
            {providers.length > 1 && (
              <label className="field">
                <span>Provider</span>
                <select
                  value={model.provider}
                  onChange={(e) => {
                    const first = models.find((m) => m.provider === e.target.value);
                    if (first) choose(first.id);
                  }}
                >
                  {providers.map((p) => (
                    <option key={p} value={p}>
                      {PROVIDER_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>Model</span>
              <select value={model.id} onChange={(e) => choose(e.target.value)}>
                {models
                  .filter((m) => m.provider === model.provider)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({cost(m.approxCostPerTip)} per tip)
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}
        <p className="hint">
          Written by AI from your practice numbers only (no names or raw hits).
          {left !== undefined && ` ${left} of 5 left today.`} <a href="/privacy">Privacy</a>
        </p>
        {hasTips && !busy && (
          <div className="insights-delete">
            {confirmingClear ? (
              <>
                <span>Delete all your tips, these and earlier ones? This can't be undone.</span>
                <button className="primary danger" onClick={releasing(() => void deleteAll())}>
                  Delete all
                </button>
                <button className="secondary" onClick={releasing(() => setConfirmingClear(false))}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="secondary" onClick={releasing(() => setConfirmingClear(true))}>
                Delete all tips
              </button>
            )}
          </div>
        )}
      </footer>
    </section>
  );
}

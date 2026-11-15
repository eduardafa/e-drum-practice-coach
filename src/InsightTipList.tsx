import type { Insight } from "./account/insights";

/** One tip per row: a number, its title on its own line, the detail under it (EDU-119). */
export function InsightTipList({ tips }: { tips: Insight["tips"] }) {
  return (
    <ol className="insights-tips">
      {tips.map((t, i) => (
        <li key={t.title}>
          <span className="insights-tip-number" aria-hidden="true">
            {i + 1}
          </span>
          <div>
            <strong className="insights-tip-title">{t.title}</strong>
            <p className="insights-tip-detail">{t.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

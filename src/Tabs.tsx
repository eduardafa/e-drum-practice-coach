import { useRef, type KeyboardEvent } from "react";

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

/** The id of the panel a tab controls, for the panel's own `id`. */
export const tabPanelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;
/** The id of a tab, for its panel's `aria-labelledby`. */
export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;

/**
 * A row of tabs (Settings, the exercise library): the selected one underlined.
 * Tabs as screen readers expect: only the selected tab is in the Tab order,
 * arrows move between tabs (and show the new one), Home and End jump to the
 * ends. Arrow keys aren't drum keys, so this never gets in the way of playing.
 */
export function Tabs<T extends string>({
  tabs,
  selected,
  onSelect,
  label,
  idPrefix,
}: {
  tabs: readonly TabItem<T>[];
  selected: T;
  onSelect: (id: T) => void;
  label: string;
  /** Prefix for the tab and panel ids (see tabId and tabPanelId). */
  idPrefix: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const next =
      e.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onSelect(target.id);
    refs.current[next]?.focus();
  };

  return (
    <div className="tab-list" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          id={tabId(idPrefix, t.id)}
          role="tab"
          aria-selected={selected === t.id}
          aria-controls={tabPanelId(idPrefix, t.id)}
          tabIndex={selected === t.id ? 0 : -1}
          className={selected === t.id ? "selected" : ""}
          onClick={() => onSelect(t.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

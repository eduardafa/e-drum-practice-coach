/**
 * An on/off option, drawn as a small switch with its label: for settings like
 * "Hear the tab", which are states, not actions (actions stay buttons). A
 * native checkbox with role="switch", so Space toggles it and screen readers
 * read "on" or "off". It lets go of the focus after a change, so the drum keys
 * (Space is the kick) keep working.
 */
export function Switch({
  checked,
  onChange,
  label,
  title,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  title?: string;
}) {
  return (
    <label className="switch" title={title}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        aria-checked={checked}
        onChange={(e) => {
          e.currentTarget.blur();
          onChange(e.target.checked);
        }}
      />
      <span className="switch-track" aria-hidden />
      <span>{label}</span>
    </label>
  );
}

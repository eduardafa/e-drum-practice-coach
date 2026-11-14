export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  /** Shown on hover. */
  title?: string;
}

/**
 * A choice of one value from a few (Notation / Lanes, System / Light / Dark):
 * radio buttons drawn as one segmented control, the chosen one filled. For a
 * setting or a way of showing the same thing; switching between different
 * content is a job for Tabs.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  name,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** What the choice is about, for screen readers. */
  label: string;
  /** The radio group's name: unique on the page. */
  name: string;
}) {
  return (
    <fieldset className="segmented" aria-label={label}>
      <legend className="visually-hidden">{label}</legend>
      {options.map((option) => (
        <label key={option.id} title={option.title}>
          <input
            type="radio"
            name={name}
            value={option.id}
            checked={value === option.id}
            onChange={(e) => {
              // Space is the kick key: don't leave focus on the control.
              e.currentTarget.blur();
              onChange(option.id);
            }}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

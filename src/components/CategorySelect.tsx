import { CATEGORIES, type Category } from "../lib/types";

// Single-select category. Three options shown as rows (not a dropdown — only three,
// and the labels are long). Clicking the selected row clears it; "unset" is a valid
// resting state. Selected = raised background + an accent dot (the Timeline idiom).

interface CategorySelectProps {
  value?: Category;
  onChange: (next: Category | undefined) => void;
}

export function CategorySelect({ value, onChange }: CategorySelectProps) {
  return (
    <div className="space-y-0.5">
      {CATEGORIES.map((c) => {
        const selected = c === value;
        return (
          <button
            key={c}
            onClick={() => onChange(selected ? undefined : c)}
            aria-pressed={selected}
            className={
              "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm " +
              (selected
                ? "bg-surface-raised text-text"
                : "text-text-muted hover:bg-surface-raised hover:text-text")
            }
          >
            <span>{c}</span>
            {selected && <span className="text-accent">●</span>}
          </button>
        );
      })}
    </div>
  );
}

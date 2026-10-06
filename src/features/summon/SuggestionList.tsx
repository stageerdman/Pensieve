import type { Suggestion } from "../../lib/search/grammar";

// The dropdown under the summon bar: either tag-whispers (while typing a "#…" token) or
// the structured filter suggestions parsed from the text, plus a hint for the live
// free-text search. Purely presentational — navigation/activation live in Summon.

export type Row =
  | { kind: "tag"; tag: string }
  | { kind: "suggestion"; s: Suggestion };

const HINT_LABEL: Record<string, string> = {
  date: "date",
  tag: "tag",
  tags: "tags",
  category: "category",
  flag: "flag",
};

export function isCategoryRow(row: Row): boolean {
  return row.kind === "suggestion" && row.s.filter.kind === "category";
}

interface Props {
  rows: Row[];
  highlight: number;
  liveText: string;
  whispering: boolean;
  onActivate: (i: number) => void;
  onHover: (i: number) => void;
}

export function SuggestionList({ rows, highlight, liveText, whispering, onActivate, onHover }: Props) {
  if (rows.length === 0 && !liveText) return null;

  return (
    <div
      className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-border bg-surface-raised shadow-xl"
      role="listbox"
    >
      {whispering && rows.length === 0 && (
        <div className="px-3 py-2 text-[13px] text-text-muted">No tags match — keep typing, or add a space for a literal “#”.</div>
      )}

      {rows.map((row, i) => {
        const active = i === highlight;
        const isCat = isCategoryRow(row);
        return (
          <button
            key={row.kind === "tag" ? "t:" + row.tag : "s:" + row.s.key}
            type="button"
            role="option"
            aria-selected={active}
            onMouseEnter={() => onHover(i)}
            onMouseDown={(e) => {
              e.preventDefault(); // keep input focused
              onActivate(i);
            }}
            className={
              "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] " +
              (active ? "bg-accent/15 text-text" : "text-text-muted hover:text-text")
            }
          >
            {row.kind === "tag" ? (
              <>
                <span className="text-text">{row.tag}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-text-muted/70">tag</span>
              </>
            ) : (
              <>
                <span className="text-text">{row.s.label}</span>
                <span className="ml-auto flex items-center gap-2">
                  {isCat && (
                    <span className="rounded border border-border px-1 text-[10px] text-text-muted">Tab</span>
                  )}
                  <span className="text-[10px] uppercase tracking-wider text-text-muted/70">
                    {HINT_LABEL[row.s.hint] ?? row.s.hint}
                  </span>
                </span>
              </>
            )}
          </button>
        );
      })}

      {liveText && (
        <div className="border-t border-border px-3 py-2 text-[12px] text-text-muted">
          <span className="text-text-muted/70">Search text</span> · “{liveText}”
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { X } from "./icons";

// Tags as removable chips plus an inline input that *whispers* — as you type it
// suggests tags already used elsewhere (from `suggestions`). Commit on Enter or
// comma (creating a new tag if none matches), click a suggestion to add it,
// Backspace on an empty input removes the last chip. Suggestions come from the
// live set of tags in use, so a tag no longer used anywhere stops being whispered.

interface TagEditorProps {
  tags: string[];
  suggestions: string[];
  onChange: (next: string[]) => void;
}

export function TagEditor({ tags, suggestions, onChange }: TagEditorProps) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, "").trim();
    setDraft("");
    if (t && !tags.includes(t)) onChange([...tags, t]);
  };

  const remove = (t: string) => onChange(tags.filter((x) => x !== t));

  const q = draft.trim().toLowerCase();
  const whispers = q
    ? suggestions
        .filter((s) => !tags.includes(s) && s.toLowerCase().includes(q) && s.toLowerCase() !== q)
        .slice(0, 6)
    : [];

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="group inline-flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-xs text-text"
          >
            {t}
            <button
              onClick={() => remove(t)}
              aria-label={`Remove tag ${t}`}
              className="text-text-muted hover:text-text"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && tags.length) {
              remove(tags[tags.length - 1]);
            }
          }}
          placeholder="Add a tag"
          autoComplete="off"
          spellCheck={false}
          className="min-w-[80px] flex-1 bg-transparent py-0.5 text-sm text-text placeholder:text-text-muted focus:outline-none"
        />
      </div>

      {whispers.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
          {whispers.map((s) => (
            <button
              key={s}
              onMouseDown={(e) => {
                e.preventDefault(); // keep input focus
                add(s);
              }}
              className="block w-full truncate rounded px-2 py-1 text-left text-sm text-text-muted hover:bg-surface hover:text-text"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

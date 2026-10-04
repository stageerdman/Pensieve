import { useState } from "react";
import { X } from "./icons";

// Tags as removable chips plus a borderless inline input. Commit on Enter or comma;
// Backspace on an empty input removes the last chip. The placeholder is the whole
// empty state — no "no tags yet" line.

interface TagEditorProps {
  tags: string[];
  onChange: (next: string[]) => void;
}

export function TagEditor({ tags, onChange }: TagEditorProps) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, "").trim();
    setDraft("");
    if (t && !tags.includes(t)) onChange([...tags, t]);
  };

  const remove = (t: string) => onChange(tags.filter((x) => x !== t));

  return (
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
  );
}

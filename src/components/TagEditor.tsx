import { useRef, useState } from "react";
import { X } from "./icons";
import { canonicalTag, cleanTag, whisper, type TagSuggestion } from "../lib/tags/vocab";

// A note's tags — its THREADS (see lib/tags/vocab: a tag is a promise to retrieve, not
// a description). Chips plus an inline input that *whispers* the vocabulary: on focus
// it offers the top threads (with their one-line meaning), typing narrows it, ↑/↓ +
// Enter picks. Typing a case-variant of a known tag reuses the existing spelling, so
// near-duplicates never form; a genuinely new name becomes a new thread (onCreate).
// Backspace on an empty input removes the last chip.
//
// "field" = the bordered-less block layout; "inline" = sits on the flask row above the
// editor, its input invisible until the row is hovered/focused when the note has no tags.

interface TagEditorProps {
  tags: string[];
  suggestions: TagSuggestion[];
  onChange: (next: string[]) => void;
  /** Called when a tag not in the vocabulary is added — it becomes a new thread. */
  onCreate?: (name: string) => void;
  variant?: "field" | "inline";
}

export function TagEditor({ tags, suggestions, onChange, onCreate, variant = "field" }: TagEditorProps) {
  const inline = variant === "inline";
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (raw: string) => {
    const typed = cleanTag(raw);
    setDraft("");
    setHi(0);
    if (!typed) return;
    const known = canonicalTag(typed, suggestions.map((s) => s.name));
    const name = known ?? typed;
    if (canonicalTag(name, tags)) return; // already on the note
    if (!known) onCreate?.(name);
    onChange([...tags, name]);
  };

  const remove = (t: string) => onChange(tags.filter((x) => x !== t));

  const whispers = focused ? whisper(suggestions, draft, tags, draft ? 6 : 8) : [];
  // A typed name that isn't a known tag gets an explicit last row — new threads are a
  // deliberate act, never a side effect of pressing Enter on a half-typed word.
  const typed = cleanTag(draft);
  const createRow = focused && typed && !canonicalTag(typed, suggestions.map((s) => s.name)) ? typed : null;
  const options = [...whispers.map((w) => w.name), ...(createRow ? [createRow] : [])];
  const hiClamped = Math.min(hi, Math.max(0, options.length - 1));

  const hidden = inline && !tags.length && !focused && !draft;

  return (
    <div className={inline ? "relative min-w-0" : "relative"}>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="group/tag inline-flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-xs text-text"
          >
            {t}
            <button
              onClick={() => remove(t)}
              aria-label={`Remove tag ${t}`}
              className={
                "text-text-muted hover:text-text " +
                (inline ? "opacity-0 focus-visible:opacity-100 group-hover/tag:opacity-100" : "")
              }
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          aria-label="Add a tag"
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setHi(0);
          }}
          onChange={(e) => {
            const v = e.target.value;
            setHi(0);
            if (v.endsWith(",")) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && options.length) {
              e.preventDefault();
              setHi((h) => (h + 1) % options.length);
            } else if (e.key === "ArrowUp" && options.length) {
              e.preventDefault();
              setHi((h) => (h - 1 + options.length) % options.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              // Enter takes the highlighted row: a known thread, or the "new" row.
              const pick = options[hiClamped];
              if (pick) add(pick);
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setDraft("");
              inputRef.current?.blur();
            } else if (e.key === "Backspace" && !draft && tags.length) {
              remove(tags[tags.length - 1]);
            }
          }}
          placeholder={inline ? (tags.length ? "＋" : "Add tag") : "Add a tag"}
          autoComplete="off"
          spellCheck={false}
          className={
            inline
              ? "w-20 bg-transparent px-1 py-0.5 text-xs text-text placeholder:text-text-muted focus:w-40 focus:outline-none " +
                (hidden ? "opacity-0 group-hover/noterow:opacity-100 focus:opacity-100" : "")
              : "min-w-[80px] flex-1 bg-transparent py-0.5 text-sm text-text placeholder:text-text-muted focus:outline-none"
          }
        />
      </div>

      {options.length > 0 && (
        <div
          role="listbox"
          aria-label="Tag suggestions"
          className={
            (inline ? "w-72 " : "left-0 right-0 ") +
            "absolute left-0 top-full z-20 mt-1 rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
          }
        >
          {whispers.map((s, i) => (
            <button
              key={s.name}
              role="option"
              aria-selected={i === hiClamped}
              onMouseDown={(e) => {
                e.preventDefault(); // keep input focus
                add(s.name);
              }}
              onMouseEnter={() => setHi(i)}
              className={
                "block w-full rounded px-2 py-1 text-left text-sm " +
                (i === hiClamped ? "bg-surface text-text" : "text-text-muted")
              }
            >
              <span className="block truncate">{s.name}</span>
              {s.definition && <span className="block truncate text-xs text-text-muted/70">{s.definition}</span>}
            </button>
          ))}
          {createRow && (
            <button
              role="option"
              aria-selected={hiClamped === whispers.length}
              onMouseDown={(e) => {
                e.preventDefault();
                add(createRow);
              }}
              onMouseEnter={() => setHi(whispers.length)}
              className={
                "block w-full truncate rounded px-2 py-1 text-left text-sm " +
                (hiClamped === whispers.length ? "bg-surface text-text" : "text-text-muted")
              }
            >
              ＋ New tag “{createRow}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

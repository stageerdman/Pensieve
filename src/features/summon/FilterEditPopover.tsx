import { useEffect, useRef, useState } from "react";
import type { Filter } from "../../lib/search/types";
import { DATE_PHRASES, resolveDatePhrase } from "../../lib/search/dates";
import { normTag } from "../../lib/search/evaluate";
import { DateRangeCalendar, formatRange } from "./DateRangeCalendar";

// A small popover for editing a filter chip in place (left-click a chip). The shape
// adapts to the filter kind: swap a date phrase / field, toggle which tags or categories
// are in the one-of set, or edit free text. Closes on outside-mousedown or Esc.

interface Props {
  filter: Filter;
  ctx: { tags: string[]; categories: string[]; now: number };
  onReplace: (filter: Filter) => void;
  onClose: () => void;
}

export function FilterEditPopover({ filter, ctx, onReplace, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-40 mt-1.5 max-h-[320px] w-60 overflow-auto rounded-xl border border-border bg-surface-raised p-2 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      {filter.kind === "date" && <DateEdit filter={filter} now={ctx.now} onReplace={onReplace} />}
      {filter.kind === "tag" && <SetEdit options={ctx.tags.map((t) => t.replace(/^#/, ""))} selected={filter.tags} prefix="#" onChange={(tags) => onReplace({ kind: "tag", tags })} />}
      {filter.kind === "category" && <SetEdit options={ctx.categories} selected={filter.categories} onChange={(categories) => onReplace({ kind: "category", categories })} />}
      {(filter.kind === "title" || filter.kind === "text") && (
        <TextEdit value={filter.text} onChange={(text) => onReplace({ ...filter, text } as Filter)} />
      )}
      {filter.kind === "flag" && <p className="px-1 py-1 text-[12px] text-text-muted">Only pinned thoughts. Right-click the chip to remove it.</p>}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 px-1 text-[10px] uppercase tracking-wider text-text-muted/70">{children}</p>;
}

function DateEdit({
  filter,
  now,
  onReplace,
}: {
  filter: Extract<Filter, { kind: "date" }>;
  now: number;
  onReplace: (f: Filter) => void;
}) {
  const isCustom = !(DATE_PHRASES as readonly string[]).includes(filter.phrase);
  const [showCal, setShowCal] = useState(isCustom);

  const setPhrase = (phrase: string) => {
    const r = resolveDatePhrase(phrase, now);
    if (r) onReplace({ kind: "date", field: filter.field, range: r.range, phrase: r.label });
  };
  const setField = (field: "created" | "updated") => {
    const r = resolveDatePhrase(filter.phrase, now);
    // Keep a custom range as-is when flipping the field; re-resolve a named phrase.
    onReplace({ kind: "date", field, range: r?.range ?? filter.range, phrase: filter.phrase });
  };
  const setRange = (start: number, end: number) => {
    onReplace({ kind: "date", field: filter.field, range: { start, end }, phrase: formatRange(start, end, now) });
  };

  return (
    <div>
      <Label>Field</Label>
      <div className="mb-2 flex gap-1 px-1">
        {(["created", "updated"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setField(f)}
            className={
              "flex-1 rounded-md border px-2 py-1 text-[12px] capitalize " +
              (filter.field === f ? "border-accent bg-accent/15 text-text" : "border-border text-text-muted")
            }
          >
            {f}
          </button>
        ))}
      </div>
      <Label>When</Label>
      <div className="flex flex-col">
        {DATE_PHRASES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPhrase(p)}
            className={
              "rounded-md px-2 py-1 text-left text-[13px] " +
              (filter.phrase === p ? "bg-accent/15 text-text" : "text-text-muted hover:text-text")
            }
          >
            {p}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowCal((v) => !v)}
        className={
          "mt-1 flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[13px] " +
          (isCustom ? "bg-accent/15 text-text" : "text-text-muted hover:text-text")
        }
      >
        <span>Custom range{isCustom ? ` · ${filter.phrase}` : "…"}</span>
        <span className="text-text-muted">{showCal ? "▾" : "▸"}</span>
      </button>
      {showCal && (
        <DateRangeCalendar start={filter.range.start} end={filter.range.end} now={now} onPick={setRange} />
      )}
    </div>
  );
}

function SetEdit({
  options,
  selected,
  prefix = "",
  onChange,
}: {
  options: string[];
  selected: string[];
  prefix?: string;
  onChange: (next: string[]) => void;
}) {
  const [filterText, setFilterText] = useState("");
  const sel = new Set(selected.map((s) => normTag(s)));
  const toggle = (opt: string) => {
    const key = normTag(opt);
    const next = sel.has(key) ? selected.filter((s) => normTag(s) !== key) : [...selected, opt];
    if (next.length > 0) onChange(next);
  };
  const shown = options.filter((o) => o.toLowerCase().includes(filterText.toLowerCase()));
  return (
    <div>
      <input
        value={filterText}
        onChange={(e) => setFilterText(e.target.value)}
        placeholder="Filter…"
        className="summon-input mb-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-[12px] text-text"
      />
      <div className="flex flex-col">
        {shown.map((opt) => {
          const on = sel.has(normTag(opt));
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={
                "flex items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] " +
                (on ? "text-text" : "text-text-muted hover:text-text")
              }
            >
              <span className={"h-2 w-2 shrink-0 rounded-sm border " + (on ? "border-accent bg-accent" : "border-border")} />
              {prefix}
              {opt}
            </button>
          );
        })}
        {shown.length === 0 && <p className="px-2 py-1 text-[12px] text-text-muted">No matches.</p>}
      </div>
    </div>
  );
}

function TextEdit({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>Text</Label>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="summon-input w-full rounded-md border border-border bg-surface px-2 py-1 text-[13px] text-text"
      />
    </div>
  );
}

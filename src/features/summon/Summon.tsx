import { useEffect, useMemo, useState, type RefObject } from "react";
import type { SummonApi } from "../../hooks/useSummon";
import { SummonBar } from "./SummonBar";
import { SuggestionList, isCategoryRow, type Row } from "./SuggestionList";
import { FilterShelf } from "./FilterShelf";

// Composes the summon surface: the bar, the suggestion dropdown, and the filter shelf.
// Owns the ephemeral UI state (focus, dropdown highlight) and the bar keyboard model:
//   ↑/↓ move suggestions · Enter confirms (a date/tag/flag) · Tab confirms a category
//   (plain Enter on a category searches the word as text) · Esc clears text then all ·
//   Backspace on an empty bar pops the last filter.

export function Summon({ summon, inputRef }: { summon: SummonApi; inputRef: RefObject<HTMLInputElement> }) {
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const rows: Row[] = useMemo(() => {
    if (summon.whisper) return summon.whisper.matches.map((tag) => ({ kind: "tag", tag }));
    return summon.suggestions.map((s) => ({ kind: "suggestion", s }));
  }, [summon.whisper, summon.suggestions]);

  // Keep the highlight in range as rows change.
  useEffect(() => {
    setHighlight((h) => (rows.length === 0 ? 0 : Math.min(h, rows.length - 1)));
  }, [rows.length]);

  const activate = (i: number) => {
    const row = rows[i];
    if (!row) return;
    if (row.kind === "tag") summon.pickTag(row.tag);
    else summon.confirm(row.s);
    setHighlight(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      if (rows.length) {
        e.preventDefault();
        setHighlight((h) => Math.min(rows.length - 1, h + 1));
      }
      return;
    }
    if (e.key === "ArrowUp") {
      if (rows.length) {
        e.preventDefault();
        setHighlight((h) => Math.max(0, h - 1));
      }
      return;
    }
    if (e.key === "Tab") {
      // Tab confirms the highlighted suggestion (this is how a category becomes a filter).
      if (rows.length) {
        e.preventDefault();
        activate(highlight);
      }
      return;
    }
    if (e.key === "Enter") {
      const row = rows[highlight];
      // Plain Enter on a category row searches the word as text (don't add the filter).
      if (row && !isCategoryRow(row)) {
        e.preventDefault();
        activate(highlight);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (summon.input !== "") summon.setInput("", 0);
      else {
        summon.clearAll();
        inputRef.current?.blur();
      }
      return;
    }
    if (e.key === "Backspace" && summon.input === "" && summon.items.length > 0) {
      e.preventDefault();
      summon.remove(summon.items[summon.items.length - 1].id);
    }
  };

  const showDropdown = focused && (rows.length > 0 || summon.liveText !== "");

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="relative">
        <SummonBar
          inputRef={inputRef}
          value={summon.input}
          focused={focused}
          count={summon.results.length}
          total={summon.total}
          showCount={summon.active}
          onChange={summon.setInput}
          onCaret={(c) => summon.setInput(summon.input, c)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {showDropdown && (
          <SuggestionList
            rows={rows}
            highlight={highlight}
            liveText={summon.liveText}
            whispering={!!summon.whisper}
            onActivate={activate}
            onHover={setHighlight}
          />
        )}
      </div>

      <FilterShelf
        items={summon.items}
        onPop={summon.remove}
        onFuse={summon.fuse}
        onRelate={summon.relate}
        onMove={summon.move}
        onClearAll={summon.clearAll}
      />
    </div>
  );
}

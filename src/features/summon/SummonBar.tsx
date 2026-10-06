import type { RefObject } from "react";
import { Search } from "../../components/icons";

// The always-visible summon input ring. Presentational: Summon owns the state + keyboard.

interface Props {
  inputRef: RefObject<HTMLInputElement>;
  value: string;
  focused: boolean;
  count: number;
  total: number;
  showCount: boolean;
  onChange: (value: string, caret: number) => void;
  onCaret: (caret: number) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
}

export function SummonBar({
  inputRef,
  value,
  focused,
  count,
  total,
  showCount,
  onChange,
  onCaret,
  onKeyDown,
  onFocus,
  onBlur,
}: Props) {
  return (
    <div
      className={
        "flex items-center gap-3 rounded-full border border-border bg-surface-sunken px-4 py-2.5 transition-shadow " +
        (focused ? "summon-ring-focus" : "")
      }
    >
      <Search size={18} className={focused ? "text-accent" : "text-text-muted"} />
      <input
        ref={inputRef}
        value={value}
        spellCheck={false}
        autoComplete="off"
        placeholder="Summon a thought…   ⌘S"
        className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-text-muted"
        onChange={(e) => onChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
        onSelect={(e) => onCaret((e.target as HTMLInputElement).selectionStart ?? 0)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {showCount && (
        <span className="shrink-0 select-none text-[12px] tabular-nums text-text-muted">
          {count} / {total}
        </span>
      )}
    </div>
  );
}

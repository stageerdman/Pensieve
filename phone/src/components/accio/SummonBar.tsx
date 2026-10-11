// SummonBar.tsx — the lone Accio bar (rises above the keyboard; filters the reel live).
//
// Source markup ~513-517. It lives OUTSIDE any scroller so a stray scroll can't make
// it vanish (wiki: "decouple search from scroll"). The input is controlled by
// filterQuery; useAccioSearch focuses it synchronously inside the tap gesture. The
// word "Search" is banned — it's Accio everywhere.

export function SummonBar({
  inputRef,
  value,
  count,
  onInput,
  onKeyDown,
  onBlur,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  value: string;
  count: string;
  onInput: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}) {
  return (
    <div className="summon">
      <span className="sigil">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" opacity=".5" />
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        </svg>
      </span>
      <input
        ref={inputRef}
        type="text"
        placeholder="Accio a memory…"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onInput(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
      <span className="scount">{count}</span>
    </div>
  );
}

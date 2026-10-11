// AccioPill.tsx — the quiet scope chip shown at the top while a search is HELD but the
// keyboard is down (so matches scroll hands-free).
//
// Source markup ~459-462, CSS ~325-335. The whole chip IS the clear button: tapping it
// pops it away and summons everything back (no ✕). Visible only while
// .filtering:not(.searching) (CSS).

export function AccioPill({
  pillRef,
  query,
  onClick,
}: {
  pillRef: React.RefObject<HTMLDivElement>;
  query: string;
  onClick: () => void;
}) {
  return (
    <div className="accio-pill" ref={pillRef} role="button" aria-label="Clear search" onClick={onClick}>
      <span className="glyph">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8" opacity=".5" />
          <circle cx="12" cy="12" r="3.5" />
        </svg>
      </span>
      <span className="q">{query}</span>
    </div>
  );
}

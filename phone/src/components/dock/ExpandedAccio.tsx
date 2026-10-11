// ExpandedAccio.tsx — the resident Accio spell, spanning the 3 non-menu dock cells.
//
// This is the CALM (keyboard-down) presentation only; when tapped it focuses → the shared
// SummonBar promotes up to ride the keyboard (that morph lives in useAccioSearch + CSS).
// At rest it shows the placeholder + a ghost chip of the latest query ("see what was
// written before"); with a held query it shows the query + match count + a clear button —
// this replaces the old floating top pill.

import { SpellGlyph } from "../spellmenu/SpellGlyph";

export interface ExpandedAccioProps {
  query: string; // held filter query ("" when none)
  count: string; // match count copy ("" when no query)
  latestRecent?: string; // most-recent prior query, shown as a ghost chip at rest
  onOpen: () => void; // focus → promote to the summon bar
  onClear: () => void;
  onRunRecent: (q: string) => void;
}

export function ExpandedAccio({ query, count, latestRecent, onOpen, onClear, onRunRecent }: ExpandedAccioProps) {
  const held = !!query.trim();
  return (
    <div className="accio-bar" role="button" tabIndex={0} aria-label="Accio a memory" onClick={onOpen}>
      <span className="accio-sigil" aria-hidden="true">
        <SpellGlyph icon="accio" size={22} />
      </span>

      {held ? <span className="accio-held">{query}</span> : <span className="accio-ph">Accio a memory…</span>}

      {held ? (
        <>
          <span className="accio-count">{count}</span>
          <button
            type="button"
            className="accio-clear"
            aria-label="Clear search"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" opacity=".4" />
              <path d="M9 9l6 6M15 9l-6 6" />
            </svg>
          </button>
        </>
      ) : latestRecent ? (
        <button
          type="button"
          className="accio-recent"
          aria-label={`Accio ${latestRecent} again`}
          onClick={(e) => {
            e.stopPropagation();
            onRunRecent(latestRecent);
          }}
        >
          {latestRecent}
        </button>
      ) : null}
    </div>
  );
}

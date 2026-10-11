// DockSettings.tsx — the thin, ephemeral row above the dock (recent-query chips).
//
// Shown only while Accio is summoned with an empty query (the keyboard is up), riding
// --kb just above the summon bar. Rarely-used scope controls would live here too.

export function DockSettings({ recents, onRun }: { recents: string[]; onRun: (q: string) => void }) {
  if (!recents.length) return null;
  return (
    <div className="dock-settings" role="group" aria-label="Recent memories you summoned">
      {recents.slice(0, 4).map((q) => (
        <button key={q} type="button" className="dock-chip" onClick={() => onRun(q)}>
          {q}
        </button>
      ))}
    </div>
  );
}

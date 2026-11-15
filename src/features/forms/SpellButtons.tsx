import type { FormSpell } from "../../lib/formSpells";
import type { SpellRun } from "./spellRuns";

// One button per form spell (e.g. "Compress") on a memory made from a form: its name and
// nothing else (owner-decided). While it runs the pressed button breathes and the others
// wait; afterwards the answers appear in the memory itself. Only a failure, or a run that
// wrote nothing, leaves one quiet line beside it.

interface Props {
  spells: FormSpell[];
  run: SpellRun | undefined;
  onCast: (name: string) => void;
}

export function SpellButtons({ spells, run, onCast }: Props) {
  if (!spells.length) return null;
  const running = run?.status === "running" ? run.spell : null;
  const note = run?.status === "note" ? run : null;
  return (
    // Width matches the editor column (see FormStrip).
    <div className="mx-auto mb-2 flex max-w-[72ch] flex-wrap items-center gap-1.5" data-testid="form-spells">
      {spells.map((s) => {
        const busy = running === s.name;
        return (
          <button
            key={s.name}
            type="button"
            onClick={() => onCast(s.name)}
            disabled={!!running}
            aria-busy={busy || undefined}
            className={
              "inline-flex items-center rounded-md border border-border px-2.5 py-1 text-sm text-text hover:bg-surface-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:hover:bg-transparent " +
              (busy ? "animate-pulse border-accent/60 text-accent" : running ? "opacity-50" : "")
            }
          >
            {busy ? `${s.name}…` : s.name}
          </button>
        );
      })}
      {note && (
        <span role="status" className={"text-xs " + (note.failed ? "text-danger" : "text-text-muted")}>
          {note.failed ? `${note.spell} didn't run: ${note.text}` : note.text}
        </span>
      )}
    </div>
  );
}

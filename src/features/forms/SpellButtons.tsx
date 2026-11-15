import type { FormSpell } from "../../lib/formSpells";
import type { SpellRun } from "./spellRuns";
import { STRIP_BUTTON } from "./stripButton";

// One button per form spell (e.g. "Compress") on a memory made from a form: its name and
// nothing else (owner-decided). While it runs the pressed button turns accent and breathes
// (motion-safe; the "…" carries it without motion) and the others dim. There is no success
// state: the answers appearing in the memory are the confirmation. Only a failure, or a run
// that wrote nothing, leaves one quiet line beside it. Buttons stay focusable while a spell
// runs (aria-disabled, not disabled) so keyboard focus isn't dropped; a press then is ignored.

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
            onClick={() => !running && onCast(s.name)}
            aria-disabled={!!running || undefined}
            aria-busy={busy || undefined}
            className={
              STRIP_BUTTON +
              " aria-disabled:cursor-default aria-disabled:hover:bg-transparent" +
              (busy ? " border-accent/60 text-accent motion-safe:animate-pulse" : running ? " opacity-50" : "")
            }
          >
            {busy ? `${s.name}…` : s.name}
          </button>
        );
      })}
      {/* Always mounted, so a screen reader announces the text when it changes. */}
      <span role="status" className={"text-xs " + (note?.failed ? "text-danger" : "text-text-muted")}>
        {note ? (note.failed ? `${note.spell} stopped: ${note.text}` : note.text) : ""}
      </span>
    </div>
  );
}

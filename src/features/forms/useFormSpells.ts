import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Note, NoteMeta } from "../../lib/types";
import { getStore } from "../../lib/store";
import { fromFormId } from "../../lib/forms";
import { castSpell, outcomeText, spellErrorText, spellsOf, type FormSpell } from "../../lib/formSpells";
import { askClaudeVaultTauri } from "../../lib/formSpells/askClaudeVaultTauri";
import { log } from "../../lib/logger";
import { setSpellRun, spellRunOf, subscribeSpellRuns, type SpellRun } from "./spellRuns";

// A memory made from a form → the form's button spells (Compress, …) and pressing one.
// The spells are read from the form itself (its markdown isn't in the list metadata, so it
// is loaded; re-read when the form changes). Casting: flush the editor → lib/formSpells
// castSpell (Claude + the vault's read tools) → flush again right before the answers are
// written (whatever the owner typed meanwhile wins) → swap the editor onto the result.

interface Deps {
  note: Note | null;
  notes: NoteMeta[];
  flush: () => Promise<void>;
  reloadFromDisk: (id: string) => Promise<void>;
}

export interface FormSpells {
  spells: FormSpell[];
  run: SpellRun | undefined;
  cast: (name: string) => void;
}

export function useFormSpells({ note, notes, flush, reloadFromDisk }: Deps): FormSpells {
  const id = note?.id;
  const extra = note?.extra;
  const formId = fromFormId(extra);
  const formUpdatedAt = formId ? notes.find((n) => n.id === formId)?.updatedAt : undefined;
  const [spells, setSpells] = useState<FormSpell[]>([]);

  useEffect(() => {
    let live = true;
    if (!formId) return setSpells([]);
    void getStore()
      .load(formId)
      .then((form) => live && setSpells(spellsOf(extra, form?.markdown)))
      .catch(() => live && setSpells([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId, formUpdatedAt, id]);

  const run = useSyncExternalStore(subscribeSpellRuns, () => spellRunOf(id));

  const cast = useCallback(
    (name: string) => {
      if (!id || spellRunOf(id)?.status === "running") return;
      setSpellRun(id, { status: "running", spell: name });
      log.info("spell", "press", { id, spell: name });
      void (async () => {
        try {
          await flush(); // the latest typing is on disk before open fields are worked out
          const store = getStore();
          const result = await castSpell(id, name, {
            load: (x) => store.load(x),
            save: (n) => store.save(n),
            loadTimeline: (x) => store.loadTimeline(x),
            saveTimeline: (x, e) => store.saveTimeline(x, e),
            ask: askClaudeVaultTauri,
            settle: flush,
          });
          if (result.status === "filled") await reloadFromDisk(id);
          const text = outcomeText(result);
          setSpellRun(id, text ? { status: "note", spell: name, text, failed: false } : undefined);
        } catch (err) {
          log.error("spell", "cast.failed", { id, spell: name, error: err instanceof Error ? err.message : String(err) });
          setSpellRun(id, { status: "note", spell: name, text: spellErrorText(err), failed: true });
        }
      })();
    },
    [id, flush, reloadFromDisk],
  );

  return { spells, run, cast };
}

// spellRuns.ts — the state of form-spell runs, per memory, outside React: a cast keeps
// going when the owner switches memories, and coming back shows it still running (or how
// it ended). Tiny external store for useSyncExternalStore.

export type SpellRun =
  | { status: "running"; spell: string }
  /** How it ended, when there's something to say (failure, or nothing was written). */
  | { status: "note"; spell: string; text: string; failed: boolean };

const runs = new Map<string, SpellRun>();
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** A quiet "nothing to add" note fades on its own; a failure stays until the next press. */
export const NOTE_MS = 6000;

function emit() {
  for (const l of listeners) l();
}

export function subscribeSpellRuns(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function spellRunOf(noteId: string | undefined): SpellRun | undefined {
  return noteId ? runs.get(noteId) : undefined;
}

export function setSpellRun(noteId: string, run: SpellRun | undefined): void {
  const t = timers.get(noteId);
  if (t) clearTimeout(t);
  timers.delete(noteId);
  if (run) runs.set(noteId, run);
  else runs.delete(noteId);
  if (run?.status === "note" && !run.failed) {
    timers.set(
      noteId,
      setTimeout(() => {
        timers.delete(noteId);
        if (runs.get(noteId) === run) {
          runs.delete(noteId);
          emit();
        }
      }, NOTE_MS),
    );
  }
  emit();
}

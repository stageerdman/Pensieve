import { useCallback, useEffect, useRef, useState } from "react";
import type { NoteMeta } from "../lib/types";
import { getStore } from "../lib/store";
import { plainTextFromMarkdown } from "../lib/text";
import { MemoryIndex } from "../lib/search/indexer";
import { log } from "../lib/logger";

// Builds and maintains the full-text index for Summon — but LAZILY. Structured filters
// (tags / dates / categories / flags) never touch note bodies, so we only read all bodies
// once the user actually types free text (`ensureBuilt`). After the first build it stays
// warm and updates incrementally (a note whose updatedAt changed is re-read; a removed
// note is dropped). The index is a stable ref that mutates in place, so `version` bumps on
// every change to let consumers recompute their search.
export function useSearchIndex(notes: NoteMeta[]) {
  const store = getStore();
  const indexRef = useRef(new MemoryIndex());
  const stampRef = useRef(new Map<string, number>()); // id → updatedAt last indexed
  const builtRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);

  const notesRef = useRef(notes);
  notesRef.current = notes;

  // Kick off the one-shot cold build the first time full-text search is needed.
  const ensureBuilt = useCallback(() => {
    if (builtRef.current) return;
    builtRef.current = true;
    void (async () => {
      try {
        const docs = await store.bodies();
        indexRef.current.set(docs);
        stampRef.current = new Map(notesRef.current.map((n) => [n.id, n.updatedAt]));
        log.info("search", "index.built", { count: docs.length });
      } catch {
        log.warn("search", "index.build.failed", {});
      } finally {
        setReady(true);
        setVersion((v) => v + 1);
      }
    })();
  }, [store]);

  // Once built, keep it in sync as notes change.
  useEffect(() => {
    if (!builtRef.current || !ready) return;
    const stamp = stampRef.current;
    const live = new Set(notes.map((n) => n.id));
    const changed = notes.filter((n) => stamp.get(n.id) !== n.updatedAt);
    const removed = [...stamp.keys()].filter((id) => !live.has(id));
    if (changed.length === 0 && removed.length === 0) return;

    let cancelled = false;
    void (async () => {
      for (const n of changed) {
        const note = await store.load(n.id);
        if (cancelled) return;
        if (note) indexRef.current.update(n.id, plainTextFromMarkdown(note.markdown));
        stamp.set(n.id, n.updatedAt);
      }
      for (const id of removed) {
        indexRef.current.remove(id);
        stamp.delete(id);
      }
      if (!cancelled) {
        setVersion((v) => v + 1);
        log.debug("search", "index.updated", { changed: changed.length, removed: removed.length });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notes, ready, store]);

  return { index: indexRef.current, ready, version, ensureBuilt };
}

import { useEffect, useRef, useState } from "react";
import type { NoteMeta } from "../lib/types";
import { getStore } from "../lib/store";
import { plainTextFromMarkdown } from "../lib/text";
import { MemoryIndex } from "../lib/search/indexer";
import { log } from "../lib/logger";

// Builds and maintains the full-text index for Summon. A one-shot cold build (reads all
// bodies once) runs when notes first arrive — off the gallery's critical path. After that
// it's incremental: a note whose updatedAt changed is re-read and re-indexed; a removed
// note is dropped. The index object is a stable ref that mutates in place, so `version`
// bumps on every change to let consumers recompute their search.
export function useSearchIndex(notes: NoteMeta[]) {
  const store = getStore();
  const indexRef = useRef(new MemoryIndex());
  const stampRef = useRef(new Map<string, number>()); // id → updatedAt last indexed
  const builtRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);

  // Cold build — once, when the first notes land.
  useEffect(() => {
    if (builtRef.current || notes.length === 0) return;
    builtRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const docs = await store.bodies();
        if (cancelled) return;
        indexRef.current.set(docs);
        stampRef.current = new Map(docs.map((d) => [d.id, 0])); // real stamps set below
        for (const n of notes) stampRef.current.set(n.id, n.updatedAt);
        log.info("search", "index.built", { count: docs.length });
      } catch {
        log.warn("search", "index.build.failed", {});
      } finally {
        if (!cancelled) {
          setReady(true);
          setVersion((v) => v + 1);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notes, store]);

  // Incremental updates after the cold build.
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

  return { index: indexRef.current, ready, version };
}

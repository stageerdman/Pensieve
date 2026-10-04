import { useCallback, useEffect, useRef, useState } from "react";
import type { Note, NoteFields, NoteMeta } from "../lib/types";
import { getStore } from "../lib/store";
import { wordCount } from "../lib/text";
import { makeEntry, IDLE_MS } from "../lib/timeline";
import { log } from "../lib/logger";

export type SaveStatus = "idle" | "saving" | "saved";
const SAVE_DEBOUNCE = 500;

interface Session {
  startWords: number;
  startTs: number;
  firstEver: boolean;
}

// Owns all note state: the list, the open note, debounced autosave, and the
// per-session addition timeline. Feature components stay dumb; this is the brain.
export function useNotes() {
  const store = getStore();
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [current, setCurrent] = useState<Note | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");

  const currentRef = useRef<Note | null>(null);
  currentRef.current = current;
  const session = useRef<Session | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();

  const refresh = useCallback(async () => {
    setNotes(await store.list());
  }, [store]);

  const persist = useCallback(
    async (note: Note) => {
      setStatus("saving");
      await store.save(note);
      setStatus("saved");
      await refresh();
    },
    [store, refresh],
  );

  const closeSession = useCallback(async () => {
    const s = session.current;
    const note = currentRef.current;
    session.current = null;
    if (!s || !note) return;
    const entry = makeEntry(
      s.startWords,
      wordCount(note.markdown),
      s.startTs,
      s.firstEver,
    );
    if (entry) {
      await store.appendTimeline(note.id, entry);
      log.info("timeline", "session.close", {
        id: note.id,
        delta: entry.wordDelta,
      });
    }
  }, [store]);

  const startSession = useCallback(
    async (note: Note) => {
      const existing = await store.loadTimeline(note.id);
      session.current = {
        startWords: wordCount(note.markdown),
        startTs: Date.now(),
        firstEver: existing.length === 0,
      };
    },
    [store],
  );

  const flushSave = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (currentRef.current) await store.save(currentRef.current);
  }, [store]);

  const open = useCallback(
    async (id: string) => {
      if (currentRef.current?.id === id) return;
      await flushSave();
      await closeSession();
      const note = await store.load(id);
      setCurrent(note);
      setStatus("idle");
      if (note) await startSession(note);
    },
    [store, flushSave, closeSession, startSession],
  );

  const create = useCallback(async () => {
    await flushSave();
    await closeSession();
    const note = await store.create();
    await refresh();
    setCurrent(note);
    setStatus("idle");
    await startSession(note);
    log.info("notes", "create", { id: note.id });
  }, [store, flushSave, closeSession, startSession, refresh]);

  const remove = useCallback(
    async (id: string) => {
      await store.remove(id);
      if (currentRef.current?.id === id) {
        session.current = null;
        setCurrent(null);
      }
      const list = await store.list();
      setNotes(list);
      if (currentRef.current?.id === id && list.length) await open(list[0].id);
    },
    [store, open],
  );

  const change = useCallback(
    (markdown: string) => {
      const note = currentRef.current;
      if (!note) return;
      const next = { ...note, markdown };
      setCurrent(next);
      currentRef.current = next;
      setStatus("saving");

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(next), SAVE_DEBOUNCE);

      // An idle gap closes the writing session, then a fresh one begins so the
      // next burst of writing is recorded as a new addition.
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(async () => {
        await closeSession();
        if (currentRef.current) await startSession(currentRef.current);
      }, IDLE_MS);
    },
    [persist, closeSession, startSession],
  );

  // Update a note's metadata (category / tags / links) and persist immediately.
  // Metadata edits are deliberate and infrequent, so no debounce — save at once
  // and refresh the list (so e.g. a new category shows up right away).
  const updateMeta = useCallback(
    (partial: Partial<NoteFields>) => {
      const note = currentRef.current;
      if (!note) return;
      const next = { ...note, ...partial };
      setCurrent(next);
      currentRef.current = next;
      void persist(next);
    },
    [persist],
  );

  // Initial load: list notes and open the most recent (or create the first).
  useEffect(() => {
    (async () => {
      const list = await store.list();
      setNotes(list);
      if (list.length) await open(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save + close the session when the window goes away.
  useEffect(() => {
    const handler = () => {
      void flushSave();
      void closeSession();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [flushSave, closeSession]);

  return { notes, current, status, open, create, remove, change, updateMeta };
}

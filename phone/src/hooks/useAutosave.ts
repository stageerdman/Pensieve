// useAutosave.ts — the note's debounced autosave (no "Pour in" button).
//
// Ported from 01-the-wand-v2.html ~935-959 (`scheduleSave`, `commit`). Reads the
// single editor's DOM (first block = title, rest = body), writes it back onto the
// current Note, and delegates the vault mutations (insert-on-first-edit, re-render,
// mark-dirty) to the app via callbacks. Shows the transient "Saved" indicator.

import { useEffect, useRef } from "react";
import type { Note } from "../types";
import { serializeNoteBody } from "../components/note/mediaDom";

export interface AutosaveCallbacks {
  /** A brand-new note crossed into "has content" → add it to the vault (unshift),
   *  bump the count, re-render the reel, scroll to top. */
  onInsert: (note: Note) => void;
  /** An existing note was edited → re-render the reel in place. */
  onRender: () => void;
  /** Mark the vault dirty (drives the Sync state machine's EDIT event). */
  onDirty: () => void;
}

export interface Autosave {
  commit: () => void;
  scheduleSave: () => void;
}

export function useAutosave(
  noteBodyRef: React.RefObject<HTMLElement>,
  noteSavedRef: React.RefObject<HTMLElement>,
  currentRef: React.MutableRefObject<Note | null>,
  cb: AutosaveCallbacks,
): Autosave {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedHideT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const api = useRef<Autosave>({ commit: () => {}, scheduleSave: () => {} });

  useEffect(() => {
    function commit() {
      const current = currentRef.current;
      const noteBody = noteBodyRef.current;
      if (!current || !noteBody) return;
      // Serialize the body DOM to the shared markdown model: title (first H1), then each
      // block as text OR, for a media block, its `![](ref)` / `pensieve:gallery` markdown.
      const { title, content } = serializeNoteBody(noteBody);
      current.t = title;
      current.c = content;
      current.fill = Math.min(1, Math.max(0.18, current.c.length / 220));
      current.d = "Just now";
      current.updatedAt = Date.now();
      if (current.isNew && (current.t || current.c)) {
        current.isNew = false;
        current.fresh = false;
        cbRef.current.onInsert(current);
      } else {
        cbRef.current.onRender();
      }
      cbRef.current.onDirty();
      const saved = noteSavedRef.current;
      if (saved) {
        saved.classList.add("show");
        if (savedHideT.current) clearTimeout(savedHideT.current);
        savedHideT.current = setTimeout(() => saved.classList.remove("show"), 1400);
      }
    }

    function scheduleSave() {
      noteSavedRef.current?.classList.remove("show");
      if (saveT.current) clearTimeout(saveT.current);
      saveT.current = setTimeout(commit, 450);
    }

    api.current.commit = commit;
    api.current.scheduleSave = scheduleSave;
    return () => {
      if (saveT.current) clearTimeout(saveT.current);
      if (savedHideT.current) clearTimeout(savedHideT.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return api.current;
}

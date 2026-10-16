// Remembers, per note, *where you were writing* — the scroll offset of the editor's
// scroll surface plus the caret selection. The Editor remounts on every tab switch
// (key={note.id}), so without this you'd always land back at the default focus spot.
// This holds the memory one level above the Editor (in App) so it survives those
// remounts, and keeps it purely in memory: switching tabs restores you, but closing a
// tab forgets it (see App's close handler) and a fresh app launch starts clean.

import { useMemo, useRef } from "react";

export interface EditorPosition {
  scrollTop: number;
  // ProseMirror absolute selection positions; clamped on restore in case the doc changed.
  anchor?: number;
  head?: number;
}

export interface EditorPositionMemory {
  get: (noteId: string) => EditorPosition | null;
  set: (noteId: string, pos: EditorPosition) => void;
  forget: (noteId: string) => void;
}

export function useEditorPositionMemory(): EditorPositionMemory {
  const map = useRef(new Map<string, EditorPosition>());
  return useMemo(
    () => ({
      get: (noteId) => map.current.get(noteId) ?? null,
      set: (noteId, pos) => {
        map.current.set(noteId, pos);
      },
      forget: (noteId) => {
        map.current.delete(noteId);
      },
    }),
    [],
  );
}

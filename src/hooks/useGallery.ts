import { useCallback, useState } from "react";
import {
  type GalleryFields,
  type GalleryState,
  type SnippetLines,
} from "../lib/gallery/view";
import {
  loadGalleryState,
  saveGalleryState,
  saveWorkingSet,
} from "../lib/gallery/persist";

// Owns the gallery's device-local state: which fields each flask shows, the snippet
// line count, the working-set persistence setting, and the working set itself. All
// persistence lives here (config in one key, the working-set ids in another that is
// only written when persistence is on). Feature components stay dumb.
export function useGallery() {
  const [state, setState] = useState<GalleryState>(() => loadGalleryState());

  const toggleField = useCallback((key: keyof GalleryFields) => {
    setState((s) => {
      const next = { ...s, fields: { ...s.fields, [key]: !s.fields[key] } };
      saveGalleryState(next);
      return next;
    });
  }, []);

  const setSnippetLines = useCallback((snippetLines: SnippetLines) => {
    setState((s) => {
      const next = { ...s, snippetLines };
      saveGalleryState(next);
      return next;
    });
  }, []);

  const setWorkingSetPersist = useCallback((on: boolean) => {
    setState((s) => {
      const next = { ...s, settings: { ...s.settings, workingSetPersist: on } };
      saveGalleryState(next);
      // Turning persistence on writes the current set; turning it off clears the key
      // (the set stays in memory for this session).
      saveWorkingSet(next.workingSet, on);
      return next;
    });
  }, []);

  // All working-set mutations funnel through here so the persist rule (write only
  // when persistence is on) lives in exactly one place.
  const mutateWorkingSet = useCallback((fn: (ids: string[]) => string[]) => {
    setState((s) => {
      const workingSet = fn(s.workingSet);
      if (workingSet === s.workingSet) return s;
      saveWorkingSet(workingSet, s.settings.workingSetPersist);
      return { ...s, workingSet };
    });
  }, []);

  const addToWorkingSet = useCallback(
    (id: string) => mutateWorkingSet((ids) => (ids.includes(id) ? ids : [...ids, id])),
    [mutateWorkingSet],
  );
  const removeFromWorkingSet = useCallback(
    (id: string) => mutateWorkingSet((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids)),
    [mutateWorkingSet],
  );
  const toggleWorkingSet = useCallback(
    (id: string) =>
      mutateWorkingSet((ids) =>
        ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
      ),
    [mutateWorkingSet],
  );
  const moveInWorkingSet = useCallback(
    (id: string, delta: number) =>
      mutateWorkingSet((ids) => {
        const i = ids.indexOf(id);
        if (i < 0) return ids;
        const j = Math.max(0, Math.min(ids.length - 1, i + delta));
        if (i === j) return ids;
        const next = [...ids];
        next.splice(j, 0, next.splice(i, 1)[0]);
        return next;
      }),
    [mutateWorkingSet],
  );
  // Move an item from one index to another (drag-to-reorder within the strip).
  const reorderWorkingSet = useCallback(
    (fromIndex: number, toIndex: number) =>
      mutateWorkingSet((ids) => {
        if (
          fromIndex === toIndex ||
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= ids.length ||
          toIndex >= ids.length
        )
          return ids;
        const next = [...ids];
        next.splice(toIndex, 0, next.splice(fromIndex, 1)[0]);
        return next;
      }),
    [mutateWorkingSet],
  );
  // Drop ids that no longer map to a live note (self-healing after deletes).
  const pruneWorkingSet = useCallback(
    (liveIds: Set<string>) =>
      mutateWorkingSet((ids) =>
        ids.every((id) => liveIds.has(id)) ? ids : ids.filter((id) => liveIds.has(id)),
      ),
    [mutateWorkingSet],
  );

  return {
    state,
    toggleField,
    setSnippetLines,
    setWorkingSetPersist,
    addToWorkingSet,
    removeFromWorkingSet,
    toggleWorkingSet,
    moveInWorkingSet,
    reorderWorkingSet,
    pruneWorkingSet,
  };
}

export type UseGallery = ReturnType<typeof useGallery>;

import { useCallback, useEffect, useState } from "react";
import { HOME, type ActiveTab } from "../components/TabBar";

// The editor's tab lifecycle, lifted out of App so the root stays composition.
// Home is the gallery of all memories; a note tab loads that note into the editor.
// Clicking a flask opens it as a tab and switches to it; ⌘/Ctrl-click opens a
// background tab and stays on Home.
interface UseTabsParams<N extends { id: string }> {
  /** The live note list (metas). Tabs/working-set self-heal against it. */
  notes: N[];
  /** Load a note into the editor. */
  open: (id: string) => void | Promise<void>;
  /** Create a new note; returns it (or null/undefined on failure). */
  create: () => Promise<{ id: string } | null | undefined>;
  /** Drop working-set ids no longer backed by a live note. */
  pruneWorkingSet: (live: Set<string>) => void;
}

export function useTabs<N extends { id: string }>({ notes, open, create, pruneWorkingSet }: UseTabsParams<N>) {
  const [tabIds, setTabIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>(HOME);
  const onHome = activeTab === HOME;

  // Drop tabs whose note no longer exists (e.g. deleted); fall back to Home if the
  // active tab was the one removed. Keep the working set healed to live notes too.
  useEffect(() => {
    const live = new Set(notes.map((n) => n.id));
    setTabIds((ids) => {
      const kept = ids.filter((id) => live.has(id));
      return kept.length === ids.length ? ids : kept;
    });
    setActiveTab((a) => (a !== HOME && !live.has(a) ? HOME : a));
    // Only heal the working set once notes have actually loaded. On first mount `notes`
    // is still [] (the store lists asynchronously); pruning against an empty set then
    // would wipe — and persist as empty — a working set restored from a prior session.
    // A genuinely empty vault has no valid ids anyway, and dead ids are render-filtered
    // and cleaned on the next non-empty prune.
    if (notes.length > 0) pruneWorkingSet(live);
  }, [notes, pruneWorkingSet]);

  const tabs = tabIds.map((id) => notes.find((n) => n.id === id)).filter(Boolean) as N[];

  // Open a flask from the gallery/working set. Background → a quiet tab, stay on Home;
  // otherwise open the tab and switch to it (the note loads into the editor).
  const openNote = useCallback(
    (id: string, background: boolean) => {
      setTabIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
      if (!background) {
        setActiveTab(id);
        void open(id);
      }
    },
    [open],
  );

  const goHome = useCallback(() => setActiveTab(HOME), []);

  // A new note opens straight into the editor as its own tab, ready to write.
  const newNote = useCallback(async () => {
    const note = await create();
    if (!note) return;
    setTabIds((ids) => (ids.includes(note.id) ? ids : [...ids, note.id]));
    setActiveTab(note.id);
  }, [create]);

  const selectTab = useCallback(
    (id: string) => {
      setActiveTab(id);
      void open(id);
    },
    [open],
  );

  const closeTab = useCallback(
    (id: string) => {
      setTabIds((ids) => {
        const idx = ids.indexOf(id);
        const next = ids.filter((t) => t !== id);
        // If the closed tab was active, fall to a neighbour, else Home (the gallery).
        setActiveTab((cur) => {
          if (cur !== id) return cur;
          const neighbour = next[idx] ?? next[idx - 1];
          if (neighbour) {
            void open(neighbour);
            return neighbour;
          }
          return HOME;
        });
        return next;
      });
    },
    [open],
  );

  return { tabs, activeTab, onHome, openNote, goHome, newNote, selectTab, closeTab };
}

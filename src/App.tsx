import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "./components/Editor";
import { TimelinePanel } from "./components/TimelinePanel";
import { DetailsPanel } from "./components/DetailsPanel";
import { OverflowMenu } from "./components/OverflowMenu";
import { FlaskButton } from "./components/FlaskButton";
import { TabBar, HOME, type ActiveTab } from "./components/TabBar";
import { IconButton } from "./components/IconButton";
import { Clock, PanelRight, Plus, Trash } from "./components/icons";
import { StatusWhisper } from "./components/StatusWhisper";
import { SyncStatus } from "./components/SyncStatus";
import { Gallery } from "./features/gallery/Gallery";
import { GalleryCustomise } from "./features/gallery/GalleryCustomise";
import { Summon } from "./features/summon/Summon";
import { useSummon } from "./hooks/useSummon";
import { contentCharCount } from "./lib/text";
import { useNotes } from "./hooks/useNotes";
import { useGallery } from "./hooks/useGallery";
import { useTheme } from "./hooks/useTheme";
import { useFullscreen } from "./hooks/useFullscreen";
import { useFontScale } from "./hooks/useFontScale";
import { useCategoryDefs } from "./hooks/useCategoryDefs";
import { useSync } from "./hooks/useSync";

// Native app: the macOS title bar is integrated (Overlay). The traffic lights float at
// the top-left, so the header insets its left edge to clear them.
const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export default function App() {
  const { notes, current, status, open, create, remove, change, updateMeta, togglePin, setCreatedAt, refresh } =
    useNotes();
  // A sync that pulled remote changes refreshes the list; if the open note was one
  // of them, reload it into the editor so on-screen content matches disk.
  const currentId = current?.id;
  const sync = useSync(
    useCallback(() => {
      void refresh();
      if (currentId) void open(currentId);
    }, [refresh, open, currentId]),
  );
  const titleFor = useCallback(
    (id: string) => notes.find((n) => n.id === id)?.title ?? "Untitled",
    [notes],
  );
  // Unsynced-changes nudge: a note created/edited since the last successful sync
  // means there's something to back up. Only meaningful while connected and at rest
  // (not mid-sync / disconnected / error). Drives the golden "suggest sync" state.
  const pendingSync =
    (sync.ui.phase === "idle" || sync.ui.phase === "synced") &&
    notes.some((n) => (n.updatedAt ?? 0) > (sync.ui.lastSyncedAt ?? 0));
  // Latest sync handle for the ⌘S shortcut, without re-registering the key listener.
  const syncRef = useRef(sync);
  syncRef.current = sync;
  const { theme, toggle } = useTheme();
  const fullscreen = useFullscreen();
  useFontScale();
  const categories = useCategoryDefs();
  const gallery = useGallery();

  // Summon (search). Lives atop Home; ⌘A (⌘⇧A while typing) focuses it. Filters the gallery live while the
  // timeline grouping is preserved (we only hand it a filtered note list + match info).
  const categoryNames = useMemo(() => categories.defs.map((d) => d.name), [categories.defs]);
  const summon = useSummon(notes, categoryNames);
  const summonInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (IS_TAURI) document.documentElement.classList.add("tauri");
  }, []);

  const [timelineOpen, setTimelineOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>();

  // Tabs. Home is the gallery of all memories; the editor shows `current` whenever a
  // note tab is active. Clicking a flask opens it as a tab and switches to it;
  // ⌘/Ctrl-clicking opens a background tab and stays on Home.
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
    if (notes.length > 0) gallery.pruneWorkingSet(live);
  }, [notes, gallery.pruneWorkingSet]);

  const tabs = tabIds
    .map((id) => notes.find((n) => n.id === id))
    .filter(Boolean) as typeof notes;

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

  // Live set of tags in use across notes — the source for tag whispering.
  const tagSuggestions = useMemo(
    () => Array.from(new Set(notes.flatMap((n) => n.tags ?? []))).sort(),
    [notes],
  );

  // The right dock holds one panel at a time — opening either closes the other. Only
  // meaningful with a note open, so they are no-ops on Home.
  const toggleTimeline = useCallback(() => {
    if (onHome || !current) return;
    setTimelineOpen((v) => !v);
    setDetailsOpen(false);
  }, [onHome, current]);

  const toggleDetails = useCallback(() => {
    if (onHome || !current) return;
    setDetailsOpen((v) => !v);
    setTimelineOpen(false);
  }, [onHome, current]);

  const askDelete = useCallback(() => {
    if (onHome || !current) return;
    if (confirmDelete) {
      setConfirmDelete(false);
      void remove(current.id);
      return;
    }
    setConfirmDelete(true);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmDelete(false), 3000);
  }, [onHome, current, confirmDelete, remove]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) {
        if (e.key === "Escape") {
          setTimelineOpen(false);
          setDetailsOpen(false);
          setFocusMode(false);
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "n") {
        e.preventDefault();
        void newNote();
      } else if (k === "w") {
        // ⌘W closes the active tab (no-op on Home).
        e.preventDefault();
        if (!onHome) closeTab(activeTab);
      } else if (k === "p") {
        // ⌘P pins/unpins the open note (overrides the browser print dialog).
        e.preventDefault();
        if (!onHome && current) void togglePin(current.id);
      } else if (k === "s") {
        // ⌘S syncs now (overrides the browser "save page"). No-op when not connected.
        e.preventDefault();
        const s = syncRef.current;
        if (s.ui.phase !== "disconnected" && s.ui.phase !== "unavailable") void s.syncNow();
      } else if (e.code === "Backslash" && e.shiftKey) {
        // ⌘⇧\ toggles the right Details panel.
        e.preventDefault();
        toggleDetails();
      } else if (k === "t") {
        e.preventDefault();
        toggleTimeline();
      } else if (k === ".") {
        e.preventDefault();
        setFocusMode((v) => !v);
      } else if (k === "l" && e.shiftKey) {
        // Dev/keyboard theme toggle; the native macOS menu owns this in the app.
        e.preventDefault();
        toggle();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        askDelete();
      } else if (k === "a") {
        // ⌘A summons. While writing text (input / textarea / editor), plain ⌘A must stay
        // "select all", so there we require ⌘⇧A; anywhere else plain ⌘A summons.
        const t = e.target as HTMLElement | null;
        const editing =
          !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
        if (editing && !e.shiftKey) return;
        // Summon: jump Home, scroll the gallery all the way to the top (so the bar is
        // fully in view, not mid-screen), and focus it.
        e.preventDefault();
        setActiveTab(HOME);
        requestAnimationFrame(() => {
          const el = summonInputRef.current;
          el?.focus({ preventScroll: true });
          // Walk up to the nearest scrollable ancestor (the gallery scroll region) and
          // scroll it fully to the top.
          let p = el?.parentElement ?? null;
          while (p) {
            if (p.scrollHeight > p.clientHeight && getComputedStyle(p).overflowY !== "visible") {
              p.scrollTo({ top: 0, behavior: "smooth" });
              break;
            }
            p = p.parentElement;
          }
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newNote, current, toggle, askDelete, toggleTimeline, toggleDetails, togglePin, onHome, activeTab, closeTab]);

  const showChrome = !focusMode;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface text-text">
      <main className="flex min-w-0 flex-1 flex-col">
        {showChrome && (
          <header
            data-tauri-drag-region
            className={
              "flex h-12 items-center gap-2 border-b border-border bg-surface-sunken pr-3 " +
              // Clear the macOS traffic lights only in windowed mode. In fullscreen they
              // are gone, so the home button + tabs start flush-left like in the browser.
              (IS_TAURI && !fullscreen ? "pl-20" : "pl-3")
            }
          >
            <TabBar
              tabs={tabs}
              active={activeTab}
              onHome={goHome}
              onSelect={selectTab}
              onClose={closeTab}
            />
            <div className="flex shrink-0 items-center">
              <SyncStatus sync={sync} titleFor={titleFor} pending={pendingSync} />
            </div>
            {onHome ? (
              <div className="flex shrink-0 items-center gap-0.5">
                <IconButton label="New note" title="New note  ⌘N" onClick={() => void newNote()}>
                  <Plus size={18} />
                </IconButton>
                <GalleryCustomise
                  state={gallery.state}
                  onToggleField={gallery.toggleField}
                  onSetSnippetLines={gallery.setSnippetLines}
                  onSetWorkingSetPersist={gallery.setWorkingSetPersist}
                />
              </div>
            ) : (
              current && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <OverflowMenu
                    items={[
                      {
                        icon: <Clock size={16} />,
                        label: "Timeline",
                        shortcut: "⌘T",
                        onSelect: toggleTimeline,
                        active: timelineOpen,
                      },
                      {
                        icon: <Trash size={16} />,
                        label: "Delete note",
                        shortcut: "⌘⌫",
                        onSelect: askDelete,
                      },
                    ]}
                  />
                  <IconButton
                    label="Note details"
                    title="Note details  ⌘⇧\"
                    active={detailsOpen}
                    onClick={toggleDetails}
                  >
                    <PanelRight />
                  </IconButton>
                </div>
              )
            )}
          </header>
        )}

        <div className="flex min-h-0 flex-1">
          {onHome ? (
            <Gallery
              notes={summon.results}
              state={gallery.state}
              categoryDefs={categories.defs}
              header={<Summon summon={summon} inputRef={summonInputRef} />}
              match={summon.match}
              searchActive={summon.active}
              theme={theme}
              onOpen={openNote}
              onToggleWorkingSet={gallery.toggleWorkingSet}
              onRemoveFromWorkingSet={gallery.removeFromWorkingSet}
              onMoveInWorkingSet={gallery.moveInWorkingSet}
              onReorderWorkingSet={gallery.reorderWorkingSet}
            />
          ) : (
            <>
              <section className="flex-1 overflow-y-auto">
                {current ? (
                  <div className="w-full px-6 pt-4 pb-16">
                    {confirmDelete && (
                      <div className="mx-auto mb-4 max-w-[72ch] rounded border border-danger/40 bg-danger/10 px-3 py-1.5 text-sm text-danger">
                        Press ⌘⌫ again to delete this note.
                      </div>
                    )}
                    {!focusMode && (
                      <div className="mx-auto mb-1 max-w-[72ch]">
                        <FlaskButton
                          icon={current.icon}
                          chars={contentCharCount(current.markdown)}
                          seed={current.id}
                          onChange={(icon) => updateMeta({ icon })}
                        />
                      </div>
                    )}
                    <Editor
                      key={current.id}
                      markdown={current.markdown}
                      onChange={change}
                      focusMode={focusMode}
                      theme={theme}
                      selfId={current.id}
                      notes={notes}
                      onOpenNote={(id) => void open(id)}
                    />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-text-muted">
                      Press <kbd>⌘N</kbd> to start writing.
                    </p>
                  </div>
                )}
              </section>

              {showChrome && timelineOpen && current && (
                <TimelinePanel
                  noteId={current.id}
                  noteTitle={current.title}
                  onClose={() => setTimelineOpen(false)}
                />
              )}

              {showChrome && detailsOpen && current && (
                <DetailsPanel
                  note={current}
                  notes={notes}
                  tagSuggestions={tagSuggestions}
                  categories={categories}
                  onClose={() => setDetailsOpen(false)}
                  onOpenNote={(id) => void open(id)}
                  updateMeta={updateMeta}
                  onSetCreatedAt={setCreatedAt}
                />
              )}
            </>
          )}
        </div>
      </main>

      <StatusWhisper status={status} />
    </div>
  );
}

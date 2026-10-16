import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "./components/editor/Editor";
import { useEditorPositionMemory, type EditorPosition } from "./components/editor/editorPosition";
import { TimelinePanel } from "./components/TimelinePanel";
import { DetailsPanel } from "./components/DetailsPanel";
import { OverflowMenu } from "./components/OverflowMenu";
import { FlaskButton } from "./components/FlaskButton";
import { TabBar, HOME } from "./components/TabBar";
import { IconButton } from "./components/IconButton";
import { Clock, PanelRight, Plus, Trash } from "./components/icons";
import { StatusWhisper } from "./components/StatusWhisper";
import { MediaBackupWhisper } from "./components/MediaBackupWhisper";
import { ImageLightbox } from "./components/media/ImageLightbox";
import { TranscriptSplit } from "./components/audio/TranscriptSplit";
import { SyncStatus } from "./components/SyncStatus";
import { NotePreview } from "./features/gallery/NotePreview";
import type { TimelineEntry } from "./lib/types";
import { Gallery } from "./features/gallery/Gallery";
import { GalleryCustomise } from "./features/gallery/GalleryCustomise";
import { Summon } from "./features/summon/Summon";
import { useSummon } from "./hooks/useSummon";
import { contentCharCount } from "./lib/text";
import { useNotes } from "./hooks/useNotes";
import { useTabs } from "./hooks/useTabs";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { useNativeCommands } from "./hooks/useNativeCommands";
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
  const { notes, current, status, loadEpoch, open, create, remove, change, updateMeta, togglePin, setCreatedAt, restoreVersion, refresh, recordOpen } =
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
  // Time travel: a past version the main page is showing read-only (null = the live,
  // editable note). Selected from the Timeline; never auto-saved. Reset when the note
  // changes or the Timeline closes so you can't get stranded in a read-only view.
  const [previewEntry, setPreviewEntry] = useState<TimelineEntry | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>();

  // Tabs (Home + per-note), their self-healing lifecycle, and open/create/close.
  const { tabs, activeTab, onHome, openNote, goHome, newNote, selectTab, closeTab } = useTabs({
    notes,
    open,
    create,
    pruneWorkingSet: gallery.pruneWorkingSet,
    recordOpen,
  });

  // Per-note "where I was writing" memory (scroll + caret). The Editor remounts on every
  // tab switch, so this lives here to survive the remount. It's in-memory only: switching
  // tabs restores your spot; closing the tab forgets it (so a reopen starts fresh).
  const editorPos = useEditorPositionMemory();
  const saveEditorPos = useCallback(
    (noteId: string, pos: EditorPosition) => editorPos.set(noteId, pos),
    [editorPos],
  );
  const closeTabAndForget = useCallback(
    (id: string) => {
      if (id !== HOME) editorPos.forget(id);
      closeTab(id);
    },
    [editorPos, closeTab],
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

  // Leave time travel when switching notes, or when the Timeline is closed (otherwise
  // you'd be stuck looking at a read-only past version with no way back).
  useEffect(() => setPreviewEntry(null), [currentId]);
  useEffect(() => {
    if (!timelineOpen) setPreviewEntry(null);
  }, [timelineOpen]);

  // Commit a restore: drop time travel first (back to the live editor), then revert —
  // restoreVersion bumps the editor remount key so the restored body loads in.
  const onRestore = useCallback(
    (ts: number) => {
      setPreviewEntry(null);
      void restoreVersion(ts);
    },
    [restoreVersion],
  );

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

  // Summon: jump Home, focus the search bar, and scroll the gallery fully to the top
  // (so the bar is in full view, not mid-screen).
  const summonSearch = useCallback(() => {
    goHome();
    requestAnimationFrame(() => {
      const el = summonInputRef.current;
      el?.focus({ preventScroll: true });
      let p = el?.parentElement ?? null;
      while (p) {
        if (p.scrollHeight > p.clientHeight && getComputedStyle(p).overflowY !== "visible") {
          p.scrollTo({ top: 0, behavior: "smooth" });
          break;
        }
        p = p.parentElement;
      }
    });
  }, [goHome]);

  useGlobalShortcuts({
    newNote: () => void newNote(),
    closeActiveTab: () => {
      // ⌘W closes the current tab; on Home (nothing left to close) it puts Pensieve away
      // into the menu bar — the same hide-to-bar the red button triggers (Rust intercepts
      // CloseRequested and hides instead of quitting).
      if (!onHome) closeTabAndForget(activeTab);
      else if (IS_TAURI)
        void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().close());
    },
    togglePinCurrent: () => {
      if (!onHome && current) void togglePin(current.id);
    },
    syncNow: () => {
      // No-op when not connected.
      const s = syncRef.current;
      if (s.ui.phase !== "disconnected" && s.ui.phase !== "unavailable") void s.syncNow();
    },
    toggleDetails,
    toggleTimeline,
    toggleFocusMode: () => setFocusMode((v) => !v),
    toggleTheme: toggle,
    deleteCurrent: askDelete,
    summon: summonSearch,
    closePanels: () => {
      setTimelineOpen(false);
      setDetailsOpen(false);
      setFocusMode(false);
    },
  });

  // Menu-bar icon + global ⌘⇧N / ⌘⇧A (native shell) → the same new-note / Accio actions.
  useNativeCommands({
    newNote: () => void newNote(),
    summon: summonSearch,
  });

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
              onClose={closeTabAndForget}
            />
            {/* One tight group (gap-0.5) for every right-side control, so the sync rune
                sits in the same box as the 3-dots menu and the panel toggle — the header's
                gap-2 only separates this group from the tabs. */}
            <div className="flex shrink-0 items-center gap-0.5">
              <SyncStatus sync={sync} titleFor={titleFor} pending={pendingSync} />
              {onHome ? (
                <>
                  <IconButton label="New note" title="New note  ⌘N" onClick={() => void newNote()}>
                    <Plus size={18} />
                  </IconButton>
                  <GalleryCustomise
                    state={gallery.state}
                    onToggleField={gallery.toggleField}
                    onSetSnippetLines={gallery.setSnippetLines}
                    onSetWorkingSetPersist={gallery.setWorkingSetPersist}
                  />
                </>
              ) : (
                current && (
                  <>
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
                  </>
                )
              )}
            </div>
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
                    {previewEntry ? (
                      <div className="mx-auto max-w-[72ch]">
                        <div className="mb-3 flex items-center justify-between rounded border border-border bg-surface-sunken px-3 py-1.5 text-xs text-text-muted">
                          <span>
                            Past version · {new Date(previewEntry.ts).toLocaleString()} ·
                            read-only
                          </span>
                          <button
                            type="button"
                            className="text-accent hover:underline"
                            onClick={() => setPreviewEntry(null)}
                          >
                            Back to now
                          </button>
                        </div>
                        <NotePreview markdown={previewEntry.markdown ?? ""} theme={theme} />
                      </div>
                    ) : (
                      <Editor
                        key={`${current.id}:${loadEpoch}`}
                        markdown={current.markdown}
                        onChange={change}
                        focusMode={focusMode}
                        theme={theme}
                        selfId={current.id}
                        notes={notes}
                        onOpenNote={(id) => void open(id)}
                        savedPosition={editorPos.get(current.id)}
                        onSavePosition={saveEditorPos}
                      />
                    )}
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
                  reloadKey={loadEpoch}
                  previewTs={previewEntry?.ts ?? null}
                  onPreview={setPreviewEntry}
                  onRestore={onRestore}
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

              {/* "Split to Transcript" — a resizable right pane opened from an audio bar's
                  ⋯ / transcript icon (module pub/sub). Renders null until opened. */}
              <TranscriptSplit />
            </>
          )}
        </div>
      </main>

      <StatusWhisper status={status} />
      <MediaBackupWhisper />
      <ImageLightbox />
    </div>
  );
}

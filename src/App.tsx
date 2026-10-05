import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "./components/Editor";
import { Sidebar } from "./components/Sidebar";
import { TimelinePanel } from "./components/TimelinePanel";
import { DetailsPanel } from "./components/DetailsPanel";
import { OverflowMenu } from "./components/OverflowMenu";
import { FlaskButton } from "./components/FlaskButton";
import { TabBar, HOME, type ActiveTab } from "./components/TabBar";
import { IconButton } from "./components/IconButton";
import { Clock, PanelRight, Trash } from "./components/icons";
import { StatusWhisper } from "./components/StatusWhisper";
import { contentCharCount } from "./lib/text";
import { useNotes } from "./hooks/useNotes";
import { useTheme } from "./hooks/useTheme";
import { useFontScale } from "./hooks/useFontScale";
import { useCategoryDefs } from "./hooks/useCategoryDefs";
import type { SidebarState } from "./lib/sidebar/view";
import { loadState, saveState } from "./lib/sidebar/persist";

export default function App() {
  const { notes, current, status, open, create, remove, change, updateMeta, togglePin, setCreatedAt } =
    useNotes();
  const { theme, toggle } = useTheme();
  useFontScale();
  const categories = useCategoryDefs();
  // Native app: the macOS title bar is integrated (Overlay) — mark the root so the
  // sidebar top bar can inset its controls clear of the floating traffic lights.
  useEffect(() => {
    if ("__TAURI_INTERNALS__" in window) document.documentElement.classList.add("tauri");
  }, []);
  const [sidebarState, setSidebarState] = useState<SidebarState>(() => loadState());
  const changeSidebarState = useCallback((s: SidebarState) => {
    setSidebarState(s);
    saveState(s);
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>();

  // Tabs. The editor is shared and always shows `current`; a tab is an open note in
  // the top strip. "Home" is your main work — the note you reach by a normal sidebar
  // click; ⌘-clicking a note opens it in a tab instead, without disturbing home.
  const [tabIds, setTabIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>(HOME);
  const homeNoteId = useRef<string | undefined>(undefined);
  // While on Home, home tracks whatever note is open (normal clicks, ⌘N, initial).
  useEffect(() => {
    if (activeTab === HOME && current) homeNoteId.current = current.id;
  }, [activeTab, current]);
  // Drop tabs whose note no longer exists (e.g. deleted); fall back to Home if the
  // active tab was the one removed.
  useEffect(() => {
    setTabIds((ids) => {
      const live = ids.filter((id) => notes.some((n) => n.id === id));
      return live.length === ids.length ? ids : live;
    });
    setActiveTab((a) => (a !== HOME && !notes.some((n) => n.id === a) ? HOME : a));
  }, [notes]);
  const tabs = tabIds
    .map((id) => notes.find((n) => n.id === id))
    .filter(Boolean) as typeof notes;

  // Open a note. Normal → Home (your work); ⌘/Ctrl → a tab (opened and shown).
  const openNote = useCallback(
    (id: string, newTab?: boolean) => {
      if (newTab) {
        setTabIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
        setActiveTab(id);
      } else {
        setActiveTab(HOME);
      }
      void open(id);
    },
    [open],
  );

  const goHome = useCallback(() => {
    setActiveTab(HOME);
    if (homeNoteId.current) void open(homeNoteId.current);
  }, [open]);

  // A new note is your work — it opens on Home.
  const newNote = useCallback(() => {
    setActiveTab(HOME);
    void create();
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
        // If the closed tab was active, fall to a neighbour, else Home.
        setActiveTab((cur) => {
          if (cur !== id) return cur;
          const neighbour = next[idx] ?? next[idx - 1];
          if (neighbour) {
            void open(neighbour);
            return neighbour;
          }
          if (homeNoteId.current) void open(homeNoteId.current);
          return HOME;
        });
        return next;
      });
    },
    [open],
  );

  // Live set of tags in use across notes — the source for tag whispering. A tag
  // no longer on any note simply stops appearing here.
  const tagSuggestions = useMemo(
    () => Array.from(new Set(notes.flatMap((n) => n.tags ?? []))).sort(),
    [notes],
  );

  // The right dock holds one panel at a time — opening either closes the other.
  const toggleTimeline = useCallback(() => {
    if (!current) return;
    setTimelineOpen((v) => !v);
    setDetailsOpen(false);
  }, [current]);

  const toggleDetails = useCallback(() => {
    if (!current) return;
    setDetailsOpen((v) => !v);
    setTimelineOpen(false);
  }, [current]);

  const askDelete = useCallback(() => {
    if (!current) return;
    if (confirmDelete) {
      setConfirmDelete(false);
      void remove(current.id);
      return;
    }
    setConfirmDelete(true);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmDelete(false), 3000);
  }, [current, confirmDelete, remove]);

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
        newNote();
      } else if (k === "w") {
        // ⌘W closes the active tab (no-op on Home).
        e.preventDefault();
        if (activeTab !== HOME) closeTab(activeTab);
      } else if (k === "p") {
        // ⌘P pins/unpins the open note (overrides the browser print dialog).
        e.preventDefault();
        if (current) void togglePin(current.id);
      } else if (e.code === "Backslash") {
        // ⌘\ toggles the left sidebar; ⌘⇧\ toggles the right Details panel.
        e.preventDefault();
        if (e.shiftKey) toggleDetails();
        else setSidebarOpen((v) => !v);
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
      } else if (k === "s") {
        e.preventDefault(); // reassurance no-op; autosave already handles it
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newNote, current, toggle, askDelete, toggleTimeline, toggleDetails, togglePin, activeTab, closeTab]);

  const showChrome = !focusMode;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface text-text">
      {showChrome && sidebarOpen && (
        <Sidebar
          notes={notes}
          state={sidebarState}
          categoryDefs={categories.defs}
          currentId={current?.id}
          onOpen={openNote}
          onNew={newNote}
          onTogglePin={(id) => void togglePin(id)}
          onChangeState={changeSidebarState}
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        {showChrome && (
          <header
            data-tauri-drag-region
            className="flex h-11 items-center gap-2 border-b border-border bg-surface-sunken px-3"
          >
            <TabBar
              tabs={tabs}
              active={activeTab}
              onHome={goHome}
              onSelect={selectTab}
              onClose={closeTab}
            />
            {current && (
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
            )}
          </header>
        )}

        <div className="flex min-h-0 flex-1">
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
        </div>
      </main>

      <StatusWhisper status={status} />
    </div>
  );
}

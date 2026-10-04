import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "./components/Editor";
import { Sidebar } from "./components/Sidebar";
import { TimelinePanel } from "./components/TimelinePanel";
import { DetailsPanel } from "./components/DetailsPanel";
import { OverflowMenu } from "./components/OverflowMenu";
import { IconButton } from "./components/IconButton";
import { Clock, PanelRight } from "./components/icons";
import { StatusWhisper } from "./components/StatusWhisper";
import { useNotes } from "./hooks/useNotes";
import { useTheme } from "./hooks/useTheme";
import type { SidebarView } from "./lib/sidebar/view";
import { loadView, saveView } from "./lib/sidebar/persist";

export default function App() {
  const { notes, current, status, open, create, remove, change, updateMeta, togglePin } =
    useNotes();
  const { theme, toggle } = useTheme();
  const [view, setView] = useState<SidebarView>(() => loadView());
  const changeView = useCallback((v: SidebarView) => {
    setView(v);
    saveView(v);
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>();

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
        void create();
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
  }, [create, current, toggle, askDelete, toggleTimeline, toggleDetails, togglePin]);

  const showChrome = !focusMode;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface text-text">
      {showChrome && sidebarOpen && (
        <Sidebar
          notes={notes}
          view={view}
          currentId={current?.id}
          onOpen={(id) => void open(id)}
          onNew={() => void create()}
          onTogglePin={(id) => void togglePin(id)}
          onChangeView={changeView}
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        {showChrome && (
          <header className="flex h-11 items-center justify-end px-3">
            {current && (
              <div className="flex items-center gap-0.5">
                <OverflowMenu
                  items={[
                    {
                      icon: <Clock size={16} />,
                      label: "Timeline",
                      shortcut: "⌘T",
                      onSelect: toggleTimeline,
                      active: timelineOpen,
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
              onClose={() => setDetailsOpen(false)}
              onOpenNote={(id) => void open(id)}
              updateMeta={updateMeta}
            />
          )}
        </div>
      </main>

      <StatusWhisper status={status} />
    </div>
  );
}

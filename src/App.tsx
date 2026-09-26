import { useCallback, useEffect, useRef, useState } from "react";
import { Editor } from "./components/Editor";
import { Sidebar } from "./components/Sidebar";
import { TimelinePanel } from "./components/TimelinePanel";
import { StatusWhisper } from "./components/StatusWhisper";
import { useNotes } from "./hooks/useNotes";
import { useTheme } from "./hooks/useTheme";

export default function App() {
  const { notes, current, status, open, create, remove, change } = useNotes();
  const { theme, toggle } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>();

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
          setFocusMode(false);
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "n") {
        e.preventDefault();
        void create();
      } else if (k === "\\") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      } else if (k === "t") {
        e.preventDefault();
        if (current) setTimelineOpen((v) => !v);
      } else if (k === ".") {
        e.preventDefault();
        setFocusMode((v) => !v);
      } else if (k === "l" && e.shiftKey) {
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
  }, [create, current, toggle, askDelete]);

  const showChrome = !focusMode;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface text-text">
      {showChrome && sidebarOpen && (
        <Sidebar
          notes={notes}
          currentId={current?.id}
          onOpen={(id) => void open(id)}
          onNew={() => void create()}
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        {showChrome && (
          <header className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="text-sm font-medium">Pensieve</span>
            <div className="flex items-center gap-1 text-text-muted">
              {current && (
                <button
                  className="rounded px-2 py-1 text-sm hover:bg-surface-raised hover:text-text"
                  onClick={() => setTimelineOpen((v) => !v)}
                  title="Timeline  ⌘T"
                >
                  Timeline
                </button>
              )}
              <button
                className="rounded px-2 py-1 text-sm hover:bg-surface-raised hover:text-text"
                onClick={toggle}
                title="Toggle theme  ⌘⇧L"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? "☀" : "☾"}
              </button>
            </div>
          </header>
        )}

        <div className="flex min-h-0 flex-1">
          <section className="flex-1 overflow-y-auto">
            {current ? (
              <div className="mx-auto w-full max-w-[68ch] px-8 py-10">
                {confirmDelete && (
                  <div className="mb-4 rounded border border-danger/40 bg-danger/10 px-3 py-1.5 text-sm text-danger">
                    Press ⌘⌫ again to delete this note.
                  </div>
                )}
                <Editor
                  key={current.id}
                  markdown={current.markdown}
                  onChange={change}
                  focusMode={focusMode}
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
        </div>
      </main>

      <StatusWhisper status={status} />
    </div>
  );
}

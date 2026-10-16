import { useEffect, useRef } from "react";

// The app's global keyboard map, lifted out of App. This hook OWNS the key→action
// mapping (including the ⌘A "are we editing text?" guard); each action is a semantic
// callback the caller wires — so no-op guards (on Home, no note, not connected) live
// with the caller, and this stays a pure dispatcher.
export interface GlobalShortcutActions {
  newNote: () => void; // ⌘N
  closeActiveTab: () => void; // ⌘W
  togglePinCurrent: () => void; // ⌘P
  syncNow: () => void; // ⌘S
  toggleDetails: () => void; // ⌘⇧\
  toggleTimeline: () => void; // ⌘T
  toggleFocusMode: () => void; // ⌘.
  toggleTheme: () => void; // ⌘⇧L
  deleteCurrent: () => void; // ⌘⌫
  summon: () => void; // ⌘A (⌘⇧A while editing text)
  closePanels: () => void; // Escape (no modifier)
}

export function useGlobalShortcuts(actions: GlobalShortcutActions): void {
  // Keep the latest actions in a ref so the listener attaches once and never goes stale.
  const ref = useRef(actions);
  ref.current = actions;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = ref.current;
      if (!(e.metaKey || e.ctrlKey)) {
        if (e.key === "Escape") a.closePanels();
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "n" && !e.shiftKey) {
        // Plain ⌘N makes a note in-app. ⌘⇧N is the native global hotkey (handled by the
        // Rust shell → useNativeCommands), so we leave it alone here to avoid double-create.
        e.preventDefault();
        a.newNote();
      } else if (k === "w") {
        e.preventDefault();
        a.closeActiveTab();
      } else if (k === "p") {
        // ⌘P pins/unpins the open note (overrides the browser print dialog).
        e.preventDefault();
        a.togglePinCurrent();
      } else if (k === "s") {
        // ⌘S syncs now (overrides the browser "save page").
        e.preventDefault();
        a.syncNow();
      } else if (e.code === "Backslash" && e.shiftKey) {
        // ⌘⇧\ toggles the right Details panel.
        e.preventDefault();
        a.toggleDetails();
      } else if (k === "t") {
        e.preventDefault();
        a.toggleTimeline();
      } else if (k === ".") {
        e.preventDefault();
        a.toggleFocusMode();
      } else if (k === "l" && e.shiftKey) {
        // Dev/keyboard theme toggle; the native macOS menu owns this in the app.
        e.preventDefault();
        a.toggleTheme();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        a.deleteCurrent();
      } else if (k === "a") {
        // ⌘A summons. While writing text (input / textarea / editor), plain ⌘A must stay
        // "select all", so there we require ⌘⇧A; anywhere else plain ⌘A summons.
        const t = e.target as HTMLElement | null;
        const editing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
        if (editing && !e.shiftKey) return;
        e.preventDefault();
        a.summon();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

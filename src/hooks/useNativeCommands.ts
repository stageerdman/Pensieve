import { useEffect, useRef } from "react";

// The native shell drives two things from outside the webview: the menu-bar icon's menu
// (New memory / Accio) and the global hotkeys ⌘⇧N / ⌘⇧A. In both cases Rust reveals the
// window and emits an intent over the same event bridge the Appearance menu already uses
// (see useTheme). Here we map those intents onto the app's EXISTING actions — no new
// note-creation or search logic. Handlers live in a ref so the listeners attach once and
// never go stale.
//
// Note on double-fire: when the window is already focused, ⌘⇧A triggers BOTH the OS hotkey
// (→ this `summon`) and the in-app keydown — both call the same idempotent summonSearch, so
// it's harmless. ⌘⇧N is kept off the in-app map (that guards plain ⌘N) so only this fires.

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface NativeCommands {
  newNote: () => void; // ⌘⇧N / tray "New memory"
  summon: () => void; // ⌘⇧A / tray "Accio"
}

export function useNativeCommands(handlers: NativeCommands): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!inTauri) return;
    const unlisteners: Array<() => void> = [];
    let disposed = false;
    const add = (un: () => void) => (disposed ? un() : unlisteners.push(un));
    void import("@tauri-apps/api/event").then(({ listen }) => {
      void listen("new-note", () => ref.current.newNote()).then(add);
      void listen("summon", () => ref.current.summon()).then(add);
    });
    return () => {
      disposed = true;
      unlisteners.forEach((un) => un());
    };
  }, []);
}

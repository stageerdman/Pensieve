import { useEffect } from "react";

// Reading/writing text size, persisted. Lives in the native macOS Appearance menu
// (Text Size: Small / Default / Large / Larger) which emits a `set-font-scale` event
// the webview applies to the `--font-scale` root variable. Only the editor's text
// multiplies by this variable (see index.css / blocknote-skin.css) — the chrome
// stays a fixed size.

const KEY = "pensieve:font-scale";
const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function apply(scale: string) {
  document.documentElement.style.setProperty("--font-scale", scale);
  localStorage.setItem(KEY, scale);
}

export function useFontScale() {
  useEffect(() => {
    apply(localStorage.getItem(KEY) ?? "1"); // restore on launch
    if (!inTauri) return;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<string>("set-font-scale", (e) => apply(e.payload)).then((un) => {
        unlisten = un;
      }),
    );
    return () => unlisten?.();
  }, []);
}

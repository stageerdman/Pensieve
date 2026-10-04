import { useEffect, useState } from "react";

// Light/dark theme, persisted. Applies the `dark` class to <html> so the CSS
// variable tokens (index.css) switch the whole app from one place. In the native
// app the control lives in the macOS menu bar (Appearance) — the Rust shell emits
// a `set-theme` event which we listen for here. A dev-only ⌘⇧L toggle remains for
// the browser, where there is no native menu.

type Theme = "light" | "dark";
const KEY = "pensieve:theme";

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

function initial(): Theme {
  const saved = localStorage.getItem(KEY) as Theme | null;
  return saved ?? systemTheme();
}

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(KEY, theme);
  }, [theme]);

  // Native menu → theme. "system" resolves to the current OS preference.
  useEffect(() => {
    if (!inTauri) return;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<string>("set-theme", (e) => {
        setTheme(e.payload === "system" ? systemTheme() : (e.payload as Theme));
      }).then((un) => {
        unlisten = un;
      }),
    );
    return () => unlisten?.();
  }, []);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  return { theme, toggle };
}

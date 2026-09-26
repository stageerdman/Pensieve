import { useEffect, useState } from "react";

// Light/dark theme, persisted. Applies the `dark` class to <html> so the CSS
// variable tokens (index.css) switch the whole app from one place.

type Theme = "light" | "dark";
const KEY = "pensieve:theme";

function initial(): Theme {
  const saved = localStorage.getItem(KEY) as Theme | null;
  if (saved) return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
    ? "dark"
    : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  return { theme, toggle };
}

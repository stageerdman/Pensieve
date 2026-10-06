import { useEffect, useState } from "react";

// Whether the native window is in macOS fullscreen. In fullscreen the traffic-light
// buttons are gone, so the header can reclaim the left inset normally reserved for
// them. Browser (non-Tauri): always false — there is no native title bar there.

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function useFullscreen() {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!inTauri) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      const sync = async () => {
        try {
          const fs = await win.isFullscreen();
          if (!cancelled) setFullscreen(fs);
        } catch {
          /* window gone during teardown */
        }
      };
      await sync();
      // Entering/leaving macOS fullscreen resizes the window, so re-check on resize.
      const un = await win.onResized(() => void sync());
      if (cancelled) un();
      else unlisten = un;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return fullscreen;
}

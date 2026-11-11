import { useEffect } from "react";

// tauri.conf.json sets dragDropEnabled:false on the main window (MEDIA-IMAGES, 2026-10-14)
// so the DOM gets real HTML5 dragover/drop events instead of Tauri swallowing them — that's
// what lets the editor's own image/audio/video drop handling (imagePasteDrop.ts) work at
// all. The cost: with Tauri's native handling off, WKWebView's OWN default behavior for any
// drop nothing calls preventDefault() on is to navigate the whole window to the dropped
// file's file:// URL, rendering it as raw content and replacing the entire Pensieve UI —
// found the hard way (AGENT-RAG) when a new drop zone outside the editor invited exactly
// that drop. A feature-specific handler calling preventDefault() only protects its own
// element; anywhere else in the window was always one stray drop away from this. This is
// the one global, permanent backstop: every dragover/drop in the app gets preventDefault()
// called on it here regardless of whether something more specific also handles it (calling
// preventDefault() twice is harmless, and this listener never calls stopPropagation, so
// feature-specific handlers still see and act on the event first).
export function useGlobalDropGuard() {
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);
}

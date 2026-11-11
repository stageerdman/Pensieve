// Window-level native file drop — a sandboxed HTML5 `drop` handler only hands back
// `File` blobs, not a real filesystem path; Tauri's `onDragDropEvent` gives the real
// paths a Tauri command actually needs (e.g. to copy a file in or ingest it). `enabled`
// lets a caller only listen while its own drop target is the one actually in view.
//
// Generic Tauri primitive, not specific to any one feature. Ported from masters-wheel's
// src/lib/useWindowFileDrop.ts (AGENT-RAG).

import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";

export function useWindowFileDrop(
  enabled: boolean,
  onDrop: (paths: string[]) => void,
) {
  const [isDragActive, setIsDragActive] = useState(false);

  useEffect(() => {
    if (!isTauri() || !enabled) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setIsDragActive(true);
        } else if (event.payload.type === "drop") {
          setIsDragActive(false);
          onDrop(event.payload.paths);
        } else if (event.payload.type === "leave") {
          setIsDragActive(false);
        }
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((error) =>
        console.error("Failed to register drag-and-drop listener:", error),
      );
    return () => {
      cancelled = true;
      unlisten?.();
      setIsDragActive(false);
    };
  }, [onDrop, enabled]);

  return isDragActive;
}

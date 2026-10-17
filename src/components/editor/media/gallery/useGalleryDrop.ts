import { useCallback, useEffect, useRef } from "react";
import { log } from "../../../../lib/logger";

// The ONE owner of "a file was dropped on the gallery". A gallery accepts images AND
// recordings; this hook returns a callback ref for the gallery root that wires NATIVE
// drag/drop listeners in the CAPTURE phase.
//
// Why native + capture: in the WKWebView shell React's synthetic onDrop fires too late to
// beat ProseMirror/BlockNote's own view.dom drop handlers (which would otherwise insert a
// stray `file` block), and its dataTransfer is flaky for audio. A capture-phase listener on
// the gallery root runs BEFORE view.dom's handlers (capture descends the tree), so
// stopPropagation keeps BlockNote out and we read a dependable dataTransfer first.

// Audio matched by MIME OR filename — a dragged mp3's File.type is often empty in the shell.
const AUDIO_NAME = /\.(mp3|wav|m4a|aac|webm|ogg|flac)$/i;
const isGalleryFile = (f: File): boolean =>
  f.type.startsWith("image/") || f.type.startsWith("audio/") || AUDIO_NAME.test(f.name);

export function mediaFromDT(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  const out: File[] = [];
  for (const f of Array.from(dt.files)) if (isGalleryFile(f)) out.push(f);
  if (!out.length)
    for (const it of Array.from(dt.items ?? []))
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f && isGalleryFile(f)) out.push(f);
      }
  return out;
}

const dragHasFiles = (dt: DataTransfer | null): boolean =>
  !!dt && (Array.from(dt.types).includes("Files") || dt.files.length > 0);

interface Opts {
  enabled: boolean;
  onFiles: (files: File[]) => void;
  setDragOver: (v: boolean) => void;
  /** For log correlation (the block id). */
  debugId: string;
}

export function useGalleryDrop({ enabled, onFiles, setDragOver, debugId }: Opts) {
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;
  const cleanup = useRef<(() => void) | null>(null);

  const ref = useCallback(
    (el: HTMLElement | null) => {
      cleanup.current?.();
      cleanup.current = null;
      if (!el || !enabled) return;

      const allow = (e: DragEvent) => {
        if (!dragHasFiles(e.dataTransfer)) return;
        e.preventDefault(); // mark a valid drop target (or the drop never fires)
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        setDragOver(true);
      };
      const leave = (e: DragEvent) => {
        if (!el.contains(e.relatedTarget as Node)) setDragOver(false);
      };
      const drop = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const files = mediaFromDT(e.dataTransfer);
        log.info("media", "gallery.nativeDrop", {
          id: debugId,
          files: Array.from(e.dataTransfer?.files ?? []).map((f) => `${f.name}:${f.type || "?"}`),
          items: Array.from(e.dataTransfer?.items ?? []).map((i) => `${i.kind}:${i.type || "?"}`),
          accepted: files.length,
        });
        onFilesRef.current(files);
      };

      const cap = true; // capture phase: beat view.dom's own drop handlers
      el.addEventListener("dragenter", allow, cap);
      el.addEventListener("dragover", allow, cap);
      el.addEventListener("dragleave", leave, cap);
      el.addEventListener("drop", drop, cap);
      log.debug("media", "gallery.dropListeners.attached", { id: debugId });
      cleanup.current = () => {
        el.removeEventListener("dragenter", allow, cap);
        el.removeEventListener("dragover", allow, cap);
        el.removeEventListener("dragleave", leave, cap);
        el.removeEventListener("drop", drop, cap);
      };
    },
    [enabled, debugId, setDragOver],
  );

  useEffect(() => () => cleanup.current?.(), []);
  return ref;
}

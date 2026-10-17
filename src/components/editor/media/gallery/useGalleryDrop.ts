import { useCallback, useEffect, useRef } from "react";
import { log } from "../../../../lib/logger";

// The ONE owner of "a file was dropped on the gallery". A gallery accepts images AND
// recordings.
//
// Why this is wired at the DOCUMENT level in the CAPTURE phase (not on the gallery element):
// a drag's events were never reaching the gallery element at all (verified — no gallery drop
// log fired), so the gallery never became a drop target and the browser only offered
// BlockNote's between-block positions. ProseMirror/BlockNote register their own drop handlers
// on the editor root and can swallow the gesture before it descends to our node. A
// document-level capture listener fires before ALL of them; we hit-test the cursor against
// THIS gallery's element (elementFromPoint ∈ gallery) and, when it's over us, preventDefault
// to accept the drop and stopPropagation so BlockNote never sees it.

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
  const elRef = useRef<HTMLElement | null>(null);

  // The gallery root — stored, then hit-tested inside the document listeners.
  const ref = useCallback((el: HTMLElement | null) => {
    elRef.current = el;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Attach to the editor's ProseMirror root (capture phase) — an ancestor of view.dom, so
    // we still run before BlockNote's own drop handlers, but scoped to this editor rather
    // than the whole document (which added global-listener overhead). Fall back to document
    // if the root isn't found yet.
    const root: Document | Element = elRef.current?.closest(".ProseMirror") ?? document;
    const overThis = (e: DragEvent): boolean => {
      const el = elRef.current;
      if (!el) return false;
      const pt = document.elementFromPoint(e.clientX, e.clientY);
      return !!pt && el.contains(pt);
    };
    const over = (e: DragEvent) => {
      const on = dragHasFiles(e.dataTransfer) && overThis(e);
      if (!on) {
        setDragOver(false);
        return; // not over us → let BlockNote's normal handling run
      }
      e.preventDefault(); // accept the drop here (or the browser rejects it)
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      setDragOver(true);
    };
    const drop = (e: DragEvent) => {
      if (!overThis(e)) {
        setDragOver(false);
        return;
      }
      e.preventDefault();
      e.stopPropagation(); // keep ProseMirror/BlockNote out of a drop that's ours
      setDragOver(false);
      const files = mediaFromDT(e.dataTransfer);
      log.debug("media", "gallery.nativeDrop", {
        id: debugId,
        files: Array.from(e.dataTransfer?.files ?? []).map((f) => `${f.name}:${f.type || "?"}`),
        items: Array.from(e.dataTransfer?.items ?? []).map((i) => `${i.kind}:${i.type || "?"}`),
        accepted: files.length,
      });
      onFilesRef.current(files);
    };
    const end = () => setDragOver(false);

    // Capture phase on the editor root — ahead of the editor's own drop handlers.
    root.addEventListener("dragover", over as EventListener, true);
    root.addEventListener("drop", drop as EventListener, true);
    root.addEventListener("dragend", end as EventListener, true);
    return () => {
      root.removeEventListener("dragover", over as EventListener, true);
      root.removeEventListener("drop", drop as EventListener, true);
      root.removeEventListener("dragend", end as EventListener, true);
    };
  }, [enabled, debugId, setDragOver]);

  return ref;
}

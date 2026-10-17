import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

// Cmd+V paste and drag-drop of image files, added through BlockNote's
// `_tiptapOptions.extensions` escape hatch (modelled on blockSelectionDecorations). The
// plugin only DETECTS images and the drop target; the actual save+insert is delegated to
// a handler the Editor registers (it owns the BlockNote editor + note id). A calm full-
// editor accent-glow ring + a thin insertion caret show where a drop will land; non-image
// drops are rejected with one quiet toast.

// files[] + the block id to insert after (null = at the text cursor).
type FilesHandler = (files: File[], atBlockId: string | null) => void;
type Reject = (reason: string) => void;

let onFiles: FilesHandler | null = null;
let onReject: Reject | null = null;
export const setImageDropHandlers = (h: FilesHandler | null, reject: Reject | null) => {
  onFiles = h;
  onReject = reject;
};

// Pull image files from a clipboard/drag payload. A COPIED image (⌘C from Preview, a
// browser, a screenshot) usually arrives only in `items` as a file-kind entry — NOT in
// `.files` — so we must check both, or paste silently falls through to the default handler
// (which drops a "image.png" text node). Dedupe isn't needed: items and files don't overlap
// for the same payload in practice, but we guard with a name/size set just in case.
const imagesFrom = (dt: DataTransfer | null): File[] => {
  if (!dt) return [];
  const out: File[] = [];
  const seen = new Set<string>();
  const add = (f: File | null) => {
    if (!f || !f.type.startsWith("image/")) return;
    const k = `${f.name}:${f.size}:${f.type}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(f);
  };
  Array.from(dt.files).forEach(add);
  Array.from(dt.items ?? []).forEach((it) => {
    if (it.kind === "file") add(it.getAsFile());
  });
  return out;
};

// Audio files from a drop (recordings dropped into a gallery / the editor). Routed here —
// not through the gallery's React onDrop — because the synthetic drop's dataTransfer is
// unreliable for audio in the WKWebView shell; the native PM drop event is dependable.
const audioFrom = (dt: DataTransfer | null): File[] => {
  if (!dt) return [];
  const out: File[] = [];
  const add = (f: File | null) => { if (f && f.type.startsWith("audio/")) out.push(f); };
  Array.from(dt.files).forEach(add);
  if (!out.length) Array.from(dt.items ?? []).forEach((it) => { if (it.kind === "file") add(it.getAsFile()); });
  return out;
};

const hasFiles = (dt: DataTransfer | null): boolean =>
  !!dt &&
  (Array.from(dt.types).includes("Files") ||
    dt.files.length > 0 ||
    Array.from(dt.items ?? []).some((it) => it.kind === "file"));

// The block element under a point (for drop targeting). Null → fall back to the cursor.
function blockIdAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y)?.closest("[data-id]") as HTMLElement | null;
  return el?.getAttribute("data-id") ?? null;
}

const key = new PluginKey("pensieveImagePasteDrop");

function surface(view: EditorView): HTMLElement {
  return (view.dom.closest(".pensieve-editor") as HTMLElement) ?? view.dom;
}

export const ImagePasteDrop = Extension.create({
  name: "pensieveImagePasteDrop",
  addProseMirrorPlugins() {
    let caret: HTMLDivElement | null = null;

    const clearCaret = (view: EditorView) => {
      surface(view).classList.remove("pensieve-dropping");
      caret?.remove();
      caret = null;
    };

    const showCaret = (view: EditorView, x: number, y: number) => {
      surface(view).classList.add("pensieve-dropping");
      const el = document.elementFromPoint(x, y)?.closest("[data-id]") as HTMLElement | null;
      const content = el?.querySelector(":scope > .bn-block-content") ?? el;
      if (!content) return;
      const r = content.getBoundingClientRect();
      if (!caret) {
        caret = document.createElement("div");
        caret.className = "pensieve-media-caret";
        document.body.appendChild(caret);
      }
      // Below the hovered block (insert after) — or above if the pointer is in its top half.
      const below = y > r.top + r.height / 2;
      caret.style.left = `${r.left}px`;
      caret.style.width = `${r.width}px`;
      caret.style.top = `${below ? r.bottom : r.top}px`;
    };

    return [
      new Plugin({
        key,
        props: {
          handlePaste: (_view, event) => {
            const files = imagesFrom(event.clipboardData);
            if (!files.length) return false;
            event.preventDefault();
            onFiles?.(files, null); // at the cursor
            return true;
          },
          handleDOMEvents: {
            dragover: (view, event) => {
              if (!hasFiles(event.dataTransfer)) return false;
              event.preventDefault();
              showCaret(view, event.clientX, event.clientY);
              return false;
            },
            dragleave: (view, event) => {
              // Only clear when the pointer actually leaves the editor surface.
              const to = event.relatedTarget as Node | null;
              if (!to || !surface(view).contains(to)) clearCaret(view);
              return false;
            },
            drop: (view, event) => {
              if (!hasFiles(event.dataTransfer)) return false;
              const target = blockIdAt(event.clientX, event.clientY);
              const over = document.elementFromPoint(event.clientX, event.clientY) as Element | null;
              const onMedia = !!over?.closest(".pensieve-gallery, .pensieve-media");
              const images = imagesFrom(event.dataTransfer);
              const audio = audioFrom(event.dataTransfer);

              // A drop ONTO a media block (image / gallery) is that block's own gesture. Images
              // are handled by the block's React onDrop (works) — so bail. But audio can't ride
              // that path reliably, so WE route it (onFiles → insertImagesSmart merges it into
              // the gallery as a waveform card).
              if (onMedia) {
                if (audio.length) { event.preventDefault(); clearCaret(view); onFiles?.(audio, target); return true; }
                return false;
              }

              // Open editor space: handle image + audio file drops here (audio alone → an audio
              // block; mixed/2+ → a gallery). Only a genuinely unsupported file type is rejected.
              event.preventDefault();
              clearCaret(view);
              const media = [...images, ...audio];
              if (!media.length) {
                onReject?.("That file isn’t an image or recording.");
                return true;
              }
              onFiles?.(media, target);
              return true;
            },
          },
        },
      }),
    ];
  },
});

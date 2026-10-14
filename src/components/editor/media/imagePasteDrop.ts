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

const imagesFrom = (dt: DataTransfer | null): File[] =>
  dt ? Array.from(dt.files).filter((f) => f.type.startsWith("image/")) : [];

const hasFiles = (dt: DataTransfer | null): boolean =>
  !!dt && (Array.from(dt.types).includes("Files") || dt.files.length > 0);

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
              event.preventDefault();
              const target = blockIdAt(event.clientX, event.clientY);
              clearCaret(view);
              const images = imagesFrom(event.dataTransfer);
              if (!images.length) {
                onReject?.("That file isn’t an image.");
                return true;
              }
              onFiles?.(images, target);
              return true;
            },
          },
        },
      }),
    ];
  },
});

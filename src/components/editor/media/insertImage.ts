// The ONE insert funnel (wiki "Desktop single image"): every entry point — the editor's
// uploadFile, the `/image` slash item, Cmd+V paste, and drag-drop — saves bytes through
// the Phase-0 store flow and shows the image instantly from a local object url, swapping
// to the resolved (asset/blob) url once saveMedia completes (the "saving" state).

import { getStore } from "../../../lib/store";
import { resolveMediaUrl } from "../../../lib/media/url";
import { DEFAULT_IMAGE_WIDTH } from "../../../lib/md/image";
import { log } from "../../../lib/logger";

// The minimal editor surface the insert flow needs — BlockNote's full generic type
// over-constrains these, so we adapt to a small interface (as elsewhere in the editor).
export interface InsertEditor {
  insertBlocks: (blocks: unknown[], ref: unknown, placement?: "before" | "after") => Array<{ id: string }>;
  updateBlock: (id: unknown, update: unknown) => void;
  getTextCursorPosition: () => { block: { id: string } };
}

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/heic": "heic",
};

/** A sensible file extension for a pasted/dropped image (from name, else mime). */
export function extForFile(file: File | Blob): string {
  const name = (file as File).name ?? "";
  const dot = name.lastIndexOf(".");
  if (dot > 0 && dot < name.length - 1) return name.slice(dot + 1).toLowerCase();
  return MIME_EXT[file.type] ?? "png";
}

/** Phase-0 flow: save bytes → ref, resolve ref → loadable url (also registers the pair). */
export async function saveImageFile(noteId: string, file: File | Blob): Promise<{ ref: string; url: string | null }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ref = await getStore().saveMedia(noteId, bytes, extForFile(file));
  const url = await resolveMediaUrl(ref);
  return { ref, url };
}

/** The editor's `uploadFile` — saves and returns the loadable url (BlockNote's funnel). */
export function makeUploadFile(getNoteId: () => string) {
  return async (file: File): Promise<string> => {
    const { url, ref } = await saveImageFile(getNoteId(), file);
    log.info("media", "upload", { ref });
    return url ?? ref;
  };
}

/** Insert an image block, showing a local object url instantly and swapping to the saved
 *  url when persistence completes. Returns the new block id. */
export async function insertImageFromFile(
  editor: InsertEditor,
  noteId: string,
  file: File | Blob,
  referenceBlockId?: string,
  placement: "before" | "after" = "after",
): Promise<string> {
  const localUrl = URL.createObjectURL(file);
  const ref = referenceBlockId ?? editor.getTextCursorPosition().block.id;
  const [block] = editor.insertBlocks(
    [{ type: "image", props: { url: localUrl, caption: "", width: DEFAULT_IMAGE_WIDTH, status: "saving" } }],
    ref,
    placement,
  );
  log.info("media", "insert", { id: block.id, noteId });
  void persist(editor, noteId, file, block.id, localUrl);
  return block.id;
}

/** Save bytes for an already-inserted block (e.g. the `/image` prompt's file pick). */
export async function persistIntoBlock(
  editor: InsertEditor,
  noteId: string,
  file: File | Blob,
  blockId: string,
): Promise<void> {
  const localUrl = URL.createObjectURL(file);
  editor.updateBlock(blockId, { props: { url: localUrl, status: "saving" } });
  await persist(editor, noteId, file, blockId, localUrl);
}

async function persist(editor: InsertEditor, noteId: string, file: File | Blob, blockId: string, localUrl: string) {
  try {
    const { url } = await saveImageFile(noteId, file);
    editor.updateBlock(blockId, { props: { url: url ?? localUrl, status: "" } });
  } catch (e) {
    log.error("media", "insert.error", { blockId, error: String(e) });
    editor.updateBlock(blockId, { props: { status: "" } });
  } finally {
    // Keep the object url alive long enough for the swap to paint, then release it.
    setTimeout(() => URL.revokeObjectURL(localUrl), 10_000);
  }
}

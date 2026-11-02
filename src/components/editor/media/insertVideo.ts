// Video insert funnel — mirrors insertAudio's saveAudioFile, with a video MIME→ext map.
// Used by the empty video-block placeholder (upload / drag-drop). Bytes flow through the
// same store.saveMedia → resolveMediaUrl path as every other media kind.

import { getStore } from "../../../lib/store";
import { resolveMediaUrl } from "../../../lib/media/url";
import { log } from "../../../lib/logger";

// The minimal editor surface video insertion needs (mirrors insertImage's InsertEditor).
export interface InsertEditor {
  updateBlock: (id: unknown, update: unknown) => void;
  insertBlocks?: (blocks: unknown[], ref: unknown, placement?: "before" | "after") => Array<{ id: string }>;
  getTextCursorPosition?: () => { block: { id: string } };
}

const VIDEO_MIME_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "video/x-matroska": "mkv",
};

/** A sensible file extension for a chosen/dropped video file (from name, else mime). */
export function videoExtForFile(file: File | Blob): string {
  const name = (file as File).name ?? "";
  const dot = name.lastIndexOf(".");
  if (dot > 0 && dot < name.length - 1) return name.slice(dot + 1).toLowerCase();
  const mime = (file.type || "").split(";")[0].trim().toLowerCase();
  return VIDEO_MIME_EXT[mime] ?? "mp4";
}

/** Save video bytes → vault ref, resolve ref → loadable url (registers the pair for save). */
export async function saveVideoFile(
  noteId: string,
  file: File | Blob,
): Promise<{ ref: string; url: string | null }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ref = await getStore().saveMedia(noteId, bytes, videoExtForFile(file));
  const url = await resolveMediaUrl(ref);
  log.info("media", "video.save", { ref });
  return { ref, url };
}

/** Insert a standalone video block for a dropped/pasted file at/after `referenceBlockId`
 *  (defaults to the text cursor) — mirrors insertImage's insertImageFromFile. A video is
 *  never merged into a gallery or an adjacent block, so this is the ONE path a drop takes,
 *  unlike images which go through insertGroup's merge/group planner first. */
export async function insertVideoFromFile(
  editor: InsertEditor,
  noteId: string,
  file: File | Blob,
  referenceBlockId?: string,
  placement: "before" | "after" = "after",
): Promise<string> {
  const localUrl = URL.createObjectURL(file);
  const ref = referenceBlockId ?? editor.getTextCursorPosition!().block.id;
  const [block] = editor.insertBlocks!(
    [{ type: "video", props: { url: localUrl, caption: "", status: "saving" } }],
    ref,
    placement,
  );
  log.info("media", "video.insert", { id: block.id, noteId });
  try {
    const { url } = await saveVideoFile(noteId, file);
    editor.updateBlock(block.id, { props: { url: url ?? localUrl, status: "" } });
  } catch (e) {
    log.error("media", "video.insert.error", { blockId: block.id, error: String(e) });
    editor.updateBlock(block.id, { props: { status: "" } });
  } finally {
    setTimeout(() => URL.revokeObjectURL(localUrl), 10_000);
  }
  return block.id;
}

/** Save bytes for an already-inserted (empty) video block — mirrors insertImage's
 *  persistIntoBlock: shows a local object url instantly (status "saving"), swaps to the
 *  resolved vault url once the write completes. */
export async function persistVideoIntoBlock(
  editor: InsertEditor,
  noteId: string,
  file: File | Blob,
  blockId: string,
): Promise<void> {
  const localUrl = URL.createObjectURL(file);
  editor.updateBlock(blockId, { props: { url: localUrl, status: "saving" } });
  try {
    const { url } = await saveVideoFile(noteId, file);
    editor.updateBlock(blockId, { props: { url: url ?? localUrl, status: "" } });
  } catch (e) {
    log.error("media", "video.insert.error", { blockId, error: String(e) });
    editor.updateBlock(blockId, { props: { status: "" } });
  } finally {
    setTimeout(() => URL.revokeObjectURL(localUrl), 10_000);
  }
}

// Emergent gallery creation / merge — the orchestration above the single-image funnel
// (insertImage.ts). Every image still saves through saveImageFile (the Phase-0/1 flow);
// this module only decides WHETHER a set of incoming images becomes a new imageGroup,
// joins an existing image/gallery, or stays a single image, and it owns the 1↔2
// collapse/promote. The paste/drop plugin (imagePasteDrop) is unchanged — the Editor
// routes its `onFiles` here.

import { saveImageFile, type InsertEditor } from "./insertImage";
import { saveAudioFile } from "./insertAudio";
import {
  type GalleryImage,
  parseGalleryImages,
  stringifyGalleryImages,
} from "../../../lib/md/gallery";
import { planImageInsert } from "./galleryModel";
import { insertImageFromFile } from "./insertImage";
import { log } from "../../../lib/logger";

/** The editor surface the group flow needs (InsertEditor + a readable document + getBlock). */
export interface GroupEditor extends InsertEditor {
  document: Array<{ id: string; type: string; props?: Record<string, unknown>; content?: unknown }>;
}

/** The gallery images a media block contributes when merged into a gallery (already-saved urls,
 *  no re-upload). A single image → one entry; a gallery → its whole ordered list. */
export function imagesOfMediaBlock(
  b: { type?: string; props?: Record<string, unknown> } | undefined,
): GalleryImage[] {
  if (!b) return [];
  if (b.type === "image") {
    const url = String(b.props?.url ?? "");
    return url ? [{ url, caption: String(b.props?.caption ?? "") }] : [];
  }
  if (b.type === "audio") {
    // A recording row merges in as an audio-kind tile (waveform card), not an image.
    const url = String(b.props?.url ?? "");
    return url ? [{ url, caption: String(b.props?.caption ?? ""), kind: "audio" as const }] : [];
  }
  if (b.type === "imageGroup") return parseGalleryImages(b.props?.images as string | undefined);
  return [];
}

/** The minimal editor surface the row-merge needs. */
export interface MergeEditor {
  getBlock: (id: string) => { id: string; type?: string; props?: Record<string, unknown> } | undefined;
  updateBlock: (id: string, update: unknown) => void;
  removeBlocks: (ids: string[]) => void;
}

/** Merge already-saved media blocks (`sourceIds`) INTO `targetId` (an image/gallery), promoting
 *  a single-image target to a gallery, then remove the sources. Reuses saved urls — no re-upload.
 *  Returns false (no-op) if nothing mergeable was found. Used by the drag-a-row-onto-a-gallery drop. */
export function mergeMediaBlocksInto(editor: MergeEditor, targetId: string, sourceIds: string[]): boolean {
  const target = editor.getBlock(targetId);
  if (!target) return false;
  const sources = sourceIds.filter((id) => id !== targetId);
  const incoming = sources.flatMap((id) => imagesOfMediaBlock(editor.getBlock(id)));
  if (incoming.length === 0) return false;
  const images = imagesOfMediaBlock(target).concat(incoming);
  editor.updateBlock(targetId, { type: "imageGroup", props: { images: stringifyGalleryImages(images) } });
  editor.removeBlocks(sources);
  log.info("media", "group.merge-rows", { targetId, sources: sources.length, images: images.length });
  return true;
}

/** A gallery can hold recordings too — audio files become audio-kind tiles (waveform cards),
 *  everything else is an image tile. */
const isAudioFile = (f: File | Blob): boolean => (f.type || "").startsWith("audio/");

/** The gallery tile for a just-dropped file (local url, still saving), tagged by kind. */
function tileForFile(url: string, file: File | Blob): GalleryImage {
  return { url, caption: "", saving: true, ...(isAudioFile(file) ? { kind: "audio" as const } : {}) };
}

function isBlankParagraph(block: { type: string; content?: unknown }): boolean {
  if (block.type !== "paragraph") return false;
  const c = block.content;
  if (!Array.isArray(c) || c.length === 0) return true;
  return (c as Array<{ text?: string }>).every((i) => !i.text || i.text.replace(/​/g, "").trim() === "");
}

/** Save `files` in the background and swap each tile's local url → its saved url in place,
 *  clearing its `saving` flag. Mutates the shared `images` array (serialized writes). */
function persistTiles(
  editor: InsertEditor,
  blockId: string,
  noteId: string,
  images: GalleryImage[],
  startIndex: number,
  files: Array<File | Blob>,
  localUrls: string[],
): void {
  files.forEach((file, i) => {
    const at = startIndex + i;
    const audio = isAudioFile(file);
    log.info("media", "group.persist.start", { blockId, at, kind: audio ? "audio" : "image", name: (file as File).name, type: file.type });
    const saved = audio ? saveAudioFile(noteId, file) : saveImageFile(noteId, file);
    void saved
      .then(({ url }) => {
        images[at] = { ...images[at], url: url ?? images[at].url, saving: false };
        editor.updateBlock(blockId, { props: { images: stringifyGalleryImages(images) } });
        log.info("media", "group.persist.ok", { blockId, at, kind: audio ? "audio" : "image", gotUrl: !!url, url: (url ?? "").slice(0, 48) });
      })
      .catch((e) => {
        images[at] = { ...images[at], saving: false };
        editor.updateBlock(blockId, { props: { images: stringifyGalleryImages(images) } });
        log.error("media", "group.tile.error", { blockId, at, kind: audio ? "audio" : "image", error: String(e) });
      })
      .finally(() => {
        setTimeout(() => URL.revokeObjectURL(localUrls[i]), 10_000);
      });
  });
}

/** Create a new imageGroup after `anchorId`, showing every tile instantly from a local
 *  object url (saving), swapping each to its saved url as it completes. Returns the id. */
export async function createGroupFromFiles(
  editor: GroupEditor,
  noteId: string,
  files: Array<File | Blob>,
  anchorId: string,
): Promise<string> {
  const localUrls = files.map((f) => URL.createObjectURL(f));
  const images: GalleryImage[] = files.map((f, i) => tileForFile(localUrls[i], f));
  const [block] = editor.insertBlocks(
    [{ type: "imageGroup", props: { images: stringifyGalleryImages(images) } }],
    anchorId,
    "after",
  );
  log.info("media", "group.create", { id: block.id, noteId, count: files.length });
  persistTiles(editor, block.id, noteId, images, 0, files, localUrls);
  return block.id;
}

/** Join `files` into an existing image/imageGroup `targetId` (promoting a single image to a
 *  group as needed). New tiles show instantly (saving) and swap when saved. */
export async function mergeFilesIntoBlock(
  editor: GroupEditor,
  noteId: string,
  files: Array<File | Blob>,
  targetId: string,
): Promise<void> {
  const target = editor.document.find((b) => b.id === targetId);
  if (!target) return;

  // Existing images: a single image → one entry (width dropped — galleries are count-driven);
  // an imageGroup → its current list.
  const existing: GalleryImage[] =
    target.type === "imageGroup"
      ? parseGalleryImages(target.props?.images as string | undefined)
      : target.type === "image"
        ? [{ url: String(target.props?.url ?? ""), caption: String(target.props?.caption ?? "") }]
        : [];

  const localUrls = files.map((f) => URL.createObjectURL(f));
  const incoming: GalleryImage[] = files.map((f, i) => tileForFile(localUrls[i], f));
  const images = existing.concat(incoming);

  // Promote image → imageGroup, or update the group's list in place.
  editor.updateBlock(targetId, { type: "imageGroup", props: { images: stringifyGalleryImages(images) } } as unknown as never);
  log.info("media", target.type === "image" ? "group.promote" : "group.merge", {
    id: targetId,
    added: files.length,
    total: images.length,
  });
  persistTiles(editor, targetId, noteId, images, existing.length, files, localUrls);
}

/** The single entry the Editor routes paste/drop through. Plans then dispatches:
 *  drop-onto / adjacency → merge; 2+ new → a group; 1 new → a single image. */
export async function insertImagesSmart(
  editor: GroupEditor,
  noteId: string,
  files: Array<File | Blob>,
  atBlockId: string | null,
): Promise<void> {
  if (!files.length) return;
  const cursorId = atBlockId ?? editor.getTextCursorPosition().block.id;
  const planBlocks = editor.document.map((b) => ({ id: b.id, type: b.type, blank: isBlankParagraph(b) }));
  const plan = planImageInsert(planBlocks, cursorId, files.length);
  log.info("media", "insertSmart", {
    cursorId,
    action: plan.action,
    targetId: "targetId" in plan ? plan.targetId : undefined,
    files: files.map((f) => `${(f as File).name}:${f.type || "?"}`),
  });

  if (plan.action === "merge") {
    await mergeFilesIntoBlock(editor, noteId, files, plan.targetId);
  } else if (plan.action === "group") {
    await createGroupFromFiles(editor, noteId, files, cursorId);
  } else if (isAudioFile(files[0])) {
    // A single recording, adjacency ruled out → its own standalone audio block (not an image).
    const { url } = await saveAudioFile(noteId, files[0]);
    editor.insertBlocks([{ type: "audio", props: { url: url ?? "" } }] as never, cursorId, "after");
    log.info("media", "audio.insert", { noteId });
  } else {
    // A single image, adjacency ruled out → the existing single-image funnel.
    await insertImageFromFile(editor, noteId, files[0], cursorId, "after");
  }
}

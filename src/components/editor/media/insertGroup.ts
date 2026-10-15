// Emergent gallery creation / merge — the orchestration above the single-image funnel
// (insertImage.ts). Every image still saves through saveImageFile (the Phase-0/1 flow);
// this module only decides WHETHER a set of incoming images becomes a new imageGroup,
// joins an existing image/gallery, or stays a single image, and it owns the 1↔2
// collapse/promote. The paste/drop plugin (imagePasteDrop) is unchanged — the Editor
// routes its `onFiles` here.

import { saveImageFile, type InsertEditor } from "./insertImage";
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
    void saveImageFile(noteId, file)
      .then(({ url }) => {
        images[at] = { ...images[at], url: url ?? images[at].url, saving: false };
        editor.updateBlock(blockId, { props: { images: stringifyGalleryImages(images) } });
      })
      .catch((e) => {
        images[at] = { ...images[at], saving: false };
        editor.updateBlock(blockId, { props: { images: stringifyGalleryImages(images) } });
        log.error("media", "group.tile.error", { blockId, error: String(e) });
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
  const images: GalleryImage[] = localUrls.map((url) => ({ url, caption: "", saving: true }));
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
  const incoming: GalleryImage[] = localUrls.map((url) => ({ url, caption: "", saving: true }));
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

  if (plan.action === "merge") {
    await mergeFilesIntoBlock(editor, noteId, files, plan.targetId);
  } else if (plan.action === "group") {
    await createGroupFromFiles(editor, noteId, files, cursorId);
  } else {
    // A single image, adjacency ruled out → the existing single-image funnel.
    await insertImageFromFile(editor, noteId, files[0], cursorId, "after");
  }
}

import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { NoteLink } from "./noteLink";
import { ImageBlock } from "./media/ImageBlock";
import { ImageGroupBlock } from "./media/ImageGroupBlock";

// The shared BlockNote schema: the default blocks/styles plus our custom "noteLink"
// inline content and our custom "image" block (both round-tripped through
// lib/md/extended). We REPLACE BlockNote's built-in image block so images render in the
// Pensieve MediaBlock language rather than BlockNote's default upload chrome. Used by
// both the writing surface (Editor) and the read-only gallery preview (NotePreview), so
// a note renders identically in both.
export const editorSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, image: ImageBlock, imageGroup: ImageGroupBlock },
  inlineContentSpecs: { ...defaultInlineContentSpecs, noteLink: NoteLink },
});

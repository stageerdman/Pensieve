import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { NoteLink } from "./noteLink";
import { ImageBlock } from "./media/ImageBlock";
import { ImageGroupBlock } from "./media/ImageGroupBlock";
import { AudioBlock } from "./media/AudioBlock";

// The shared BlockNote schema: the default blocks/styles plus our custom "noteLink"
// inline content and our custom "image" block (both round-tripped through
// lib/md/extended). We REPLACE BlockNote's built-in image block so images render in the
// Pensieve MediaBlock language rather than BlockNote's default upload chrome. Used by
// both the writing surface (Editor) and the read-only gallery preview (NotePreview), so
// a note renders identically in both.
// Drop BlockNote's built-in `file` and `video` blocks: the product has no file/video
// blocks, and — crucially — their presence makes BlockNote's native file-drop insert a
// generic `file` block for a dropped recording (our `audio` block declares no
// `fileBlockAccept`, so an mp3 would fall through to the `*/*` file block and land as a
// stray block stuck under the gallery). Removing them means an un-handled media drop
// inserts nothing rather than the wrong thing.
const { file: _file, video: _video, ...baseBlockSpecs } = defaultBlockSpecs;

export const editorSchema = BlockNoteSchema.create({
  blockSpecs: { ...baseBlockSpecs, image: ImageBlock, imageGroup: ImageGroupBlock, audio: AudioBlock },
  inlineContentSpecs: { ...defaultInlineContentSpecs, noteLink: NoteLink },
});

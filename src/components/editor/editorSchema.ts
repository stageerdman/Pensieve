import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { NoteLink } from "./noteLink";
import { ImageBlock } from "./media/ImageBlock";
import { ImageGroupBlock } from "./media/ImageGroupBlock";
import { AudioBlock } from "./media/AudioBlock";
import { VideoBlock } from "./media/VideoBlock";
import { JournalBlock } from "./media/JournalBlock";

// The shared BlockNote schema: the default blocks/styles plus our custom "noteLink"
// inline content and our custom "image"/"audio"/"video" blocks (all round-tripped through
// lib/md/extended). We REPLACE BlockNote's built-in image/video blocks so they render in
// the Pensieve MediaBlock language rather than BlockNote's default upload chrome. Used by
// both the writing surface (Editor) and the read-only gallery preview (NotePreview), so
// a note renders identically in both.
// Drop BlockNote's built-in `file` block only: the product has no file block, and —
// crucially — its presence makes BlockNote's native file-drop insert a generic `file`
// block for a dropped recording our own blocks don't claim (none of image/audio/video
// declares `fileBlockAccept`, so an unrelated drop would otherwise fall through to the
// `*/*` file block and land as a stray block). Removing it means a truly un-handled drop
// inserts nothing rather than the wrong thing — image/audio/video each own their own
// `onDrop` on their empty placeholder instead, so a drop ON one of them is still handled.
const { file: _file, ...baseBlockSpecs } = defaultBlockSpecs;

export const editorSchema = BlockNoteSchema.create({
  blockSpecs: { ...baseBlockSpecs, image: ImageBlock, imageGroup: ImageGroupBlock, audio: AudioBlock, video: VideoBlock, journal: JournalBlock },
  inlineContentSpecs: { ...defaultInlineContentSpecs, noteLink: NoteLink },
});

import { BlockNoteSchema, defaultInlineContentSpecs } from "@blocknote/core";
import { NoteLink } from "./noteLink";

// The shared BlockNote schema: the default blocks/styles plus our custom "noteLink"
// inline content (round-tripped through lib/md/extended). Used by both the writing
// surface (Editor) and the read-only gallery preview (NotePreview), so a note renders
// identically in both.
export const editorSchema = BlockNoteSchema.create({
  inlineContentSpecs: { ...defaultInlineContentSpecs, noteLink: NoteLink },
});

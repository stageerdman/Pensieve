// Module-level pub/sub so a BlockNote block (which lives outside React's app tree) can ask
// the search layer to re-index a single note NOW — without going through a note edit.
// Mirrors transcriptController / lightboxController, the established "block → app" seam.
//
// Why it's needed: writing a transcript sidecar ("Create transcript") makes new words
// searchable, but it does NOT touch the note's `.md` or its updatedAt — so the normal
// updatedAt-diff reindex never fires. The block calls `reindex.request(noteId)` after the
// sidecar is saved; useSearchIndex subscribes and recomputes that note's folded body.

type Listener = (noteId: string) => void;

const subs = new Set<Listener>();

export const reindex = {
  /** Ask any live listener to re-index this note's body (markdown + folded transcripts). */
  request(noteId: string): void {
    if (!noteId) return;
    subs.forEach((s) => s(noteId));
  },
  subscribe(l: Listener): () => void {
    subs.add(l);
    return () => subs.delete(l);
  },
};

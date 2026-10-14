// Stable, opaque media ids. Minted once at insert and embedded in the on-disk path
// (vault/media/<noteId>/<mediaId>.<ext>) so a reference survives in plain markdown and
// across rename/move — the seam a future @-mention or video time-point ref hangs off of.
//
// Shape mirrors newId() in the store adapters: a base36 time prefix + random suffix.
// The time prefix makes ids sortable-ish (lexical order ≈ insert order within a note),
// which keeps a gallery's natural file order close to its insert order for free.

export function newMediaId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

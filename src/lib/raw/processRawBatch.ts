// The Phase 5 orchestrator: turn one synced Raw Memory into one or more real Memories.
// Platform-agnostic and fully testable — every I/O seam (the vision call, resolving a
// vault ref to bytes/an absolute path, and the Store itself) is an injected dependency,
// so this file contains zero Tauri/browser-specific code. See splitAlgorithm.ts for the
// grouping rule and wiki.md ("DECIDED … B/C") for the product spec this implements.
import type { Note, RawMemory, Store } from "../types";
import type { Transcript } from "../transcripts/types";
import { splitByDate, type PageSignal, type DateGroup } from "./splitAlgorithm";
import { parseDetectedDate } from "./parseDetectedDate";
import { resolveYearPlaceholders } from "./resolveYearPlaceholders";
import { log } from "../logger";

/** What the vision call reports for one page. */
export interface PageDescription {
  /** The page's handwritten text, transcribed. Empty string if genuinely blank/illegible —
   *  never null; a page is never dropped for being hard to read. */
  transcript: string;
  /** A NEW date header on this page, or null — see splitAlgorithm.ts's PageSignal. */
  dateHeader: string | null;
  /** This page ALSO carries the tail of the previous day's entry before its own header. */
  continuesPrevious?: boolean;
}

export type DescribePage = (ref: string, absolutePath: string) => Promise<PageDescription>;

/** The narrow slice of Store this orchestrator needs — injectable for tests. */
export type RawBatchStore = Pick<Store, "create" | "save" | "saveMedia" | "saveTranscript">;

export interface ProcessRawBatchDeps {
  store: RawBatchStore;
  /** Vault-relative ref ("media/<id>/<file>") → the page's real bytes, for re-saving it
   *  into a new note's own media folder. Store-agnostic (works via fetch on either a
   *  Tauri asset:// URL or a browser blob: URL) — see the real impl in processRawBatch's
   *  caller (e.g. ProcessQueue wiring), not here. */
  readMediaBytes: (ref: string) => Promise<{ bytes: ArrayBuffer; ext: string }>;
  /** Vault-relative ref → an absolute filesystem path the vision subprocess can Read. */
  resolveAbsolutePath: (ref: string) => Promise<string>;
  describePage: DescribePage;
  now?: () => Date;
}

export interface ProcessRawBatchResult {
  createdNoteIds: string[];
  groups: DateGroup[];
}

/** One final `pensieve:journal` fence, ref|caption per line — hand-built rather than
 *  round-tripped through a live BlockNote editor (there isn't one here); byte-identical
 *  to what encodeJournalBlock would emit for the same pages (see lib/md/journal.ts and
 *  its round-trip tests). */
function journalFenceMarkdown(pages: { ref: string; caption?: string }[]): string {
  const lines = pages.map((p) => (p.caption ? `${p.ref} | ${p.caption}` : p.ref));
  return "```pensieve:journal\n" + lines.join("\n") + "\n```";
}

/** A minimal, valid Transcript sidecar for one page's plain text — no word-level timing
 *  (there's no audio/time axis), but shaped correctly so buildSearchBody folds it into
 *  Accio exactly the way an audio transcript already is (both are just "the sidecar
 *  beside this ref"), and the journal transcript pane can read it back as plain text. */
function pageTranscript(ref: string, text: string): Transcript {
  const words = text.split(/\s+/).filter(Boolean).map((w) => ({ w, s: 0, e: 0 }));
  return {
    version: 1,
    media: ref,
    meta: { transcribedAt: new Date().toISOString() },
    segments: [{ id: 0, speaker: null, start: 0, end: 0, text, words }],
  };
}

async function duplicateMediaInto(
  deps: Pick<ProcessRawBatchDeps, "store" | "readMediaBytes">,
  originalRef: string,
  newNoteId: string,
): Promise<string> {
  const { bytes, ext } = await deps.readMediaBytes(originalRef);
  return deps.store.saveMedia(newNoteId, bytes, ext);
}

/** Process one synced Raw Memory into N final Memories (1 per detected date). Does NOT
 *  delete the raw batch itself — the caller does that only after this resolves, so a
 *  crash mid-process leaves (at worst) a redundant raw batch next to already-created
 *  finals, never silent data loss (see wiki.md). */
export async function processRawBatch(rm: RawMemory, deps: ProcessRawBatchDeps): Promise<ProcessRawBatchResult> {
  const signals: PageSignal[] = [];
  const textByRef = new Map<string, string>();
  const now = deps.now?.() ?? new Date();

  for (const ref of rm.pages) {
    const abs = await deps.resolveAbsolutePath(ref);
    const d = await deps.describePage(ref, abs);
    textByRef.set(ref, d.transcript);
    signals.push({ ref, dateHeader: d.dateHeader, continuesPrevious: d.continuesPrevious });
    log.info("raw", "describe.page", { rawId: rm.id, ref, dateHeader: d.dateHeader });
  }

  // The AI never guesses a year per page (see describePageTauri.ts's prompt) — it writes
  // the literal "YYYY" placeholder when a page shows none. Resolving it is a BATCH-level
  // pass: the real year might only appear on some later page, and must still apply to
  // pages earlier in the array (the owner's exact scenario — see the module doc).
  const resolvedHeaders = resolveYearPlaceholders(signals.map((s) => s.dateHeader), now);
  signals.forEach((s, i) => (s.dateHeader = resolvedHeaders[i]));

  const groups = splitByDate(signals);
  const createdNoteIds: string[] = [];

  for (const group of groups) {
    const fresh: Note = await deps.store.create();
    const pageRefs: { ref: string; caption?: string }[] = [];

    for (const originalRef of group.pages) {
      // Every page is duplicated into THIS note's own media folder — never left pointing
      // at the raw batch's folder (deleted once all groups are written), and never a
      // cross-note reference into a sibling note (see wiki.md's "shared boundary" note:
      // a page shared by two groups is processed once per group, producing two
      // independent copies here — nothing special-cased, it just falls out of the loop).
      const ref = await duplicateMediaInto(deps, originalRef, fresh.id);
      pageRefs.push({ ref });
      await deps.store.saveTranscript(ref, pageTranscript(ref, textByRef.get(originalRef) ?? ""));
    }

    const createdAt = parseDetectedDate(group.date, now);
    const markdown = journalFenceMarkdown(pageRefs);
    await deps.store.save({ ...fresh, markdown, createdAt, addedAt: createdAt });
    createdNoteIds.push(fresh.id);
    log.info("raw", "group.created", { rawId: rm.id, noteId: fresh.id, date: group.date, pages: pageRefs.length });
  }

  return { createdNoteIds, groups };
}

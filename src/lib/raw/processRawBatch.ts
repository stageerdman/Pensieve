// The Phase 5 orchestrator: turn one synced Raw Memory into one or more real Memories.
// Platform-agnostic and fully testable — every I/O seam (the vision call, resolving a
// vault ref to bytes/an absolute path, and the Store itself) is an injected dependency,
// so this file contains zero Tauri/browser-specific code. See splitAlgorithm.ts for the
// grouping rule and wiki.md ("DECIDED … B/C") for the product spec this implements.
import type { Note, RawMemory, Store } from "../types";
import type { Transcript } from "../transcripts/types";
import { splitByDate, sharesBoundary, type PageSignal, type DateGroup } from "./splitAlgorithm";
import { parseDetectedDate } from "./parseDetectedDate";
import { resolveYearPlaceholders } from "./resolveYearPlaceholders";
import { log } from "../logger";
import { mediaRef, parseMediaPath } from "../media/ref";

/** What the vision call reports for one page. */
export interface PageDescription {
  /** The page's handwritten text, transcribed. When `continuesPrevious` is true, this is
   *  ONLY the text from this page's OWN new date header onward — the leading text that
   *  belongs to the day being closed out lives in `previousPart` instead, so a shared
   *  boundary page's transcript can be split correctly between the two Memories it
   *  belongs to (never the same full text duplicated into both). Empty string if
   *  genuinely blank/illegible — never null; a page is never dropped for being hard to
   *  read. */
  transcript: string;
  /** A NEW date header on this page, or null — see splitAlgorithm.ts's PageSignal. */
  dateHeader: string | null;
  /** This page ALSO carries the tail of the previous day's entry before its own header. */
  continuesPrevious?: boolean;
  /** Only meaningful when `continuesPrevious` is true: the leading chunk of this page's
   *  handwriting that belongs to the day being CLOSED OUT (everything before this page's
   *  own new date header starts). Undefined when there's nothing to split. */
  previousPart?: string;
  /** A short title for this entry — the writer's own standalone heading if the page has
   *  one, otherwise the AI's own short summary of the gist. NEVER the date (dateHeader
   *  already carries that separately). Used verbatim as the created Memory's title, so
   *  it should read like one: a few words or a short phrase, not a full sentence. */
  title?: string;
}

export type DescribePage = (ref: string, absolutePath: string) => Promise<PageDescription>;

/** The narrow slice of Store this orchestrator needs — injectable for tests. */
export type RawBatchStore = Pick<Store, "save" | "saveTranscript">;

export interface ProcessRawBatchDeps {
  store: RawBatchStore;
  /** Copy one vault file to another vault path, never leaving the target half-written
   *  (Tauri: the atomic `copy_file` command). Used to duplicate a page photo into its
   *  new Memory's own media folder. */
  copyMedia: (fromRef: string, toRef: string) => Promise<void>;
  /** Vault-relative ref → an absolute filesystem path the vision subprocess can Read. */
  resolveAbsolutePath: (ref: string) => Promise<string>;
  describePage: DescribePage;
  now?: () => Date;
  /** Called after each page's AI describe call resolves — the Process queue's only
   *  real progress signal (one subprocess call per page, no sub-page streaming). */
  onPageDone?: (done: number, total: number) => void;
  /** Pages an earlier, interrupted attempt already described (from its job checkpoint) —
   *  reused as-is, so a resumed batch gets the SAME split and the AI isn't paid twice. */
  known?: Readonly<Record<string, PageDescription>>;
  /** Awaited after each NEW description, before the next page — the checkpoint hook. */
  onPageDescribed?: (ref: string, d: PageDescription) => Promise<void>;
}

/** The Memory a batch's n-th date group becomes. Deterministic on purpose: a rerun after a
 *  crash overwrites the same Memory instead of minting a duplicate (exactly-once). */
export function journalNoteId(rawId: string, groupIndex: number): string {
  return `${rawId}-${groupIndex + 1}`;
}

/** Where a group's k-th page photo lands — deterministic for the same reason. */
export function journalPageRef(noteId: string, pageIndex: number, originalRef: string): string {
  const ext = parseMediaPath(originalRef)?.ext ?? "jpg";
  return mediaRef(noteId, `p${pageIndex + 1}`, ext);
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

/** This Memory's title: the AI's own `title` field for the group's first page (the
 *  writer's standalone heading, or the AI's short summary of the gist — see
 *  PageDescription.title's doc; it's told explicitly never to use the date). Falls back
 *  to the old "first sentence of the body text" heuristic only if the AI response is
 *  missing the field entirely (an older/degraded reply) — defensive, not the normal path
 *  — and finally to the detected date when there's nothing usable at all. */
function deriveTitle(aiTitle: string | undefined, text: string, fallbackDate: string | null): string {
  const clean = aiTitle?.trim();
  if (clean) return clean;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return fallbackDate ?? "Journal entry";
  const sentenceEnd = normalized.search(/[.!?](\s|$)/);
  const cut = sentenceEnd > 0 ? normalized.slice(0, sentenceEnd + 1) : normalized;
  return cut.length > 60 ? cut.slice(0, 57).trimEnd() + "…" : cut;
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

/** A journal Memory built in one go — never `store.create()` first, which would put an
 *  empty "Untitled" note on disk that a crash could leave behind. */
function journalNote(id: string, markdown: string, createdAt: number): Note {
  return {
    id,
    title: "",
    markdown,
    createdAt,
    addedAt: createdAt,
    updatedAt: createdAt,
    categories: [],
    tags: [],
    links: [],
    pinned: false,
    starred: false,
  };
}

/** Every page's description, in page order: reused from `known` when an earlier attempt
 *  got it, otherwise asked for and checkpointed before moving on. */
async function describePages(rm: RawMemory, deps: ProcessRawBatchDeps): Promise<PageDescription[]> {
  const out: PageDescription[] = [];
  for (let i = 0; i < rm.pages.length; i++) {
    const ref = rm.pages[i];
    let d = deps.known?.[ref];
    if (!d) {
      d = await deps.describePage(ref, await deps.resolveAbsolutePath(ref));
      await deps.onPageDescribed?.(ref, d);
    }
    out.push(d);
    log.info("raw", "describe.page", { rawId: rm.id, ref, dateHeader: d.dateHeader, reused: !!deps.known?.[ref] });
    deps.onPageDone?.(i + 1, rm.pages.length);
  }
  return out;
}

/** Process one synced Raw Memory into N final Memories (1 per detected date). Does NOT
 *  delete the raw batch itself — the caller does that only after this resolves. Safe to
 *  run again after a crash at any point: every output has a fixed path (journalNoteId /
 *  journalPageRef), each Memory's `.md` is written last, so a rerun overwrites instead of
 *  duplicating and nothing half-done is ever listed (see lib/raw/job). */
export async function processRawBatch(rm: RawMemory, deps: ProcessRawBatchDeps): Promise<ProcessRawBatchResult> {
  const signals: PageSignal[] = [];
  const textByRef = new Map<string, string>();
  const titleByRef = new Map<string, string>();
  // Only populated for a shared boundary page (continuesPrevious) — the leading chunk of
  // its text that belongs to the day being CLOSED OUT, so that day's Memory doesn't get
  // the whole page's text (including the NEXT day's part) duplicated into it too.
  const previousPartByRef = new Map<string, string>();
  const now = deps.now?.() ?? new Date();

  const descriptions = await describePages(rm, deps);
  for (let i = 0; i < rm.pages.length; i++) {
    const ref = rm.pages[i];
    const d = descriptions[i];
    textByRef.set(ref, d.transcript);
    if (d.title) titleByRef.set(ref, d.title);
    if (d.continuesPrevious && d.previousPart) previousPartByRef.set(ref, d.previousPart);
    signals.push({ ref, dateHeader: d.dateHeader, continuesPrevious: d.continuesPrevious });
  }

  // The AI never guesses a year per page (see describePageTauri.ts's prompt) — it writes
  // the literal "YYYY" placeholder when a page shows none. Resolving it is a BATCH-level
  // pass: the real year might only appear on some later page, and must still apply to
  // pages earlier in the array (the owner's exact scenario — see the module doc).
  const resolvedHeaders = resolveYearPlaceholders(signals.map((s) => s.dateHeader), now);
  signals.forEach((s, i) => (s.dateHeader = resolvedHeaders[i]));

  const groups = splitByDate(signals);
  const createdNoteIds: string[] = [];

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const noteId = journalNoteId(rm.id, gi);
    const pageRefs: { ref: string; caption?: string }[] = [];
    const ownText: string[] = [];

    for (let pi = 0; pi < group.pages.length; pi++) {
      const originalRef = group.pages[pi];
      // Every page is duplicated into THIS note's own media folder — never left pointing
      // at the raw batch's folder (deleted once all groups are written), and never a
      // cross-note reference into a sibling note (see wiki.md's "shared boundary" note:
      // a page shared by two groups is processed once per group, producing two
      // independent copies here — nothing special-cased, it just falls out of the loop).
      //
      // But the TEXT isn't just "falls out of the loop" the same way: a page shared with
      // the NEXT group (it's the last page here, and also that group's first) must only
      // contribute the chunk of its transcript belonging to THIS (closing) day —
      // previousPartByRef — not the whole page's text, which also covers the day this
      // same physical photo opens next.
      const isClosingBoundary = pi === group.pages.length - 1 && sharesBoundary(groups, gi);
      const text = isClosingBoundary ? previousPartByRef.get(originalRef) ?? textByRef.get(originalRef) ?? "" : textByRef.get(originalRef) ?? "";

      const ref = journalPageRef(noteId, pi, originalRef);
      await deps.copyMedia(originalRef, ref);
      pageRefs.push({ ref });
      await deps.store.saveTranscript(ref, pageTranscript(ref, text));
      ownText.push(text);
    }

    const createdAt = parseDetectedDate(group.date, now);
    const title = deriveTitle(titleByRef.get(group.pages[0]), ownText.join(" "), group.date);
    const markdown = `${title}\n\n${journalFenceMarkdown(pageRefs)}`;
    await deps.store.save(journalNote(noteId, markdown, createdAt));
    createdNoteIds.push(noteId);
    log.info("raw", "group.created", { rawId: rm.id, noteId, date: group.date, pages: pageRefs.length });
  }

  return { createdNoteIds, groups };
}

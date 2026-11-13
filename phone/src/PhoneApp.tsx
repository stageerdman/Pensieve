// PhoneApp.tsx — the phone app, assembled.
//
// The coordinator: it owns the mutable vault (a seed copy), the small set of React state
// that drives re-renders (reel view, search sheet, count, root state classes, sync spell,
// recents, toast), and the cross-cutting actions (openNote, openNewNote, commit, filter,
// cast, spell dispatch). Heavy imperative work lives in hooks that write to the DOM via
// refs and bypass React (loupe fisheye, scroll settle, keyboard inset, caret-visible,
// word selection).
//
// Reel is home. The controls are the bottom Dock (gold menu button + resident Accio) and
// the radial Spell Menu it opens; tapping a card opens the full-screen note; Accio filters
// the reel in place; Sync casts the gold backup spell. (The Wand thumb-wheel it replaced
// is archived in updates/2026-10-11 SPELL-MENU - OPEN/_archive.)

import { useSyncFlash } from "./hooks/useSyncFlash";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Note } from "./types";
import { loadVault, newId, persistVault } from "./vaultStore";
import { haptic, prefersReducedMotion } from "./util";
import { parseQuery, passesDate, passesText } from "./lib/wand/accioQuery";
import { rankNotes } from "./lib/wand/accioRank";
import { CAT_HUE, SHAPES } from "./lib/wand/flaskSvg";
import type { SyncStatus } from "./lib/wand/syncMachine";

import { useKeyboardInset } from "./hooks/useKeyboardInset";
import { useReelFisheye } from "./hooks/useReelFisheye";
import { useAccioSearch } from "./hooks/useAccioSearch";
import { useSyncState } from "./hooks/useSyncState";
import { useOneDriveSync } from "./hooks/useOneDriveSync";
import { useCaretVisible } from "./hooks/useCaretVisible";
import { useWordSelection } from "./hooks/useWordSelection";
import { useAutosave } from "./hooks/useAutosave";
import { useSpellMenu } from "./hooks/useSpellMenu";
import type { Spell } from "./lib/spells/types";
import { HOME_DOCK } from "./lib/spells/dockModel";

import { Reel } from "./components/reel/Reel";
import { Glass } from "./components/reel/Glass";
import { Dock } from "./components/dock/Dock";
import { DockSettings } from "./components/dock/DockSettings";
import { SpellMenu } from "./components/spellmenu/SpellMenu";
import { SummonBar } from "./components/accio/SummonBar";
import { SearchSheet } from "./components/accio/SearchSheet";
import { SyncSpell } from "./components/sync/SyncSpell";
import { SyncRune } from "./components/sync/SyncRune";
import { MemoryPage } from "./components/note/MemoryPage";
import type { FmtKey } from "./components/note/NoteToolbar";
import { ConjureThread, conjure } from "./components/ConjureThread";
import { currentBlock, focusTitle, placeCaret, syncPlaceholders } from "./components/note/noteEditing";
import { insertAudio, insertImages, insertVideo, renderNoteBody, type MediaCtx } from "./components/note/mediaDom";
import { phoneCollection } from "./lib/media/collectionController";
import { PhoneLightbox } from "./components/note/PhoneLightbox";
import { PhoneCollection } from "./components/note/PhoneCollection";
import { PhoneTranscriptReader } from "./components/note/PhoneTranscriptReader";
import { VoiceRecorderPanel } from "./components/note/VoiceRecorderPanel";
import { ConfirmDeleteNote } from "./components/note/ConfirmDeleteNote";
import { ConfirmDeleteRawBatch } from "./components/note/ConfirmDeleteRawBatch";
import { PackageDetailScreen } from "./components/note/PackageDetailScreen";
import { JournalCaptureScreen } from "./components/note/JournalCaptureScreen";
import { JournalDetailScreen } from "./components/note/JournalDetailScreen";
import { createRawBatch, deleteRawBatch, loadRawBatches, markRawBatchesSynced, persistRawBatches, type RawMemory } from "./lib/media/rawMemoryStore";
import { mintAudioRef, mintMediaRef, mintVideoRef, registerLocalMedia } from "./lib/media/mediaStore";
import { offerSaveToPhotos } from "./lib/media/saveToPhotos";
import type { MediaImage } from "./lib/media/noteMedia";
import { pauseAllAudio } from "./lib/media/audioController";
import { isRecording, pauseRecording, recoverOrphanedRecordings, resumeRecording, startRecording, stopRecording, activeSnapshot, type VoiceCaptureDeps } from "./lib/media/voiceCapture";
import { FormSession } from "./components/form/FormSession";
import { FormPicker } from "./components/form/FormPicker";
import { applySession, formsIn, mediaBlocksOf, packageFromSession, sessionHasContent, startSession, templateSpell, type FormSessionModel, type SessionAnswer, type SessionAnswers } from "./lib/forms/session";
import { spellFor } from "../../src/lib/packages/kinds";
import { serializeBlocks, type NoteBlock } from "./lib/media/noteMedia";

const DICTATION_SAMPLE =
  "I keep coming back to the idea that the phone shouldn't make me think. It should just catch the thought before it escapes.";

/** viewData(): the reel's list — everything, or the filtered matches. Source ~691-695. */
function computeView(data: Note[], query: string, openedOrder: string[]): Note[] {
  const { text, dates } = parseQuery(query);
  if (!text && !dates.length) return data.slice();
  return data.filter((d) => passesText(d, text) && passesDate(d, dates, openedOrder));
}

/** The header count copy. Source ~706-707. */
function computeCount(query: string, viewLen: number, dataLen: number): string {
  const q = query.trim();
  if (!q) return `${dataLen} memories`;
  return viewLen ? `${viewLen} ${viewLen === 1 ? "match" : "matches"}` : "no match";
}

function randCat(): string {
  const k = Object.keys(CAT_HUE);
  return k[Math.floor(Math.random() * k.length)];
}
function fmtNow(): string {
  const n = new Date();
  return (
    n.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) +
    " · " +
    n.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

// Recent Accio queries — the "see what you searched before" chips. Private: localStorage
// only, never synced (journaling queries are sensitive). Last 6 distinct, most-recent-first.
// Exported so main.tsx's one-time fresh-start wipe can clear stale demo-seed queries too.
export const RECENTS_KEY = "pensieve.recentQueries";
function loadRecents(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function PhoneApp() {
  const reduce = prefersReducedMotion();

  // ---- mutable vault (the prototype's DATA) ----
  const dataRef = useRef<Note[]>();
  if (!dataRef.current) dataRef.current = loadVault();
  const openedOrderRef = useRef<string[]>([]);
  const currentRef = useRef<Note | null>(null);
  // ids of capture notes (Snap/Record) that are open but still untouched — no image attached,
  // no recording genuinely started, no manual edit. Backing out of one of these discards
  // silently instead of saving an "empty" placeholder note (see exitNote/onBodyInput/onPickFiles).
  const pendingCaptureRef = useRef<Set<string>>(new Set());
  // ids minted by openCaptureNote (Snap/Record-from-home) — unlike pendingCaptureRef this is
  // NEVER cleared once the mic genuinely starts, so removeIfUntouched (below) can still tell "a
  // fresh capture note that turned out empty" apart from an existing memory the user opened and
  // chose to add a take to (that one must never be silently deleted just because a take captured
  // nothing — see the "Voice" conditional spell's record-new branch in castSpellAction).
  const captureFlowRef = useRef<Set<string>>(new Set());

  // ---- element refs ----
  const rootRef = useRef<HTMLDivElement>(null);
  const reelRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const glassRef = useRef<HTMLDivElement>(null);
  const accioInputRef = useRef<HTMLInputElement>(null);
  // kept only to satisfy useAccioSearch's config (the old floating pill is gone — the
  // resident ExpandedAccio owns clear now); never attached to the DOM.
  const accioPillRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const noteSurfaceRef = useRef<HTMLDivElement>(null);
  const noteBodyRef = useRef<HTMLDivElement>(null);
  const noteDateRef = useRef<HTMLDivElement>(null);
  const noteSavedRef = useRef<HTMLDivElement>(null);
  const voiceRef = useRef<HTMLButtonElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // ---- React state (drives re-renders only; NOT the 60fps loops) ----
  const [view, setView] = useState<Note[]>(() => computeView(dataRef.current!, "", []));
  const [searchList, setSearchList] = useState<Note[]>(() => rankNotes(dataRef.current!, "", []));
  const [count, setCount] = useState<string>(() => computeCount("", dataRef.current!.length, dataRef.current!.length));
  const [noteMounted, setNoteMounted] = useState(false); // the Memory page is in the DOM only while open/closing
  const [noteOpen, setNoteOpen] = useState(false); // drives the .open slide (set a frame after mount)
  const [collectionOpen, setCollectionOpen] = useState(false); // the full-screen photo board is on top
  const [editingNote, setEditingNote] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  const [micListening, setMicListening] = useState(false);
  const [spell, setSpell] = useState({ show: false, castId: 0 });
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Raw Memory (RAW-MEMORY-JOURNAL): rawBatches is every batch still on this phone (a
  // RawMemory is NOT a Note — its own list, see lib/media/rawMemoryStore). captureBatch
  // is the one currently being shot (Journal spell → capture screen); detailBatchId
  // opens an existing batch's detail sheet instead.
  const [rawBatches, setRawBatches] = useState<RawMemory[]>(() => loadRawBatches());
  const [captureBatch, setCaptureBatch] = useState<RawMemory | null>(null);
  const [detailBatchId, setDetailBatchId] = useState<string | null>(null);
  const [confirmDeleteRaw, setConfirmDeleteRaw] = useState(false);
  const detailBatch = rawBatches.find((b) => b.id === detailBatchId) ?? null;
  // FORMS: the One Question walk-through in progress (null = none), and the "Which form?"
  // picker. The session's memory object lives in formNoteRef — it's the SAME object that goes
  // into the vault once it has something real in it (an answer or a recording).
  const [formRun, setFormRun] = useState<{ model: FormSessionModel; answers: SessionAnswers; recording: boolean } | null>(null);
  const formRunRef = useRef(formRun);
  formRunRef.current = formRun;
  const formNoteRef = useRef<Note | null>(null);
  const formSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [formPicker, setFormPicker] = useState<Note[] | null>(null);

  const updateRawBatch = (b: RawMemory) => {
    setRawBatches((prev) => {
      const next = prev.some((x) => x.id === b.id) ? prev.map((x) => (x.id === b.id ? b : x)) : [...prev, b];
      persistRawBatches(next);
      return next;
    });
  };
  const removeRawBatch = (id: string) => {
    setRawBatches((prev) => {
      const next = prev.filter((x) => x.id !== id);
      persistRawBatches(next);
      return next;
    });
  };
  const [voicePanel, setVoicePanel] = useState<{ open: boolean; noteId: string | null; placeholderBody: string }>({
    open: false,
    noteId: null,
    placeholderBody: "",
  });
  const [recents, setRecents] = useState<string[]>(loadRecents);
  const [toast, setToast] = useState("");
  const [sparkle, setSparkle] = useState(0); // a brief close/switch twinkle (0 = none)
  const sparkleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // mirrors for use inside stable event callbacks
  const editingRef = useRef(editingNote);
  editingRef.current = editingNote;
  const filterQueryRef = useRef("");
  const dictRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteUnmountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // a fns ref so hooks wired BEFORE the actions exist always call the latest closure
  const fns = useRef<{
    onKbUp: () => void;
    onKbDown: () => void;
  }>({ onKbUp: () => {}, onKbDown: () => {} });

  // reel scroll intent, applied in the view effect once the new cards have committed
  const reelIntent = useRef<{ mode: "jump0" | "restore" | "smooth0"; to: number } | null>(null);

  // ---- hooks: the imperative subsystems ----
  const sync = useSyncState();
  const syncStatus: SyncStatus = sync.state.status;
  const runeState = useSyncFlash(syncStatus); // + a green "just synced" moment

  const fisheye = useReelFisheye(reelRef, trackRef, glassRef);
  // The Spell Menu is context-aware: an open photo collection offers only "Photo" (add to that
  // gallery); a memory offers "Photo" + "Gallery"; home opens General. The collection sits on top
  // of the memory, so its context must win.
  const menu = useSpellMenu(formRun ? "form" : detailBatch ? (detailBatch.kind === "form" ? "package" : "raw-detail") : collectionOpen ? "collection" : noteMounted ? "note" : "home");

  const kb = useKeyboardInset(rootRef, {
    onUp: () => fns.current.onKbUp(),
    onDown: () => fns.current.onKbDown(),
  });

  const keepCaretVisible = useCaretVisible(noteSurfaceRef, noteBodyRef, kb.upRef);
  useWordSelection(noteBodyRef);

  // ---- vault re-render helpers ----
  function renderAll(query: string) {
    const data = dataRef.current!;
    const v = computeView(data, query, openedOrderRef.current);
    setView(v);
    setSearchList(rankNotes(data, query, openedOrderRef.current));
    setCount(computeCount(query, v.length, data.length));
  }

  // A real sync may have pulled/removed notes OR Raw Memory batches behind
  // dataRef's/rawBatches' back (it writes straight to the same localStorage) —
  // reload both from storage, then re-render. markRawBatchesSynced is now only a
  // backward-compat safety net (upgrading any batch still stuck in the old transient
  // "queued" status this app version no longer creates — see where captureBatch's
  // onDone sets status directly to "synced"); a freshly-captured batch never needs it.
  const onedrive = useOneDriveSync((info) => {
    dataRef.current = loadVault();
    renderAll(filterQueryRef.current);
    markRawBatchesSynced(info?.pushedRaw ?? []);
    setRawBatches(loadRawBatches());
  });

  const autosave = useAutosave(noteBodyRef, noteSavedRef, currentRef, {
    onInsert: (note) => {
      dataRef.current!.unshift(note);
      persistVault(dataRef.current!);
      renderAll(filterQueryRef.current);
      reelIntent.current = { mode: "smooth0", to: 0 };
    },
    onRender: () => {
      persistVault(dataRef.current!);
      renderAll(filterQueryRef.current);
    },
    onDirty: () => sync.edit(),
  });

  // The media context handed to the imperative media blocks: any in-place mutation (remove,
  // reorder, merge, collapse) schedules an autosave, which re-serializes the body to markdown.
  // Kept on a stable ref object (the DOM blocks capture it once) with a fresh closure each
  // render so it always calls the latest autosave.
  const mediaCtx = useRef<MediaCtx>({ onChange: () => {} }).current;
  mediaCtx.onChange = () => autosave.scheduleSave();

  // The Record spell's engine (voiceCapture.ts) reads/writes the vault directly (it must work
  // identically from a clean Stop, a background-hide, or a startup recovery sweep — none of
  // which can assume the note is open) — this is its one seam into PhoneApp's state. Kept on a
  // stable ref object (voiceCapture captures it once per recording) with fresh closures each
  // render, same pattern as mediaCtx above.
  const voiceDeps = useRef<VoiceCaptureDeps>({
    getNote: () => undefined,
    persistAndRender: () => {},
  }).current;
  voiceDeps.getNote = (id) => dataRef.current!.find((n) => n.id === id);
  voiceDeps.persistAndRender = () => {
    persistVault(dataRef.current!);
    renderAll(filterQueryRef.current);
  };
  voiceDeps.patchLiveNote = (id, block) => {
    if (currentRef.current?.id !== id) return;
    const noteBody = noteBodyRef.current;
    if (!noteBody) return;
    insertAudio(noteBody, block, mediaCtx);
    syncPlaceholders(noteBody);
  };
  voiceDeps.toast = (msg) => showToast(msg);
  // Panel-only (voiceCapture.ts never calls this itself): once the mic genuinely starts, the
  // note graduates out of "pending" and commits for real — from this point on a crash/kill
  // still has a vault row to recover the audio onto, even if the user never types a word.
  voiceDeps.onRecordingStarted = (id) => {
    pendingCaptureRef.current.delete(id);
    if (currentRef.current?.id === id) autosave.commit();
  };
  // Engine-called when a session finalizes with zero captured chunks (recording stopped within
  // the first flush interval) AND the note is still exactly its untouched placeholder — nothing
  // real ever happened, so undo the early commit rather than leave an "empty" note behind.
  voiceDeps.removeIfUntouched = (id, placeholderBody) => {
    if (!captureFlowRef.current.has(id)) return; // only a fresh Snap/Record capture note may be silently undone
    const idx = dataRef.current!.findIndex((n) => n.id === id);
    if (idx === -1) return;
    if ((dataRef.current![idx].c || "").trim() !== placeholderBody.trim()) return; // user added real content — keep it
    dataRef.current!.splice(idx, 1);
    persistVault(dataRef.current!);
    renderAll(filterQueryRef.current);
  };

  const accio = useAccioSearch({
    accioInputRef,
    accioPillRef,
    reelRef,
    onExitNote: () => exitNote(),
    onFilter: (q) => {
      renderAll(q);
      reelIntent.current = { mode: "jump0", to: 0 };
    },
    onSheet: (q) => setSearchList(rankNotes(dataRef.current!, q, openedOrderRef.current)),
    onClear: (restoreTop) => {
      renderAll("");
      reelIntent.current = { mode: "restore", to: restoreTop };
    },
    relayout: () => fisheye.relayout(),
    wheelRefresh: () => {}, // the wheel is gone; its label-opacity nudge is a no-op now
  });
  filterQueryRef.current = accio.filterQuery;
  const queryText = useMemo(() => parseQuery(accio.filterQuery).text, [accio.filterQuery]);

  // ---- note actions ----
  function noteOpened(id: string) {
    const i = openedOrderRef.current.indexOf(id);
    if (i >= 0) openedOrderRef.current.splice(i, 1);
    openedOrderRef.current.push(id);
  }

  function openNote(d: Note) {
    currentRef.current = d;
    noteOpened(d.id);
    accio.hideBar(); // drop the summon bar if up; the filter/pill persists
    // cancel a pending unmount from a just-closed page so a quick reopen isn't yanked away
    if (noteUnmountTimer.current) {
      clearTimeout(noteUnmountTimer.current);
      noteUnmountTimer.current = null;
    }
    // Mount the Memory page SYNCHRONOUSLY so its refs are live before we write the body;
    // then flip .open a frame later so it slides up from the bottom (it's not parked in
    // the home DOM anymore — it exists only while open/closing).
    flushSync(() => setNoteMounted(true));
    const noteBody = noteBodyRef.current;
    if (noteDateRef.current) noteDateRef.current.textContent = d.when || "Written " + (d.created || d.d);
    if (noteBody) {
      // Build the body DOM (title H1 + text divs + non-editable media blocks) from the note's
      // markdown content; media refs resolve to blob/object URLs asynchronously inside.
      renderNoteBody(noteBody, d.fresh ? "" : d.t || "", d.fresh ? "" : d.c || "", mediaCtx);
      syncPlaceholders(noteBody);
    }
    if (reduce) setNoteOpen(true);
    else requestAnimationFrame(() => setNoteOpen(true));
  }

  /** A "Snap"/"Record" spell cast: mint a titled memory ("New Image"/"New Recording", body
   *  "added image"/"added recording") and open it. Tracked in `pendingCaptureRef` until real
   *  content actually lands (an image attached, recording genuinely starts, or the user types)
   *  — nothing is saved to the vault before that, so backing out of an unused capture leaves no
   *  "empty" note behind (see exitNote). Returns the note so the caller can jump into capture. */
  function openCaptureNote(title: string, bodyLine: string): Note {
    accio.clearSearch();
    const now = Date.now();
    const d: Note = {
      id: newId(),
      t: title,
      c: bodyLine,
      cat: randCat(),
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      fill: 0.18,
      d: "Just now",
      created: "Just now",
      createdAt: now,
      updatedAt: now,
      when: fmtNow(),
      fresh: false,
      isNew: true,
    };
    pendingCaptureRef.current.add(d.id);
    captureFlowRef.current.add(d.id);
    conjure(threadRef.current, rootRef.current, reduce, () => openNote(d));
    haptic(10);
    return d;
  }

  function startCaptureImage() {
    // Fire the picker FIRST, synchronously, in the same tap gesture — a camera-capture file
    // input only opens instantly (no intervening action sheet) if `.click()` runs inside the
    // original user gesture; a setTimeout-deferred click breaks that and iOS may stall or
    // refuse it. The note's conjure animation can proceed in parallel; camera UI covers it.
    openImagePicker("camera");
    openCaptureNote("New Image", "added image");
  }

  function startCaptureVoice() {
    const d = openCaptureNote("New Recording", "added recording");
    setTimeout(() => setVoicePanel({ open: true, noteId: d.id, placeholderBody: d.c }), 460);
  }

  /** The "Voice" conditional spell's Record option: unlike startCaptureVoice (which mints a
   *  brand-new "New Recording" memory from Home), this attaches a take to the memory that's
   *  ALREADY open — same recorder engine, just not a captureFlow id (see removeIfUntouched). */
  function startVoiceInCurrentNote() {
    const note = currentRef.current;
    if (!note) return;
    setVoicePanel({ open: true, noteId: note.id, placeholderBody: note.c ?? "" });
  }

  /** The "Film" spell (Home, General ring): same native-camera-HANDOFF trick as Snap, not a
   *  custom in-page recorder like Record — iOS's own camera writes the file, so none of
   *  Voice's WebKit MediaRecorder problems apply here. Mints "New Video" first. */
  function startCaptureVideo() {
    openVideoPicker("film");
    openCaptureNote("New Video", "added video");
  }

  /** The "Video" conditional spell's Film option: attaches a clip to the memory that's
   *  ALREADY open (mirrors startVoiceInCurrentNote's relationship to startCaptureVoice). */
  function filmIntoCurrentNote() {
    openVideoPicker("film");
  }

  /** The "Video" conditional spell's Upload option: pick an existing video file (no camera
   *  handoff) — never offered the save-to-Photos share sheet (see onPickVideoFile). */
  function uploadVideoIntoCurrentNote() {
    openVideoPicker("upload");
  }

  function openNewNote(dictate: boolean) {
    accio.clearSearch(); // a fresh thought lands on a clean, unfiltered home
    const now = Date.now();
    const d: Note = {
      id: newId(),
      t: "",
      c: "",
      cat: randCat(),
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      fill: 0.18,
      d: "Just now",
      created: "Just now",
      createdAt: now,
      updatedAt: now,
      when: fmtNow(),
      fresh: true,
      isNew: true,
    };
    conjure(threadRef.current, rootRef.current, reduce, () => {
      openNote(d);
      setTimeout(() => {
        const noteBody = noteBodyRef.current;
        if (noteBody) focusTitle(noteBody);
        if (dictate) startDictation();
      }, 460);
    });
    haptic(10);
  }

  /** Leave the open memory. `save:false` (deleteCurrentNote) skips the commit entirely — used
   *  right after removing the note from the vault, so closing doesn't resurrect it. Otherwise,
   *  an untouched capture note (still in `pendingCaptureRef` — nothing attached, nothing typed)
   *  is discarded silently rather than committed as an "empty" placeholder. */
  function exitNote(opts?: { save?: boolean }) {
    const note = currentRef.current;
    if (note) {
      const wasPending = pendingCaptureRef.current.has(note.id);
      pendingCaptureRef.current.delete(note.id);
      if (opts?.save !== false && !wasPending) autosave.commit();
    }
    pauseAllAudio(); // leaving the memory — any recording playing in it should stop
    setNoteOpen(false); // slides down
    setEditingNote(false);
    currentRef.current = null;
    // unmount after the slide-down finishes so the Memory page leaves the DOM entirely
    if (noteUnmountTimer.current) clearTimeout(noteUnmountTimer.current);
    noteUnmountTimer.current = setTimeout(() => {
      noteUnmountTimer.current = null;
      setNoteMounted(false);
    }, reduce ? 0 : 520);
  }

  /** Confirmed from the "Delete" conditional spell's popup: remove the open memory for good. */
  function deleteCurrentNote() {
    const note = currentRef.current;
    if (!note) return;
    const idx = dataRef.current!.findIndex((n) => n.id === note.id);
    if (idx !== -1) dataRef.current!.splice(idx, 1);
    persistVault(dataRef.current!);
    renderAll(filterQueryRef.current);
    setConfirmDelete(false);
    haptic(20);
    exitNote({ save: false });
  }

  // ---- note body events ----
  function onBodyInput() {
    // any real keystroke graduates a capture note out of "pending" — it must be saved now,
    // same as any other note the user has actually touched.
    if (currentRef.current) pendingCaptureRef.current.delete(currentRef.current.id);
    const noteBody = noteBodyRef.current;
    if (noteBody) syncPlaceholders(noteBody);
    autosave.scheduleSave();
    keepCaretVisible();
  }
  function onBodyKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    const noteBody = noteBodyRef.current;
    if (!noteBody) return;
    const block = currentBlock(noteBody);
    if (!block || block !== noteBody.firstElementChild || block.tagName !== "H1") return;
    e.preventDefault();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const rng = sel.getRangeAt(0);
    const tail = rng.cloneRange();
    tail.selectNodeContents(block);
    tail.setStart(rng.endContainer, rng.endOffset);
    const frag = tail.extractContents();
    const div = document.createElement("div");
    if (frag.textContent && frag.textContent.length) div.appendChild(frag);
    else div.innerHTML = "<br>";
    block.after(div);
    placeCaret(div, 0);
    syncPlaceholders(noteBody);
    autosave.scheduleSave();
    keepCaretVisible();
  }

  // ---- image capture ----
  // The ONE hidden <input> both reach-points drive. Opening it keeps the caret: the toolbar
  // button fires on pointerdown+preventDefault; the spell path appends at the end if the caret
  // was lost. The native iOS sheet (Photo Library / Take Photo / Choose File) comes free.
  // Which action opened the picker: "photo" = add to the memory (merge into an adjacent block if
  // any); "gallery" = the "Gallery" spell → always start a fresh, separate gallery block; "camera"
  // = the "Snap" spell → jump straight to the camera (no action-sheet detour), single shot.
  const pickModeRef = useRef<"photo" | "gallery" | "camera">("photo");
  function openImagePicker(mode: "photo" | "gallery" | "camera" = "photo") {
    pickModeRef.current = mode;
    const input = fileInputRef.current;
    if (input) {
      if (mode === "camera") {
        input.setAttribute("capture", "environment"); // skip the Library/Take/Choose sheet
        input.removeAttribute("multiple");
      } else {
        input.removeAttribute("capture");
        input.setAttribute("multiple", "");
      }
    }
    input?.click();
  }

  function onPickFiles(files: FileList | null) {
    if (formRunRef.current && formNoteRef.current) {
      // The form walk-through's "Photo" extra: saved at the bottom of its memory.
      const note = formNoteRef.current;
      const images: MediaImage[] = [];
      for (const file of Array.from(files ?? [])) {
        if (!file.type.startsWith("image/")) continue;
        const ref = mintMediaRef(note.id, file);
        registerLocalMedia(ref, file);
        images.push({ ref });
      }
      pickModeRef.current = "photo";
      if (images.length) addFormMedia(images.length === 1 ? { kind: "image", ref: images[0].ref } : { kind: "gallery", images });
      return;
    }
    const noteBody = noteBodyRef.current;
    const note = currentRef.current;
    const mode = pickModeRef.current;
    pickModeRef.current = "photo"; // reset for the next open (toolbar button / Photo spell)
    if (!files || !files.length || !noteBody || !note) return;
    const images: MediaImage[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const ref = mintMediaRef(note.id, file); // media/<noteId>/<id>.<ext> — the shared model
      registerLocalMedia(ref, file); // instant object URL + background IndexedDB write
      images.push({ ref });
    }
    if (!images.length) return;
    pendingCaptureRef.current.delete(note.id); // real content attached — no longer "empty"
    // If the photo collection is open, the picked photos join THAT gallery (the collection's
    // "Photo" spell), not the note caret.
    if (phoneCollection.get().open) {
      void phoneCollection.addFiles(images);
      autosave.scheduleSave();
      haptic(10);
      return;
    }
    // "Gallery" spell → force a new separate gallery block; "Photo" → merge-adjacency as before.
    insertImages(noteBody, images, mediaCtx, { newBlock: mode === "gallery" });
    syncPlaceholders(noteBody);
    autosave.scheduleSave();
    haptic(10);
  }

  // ---- audio upload (the "Voice" conditional spell's Upload option) ----
  // A second hidden input, separate from the image one above: iOS's native picker reads
  // `accept` to decide which sources it offers (Photos vs Files/iCloud Drive), and this is the
  // path to an existing Voice Memos take — Safari has no API into the Voice Memos app itself,
  // but a recording saved to Files (via its own Share sheet) or synced through iCloud Drive
  // shows up in the standard file browser.
  function openAudioPicker() {
    audioInputRef.current?.click();
  }

  function onPickAudioFile(files: FileList | null) {
    const file = files?.[0];
    const noteBody = noteBodyRef.current;
    const note = currentRef.current;
    if (!file || !noteBody || !note) return;
    // store the file exactly as picked — no re-encode; the browser already knows how to play
    // whatever format it is, and mintAudioRef/EXT_BY_TYPE already covers the common voice-memo
    // containers (m4a/aac/mp3/wav).
    const ref = mintAudioRef(note.id, file.type || "audio/mp4");
    registerLocalMedia(ref, file);
    pendingCaptureRef.current.delete(note.id);
    insertAudio(noteBody, { kind: "audio", ref }, mediaCtx);
    syncPlaceholders(noteBody);
    autosave.scheduleSave();
    haptic(10);
  }

  // ---- video capture/upload (the "Film" spell + the "Video" conditional spell) ----
  // A third hidden input, separate from image/audio: "film" sets `capture` so the native
  // camera opens straight to video mode (same instant-handoff rule as Snap — the `.click()`
  // in openVideoPicker must fire synchronously inside the tap, see startCaptureVideo); "upload"
  // clears it so the standard Photos/Files picker shows instead.
  const pickVideoModeRef = useRef<"film" | "upload">("film");
  function openVideoPicker(mode: "film" | "upload") {
    pickVideoModeRef.current = mode;
    const input = videoInputRef.current;
    if (input) {
      if (mode === "film") input.setAttribute("capture", "environment");
      else input.removeAttribute("capture");
    }
    input?.click();
  }

  function onPickVideoFile(files: FileList | null) {
    const file = files?.[0];
    if (formRunRef.current && formNoteRef.current) {
      // The form walk-through's "Video" extra: saved at the bottom of its memory.
      pickVideoModeRef.current = "film";
      if (!file) return;
      const ref = mintVideoRef(formNoteRef.current.id, file);
      registerLocalMedia(ref, file);
      addFormMedia({ kind: "video", ref });
      return;
    }
    const noteBody = noteBodyRef.current;
    const note = currentRef.current;
    const mode = pickVideoModeRef.current;
    pickVideoModeRef.current = "film";
    if (!file || !noteBody || !note) return;
    const ref = mintVideoRef(note.id, file);
    registerLocalMedia(ref, file);
    pendingCaptureRef.current.delete(note.id);
    insertVideo(noteBody, { kind: "video", ref }, mediaCtx);
    syncPlaceholders(noteBody);
    autosave.scheduleSave();
    haptic(10);
    // WhatsApp-style "also keep a copy in Photos" — a freshly FILMED clip only (an uploaded
    // file is presumably already somewhere on the device; re-offering to save it is noise).
    if (mode === "film") void offerSaveToPhotos(file);
  }

  function applyFmt(f: FmtKey) {
    const noteBody = noteBodyRef.current;
    if (!noteBody) return;
    noteBody.focus();
    if (f === "title") document.execCommand("formatBlock", false, "h1");
    else if (f === "body") document.execCommand("formatBlock", false, "div");
    else if (f === "bold") document.execCommand("bold");
    else if (f === "list") document.execCommand("insertUnorderedList");
    syncPlaceholders(noteBody);
    autosave.scheduleSave();
    haptic(6);
  }

  // ---- dictation (simulated) ----
  function typeInto(el: HTMLElement, text: string, done: () => void) {
    if (reduce) {
      el.textContent = text;
      done();
      return;
    }
    let i = 0;
    const tick = () => {
      i += Math.max(1, Math.round(Math.random() * 2));
      el.textContent = text.slice(0, i);
      if (i < text.length) setTimeout(tick, 26);
      else done();
    };
    tick();
  }
  function startDictation() {
    if (dictRef.current) return;
    const noteBody = noteBodyRef.current;
    if (!noteBody) return;
    dictRef.current = true;
    setMicListening(true);
    const h = noteBody.firstElementChild as HTMLElement | null;
    if (h && h.tagName === "H1" && !h.textContent!.trim()) h.textContent = "A thought, spoken";
    let div = (h ? h.nextElementSibling : null) as HTMLElement | null;
    if (!div) {
      div = document.createElement("div");
      div.innerHTML = "<br>";
      noteBody.appendChild(div);
    }
    noteBody.focus();
    syncPlaceholders(noteBody);
    const target = div;
    setTimeout(
      () =>
        typeInto(target, DICTATION_SAMPLE, () => {
          setMicListening(false);
          dictRef.current = false;
          autosave.commit();
        }),
      650,
    );
  }
  function toggleDictation() {
    if (dictRef.current) {
      setMicListening(false);
      dictRef.current = false;
    } else {
      startDictation();
    }
  }

  // ---- sync actions ----
  // One cast drives both directions — back up (weave UP) and restore (pull DOWN)
  // share the spell visual and the success/fail machine, differing only in which
  // real engine call runs underneath. No on-screen copy for either: the header's
  // SyncRune (reminder/syncing/offline/failed colouring) is the only status signal
  // outside the Sync window — see sync.cast()/succeeded()/failed() below.
  function castSpell(opts?: { restore?: boolean }) {
    if (syncStatus === "syncing" || syncStatus === "offline") return;
    sync.cast();
    haptic(14);
    const castId = spell.castId + 1;
    setSpell({ show: true, castId });
    const task = opts?.restore ? onedrive.restore() : onedrive.run();
    void task.then(({ ok, reason, message }) => {
      setTimeout(() => {
        setSpell((s) => ({ ...s, show: false }));
        if (ok) sync.succeeded();
        else {
          sync.failed(reason ?? "error", message);
          haptic(30);
        }
      }, 900);
    });
  }

  // ---- spells (what each spell DOES; the registry is just data) ----
  function recordQuery(q: string) {
    const t = q.trim();
    if (!t) return;
    setRecents((prev) => {
      const next = [t, ...prev.filter((x) => x !== t)].slice(0, 6);
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        /* no-op */
      }
      return next;
    });
  }
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1500);
  }
  function runRecent(q: string) {
    accio.handleInput(q); // rerun the filter in place (resident, no keyboard)
  }

  // a brief twinkle at the ring center when the menu closes / switches view — a small bit of
  // magic that never gates the UI (plays over whatever the UI became; self-clears).
  function flashSparkle() {
    if (reduce) return;
    setSparkle((n) => n + 1);
    if (sparkleTimer.current) clearTimeout(sparkleTimer.current);
    sparkleTimer.current = setTimeout(() => setSparkle(0), 300);
  }

  // ---- FORMS: the One Question walk-through ----

  /** The Form spell: one form → straight in; several → "Which form?"; none → how to make one. */
  function castForm() {
    const forms = formsIn(dataRef.current!);
    if (!forms.length) showToast("No forms yet — on the computer: open a memory → ⋯ → Use as form");
    else if (forms.length === 1) startForm(forms[0]);
    else setFormPicker(forms);
  }

  function startForm(form: Note) {
    setFormPicker(null);
    accio.clearSearch();
    const now = Date.now();
    const id = newId();
    const model = startSession(form, id, new Date(now));
    const note: Note = {
      id,
      t: "",
      c: "",
      cat: form.cat,
      shape: form.shape,
      fill: 0.18,
      d: "Just now",
      created: "Just now",
      createdAt: now,
      updatedAt: now,
      when: fmtNow(),
      draft: form.id, // local only until Done seals it into a package
    };
    applySession(note, model, {});
    formNoteRef.current = note;
    setFormRun({ model, answers: {}, recording: false });
    haptic(10);
  }

  /** Not in the vault until there's something real (like a Snap/Record capture). */
  function ensureFormNoteSaved(): Note {
    const note = formNoteRef.current!;
    if (!dataRef.current!.some((n) => n.id === note.id)) {
      dataRef.current!.unshift(note);
      persistVault(dataRef.current!);
      renderAll(filterQueryRef.current);
    }
    return note;
  }

  function saveFormNoteSoon() {
    if (formSaveTimer.current) clearTimeout(formSaveTimer.current);
    formSaveTimer.current = setTimeout(() => {
      formSaveTimer.current = null;
      persistVault(dataRef.current!);
      renderAll(filterQueryRef.current);
    }, 400);
  }

  function onFormAnswer(fieldId: string, a: SessionAnswer) {
    const run = formRunRef.current;
    const note = formNoteRef.current;
    if (!run || !note) return;
    const answers = { ...run.answers, [fieldId]: a };
    applySession(note, run.model, answers);
    note.updatedAt = Date.now();
    note.d = "Just now";
    note.fill = Math.min(1, Math.max(0.18, note.c.length / 220));
    setFormRun({ ...run, answers });
    if (sessionHasContent(note, answers)) {
      ensureFormNoteSaved();
      saveFormNoteSoon();
      sync.edit();
    }
  }

  function addFormMedia(block: NoteBlock) {
    const run = formRunRef.current;
    const note = ensureFormNoteSaved();
    if (!run) return;
    note.c = `${note.c}\n\n${serializeBlocks([block])}`;
    applySession(note, run.model, run.answers);
    note.updatedAt = Date.now();
    persistVault(dataRef.current!);
    renderAll(filterQueryRef.current);
    sync.edit();
    setFormRun({ ...run });
    haptic(10);
  }

  /** Record in the Dock: start the ONE session take; then it toggles pause/resume. A phone lock
   *  pauses it too (session mode) — tapping Record again picks the same take back up. */
  async function onFormRecord() {
    const run = formRunRef.current;
    if (!run) return;
    haptic(10);
    const snap = activeSnapshot();
    if (!run.recording) {
      const note = ensureFormNoteSaved();
      const r = await startRecording(note.id, note.c, voiceDeps, { keepOnHide: true });
      if (!r.ok) {
        showToast(r.error);
        return;
      }
      setFormRun((cur) => (cur ? { ...cur, recording: true } : cur));
      sync.edit();
    } else if (snap?.state === "recording") pauseRecording();
    else if (snap?.state === "paused") {
      const r = await resumeRecording();
      if (!r.ok) showToast(r.error);
    }
  }

  /** Seal a walk-through into a package for the desktop's Patronus (its sync spell: the
   *  form's own, or the default) and take the local draft out of the vault. */
  function sealFormDraft(note: Note, formId: string) {
    const form = dataRef.current!.find((n) => n.id === formId);
    const pkg = packageFromSession(note, formId, spellFor("form", templateSpell(form)));
    updateRawBatch(pkg);
    const idx = dataRef.current!.findIndex((n) => n.id === note.id);
    if (idx !== -1) dataRef.current!.splice(idx, 1);
  }

  /** Done (review) or Back (any question): stop + save the take, then seal it as a package —
   *  sealed until the desktop's Patronus carries out its sync spell (transcribe + fill).
   *  Nothing real in it → it never existed. */
  async function finishForm() {
    const run = formRunRef.current;
    const note = formNoteRef.current;
    if (!run || !note) return;
    if (formSaveTimer.current) clearTimeout(formSaveTimer.current);
    if (run.recording && isRecording()) await stopRecording(); // finalizes the WAV into note.c
    const idx = dataRef.current!.findIndex((n) => n.id === note.id);
    if (idx !== -1 && sessionHasContent(note, run.answers)) {
      applySession(note, run.model, run.answers);
      note.updatedAt = Date.now();
      sealFormDraft(note, run.model.formId);
      sync.edit();
      showToast("Sealed — Patronus fills it in on the computer");
    } else if (idx !== -1) {
      dataRef.current!.splice(idx, 1);
    }
    persistVault(dataRef.current!);
    renderAll(filterQueryRef.current);
    formNoteRef.current = null;
    setFormRun(null);
    haptic(14);
  }

  function onFormSpell(id: "form-record" | "back" | "form-done") {
    if (id === "form-record") void onFormRecord();
    else void finishForm();
  }

  /** A leaf spell was cast from the ring (no children, no window). A quick tap on Sync
   *  backs up immediately (see longCastSpell for the hold-to-open-panel half). */
  function castSpellAction(s: Spell) {
    flashSparkle();
    menu.close();
    if (s.id === "write") openNewNote(false);
    else if (s.id === "accio") accio.openAccio();
    else if (s.id === "sync") castSpell();
    else if (s.id === "image") openImagePicker("photo");
    else if (s.id === "gallery") openImagePicker("gallery");
    else if (s.id === "snap") startCaptureImage();
    else if (s.id === "voice") startCaptureVoice();
    else if (s.id === "record-new") startVoiceInCurrentNote();
    else if (s.id === "record-upload") openAudioPicker();
    else if (s.id === "film") startCaptureVideo();
    else if (s.id === "clip-film") filmIntoCurrentNote();
    else if (s.id === "clip-upload") uploadVideoIntoCurrentNote();
    else if (s.id === "delete") setConfirmDelete(true); // never deletes on the tap — confirm first
    else if (s.id === "edit") phoneCollection.toggleEditMode(); // board-scoped: arrange/remove mode
    else if (s.id === "journal") setCaptureBatch(createRawBatch()); // mint + jump straight into the camera
    else if (s.id === "form") castForm();
    else if (s.id === "form-photo") openImagePicker("photo"); // lands at the bottom of the form's memory (onPickFiles)
    else if (s.id === "form-film") openVideoPicker("upload"); // iOS offers Take Video / Library
    else if (s.id === "raw-add") {
      // "Add pages" from the detail ring: leave the detail sheet, resume shooting into
      // the SAME batch (not a new one) — the whole point of it still being editable.
      if (detailBatch) {
        setCaptureBatch(detailBatch);
        setDetailBatchId(null);
      }
    } else if (s.id === "raw-delete") setConfirmDeleteRaw(true); // never deletes on the tap — confirm first
    else showToast(`✨ ${s.name} cast`);
  }
  /** Held a spell: Write = speak; a "window" spell (Sync) opens its panel instead of
   *  casting (the ring stays open underneath, same as the old tap-to-open behaviour). */
  function longCastSpell(s: Spell) {
    if (s.longPress === "speak") {
      flashSparkle();
      menu.close();
      openNewNote(true);
    } else if (s.longPress === "window") {
      flashSparkle();
      menu.openWindow(s.id);
    }
  }
  /** The Sync window's primary action — cast the backup over the (closed) menu.
   *  Exception: a dead sign-in (ReconnectNeededError) can NEVER be fixed by
   *  retrying the same cast — route that one case to reconnect instead, so
   *  "Try again" is never a dead-end loop. */
  function syncWindowPrimary() {
    if (syncStatus === "offline" || syncStatus === "syncing") return;
    menu.close();
    if (syncStatus === "failed" && sync.state.failReason === "reconnect") {
      onedrive.connect();
      return;
    }
    castSpell();
  }
  /** The Sync window's restore — pull the whole vault down from the cloud (confirmed
   *  inline in the window). Prototype: the same cast, pull-flavoured. */
  function syncWindowRestore() {
    if (syncStatus === "offline" || syncStatus === "syncing") return;
    menu.close();
    castSpell({ restore: true });
  }

  // ---- wire the fns ref (latest closures) ----
  fns.current.onKbUp = () => {
    accio.onKbUp();
    if (editingRef.current) keepCaretVisible();
    setKbOpen(true);
  };
  fns.current.onKbDown = () => {
    setKbOpen(false);
    if (filterQueryRef.current.trim()) recordQuery(filterQueryRef.current);
    accio.handleKeyboardClosed();
  };

  // ---- effects ----
  // apply the reel scroll intent + relayout once the new cards have committed
  useEffect(() => {
    const reel = reelRef.current;
    const it = reelIntent.current;
    reelIntent.current = null;
    if (reel && it) {
      if (it.mode === "jump0") reel.scrollTop = 0;
      else if (it.mode === "restore") reel.scrollTop = it.to;
      else if (it.mode === "smooth0") reel.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    }
    fisheye.relayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, rawBatches]);

  // the summon bar / scrim changes the reel height → re-measure the loupe
  useEffect(() => {
    fisheye.relayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accio.searching, accio.filtering, kbOpen]);

  // On launch, present the Spell Menu over the memory bank (owner's choice) — the spells are
  // the first thing you see; tap one, or tap the background to drop into the reel.
  useEffect(() => {
    menu.openMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Startup recovery sweep: finalize any voice-recording session left behind by a harder kill
  // than the background-hide handler could catch (OS killed the page outright) — "saved just
  // in case." Cheap no-op when there's nothing to recover.
  // Then seal any form walk-through the kill interrupted (a `draft` left in the vault, with
  // its recording recovered onto it just above) — it leaves as a package, like a Done.
  useEffect(() => {
    void recoverOrphanedRecordings(voiceDeps).then(() => {
      const drafts = dataRef.current!.filter((n) => n.draft && n.id !== formNoteRef.current?.id);
      if (!drafts.length) return;
      for (const d of drafts) {
        if ((d.c || "").trim()) sealFormDraft(d, d.draft!);
        else dataRef.current!.splice(dataRef.current!.indexOf(d), 1);
      }
      persistVault(dataRef.current!);
      renderAll(filterQueryRef.current);
      sync.edit();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track the photo collection's open state so the Spell Menu context switches to "collection"
  // (only "Photo") while the board is up, and back to "note" (Photo + Gallery) when it closes.
  useEffect(() => phoneCollection.subscribe((s) => setCollectionOpen(s.open)), []);

  // window resize → re-measure the reel (the wheel/keyboard own their own resize)
  useEffect(() => {
    const onResize = () => fisheye.relayout();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // elastic-scroll guard: only the reel, note, search-results, and the full-screen media
  // overlays (lightbox / collection / transcript reader — mounted as SIBLINGS of .note at
  // the app root, so .closest(".note") never matches inside them) may move under a finger
  // (HARD constraint #4 — native listener, {passive:false}). Source ~1540-1542.
  //
  // This one allowlist was the real cause behind three reports that looked unrelated: the
  // collection wouldn't scroll, the lightbox wouldn't swipe between photos, and the
  // transcript reader wouldn't scroll — all three are full-screen overlays outside .note,
  // so every touchmove inside them hit this guard's preventDefault(). Add any FUTURE
  // full-screen overlay here too, or it will look identically "dead" on a real device.
  useEffect(() => {
    const SCROLLABLE = ".reel,.note,.search-results,.ph-lightbox,.ph-collection,.ph-reader,.ph-journal-capture,.ph-journal-strip,.ph-form-deck,.ph-form-card";
    const onTouchMove = (e: TouchEvent) => {
      const t = e.target as Element | null;
      if (!t || !t.closest(SCROLLABLE)) e.preventDefault();
    };
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => document.removeEventListener("touchmove", onTouchMove);
  }, []);

  // ---- render ----
  const rootClass = ["screen", "app-root"];
  if (accio.searching) rootClass.push("searching");
  if (accio.filtering) rootClass.push("filtering");
  if (kbOpen) rootClass.push("kb-open");
  if (editingNote) rootClass.push("editing-note");

  const emptyMsg = accio.filterQuery.trim() ? "Nothing answered that call." : "Nothing here yet.";
  const scount = accio.filterQuery.trim() ? String(searchList.length) : "";

  return (
    <div className={rootClass.join(" ")} ref={rootRef}>
      {/* HOME — the one surface. Accio filters this reel in place. */}
      <div className="app">
        <div className="header">
          <h1>Pensieve</h1>
          {runeState === "synced" ? (
            <span className="count">{count}</span>
          ) : (
            <SyncRune status={runeState} size={20} className="header-sync" />
          )}
        </div>
        <Reel
          view={view}
          rawBatches={rawBatches}
          queryText={queryText}
          onOpen={openNote}
          onOpenRaw={(b) => setDetailBatchId(b.id)}
          reelRef={reelRef}
          trackRef={trackRef}
        />
        <Glass empty={view.length === 0} message={emptyMsg} glassRef={glassRef} />
      </div>

      {/* THE DOCK — bottom control bar (gold menu button + resident Accio) */}
      <Dock
        layout={HOME_DOCK}
        onOpenMenu={() => {
          haptic(10);
          menu.openMenu();
        }}
        menuBadge={runeState}
        accio={{
          query: accio.filterQuery,
          count: scount,
          latestRecent: recents[0],
          onOpen: () => accio.openAccio(),
          onClear: () => accio.clearSearch(),
          onRunRecent: runRecent,
        }}
      />

      {/* SYNC cast animation (the gold spell) */}
      <SyncSpell show={spell.show} castId={spell.castId} />

      {/* ACCIO searching sheet + the summon bar — mounted ONLY while searching (openAccio
          flushSyncs `searching` true so the input exists for its in-gesture focus), so
          none of it sits in the home DOM at rest. */}
      {accio.searching ? (
        <>
          <SearchSheet list={searchList} queryText={queryText} onOpen={openNote} />
          {!accio.filterQuery.trim() ? <DockSettings recents={recents} onRun={runRecent} /> : null}
          <SummonBar
            inputRef={accioInputRef}
            value={accio.filterQuery}
            count={scount}
            onInput={accio.handleInput}
            onKeyDown={accio.handleKeydown}
            onBlur={accio.handleInputBlur}
          />
        </>
      ) : null}

      {/* FORMS: the One Question walk-through (below the Spell Menu overlay so the ring blooms over it) */}
      {formRun ? (
        <FormSession
          session={formRun.model}
          answers={formRun.answers}
          onAnswer={onFormAnswer}
          media={mediaBlocksOf(formNoteRef.current?.c ?? "")}
          recording={formRun.recording}
          onSpell={onFormSpell}
          onOpenMenu={() => {
            haptic(10);
            menu.openMenu();
          }}
        />
      ) : null}
      {formPicker ? <FormPicker forms={formPicker} onPick={startForm} onCancel={() => setFormPicker(null)} /> : null}

      {/* THE SPELL MENU — radial overlay bloomed from the gold button */}
      <SpellMenu
        api={menu}
        onCast={castSpellAction}
        onLongCast={longCastSpell}
        onSparkle={flashSparkle}
        syncState={syncStatus}
        runeState={runeState}
        syncFailReason={sync.state.failReason}
        syncFailMessage={sync.state.failMessage}
        account={onedrive.account}
        connected={onedrive.connected}
        onSyncPrimary={syncWindowPrimary}
        onSyncRestore={syncWindowRestore}
        onSyncConnect={onedrive.connect}
        onSyncDisconnect={onedrive.disconnect}
        reduce={reduce}
      />
      {toast ? <div className="spell-toast">{toast}</div> : null}

      {/* a brief close/switch twinkle — a top-level sibling so it survives the overlay unmount */}
      {sparkle ? <span className="spell-sparkle" key={sparkle} aria-hidden="true" /> : null}

      {/* THE MEMORY PAGE — its own full-screen surface, mounted only while open/closing */}
      {noteMounted ? (
        <MemoryPage
          open={noteOpen}
          noteRef={noteRef}
          surfaceRef={noteSurfaceRef}
          bodyRef={noteBodyRef}
          dateRef={noteDateRef}
          savedRef={noteSavedRef}
          voiceRef={voiceRef}
          micListening={micListening}
          onBack={() => exitNote()}
          onDateClick={() => noteBodyRef.current?.blur()}
          onBodyInput={onBodyInput}
          onBodyKeyDown={onBodyKeyDown}
          onBodyFocus={() => setEditingNote(true)}
          onBodyBlur={() => setEditingNote(false)}
          onFormat={applyFmt}
          onInsertImage={openImagePicker}
          onOpenSpellMenu={() => {
            haptic(10);
            menu.openMenu();
          }}
          onVoice={toggleDictation}
          onDone={() => noteBodyRef.current?.blur()}
        />
      ) : null}

      {/* THE LIGHTBOX — full-screen image viewer (summoned imperatively from a media block) */}
      <PhoneLightbox />
      <PhoneCollection onOpenMenu={() => { haptic(10); menu.openMenu(); }} />
      <PhoneTranscriptReader />
      {voicePanel.open && voicePanel.noteId ? (
        <VoiceRecorderPanel
          noteId={voicePanel.noteId}
          placeholderBody={voicePanel.placeholderBody}
          deps={voiceDeps}
          onClose={() => setVoicePanel({ open: false, noteId: null, placeholderBody: "" })}
        />
      ) : null}
      {confirmDelete ? (
        <ConfirmDeleteNote onCancel={() => setConfirmDelete(false)} onConfirm={deleteCurrentNote} />
      ) : null}

      {/* Journal (RAW-MEMORY-JOURNAL): the camera session, the detail sheet, and the
          batch-delete confirm. A Raw Memory is never a Note, so none of these touch
          dataRef/persistVault — see lib/media/rawMemoryStore. */}
      {captureBatch ? (
        <JournalCaptureScreen
          batch={captureBatch}
          onChangeBatch={(b) => {
            setCaptureBatch(b);
            updateRawBatch(b);
          }}
          onDone={() => {
            const finished = captureBatch;
            setCaptureBatch(null);
            // Straight to "synced", not a transient "queued" phase — a batch here is just
            // waiting for the NEXT sync to push it, same as any other local-only create. A
            // separate "queued" status that only flips to "synced" AFTER a push used to mean
            // the flip itself needed a second round-trip to reach the cloud (fixed once by
            // bumping updatedAt on the flip, but that still cost an extra sync); not having a
            // "queued" state at all removes the bug class instead of patching around it.
            if (finished && finished.pages.length > 0) updateRawBatch({ ...finished, status: "synced" });
          }}
        />
      ) : null}
      {detailBatch?.kind === "form" ? (
        <PackageDetailScreen
          batch={detailBatch}
          onBack={() => setDetailBatchId(null)}
          onOpenMenu={() => {
            haptic(10);
            menu.openMenu();
          }}
        />
      ) : detailBatch ? (
        <JournalDetailScreen
          batch={detailBatch}
          onChangeBatch={updateRawBatch}
          onBack={() => setDetailBatchId(null)}
          onOpenMenu={() => {
            haptic(10);
            menu.openMenu();
          }}
        />
      ) : null}
      {confirmDeleteRaw && detailBatch ? (
        <ConfirmDeleteRawBatch
          pageCount={detailBatch.pages.length}
          packageTitle={detailBatch.kind === "form" ? detailBatch.title ?? "" : undefined}
          onCancel={() => setConfirmDeleteRaw(false)}
          onConfirm={() => {
            void deleteRawBatch(detailBatch).then(() => {
              removeRawBatch(detailBatch.id);
              setConfirmDeleteRaw(false);
              setDetailBatchId(null);
              showToast("Deleted — removed here and from the cloud once synced.");
            });
          }}
        />
      ) : null}

      {/* the ONE file-picker input — always mounted (not scoped to the Memory page) so "Snap"
          can reach it from the HOME screen too, before any memory is open. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onPickFiles(e.target.files);
          e.target.value = ""; // allow re-picking the same file
        }}
      />

      {/* the audio-upload input — the "Voice" conditional spell's Upload option. A bare
          "audio/*" wildcard sometimes leaves iOS unable to resolve a confident UTI, so it falls
          back to the full Photo Library/Camera/Browse sheet; an explicit mime+extension list
          (the same formats mintAudioRef already recognizes) gets WebKit to skip straight to
          Browse instead. There's no web API to pre-target the Voice Memos folder inside Browse
          — that's native-only, not exposed to a web view. */}
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/x-m4a,audio/mp4,audio/aac,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/webm,audio/ogg,.m4a,.caf,.aac,.mp3,.wav,.ogg"
        hidden
        onChange={(e) => {
          onPickAudioFile(e.target.files);
          e.target.value = "";
        }}
      />

      {/* the video input — mounted at the root (not scoped to the Memory page) exactly like
          the image input, so "Film" can reach it from Home before any memory is open.
          `capture` toggles between the native video camera (Film) and the standard
          Photos/Files browse sheet (Upload) — see openVideoPicker. */}
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          onPickVideoFile(e.target.files);
          e.target.value = "";
        }}
      />

      <ConjureThread threadRef={threadRef} />
      <div className="home-indicator" />
    </div>
  );
}

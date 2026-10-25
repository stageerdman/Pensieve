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
import { insertImages, renderNoteBody, type MediaCtx } from "./components/note/mediaDom";
import { phoneCollection } from "./lib/media/collectionController";
import { PhoneLightbox } from "./components/note/PhoneLightbox";
import { PhoneCollection } from "./components/note/PhoneCollection";
import { PhoneTranscriptReader } from "./components/note/PhoneTranscriptReader";
import { mintMediaRef, registerLocalMedia } from "./lib/media/mediaStore";
import type { MediaImage } from "./lib/media/noteMedia";
import { pauseAllAudio } from "./lib/media/audioController";

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

  const fisheye = useReelFisheye(reelRef, trackRef, glassRef);
  // The Spell Menu is context-aware: an open photo collection offers only "Photo" (add to that
  // gallery); a memory offers "Photo" + "Gallery"; home opens General. The collection sits on top
  // of the memory, so its context must win.
  const menu = useSpellMenu(collectionOpen ? "collection" : noteMounted ? "note" : "home");

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

  // A real sync may have pulled/removed notes behind dataRef's back (it writes
  // straight to the same localStorage vault) — reload from storage, then re-render.
  const onedrive = useOneDriveSync(() => {
    dataRef.current = loadVault();
    renderAll(filterQueryRef.current);
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

  function exitNote() {
    if (currentRef.current) autosave.commit();
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

  // ---- note body events ----
  function onBodyInput() {
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
  // any); "gallery" = the "Gallery" spell → always start a fresh, separate gallery block.
  const pickModeRef = useRef<"photo" | "gallery">("photo");
  function openImagePicker(mode: "photo" | "gallery" = "photo") {
    pickModeRef.current = mode;
    fileInputRef.current?.click();
  }

  function onPickFiles(files: FileList | null) {
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
    void task.then(({ ok }) => {
      setTimeout(() => {
        setSpell((s) => ({ ...s, show: false }));
        if (ok) sync.succeeded();
        else {
          sync.failed();
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
    else if (s.id === "edit") phoneCollection.toggleEditMode(); // board-scoped: arrange/remove mode
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
  /** The Sync window's primary action — cast the backup over the (closed) menu. */
  function syncWindowPrimary() {
    if (syncStatus === "offline" || syncStatus === "syncing") return;
    menu.close();
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
  }, [view]);

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

  // elastic-scroll guard: only the reel, note, and search-results may move under a
  // finger (HARD constraint #4 — native listener, {passive:false}). Source ~1540-1542.
  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      const t = e.target as Element | null;
      if (!t || !t.closest(".reel,.note,.search-results")) e.preventDefault();
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
          {syncStatus === "synced" ? (
            <span className="count">{count}</span>
          ) : (
            <SyncRune status={syncStatus} size={20} className="header-sync" />
          )}
        </div>
        <Reel view={view} queryText={queryText} onOpen={openNote} reelRef={reelRef} trackRef={trackRef} />
        <Glass empty={view.length === 0} message={emptyMsg} glassRef={glassRef} />
      </div>

      {/* THE DOCK — bottom control bar (gold menu button + resident Accio) */}
      <Dock
        layout={HOME_DOCK}
        onOpenMenu={() => {
          haptic(10);
          menu.openMenu();
        }}
        menuBadge={syncStatus}
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

      {/* THE SPELL MENU — radial overlay bloomed from the gold button */}
      <SpellMenu
        api={menu}
        onCast={castSpellAction}
        onLongCast={longCastSpell}
        onSparkle={flashSparkle}
        syncState={syncStatus}
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
          fileInputRef={fileInputRef}
          micListening={micListening}
          onBack={() => exitNote()}
          onDateClick={() => noteBodyRef.current?.blur()}
          onBodyInput={onBodyInput}
          onBodyKeyDown={onBodyKeyDown}
          onBodyFocus={() => setEditingNote(true)}
          onBodyBlur={() => setEditingNote(false)}
          onFormat={applyFmt}
          onInsertImage={openImagePicker}
          onPickFiles={onPickFiles}
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

      <ConjureThread threadRef={threadRef} />
      <div className="home-indicator" />
    </div>
  );
}

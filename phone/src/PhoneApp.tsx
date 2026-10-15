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
import { createSeed } from "./seed";
import { haptic, prefersReducedMotion } from "./util";
import { parseQuery, passesDate, passesText } from "./lib/wand/accioQuery";
import { rankNotes } from "./lib/wand/accioRank";
import { CAT_HUE, SHAPES } from "./lib/wand/flaskSvg";
import type { SyncStatus } from "./lib/wand/syncMachine";

import { useKeyboardInset } from "./hooks/useKeyboardInset";
import { useReelFisheye } from "./hooks/useReelFisheye";
import { useAccioSearch } from "./hooks/useAccioSearch";
import { useSyncState } from "./hooks/useSyncState";
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
import { MemoryPage } from "./components/note/MemoryPage";
import type { FmtKey } from "./components/note/NoteToolbar";
import { ConjureThread, conjure } from "./components/ConjureThread";
import { currentBlock, focusTitle, placeCaret, syncPlaceholders } from "./components/note/noteEditing";
import { insertImages, renderNoteBody, type MediaCtx } from "./components/note/mediaDom";
import { PhoneLightbox } from "./components/note/PhoneLightbox";
import { PhoneCollection } from "./components/note/PhoneCollection";
import { mintMediaRef, registerLocalMedia } from "./lib/media/mediaStore";
import type { MediaImage } from "./lib/media/noteMedia";

const ACCOUNT = "jakub.cervenka@icloud.com";
const DICTATION_SAMPLE =
  "I keep coming back to the idea that the phone shouldn't make me think. It should just catch the thought before it escapes.";
// PROTOTYPE-ONLY demo fault injection so the owner can feel the red "failed" state on
// device (same as the source ~1465). The pure syncMachine has no dice roll.
const FAIL_RATE = 0.4;

/** viewData(): the reel's list — everything, or the filtered matches. Source ~691-695. */
function computeView(data: Note[], query: string, openedOrder: number[]): Note[] {
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
const RECENTS_KEY = "pensieve.recentQueries";
function loadRecents(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

// Vault persistence — the phone prototype ran purely on in-memory seed data (reset every
// reload). Images need a reload to actually ROUND-TRIP (the owner's device check), and the
// photo BYTES live in IndexedDB keyed by ref, so the note TEXT (which carries those refs as
// markdown) must persist too. We keep the whole notes array in localStorage; an absent/invalid
// store falls back to the seed (so clearing storage restores the demo). Media bytes stay in
// IndexedDB — never base64 in here.
const VAULT_KEY = "pensieve.phone.vault";
function loadVault(): Note[] {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return createSeed();
    const v = JSON.parse(raw);
    if (Array.isArray(v) && v.length && v.every((n) => n && typeof n.id === "number")) return v as Note[];
  } catch {
    /* corrupt / absent — fall back to seed */
  }
  return createSeed();
}
function persistVault(data: Note[]) {
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(data));
  } catch {
    /* quota / unavailable — a reload just falls back to seed, no crash */
  }
}


export function PhoneApp() {
  const reduce = prefersReducedMotion();

  // ---- mutable vault (the prototype's DATA) ----
  const dataRef = useRef<Note[]>();
  if (!dataRef.current) dataRef.current = loadVault();
  const uidRef = useRef(dataRef.current.reduce((m, n) => Math.max(m, n.id), 0));
  const openedOrderRef = useRef<number[]>([]);
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
  const [editingNote, setEditingNote] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  const [micListening, setMicListening] = useState(false);
  const [spell, setSpell] = useState({ show: false, castId: 0, label: "", labelColor: "" });
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
  // The Spell Menu is note-aware: with a memory open it opens in Conditional form, whose
  // roster is led by "Picture" (see registry.conditionalSpells("note")). On home it's General.
  const menu = useSpellMenu(noteMounted ? "note" : "home");

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
  function noteOpened(id: number) {
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
    const d: Note = {
      id: ++uidRef.current,
      t: "",
      c: "",
      cat: randCat(),
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      fill: 0.18,
      d: "Just now",
      created: "Just now",
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
  function openImagePicker() {
    fileInputRef.current?.click();
  }

  function onPickFiles(files: FileList | null) {
    const noteBody = noteBodyRef.current;
    const note = currentRef.current;
    if (!files || !files.length || !noteBody || !note) return;
    const images: MediaImage[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const ref = mintMediaRef(note.id, file); // media/<noteId>/<id>.<ext> — the shared model
      registerLocalMedia(ref, file); // instant object URL + background IndexedDB write
      images.push({ ref });
    }
    if (!images.length) return;
    insertImages(noteBody, images, mediaCtx); // single / gallery / adjacency-merge, then onChange
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
  // One cast drives both directions in the prototype — back up (weave UP) and restore
  // (pull DOWN) share the spell visual and the success/fail machine, differing only in
  // copy. (The real pull lives in the desktop engine; the phone is capture-only here.)
  function castSpell(opts?: { weaving?: string; done?: string }) {
    if (syncStatus === "syncing" || syncStatus === "offline") return;
    sync.cast();
    haptic(14);
    const castId = spell.castId + 1;
    setSpell({ show: true, castId, label: opts?.weaving ?? "Weaving to the cloud…", labelColor: "" });
    const willFail = demoForceFail.current || Math.random() < FAIL_RATE;
    demoForceFail.current = false;
    setTimeout(() => {
      setSpell((s) => ({
        ...s,
        label: willFail ? "Couldn't reach the cloud" : (opts?.done ?? "All memories safe · just now"),
        labelColor: willFail ? "hsl(var(--danger))" : "hsl(var(--success))",
      }));
    }, 1300);
    setTimeout(() => {
      setSpell((s) => ({ ...s, show: false }));
      if (willFail) {
        sync.failed();
        haptic(30);
      } else {
        sync.succeeded();
      }
    }, 1900);
  }
  const demoForceFail = useRef(true);

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

  /** A leaf spell was cast from the ring (no children, no window). */
  function castSpellAction(s: Spell) {
    flashSparkle();
    menu.close();
    if (s.id === "write") openNewNote(false);
    else if (s.id === "accio") accio.openAccio();
    else if (s.id === "image") openImagePicker();
    else showToast(`✨ ${s.name} cast`);
  }
  /** Held a spell (Write = speak). */
  function longCastSpell(s: Spell) {
    if (s.longPress === "speak") {
      flashSparkle();
      menu.close();
      openNewNote(true);
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
    castSpell({ weaving: "Pulling your memories from the cloud…", done: "Restored from the cloud · just now" });
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
          <span className="count">{count}</span>
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
      <SyncSpell show={spell.show} castId={spell.castId} label={spell.label} labelColor={spell.labelColor} />

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
        account={ACCOUNT}
        onSyncPrimary={syncWindowPrimary}
        onSyncRestore={syncWindowRestore}
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
      <PhoneCollection />

      <ConjureThread threadRef={threadRef} />
      <div className="home-indicator" />
    </div>
  );
}

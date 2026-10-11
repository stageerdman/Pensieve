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
import type { Note } from "./types";
import { createSeed } from "./seed";
import { esc, haptic, prefersReducedMotion } from "./util";
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
import { useSpellMenu, type PoofKind } from "./hooks/useSpellMenu";
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
import { NoteView } from "./components/note/NoteView";
import type { FmtKey } from "./components/note/NoteToolbar";
import { ConjureThread, conjure } from "./components/ConjureThread";
import { currentBlock, focusTitle, placeCaret, syncPlaceholders } from "./components/note/noteEditing";

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

// The "Poof bridge": when the ring is dismissed/switched/descended, each glyph leaves behind
// a GHOST disc that visibly dissolves + a bold eruption of hue-matched motes, plus one hub
// shockwave and (on close) a scrim echo. It's a top-level layer that survives the overlay
// unmount and self-removes — never gating the UI. Travel vectors vary by PoofKind.
type PoofGhost = { x: number; y: number; d: number; hue: string; gx: number; gy: number; gs: number; delay: number };
type PoofMote = { x: number; y: number; mx: number; my: number; size: number; delay: number; dur: number; hue: string };
type Poof = { id: number; kind: PoofKind; ghosts: PoofGhost[]; motes: PoofMote[]; hubX: number; hubY: number; hue: string };

export function PhoneApp() {
  const reduce = prefersReducedMotion();

  // ---- mutable vault (the prototype's DATA) ----
  const dataRef = useRef<Note[]>();
  if (!dataRef.current) dataRef.current = createSeed();
  const uidRef = useRef(dataRef.current.length);
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

  // ---- React state (drives re-renders only; NOT the 60fps loops) ----
  const [view, setView] = useState<Note[]>(() => computeView(dataRef.current!, "", []));
  const [searchList, setSearchList] = useState<Note[]>(() => rankNotes(dataRef.current!, "", []));
  const [count, setCount] = useState<string>(() => computeCount("", dataRef.current!.length, dataRef.current!.length));
  const [noteOpen, setNoteOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  const [micListening, setMicListening] = useState(false);
  const [spell, setSpell] = useState({ show: false, castId: 0, label: "", labelColor: "" });
  const [recents, setRecents] = useState<string[]>(loadRecents);
  const [toast, setToast] = useState("");
  const [poof, setPoof] = useState<Poof | null>(null);
  const poofId = useRef(0);

  // mirrors for use inside stable event callbacks
  const editingRef = useRef(editingNote);
  editingRef.current = editingNote;
  const filterQueryRef = useRef("");
  const dictRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const menu = useSpellMenu("home");

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
      renderAll(filterQueryRef.current);
      reelIntent.current = { mode: "smooth0", to: 0 };
    },
    onRender: () => {
      renderAll(filterQueryRef.current);
    },
    onDirty: () => sync.edit(),
  });

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
    const noteBody = noteBodyRef.current;
    if (noteDateRef.current) noteDateRef.current.textContent = d.when || "Written " + (d.created || d.d);
    if (noteBody) {
      if (d.fresh) {
        noteBody.innerHTML = "<h1><br></h1>"; // empty title line, caret-ready
      } else {
        const body = d.c
          ? d.c
              .split("\n")
              .map((l) => (l.trim() ? `<div>${esc(l)}</div>` : "<div><br></div>"))
              .join("")
          : "";
        noteBody.innerHTML = `<h1>${esc(d.t || "")}</h1>` + body;
      }
      syncPlaceholders(noteBody);
    }
    setNoteOpen(true);
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
    setNoteOpen(false);
    setEditingNote(false);
    currentRef.current = null;
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
  function castSpell() {
    if (syncStatus === "syncing" || syncStatus === "offline") return;
    sync.cast();
    haptic(14);
    const castId = spell.castId + 1;
    setSpell({ show: true, castId, label: "Weaving to the cloud…", labelColor: "" });
    const willFail = demoForceFail.current || Math.random() < FAIL_RATE;
    demoForceFail.current = false;
    setTimeout(() => {
      setSpell((s) => ({
        ...s,
        label: willFail ? "Couldn't reach the cloud" : "All memories safe · just now",
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

  // Snapshot the live ring (each glyph's screen rect + hue), THEN let the caller change state.
  // The ghosts/motes/shockwave play over wherever the UI went — never gating it. Travel vectors
  // vary by kind so close/descend/ascend/toggle each read differently.
  function firePoof(kind: PoofKind) {
    const btns = document.querySelectorAll<HTMLElement>(".spell-overlay .spell-node .spell-btn");
    if (!btns.length) return;
    const hubX = window.innerWidth * 0.5;
    const hubY = window.innerHeight * 0.56; // RING.centerYFrac
    const formHue = menu.hue === "accent" ? "218 100% 72%" : "43 100% 64%";
    const ghosts: PoofGhost[] = [];
    const motes: PoofMote[] = [];

    btns.forEach((btn) => {
      const r = btn.getBoundingClientRect();
      if (!r.width) return;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hue = getComputedStyle(btn).getPropertyValue("--sh-glow").trim() || formHue;
      const vx = hubX - cx;
      const vy = hubY - cy;
      const len = Math.hypot(vx, vy) || 1;
      const ux = vx / len;
      const uy = vy / len; // toward hub
      const tx = -uy;
      const ty = ux; // tangent

      let gx = ux * -10;
      let gy = -46;
      let gs = 1.42;
      if (kind === "descend") {
        gx = vx * 0.92;
        gy = vy * 0.92;
        gs = 0.15;
      } else if (kind === "ascend") {
        gx = -ux * 54;
        gy = -uy * 54 - 10;
        gs = 1.7;
      } else if (kind === "toggle") {
        gx = tx * 70 - ux * 8;
        gy = ty * 70 - uy * 8;
        gs = 0.6;
      }
      ghosts.push({ x: cx, y: cy, d: r.width, hue, gx, gy, gs, delay: 0 });

      const make = (count: number, sMin: number, sMax: number, reach: number, dMax: number) => {
        for (let k = 0; k < count; k++) {
          let mx = (Math.random() * 2 - 1) * 46;
          let my = -(84 + Math.random() * 78);
          if (kind === "descend") {
            mx = vx * (0.7 + Math.random() * 0.5);
            my = vy * (0.7 + Math.random() * 0.5);
          } else if (kind === "ascend") {
            mx = -ux * (reach * 0.9) + (Math.random() * 2 - 1) * 24;
            my = -uy * (reach * 0.9) - 30;
          } else if (kind === "toggle") {
            mx = tx * reach * (0.7 + Math.random() * 0.6) - ux * 10;
            my = ty * reach * (0.7 + Math.random() * 0.6) - uy * 10;
          }
          motes.push({
            x: cx + (Math.random() * 2 - 1) * r.width * 0.42,
            y: cy + (Math.random() * 2 - 1) * r.height * 0.42,
            mx,
            my,
            size: sMin + Math.random() * (sMax - sMin),
            delay: Math.random() * dMax,
            dur: 560 + Math.random() * 120,
            hue,
          });
        }
      };
      make(9, 4, 7, 90, 100); // small sparks
      make(3, 9, 13, 70, 70); // hero embers
    });

    if (!ghosts.length) return;
    const id = ++poofId.current;
    setPoof({ id, kind, ghosts, motes, hubX, hubY, hue: formHue });
    setTimeout(() => setPoof((p) => (p && p.id === id ? null : p)), reduce ? 200 : 720);
  }

  /** A leaf spell was cast from the ring (no children, no window). */
  function castSpellAction(s: Spell) {
    firePoof("close");
    menu.close();
    if (s.id === "write") openNewNote(false);
    else if (s.id === "accio") accio.openAccio();
    else showToast(`✨ ${s.name} cast`);
  }
  /** Held a spell (Write = speak). */
  function longCastSpell(s: Spell) {
    if (s.longPress === "speak") {
      firePoof("close");
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

      {/* ACCIO searching sheet + the summon bar (promotes above the keyboard) */}
      <SearchSheet list={searchList} queryText={queryText} onOpen={openNote} />
      {accio.searching && !accio.filterQuery.trim() ? <DockSettings recents={recents} onRun={runRecent} /> : null}
      <SummonBar
        inputRef={accioInputRef}
        value={accio.filterQuery}
        count={scount}
        onInput={accio.handleInput}
        onKeyDown={accio.handleKeydown}
        onBlur={accio.handleInputBlur}
      />

      {/* THE SPELL MENU — radial overlay bloomed from the gold button */}
      <SpellMenu
        api={menu}
        onCast={castSpellAction}
        onLongCast={longCastSpell}
        onPoof={firePoof}
        syncState={syncStatus}
        account={ACCOUNT}
        onSyncPrimary={syncWindowPrimary}
        reduce={reduce}
      />
      {toast ? <div className="spell-toast">{toast}</div> : null}

      {/* the Poof bridge — ghost discs dissolve + motes erupt + a shockwave; survives the
          overlay unmount and self-removes. A top-level sibling (like the sync cast). */}
      {poof ? (
        <div className={`spell-poof ${poof.kind}${reduce ? " reduce" : ""}`} key={poof.id} aria-hidden="true">
          <span className="poof-wave" style={{ left: poof.hubX, top: poof.hubY, ["--wh" as string]: poof.hue }} />
          {poof.kind === "close" ? <span className="poof-echo" style={{ left: poof.hubX, top: poof.hubY }} /> : null}
          {poof.ghosts.map((g, i) => (
            <span
              key={`g${i}`}
              className="poof-ghost"
              style={{
                left: g.x,
                top: g.y,
                width: g.d,
                height: g.d,
                ["--gx" as string]: `${g.gx}px`,
                ["--gy" as string]: `${g.gy}px`,
                ["--gs" as string]: g.gs,
                ["--gd" as string]: `${g.delay}ms`,
                ["--gh" as string]: g.hue,
              }}
            />
          ))}
          {poof.motes.map((m, i) => (
            <span
              key={`m${i}`}
              className="poof-mote"
              style={{
                left: m.x,
                top: m.y,
                ["--mx" as string]: `${m.mx}px`,
                ["--my" as string]: `${m.my}px`,
                ["--ms" as string]: `${m.size}px`,
                ["--md" as string]: `${m.delay}ms`,
                ["--mt" as string]: `${m.dur}ms`,
                ["--mh" as string]: m.hue,
              }}
            />
          ))}
        </div>
      ) : null}

      {/* NOTE VIEW */}
      <NoteView
        open={noteOpen}
        noteRef={noteRef}
        surfaceRef={noteSurfaceRef}
        bodyRef={noteBodyRef}
        dateRef={noteDateRef}
        savedRef={noteSavedRef}
        voiceRef={voiceRef}
        micListening={micListening}
        onBack={() => {
          autosave.commit();
          setNoteOpen(false);
          setEditingNote(false);
          currentRef.current = null;
        }}
        onDateClick={() => noteBodyRef.current?.blur()}
        onBodyInput={onBodyInput}
        onBodyKeyDown={onBodyKeyDown}
        onBodyFocus={() => setEditingNote(true)}
        onBodyBlur={() => setEditingNote(false)}
        onFormat={applyFmt}
        onVoice={toggleDictation}
        onDone={() => noteBodyRef.current?.blur()}
      />

      <ConjureThread threadRef={threadRef} />
      <div className="home-indicator" />
    </div>
  );
}

// PhoneApp.tsx — The Wand, assembled.
//
// This is the port's coordinator — the React analogue of the prototype's one IIFE
// closure (01-the-wand-v2.html ~549-1549). It owns the mutable vault (a seed copy),
// the small set of React state that drives re-renders (reel view, search sheet, count,
// the root state classes, sync panel/spell), and the cross-cutting actions (openNote,
// openNewNote, commit, filter, cast). The heavy imperative work lives in hooks that
// write to the DOM via refs and bypass React (wheel physics, loupe fisheye, scroll
// settle, keyboard inset, caret-visible, word selection) — HARD constraints #1-#7.
//
// Reel is home; the wheel is the persistent menu; tapping a card opens the full-screen
// note; Accio summons the bar; Sync casts.

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
import { useWheelGesture, type WheelKey, initialWheelSide } from "./hooks/useWheelGesture";
import { useAccioSearch } from "./hooks/useAccioSearch";
import { useSyncState } from "./hooks/useSyncState";
import { useCaretVisible } from "./hooks/useCaretVisible";
import { useWordSelection } from "./hooks/useWordSelection";
import { useAutosave } from "./hooks/useAutosave";

import { Reel } from "./components/reel/Reel";
import { Glass } from "./components/reel/Glass";
import { Wheel } from "./components/wand/Wheel";
import { AdjustGrip } from "./components/wand/AdjustGrip";
import { DesignOverlay } from "./components/wand/DesignOverlay";
import { SummonBar } from "./components/accio/SummonBar";
import { AccioPill } from "./components/accio/AccioPill";
import { SearchSheet } from "./components/accio/SearchSheet";
import { SyncPanel } from "./components/sync/SyncPanel";
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
  const wheelRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const gripRef = useRef<HTMLDivElement>(null);
  const gripFillRef = useRef<SVGCircleElement>(null);
  const designRef = useRef<SVGSVGElement>(null);
  const designNumRef = useRef<HTMLDivElement>(null);
  const dRingRef = useRef<SVGCircleElement>(null);
  const dSpokeRef = useRef<SVGLineElement>(null);
  const dDotRef = useRef<SVGCircleElement>(null);
  const accioInputRef = useRef<HTMLInputElement>(null);
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
  const [sideLeft, setSideLeft] = useState(() => initialWheelSide() === "left");
  const [micListening, setMicListening] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [spell, setSpell] = useState({ show: false, castId: 0, label: "", labelColor: "" });

  // mirrors for use inside stable event callbacks
  const editingRef = useRef(editingNote);
  editingRef.current = editingNote;
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;
  const filterQueryRef = useRef("");
  const dictRef = useRef(false);

  // a fns ref so hooks wired BEFORE the actions exist always call the latest closure
  const fns = useRef<{
    onWheelAction: (k: WheelKey) => void;
    onWheelLongPress: (k: WheelKey) => void;
    onKbUp: () => void;
    onKbDown: () => void;
  }>({ onWheelAction: () => {}, onWheelLongPress: () => {}, onKbUp: () => {}, onKbDown: () => {} });

  // reel scroll intent, applied in the view effect once the new cards have committed
  const reelIntent = useRef<{ mode: "jump0" | "restore" | "smooth0"; to: number } | null>(null);

  // ---- hooks: the imperative subsystems ----
  const sync = useSyncState();
  const syncStatus: SyncStatus = sync.state.status;

  const fisheye = useReelFisheye(reelRef, trackRef, glassRef);

  const wheel = useWheelGesture(
    {
      rootRef,
      wheelRef,
      labelRef,
      gripRef,
      gripFillRef,
      designRef,
      designNumRef,
      dRingRef,
      dSpokeRef,
      dDotRef,
    },
    {
      onAction: (k) => fns.current.onWheelAction(k),
      onLongPress: (k) => fns.current.onWheelLongPress(k),
      onSideChange: (s) => setSideLeft(s === "left"),
    },
  );

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
    wheelRefresh: () => wheel.refresh(),
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
  function openPanel() {
    setPanelOpen(true);
    haptic(8);
  }
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
  function syncTap() {
    if (syncStatus === "offline") {
      openPanel();
      return;
    }
    castSpell();
  }

  // ---- wire the fns ref (latest closures) ----
  fns.current.onWheelAction = (k) => {
    if (k === "wand") openNewNote(false);
    else if (k === "accio") accio.openAccio();
    else if (k === "sync") syncTap();
  };
  fns.current.onWheelLongPress = (k) => {
    if (k === "wand") openNewNote(true);
    else if (k === "sync") openPanel();
  };
  fns.current.onKbUp = () => {
    accio.onKbUp();
    if (editingRef.current) keepCaretVisible();
    setKbOpen(true);
  };
  fns.current.onKbDown = () => {
    setKbOpen(false);
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

  // the pill row / scrim changes the reel height + the wheel label visibility
  useEffect(() => {
    fisheye.relayout();
    wheel.refresh();
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

  // close the sync panel on an outside press (source ~1485)
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onDown = (e: PointerEvent) => {
      if (!panelOpenRef.current) return;
      const panel = root.querySelector(".sync-panel");
      const sw = root.querySelector('.wact[data-key="sync"]');
      const target = e.target as Node;
      if (panel && !panel.contains(target) && sw && !sw.contains(target)) setPanelOpen(false);
    };
    root.addEventListener("pointerdown", onDown, true);
    return () => root.removeEventListener("pointerdown", onDown, true);
  }, []);

  // ---- render ----
  const rootClass = ["screen", "app-root"];
  if (accio.searching) rootClass.push("searching");
  if (accio.filtering) rootClass.push("filtering");
  if (kbOpen) rootClass.push("kb-open");
  if (editingNote) rootClass.push("editing-note");
  if (sideLeft) rootClass.push("side-left");

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
        <AccioPill pillRef={accioPillRef} query={accio.filterQuery.trim()} onClick={accio.handlePillClick} />
        <Reel view={view} queryText={queryText} onOpen={openNote} reelRef={reelRef} trackRef={trackRef} />
        <Glass empty={view.length === 0} message={emptyMsg} glassRef={glassRef} />
      </div>

      {/* THUMB-WHEEL + its overlays */}
      <Wheel wheelRef={wheelRef} labelRef={labelRef} syncState={syncStatus} />
      <DesignOverlay
        designRef={designRef}
        designNumRef={designNumRef}
        dRingRef={dRingRef}
        dSpokeRef={dSpokeRef}
        dDotRef={dDotRef}
      />
      <AdjustGrip gripRef={gripRef} gripFillRef={gripFillRef} />

      {/* SYNC */}
      <SyncPanel
        status={syncStatus}
        open={panelOpen}
        account={ACCOUNT}
        onPrimary={() => {
          if (syncStatus === "offline" || syncStatus === "syncing") return;
          setPanelOpen(false);
          castSpell();
        }}
        onSignout={() => setPanelOpen(false)}
      />
      <SyncSpell show={spell.show} castId={spell.castId} label={spell.label} labelColor={spell.labelColor} />

      {/* ACCIO searching sheet + the summon bar */}
      <SearchSheet list={searchList} queryText={queryText} onOpen={openNote} />
      <SummonBar
        inputRef={accioInputRef}
        value={accio.filterQuery}
        count={scount}
        onInput={accio.handleInput}
        onKeyDown={accio.handleKeydown}
        onBlur={accio.handleInputBlur}
      />

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

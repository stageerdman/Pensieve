// useAccioSearch.ts — Accio: the ONE search affordance (summon bar filters the home
// reel in place; no separate results surface).
//
// Ported from 01-the-wand-v2.html ~1346-1444 + the keyboard-close guard at ~561-584.
// Locked behaviour (wiki "Home is search", "gravity flips to the keyboard"):
//   · tap Accio → the bar rises with the keyboard, caret ready (the SHEET updates;
//     the reel keeps its position behind the scrim)
//   · typing → applyFilter: the reel view + sheet both narrow, reel scrolls to top
//   · keyboard drops WITH a query → bar collapses to a top PILL; reel stays filtered
//   · empty dismiss / pill tap → everything summoned back (reel returns to preSearchTop)
// Reopen reliability (the "pops up then drops" bug): focus is synchronous in the tap
// gesture (openAccio), onKeyboardClosed is disarmed until the keyboard is confirmed up
// this session (searchArmed) AND ignores any close within ~400ms of opening
// (searchOpenedAt jitter window).

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { haptic, prefersReducedMotion } from "../util";

export interface AccioConfig {
  accioInputRef: React.RefObject<HTMLInputElement>;
  accioPillRef: React.RefObject<HTMLElement>;
  reelRef: React.RefObject<HTMLElement>;
  /** Leave the note (commit + close) — Accio always summons from home. */
  onExitNote: () => void;
  /** applyFilter: a typed query narrows BOTH the reel view and the sheet; reel → top. */
  onFilter: (query: string) => void;
  /** renderSearch: update only the pour-up sheet for `query` (reel untouched). */
  onSheet: (query: string) => void;
  /** Clear to everything and return the reel to `restoreTop`. */
  onClear: (restoreTop: number) => void;
  /** Re-measure the reel + loupe (the pill row changes the reel's height). */
  relayout: () => void;
  /** Nudge the wheel to re-evaluate its label opacity immediately. */
  wheelRefresh: () => void;
}

export interface AccioApi {
  filterQuery: string;
  searching: boolean;
  filtering: boolean;
  openAccio: () => void;
  clearSearch: () => void;
  /** Drop the bar but keep the query/pill (used when opening a note). */
  hideBar: () => void;
  handleInput: (value: string) => void;
  handleKeydown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleInputBlur: () => void;
  handlePillClick: () => void;
  /** Wire to useKeyboardInset.onDown. */
  handleKeyboardClosed: () => void;
  /** Wire to useKeyboardInset.onUp (arms the close detector). */
  onKbUp: () => void;
}

export function useAccioSearch(cfg: AccioConfig): AccioApi {
  const [filterQuery, setFilterQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const queryRef = useRef("");
  const searchingRef = useRef(false);
  const searchArmed = useRef(false);
  const searchOpenedAt = useRef(0);
  const accioVoice = useRef(false); // voice search dropped; kept for the guard parity
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preSearchTop = useRef(0);

  const setQuery = (q: string) => {
    queryRef.current = q;
    setFilterQuery(q);
  };
  const setSearch = (on: boolean) => {
    searchingRef.current = on;
    setSearching(on);
  };
  const filtering = !!filterQuery.trim();

  function openAccio() {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    if (!queryRef.current.trim()) preSearchTop.current = cfgRef.current.reelRef.current?.scrollTop ?? 0;
    cfgRef.current.onExitNote(); // always summon from home, never over a note
    searchArmed.current = false;
    searchOpenedAt.current = Date.now();
    // Mount the summon bar SYNCHRONOUSLY so its input exists for the focus() below —
    // iOS only raises the keyboard when focus lands inside the tap gesture, and the bar
    // is conditionally rendered on `searching`, so it isn't in the DOM until now.
    flushSync(() => setSearch(true));
    cfgRef.current.wheelRefresh();
    cfgRef.current.onSheet(queryRef.current);
    haptic(8);
    console.log("[accio] open");
    const input = cfgRef.current.accioInputRef.current;
    if (input) {
      // preventScroll: focusing the (briefly off-screen) bar must NEVER scroll the
      // overflow:hidden shell — that scroll was the "whole screen shifts up and never
      // returns" bug (it reproduced on desktop, where there's no keyboard at all).
      input.focus({ preventScroll: true }); // in the tap gesture → iOS raises the keyboard once
      try {
        const L = input.value.length;
        input.setSelectionRange(L, L);
      } catch {
        /* no-op */
      }
    }
  }

  function hideBar() {
    setSearch(false);
    cfgRef.current.accioInputRef.current?.blur();
    cfgRef.current.wheelRefresh();
    cfgRef.current.relayout(); // the pill may now occupy a row → re-measure reel + lens
  }

  function clearSearch() {
    setQuery("");
    const input = cfgRef.current.accioInputRef.current;
    if (input) input.value = "";
    hideBar();
    cfgRef.current.onClear(preSearchTop.current); // everything back + return to where we were
  }

  function settleSearch() {
    console.log("[accio] close", queryRef.current.trim() ? "keep query → pill" : "clear");
    if (queryRef.current.trim()) hideBar();
    else clearSearch();
  }

  function handleInput(value: string) {
    setQuery(value);
    cfgRef.current.onFilter(value);
  }

  function handleKeydown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault(); // blue "Search" key → drop kb + hold results
      if (queryRef.current.trim()) settleSearch();
      else clearSearch();
    } else if (e.key === "Escape") {
      clearSearch();
    }
  }

  // desktop / no-visualViewport fallback (the .kb-open path is primary on device)
  function handleInputBlur() {
    blurTimer.current = setTimeout(() => {
      blurTimer.current = null;
      if (accioVoice.current) return;
      if (document.activeElement === cfgRef.current.accioInputRef.current) return;
      if (searchingRef.current) settleSearch();
    }, 90);
  }

  function handlePillClick() {
    haptic(8);
    if (prefersReducedMotion()) {
      clearSearch();
      return;
    }
    const pill = cfgRef.current.accioPillRef.current;
    if (pill) {
      pill.classList.add("pop");
      setTimeout(() => {
        pill.classList.remove("pop");
        clearSearch();
      }, 180);
    } else {
      clearSearch();
    }
  }

  function handleKeyboardClosed() {
    if (accioVoice.current) return;
    if (!searchArmed.current) return;
    if (Date.now() - searchOpenedAt.current < 400) return;
    if (searchingRef.current) settleSearch();
  }

  function onKbUp() {
    searchArmed.current = true;
  }

  return {
    filterQuery,
    searching,
    filtering,
    openAccio,
    clearSearch,
    hideBar,
    handleInput,
    handleKeydown,
    handleInputBlur,
    handlePillClick,
    handleKeyboardClosed,
    onKbUp,
  };
}

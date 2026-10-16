// useSpellMenu.ts — the radial Spell Menu's state controller.
//
// Holds: open/closed, the root form (General ↔ Conditional), a detailed-descent stack,
// the scroll position of the current ring, and whether a spell window is open above it.
// Pure geometry lives in lib/spells/ringLayout; the roster in lib/spells/registry.
//
// Nav model (max 2 levels: form → detailed):
//   · General root  — center shows "Suggested" toggle if the page has recommendations.
//   · Conditional root — center shows "General" toggle (one tap home).
//   · Detailed       — center shows "Back" (pop one level). Hue inherits the root.

import { useCallback, useMemo, useState } from "react";
import type { PageContext, Spell, SpellMenuForm } from "../lib/spells/types";
import { GENERAL_SPELLS, conditionalSpells, hasConditional } from "../lib/spells/registry";
import { snapScroll } from "../lib/spells/ringLayout";

export type MenuHue = "gold" | "accent";
export type CenterKind = "none" | "back" | "to-general" | "to-suggested";

export interface SpellMenuState {
  open: boolean;
  /** the spells on the ring right now (root roster or a detailed child set). */
  spells: Spell[];
  form: SpellMenuForm; // the ROOT form (detailed inherits it)
  hue: MenuHue;
  detailDepth: number;
  center: CenterKind;
  scrollPos: number;
  windowSpellId: string | null;
}

export interface SpellMenuApi extends SpellMenuState {
  openMenu: () => void;
  close: () => void;
  enterDetailed: (spell: Spell) => void;
  back: () => void;
  toGeneral: () => void;
  toSuggested: () => void;
  setScroll: (p: number) => void;
  openWindow: (spellId: string) => void;
  closeWindow: () => void;
}

/** The form the menu opens in: a note or an open collection opens in Conditional; home in General. */
function entryForm(context: PageContext): SpellMenuForm {
  return context !== "home" && hasConditional(context) ? "conditional" : "general";
}

export function useSpellMenu(context: PageContext): SpellMenuApi {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SpellMenuForm>("general");
  const [detailStack, setDetailStack] = useState<Spell[]>([]);
  const [scrollPos, setScrollPos] = useState(0);
  const [windowSpellId, setWindowSpellId] = useState<string | null>(null);

  const rootSpells = form === "conditional" ? conditionalSpells(context) : GENERAL_SPELLS;
  const spells = detailStack.length ? detailStack[detailStack.length - 1].children ?? [] : rootSpells;
  const hue: MenuHue = form === "conditional" ? "accent" : "gold";

  const center: CenterKind = useMemo(() => {
    if (detailStack.length) return "back";
    if (form === "conditional") return "to-general";
    return hasConditional(context) ? "to-suggested" : "none";
  }, [detailStack.length, form, context]);

  const openMenu = useCallback(() => {
    setForm(entryForm(context));
    setDetailStack([]);
    setScrollPos(0);
    setWindowSpellId(null);
    setOpen(true);
  }, [context]);

  const close = useCallback(() => {
    setOpen(false);
    setWindowSpellId(null);
  }, []);

  const enterDetailed = useCallback((spell: Spell) => {
    if (!spell.children?.length) return;
    setDetailStack((s) => [...s, spell]);
    setScrollPos(0);
  }, []);

  const back = useCallback(() => {
    setDetailStack((s) => s.slice(0, -1));
    setScrollPos(0);
  }, []);

  const toGeneral = useCallback(() => {
    setForm("general");
    setDetailStack([]);
    setScrollPos(0);
  }, []);

  const toSuggested = useCallback(() => {
    setForm("conditional");
    setDetailStack([]);
    setScrollPos(0);
  }, []);

  const setScroll = useCallback((p: number) => setScrollPos(snapScroll(spells.length, p)), [spells.length]);

  const openWindow = useCallback((spellId: string) => setWindowSpellId(spellId), []);
  const closeWindow = useCallback(() => setWindowSpellId(null), []);

  return {
    open,
    spells,
    form,
    hue,
    detailDepth: detailStack.length,
    center,
    scrollPos,
    windowSpellId,
    openMenu,
    close,
    enterDetailed,
    back,
    toGeneral,
    toSuggested,
    setScroll,
    openWindow,
    closeWindow,
  };
}

// patronusSpellDom.ts — the Patronus NOTE SPELL block inside the uncontrolled note body.
//
// A conditional spell: the trigger ("When synced · Patronus casts") first, then the
// incantation, then one quiet status line and at most one action. Built imperatively like
// every other block (see mediaDom.ts): `contentEditable=false`, its fence body rides
// `data-media`, and any change rewrites that payload and calls ctx.onChange() so autosave
// serializes it. The words live in a real <textarea> so the iOS keyboard, its dictation mic,
// autocorrect and VoiceOver all work natively. Spec: updates/2026-11-22 PATRONUS-BLOCK -
// OPEN/phone-block-spec.md.

import { encodePatronus, parsePatronus, type PatronusBlock } from "../../../../src/lib/packages/patronus";
import { editSpell, retrySpell, requestUndo, spellView } from "../../lib/patronus/noteSpell";
import { haptic } from "../../util";
import { log } from "../../lib/logger";
import { wireMediaTap } from "./tapDom";

export interface SpellCtx {
  onChange: () => void;
}

const PLACEHOLDER = "Tell Patronus what to do. Write or dictate.";

/** Stop a gesture inside the block from reaching the note editor's own handlers (title
 *  Enter, double-tap word selection, block drag) — editing the rest stays unchanged. */
function isolate(el: HTMLElement) {
  for (const type of ["keydown", "pointerdown", "pointerup", "dblclick"]) el.addEventListener(type, (e) => e.stopPropagation());
}

/** Grow the field to its content — the block never scrolls inside itself. */
function fit(area: HTMLTextAreaElement) {
  area.style.height = "auto";
  if (area.scrollHeight) area.style.height = `${area.scrollHeight}px`;
}

function writeBody(el: HTMLElement, p: PatronusBlock) {
  el.dataset.media = JSON.stringify({ kind: "patronus", body: encodePatronus(p) });
}

function readSpell(el: HTMLElement): PatronusBlock {
  try {
    return parsePatronus((JSON.parse(el.dataset.media ?? "{}") as { body?: string }).body ?? "");
  } catch {
    return parsePatronus("");
  }
}

/** Build the block for a note spell body (one with a `state:` line). */
export function buildNoteSpellEl(body: string, ctx: SpellCtx): HTMLElement {
  const el = document.createElement("div");
  el.className = "ph-media ph-patronus ph-spell";
  el.contentEditable = "false";
  el.setAttribute("role", "group");
  writeBody(el, parsePatronus(body));
  render(el, ctx);
  return el;
}

/** (Re)draw the block from its payload. Called once on build and after each transition. */
function render(el: HTMLElement, ctx: SpellCtx) {
  const p = readSpell(el);
  const v = spellView(p);
  el.innerHTML = "";
  el.dataset.state = v.state;
  el.setAttribute("aria-label", `Patronus spell, ${v.status}`);

  const head = document.createElement("div");
  head.className = "ph-patronus-head";
  const orb = document.createElement("span");
  orb.className = "ph-patronus-orb";
  orb.setAttribute("aria-hidden", "true");
  const trigger = document.createElement("span");
  trigger.className = "ph-spell-trigger";
  trigger.textContent = "When synced · Patronus casts";
  head.append(orb, trigger);

  const words = document.createElement("div");
  words.className = "ph-spell-words";
  if (v.editable) {
    const area = document.createElement("textarea");
    area.className = "ph-spell-input";
    area.rows = 1;
    area.value = v.instruction;
    area.placeholder = PLACEHOLDER;
    area.setAttribute("aria-label", "Spell for Patronus");
    area.setAttribute("enterkeyhint", "done");
    isolate(area);
    area.addEventListener("input", () => {
      const cur = readSpell(el);
      const next = editSpell(cur, area.value);
      writeBody(el, next);
      fit(area);
      // A fizzled spell re-arms as the owner fixes its words: repaint the status and drop
      // Try again in place, so the field (and the keyboard) stay as they are.
      if (next.headers?.state !== cur.headers?.state) {
        log.info("patronus-note", "retry.on-edit", { from: cur.headers?.state, to: next.headers?.state });
        repaint(el);
      }
      ctx.onChange();
    });
    words.appendChild(area);
    requestAnimationFrame(() => fit(area));
  } else {
    words.textContent = v.instruction;
  }

  const status = document.createElement("div");
  status.className = "ph-spell-status";
  status.setAttribute("aria-live", "polite");
  status.textContent = v.status;

  el.append(head, words, status);

  // What the computer did, then (if it refused an undo) why — shown as they come.
  for (const [cls, text] of [["ph-spell-did", v.did], ["ph-spell-note", v.undoNote]] as const) {
    if (!text) continue;
    const p = document.createElement("p");
    p.className = cls;
    p.textContent = text;
    el.appendChild(p);
  }

  if (v.action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ph-spell-action";
    btn.textContent = v.action === "undo" ? "Undo" : "Try again";
    isolate(btn);
    wireMediaTap(btn, () => {
      const cur = readSpell(el);
      const next = v.action === "undo" ? requestUndo(cur) : retrySpell(cur);
      log.info("patronus-note", v.action === "undo" ? "undo.requested" : "retry.requested", { from: cur.headers?.state, to: next.headers?.state });
      haptic(10);
      writeBody(el, next);
      render(el, ctx);
      ctx.onChange();
    });
    el.appendChild(btn);
  }
}

/** Update everything but the words to the payload's state (used while the field is live). */
function repaint(el: HTMLElement) {
  const v = spellView(readSpell(el));
  el.dataset.state = v.state;
  el.setAttribute("aria-label", `Patronus spell, ${v.status}`);
  const status = el.querySelector(".ph-spell-status");
  if (status) status.textContent = v.status;
  if (!v.action) el.querySelector(".ph-spell-action")?.remove();
}

/** Insert a fresh, armed spell at the caret's block (or at the end) and put the keyboard in
 *  its field. Returns the block. */
export function insertNoteSpell(noteBody: HTMLElement, body: string, ctx: SpellCtx): HTMLElement {
  let anchor: HTMLElement | null = null;
  const sel = window.getSelection();
  let n: Node | null = sel && sel.rangeCount ? sel.anchorNode : null;
  if (n && noteBody.contains(n)) {
    if (n.nodeType === 3) n = n.parentNode;
    while (n && n.parentNode !== noteBody) n = n.parentNode;
    if (n && n.parentNode === noteBody) anchor = n as HTMLElement;
  }
  const el = buildNoteSpellEl(body, ctx);
  if (anchor) anchor.after(el);
  else noteBody.appendChild(el);
  // keep a writable line under it, like every other block
  const after = el.nextElementSibling as HTMLElement | null;
  if (!after || after.classList.contains("ph-media")) {
    const div = document.createElement("div");
    div.innerHTML = "<br>";
    el.after(div);
  }
  ctx.onChange();
  el.querySelector<HTMLTextAreaElement>(".ph-spell-input")?.focus();
  log.info("patronus-note", "spell.added", {});
  return el;
}

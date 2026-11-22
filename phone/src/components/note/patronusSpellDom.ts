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
import { retrySpell, requestUndo, spellView, withInstruction } from "../../lib/patronus/noteSpell";
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
      writeBody(el, withInstruction(readSpell(el), area.value));
      fit(area);
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

  const notes = [...v.did, ...v.removed.map((ref) => `Moved to Trash: ${mediaName(ref)}`), ...(v.undoNote ? [v.undoNote] : [])];
  if (notes.length) {
    const list = document.createElement("ul");
    list.className = "ph-spell-did";
    for (const n of notes) {
      const li = document.createElement("li");
      li.textContent = n;
      list.appendChild(li);
    }
    el.appendChild(list);
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
      log.info("patronus-note", v.action === "undo" ? "undo.requested" : "retry.requested", { from: cur.state, to: next.state });
      haptic(10);
      writeBody(el, next);
      render(el, ctx);
      ctx.onChange();
    });
    el.appendChild(btn);
  }
}

/** A friendly name for a removed media ref: "Recording", "Photo", "Video", or the file. */
export function mediaName(ref: string): string {
  if (/\.(m4a|mp3|wav|aac|ogg|webm|caf)$/i.test(ref)) return "Recording";
  if (/\.(jpe?g|png|heic|gif|webp)$/i.test(ref)) return "Photo";
  if (/\.(mp4|mov|m4v)$/i.test(ref)) return "Video";
  return ref.split("/").pop() ?? ref;
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

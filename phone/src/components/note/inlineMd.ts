// inlineMd.ts — inline markdown ↔ the phone's contentEditable DOM: **bold** and *italic*.
//
// The phone used to drop a text line in as escaped plain text, so a desktop memory's bold
// questions showed as literal "**…**" (owner report 2026-11-13) — and the toolbar's B
// button made a <b> that was lost on save (serialization read textContent). Both
// directions live here so they can't drift: render → <strong>/<em>, serialize → ** / *.

import { esc } from "../../util";

const BOLD = /\*\*(?=\S)([\s\S]*?\S)\*\*/g;
// A single-star run that isn't a bullet ("* item" never reaches here — lists are parsed
// before text) and isn't part of a ** pair.
const ITALIC = /(^|[^*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/g;

/** One markdown text line → safe HTML with bold/italic as real formatting. */
export function inlineToHtml(text: string): string {
  return esc(text).replace(BOLD, "<strong>$1</strong>").replace(ITALIC, "$1<em>$2</em>");
}

/** Put a line's formatted text into an element (as child nodes). */
export function appendInline(el: HTMLElement, text: string): void {
  const tpl = document.createElement("template");
  tpl.innerHTML = inlineToHtml(text);
  el.appendChild(tpl.content);
}

/** An element's text back to inline markdown: <b>/<strong> → **…**, <i>/<em> → *…*.
 *  `skip` drops children that aren't text (a nested list, a checklist glyph). */
export function inlineFromEl(node: Node, skip?: (el: HTMLElement) => boolean): string {
  let out = "";
  node.childNodes.forEach((c) => {
    if (c.nodeType === 3) {
      out += c.textContent ?? "";
      return;
    }
    if (c.nodeType !== 1) return;
    const el = c as HTMLElement;
    if (skip?.(el)) return;
    const inner = inlineFromEl(el, skip);
    const tag = el.tagName;
    const wrap = (m: string) => {
      // Keep surrounding spaces OUTSIDE the markers ("**a **" isn't bold in markdown).
      const lead = inner.match(/^\s*/)![0];
      const trail = inner.match(/\s*$/)![0];
      const core = inner.trim();
      return core ? `${lead}${m}${core}${m}${trail}` : inner;
    };
    if (tag === "B" || tag === "STRONG") out += wrap("**");
    else if (tag === "I" || tag === "EM") out += wrap("*");
    else out += inner;
  });
  return out;
}

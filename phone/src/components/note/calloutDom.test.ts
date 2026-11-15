// Callouts + columns on the phone: parsed as their own blocks (not raw fence text), shown as
// a read-only box / stacked columns, and written back BYTE-IDENTICAL — same format as the
// desktop's lib/md/callout + columns (the desktop editor's own canonical output).
import { describe, expect, it, vi } from "vitest";
import { insertImages, renderNoteBody, serializeNoteBody } from "./mediaDom";
import { parseNoteContent, serializeBlocks, stripMediaForPreview } from "../../lib/media/noteMedia";

const ZW = "​";
const CALLOUT = "```pensieve:callout\nicon=🚨\nTo learn, and to **build**.\n\n* one\n* two\n\n" + ZW + "\n\nSee {@n42|Other note}\n```";
const PLAIN_CALLOUT = "```pensieve:callout\n" + ZW + "\n\nOnly children here\n```";
const COLUMNS = "```pensieve:columns\nLeft **side**\n:::column:::\n![](media/n1/x.png)\n:::column:::\n* right a\n* right b\n```";
const BODY = `**What purpose fulfils me today?**\n\n${CALLOUT}\n\n${PLAIN_CALLOUT}\n\n${COLUMNS}\n\nAfter.`;

function open(body = BODY) {
  const el = document.createElement("div");
  el.className = "note-body";
  document.body.appendChild(el);
  const ctx = { onChange: vi.fn() };
  renderNoteBody(el, "Daily", body, ctx);
  return { el, ctx };
}

describe("phone parser: callout + columns", () => {
  it("parses each fence as one block, inner lines verbatim", () => {
    const kinds = parseNoteContent(BODY).map((b) => b.kind);
    expect(kinds.filter((k) => k === "callout")).toHaveLength(2);
    expect(kinds.filter((k) => k === "columns")).toHaveLength(1);
    const c = parseNoteContent(CALLOUT)[0];
    expect(c).toEqual({ kind: "callout", lines: CALLOUT.split("\n").slice(1, -1) });
  });

  it("serializeBlocks(parseNoteContent(x)) === x", () => {
    expect(serializeBlocks(parseNoteContent(BODY))).toBe(BODY);
    const empty = "```pensieve:callout\n```";
    expect(serializeBlocks(parseNoteContent(empty))).toBe(empty);
  });

  it("the reel preview shows the callout/column text, never the fence", () => {
    const p = stripMediaForPreview(BODY);
    expect(p).toContain("To learn, and to **build**.");
    expect(p).toContain("Left **side**");
    expect(p).toContain("📷 Photo");
    for (const junk of ["```", "icon=", ":::column:::"]) expect(p).not.toContain(junk);
  });
});

describe("phone memory page: callout + columns", () => {
  it("renders a callout box with its emoji and body (lists, text) — read-only", () => {
    const { el } = open();
    const boxes = el.querySelectorAll<HTMLElement>(".ph-callout");
    expect(boxes).toHaveLength(2);
    expect(boxes[0].contentEditable).toBe("false");
    expect(boxes[0].querySelector(".ph-callout-icon")?.textContent).toBe("🚨");
    expect(boxes[0].querySelector("strong")?.textContent).toBe("build");
    expect(boxes[0].querySelectorAll("li")).toHaveLength(2);
    expect(boxes[1].querySelector(".ph-callout-icon")).toBeNull();
    expect(el.textContent).not.toContain("pensieve:callout");
  });

  it("renders columns stacked, images included", () => {
    const { el } = open();
    const cols = el.querySelectorAll(".ph-columns .ph-column");
    expect(cols).toHaveLength(3);
    expect(cols[1].querySelector("img.ph-prose-img")).not.toBeNull();
    expect(cols[2].querySelectorAll("li")).toHaveLength(2);
  });

  it("an untouched note serializes back byte-for-byte", () => {
    const { el } = open();
    expect(serializeNoteBody(el)).toEqual({ title: "Daily", content: BODY });
  });

  it("photos picked next to a callout never merge into (and overwrite) it", () => {
    const { el, ctx } = open(`Intro\n\n${CALLOUT}\n\n`);
    const box = el.querySelector<HTMLElement>(".ph-callout")!;
    const blank = box.nextElementSibling as HTMLElement; // the blank line after the callout
    const range = document.createRange();
    range.selectNodeContents(blank);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    insertImages(el, [{ ref: "media/n1/new.png" }], ctx);
    expect(serializeNoteBody(el).content).toContain(CALLOUT);
    expect(serializeNoteBody(el).content).toContain("![](media/n1/new.png)");
  });
});

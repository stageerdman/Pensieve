import { describe, expect, it } from "vitest";
import { inlineFromEl, inlineToHtml } from "./inlineMd";

const el = (html: string) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d;
};

describe("inlineMd — the phone shows and keeps **bold** / *italic*", () => {
  it("renders a desktop memory's bold question as real bold (was literal **…**)", () => {
    expect(inlineToHtml("**Was I a king?**")).toBe("<strong>Was I a king?</strong>");
    expect(inlineToHtml("**What effort can I reward today? 🏆**")).toContain("<strong>");
  });

  it("renders italic, escapes html, leaves lone stars alone", () => {
    expect(inlineToHtml("a *b* c")).toBe("a <em>b</em> c");
    expect(inlineToHtml("<x> & 2 * 3 = 6")).toBe("&lt;x&gt; &amp; 2 * 3 = 6");
  });

  it("round-trips: render → serialize gives the same markdown", () => {
    for (const md of ["**Q:** answer", "plain", "mix **bold** and *it*", "2 * 3"]) {
      expect(inlineFromEl(el(inlineToHtml(md)))).toBe(md);
    }
  });

  it("serializes the toolbar's <b> (was lost on save) with spaces outside the markers", () => {
    expect(inlineFromEl(el("say <b>hi </b>there"))).toBe("say **hi** there");
    expect(inlineFromEl(el("<i>soft</i>"))).toBe("*soft*");
  });
});

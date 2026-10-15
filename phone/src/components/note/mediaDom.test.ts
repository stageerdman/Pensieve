// mediaDom.test.ts — the phone body DOM <-> markdown contract. Proves a body built from
// markdown serializes back to the SAME markdown (media blocks included), and that the picker
// insert produces a single image for one file and a gallery for several. (The carousel /
// lightbox / long-press interactions are device-verified — jsdom has no layout.)

import "../../test/phoneSetup";
import { describe, expect, it } from "vitest";
import { insertImages, renderNoteBody, serializeNoteBody } from "./mediaDom";
import { galleryMd, mediaAlt } from "../../lib/media/noteMedia";

const ctx = { onChange: () => {} };

function body(): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

describe("mediaDom — render <-> serialize", () => {
  it("round-trips a mixed body (title + prose + image + gallery)", () => {
    const content = ["some prose", "![a view](media/9/a.png)", galleryMd([{ ref: "media/9/b.png", caption: "two" }, { ref: "media/9/c.png" }]), "closing"].join("\n");
    const el = body();
    renderNoteBody(el, "My title", content, ctx);

    // structure: H1 + a div + an image block + a gallery block + a div
    expect(el.firstElementChild?.tagName).toBe("H1");
    expect(el.querySelectorAll(".ph-media.ph-image").length).toBe(1);
    expect(el.querySelectorAll(".ph-media.ph-gallery").length).toBe(1);

    const out = serializeNoteBody(el);
    expect(out.title).toBe("My title");
    expect(out.content).toBe(content);
  });

  it("a11y: a content image gets a non-empty alt; a gallery renders a labelled cover button", () => {
    const content = ["![a view](media/9/a.png)", galleryMd([{ ref: "media/9/b.png", caption: "two" }, { ref: "media/9/c.png" }])].join("\n");
    const el = body();
    renderNoteBody(el, "T", content, ctx);
    // The single (content) image keeps a real alt.
    const single = el.querySelector(".ph-media.ph-image img");
    expect(single?.getAttribute("alt")).toBe("a view");
    // The gallery is a composite COVER: a button labelled for the whole board; its cover-cell
    // images are decorative (alt="") — the captioned photos live in the collection view.
    const cover = el.querySelector(".ph-gallery .ph-cover");
    expect(cover?.getAttribute("aria-label")).toMatch(/collection \(2 photos\)/);
    expect(cover?.querySelectorAll("img").length).toBe(2);
  });

  it("mediaAlt matches the desktop helper (caption, else a plain 'Image')", () => {
    expect(mediaAlt("a caption")).toBe("a caption");
    expect(mediaAlt("  ")).toBe("Image");
    expect(mediaAlt(undefined)).toBe("Image");
  });
});

describe("mediaDom — insert", () => {
  it("one file → a single image block (plain markdown)", () => {
    const el = body();
    renderNoteBody(el, "", "", ctx);
    insertImages(el, [{ ref: "media/1/x.png" }], ctx);
    expect(el.querySelectorAll(".ph-image").length).toBe(1);
    expect(el.querySelectorAll(".ph-gallery").length).toBe(0);
    expect(serializeNoteBody(el).content).toContain("![](media/1/x.png)");
  });

  it("several files → one gallery block (pensieve:gallery fence)", () => {
    const el = body();
    renderNoteBody(el, "", "", ctx);
    insertImages(el, [{ ref: "media/1/x.png" }, { ref: "media/1/y.png" }], ctx);
    expect(el.querySelectorAll(".ph-gallery").length).toBe(1);
    const content = serializeNoteBody(el).content;
    expect(content).toContain("```pensieve:gallery");
    expect(content).toContain("media/1/x.png");
    expect(content).toContain("media/1/y.png");
  });

  it("merging into an existing image promotes it to a gallery", () => {
    const el = body();
    renderNoteBody(el, "", "![](media/1/x.png)", ctx);
    // place the caret inside the image block so it becomes the merge anchor
    const img = el.querySelector<HTMLElement>(".ph-media")!;
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(img);
    sel?.removeAllRanges();
    sel?.addRange(r);
    insertImages(el, [{ ref: "media/1/y.png" }], ctx);
    expect(el.querySelectorAll(".ph-gallery").length).toBe(1);
    expect(el.querySelectorAll(".ph-image").length).toBe(0);
  });
});

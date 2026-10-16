// mediaDom.test.ts — the phone body DOM <-> markdown contract. Proves a body built from
// markdown serializes back to the SAME markdown (media blocks included), and that the picker
// insert produces a single image for one file and a gallery for several. (The carousel /
// lightbox / long-press interactions are device-verified — jsdom has no layout.)

import "../../test/phoneSetup";
import { describe, expect, it } from "vitest";
import { commitMove, insertImages, renderNoteBody, serializeNoteBody } from "./mediaDom";
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

describe("mediaDom — tap must not raise the keyboard", () => {
  // The keyboard pops because a tap on media focuses the surrounding contentEditable. The lever
  // that stops it on iOS is preventDefault() on the touchend of a genuine tap; a scroll (finger
  // moved) must be left alone so the page still scrolls when the drag starts on a photo.
  const touch = (type: string, x: number, y: number, cancelable = false) => {
    const ev = new Event(type, { bubbles: true, cancelable });
    (ev as unknown as { touches: Array<{ clientX: number; clientY: number }> }).touches = [{ clientX: x, clientY: y }];
    return ev;
  };

  function imageBlock(): HTMLElement {
    const el = body();
    renderNoteBody(el, "", "![](media/1/x.png)", ctx);
    return el.querySelector<HTMLElement>(".ph-media.ph-image")!;
  }

  it("a still tap preventDefaults touchend (so iOS won't focus the editable)", () => {
    const media = imageBlock();
    media.dispatchEvent(touch("touchstart", 20, 20));
    const end = touch("touchend", 21, 21, true);
    media.dispatchEvent(end);
    expect(end.defaultPrevented).toBe(true);
  });

  it("a scroll (finger moved past the slop) leaves touchend alone", () => {
    const media = imageBlock();
    media.dispatchEvent(touch("touchstart", 20, 20));
    media.dispatchEvent(touch("touchmove", 20, 80)); // 60px → a scroll, not a tap
    const end = touch("touchend", 20, 80, true);
    media.dispatchEvent(end);
    expect(end.defaultPrevented).toBe(false);
  });
});

describe("mediaDom — block drag (reorder + merge commit)", () => {
  // The gesture (ghost/hit-test/scroll) is device-verified; the COMMIT (DOM move / mergeInto)
  // is pure and locked here. A note body of: H1, prose, image A, gallery G.
  function built() {
    const el = body();
    const content = ["prose", "![](media/1/a.png)", galleryMd([{ ref: "media/1/g1.png" }, { ref: "media/1/g2.png" }])].join("\n");
    renderNoteBody(el, "T", content, ctx);
    const image = el.querySelector<HTMLElement>(".ph-media.ph-image")!;
    const gallery = el.querySelector<HTMLElement>(".ph-media.ph-gallery")!;
    return { el, image, gallery };
  }
  const kinds = (el: HTMLElement) =>
    Array.from(el.children).map((c) =>
      c.tagName === "H1" ? "h1" : c.classList.contains("ph-image") ? "img" : c.classList.contains("ph-gallery") ? "gal" : "text",
    );

  it("reorder 'after' moves the image below the gallery", () => {
    const { el, image, gallery } = built();
    expect(kinds(el)).toEqual(["h1", "text", "img", "gal", "text"]); // trailing text row after media
    commitMove(image, gallery, "after", ctx, el);
    expect(kinds(el)).toEqual(["h1", "text", "gal", "img", "text"]);
  });

  it("reorder 'before' moves the gallery above the image", () => {
    const { el, image, gallery } = built();
    commitMove(gallery, image, "before", ctx, el);
    expect(kinds(el)).toEqual(["h1", "text", "gal", "img", "text"]);
  });

  it("merge folds a dragged image INTO the gallery and removes the image block", () => {
    const { el, image, gallery } = built();
    commitMove(image, gallery, "merge", ctx, el);
    expect(el.querySelectorAll(".ph-image").length).toBe(0); // the image block is gone
    const galleries = el.querySelectorAll(".ph-gallery");
    expect(galleries.length).toBe(1);
    // gallery now carries 3 photos (g1, g2 + the merged one)
    expect(serializeNoteBody(el).content).toContain("media/1/a.png");
  });

  it("merge of image onto image promotes them to a new gallery", () => {
    const el = body();
    renderNoteBody(el, "T", ["![](media/1/a.png)", "![](media/1/b.png)"].join("\n"), ctx);
    const [a, b] = Array.from(el.querySelectorAll<HTMLElement>(".ph-media.ph-image"));
    commitMove(a, b, "merge", ctx, el);
    expect(el.querySelectorAll(".ph-image").length).toBe(0);
    expect(el.querySelectorAll(".ph-gallery").length).toBe(1);
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

  it("newBlock forces a SEPARATE gallery instead of merging into an adjacent image", () => {
    const el = body();
    renderNoteBody(el, "", "![](media/1/x.png)", ctx);
    // caret inside the existing image block — normally this would merge into it...
    const img = el.querySelector<HTMLElement>(".ph-media")!;
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(img);
    sel?.removeAllRanges();
    sel?.addRange(r);
    // ...but the "Gallery" spell forces a new block: the old single image survives untouched.
    insertImages(el, [{ ref: "media/1/y.png" }, { ref: "media/1/z.png" }], ctx, { newBlock: true });
    expect(el.querySelectorAll(".ph-image").length).toBe(1); // the original single image is intact
    expect(el.querySelectorAll(".ph-gallery").length).toBe(1); // a brand-new, separate gallery
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

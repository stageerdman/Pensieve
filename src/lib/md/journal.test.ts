import { describe, it, expect, beforeEach } from "vitest";
import {
  parseJournalPages,
  stringifyJournalPages,
  encodeJournalBlock,
  reconstructJournalFence,
  isJournalBlock,
  JOURNAL_FENCE,
  type JournalPage,
} from "./journal";
import { registerMediaUrl, _resetMediaUrlRegistry } from "../media/url";

// The pure `pensieve:journal` bridge: an ordered run of photographed pages round-trips
// through one fence (one `ref | caption` line per page, caption optional), order == line
// order, and a loadable url rewrites back to its vault ref on save (refForUrl). Mirrors
// gallery.test.ts's shape (the sibling fence this one is deliberately kept parallel to).

beforeEach(() => _resetMediaUrlRegistry());

const A = "media/n1/a.png";
const B = "media/n1/b.png";
const C = "media/n1/c.png";

const fenceText = (b: { content?: unknown }): string =>
  (Array.isArray(b.content) && (b.content[0] as { text?: string }).text) || "";

function journalBlock(pages: JournalPage[]) {
  return { type: "journal", props: { pages: stringifyJournalPages(pages) } };
}

describe("parse/stringify journal pages", () => {
  it("round-trips the ordered list, dropping empty captions", () => {
    const pages: JournalPage[] = [{ url: A, caption: "Nov 3" }, { url: B }];
    expect(parseJournalPages(stringifyJournalPages(pages))).toEqual([{ url: A, caption: "Nov 3" }, { url: B }]);
  });
  it("is defensive against junk JSON", () => {
    expect(parseJournalPages("not json")).toEqual([]);
    expect(parseJournalPages("{}")).toEqual([]);
    expect(parseJournalPages(undefined)).toEqual([]);
    expect(parseJournalPages('[{"nope":1}]')).toEqual([]);
  });
});

describe("encodeJournalBlock → pensieve:journal fence", () => {
  it("emits one `ref | caption` line per page, order preserved, captions optional", () => {
    const block = journalBlock([{ url: A, caption: "Nov 3" }, { url: B }, { url: C, caption: "Nov 4" }]);
    const fence = encodeJournalBlock(block);
    expect(fence.type).toBe("codeBlock");
    expect((fence.props as { language: string }).language).toBe(JOURNAL_FENCE);
    expect(fenceText(fence)).toBe(`${A} | Nov 3\n${B}\n${C} | Nov 4`);
  });

  it("rewrites a loadable url → its vault ref (refForUrl), keeps externals verbatim", () => {
    registerMediaUrl(A, "asset://localhost/a.png");
    const block = journalBlock([{ url: "asset://localhost/a.png", caption: "p1" }, { url: "https://x.com/y.png" }]);
    expect(fenceText(encodeJournalBlock(block))).toBe(`${A} | p1\nhttps://x.com/y.png`);
  });
});

describe("reconstructJournalFence → journal block", () => {
  it("parses lines back into an ordered page list (captions optional)", () => {
    const fence = { type: "codeBlock", props: { language: JOURNAL_FENCE }, content: [{ type: "text", text: `${A} | one\n${B}\n${C} | three` }] };
    const block = reconstructJournalFence(fence)!;
    expect(block.type).toBe("journal");
    expect(parseJournalPages((block.props as { pages: string }).pages)).toEqual([
      { url: A, caption: "one" },
      { url: B },
      { url: C, caption: "three" },
    ]);
  });

  it("returns null for a non-journal block", () => {
    expect(reconstructJournalFence({ type: "codeBlock", props: { language: "pensieve:gallery" }, content: [] })).toBeNull();
    expect(reconstructJournalFence({ type: "paragraph" })).toBeNull();
  });
});

describe("full bridge round-trip", () => {
  it("encode → reconstruct preserves pages, captions and order", () => {
    const original: JournalPage[] = [{ url: A, caption: "one" }, { url: B }, { url: C, caption: "three" }];
    const fence = encodeJournalBlock(journalBlock(original));
    const back = reconstructJournalFence({ ...fence, content: [{ text: fenceText(fence) }] })!;
    expect(parseJournalPages((back.props as { pages: string }).pages)).toEqual(original);
  });

  it("round-trips a single shared boundary page appearing in two separate journal blocks", () => {
    // The owner's splitting rule: a page can be the end of one day AND the start of the
    // next — it's referenced by BOTH final Memories, not torn in half. At the markdown
    // layer that's just the same ref appearing in two independent fences; nothing special
    // to encode, but worth locking in since it's the one case a naive "one owner" model
    // would get wrong.
    const shared = "media/dayA-note/shared.png";
    const dayA = journalBlock([{ url: A }, { url: shared, caption: "end of day A" }]);
    const dayB = journalBlock([{ url: shared, caption: "start of day B" }, { url: C }]);
    const fenceA = encodeJournalBlock(dayA);
    const fenceB = encodeJournalBlock(dayB);
    expect(fenceText(fenceA)).toContain(shared);
    expect(fenceText(fenceB)).toContain(shared);
    const backA = reconstructJournalFence({ ...fenceA, content: [{ text: fenceText(fenceA) }] })!;
    const backB = reconstructJournalFence({ ...fenceB, content: [{ text: fenceText(fenceB) }] })!;
    expect(parseJournalPages((backA.props as { pages: string }).pages).at(-1)!.url).toBe(shared);
    expect(parseJournalPages((backB.props as { pages: string }).pages).at(0)!.url).toBe(shared);
  });
});

describe("isJournalBlock", () => {
  it("recognises the block type", () => {
    expect(isJournalBlock({ type: "journal" })).toBe(true);
    expect(isJournalBlock({ type: "imageGroup" })).toBe(false);
  });
});

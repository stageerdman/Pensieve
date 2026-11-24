// The phone-to-Mac showcase is one hand-written HTML file that must open from disk,
// offline, with made-up data only. These tests guard that promise and play the whole
// story through once (instantly) to prove every scene runs and the chat cites real memories.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, it, expect } from "vitest";

const FILE = resolve(__dirname, "pensieve-showcase.html");
const html = readFileSync(FILE, "utf8");

describe("showcase file", () => {
  it("never reaches the network, the mic or storage", () => {
    for (const banned of ["fetch(", "XMLHttpRequest", "getUserMedia", "localStorage", "sessionStorage", "WebSocket", "import("]) {
      expect(html, banned).not.toContain(banned);
    }
    // only the SVG namespace may look like a URL
    const urls = html.match(/https?:\/\/[^\s"'<>)]+/g) ?? [];
    expect(urls.filter((u) => !u.startsWith("http://www.w3.org/"))).toEqual([]);
  });

  it("is one file: no external scripts, styles or images", () => {
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+stylesheet/);
    expect(html).not.toMatch(/<img[^>]+src="(?!data:)/);
  });
});

type Showcase = {
  S: { caught: string[]; done: Set<string>; mac: boolean; rest: boolean; busy: boolean };
  DATA: {
    memories: Record<string, { title: string; glyph: string }>;
    chat: { qs: { q: string; closing?: boolean; a: (string | { m?: string; i?: string })[] }[] };
  };
  MODES: { id: string }[];
  playMode: (id: string) => Promise<void>;
  openMac: () => Promise<void>;
  ask: (q: string) => Promise<void>;
  pickAnswer: (q: string) => number;
};

function load() {
  const errors: string[] = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(w) {
      (w as unknown as { __instant: boolean }).__instant = true;
      w.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
      w.HTMLElement.prototype.focus = function () {};
      w.addEventListener("error", (e) => errors.push(String(e.message)));
    },
  });
  const sc = (dom.window as unknown as { __showcase: Showcase }).__showcase;
  return { dom, sc, errors };
}

describe("showcase story", () => {
  it("plays every mode, pours into the Mac and ends at rest", async () => {
    const { dom, sc, errors } = load();
    expect(sc, "page script ran").toBeTruthy();

    for (const m of sc.MODES) await sc.playMode(m.id);
    expect(sc.S.done.size).toBe(sc.MODES.length);
    // every shape that becomes a memory leaves a bottle on the shelf
    const bottles = dom.window.document.querySelectorAll("#shelf .bottle");
    expect(bottles.length).toBe(sc.S.caught.length);
    expect(sc.S.caught.length).toBe(7);

    await sc.openMac();
    expect(sc.S.mac).toBe(true);
    const cards = dom.window.document.querySelectorAll("#gallery .mcard");
    expect(cards.length).toBe(8); // journal splits into two days
    for (const c of cards) expect(c.querySelector("p")!.textContent!.length).toBeGreaterThan(0);

    const closing = sc.DATA.chat.qs.find((q) => q.closing)!;
    await sc.ask(closing.q);
    expect(sc.S.rest).toBe(true);
    const last = [...dom.window.document.querySelectorAll("#msgs .msg.pa")].pop()!;
    expect(last.querySelectorAll(".cite").length).toBeGreaterThanOrEqual(4);
    expect(errors).toEqual([]);
    dom.window.close();
  });

  it("opens the Mac with nothing caught: everything arrives from earlier", async () => {
    const { dom, sc } = load();
    await sc.openMac();
    expect(dom.window.document.querySelectorAll("#gallery .mcard").length).toBe(8);
    expect(dom.window.document.querySelector("#gallery")!.textContent).toContain("From earlier this week");
    dom.window.close();
  });

  it("answers cite memories that exist, from at least four shapes at the close", () => {
    const { dom, sc } = load();
    for (const q of sc.DATA.chat.qs) {
      for (const seg of q.a) if (typeof seg !== "string" && seg.m) expect(sc.DATA.memories[seg.m], seg.m).toBeTruthy();
    }
    const closing = sc.DATA.chat.qs.find((q) => q.closing)!;
    const glyphs = new Set(closing.a.flatMap((s) => (typeof s !== "string" && s.m ? [sc.DATA.memories[s.m].glyph] : [])));
    expect(glyphs.size).toBeGreaterThanOrEqual(4);
    dom.window.close();
  });

  it("matches suggested questions exactly and free text by keyword", () => {
    const { dom, sc } = load();
    sc.DATA.chat.qs.forEach((q, i) => expect(sc.pickAnswer(q.q)).toBe(i));
    expect(sc.pickAnswer("why am I so afraid?")).toBe(0);
    expect(sc.pickAnswer("what's my next step")).toBe(2);
    expect(sc.pickAnswer("purple elephants")).toBe(-1);
    dom.window.close();
  });
});

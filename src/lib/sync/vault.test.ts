// Local vault (Tauri implementation): the raw `.md`-file level access the sync
// engine reads/writes at. Locks the path layout (notes/<id>.md + .meta.json,
// sync/state.json), the meta-sidecar rebuild on writeNote (preserving local-only
// fields across a remote-driven overwrite), delete fan-out, and the
// corrupt/missing-state fallback.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- fake native filesystem ----
const files = new Map<string, string>();

const invoke = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
  switch (cmd) {
    case "read_text": {
      const rel = args!.rel as string;
      return files.has(rel) ? files.get(rel)! : null;
    }
    case "write_text": {
      files.set(args!.rel as string, args!.contents as string);
      return undefined;
    }
    case "write_bytes": {
      // base64 payload is stored verbatim; the vault wrapper handles the (de)coding.
      files.set(args!.rel as string, args!.data as string);
      return undefined;
    }
    case "read_bytes": {
      const rel = args!.rel as string;
      return files.has(rel) ? files.get(rel)! : null;
    }
    case "list_dir": {
      // Return only IMMEDIATE child names (mirrors the real list_dir), deduped — so a
      // nested media/<noteId>/<file> tree lists <noteId> dirs at the top level.
      const prefix = `${args!.rel as string}/`;
      const names = new Set<string>();
      for (const k of files.keys()) {
        if (k.startsWith(prefix)) names.add(k.slice(prefix.length).split("/")[0]);
      }
      return [...names];
    }
    case "remove_path": {
      files.delete(args!.rel as string);
      return undefined;
    }
    default:
      throw new Error(`unhandled invoke: ${cmd}`);
  }
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...(a as [string, Record<string, unknown>])) }));

import { tauriVault } from "./vault";
import { EMPTY_SYNC_STATE } from "./types";

beforeEach(() => {
  files.clear();
  invoke.mockClear();
});

describe("listNotes", () => {
  it("returns [] on an empty vault", async () => {
    expect(await tauriVault().listNotes()).toEqual([]);
  });

  it("lists .md ids with their updatedAt from the meta sidecar, ignoring non-.md files", async () => {
    files.set("notes/a.md", "# A\n");
    files.set("notes/a.meta.json", JSON.stringify({ title: "A", createdAt: 1, updatedAt: 42 }));
    files.set("notes/b.md", "# B\n"); // no sidecar yet
    files.set("notes/stray.txt", "junk");
    const notes = await tauriVault().listNotes();
    expect(notes.sort((x, y) => x.id.localeCompare(y.id))).toEqual([
      { id: "a", updatedAt: 42 },
      { id: "b", updatedAt: 0 }, // missing sidecar → defaults to 0, doesn't throw
    ]);
  });
});

describe("readNote", () => {
  it("returns the raw content when present", async () => {
    files.set("notes/x.md", "# X\nbody");
    expect(await tauriVault().readNote("x")).toBe("# X\nbody");
  });

  it("returns null when absent", async () => {
    expect(await tauriVault().readNote("missing")).toBe(null);
  });
});

describe("writeNote", () => {
  it("writes the raw .md and creates a fresh meta sidecar for a brand-new note", async () => {
    const times = { createdAt: 1000, updatedAt: 2000 };
    await tauriVault().writeNote("new1", "# Hello World\nbody text", times);
    expect(files.get("notes/new1.md")).toBe("# Hello World\nbody text");

    const meta = JSON.parse(files.get("notes/new1.meta.json")!);
    expect(meta.title).toBe("Hello World");
    expect(meta.createdAt).toBe(1000);
    expect(meta.addedAt).toBe(1000);
    expect(meta.updatedAt).toBe(2000);
    expect(meta.pinned).toBe(false);
    expect(meta.categories).toEqual([]);
    expect(meta.tags).toEqual([]);
  });

  it("falls back to now() when no times are given for a new note", async () => {
    const before = Date.now();
    await tauriVault().writeNote("new2", "# T\n");
    const meta = JSON.parse(files.get("notes/new2.meta.json")!);
    expect(meta.createdAt).toBeGreaterThanOrEqual(before);
    expect(meta.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("preserves local-only fields (pinned, original createdAt/addedAt) across a remote-driven rewrite", async () => {
    files.set("notes/x.md", "# Old\n");
    files.set(
      "notes/x.meta.json",
      JSON.stringify({ title: "Old", createdAt: 111, addedAt: 111, updatedAt: 500, pinned: true }),
    );
    // A remote pull overwrites the body with a different createdAt/updatedAt hint —
    // the original createdAt/addedAt and the pinned flag must survive.
    await tauriVault().writeNote("x", "# New body\n", { createdAt: 999, updatedAt: 7000 });
    const meta = JSON.parse(files.get("notes/x.meta.json")!);
    expect(meta.title).toBe("New body");
    expect(meta.createdAt).toBe(111);
    expect(meta.addedAt).toBe(111);
    expect(meta.updatedAt).toBe(7000);
    expect(meta.pinned).toBe(true);
  });

  it("extracts categories/tags from frontmatter into the sidecar", async () => {
    const content = "---\ncategories: [Notes & Lessons]\ntags: [goals, health]\nlinks: []\n---\n\n# Title\nbody";
    await tauriVault().writeNote("fm1", content);
    const meta = JSON.parse(files.get("notes/fm1.meta.json")!);
    expect(meta.title).toBe("Title");
    expect(meta.categories).toEqual(["Notes & Lessons"]);
    expect(meta.tags).toEqual(["goals", "health"]);
  });

  it("derives the title from the first non-empty line, stripping heading marks", async () => {
    await tauriVault().writeNote("t1", "\n\n## My Heading\nbody");
    expect(JSON.parse(files.get("notes/t1.meta.json")!).title).toBe("My Heading");
  });

  it("falls back to Untitled for a body with no content lines", async () => {
    await tauriVault().writeNote("empty1", "");
    expect(JSON.parse(files.get("notes/empty1.meta.json")!).title).toBe("Untitled");
  });
});

describe("deleteNote", () => {
  it("removes the .md, the meta sidecar, and the timeline file", async () => {
    files.set("notes/x.md", "# X\n");
    files.set("notes/x.meta.json", "{}");
    files.set("timelines/x.json", "[]");
    await tauriVault().deleteNote("x");
    expect(files.has("notes/x.md")).toBe(false);
    expect(files.has("notes/x.meta.json")).toBe(false);
    expect(files.has("timelines/x.json")).toBe(false);
  });

  it("is a no-op (not a throw) when nothing exists at those paths", async () => {
    await expect(tauriVault().deleteNote("ghost")).resolves.toBeUndefined();
  });
});

describe("readState", () => {
  it("returns the empty state when no state file exists", async () => {
    expect(await tauriVault().readState()).toEqual({ ...EMPTY_SYNC_STATE, notes: {} });
  });

  it("parses a valid stored state", async () => {
    const state = { deltaLink: "https://g/delta", notes: { a: { id: "a", remoteId: "r1", cTag: "c1", localUpdatedAt: 1, syncedAt: 2 } }, lastSyncedAt: 3 };
    files.set("sync/state.json", JSON.stringify(state));
    expect(await tauriVault().readState()).toEqual(state);
  });

  it("falls back to the empty state on corrupt JSON rather than throwing", async () => {
    files.set("sync/state.json", "{not valid json");
    expect(await tauriVault().readState()).toEqual({ ...EMPTY_SYNC_STATE, notes: {} });
  });
});

describe("writeState", () => {
  it("serializes the state to sync/state.json", async () => {
    const state = { deltaLink: null, notes: {}, lastSyncedAt: 123 };
    await tauriVault().writeState(state);
    expect(JSON.parse(files.get("sync/state.json")!)).toEqual(state);
  });
});

describe("media", () => {
  it("listMedia walks media/<noteId>/* into vault-relative refs", async () => {
    files.set("media/n1/a.png", "..");
    files.set("media/n1/b.jpg", "..");
    files.set("media/n2/c.webp", "..");
    files.set("notes/x.md", "# X\n"); // not media
    const refs = (await tauriVault().listMedia()).sort();
    expect(refs).toEqual(["media/n1/a.png", "media/n1/b.jpg", "media/n2/c.webp"]);
  });

  it("writeMediaBytes / readMediaBytes round-trips raw bytes via base64", async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    await tauriVault().writeMediaBytes("media/n1/a.png", bytes);
    const back = await tauriVault().readMediaBytes("media/n1/a.png");
    expect(back).not.toBeNull();
    expect([...back!]).toEqual([0, 1, 2, 250, 255]);
  });

  it("readMediaBytes returns null when the file is absent", async () => {
    expect(await tauriVault().readMediaBytes("media/n1/missing.png")).toBeNull();
  });
});

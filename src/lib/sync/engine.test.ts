import { describe, it, expect, beforeEach } from "vitest";
import type { GraphClient, GraphFetchOptions } from "./graph";
import type { LocalVault, LocalNoteInfo, WriteTimes } from "./vault";
import { EMPTY_SYNC_STATE, RemoteRootMissingError, type SyncState } from "./types";
import { sync, resolveKeepLocal, resolveKeepRemote, restoreFromCloud } from "./engine";
import { createRoot } from "./adapter";

// ---- in-memory LocalVault ----
class MemVault implements LocalVault {
  notes = new Map<string, { content: string; updatedAt: number }>();
  media = new Map<string, Uint8Array>();
  raw = new Map<string, { content: string; updatedAt: number }>();
  state: SyncState = { ...EMPTY_SYNC_STATE, notes: {} };

  async listNotes(): Promise<LocalNoteInfo[]> {
    return [...this.notes].map(([id, n]) => ({ id, updatedAt: n.updatedAt }));
  }
  async readNote(id: string) {
    return this.notes.get(id)?.content ?? null;
  }
  async writeNote(id: string, content: string, times?: WriteTimes) {
    this.notes.set(id, { content, updatedAt: times?.updatedAt ?? 0 });
  }
  async deleteNote(id: string) {
    this.notes.delete(id);
  }
  async listRawMemories(): Promise<LocalNoteInfo[]> {
    return [...this.raw].map(([id, r]) => ({ id, updatedAt: r.updatedAt }));
  }
  async readRawMemory(id: string) {
    return this.raw.get(id)?.content ?? null;
  }
  async writeRawMemory(id: string, content: string, times?: WriteTimes) {
    this.raw.set(id, { content, updatedAt: times?.updatedAt ?? 0 });
  }
  async deleteRawMemory(id: string) {
    this.raw.delete(id);
  }
  async readState() {
    return JSON.parse(JSON.stringify(this.state)) as SyncState;
  }
  async writeState(s: SyncState) {
    this.state = JSON.parse(JSON.stringify(s)) as SyncState;
  }
  async listMedia() {
    return [...this.media.keys()];
  }
  async readMediaBytes(ref: string) {
    return this.media.get(ref) ?? null;
  }
  async writeMediaBytes(ref: string, bytes: Uint8Array) {
    this.media.set(ref, bytes);
  }
  async mediaSize(ref: string) {
    return this.media.get(ref)?.byteLength ?? null;
  }

  // test helper: a local edit at a given time
  edit(id: string, content: string, updatedAt: number) {
    this.notes.set(id, { content, updatedAt });
  }
  // test helper: a local media file on disk
  putMedia(ref: string, bytes: Uint8Array) {
    this.media.set(ref, bytes);
  }
  // test helper: a local Raw Memory edit at a given time
  editRaw(id: string, content: string, updatedAt: number) {
    this.raw.set(id, { content, updatedAt });
  }
}

// ---- fake OneDrive (models delta, cTags, If-Match) ----
const ROOT = "/me/drive/root:/Pensieve";
interface RemoteFile {
  id: string;
  content: string;
  cTag: string;
  time: string;
  ver: number;
}

/** Splits a self.files key (a full relative path, e.g. "raw/r1.json") into the
 *  {bareName, parentPath} shape real Graph items actually carry. */
function splitPath(fullKey: string): { bareName: string; parentPath: string } {
  const idx = fullKey.lastIndexOf("/");
  if (idx === -1) return { bareName: fullKey, parentPath: "/drive/root:/Pensieve" };
  return { bareName: fullKey.slice(idx + 1), parentPath: `/drive/root:/Pensieve/${fullKey.slice(0, idx)}` };
}

class FakeDrive {
  files = new Map<string, RemoteFile>();
  tombstones: Array<{ name: string; id: string; ver: number }> = [];
  rootExists = true; // the Pensieve folder is present on this drive
  ver = 0;
  idc = 0;
  clock = 1_000_000;

  private stamp() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  // simulate another device writing
  put(name: string, content: string): RemoteFile {
    this.ver++;
    const existing = this.files.get(name);
    const f: RemoteFile = {
      id: existing?.id ?? `id${++this.idc}`,
      content,
      cTag: `c${this.ver}`,
      time: this.stamp(),
      ver: this.ver,
    };
    this.files.set(name, f);
    return f;
  }
  del(name: string) {
    const f = this.files.get(name);
    if (!f) return;
    this.ver++;
    this.files.delete(name);
    this.tombstones.push({ name, id: f.id, ver: this.ver });
  }

  nameFromPath(path: string): string {
    const rest = path.slice(ROOT.length + 1); // after "/Pensieve/"
    return rest.split(":")[0].split("?")[0];
  }

  client(): GraphClient {
    const self = this;
    const resp = (status: number, body?: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body ?? "")),
      // downloadMedia reads the binary content via arrayBuffer(), not text()/json() —
      // this fake's media bodies are plain strings ("BYTES" in the raw-sync tests), so
      // UTF-8-encoding them is enough to exercise that path for real.
      arrayBuffer: async () => new TextEncoder().encode(typeof body === "string" ? body : JSON.stringify(body ?? "")).buffer,
      headers: { get: () => null },
    });

    const handle = (path: string, opts: GraphFetchOptions = {}) => {
      const method = (opts.method ?? "GET").toUpperCase();

      // root existence probe (remoteRootExists)
      if (path === ROOT && method === "GET") return self.rootExists ? resp(200, { id: "root" }) : resp(404);
      // createRoot ("Summon Pensieve")
      if (path === "/me/drive/root/children" && method === "POST") {
        self.rootExists = true;
        return resp(201, { id: "root" });
      }

      // children listing (listNotes / listRawRecords) — the whole-folder read
      // restoreFromCloud uses. Real Graph returns DIRECT children only, with a bare
      // `name` + `parentReference.path` (never the full nested path as `name`) — this
      // self.files map keys everything by full relative path ("raw/r1.json"), so that
      // gets split here. Root-level note names have no "/" to split, so this is a
      // no-op for every existing note test.
      if (path.includes(":/children")) {
        const m = path.match(/:\/Pensieve(\/[^:?]*)?:\/children/);
        const sub = m?.[1] ? m[1].slice(1) : ""; // "" for the root, "raw" for that subfolder
        const value = [...self.files]
          .filter(([fullKey]) => {
            const idx = fullKey.lastIndexOf("/");
            const dir = idx === -1 ? "" : fullKey.slice(0, idx);
            return dir === sub;
          })
          .map(([fullKey, f]) => {
            const { bareName, parentPath } = splitPath(fullKey);
            return { id: f.id, name: bareName, cTag: f.cTag, lastModifiedDateTime: f.time, parentReference: { path: parentPath } };
          });
        return resp(200, { value });
      }

      // delta — same bare-name + parentReference shape as children listing above;
      // tombstones are deliberately left as-is (no parentReference), matching real
      // Graph's "a tombstone can lack full metadata" behaviour and exercising this
      // project's remoteId-based fallback lookup for both notes and raw records.
      if (path.includes(":/delta") || path.startsWith("https://fake/delta")) {
        const m = path.match(/[?&]v=(\d+)/);
        const since = m ? Number(m[1]) : 0;
        const value: unknown[] = [];
        for (const [fullKey, f] of self.files) {
          if (f.ver <= since) continue;
          const { bareName, parentPath } = splitPath(fullKey);
          value.push({ id: f.id, name: bareName, cTag: f.cTag, lastModifiedDateTime: f.time, parentReference: { path: parentPath } });
        }
        for (const t of self.tombstones) if (t.ver > since) value.push({ id: t.id, name: t.name, deleted: {} });
        return resp(200, { value, "@odata.deltaLink": `https://fake/delta?v=${self.ver}` });
      }

      const name = self.nameFromPath(path);

      // content GET / PUT
      if (path.includes(":/content")) {
        if (method === "GET") {
          const f = self.files.get(name);
          return f ? resp(200, f.content) : resp(404);
        }
        if (method === "PUT") {
          const ifMatch = (opts.headers as Record<string, string> | undefined)?.["If-Match"];
          const existing = self.files.get(name);
          if (ifMatch && (!existing || existing.cTag !== ifMatch)) return resp(412);
          const f = self.put(name, String(opts.body ?? ""));
          return resp(existing ? 200 : 201, { id: f.id, name, cTag: f.cTag, lastModifiedDateTime: f.time });
        }
      }

      // meta GET (has ?$select, no :/content)
      if (method === "GET") {
        const f = self.files.get(name);
        return f ? resp(200, { id: f.id, name, cTag: f.cTag, lastModifiedDateTime: f.time }) : resp(404);
      }

      // DELETE
      if (method === "DELETE") {
        const ifMatch = (opts.headers as Record<string, string> | undefined)?.["If-Match"];
        const existing = self.files.get(name);
        if (ifMatch && existing && existing.cTag !== ifMatch) return resp(412);
        self.del(name);
        return resp(existing ? 204 : 404);
      }

      return resp(500, `unhandled ${method} ${path}`);
    };

    return {
      fetch: async (path, opts) => handle(path, opts) as unknown as Response,
      json: async <T>(path: string, opts?: GraphFetchOptions) => (await (handle(path, opts).json())) as T,
      token: async () => "fake-token",
    };
  }
}

describe("sync engine", () => {
  let vault: MemVault;
  let drive: FakeDrive;
  let graph: GraphClient;

  beforeEach(() => {
    vault = new MemVault();
    drive = new FakeDrive();
    graph = drive.client();
  });

  it("refuses to sync (and never creates the folder) when the remote root is missing", async () => {
    drive.rootExists = false;
    vault.edit("x", "# X\n", 5);
    await expect(sync(graph, vault)).rejects.toBeInstanceOf(RemoteRootMissingError);
    // Nothing was pushed — sync stopped at the gate.
    expect(drive.files.size).toBe(0);
  });

  it("summon = createRoot then sync: after summoning, the first backup goes through", async () => {
    drive.rootExists = false;
    vault.edit("x", "# X\n", 5);
    // Mirror createEngine().summon(): create the folder, then run the normal sync.
    await createRoot(graph);
    const r = await sync(graph, vault);
    expect(drive.rootExists).toBe(true);
    expect(r.pushed).toEqual(["x"]);
    expect(drive.files.get("x.md")?.content).toBe("# X\n");
  });

  it("initial pull downloads remote notes into the empty vault", async () => {
    drive.put("a.md", "# A\n");
    drive.put("b.md", "# B\n");
    const r = await sync(graph, vault);
    expect(r.pulled.sort()).toEqual(["a", "b"]);
    expect(await vault.readNote("a")).toBe("# A\n");
    expect(vault.state.notes.a.cTag).toBe("c1");
    expect(vault.state.deltaLink).toContain("v=2");
  });

  it("emits progress for each transferred item (downloads then uploads)", async () => {
    drive.put("a.md", "# A\n"); // 1 download
    drive.put("b.md", "# B\n"); // 1 download
    vault.edit("x", "# X\n", 5); // 1 upload
    const events: Array<{ direction: string; name: string; doneItems: number; totalItems: number }> = [];
    await sync(graph, vault, (p) => events.push({ ...p }));

    // 3 transfers, every event reports the same total.
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.totalItems === 3)).toBe(true);
    // Downloads are emitted before uploads, and doneItems counts up 0,1,2.
    expect(events.map((e) => e.direction)).toEqual(["down", "down", "up"]);
    expect(events.map((e) => e.doneItems)).toEqual([0, 1, 2]);
    expect(events.map((e) => e.name).sort()).toEqual(["a", "b", "x"]);
  });

  it("does not emit progress when there is nothing to transfer", async () => {
    const events: unknown[] = [];
    await sync(graph, vault, (p) => events.push(p));
    expect(events).toHaveLength(0);
  });

  it("pushes a new local note to the remote", async () => {
    vault.edit("x", "# X\n", 5);
    const r = await sync(graph, vault);
    expect(r.pushed).toEqual(["x"]);
    expect(drive.files.get("x.md")?.content).toBe("# X\n");
    expect(vault.state.notes.x.cTag).toBe("c1");
  });

  it("does not re-push or re-pull an unchanged note on a second sync", async () => {
    vault.edit("x", "# X\n", 5);
    await sync(graph, vault);
    const r2 = await sync(graph, vault);
    expect(r2.pushed).toEqual([]);
    expect(r2.pulled).toEqual([]);
  });

  it("pushes a local edit with a conditional write and advances the cTag", async () => {
    vault.edit("x", "# X\n", 5);
    await sync(graph, vault);
    const firstCTag = vault.state.notes.x.cTag;
    vault.edit("x", "# X edited\n", 999_999_999_999); // later than syncedAt
    const r = await sync(graph, vault);
    expect(r.pushed).toEqual(["x"]);
    expect(vault.state.notes.x.cTag).not.toBe(firstCTag);
    expect(drive.files.get("x.md")?.content).toBe("# X edited\n");
  });

  it("applies a remote-only edit on pull (remote wins when local is unchanged)", async () => {
    vault.edit("x", "# X\n", 5);
    await sync(graph, vault);
    drive.put("x.md", "# X from other device\n"); // another device edits
    const r = await sync(graph, vault);
    expect(r.pulled).toEqual(["x"]);
    expect(await vault.readNote("x")).toBe("# X from other device\n");
  });

  it("flags a both-changed note as a conflict and leaves local untouched", async () => {
    vault.edit("x", "# X\n", 5);
    await sync(graph, vault);
    // remote changes AND local changes before the next sync
    drive.put("x.md", "# remote wins?\n");
    vault.edit("x", "# local edit\n", 999_999_999_999);
    const r = await sync(graph, vault);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({ noteId: "x", reason: "both-changed" });
    // Both sides' timestamps are captured for the panel's one-line fact.
    expect(r.conflicts[0]?.localUpdatedAt).toBe(999_999_999_999);
    expect(r.conflicts[0]?.remoteUpdatedAt).toBeGreaterThan(0);
    expect(await vault.readNote("x")).toBe("# local edit\n"); // not clobbered
    expect(r.pulled).toEqual([]);
    expect(r.pushed).toEqual([]);
  });

  it("propagates a remote deletion to the local vault", async () => {
    drive.put("a.md", "# A\n");
    await sync(graph, vault);
    drive.del("a.md");
    const r = await sync(graph, vault);
    expect(r.pulledDeletes).toEqual(["a"]);
    expect(vault.notes.has("a")).toBe(false);
    expect(vault.state.notes.a).toBeUndefined();
  });

  it("handles a nameless /delta tombstone without crashing and still deletes locally", async () => {
    // Regression: a deleted item can arrive from /delta with only an id + deleted
    // facet (no `name`) — noteIdFromName(undefined) used to throw
    // "undefined is not an object (t.endsWith)" and abort the whole sync.
    drive.put("a.md", "# A\n");
    await sync(graph, vault);
    const remoteId = vault.state.notes.a.remoteId;

    // A delta feed whose only change is a nameless tombstone for note "a".
    const tombGraph: GraphClient = {
      fetch: graph.fetch,
      json: async <T>(path: string, opts?: GraphFetchOptions) => {
        if (path.includes(":/delta") || path.startsWith("https://fake/delta")) {
          return { value: [{ id: remoteId, deleted: {} }], "@odata.deltaLink": "https://fake/delta?v=99" } as T;
        }
        return graph.json<T>(path, opts);
      },
      token: graph.token,
    };

    const r = await sync(tombGraph, vault);
    expect(r.pulledDeletes).toEqual(["a"]);
    expect(vault.notes.has("a")).toBe(false);
    expect(vault.state.notes.a).toBeUndefined();
  });

  it("resolveKeepLocal makes the local copy win on the next sync", async () => {
    vault.edit("x", "# X\n", 5);
    await sync(graph, vault);
    // conflict: both sides change
    drive.put("x.md", "# remote\n");
    vault.edit("x", "# local wins\n", 1_000);
    const c = await sync(graph, vault);
    expect(c.conflicts[0]?.reason).toBe("both-changed");

    // owner chooses keep-local, then re-syncs
    await resolveKeepLocal(graph, vault, "x");
    const r = await sync(graph, vault);
    expect(r.pushed).toContain("x");
    expect(r.conflicts).toEqual([]);
    expect(drive.files.get("x.md")?.content).toBe("# local wins\n");
  });

  it("resolveKeepRemote discards the local edit and takes the remote copy immediately", async () => {
    vault.edit("x", "# X\n", 5);
    await sync(graph, vault);
    drive.put("x.md", "# remote wins\n");
    vault.edit("x", "# local loses\n", 1_000);
    const c = await sync(graph, vault);
    expect(c.conflicts[0]?.reason).toBe("both-changed");

    await resolveKeepRemote(graph, vault, "x");
    // Applied immediately — no second sync required for the local copy to flip.
    expect(await vault.readNote("x")).toBe("# remote wins\n");

    // The next ordinary sync sees it as already in sync: no push, no conflict.
    const r = await sync(graph, vault);
    expect(r.conflicts).toEqual([]);
    expect(r.pushed).toEqual([]);
    expect(r.pulled).toEqual([]);
  });

  it("restoreFromCloud overwrites local, deletes local-only notes, and re-baselines", async () => {
    // Remote has a + b; local has a (stale/divergent edit), b (matching-ish), and a
    // local-only note c that the cloud never saw. A restore should make local == cloud.
    drive.put("a.md", "# A cloud\n");
    drive.put("b.md", "# B cloud\n");
    vault.edit("a", "# A local garbage\n", 999_999_999_999); // diverged local edit
    vault.edit("b", "# B local\n", 5);
    vault.edit("c", "# C local only\n", 10); // not in the cloud

    const r = await restoreFromCloud(graph, vault);

    expect(r.pulled.sort()).toEqual(["a", "b"]);
    expect(r.pulledDeletes).toEqual(["c"]); // local-only note dropped
    expect(await vault.readNote("a")).toBe("# A cloud\n"); // local edit discarded
    expect(await vault.readNote("b")).toBe("# B cloud\n");
    expect(vault.notes.has("c")).toBe(false);
    // State is a fresh baseline: a + b recorded with the cloud cTags, deltaLink reset.
    expect(Object.keys(vault.state.notes).sort()).toEqual(["a", "b"]);
    expect(vault.state.notes.a.cTag).toBe(drive.files.get("a.md")?.cTag);
    expect(vault.state.deltaLink).toBeNull();
    expect(vault.state.lastSyncedAt).toBeGreaterThan(0);
  });

  it("restoreFromCloud refuses (and never touches local) when the remote root is missing", async () => {
    drive.rootExists = false;
    vault.edit("x", "# keep me\n", 5);
    await expect(restoreFromCloud(graph, vault)).rejects.toBeInstanceOf(RemoteRootMissingError);
    expect(await vault.readNote("x")).toBe("# keep me\n"); // untouched
  });

  it("restoreFromCloud into an empty cloud clears the local vault", async () => {
    vault.edit("x", "# X\n", 5);
    vault.edit("y", "# Y\n", 6);
    const r = await restoreFromCloud(graph, vault);
    expect(r.pulled).toEqual([]);
    expect(r.pulledDeletes.sort()).toEqual(["x", "y"]);
    expect(await vault.listNotes()).toEqual([]);
  });

  it("propagates a local deletion to the remote", async () => {
    vault.edit("x", "# X\n", 5);
    await sync(graph, vault);
    vault.deleteNote("x");
    const r = await sync(graph, vault);
    expect(r.pushedDeletes).toEqual(["x"]);
    expect(drive.files.has("x.md")).toBe(false);
    expect(vault.state.notes.x).toBeUndefined();
  });
});

// ── Raw Memory sync (RAW-MEMORY-JOURNAL) ─────────────────────────────────────────
// Same algorithm as notes (see adapter.ts/engine.ts comments on rawIdFromItem), own
// id-space, own result arrays — exercised against the SAME FakeDrive/MemVault, on
// the SAME delta feed (no second cursor), to prove it rides alongside notes without
// disturbing them.
describe("sync engine — Raw Memory records", () => {
  let vault: MemVault;
  let drive: FakeDrive;
  let graph: GraphClient;

  beforeEach(() => {
    vault = new MemVault();
    drive = new FakeDrive();
    graph = drive.client();
  });

  const rawJson = (id: string, pages: string[], status = "synced") => JSON.stringify({ id, status, createdAt: 1, pages });

  it("pushes a new local Raw Memory record to the remote, under raw/", async () => {
    vault.editRaw("r1", rawJson("r1", ["media/r1/a.jpg"]), 5);
    const r = await sync(graph, vault);
    expect(r.pushedRaw).toEqual(["r1"]);
    expect(r.pushed).toEqual([]); // never conflated with the note id-space
    expect(drive.files.get("raw/r1.json")?.content).toBe(rawJson("r1", ["media/r1/a.jpg"]));
    expect(vault.state.raw!.r1.cTag).toBe("c1");
  });

  it("does not re-push or re-pull an unchanged record on a second sync", async () => {
    vault.editRaw("r1", rawJson("r1", []), 5);
    await sync(graph, vault);
    const r2 = await sync(graph, vault);
    expect(r2.pushedRaw).toEqual([]);
    expect(r2.pulledRaw).toEqual([]);
  });

  it("pulls a remote-only record into the empty vault", async () => {
    drive.put("raw/r1.json", rawJson("r1", ["media/r1/a.jpg"]));
    const r = await sync(graph, vault);
    expect(r.pulledRaw).toEqual(["r1"]);
    expect(JSON.parse((await vault.readRawMemory("r1"))!).pages).toEqual(["media/r1/a.jpg"]);
  });

  it("a pulled record's pages feed the SAME media pull pass notes already use", async () => {
    drive.put("raw/r1.json", rawJson("r1", ["media/r1/a.jpg"]));
    drive.put("media/r1/a.jpg", "BYTES");
    const r = await sync(graph, vault);
    expect(r.pulledMedia).toEqual(["media/r1/a.jpg"]);
    expect(await vault.readMediaBytes("media/r1/a.jpg")).not.toBeNull();
  });

  it("propagates a remote deletion to the local vault (phone-side delete reaching desktop)", async () => {
    drive.put("raw/r1.json", rawJson("r1", []));
    await sync(graph, vault);
    drive.del("raw/r1.json");
    const r = await sync(graph, vault);
    expect(r.pulledRawDeletes).toEqual(["r1"]);
    expect(await vault.readRawMemory("r1")).toBeNull();
  });

  it("propagates a local deletion to the remote (desktop finished processing it)", async () => {
    vault.editRaw("r1", rawJson("r1", []), 5);
    await sync(graph, vault);
    await vault.deleteRawMemory("r1");
    const r = await sync(graph, vault);
    expect(r.pushedRawDeletes).toEqual(["r1"]);
    expect(drive.files.has("raw/r1.json")).toBe(false);
    expect(vault.state.raw!.r1).toBeUndefined();
  });

  it("a record changed on both sides is left for the next sync, not reported as a SyncConflict (no resolution UI exists for one)", async () => {
    vault.editRaw("r1", rawJson("r1", [], "synced"), 5);
    await sync(graph, vault);
    drive.put("raw/r1.json", rawJson("r1", [], "processing")); // another device/desktop changes it
    vault.editRaw("r1", rawJson("r1", [], "queued"), 999_999_999_999); // AND a local change
    const r = await sync(graph, vault);
    expect(r.conflicts).toEqual([]);
    expect(r.pulledRaw).toEqual([]);
    expect(r.pushedRaw).toEqual([]);
    expect(JSON.parse((await vault.readRawMemory("r1"))!).status).toBe("queued"); // local untouched
  });

  it("restoreFromCloud pulls every remote record and clears local-only ones", async () => {
    drive.put("raw/r1.json", rawJson("r1", ["media/r1/a.jpg"]));
    vault.editRaw("local-only", rawJson("local-only", []), 1);
    const r = await restoreFromCloud(graph, vault);
    expect(r.pulledRaw).toEqual(["r1"]);
    expect(r.pulledRawDeletes).toEqual(["local-only"]);
    expect(await vault.listRawMemories()).toEqual([{ id: "r1", updatedAt: expect.any(Number) }]);
  });

  it("restoreFromCloud into an empty cloud clears local Raw Memory records too", async () => {
    vault.editRaw("r1", rawJson("r1", []), 5);
    const r = await restoreFromCloud(graph, vault);
    expect(r.pulledRawDeletes).toEqual(["r1"]);
    expect(await vault.listRawMemories()).toEqual([]);
  });

  it("notes and raw records sync side by side in one call without interfering", async () => {
    vault.edit("note1", "# hello\n", 5);
    vault.editRaw("r1", rawJson("r1", []), 5);
    const r = await sync(graph, vault);
    expect(r.pushed).toEqual(["note1"]);
    expect(r.pushedRaw).toEqual(["r1"]);
    expect(drive.files.has("note1.md")).toBe(true);
    expect(drive.files.has("raw/r1.json")).toBe(true);
  });
});

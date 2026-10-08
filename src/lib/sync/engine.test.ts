import { describe, it, expect, beforeEach } from "vitest";
import type { GraphClient, GraphFetchOptions } from "./graph";
import type { LocalVault, LocalNoteInfo, WriteTimes } from "./vault";
import { EMPTY_SYNC_STATE, RemoteRootMissingError, type SyncState } from "./types";
import { sync, resolveKeepLocal } from "./engine";
import { createRoot } from "./adapter";

// ---- in-memory LocalVault ----
class MemVault implements LocalVault {
  notes = new Map<string, { content: string; updatedAt: number }>();
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
  async readState() {
    return JSON.parse(JSON.stringify(this.state)) as SyncState;
  }
  async writeState(s: SyncState) {
    this.state = JSON.parse(JSON.stringify(s)) as SyncState;
  }

  // test helper: a local edit at a given time
  edit(id: string, content: string, updatedAt: number) {
    this.notes.set(id, { content, updatedAt });
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

      // delta
      if (path.includes(":/delta") || path.startsWith("https://fake/delta")) {
        const m = path.match(/[?&]v=(\d+)/);
        const since = m ? Number(m[1]) : 0;
        const value: unknown[] = [];
        for (const [name, f] of self.files) if (f.ver > since) value.push({ id: f.id, name, cTag: f.cTag, lastModifiedDateTime: f.time });
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
    expect(r.conflicts).toEqual([{ noteId: "x", reason: "both-changed" }]);
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

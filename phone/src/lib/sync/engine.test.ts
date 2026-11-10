import { beforeEach, describe, expect, it } from "vitest";
import type { GraphClient, GraphFetchOptions } from "./graph";
import type { LocalNoteInfo, LocalVault, WriteTimes } from "./vault";
import { EMPTY_SYNC_STATE, type SyncState } from "./types";
import { RemoteRootMissingError } from "./errors";
import { createRoot } from "./adapter";
import { resolveKeepLocal, resolveKeepRemote, restoreFromCloud, sync } from "./engine";

// ---- in-memory LocalVault (mirrors src/lib/sync/engine.test.ts's MemVault) ----
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

  edit(id: string, content: string, updatedAt: number) {
    this.notes.set(id, { content, updatedAt });
  }
  editRaw(id: string, content: string, updatedAt: number) {
    this.raw.set(id, { content, updatedAt });
  }
  putMedia(ref: string, bytes: Uint8Array) {
    this.media.set(ref, bytes);
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
  rootExists = true;
  ver = 0;
  idc = 0;
  clock = 1_000_000;

  private stamp() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  put(name: string, content: string): RemoteFile {
    this.ver++;
    const existing = this.files.get(name);
    const f: RemoteFile = { id: existing?.id ?? `id${++this.idc}`, content, cTag: `c${this.ver}`, time: this.stamp(), ver: this.ver };
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
    const rest = path.slice(ROOT.length + 1);
    return rest.split(":")[0].split("?")[0];
  }

  /** A full relative-path key (e.g. "raw/r1.json") → Graph's real bare-name +
   *  parentReference.path shape — a key with no slash sits directly in Pensieve/. */
  splitPath(fullKey: string): { bareName: string; parentPath: string } {
    const slash = fullKey.lastIndexOf("/");
    if (slash === -1) return { bareName: fullKey, parentPath: ROOT.replace("/me/drive/root:/", "/drive/root:/") };
    return {
      bareName: fullKey.slice(slash + 1),
      parentPath: `${ROOT.replace("/me/drive/root:/", "/drive/root:/")}/${fullKey.slice(0, slash)}`,
    };
  }

  client(): GraphClient {
    const self = this;
    const resp = (status: number, body?: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body ?? "")),
      arrayBuffer: async () => new TextEncoder().encode(typeof body === "string" ? body : JSON.stringify(body ?? "")).buffer,
      headers: { get: () => null },
    });

    const handle = (path: string, opts: GraphFetchOptions = {}) => {
      const method = (opts.method ?? "GET").toUpperCase();

      if (path === ROOT && method === "GET") return self.rootExists ? resp(200, { id: "root" }) : resp(404);
      if (path === "/me/drive/root/children" && method === "POST") {
        self.rootExists = true;
        return resp(201, { id: "root" });
      }
      if (path.includes(":/children")) {
        // Real Graph scopes a children listing to the requested folder and returns a
        // bare `name` + `parentReference.path`, never the full nested key as `name`.
        const m = path.match(/:\/Pensieve(\/[^:?]*)?:\/children/);
        const wantSub = m?.[1] ? m[1].slice(1) : ""; // "" = root, "raw" = raw subfolder
        const value = [...self.files]
          .filter(([key]) => {
            const slash = key.lastIndexOf("/");
            const sub = slash === -1 ? "" : key.slice(0, slash);
            return sub === wantSub;
          })
          .map(([key, f]) => {
            const { bareName, parentPath } = self.splitPath(key);
            return { id: f.id, name: bareName, cTag: f.cTag, lastModifiedDateTime: f.time, parentReference: { path: parentPath } };
          });
        return resp(200, { value });
      }
      if (path.includes(":/delta") || path.startsWith("https://fake/delta")) {
        const m = path.match(/[?&]v=(\d+)/);
        const since = m ? Number(m[1]) : 0;
        const value: unknown[] = [];
        for (const [key, f] of self.files) {
          if (f.ver <= since) continue;
          const { bareName, parentPath } = self.splitPath(key);
          value.push({ id: f.id, name: bareName, cTag: f.cTag, lastModifiedDateTime: f.time, parentReference: { path: parentPath } });
        }
        // Tombstones deliberately left bare (no parentReference) — real Graph tombstones
        // often lack full metadata too, which is exactly what exercises the
        // remoteId-fallback lookup path in engine.ts rather than parent-path recognition.
        for (const t of self.tombstones) if (t.ver > since) value.push({ id: t.id, name: t.name, deleted: {} });
        return resp(200, { value, "@odata.deltaLink": `https://fake/delta?v=${self.ver}` });
      }

      const name = self.nameFromPath(path);

      if (path.includes(":/content")) {
        if (method === "GET") {
          const f = self.files.get(name);
          return f ? resp(200, f.content) : resp(404);
        }
        if (method === "PUT") {
          const ifMatch = (opts.headers as Record<string, string> | undefined)?.["If-Match"];
          const existing = self.files.get(name);
          if (ifMatch && (!existing || existing.cTag !== ifMatch)) return resp(412);
          const f = self.put(name, typeof opts.body === "string" ? opts.body : "");
          return resp(existing ? 200 : 201, { id: f.id, name, cTag: f.cTag, lastModifiedDateTime: f.time });
        }
      }

      if (method === "GET") {
        const f = self.files.get(name);
        return f ? resp(200, { id: f.id, name, cTag: f.cTag, lastModifiedDateTime: f.time }) : resp(404);
      }

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
      json: async <T>(path: string, opts?: GraphFetchOptions) => (await handle(path, opts).json()) as T,
      token: async () => "fake-token",
    };
  }
}

describe("phone sync engine", () => {
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
    expect(drive.files.size).toBe(0);
  });

  it("summon = createRoot then sync: the first backup goes through", async () => {
    drive.rootExists = false;
    vault.edit("x", "# X\n", 5);
    await createRoot(graph);
    const r = await sync(graph, vault);
    expect(drive.rootExists).toBe(true);
    expect(r.pushed).toEqual(["x"]);
  });

  it("pulls remote notes into an empty vault", async () => {
    drive.put("a.md", "A\n\nBody");
    const r = await sync(graph, vault);
    expect(r.pulled).toEqual(["a"]);
    expect(await vault.readNote("a")).toBe("A\n\nBody");
    expect(vault.state.notes.a.cTag).toBe("c1");
  });

  it("pushes a local-only note up", async () => {
    vault.edit("x", "Title\n\nBody", 5);
    const r = await sync(graph, vault);
    expect(r.pushed).toEqual(["x"]);
    expect(drive.files.get("x.md")?.content).toBe("Title\n\nBody");
  });

  it("a second sync with no changes on either side pushes/pulls nothing", async () => {
    vault.edit("x", "Title\n\nBody", 5);
    await sync(graph, vault);
    const r2 = await sync(graph, vault);
    expect(r2.pushed).toEqual([]);
    expect(r2.pulled).toEqual([]);
  });

  it("a note changed on both sides since the last sync reports a both-changed conflict, and pushes nothing for it", async () => {
    vault.edit("x", "V1", 5);
    await sync(graph, vault); // baseline: both sides at V1

    drive.put("x.md", "Remote edit"); // another device changes it
    vault.edit("x", "Local edit", 10); // this device also changes it

    const r = await sync(graph, vault);
    expect(r.conflicts).toMatchObject([{ noteId: "x", reason: "both-changed", localUpdatedAt: 10 }]);
    expect(r.conflicts[0].remoteUpdatedAt).toBeTypeOf("number");
    expect(r.pushed).toEqual([]);
    expect(r.pulled).toEqual([]);
    expect(drive.files.get("x.md")?.content).toBe("Remote edit"); // untouched
  });

  it("a remote deletion removes the local note when there's no local edit since", async () => {
    drive.put("x.md", "Body");
    await sync(graph, vault);
    drive.del("x.md");
    const r = await sync(graph, vault);
    expect(r.pulledDeletes).toEqual(["x"]);
    expect(await vault.readNote("x")).toBeNull();
  });

  it("a local deletion removes the remote note", async () => {
    vault.edit("x", "Body", 5);
    await sync(graph, vault);
    vault.notes.delete("x"); // the phone deletes it locally
    const r = await sync(graph, vault);
    expect(r.pushedDeletes).toEqual(["x"]);
    expect(drive.files.has("x.md")).toBe(false);
  });

  it("media referenced by a pulled note is downloaded", async () => {
    drive.put("x.md", "A photo\n\n![](media/x/a.png)");
    drive.files.set("media/x/a.png", { id: "m1", content: "", cTag: "m1", time: new Date().toISOString(), ver: 0 });
    // The fake drive's content GET serves `.content` as a string; stub binary media
    // retrieval by overriding downloadMedia's path indirectly isn't needed here — the
    // engine calls adapter.downloadMedia, which does a binary fetch; the fake drive's
    // generic content handler returns text either way, which is fine for this assertion.
    const r = await sync(graph, vault);
    expect(r.pulled).toEqual(["x"]);
    expect(r.pulledMedia).toEqual(["media/x/a.png"]);
  });

  it("an audio ref AND its transcript sidecar are both pulled when both exist remotely", async () => {
    const fence = "```pensieve:audio\nmedia/x/a.m4a\n```";
    drive.put("x.md", fence);
    drive.files.set("media/x/a.m4a", { id: "m1", content: "", cTag: "m1", time: new Date().toISOString(), ver: 0 });
    drive.files.set("media/x/a.m4a.transcript.json", { id: "m2", content: "{}", cTag: "m2", time: new Date().toISOString(), ver: 0 });
    const r = await sync(graph, vault);
    expect(r.pulledMedia.sort()).toEqual(["media/x/a.m4a", "media/x/a.m4a.transcript.json"]);
  });

  it("a recording with no transcript yet pulls just the audio, no error", async () => {
    const fence = "```pensieve:audio\nmedia/x/a.m4a\n```";
    drive.put("x.md", fence);
    drive.files.set("media/x/a.m4a", { id: "m1", content: "", cTag: "m1", time: new Date().toISOString(), ver: 0 });
    const r = await sync(graph, vault);
    expect(r.pulledMedia).toEqual(["media/x/a.m4a"]);
  });

  it("a note already local & unchanged (no new delta) still backfills missing media", async () => {
    // Models the real bug: an older app version didn't recognise a ref (e.g. a
    // pensieve:image fence) so never queued it for download, even though the note itself
    // was already fully synced. A later app version that DOES recognise it must not need a
    // destructive full restore to pick up the photo — the next regular sync should backfill.
    drive.put("x.md", "A photo\n\n![](media/x/a.png)");
    drive.files.set("media/x/a.png", { id: "m1", content: "bytes", cTag: "m1", time: new Date().toISOString(), ver: 0 });
    await sync(graph, vault); // first sync: note + media both pulled normally
    vault.media.delete("media/x/a.png"); // simulate the bytes never actually having landed
    const r = await sync(graph, vault); // nothing changed remotely — no new delta for "x"
    expect(r.pulled).toEqual([]); // the note itself was NOT re-downloaded this pass
    expect(r.pulledMedia).toEqual(["media/x/a.png"]);
    expect(vault.media.has("media/x/a.png")).toBe(true);
  });

  it("local media not yet backed up is uploaded", async () => {
    vault.edit("x", "![](media/x/a.png)", 5);
    vault.putMedia("media/x/a.png", new Uint8Array([1, 2, 3]));
    const r = await sync(graph, vault);
    expect(r.pushedMedia).toEqual(["media/x/a.png"]);
    expect(drive.files.has("media/x/a.png")).toBe(true);
  });

  it("a second sync doesn't re-upload media already recorded as backed up", async () => {
    vault.edit("x", "![](media/x/a.png)", 5);
    vault.putMedia("media/x/a.png", new Uint8Array([1, 2, 3]));
    await sync(graph, vault);
    const before = drive.files.get("media/x/a.png")!.ver;
    await sync(graph, vault);
    expect(drive.files.get("media/x/a.png")!.ver).toBe(before);
  });

  it("resolveKeepLocal adopts the remote's cTag and forces the next sync to push local", async () => {
    vault.edit("x", "V1", 5);
    await sync(graph, vault);
    drive.put("x.md", "Remote edit");
    vault.edit("x", "Local edit", 10);
    await sync(graph, vault); // reports the conflict, leaves it be

    await resolveKeepLocal(graph, vault, "x");
    const r = await sync(graph, vault);
    expect(r.pushed).toEqual(["x"]);
    expect(drive.files.get("x.md")?.content).toBe("Local edit");
  });

  it("resolveKeepRemote overwrites the local copy with the remote's", async () => {
    vault.edit("x", "V1", 5);
    await sync(graph, vault);
    drive.put("x.md", "Remote edit");
    vault.edit("x", "Local edit", 10);
    await sync(graph, vault);

    await resolveKeepRemote(graph, vault, "x");
    expect(await vault.readNote("x")).toBe("Remote edit");
    // Fully in sync immediately — no pending push on the next ordinary sync.
    const r = await sync(graph, vault);
    expect(r.pushed).toEqual([]);
    expect(r.conflicts).toEqual([]);
  });

  it("restoreFromCloud makes the local vault an exact mirror, discarding local-only notes", async () => {
    vault.edit("local-only", "Never synced", 5);
    drive.put("a.md", "Remote A");
    const r = await restoreFromCloud(graph, vault);
    expect(r.pulled).toEqual(["a"]);
    expect(r.pulledDeletes).toEqual(["local-only"]);
    expect(await vault.readNote("a")).toBe("Remote A");
    expect(await vault.readNote("local-only")).toBeNull();
  });
});

describe("phone sync engine — Raw Memory records", () => {
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

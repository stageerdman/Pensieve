import { describe, it, expect, beforeEach } from "vitest";
import type { GraphClient, GraphFetchOptions } from "./graph";
import type { LocalVault, LocalNoteInfo, WriteTimes } from "./vault";
import { EMPTY_SYNC_STATE, type SyncState } from "./types";
import { sync, restoreFromCloud } from "./engine";
import {
  _resetMediaBackup,
  setMediaBackupEnabled,
  getMediaBackupState,
} from "../media";

// In-memory vault that holds both notes and media bytes (the Phase-5 additions).
class MemVault implements LocalVault {
  notes = new Map<string, { content: string; updatedAt: number }>();
  media = new Map<string, Uint8Array>();
  state: SyncState = { ...EMPTY_SYNC_STATE, notes: {}, media: {} };

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
  async listMedia() {
    return [...this.media.keys()];
  }
  async readMediaBytes(ref: string) {
    return this.media.get(ref) ?? null;
  }
  async writeMediaBytes(ref: string, bytes: Uint8Array) {
    this.media.set(ref, bytes);
  }
  edit(id: string, content: string, updatedAt: number) {
    this.notes.set(id, { content, updatedAt });
  }
}

// A fake drive holding notes (string) AND media binaries (bytes), modelling the delta
// cursor + the binary PUT/GET the adapter uses.
const ROOT = "/me/drive/root:/Pensieve";
class FakeDrive {
  notes = new Map<string, { id: string; content: string; cTag: string; time: string; ver: number }>();
  mediaFiles = new Map<string, Uint8Array>(); // keyed by ref
  rootExists = true;
  ver = 0;
  idc = 0;
  clock = 1_000_000;

  private stamp() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }
  putNote(name: string, content: string) {
    this.ver++;
    const existing = this.notes.get(name);
    this.notes.set(name, { id: existing?.id ?? `id${++this.idc}`, content, cTag: `c${this.ver}`, time: this.stamp(), ver: this.ver });
  }
  putMedia(ref: string, bytes: Uint8Array) {
    this.mediaFiles.set(ref, bytes);
  }

  // Parse a media ref out of a content path: "/me/drive/root:/Pensieve/media/n/x.png:/content".
  private mediaRefFromPath(path: string): string | null {
    const m = path.match(/:\/Pensieve\/(media\/[^:]+):\/content/);
    return m ? m[1] : null;
  }
  private noteNameFromPath(path: string): string {
    const rest = path.slice(ROOT.length + 1);
    return rest.split(":")[0].split("?")[0];
  }

  client(): GraphClient {
    const self = this;
    const resp = (status: number, body?: unknown, bytes?: Uint8Array) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body ?? "")),
      arrayBuffer: async () => (bytes ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : new ArrayBuffer(0)),
      headers: { get: () => null },
    });

    const handle = (path: string, opts: GraphFetchOptions = {}) => {
      const method = (opts.method ?? "GET").toUpperCase();
      if (path === ROOT && method === "GET") return self.rootExists ? resp(200, { id: "root" }) : resp(404);

      // Media content PUT/GET (nested path with :/content and a media/ segment).
      const mref = self.mediaRefFromPath(path);
      if (mref) {
        if (method === "PUT") {
          self.mediaFiles.set(mref, opts.body as Uint8Array);
          return resp(201, { id: `m${mref}`, name: mref, size: (opts.body as Uint8Array).byteLength });
        }
        if (method === "GET") {
          const b = self.mediaFiles.get(mref);
          return b ? resp(200, undefined, b) : resp(404);
        }
      }

      if (path.includes(":/children")) {
        const value = [...self.notes].map(([name, f]) => ({ id: f.id, name, cTag: f.cTag, lastModifiedDateTime: f.time }));
        return resp(200, { value });
      }
      if (path.includes(":/delta") || path.startsWith("https://fake/delta")) {
        const m = path.match(/[?&]v=(\d+)/);
        const since = m ? Number(m[1]) : 0;
        const value: unknown[] = [];
        for (const [name, f] of self.notes) if (f.ver > since) value.push({ id: f.id, name, cTag: f.cTag, lastModifiedDateTime: f.time });
        return resp(200, { value, "@odata.deltaLink": `https://fake/delta?v=${self.ver}` });
      }

      const name = self.noteNameFromPath(path);
      if (path.includes(":/content")) {
        if (method === "GET") {
          const f = self.notes.get(name);
          return f ? resp(200, f.content) : resp(404);
        }
        if (method === "PUT") {
          self.putNote(name, String(opts.body ?? ""));
          const f = self.notes.get(name)!;
          return resp(201, { id: f.id, name, cTag: f.cTag, lastModifiedDateTime: f.time });
        }
      }
      if (method === "GET") {
        const f = self.notes.get(name);
        return f ? resp(200, { id: f.id, name, cTag: f.cTag, lastModifiedDateTime: f.time }) : resp(404);
      }
      return resp(500, `unhandled ${method} ${path}`);
    };

    return {
      fetch: async (path, opts) => handle(path, opts) as unknown as Response,
      json: async <T>(path: string, opts?: GraphFetchOptions) => (await handle(path, opts).json()) as T,
    };
  }
}

const REF = "media/x/pic.png";
const NOTE = `# Trip\n\n![a cliff](${REF})\n`;

describe("sync engine — media backup", () => {
  let vault: MemVault;
  let drive: FakeDrive;
  let graph: GraphClient;

  beforeEach(() => {
    _resetMediaBackup();
    setMediaBackupEnabled(true);
    vault = new MemVault();
    drive = new FakeDrive();
    graph = drive.client();
  });

  it("uploads local media alongside the note and records the backup state", async () => {
    vault.edit("x", NOTE, 5);
    vault.media.set(REF, new Uint8Array([10, 20, 30]));

    const r = await sync(graph, vault);

    expect(r.pushed).toEqual(["x"]);
    expect(r.pushedMedia).toEqual([REF]);
    // The binary reached the remote, byte-for-byte.
    expect([...(drive.mediaFiles.get(REF) as Uint8Array)]).toEqual([10, 20, 30]);
    // SyncState recorded it as backed up, and the rune store reflects that.
    expect(vault.state.media?.[REF]?.backedUp).toBe(true);
    expect(vault.state.media?.[REF]?.remoteId).toBeTruthy();
    expect(getMediaBackupState(REF)).toBe("backed-up");
  });

  it("does not re-upload an already-backed-up media file on the next sync", async () => {
    vault.edit("x", NOTE, 5);
    vault.media.set(REF, new Uint8Array([1, 2, 3]));
    await sync(graph, vault);
    const uploads: string[] = [];
    // Count PUTs to the media path on the second run.
    const spyGraph: GraphClient = {
      fetch: async (path, opts) => {
        if (path.includes("/media/") && (opts?.method ?? "GET").toUpperCase() === "PUT") uploads.push(path);
        return graph.fetch(path, opts);
      },
      json: graph.json,
    };
    const r2 = await sync(spyGraph, vault);
    expect(r2.pushedMedia).toEqual([]);
    expect(uploads).toEqual([]);
  });

  it("marks a media file failed (and keeps going) when its upload errors", async () => {
    vault.edit("x", NOTE, 5);
    vault.media.set(REF, new Uint8Array([1]));
    const brokenGraph: GraphClient = {
      fetch: async (path, opts) => {
        if (path.includes("/media/") && (opts?.method ?? "GET").toUpperCase() === "PUT") {
          return { ok: false, status: 500, json: async () => ({}), text: async () => "boom", arrayBuffer: async () => new ArrayBuffer(0), headers: { get: () => null } } as unknown as Response;
        }
        return graph.fetch(path, opts);
      },
      json: graph.json,
    };
    const r = await sync(brokenGraph, vault);
    // The note still synced; the media is flagged failed (auto-retried next time).
    expect(r.pushed).toEqual(["x"]);
    expect(r.pushedMedia).toEqual([]);
    expect(vault.state.media?.[REF]?.backedUp).toBe(false);
    expect(vault.state.media?.[REF]?.failedAt).toBeGreaterThan(0);
    expect(getMediaBackupState(REF)).toBe("failed");
  });

  it("pulls the media a freshly-pulled note references (second-machine rehydration)", async () => {
    // Remote already has the note + its binary; the local vault is empty.
    drive.putNote("x.md", NOTE);
    drive.putMedia(REF, new Uint8Array([7, 7, 7]));

    const r = await sync(graph, vault);

    expect(r.pulled).toEqual(["x"]);
    expect(r.pulledMedia).toEqual([REF]);
    expect([...(vault.media.get(REF) as Uint8Array)]).toEqual([7, 7, 7]);
    expect(vault.state.media?.[REF]?.backedUp).toBe(true);
    expect(getMediaBackupState(REF)).toBe("backed-up");
  });

  it("restoreFromCloud rehydrates referenced media into a fresh vault", async () => {
    drive.putNote("x.md", NOTE);
    drive.putMedia(REF, new Uint8Array([3, 1, 4, 1, 5]));

    const r = await restoreFromCloud(graph, vault);

    expect(r.pulled).toEqual(["x"]);
    expect(r.pulledMedia).toEqual([REF]);
    expect([...(vault.media.get(REF) as Uint8Array)]).toEqual([3, 1, 4, 1, 5]);
    expect(vault.state.media?.[REF]?.backedUp).toBe(true);
  });
});

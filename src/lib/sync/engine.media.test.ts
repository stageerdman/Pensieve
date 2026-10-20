import { describe, it, expect, beforeEach } from "vitest";
import type { GraphClient, GraphFetchOptions } from "./graph";
import type { LocalVault, LocalNoteInfo, WriteTimes } from "./vault";
import { EMPTY_SYNC_STATE, type SyncState } from "./types";
import { sync, restoreFromCloud } from "./engine";
import { createMediaUploadSession, LARGE_MEDIA_THRESHOLD } from "./adapter";
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
  async mediaSize(ref: string) {
    return this.media.get(ref)?.byteLength ?? null;
  }
  edit(id: string, content: string, updatedAt: number) {
    this.notes.set(id, { content, updatedAt });
  }
}

// A MemVault that also implements the optional native-only streaming capabilities —
// standing in for what the real Rust commands do (read/write the local bytes, talk to
// the "drive" directly) so the engine's large-media routing is exercised end to end
// without any real native layer. Only present here; the plain MemVault above keeps
// every other test on the whole-buffer path, same as before this update.
class LargeMemVault extends MemVault {
  constructor(private drive: FakeDrive) {
    super();
  }
  async uploadMediaStream(ref: string, uploadUrl: string, resumeFrom: number): Promise<{ remoteId: string }> {
    const bytes = this.media.get(ref);
    if (!bytes) throw new Error(`media vanished before upload: ${ref}`);
    const remoteId = this.drive.completeUploadSession(uploadUrl, ref, bytes.subarray(resumeFrom));
    return { remoteId };
  }
  async downloadMediaStream(ref: string, _contentUrl: string, _token: string, expectedSize: number): Promise<void> {
    const bytes = this.drive.mediaFiles.get(ref);
    if (!bytes || bytes.byteLength !== expectedSize) {
      throw new Error(`large download size mismatch for ${ref}`);
    }
    this.media.set(ref, bytes);
  }
}

// A fake drive holding notes (string) AND media binaries (bytes), modelling the delta
// cursor + the binary PUT/GET the adapter uses.
const ROOT = "/me/drive/root:/Pensieve";
class FakeDrive {
  notes = new Map<string, { id: string; content: string; cTag: string; time: string; ver: number }>();
  mediaFiles = new Map<string, Uint8Array>(); // keyed by ref
  // Resumable upload sessions, modelling Graph's server-side "how much have you
  // actually got" tracking — the whole point of the resume design under test.
  uploadSessions = new Map<string, { ref: string; received: number }>();
  rootExists = true;
  ver = 0;
  idc = 0;
  sid = 0;
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

  /** Simulate what the native uploader really does: PUT the remaining bytes to an
   *  open session and finish it. Merges onto whatever the session already had
   *  "received" (set directly in a test to model an interrupted prior attempt). */
  completeUploadSession(uploadUrl: string, ref: string, remaining: Uint8Array): string {
    const sess = this.uploadSessions.get(uploadUrl);
    if (!sess) throw new Error(`no such upload session: ${uploadUrl}`);
    const existing = this.mediaFiles.get(ref) ?? new Uint8Array(0);
    const merged = new Uint8Array(sess.received + remaining.length);
    merged.set(existing.subarray(0, sess.received), 0);
    merged.set(remaining, sess.received);
    this.mediaFiles.set(ref, merged);
    this.uploadSessions.delete(uploadUrl); // Graph discards a completed session
    return `large-${ref}`;
  }

  // Parse a media ref out of a content path: "/me/drive/root:/Pensieve/media/n/x.png:/content".
  private mediaRefFromPath(path: string): string | null {
    const m = path.match(/:\/Pensieve\/(media\/[^:]+):\/content/);
    return m ? m[1] : null;
  }
  // Parse a media ref out of a plain metadata path (no :/content): mediaMeta()'s probe.
  private mediaMetaRefFromPath(path: string): string | null {
    const m = path.match(/:\/Pensieve\/(media\/[^:?]+)(\?|$)/);
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

      // An upload session's own (absolute, skipAuth) URL — queryUploadSession's probe.
      if (path.startsWith("https://fake-upload/")) {
        const sess = self.uploadSessions.get(path);
        if (method === "GET") {
          return sess ? resp(200, { nextExpectedRanges: [`${sess.received}-`] }) : resp(404);
        }
      }

      // createMediaUploadSession.
      if (method === "POST" && path.includes(":/createUploadSession")) {
        const ref = self.mediaMetaRefFromPath(path.replace(":/createUploadSession", ""));
        const url = `https://fake-upload/sess${++self.sid}`;
        self.uploadSessions.set(url, { ref: ref!, received: 0 });
        // Real wall-clock future, not the fake drive clock — engine.ts compares a
        // session's expiry against the real Date.now().
        return resp(200, { uploadUrl: url, expirationDateTime: new Date(Date.now() + 86_400_000).toISOString() });
      }

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

      // mediaMeta()'s plain id/size probe (no :/content) — checked before pulling.
      if (method === "GET") {
        const metaRef = self.mediaMetaRefFromPath(path);
        if (metaRef) {
          const b = self.mediaFiles.get(metaRef);
          return b ? resp(200, { id: `m${metaRef}`, size: b.byteLength }) : resp(404);
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
      token: async () => "fake-token",
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
      token: graph.token,
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
      token: graph.token,
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

// A deterministic non-uniform payload past LARGE_MEDIA_THRESHOLD, so a bug that drops,
// duplicates, or misorders bytes shows up as a content mismatch, not just a size one.
function bigBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = i & 0xff;
  return out;
}

describe("sync engine — large media (resumable sessions)", () => {
  let vault: LargeMemVault;
  let drive: FakeDrive;
  let graph: GraphClient;
  const BIG = LARGE_MEDIA_THRESHOLD + 1000;

  beforeEach(() => {
    _resetMediaBackup();
    setMediaBackupEnabled(true);
    drive = new FakeDrive();
    vault = new LargeMemVault(drive);
    graph = drive.client();
  });

  it("uploads a file over the threshold via a resumable session, not the simple PUT", async () => {
    const bytes = bigBytes(BIG);
    vault.edit("x", NOTE, 5);
    vault.media.set(REF, bytes);

    const r = await sync(graph, vault);

    expect(r.pushedMedia).toEqual([REF]);
    expect(drive.mediaFiles.get(REF)?.byteLength).toBe(BIG);
    expect([...drive.mediaFiles.get(REF)!]).toEqual([...bytes]);
    expect(vault.state.media?.[REF]?.backedUp).toBe(true);
    // The session is done — nothing left to resume on a future sync.
    expect(vault.state.media?.[REF]?.uploadSession).toBeUndefined();
    expect(getMediaBackupState(REF)).toBe("backed-up");
  });

  it("resumes an interrupted upload from the byte Graph already has, not from 0", async () => {
    const bytes = bigBytes(BIG);
    vault.edit("x", NOTE, 5);
    vault.media.set(REF, bytes);

    // Model a prior run that created a session, got partway through, then the app
    // was killed — exactly the checkpoint persisted via vault.writeState the moment
    // the session is created (before any bytes went out).
    const session = await createMediaUploadSession(graph, REF);
    drive.uploadSessions.get(session.uploadUrl)!.received = 12_345;
    // What Graph already has on its side for the bytes it acknowledged.
    drive.mediaFiles.set(REF, bytes.subarray(0, 12_345));
    vault.state.media![REF] = { ref: REF, backedUp: false, uploadSession: session };

    const seenResumeFrom: number[] = [];
    const realStream = vault.uploadMediaStream.bind(vault);
    vault.uploadMediaStream = async (ref, url, resumeFrom) => {
      seenResumeFrom.push(resumeFrom);
      return realStream(ref, url, resumeFrom);
    };

    const r = await sync(graph, vault);

    expect(seenResumeFrom).toEqual([12_345]); // not 0 — it picked up where Graph left off
    expect(r.pushedMedia).toEqual([REF]);
    expect([...drive.mediaFiles.get(REF)!]).toEqual([...bytes]); // still byte-correct end to end
  });

  it("a failed large upload keeps its session for the next sync instead of losing it", async () => {
    vault.edit("x", NOTE, 5);
    vault.media.set(REF, bigBytes(BIG));
    vault.uploadMediaStream = async () => {
      throw new Error("connection dropped mid-chunk");
    };

    const r = await sync(graph, vault);

    expect(r.pushedMedia).toEqual([]);
    expect(vault.state.media?.[REF]?.backedUp).toBe(false);
    expect(vault.state.media?.[REF]?.failedAt).toBeGreaterThan(0);
    expect(vault.state.media?.[REF]?.uploadSession?.uploadUrl).toBeTruthy();
    expect(getMediaBackupState(REF)).toBe("failed");
  });

  it("pulls a file over the threshold via chunked download, not the simple GET", async () => {
    const bytes = bigBytes(BIG);
    drive.putNote("x.md", NOTE);
    drive.putMedia(REF, bytes);

    const r = await sync(graph, vault);

    expect(r.pulled).toEqual(["x"]);
    expect(r.pulledMedia).toEqual([REF]);
    expect(vault.media.get(REF)?.byteLength).toBe(BIG);
    expect([...vault.media.get(REF)!]).toEqual([...bytes]);
    expect(vault.state.media?.[REF]?.backedUp).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import type { GraphClient, GraphFetchOptions } from "./graph";
import {
  createRoot,
  deleteNote,
  delta,
  downloadNote,
  listNotes,
  noteIdFromName,
  remoteName,
  remoteRootExists,
  uploadNote,
} from "./adapter";
import { ConflictError } from "./types";

// A scripted GraphClient: each call is matched to a handler by (method, path-substring).
type Handler = (path: string, opts: GraphFetchOptions) => { status: number; body?: unknown };

function fakeGraph(handlers: Handler[]): { graph: GraphClient; calls: Array<{ path: string; opts: GraphFetchOptions }> } {
  const calls: Array<{ path: string; opts: GraphFetchOptions }> = [];
  let i = 0;
  const next = (path: string, opts: GraphFetchOptions) => {
    calls.push({ path, opts });
    const h = handlers[i++];
    if (!h) throw new Error(`no handler for call ${i}: ${path}`);
    return h(path, opts);
  };
  const toResponse = (r: { status: number; body?: unknown }) => ({
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    json: async () => r.body,
    text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? "")),
    headers: { get: () => null },
  });
  const graph: GraphClient = {
    fetch: async (path, opts = {}) => toResponse(next(path, opts)) as unknown as Response,
    json: async <T>(path: string, opts: GraphFetchOptions = {}) => next(path, opts).body as T,
  };
  return { graph, calls };
}

describe("name mapping", () => {
  it("round-trips note id ↔ remote name", () => {
    expect(remoteName("abc-123")).toBe("abc-123.md");
    expect(noteIdFromName("abc-123.md")).toBe("abc-123");
    expect(noteIdFromName("abc-123.meta.json")).toBe(null);
    expect(noteIdFromName("folder")).toBe(null);
  });
});

describe("remoteRootExists", () => {
  it("is true on 200", async () => {
    const { graph } = fakeGraph([() => ({ status: 200, body: { id: "root" } })]);
    expect(await remoteRootExists(graph)).toBe(true);
  });
  it("is false on 404 (not set up on this drive)", async () => {
    const { graph } = fakeGraph([() => ({ status: 404 })]);
    expect(await remoteRootExists(graph)).toBe(false);
  });
  it("throws on any other status (a real error, not 'missing')", async () => {
    const { graph } = fakeGraph([() => ({ status: 500, body: "boom" })]);
    await expect(remoteRootExists(graph)).rejects.toThrow(/root check failed \(500\)/);
  });
});

describe("createRoot", () => {
  it("POSTs the folder under the drive root", async () => {
    const { graph, calls } = fakeGraph([() => ({ status: 201, body: { id: "root" } })]);
    await createRoot(graph);
    expect(calls[0].path).toBe("/me/drive/root/children");
    expect(calls[0].opts.method).toBe("POST");
    expect(JSON.parse(calls[0].opts.body as string).name).toBe("Pensieve");
  });
  it("treats 409 (already exists) as success", async () => {
    const { graph } = fakeGraph([() => ({ status: 409 })]);
    await expect(createRoot(graph)).resolves.toBeUndefined();
  });
});

describe("listNotes", () => {
  it("excludes folders and non-.md, and follows nextLink", async () => {
    const { graph } = fakeGraph([
      () => ({
        status: 200,
        body: {
          value: [
            { id: "1", name: "a.md", cTag: "c1" },
            { id: "2", name: "sub", folder: {} },
            { id: "3", name: "notes.meta.json" },
          ],
          "@odata.nextLink": "https://graph/next",
        },
      }),
      () => ({ status: 200, body: { value: [{ id: "4", name: "b.md", cTag: "c4" }] } }),
    ]);
    const notes = await listNotes(graph);
    expect(notes.map((n) => n.name)).toEqual(["a.md", "b.md"]);
  });
});

describe("uploadNote", () => {
  it("sends If-Match when a cTag is given", async () => {
    const { graph, calls } = fakeGraph([() => ({ status: 200, body: { id: "1", name: "n.md", cTag: "c2" } })]);
    const item = await uploadNote(graph, "n", "# hi", "c1");
    expect(item.cTag).toBe("c2");
    expect((calls[0].opts.headers as Record<string, string>)["If-Match"]).toBe("c1");
  });

  it("omits If-Match when no cTag is given", async () => {
    const { graph, calls } = fakeGraph([() => ({ status: 201, body: { id: "1", name: "n.md", cTag: "c1" } })]);
    await uploadNote(graph, "n", "# hi");
    expect((calls[0].opts.headers as Record<string, string>)["If-Match"]).toBeUndefined();
  });

  it("maps 412 to ConflictError", async () => {
    const { graph } = fakeGraph([() => ({ status: 412 })]);
    await expect(uploadNote(graph, "n", "# hi", "stale")).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("downloadNote", () => {
  it("returns null on 404", async () => {
    const { graph } = fakeGraph([() => ({ status: 404 })]);
    expect(await downloadNote(graph, "n.md")).toBe(null);
  });

  it("returns content + item when present", async () => {
    const { graph } = fakeGraph([
      () => ({ status: 200, body: { id: "1", name: "n.md", cTag: "c1" } }),
      () => ({ status: 200, body: "# body" }),
    ]);
    const res = await downloadNote(graph, "n.md");
    expect(res?.content).toBe("# body");
    expect(res?.item.cTag).toBe("c1");
  });
});

describe("deleteNote", () => {
  it("treats 404 as success", async () => {
    const { graph } = fakeGraph([() => ({ status: 404 })]);
    await expect(deleteNote(graph, "n")).resolves.toBeUndefined();
  });

  it("maps 412 to ConflictError", async () => {
    const { graph } = fakeGraph([() => ({ status: 412 })]);
    await expect(deleteNote(graph, "n", "stale")).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("delta", () => {
  it("paginates nextLink then returns the deltaLink + accumulated items", async () => {
    const { graph } = fakeGraph([
      () => ({ status: 200, body: { value: [{ id: "1", name: "a.md" }], "@odata.nextLink": "https://g/n" } }),
      () => ({ status: 200, body: { value: [{ id: "2", name: "b.md" }], "@odata.deltaLink": "https://g/delta" } }),
    ]);
    const res = await delta(graph, null);
    expect(res.items.map((i) => i.name)).toEqual(["a.md", "b.md"]);
    expect(res.deltaLink).toBe("https://g/delta");
  });
});

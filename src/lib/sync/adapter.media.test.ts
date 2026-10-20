import { describe, it, expect } from "vitest";
import type { GraphClient, GraphFetchOptions } from "./graph";
import {
  uploadMedia,
  downloadMedia,
  mediaContentType,
  mediaRefFromItem,
  createMediaUploadSession,
  queryUploadSession,
  mediaMeta,
  mediaContentUrl,
} from "./adapter";
import type { RemoteItem } from "./types";

// A tiny Graph fake that records what the adapter sent and can hand back binary responses.
// Media rides as a Uint8Array body (binaryBody) and comes back as an arrayBuffer
// (binaryResponse) — we mirror that contract here without touching the network.
function fakeGraph(opts: {
  onPut?: (path: string, body: unknown, headers: Record<string, string>) => void;
  content?: Uint8Array;
  status?: number;
}): GraphClient {
  const mk = (path: string, o: GraphFetchOptions = {}) => {
    const method = (o.method ?? "GET").toUpperCase();
    const headers = (o.headers ?? {}) as Record<string, string>;
    if (method === "PUT") {
      opts.onPut?.(path, o.body, headers);
      const item: RemoteItem = { id: "remote-id-1", name: path, cTag: "c1", size: 3 };
      return { ok: true, status: 201, json: async () => item, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
    }
    // GET content
    const status = opts.status ?? 200;
    const bytes = opts.content ?? new Uint8Array([1, 2, 3]);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({}),
      text: async () => "",
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  };
  return {
    fetch: async (path, o) => mk(path, o) as unknown as Response,
    json: async <T>(path: string, o?: GraphFetchOptions) => (await mk(path, o).json()) as T,
    token: async () => "fake-token",
  };
}

const REF = "media/note1/abc.png";

describe("media content type", () => {
  it("maps by extension, octet-stream fallback", () => {
    expect(mediaContentType("media/n/x.png")).toBe("image/png");
    expect(mediaContentType("media/n/x.jpg")).toBe("image/jpeg");
    expect(mediaContentType("media/n/x.jpeg")).toBe("image/jpeg");
    expect(mediaContentType("media/n/x.webp")).toBe("image/webp");
    expect(mediaContentType("media/n/x.heic")).toBe("image/heic");
    expect(mediaContentType("media/n/x.xyz")).toBe("application/octet-stream");
  });
});

describe("uploadMedia", () => {
  it("PUTs the binary body to the nested media path with the right content-type", async () => {
    let seen: { path: string; body: unknown; headers: Record<string, string> } | null = null;
    const graph = fakeGraph({ onPut: (path, body, headers) => (seen = { path, body, headers }) });

    const item = await uploadMedia(graph, REF, new Uint8Array([9, 8, 7]));
    expect(item.id).toBe("remote-id-1");
    expect(seen).not.toBeNull();
    const s = seen!;
    // Path is nested under the Pensieve root, content-addressed, and points at :/content.
    expect(s.path).toBe("/me/drive/root:/Pensieve/media/note1/abc.png:/content");
    expect(s.headers["Content-Type"]).toBe("image/png");
    expect(s.body).toBeInstanceOf(Uint8Array);
    expect([...(s.body as Uint8Array)]).toEqual([9, 8, 7]);
  });
});

describe("downloadMedia", () => {
  it("returns the response bytes", async () => {
    const graph = fakeGraph({ content: new Uint8Array([4, 5, 6, 7]) });
    const bytes = await downloadMedia(graph, REF);
    expect(bytes).not.toBeNull();
    expect([...bytes!]).toEqual([4, 5, 6, 7]);
  });

  it("returns null on a 404 (not on the remote)", async () => {
    const graph = fakeGraph({ status: 404 });
    expect(await downloadMedia(graph, REF)).toBeNull();
  });
});

describe("mediaRefFromItem", () => {
  it("recognises a media binary from its parent path + name", () => {
    const item: RemoteItem = {
      id: "x",
      name: "abc.png",
      parentReference: { path: "/drive/root:/Pensieve/media/note1" },
    };
    expect(mediaRefFromItem(item)).toBe("media/note1/abc.png");
  });

  it("does NOT treat a note .md at the root as media", () => {
    const item: RemoteItem = {
      id: "x",
      name: "note1.md",
      parentReference: { path: "/drive/root:/Pensieve" },
    };
    expect(mediaRefFromItem(item)).toBeNull();
  });

  it("ignores folders and items outside the Pensieve root", () => {
    expect(mediaRefFromItem({ id: "x", name: "media", folder: {}, parentReference: { path: "/drive/root:/Pensieve" } })).toBeNull();
    expect(mediaRefFromItem({ id: "x", name: "abc.png", parentReference: { path: "/drive/root:/Other/media/n" } })).toBeNull();
  });
});

describe("createMediaUploadSession", () => {
  it("POSTs to createUploadSession with a replace conflict behavior", async () => {
    let seen: { path: string; method: string; headers: Record<string, string>; body: string } | null = null;
    const graph: GraphClient = {
      fetch: async (path, o = {}) => {
        seen = {
          path,
          method: (o.method ?? "GET").toUpperCase(),
          headers: (o.headers ?? {}) as Record<string, string>,
          body: String(o.body ?? ""),
        };
        return {
          ok: true,
          status: 200,
          json: async () => ({ uploadUrl: "https://upload.example/sess1", expirationDateTime: "2099-01-01T00:00:00Z" }),
          text: async () => "",
        } as unknown as Response;
      },
      json: async <T>() => ({}) as T,
      token: async () => "fake-token",
    };

    const session = await createMediaUploadSession(graph, REF);

    expect(session.uploadUrl).toBe("https://upload.example/sess1");
    expect(seen!.method).toBe("POST");
    expect(seen!.path).toBe("/me/drive/root:/Pensieve/media/note1/abc.png:/createUploadSession");
    expect(JSON.parse(seen!.body)).toEqual({ item: { "@microsoft.graph.conflictBehavior": "replace" } });
  });

  it("throws with the status + body on failure", async () => {
    const graph: GraphClient = {
      fetch: async () =>
        ({ ok: false, status: 507, json: async () => ({}), text: async () => "no room" }) as unknown as Response,
      json: async <T>() => ({}) as T,
      token: async () => "fake-token",
    };
    await expect(createMediaUploadSession(graph, REF)).rejects.toThrow(/507/);
  });
});

describe("queryUploadSession", () => {
  function fakeSessionGraph(opts: {
    status?: number;
    nextExpectedRanges?: string[];
    onFetch?: (path: string, o: GraphFetchOptions) => void;
  }): GraphClient {
    return {
      fetch: async (path, o = {}) => {
        opts.onFetch?.(path, o);
        const status = opts.status ?? 200;
        return {
          ok: status >= 200 && status < 300,
          status,
          json: async () => ({ nextExpectedRanges: opts.nextExpectedRanges }),
          text: async () => "",
        } as unknown as Response;
      },
      json: async <T>() => ({}) as T,
      token: async () => "fake-token",
    };
  }

  it("parses the resume offset from the first expected range", async () => {
    const graph = fakeSessionGraph({ nextExpectedRanges: ["12345-"] });
    expect(await queryUploadSession(graph, "https://upload.example/sess1")).toBe(12345);
  });

  it("requests the session URL itself, absolute and without our bearer token", async () => {
    let seen: { path: string; opts: GraphFetchOptions } | null = null;
    const graph = fakeSessionGraph({
      nextExpectedRanges: ["0-"],
      onFetch: (path, opts) => (seen = { path, opts }),
    });
    await queryUploadSession(graph, "https://upload.example/sess1");
    expect(seen!.path).toBe("https://upload.example/sess1");
    expect(seen!.opts.absolute).toBe(true);
    expect(seen!.opts.skipAuth).toBe(true);
  });

  it("returns null when the session is gone (expired/completed/cancelled)", async () => {
    const graph = fakeSessionGraph({ status: 404 });
    expect(await queryUploadSession(graph, "https://upload.example/sess1")).toBeNull();
  });

  it("returns null when the response has no expected ranges", async () => {
    const graph = fakeSessionGraph({ nextExpectedRanges: [] });
    expect(await queryUploadSession(graph, "https://upload.example/sess1")).toBeNull();
  });
});

describe("mediaMeta", () => {
  it("returns id + size for an existing ref", async () => {
    const graph: GraphClient = {
      fetch: async () =>
        ({ ok: true, status: 200, json: async () => ({ id: "m1", size: 42 }), text: async () => "" }) as unknown as Response,
      json: async <T>() => ({}) as T,
      token: async () => "fake-token",
    };
    expect(await mediaMeta(graph, REF)).toEqual({ id: "m1", size: 42 });
  });

  it("returns null on 404", async () => {
    const graph: GraphClient = {
      fetch: async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => "" }) as unknown as Response,
      json: async <T>() => ({}) as T,
      token: async () => "fake-token",
    };
    expect(await mediaMeta(graph, REF)).toBeNull();
  });
});

describe("mediaContentUrl", () => {
  it("builds the absolute Graph content URL for a ref", () => {
    expect(mediaContentUrl(REF)).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/root:/Pensieve/media/note1/abc.png:/content",
    );
  });
});

// Video/audio isn't downloaded during sync (NOTION-IMPORT: imported videos can be
// hundreds of MB); the media store fetches it from OneDrive the first time it's played.
import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";
import { getMediaBytes, INLINE_MEDIA_MAX_BYTES, playbackUrlKind, putMedia, resolveAudioDataUrl, setRemoteMediaFetcher } from "./mediaStore";

describe("long recordings", () => {
  it("inline data: up to the cap, an object URL above it (a 32-min take is 62MB)", () => {
    expect(playbackUrlKind(14_700_000)).toBe("data");
    expect(playbackUrlKind(INLINE_MEDIA_MAX_BYTES)).toBe("data");
    expect(playbackUrlKind(62_000_000)).toBe("blob");
  });

  it("a long take plays from an object URL, and new bytes (a Repair) get a fresh one", async () => {
    let n = 0;
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL: () => `blob:u${++n}`, revokeObjectURL: revoke }));
    setRemoteMediaFetcher(async () => ({ bytes: new Uint8Array(INLINE_MEDIA_MAX_BYTES + 1), type: "audio/wav" }));
    const big = () => new Blob([new Uint8Array(1)], { type: "audio/wav" });
    const first = (await resolveAudioDataUrl("media/n3/long.wav")).url;
    expect(first).toBe("blob:u1");
    expect((await resolveAudioDataUrl("media/n3/long.wav")).url).toBe(first); // reused, not re-copied
    await putMedia("media/n3/long.wav", big());
    expect(revoke).toHaveBeenCalledWith(first);
    expect((await resolveAudioDataUrl("media/n3/long.wav")).url).toBe("blob:u2");
    vi.unstubAllGlobals();
    setRemoteMediaFetcher(null);
  });
});

describe("on-demand media", () => {
  it("fetches a missing ref once, keeps it, and serves it next time without the network", async () => {
    const fetcher = vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]), type: "video/mp4" }));
    setRemoteMediaFetcher(fetcher);
    const [a, b] = await Promise.all([resolveAudioDataUrl("media/n1/v.mp4"), resolveAudioDataUrl("media/n1/v.mp4")]);
    expect(a.url).toBe("data:video/mp4;base64,AQID");
    expect(b.url).toBe(a.url);
    expect(fetcher).toHaveBeenCalledTimes(1); // concurrent plays share one download
    // kept locally: served again with the network gone
    setRemoteMediaFetcher(async () => {
      throw new Error("offline");
    });
    expect((await resolveAudioDataUrl("media/n1/v.mp4")).url).toBe(a.url);
    setRemoteMediaFetcher(null);
  });

  it("the storage primitive sync uses never touches the network", async () => {
    const fetcher = vi.fn(async () => ({ bytes: new Uint8Array([9]), type: "video/mp4" }));
    setRemoteMediaFetcher(fetcher);
    expect(await getMediaBytes("media/n2/only-remote.mp4")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    setRemoteMediaFetcher(null);
  });

  it("a ref missing remotely too reports not found (and a failing fetch never throws)", async () => {
    setRemoteMediaFetcher(async () => null);
    expect((await resolveAudioDataUrl("media/n1/gone.mp4")).url).toBeNull();
    setRemoteMediaFetcher(async () => {
      throw new Error("offline");
    });
    expect((await resolveAudioDataUrl("media/n1/offline.mp4")).url).toBeNull();
    setRemoteMediaFetcher(null);
  });
});

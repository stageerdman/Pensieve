// Video/audio isn't downloaded during sync (NOTION-IMPORT: imported videos can be
// hundreds of MB); the media store fetches it from OneDrive the first time it's played.
import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";
import { getMediaBytes, resolveAudioDataUrl, setRemoteMediaFetcher } from "./mediaStore";

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

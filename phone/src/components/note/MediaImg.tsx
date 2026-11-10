// MediaImg.tsx — an <img> for a media ref that resolves from IndexedDB when the
// in-memory url cache is cold (e.g. a fresh page load, or a page pulled down by
// sync) — mediaDom.ts's attachImg does the same two-step (cachedMediaUrl first,
// resolveMediaUrl as the async fallback) for the vanilla-DOM note renderer; this is
// the React-component equivalent for Journal's two screens.

import { useEffect, useState } from "react";
import { cachedMediaUrl, resolveMediaUrl } from "../../lib/media/mediaStore";

export function MediaImg({ mediaRef, alt = "", className }: { mediaRef: string; alt?: string; className?: string }) {
  const [url, setUrl] = useState(() => cachedMediaUrl(mediaRef));

  useEffect(() => {
    const cached = cachedMediaUrl(mediaRef);
    if (cached) {
      setUrl(cached);
      return;
    }
    let alive = true;
    void resolveMediaUrl(mediaRef).then((resolved) => {
      if (alive) setUrl(resolved);
    });
    return () => {
      alive = false;
    };
  }, [mediaRef]);

  return <img src={url ?? undefined} alt={alt} className={className} draggable={false} />;
}

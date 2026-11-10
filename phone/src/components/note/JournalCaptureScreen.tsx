// JournalCaptureScreen.tsx — the Journal spell's full-screen surface: ONE continuous
// camera session (JournalCamera) with a live thumbnail strip underneath. No per-shot
// native handoff (see lib/media/journalCamera.ts) — the shutter just grabs the current
// frame; the viewfinder never closes between pages.
//
// Scope note (this build): pages are removable but not yet drag-reorderable — the owner's
// confirmed design wants reordering here, but porting real pointer-drag physics was cut
// for this pass (see the update's final report). Order is capture order until that lands.

import { useEffect, useRef, useState } from "react";
import { JournalCamera } from "../../lib/media/journalCamera";
import { addPageToBatch, removePageFromBatch, type RawMemory } from "../../lib/media/rawMemoryStore";
import { MediaImg } from "./MediaImg";
import { haptic } from "../../util";

export interface JournalCaptureScreenProps {
  batch: RawMemory;
  onChangeBatch: (b: RawMemory) => void;
  onDone: () => void;
}

export function JournalCaptureScreen({ batch, onChangeBatch, onDone }: JournalCaptureScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const camRef = useRef<JournalCamera | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const cam = new JournalCamera();
    camRef.current = cam;
    const video = videoRef.current;
    if (video) {
      cam.start(video).catch((e) => setError(e instanceof Error ? e.message : "Couldn't open the camera."));
    }
    return () => cam.stop();
  }, []);

  const shoot = async () => {
    const cam = camRef.current;
    const video = videoRef.current;
    if (!cam || !video || error) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    haptic(10);
    try {
      const blob = await cam.captureFrame(video);
      onChangeBatch(addPageToBatch(batch, blob));
    } catch {
      setError("Couldn't capture that page — try again.");
    }
  };

  const removePage = async (i: number) => {
    onChangeBatch(await removePageFromBatch(batch, i));
  };

  const n = batch.pages.length;

  return (
    <div className="ph-journal-capture" role="dialog" aria-modal="true" aria-label="Journal capture">
      <div className="ph-journal-topbar">
        <span className="ph-journal-count">{n} page{n === 1 ? "" : "s"}</span>
        <button type="button" className="ph-journal-done" disabled={n === 0} onClick={onDone}>
          Done
        </button>
      </div>

      <div className="ph-journal-viewfinder">
        {error ? (
          <p className="ph-journal-error">{error}</p>
        ) : (
          <video ref={videoRef} className="ph-journal-video" muted playsInline autoPlay />
        )}
        <div className={"ph-journal-flash" + (flash ? " show" : "")} />
      </div>

      <div className="ph-journal-shutter-row">
        <button type="button" className="ph-journal-shutter" aria-label="Capture page" onClick={() => void shoot()} disabled={!!error} />
      </div>

      <div className="ph-journal-strip">
        {n === 0 ? (
          <div className="ph-journal-strip-empty">Shot pages appear here, live</div>
        ) : (
          batch.pages.map((ref, i) => (
            <div className="ph-collection-tile ph-journal-tile" key={ref}>
              <MediaImg mediaRef={ref} />
              <button type="button" className="ph-collection-remove" aria-label="Remove page" onClick={() => void removePage(i)}>
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

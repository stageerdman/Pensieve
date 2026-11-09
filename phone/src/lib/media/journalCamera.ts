// journalCamera.ts — the continuous live-camera session the Journal spell needs.
//
// Snap and Film both hand off to the NATIVE camera via a hidden file input (`capture=
// environment`): the OS owns the UI, returns exactly one photo, done. That's single-shot
// by design — it cannot give "stay in the viewfinder, shoot every page back to back,
// watch thumbnails pile up live," which is what the owner asked for (see
// updates/2026-11-09 RAW-MEMORY-JOURNAL/wiki.md). So Journal needs a REAL in-app camera:
// getUserMedia stays open across the whole batch; each shutter tap grabs the current
// video frame onto an offscreen canvas and turns it into a JPEG blob — no native handoff,
// no re-opening anything between pages.
//
// NOT unit-testable past isCameraAvailable(): jsdom has no real camera hardware and no
// meaningful <canvas> pixel pipeline (same fundamental limit as any getUserMedia code) —
// this needs an on-device pass, flagged in the update's report rather than claimed covered.

export function isCameraAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export class JournalCamera {
  private stream: MediaStream | null = null;

  /** Opens the back camera and starts it playing into `video`. Throws if the device/
   *  browser has no camera or the owner denies permission — the caller shows that as an
   *  error state, same as any other capture spell's permission-denied path. */
  async start(video: HTMLVideoElement): Promise<void> {
    if (!isCameraAvailable()) throw new Error("No camera available on this device.");
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1920 } },
      audio: false,
    });
    video.srcObject = this.stream;
    await video.play();
  }

  /** Grabs the CURRENT frame — the whole point of staying in one session: this never
   *  touches getUserMedia again, just reads whatever the already-open stream shows right
   *  now. Returns a JPEG blob ready for rawMemoryStore.addPageToBatch. */
  async captureFrame(video: HTMLVideoElement): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 1280;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable.");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob returned null"))),
        "image/jpeg",
        0.92,
      );
    });
  }

  /** Stops every track — must be called on leaving the capture screen (Done, back nav,
   *  unmount) or the camera light stays on and the battery drains. */
  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

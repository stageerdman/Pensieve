import { useCallback } from "react";
import type { AudioController } from "../../lib/audio/controller";

// Mounts a shared controller's raw <video> element into a container div. The controller
// (lib/audio/controller) holds ONE real element per key — this just relocates it to
// whichever visual face currently needs to show its pixels (the inline block, or the
// transcript split's dock). `appendChild` on an already-playing <video> MOVES it without
// interrupting playback or resetting currentTime, so a face that loses the element simply
// shows its own poster-frame fallback underneath (see VideoBar) instead of going blank.
//
// Audio never uses this — its faces are headless (a canvas waveform driven by the
// controller's time events), so there's no element to mount.
export function useMediaSurface(controller: AudioController | null) {
  return useCallback(
    (container: HTMLDivElement | null) => {
      if (!container || !controller) return;
      const el = controller.el;
      el.className = "pensieve-video-el";
      el.setAttribute("playsinline", ""); // iOS WKWebView: no fullscreen takeover on play
      if (el.parentElement !== container) container.appendChild(el);
    },
    [controller],
  );
}

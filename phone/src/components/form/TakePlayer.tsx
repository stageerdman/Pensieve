// TakePlayer.tsx — play back the walk-through's recording on the review screen, before Done.
// The take is still open (paused), so this plays a preview WAV built from what's captured so
// far (voiceCapture.previewTake). Same shared audio controller + the same bar markup/classes as
// a memory's recording, so it looks and behaves like every other recording in the app.

import { useEffect, useState } from "react";
import { fmtTime, getController, releaseController, type AudioController } from "../../lib/media/audioController";

const PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';

export function TakePlayer({ url, label }: { url: string; label: string }) {
  const [c, setC] = useState<AudioController | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    // A data: URL, not blob: — iOS standalone PWAs refuse blob: URLs for <audio> (see wiki).
    const key = `take:${url.length}:${url.slice(-24)}`;
    const ctl = getController(key, url);
    setC(ctl);
    const offs = (["time", "play", "pause", "ended", "durationchange"] as const).map((ev) => ctl.on(ev, () => tick((n) => n + 1)));
    return () => {
      offs.forEach((off) => off());
      releaseController(key);
    };
  }, [url]);

  const dur = c && Number.isFinite(c.duration) ? c.duration : 0;
  const cur = c?.currentTime ?? 0;
  return (
    <div className="ph-media ph-audio ph-form-take" aria-label={label}>
      <div className="ph-audio-bar">
        <button
          type="button"
          className="ph-audio-play"
          aria-label={c?.playing ? "Pause" : "Play"}
          onClick={() => c?.toggle()}
          dangerouslySetInnerHTML={{ __html: c?.playing ? PAUSE : PLAY }}
        />
        <div
          className="ph-audio-track"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            c?.seekFrac((e.clientX - r.left) / r.width);
          }}
        >
          <div className="ph-audio-fill" style={{ width: dur ? `${(cur / dur) * 100}%` : "0%" }} />
        </div>
        <span className="ph-audio-time">
          {fmtTime(cur)} / {fmtTime(dur)}
        </span>
      </div>
    </div>
  );
}

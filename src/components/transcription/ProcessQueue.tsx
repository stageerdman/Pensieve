// ProcessQueue — the "Process" section inside the sync drawer. Lists untranscribed audio
// (and anything else to process later) as reusable ProcessRow units, with a global Run/Pause
// and a mode toggle (1 = top item then pause · → = run the whole queue). The whole section
// disappears when there's nothing to process. Owns the audio-preview playback (one at a time).
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { resolveMediaUrl } from "../../lib/media/url";
import type { TranscriptionEngine } from "../../lib/transcripts/engine";
import { queueItemLabel } from "../../lib/transcripts/queue";
import { ProcessRow } from "./ProcessRow";
import { useProcessQueue } from "./useProcessQueue";

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-[15px] w-[15px]">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5z" />
  </svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-[15px] w-[15px]">
    <rect x="7" y="5" width="3.4" height="14" rx="1" />
    <rect x="13.6" y="5" width="3.4" height="14" rx="1" />
  </svg>
);

export interface ProcessQueueHandle {
  /** Called by the drawer when a sync runs: scan + auto-transcribe new audio (Czech default). */
  enqueueAuto(): Promise<void>;
  refresh(): Promise<void>;
}

interface Props {
  engine: TranscriptionEngine;
  titleFor: (noteId: string) => string;
  onTranscribed?: () => void;
  enabled?: boolean;
}

export const ProcessQueue = forwardRef<ProcessQueueHandle, Props>(function ProcessQueue(
  { engine, titleFor, onTranscribed, enabled = true },
  handleRef,
) {
  const q = useProcessQueue({ engine, titleFor, onTranscribed, enabled });
  const [previewRef, setPreviewRef] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useImperativeHandle(handleRef, () => ({ enqueueAuto: q.enqueueAuto, refresh: q.refresh }), [q.enqueueAuto, q.refresh]);

  // scan once on mount so manually-added recordings appear when the drawer opens
  useEffect(() => {
    if (enabled) void q.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const togglePreview = useCallback(async (ref: string) => {
    const el = audioRef.current;
    if (!el) return;
    if (previewRef === ref) {
      el.pause();
      setPreviewRef(null);
      return;
    }
    const url = await resolveMediaUrl(ref);
    if (!url) return;
    el.src = url;
    setPreviewRef(ref);
    void el.play().catch(() => setPreviewRef(null));
  }, [previewRef]);

  if (q.count === 0) return null; // nothing to process → the section vanishes

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <audio ref={audioRef} onEnded={() => setPreviewRef(null)} className="hidden" />
      <header className="flex items-center gap-1.5 border-b border-border px-3.5 py-2.5">
        <span className="mr-auto text-sm text-text">Process</span>
        <button
          type="button"
          onClick={() => q.setMode(q.mode === "one" ? "all" : "one")}
          title={q.mode === "one" ? "Mode: one — process the top item, then pause" : "Mode: all — run down the whole queue"}
          className="grid h-7 min-w-[20px] place-items-center px-1 font-mono text-[17px] font-semibold leading-none text-text-muted hover:text-accent"
        >
          {q.mode === "one" ? "1" : "→"}
        </button>
        <button
          type="button"
          onClick={q.togglePlay}
          title={q.playing ? "Pause" : "Run"}
          className={`grid h-7 w-[34px] place-items-center rounded-md bg-accent text-surface hover:bg-accent-glow ${
            q.playing ? "shadow-[0_0_16px_-4px_hsl(var(--accent-glow))]" : ""
          }`}
        >
          {q.playing ? <PauseIcon /> : <PlayIcon />}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {q.items.map((it) => (
          <div key={it.ref} className="border-b border-border/60 last:border-b-0">
            <ProcessRow
              order={it.order}
              label={queueItemLabel(it)}
              tooltip={it.title.trim() ? `${it.title}\n${it.audioName}` : it.audioName}
              filename={!it.title.trim()}
              active={q.activeRef === it.ref}
              running={q.playing && q.activeRef === it.ref}
              pct={it.pct}
              error={it.error}
              errorMsg={it.errorMsg}
              model={it.model}
              previewing={previewRef === it.ref}
              onReorder={(pos) => q.reorder(it.ref, pos)}
              onPreview={() => void togglePreview(it.ref)}
              onSetModel={(m) => q.setModel(it.ref, m)}
            />
          </div>
        ))}
      </div>
    </section>
  );
});

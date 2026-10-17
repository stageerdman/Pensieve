import { useEffect, useState } from "react";
import { WaveformCard } from "../../audio/WaveformCard";
import { type TranscriptState } from "../../audio/AudioBar";
import { transcriptPane } from "../../audio/transcriptController";
import { refForUrl } from "../../../lib/media/url";
import { isMediaPath } from "../../../lib/media/ref";
import { getStore } from "../../../lib/store";
import type { Transcript } from "../../../lib/transcripts/types";

// The editor-side adapter that mounts a WaveformCard for an AUDIO entry inside a gallery —
// mirrors how AudioBlock wraps AudioBar. It loads the recording's transcript sidecar (for
// the card's transcript-icon state) and opens the SPLIT view on click (the card's only
// transcript affordance, per spec). Presentation + the controller live in the standalone
// WaveformCard; this just supplies note/transcript context.

interface Props {
  url: string;
  /** Unique shared-controller key for this tile (so two audio tiles don't share a playhead). */
  playerKey: string;
  caption?: string;
}

export function GalleryAudioTile({ url, playerKey, caption }: Props) {
  const ref = refForUrl(url) ?? (isMediaPath(url) ? url : null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [tState, setTState] = useState<TranscriptState>("absent");

  useEffect(() => {
    if (!ref) return;
    let alive = true;
    void getStore().loadTranscript(ref).then((t) => {
      if (alive && t) { setTranscript(t); setTState("present"); }
    });
    return () => { alive = false; };
  }, [ref]);

  const openSplit = () => {
    if (transcript) transcriptPane.open({ src: url, playerKey, transcript, title: caption || undefined });
  };

  return (
    <WaveformCard
      src={url}
      playerKey={playerKey}
      peaksSrc={url}
      transcriptState={tState}
      onOpenSplit={openSplit}
    />
  );
}

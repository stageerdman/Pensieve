import { useEffect, useState } from "react";
import { WaveformCard } from "../../audio/WaveformCard";
import { type TranscriptState } from "../../audio/AudioBar";
import { transcriptPane } from "../../audio/transcriptController";
import { refForUrl } from "../../../lib/media/url";
import { isMediaPath, parseMediaPath } from "../../../lib/media/ref";
import { getStore } from "../../../lib/store";
import { getMediaNoteId } from "./mediaContext";
import { reindex } from "../../../lib/search/reindexController";
import type { Transcript } from "../../../lib/transcripts/types";
import { log } from "../../../lib/logger";

// The editor-side adapter that mounts a WaveformCard for an AUDIO entry inside a gallery —
// mirrors how AudioBlock wraps AudioBar. It owns the note/transcript context the standalone
// card can't know: loads the recording's transcript sidecar (for the icon state), opens the
// SPLIT on the transcript icon, and offers Create/Regenerate transcript + Download in the ⋯
// menu (the gallery card has no inline reader — transcript always opens in the split).

interface Props {
  url: string;
  /** Unique shared-controller key for this tile (so two audio tiles don't share a playhead). */
  playerKey: string;
  caption?: string;
}

function audioFilename(urlOrRef: string): string {
  const ref = refForUrl(urlOrRef) ?? urlOrRef;
  const parsed = parseMediaPath(ref);
  return parsed ? `${parsed.mediaId}.${parsed.ext}` : "recording";
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

  // DEV PLACEHOLDER (same as AudioBlock): seed the bundled sample until the whisper engine
  // lands; then swap for the real engine + delete the sample json.
  const createTranscript = async () => {
    if (!ref) return;
    setTState("transcribing");
    try {
      const sample = ((await import("../../../lib/transcripts/_sampleDominik.dev.json")).default) as unknown as Transcript;
      await getStore().saveTranscript(ref, sample);
      setTranscript(sample);
      setTState("present");
      reindex.request(getMediaNoteId()); // sidecar doesn't touch the .md — refold search now
      log.info("media", "gallery.audio.transcript.seeded(dev)", { ref });
    } catch (e) {
      log.error("media", "gallery.audio.transcript.seed.error", { ref, error: String(e) });
      setTState("absent");
    }
  };

  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = audioFilename(url);
    document.body.appendChild(a);
    a.click();
    a.remove();
    log.info("media", "gallery.audio.download", { filename: audioFilename(url) });
  };

  return (
    <WaveformCard
      src={url}
      playerKey={playerKey}
      peaksSrc={url}
      transcriptState={tState}
      onOpenSplit={openSplit}
      onCreateTranscript={createTranscript}
      onRegenerateTranscript={createTranscript}
      onDownload={download}
    />
  );
}

import { useEffect, useRef, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { AudioBar, type TranscriptState } from "../../audio/AudioBar";
import { TranscriptView } from "../../audio/TranscriptView";
import { transcriptPane } from "../../audio/transcriptController";
import { isMediaPath, parseMediaPath } from "../../../lib/media/ref";
import { refForUrl } from "../../../lib/media/url";
import { getMediaNoteId } from "./mediaContext";
import { saveAudioFile } from "./insertAudio";
import { getStore } from "../../../lib/store";
import type { Transcript } from "../../../lib/transcripts/types";
import { log } from "../../../lib/logger";

// The BlockNote adapter for audio — a THIN wrapper mounting the standalone AudioBar
// (src/components/audio). Round-trips to .md via a pensieve:audio fence (lib/md/audio);
// the transcript is a sidecar loaded via the store, opened either as the desktop SPLIT
// pane (transcriptPane) or the inline DROPDOWN reader (local, expands below the bar).

function audioFilename(urlOrRef: string): string {
  const ref = refForUrl(urlOrRef) ?? urlOrRef;
  const parsed = parseMediaPath(ref);
  return parsed ? `${parsed.mediaId}.${parsed.ext}` : "recording";
}

interface BlockEditor {
  removeBlocks: (ids: string[]) => void;
  updateBlock: (id: string, update: { props: Record<string, unknown> }) => void;
}

const READER_MIN = 140;
const READER_MAX = 640;

function AudioRender({ block, editor }: { block: { id: string; props: Record<string, unknown> }; editor: BlockEditor }) {
  const url = (block.props.url as string) || "";
  const caption = (block.props.caption as string) || "";
  const status = (block.props.status as string) || "";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ref = refForUrl(url) ?? (isMediaPath(url) ? url : null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [tState, setTState] = useState<TranscriptState>("absent");
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerH, setReaderH] = useState(300);
  const readerDrag = useRef<{ y: number; h: number } | null>(null);

  // Load the sidecar transcript (if present) → drives the icon state + the views.
  useEffect(() => {
    if (!ref) return;
    let alive = true;
    void getStore().loadTranscript(ref).then((t) => {
      if (alive && t) { setTranscript(t); setTState("present"); }
    });
    return () => { alive = false; };
  }, [ref]);

  const choose = async (file: File) => {
    editor.updateBlock(block.id, { props: { status: "saving" } });
    try {
      const { url: saved, ref: savedRef } = await saveAudioFile(getMediaNoteId(), file);
      editor.updateBlock(block.id, { props: { url: saved ?? savedRef, status: "" } });
    } catch (e) {
      log.error("media", "audio.choose.error", { id: block.id, error: String(e) });
      editor.updateBlock(block.id, { props: { status: "" } });
    }
  };

  // DEV PLACEHOLDER until the whisper engine lands: "Create transcript" seeds the bundled
  // real-call sample as the sidecar so the transcript UX is testable now. The real engine
  // replaces this with actual output (same schema) — then delete this + the sample json.
  const createTranscript = async () => {
    if (!ref) return;
    setTState("transcribing");
    try {
      const sample = ((await import("../../../lib/transcripts/_sampleDominik.dev.json")).default) as unknown as Transcript;
      await getStore().saveTranscript(ref, sample);
      setTranscript(sample);
      setTState("present");
      log.info("media", "audio.transcript.seeded(dev)", { ref });
    } catch (e) {
      log.error("media", "audio.transcript.seed.error", { ref, error: String(e) });
      setTState("absent");
    }
  };

  const openSplit = () => {
    if (transcript) transcriptPane.open({ src: url, transcript, title: caption || audioFilename(url) });
  };
  const openReader = () => { if (transcript) setReaderOpen(true); };

  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = audioFilename(url);
    document.body.appendChild(a);
    a.click();
    a.remove();
    log.info("media", "audio.download", { filename: audioFilename(url) });
  };

  // ── empty (new block): file picker ──
  if (!url && status !== "saving") {
    return (
      <div className="pensieve-audio-blockwrap">
        <button type="button" className="pensieve-audio-empty" onClick={() => fileInputRef.current?.click()}>
          <span className="pensieve-audio-empty-glyph">♪</span>
          <span>Choose an audio file…</span>
        </button>
        <input ref={fileInputRef} type="file" accept="audio/*" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void choose(f); e.target.value = ""; }} />
      </div>
    );
  }

  if (status === "saving") {
    return (
      <div className="pensieve-audio-blockwrap">
        <div className="pensieve-audio-empty is-saving">
          <span className="pensieve-audio-empty-glyph">♪</span><span>Saving recording…</span>
        </div>
      </div>
    );
  }

  const broken = isMediaPath(url);
  const filename = audioFilename(url);

  return (
    <div className="pensieve-audio-blockwrap" data-broken={broken || undefined}>
      <AudioBar
        src={url}
        filename={filename}
        broken={broken}
        transcriptState={tState}
        onDownload={download}
        onCreateTranscript={createTranscript}
        onRegenerateTranscript={createTranscript}
        onOpenSplit={openSplit}
        onOpenReader={openReader}
        onRemove={() => editor.removeBlocks([block.id])}
        onLocate={() => log.info("media", "audio.locate.requested", { filename })}
      />
      {caption && !broken && <div className="pensieve-audio-caption">{caption}</div>}

      {/* Inline "Dropdown Transcript" reader — expands the transcript below the bar, in place. */}
      {readerOpen && transcript && (
        <div className="pensieve-audio-reader" style={{ height: readerH }}>
          <div className="pensieve-audio-reader-head">
            <span>Transcript</span>
            <button type="button" className="pensieve-audio-iconbtn" aria-label="Collapse transcript"
              title="Collapse transcript" onClick={() => setReaderOpen(false)}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 15 6-6 6 6" />
              </svg>
            </button>
          </div>
          <TranscriptView src={url} transcript={transcript} className="pensieve-audio-reader-body" />
          <div
            className="pensieve-audio-reader-grip"
            role="separator"
            aria-orientation="horizontal"
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); readerDrag.current = { y: e.clientY, h: readerH }; }}
            onPointerMove={(e) => {
              if (!readerDrag.current) return;
              const h = readerDrag.current.h + (e.clientY - readerDrag.current.y);
              setReaderH(Math.max(READER_MIN, Math.min(READER_MAX, h)));
            }}
            onPointerUp={() => (readerDrag.current = null)}
          />
        </div>
      )}
    </div>
  );
}

export const AudioBlock = createReactBlockSpec(
  {
    type: "audio",
    content: "none",
    propSchema: {
      url: { default: "" },
      caption: { default: "" },
      status: { default: "" },
      filename: { default: "" },
    },
  },
  {
    render: (props) => <AudioRender block={props.block as never} editor={props.editor as never} />,
  },
)();

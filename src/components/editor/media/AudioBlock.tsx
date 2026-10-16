import { useRef } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { AudioBar } from "../../audio/AudioBar";
import { isMediaPath, parseMediaPath } from "../../../lib/media/ref";
import { refForUrl } from "../../../lib/media/url";
import { getMediaNoteId } from "./mediaContext";
import { saveAudioFile } from "./insertAudio";
import { log } from "../../../lib/logger";

// The BlockNote adapter for audio — a THIN wrapper that mounts the standalone AudioBar
// (src/components/audio). All playback/waveform/menu behaviour lives in that portable
// element; this file only bridges BlockNote props ↔ the bar and handles editor-scoped
// actions (download, remove). Round-trips to `.md` via a pensieve:audio fence (lib/md/audio).
//
// Registered in editorSchema.ts. createReactBlockSpec(...) returns a creator that MUST be
// called () at registration (the image-block gotcha).

/** The on-disk filename (`<mediaId>.<ext>`) for an audio url/ref — for Download + broken. */
function audioFilename(urlOrRef: string): string {
  const ref = refForUrl(urlOrRef) ?? urlOrRef;
  const parsed = parseMediaPath(ref);
  return parsed ? `${parsed.mediaId}.${parsed.ext}` : "recording";
}

interface BlockEditor {
  removeBlocks: (ids: string[]) => void;
  updateBlock: (id: string, update: { props: Record<string, unknown> }) => void;
}

function AudioRender({ block, editor }: { block: { id: string; props: Record<string, unknown> }; editor: BlockEditor }) {
  const url = (block.props.url as string) || "";
  const caption = (block.props.caption as string) || "";
  const status = (block.props.status as string) || "";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const choose = async (file: File) => {
    editor.updateBlock(block.id, { props: { status: "saving" } });
    try {
      const { url: saved, ref } = await saveAudioFile(getMediaNoteId(), file);
      editor.updateBlock(block.id, { props: { url: saved ?? ref, status: "" } });
    } catch (e) {
      log.error("media", "audio.choose.error", { id: block.id, error: String(e) });
      editor.updateBlock(block.id, { props: { status: "" } });
    }
  };

  // Empty (brand-new block): a calm placeholder that opens a file picker (recording = P4).
  if (!url && status !== "saving") {
    return (
      <div className="pensieve-audio-blockwrap">
        <button
          type="button"
          className="pensieve-audio-empty"
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="pensieve-audio-empty-glyph">♪</span>
          <span>Choose an audio file…</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void choose(f);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  if (status === "saving") {
    return (
      <div className="pensieve-audio-blockwrap">
        <div className="pensieve-audio-empty is-saving">
          <span className="pensieve-audio-empty-glyph">♪</span>
          <span>Saving recording…</span>
        </div>
      </div>
    );
  }

  // An unresolved media ref (resolveMediaUrl kept the ref → file missing) = broken.
  const broken = isMediaPath(url);
  const filename = audioFilename(url);

  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    log.info("media", "audio.download", { filename });
  };

  return (
    <div className="pensieve-audio-blockwrap" data-broken={broken || undefined}>
      <AudioBar
        src={url}
        filename={filename}
        broken={broken}
        transcriptState="absent" /* P4/P5 wire real sidecar presence + open */
        onDownload={download}
        onCreateTranscript={() => {
          // Transcription engine is out of scope this update — the trigger exists; log it.
          log.info("media", "audio.createTranscript.requested", { filename });
        }}
        onRemove={() => editor.removeBlocks([block.id])}
        onLocate={() => log.info("media", "audio.locate.requested", { filename })}
      />
      {caption && !broken && <div className="pensieve-audio-caption">{caption}</div>}
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
      // Transient, never serialized (lib/md/audio reads only url + caption):
      status: { default: "" }, // "" | "saving"
      filename: { default: "" },
    },
  },
  {
    render: (props) => <AudioRender block={props.block as never} editor={props.editor as never} />,
  },
)();

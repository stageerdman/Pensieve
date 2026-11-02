import { createReactBlockSpec, useSelectedBlocks } from "@blocknote/react";
import { useEffect, useRef, useState } from "react";
import { MediaBlock, type MediaState } from "./MediaBlock";
import {
  DEFAULT_WIDTH, snapWidth, stepWidth, presetWidth, widthPreset, type SizePreset,
} from "./mediaShape";
import { runResizeDrag, useResizeHandle } from "./mediaResize";
import { getMediaNoteId } from "./mediaContext";
import { persistVideoIntoBlock, type InsertEditor } from "./insertVideo";
import { isMediaPath, parseMediaPath } from "../../../lib/media/ref";
import { refForUrl } from "../../../lib/media/url";
import { getStore } from "../../../lib/store";
import { VideoBar } from "../../video/VideoBar";
import { transcriptPane } from "../../audio/transcriptController";
import { processQueue } from "../../transcription/processQueueController";
import { chooseTranscriptionModel } from "../../transcription/chooseModel";
import { VideoIcon, MoreHorizontal, Trash as TrashIcon } from "../../icons";
import type { Transcript } from "../../../lib/transcripts/types";
import { log } from "../../../lib/logger";

// The custom `video` block — behaves like Image for capture/sizing (an empty placeholder
// you fill by upload/drop, a resizable WIDTH reusing the same shared MediaBlock frame —
// but no corner-reshape/crop/pan: cropping every frame of a clip isn't "cropping one
// photo," so a video's box always keeps its own natural aspect), and like Audio for
// everything past that (the same shared playback engine, the same transcript sidecar +
// Split/Create/Regenerate flow, the same one-insert-funnel + broken/missing state). No
// recording control here — desktop capture has never meant "record with this device" for
// any media kind (see video-capture-design.html).

interface Props {
  url: string;
  caption: string;
  width: number;
  status: string;
}
interface RenderProps {
  block: { id: string; props: Props };
  editor: InsertEditor & { isEditable: boolean; removeBlocks?: (ids: string[]) => void };
}

function videoFilename(urlOrRef: string): string {
  const ref = refForUrl(urlOrRef) ?? urlOrRef;
  const parsed = parseMediaPath(ref);
  return parsed ? `${parsed.mediaId}.${parsed.ext}` : "video";
}

function VideoRender({ block, editor }: RenderProps) {
  const { url, caption, width, status } = block.props;
  const editable = editor.isEditable;
  const selectedBlocks = useSelectedBlocks(editor as never);
  const selected = editable && selectedBlocks.length === 1 && selectedBlocks[0].id === block.id;

  const [focused, setFocused] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [popover, setPopover] = useState<null | "menu">(null);
  const [dragOver, setDragOver] = useState(false);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [tState, setTState] = useState<"absent" | "transcribing" | "present">("absent");

  const frameRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const ref = refForUrl(url) ?? (isMediaPath(url) ? url : null);

  useEffect(() => setImgError(false), [url]);
  useEffect(() => {
    if (!selected) setPopover(null);
  }, [selected]);

  // Load the sidecar transcript (if present) — same ref convention as audio.
  useEffect(() => {
    if (!ref) return;
    let alive = true;
    void getStore().loadTranscript(ref).then((t) => {
      if (alive && t) { setTranscript(t); setTState("present"); }
    });
    return () => { alive = false; };
  }, [ref]);

  const update = (props: Partial<Props>) => editor.updateBlock(block.id, { props });
  const removeSelf = () => {
    editor.updateBlock(block.id, { type: "paragraph", props: {} } as never);
    log.info("media", "video.block.remove", { id: block.id });
  };

  const state: MediaState = imgError
    ? "broken"
    : status === "saving"
      ? "saving"
      : url
        ? "loaded"
        : "empty";

  // Fill this (empty) block from a chosen/dropped file — always single-file (there is no
  // "video gallery" concept; a multi-file drop just fills from the first).
  const fillFromFile = (file: File) => {
    void persistVideoIntoBlock(editor, getMediaNoteId(), file, block.id);
    setPopover(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!editable) return;
    if ((e.metaKey || e.ctrlKey) && (e.key === "[" || e.key === "]")) {
      e.preventDefault();
      update({ width: stepWidth(width || DEFAULT_WIDTH, e.key === "]" ? 1 : -1) });
    } else if ((e.key === "Backspace" || e.key === "Delete") && state === "empty") {
      e.preventDefault();
      removeSelf();
    }
  };

  const resizeHandleRef = useResizeHandle(() => {
    const media = frameRef.current?.querySelector<HTMLElement>(".pensieve-media");
    const column = media?.parentElement;
    if (!media || !column) return;
    const left = media.getBoundingClientRect().left;
    const colWidth = column.clientWidth || 1;
    log.debug("media", "video.resize.start", { id: block.id });
    runResizeDrag((cx) => update({ width: snapWidth(Math.min(1, Math.max(0.15, (cx - left) / colWidth))) }));
  });

  const setPreset = (p: SizePreset) => {
    update({ width: presetWidth(p) });
    setPopover(null);
  };
  const activePreset = widthPreset(width || DEFAULT_WIDTH);

  const openSplit = () => {
    if (transcript) transcriptPane.open({ src: url, playerKey: block.id, transcript, title: caption || undefined, kind: "video" });
  };

  const createTranscript = async () => {
    if (!ref) return;
    const model = await chooseTranscriptionModel();
    if (!model) return;
    const prev = tState;
    setTState("transcribing");
    const off = processQueue.onResult(ref, (ok) => {
      off();
      if (!ok) return setTState(prev);
      void getStore().loadTranscript(ref).then((t) => {
        if (t) { setTranscript(t); setTState("present"); } else setTState(prev);
      });
    });
    const handled = processQueue.request({ ref, noteId: getMediaNoteId(), model });
    if (!handled) {
      off();
      setTState(prev);
      log.error("media", "video.transcript.noqueue", { ref });
    } else {
      log.info("media", "video.transcript.requested", { ref, model });
    }
  };

  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = videoFilename(url);
    document.body.appendChild(a);
    a.click();
    a.remove();
    log.info("media", "video.download", { filename: videoFilename(url) });
  };

  const showControls = editable && (selected || focused) && state !== "broken";

  return (
    <div
      ref={frameRef}
      className={"pensieve-media-host" + (dragOver ? " is-dragover" : "")}
      contentEditable={false}
      tabIndex={editable ? 0 : -1}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false); }}
      onDragOver={editable && state === "empty" ? (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); } : undefined}
      onDragLeave={() => setDragOver(false)}
      onDrop={
        editable && state === "empty"
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
              const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("video/"));
              if (file) fillFromFile(file);
            }
          : undefined
      }
    >
      <MediaBlock
        url={url}
        alt={caption}
        width={width || DEFAULT_WIDTH}
        state={state}
        filename={videoFilename(url)}
        missingLabel="Video missing"
        selected={selected}
        focused={focused}
        onImgError={() => setImgError(true)}
        onLocate={editable ? () => fileRef.current?.click() : undefined}
        media={
          state === "loaded" || state === "saving" ? (
            <VideoBar
              src={url}
              playerKey={block.id}
              filename={videoFilename(url)}
              transcriptState={tState}
              onDownload={download}
              onCreateTranscript={createTranscript}
              onRegenerateTranscript={createTranscript}
              onOpenSplit={openSplit}
              onRemove={() => editor.removeBlocks?.([block.id])}
            />
          ) : undefined
        }
        placeholder={
          <button type="button" className="pensieve-media-add" onClick={() => fileRef.current?.click()}>
            <VideoIcon size={22} />
            <span>Add a video</span>
          </button>
        }
        overlay={
          showControls ? (
            <>
              <div className="pensieve-media-resize" ref={resizeHandleRef} aria-label="Resize width" />
              {state !== "empty" && (
                <div className="pensieve-media-tools" contentEditable={false}>
                  <button type="button" className="pensieve-media-tool-icon" title="Size" aria-label="Size" onClick={() => setPopover((p) => (p === "menu" ? null : "menu"))}>
                    <MoreHorizontal size={15} />
                  </button>
                  <button type="button" className="pensieve-media-tool-icon" title="Remove" aria-label="Remove" onClick={removeSelf}>
                    <TrashIcon size={15} />
                  </button>
                </div>
              )}
              {popover === "menu" && (
                <>
                  <div className="pensieve-media-popover-backdrop" onPointerDown={() => setPopover(null)} />
                  <div className="pensieve-media-menu" role="menu">
                    <div className="pensieve-media-menu-label">Size</div>
                    {(["small", "medium", "large", "full"] as SizePreset[]).map((p) => (
                      <button key={p} type="button" role="menuitem" className={activePreset === p ? "is-active" : ""} onClick={() => setPreset(p)}>
                        {p[0].toUpperCase() + p.slice(1)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : null
        }
        caption={
          editable && selected && state === "loaded" ? (
            <input
              ref={captionRef}
              className="pensieve-media-caption-input"
              value={caption}
              placeholder="Add a caption…"
              onChange={(e) => update({ caption: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); frameRef.current?.focus(); }
              }}
            />
          ) : caption && state === "loaded" ? (
            <div className="pensieve-media-caption">{caption}</div>
          ) : null
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) fillFromFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export const VideoBlock = createReactBlockSpec(
  {
    type: "video",
    content: "none",
    propSchema: {
      url: { default: "" },
      caption: { default: "" },
      width: { default: DEFAULT_WIDTH, type: "number" },
      status: { default: "" },
    },
  },
  {
    render: (props) => <VideoRender block={props.block as never} editor={props.editor as never} />,
  },
)();

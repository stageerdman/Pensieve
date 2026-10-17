import { type KeyboardEvent, type PointerEvent } from "react";
import type { GalleryImage } from "../../../../lib/md/gallery";
import { X, GripVertical } from "../../../icons";
import { GalleryImageElement } from "./GalleryImageElement";
import { GalleryAudioElement } from "./GalleryAudioElement";

// One tile in the justified strip: the frame (sizing, drag/broken state, reorder insertion
// bar) plus the per-tile chrome (remove, reorder grip, caption) wrapped around a single
// media ELEMENT — an image or an audio waveform card, chosen by `img.kind`. The frame is
// kind-agnostic; the leaves are the per-element files.

export interface GalleryTileCallbacks {
  onRemove: (i: number) => void;
  onCaption: (i: number, caption: string) => void;
  onExpand: (i: number, frameEl: HTMLElement | null) => void;
  onImageLoad: (url: string, el: HTMLImageElement) => void;
  onImageError: (i: number) => void;
  onGripDown: (i: number) => (e: PointerEvent) => void;
  onKeyDown: (i: number) => (e: KeyboardEvent<HTMLDivElement>) => void;
}

interface Props {
  img: GalleryImage;
  index: number;
  width: number;
  rowH: number;
  editable: boolean;
  blockId: string;
  isDragging: boolean;
  broken: boolean;
  /** show the insertion bar before this tile */
  insertBefore: boolean;
  /** show the end insertion bar after this tile (it's the last one) */
  insertAfterEnd: boolean;
  cb: GalleryTileCallbacks;
}

export function GalleryTile({
  img, index, width, rowH, editable, blockId, isDragging, broken, insertBefore, insertAfterEnd, cb,
}: Props) {
  const isAudio = img.kind === "audio";
  return (
    <div
      data-tile={index}
      className={"pensieve-gallery-tile" + (isDragging ? " is-dragging" : "") + (broken ? " is-broken" : "")}
      style={{ width, height: rowH }}
      tabIndex={0}
      onKeyDown={cb.onKeyDown(index)}
    >
      {insertBefore && editable && <div className="pensieve-gallery-insert" aria-hidden />}
      {editable && insertAfterEnd && <div className="pensieve-gallery-insert is-end" aria-hidden />}

      {isAudio ? (
        // playerKey is per-recording so two cards never share one playhead.
        <GalleryAudioElement url={img.url} playerKey={`${blockId}:${img.url}`} caption={img.caption} />
      ) : (
        <GalleryImageElement
          url={img.url}
          caption={img.caption}
          broken={broken}
          onLoad={(el) => cb.onImageLoad(img.url, el)}
          onError={() => cb.onImageError(index)}
          onExpand={(frameEl) => cb.onExpand(index, frameEl)}
        />
      )}

      {img.saving && <div className="pensieve-media-progress" aria-hidden />}

      {editable && (
        <>
          <button type="button" className="pensieve-gallery-remove" title="Remove from gallery" aria-label="Remove" onClick={() => cb.onRemove(index)}>
            <X size={14} />
          </button>
          <div className="pensieve-gallery-grip" title="Drag to reorder (or out of the gallery)" aria-label="Reorder" onPointerDown={cb.onGripDown(index)}>
            <GripVertical size={14} />
          </div>
          {/* Audio cards are self-contained (their controls occupy the bottom row) — no caption
              input, which would collide with the controls. */}
          {!isAudio && (
            <input
              className="pensieve-gallery-caption"
              value={img.caption ?? ""}
              placeholder="Caption…"
              onChange={(e) => cb.onCaption(index, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            />
          )}
        </>
      )}
      {!editable && img.caption && !isAudio && <div className="pensieve-gallery-caption-static">{img.caption}</div>}
    </div>
  );
}

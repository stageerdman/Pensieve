import { createReactBlockSpec, useSelectedBlocks } from "@blocknote/react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MediaBlock, type MediaState } from "./MediaBlock";
import { DEFAULT_IMAGE_WIDTH, imageFilename } from "../../../lib/md/image";
import { getMediaNoteId, expandImage } from "./mediaContext";
import { persistIntoBlock, type InsertEditor } from "./insertImage";
import { log } from "../../../lib/logger";

// The custom `image` block — it REPLACES BlockNote's built-in image chrome so images
// render in the Pensieve MediaBlock language (not BlockNote's default upload card).
//   • config/propSchema: url (a loadable url in-editor), caption (= alt), width (a
//     fraction of the text column), plus transient status/filename that never serialize
//     (lib/md/image only reads url/caption/width).
//   • parse: `<img>` → our props, so `![caption](ref)` round-trips in via BlockNote.
//   • toExternalHTML: `<img src alt>`, so a default-width image round-trips OUT as plain
//     `![caption](ref)` natively (verified) — width is bridged by lib/md/image's fence.

export const WIDTH_SNAPS = [0.25, 0.5, 0.75, 1] as const;

function snapWidth(fraction: number): number {
  return WIDTH_SNAPS.reduce((best, s) => (Math.abs(s - fraction) < Math.abs(best - fraction) ? s : best), WIDTH_SNAPS[0]);
}
function stepWidth(current: number, dir: -1 | 1): number {
  const i = WIDTH_SNAPS.indexOf(snapWidth(current) as (typeof WIDTH_SNAPS)[number]);
  return WIDTH_SNAPS[Math.min(WIDTH_SNAPS.length - 1, Math.max(0, i + dir))];
}

interface RenderProps {
  block: { id: string; props: { url: string; caption: string; width: number; status: string; filename: string } };
  editor: InsertEditor & { isEditable: boolean };
}

function ImageRender({ block, editor }: RenderProps) {
  const { url, caption, width, status, filename } = block.props;
  const editable = editor.isEditable;
  const selectedBlocks = useSelectedBlocks(editor as never);
  const selected = editable && selectedBlocks.length === 1 && selectedBlocks[0].id === block.id;

  const [focused, setFocused] = useState(false);
  const [imgError, setImgError] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // A new url (swap after save, or a re-point) clears a stale broken flag.
  useEffect(() => setImgError(false), [url]);

  const update = (props: Record<string, unknown>) => editor.updateBlock(block.id, { props });

  // The picture frame (not the full-width host) is where the lightbox travel starts from.
  const rectEl = (): HTMLElement | null =>
    (frameRef.current?.querySelector(".pensieve-media-frame") as HTMLElement | null) ?? frameRef.current;
  const expand = () => url && expandImage(url, caption, frameRef.current, rectEl());

  // ── the `/image` prompt sub-state: one inline input, no tabbed panel ──────────────
  if (status === "prompt" && !url) {
    return (
      <ImagePrompt
        onEmbed={(u) => update({ url: u, status: "" })}
        onPick={() => fileRef.current?.click()}
        onCancel={() => editor.updateBlock(block.id, { type: "paragraph", props: {} } as never)}
        fileInput={
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void persistIntoBlock(editor, getMediaNoteId(), f, block.id);
            }}
          />
        }
      />
    );
  }

  const state: MediaState = imgError || (!url && status !== "saving")
    ? "broken"
    : status === "saving"
      ? "saving"
      : "loaded";

  const onKeyDown = (e: KeyboardEvent) => {
    if (!editable) return;
    if (e.key === " " || e.key === "Enter") {
      // Enter on the image jumps into the caption; Space expands (Phase 2 lightbox hook).
      if (e.key === "Enter") {
        e.preventDefault();
        captionRef.current?.focus();
      } else {
        e.preventDefault();
        expand();
      }
    } else if ((e.metaKey || e.ctrlKey) && (e.key === "[" || e.key === "]")) {
      e.preventDefault();
      update({ width: stepWidth(width, e.key === "]" ? 1 : -1) });
    }
  };

  const startResize = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const media = frameRef.current?.closest(".pensieve-media") as HTMLElement | null;
    const column = media?.parentElement;
    if (!media || !column) return;
    const left = media.getBoundingClientRect().left;
    const colWidth = column.clientWidth || 1;
    const onMove = (ev: globalThis.PointerEvent) => {
      const frac = (ev.clientX - left) / colWidth;
      update({ width: snapWidth(Math.min(1, Math.max(0.15, frac))) });
    };
    const done = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", done);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", done);
  };

  const replace = () => fileRef.current?.click();
  const remove = () => {
    // The file is intentionally NOT deleted (version/timeline snapshots may reference it).
    editor.updateBlock(block.id, { type: "paragraph", props: {} } as never);
    log.info("media", "block.remove", { id: block.id });
  };

  return (
    <div
      ref={frameRef}
      className="pensieve-media-host"
      contentEditable={false}
      tabIndex={editable ? 0 : -1}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false);
      }}
    >
      <MediaBlock
        url={url}
        alt={caption}
        width={width || DEFAULT_IMAGE_WIDTH}
        state={state}
        filename={imageFilename(url) || filename}
        selected={selected}
        focused={focused}
        onImgError={() => setImgError(true)}
        onActivate={() => state === "loaded" && expand()}
        onLocate={editable ? replace : undefined}
        overlay={
          editable && (selected || focused) && state !== "broken" ? (
            <>
              <div className="pensieve-media-resize" onPointerDown={startResize} aria-label="Resize image" />
              <div className="pensieve-media-tools" contentEditable={false}>
                <button type="button" onClick={replace}>Replace</button>
                <button type="button" onClick={remove}>Remove</button>
              </div>
            </>
          ) : null
        }
        caption={
          editable && selected ? (
            <input
              ref={captionRef}
              className="pensieve-media-caption-input"
              value={caption}
              placeholder="Add a caption…"
              onChange={(e) => update({ caption: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  e.preventDefault();
                  frameRef.current?.focus();
                }
              }}
            />
          ) : caption ? (
            <div className="pensieve-media-caption">{caption}</div>
          ) : null
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void persistIntoBlock(editor, getMediaNoteId(), f, block.id);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// The `/image` placeholder: ONE input. Paste a url + Enter embeds it (external, not saved);
// Enter on empty opens the OS file picker; Esc / Backspace-on-empty removes the block.
function ImagePrompt({
  onEmbed,
  onPick,
  onCancel,
  fileInput,
}: {
  onEmbed: (url: string) => void;
  onPick: () => void;
  onCancel: () => void;
  fileInput: React.ReactNode;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  return (
    <div className="pensieve-media-prompt" contentEditable={false}>
      <input
        ref={inputRef}
        className="pensieve-media-prompt-input"
        placeholder="Paste an image URL, or press Enter to choose a file…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const v = value.trim();
            if (v) onEmbed(v);
            else onPick();
          } else if (e.key === "Escape" || (e.key === "Backspace" && value === "")) {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      {fileInput}
    </div>
  );
}

export const ImageBlock = createReactBlockSpec(
  {
    type: "image",
    content: "none",
    propSchema: {
      url: { default: "" },
      caption: { default: "" },
      width: { default: DEFAULT_IMAGE_WIDTH, type: "number" },
      // Transient (never serialized — lib/md/image reads only url/caption/width):
      status: { default: "" }, // "" | "prompt" | "saving"
      filename: { default: "" },
    },
  },
  {
    render: (props) => <ImageRender block={props.block as never} editor={props.editor as never} />,
    parse: (el) =>
      el.tagName === "IMG"
        ? { url: el.getAttribute("src") ?? "", caption: el.getAttribute("alt") ?? "" }
        : undefined,
    // eslint-disable-next-line jsx-a11y/alt-text
    toExternalHTML: ({ block }) => <img src={(block.props as { url: string }).url} alt={(block.props as { caption: string }).caption} />,
  },
)();

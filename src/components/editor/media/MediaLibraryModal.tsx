import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { listVaultImages, type LibraryImage } from "./mediaLibrary";
import { X as CloseIcon } from "../../icons";

// A modal picker over the vault's already-uploaded images (see mediaLibrary.ts). Single-select
// fires onPick immediately on click; multi-select accumulates then confirms. onPick returns the
// chosen loadable url(s) — the caller sets/append them (they're already ref-registered, so they
// save back to the vault ref with no re-upload). Portalled to <body>; Esc / backdrop closes.

interface Props {
  multiple?: boolean;
  onPick: (urls: string[]) => void;
  onClose: () => void;
}

export function MediaLibrary({ multiple, onPick, onClose }: Props) {
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let on = true;
    void listVaultImages().then((x) => on && setImages(x));
    return () => {
      on = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const choose = (url: string) => {
    if (!multiple) {
      onPick([url]);
      return;
    }
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(url)) n.delete(url);
      else n.add(url);
      return n;
    });
  };

  return createPortal(
    <div
      className="pensieve-library-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pensieve-library" role="dialog" aria-modal="true" aria-label={multiple ? "Choose images" : "Choose an image"}>
        <div className="pensieve-library-head">
          <span>{multiple ? "Choose images from your vault" : "Choose an image from your vault"}</span>
          <button type="button" className="pensieve-library-close" onClick={onClose} aria-label="Close">
            <CloseIcon size={16} />
          </button>
        </div>
        {images === null ? (
          <div className="pensieve-library-empty">Loading…</div>
        ) : images.length === 0 ? (
          <div className="pensieve-library-empty">No images in your vault yet. Upload one first.</div>
        ) : (
          <div className="pensieve-library-grid">
            {images.map((img) => (
              <button
                key={img.ref}
                type="button"
                className={"pensieve-library-tile" + (selected.has(img.url) ? " is-selected" : "")}
                onClick={() => choose(img.url)}
                aria-pressed={selected.has(img.url)}
              >
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <img src={img.url} alt="" draggable={false} />
              </button>
            ))}
          </div>
        )}
        {multiple && images && images.length > 0 && (
          <div className="pensieve-library-foot">
            <button type="button" className="pensieve-library-pick" disabled={selected.size === 0} onClick={() => selected.size && onPick([...selected])}>
              Add{selected.size ? ` ${selected.size}` : ""}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

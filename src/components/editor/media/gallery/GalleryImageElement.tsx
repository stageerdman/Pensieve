import { mediaAlt } from "../../../../lib/media";
import { imageFilename } from "../../../../lib/md/image";

// The image leaf of a gallery tile: the <img> (object-fit:cover via CSS) or a broken-state
// chip. Presentational — all behaviour is passed in from the tile. Measures natural aspect
// on load (the gallery uses it to size the tile) and opens the lightbox on click.

interface Props {
  url: string;
  caption?: string;
  broken: boolean;
  onLoad: (el: HTMLImageElement) => void;
  onError: () => void;
  onExpand: (frameEl: HTMLElement | null) => void;
}

export function GalleryImageElement({ url, caption, broken, onLoad, onError, onExpand }: Props) {
  if (!url || broken) {
    return (
      <div className="pensieve-gallery-brokentile">
        <span className="pensieve-media-filename">{imageFilename(url) || "image missing"}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <img
      className="pensieve-gallery-img"
      src={url}
      alt={mediaAlt(caption)}
      draggable={false}
      onLoad={(e) => onLoad(e.currentTarget)}
      onError={onError}
      onClick={(e) => onExpand(e.currentTarget.closest(".pensieve-gallery-tile") as HTMLElement)}
    />
  );
}

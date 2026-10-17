import type { GalleryImage } from "../../../../lib/md/gallery";
import { GalleryTile, type GalleryTileCallbacks } from "./GalleryTile";

// One justified row of the strip: pure layout. Given the packer's tiles for this row (each
// {index, width}) and the shared row height, it renders a GalleryTile per entry. All state
// (which tile is dragging, where the insertion bar is, broken set) is passed down from the
// Gallery orchestrator; the row adds no behaviour of its own.

export interface PackedTile {
  index: number;
  width: number;
}

interface Props {
  tiles: PackedTile[];
  rowH: number;
  /** total content width of the row (sum of tile widths + gaps) — keeps the flex row sized */
  contentWidth: number;
  gap: number;
  images: GalleryImage[];
  editable: boolean;
  blockId: string;
  dragFrom: number | null;
  dropAt: number | null;
  broken: Set<number>;
  cb: GalleryTileCallbacks;
}

export function GalleryRow({ tiles, rowH, contentWidth, gap, images, editable, blockId, dragFrom, dropAt, broken, cb }: Props) {
  const last = images.length - 1;
  return (
    <div className="pensieve-gallery-row" style={{ height: rowH, width: contentWidth, gap: `${gap}px` }}>
      {tiles.map(({ index, width }) => (
        <GalleryTile
          key={`${index}-${images[index]?.url}`}
          img={images[index]}
          index={index}
          width={width}
          rowH={rowH}
          editable={editable}
          blockId={blockId}
          isDragging={dragFrom === index}
          broken={broken.has(index)}
          insertBefore={dropAt === index}
          insertAfterEnd={dropAt === images.length && index === last}
          cb={cb}
        />
      ))}
    </div>
  );
}

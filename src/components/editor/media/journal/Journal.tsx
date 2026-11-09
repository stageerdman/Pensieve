import { useState } from "react";
import { parseJournalPages, stringifyJournalPages, type JournalPage } from "../../../../lib/md/journal";
import { mediaAlt } from "../../../../lib/media";
import { lightbox } from "../../../media/lightboxController";
import { log } from "../../../../lib/logger";

// The journal block's ORCHESTRATOR — an ordered run of photographed paper-journal pages.
// Deliberately simpler than Gallery (./editor/media/gallery/Gallery.tsx): a single-row
// strip (no justified multi-row packer, no audio tiles), because the default interaction
// is "page through this like the real notebook" rather than Gallery's free-form photo
// grid. Clicking a page opens the REAL lightbox (ImageLightbox.tsx) with every page as a
// swipeable/zoomable sequence — the same component the Gallery block already uses, so
// arrow-key nav, wheel-zoom and drag-to-pan come for free (see wiki.md).

export interface JournalBlockEditor {
  isEditable: boolean;
  updateBlock: (id: string, update: unknown) => void;
}

interface Props {
  block: { id: string; props: { pages: string } };
  editor: JournalBlockEditor;
}

export function Journal({ block, editor }: Props) {
  const editable = editor.isEditable;
  const pages = parseJournalPages(block.props.pages);
  const [broken, setBroken] = useState<Set<number>>(new Set());

  const setPages = (next: JournalPage[]) =>
    editor.updateBlock(block.id, { props: { pages: stringifyJournalPages(next) } });

  const expand = (i: number, rectEl?: HTMLElement | null) => {
    lightbox.open({
      items: pages.map((p) => ({ url: p.url, caption: p.caption || undefined })),
      index: i,
      originRect: rectEl?.getBoundingClientRect(),
      originElement: rectEl ?? null,
    });
    log.info("media", "journal.expand", { id: block.id, index: i });
  };

  const remove = (i: number) => {
    const next = pages.filter((_, j) => j !== i);
    if (next.length === 0) {
      editor.updateBlock(block.id, { type: "paragraph", props: {} });
    } else {
      setPages(next);
      log.info("media", "journal.remove", { id: block.id, remaining: next.length });
    }
  };

  if (pages.length === 0) {
    return <div className="pensieve-journal pensieve-journal-empty" contentEditable={false} />;
  }

  return (
    <div className="pensieve-journal" contentEditable={false}>
      <div className="pensieve-journal-strip">
        {pages.map((p, i) =>
          broken.has(i) ? (
            <div key={i} className="pensieve-gallery-tile pensieve-journal-tile pensieve-gallery-brokentile">
              Page missing
            </div>
          ) : (
            <div
              key={i}
              className="pensieve-gallery-tile pensieve-journal-tile"
              data-tile={i}
              tabIndex={0}
              role="button"
              aria-label={`Open page ${i + 1} of ${pages.length}`}
              onClick={(e) => expand(i, e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  expand(i, e.currentTarget);
                }
              }}
            >
              <img
                className="pensieve-gallery-img"
                src={p.url}
                alt={mediaAlt(p.caption)}
                draggable={false}
                onError={() => setBroken((s) => new Set(s).add(i))}
              />
              {p.caption && <div className="pensieve-gallery-caption-static">{p.caption}</div>}
              {editable && (
                <button
                  type="button"
                  className="pensieve-gallery-remove"
                  aria-label="Remove page"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(i);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

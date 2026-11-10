// JournalDetailScreen.tsx — a Raw Memory's detail sheet: its pages, removable, plus
// whatever sync status it has. Batch-level actions (Delete, Add more pages) are NOT
// flat buttons here — they live in the Conditional spell ring, same as every other
// context in this app (see wiki.md "C"). This screen just renders the real Dock
// (NoteActions) + the page grid; PhoneApp owns opening the ring / the confirm sheet.

import { removePageFromBatch, type RawMemory } from "../../lib/media/rawMemoryStore";
import { MediaImg } from "./MediaImg";
import { NoteActions } from "./NoteActions";

export interface JournalDetailScreenProps {
  batch: RawMemory;
  onChangeBatch: (b: RawMemory) => void;
  onBack: () => void;
  onOpenMenu: () => void;
}

const STATUS_LABEL: Record<RawMemory["status"], string> = {
  capturing: "Still capturing",
  queued: "Queued to sync",
  synced: "Synced — waiting for desktop to process",
  processing: "Processing on desktop…",
  done: "Processed",
};

export function JournalDetailScreen({ batch, onChangeBatch, onBack, onOpenMenu }: JournalDetailScreenProps) {
  const removePage = async (i: number) => {
    const next = await removePageFromBatch(batch, i);
    onChangeBatch(next);
    if (next.pages.length === 0) onBack(); // an empty batch can't exist — see rawMemoryStore
  };

  return (
    <div className="ph-collection" role="dialog" aria-modal="true" aria-label="Journal pages">
      <div className="ph-collection-grab" aria-hidden="true">
        <span className="ph-collection-grabber" />
      </div>
      <div className="ph-journal-detail-title">
        Journal — {batch.pages.length} page{batch.pages.length === 1 ? "" : "s"}
      </div>
      <div className="ph-journal-detail-status">{STATUS_LABEL[batch.status]}</div>
      <div className="ph-collection-masonry editing">
        {[0, 1].map((col) => (
          <div className="ph-collection-col" key={col}>
            {batch.pages.map((ref, i) =>
              i % 2 !== col ? null : (
                <div className="ph-collection-tile" key={ref} data-index={i}>
                  <MediaImg mediaRef={ref} />
                  <button type="button" className="ph-collection-remove" aria-label="Remove page" onClick={() => void removePage(i)}>
                    ×
                  </button>
                </div>
              ),
            )}
          </div>
        ))}
      </div>
      <NoteActions onBack={onBack} onOpenMenu={onOpenMenu} />
    </div>
  );
}

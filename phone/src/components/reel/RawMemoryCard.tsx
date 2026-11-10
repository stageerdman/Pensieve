// RawMemoryCard.tsx — a Raw Memory batch's row in the SAME scrollable reel as every
// other memory (not a fixed strip above it — see wand.css's .slot/.card shell, shared
// verbatim with ReelCard so useReelFisheye's generic .slot-child magnification applies
// here too). The dashed frame stands in for the Flask: "same size/alignment as a normal
// card" per the owner's approved prototype direction.

import type { RawMemory } from "../../lib/media/rawMemoryStore";

const STATUS_TEXT: Record<RawMemory["status"], string> = {
  capturing: "Still capturing",
  queued: "Queued to sync",
  synced: "Awaiting processing",
  processing: "Processing on desktop…",
  done: "Processed",
};

export function RawMemoryCard({ batch, onOpen }: { batch: RawMemory; onOpen: (b: RawMemory) => void }) {
  const n = batch.pages.length;
  return (
    <div className="slot" data-id={`raw-${batch.id}`}>
      <div className="card" onClick={() => onOpen(batch)}>
        <span className="ph-journal-home-frame flask" aria-hidden="true" />
        <div className="body">
          <div className="title">
            Journal — {n} page{n === 1 ? "" : "s"}
          </div>
          <div className="meta">{STATUS_TEXT[batch.status]}</div>
        </div>
      </div>
    </div>
  );
}

// PackageDetailScreen.tsx — a sealed form PACKAGE's read-only preview (PACKAGES update): the
// form as it will read (questions, typed answers, rating, ticks), the recording + photos, and
// the Patronus block with its sync spell last. Nothing is editable: it opens for real once
// the desktop's Patronus has resolved it into a memory. Same sheet + Dock as the Journal
// detail; Delete lives in the Conditional ring ("package" context), never a flat button.

import { useEffect, useRef } from "react";
import type { RawMemory } from "../../lib/media/rawMemoryStore";
import { splitTitleAndBody } from "../../lib/sync/noteFormat";
import { renderNoteBody } from "./mediaDom";
import { NoteActions } from "./NoteActions";
import { packageStatusText } from "../reel/RawMemoryCard";

export interface PackageDetailScreenProps {
  batch: RawMemory;
  onBack: () => void;
  onOpenMenu: () => void;
}

export function PackageDetailScreen({ batch, onBack, onOpenMenu }: PackageDetailScreenProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const { title, body } = splitTitleAndBody(batch.markdown ?? "");
    renderNoteBody(el, title, body, { onChange: () => {} }); // read-only: nothing to save
    el.querySelector(".ph-patronus")?.setAttribute("data-state", batch.status === "processing" ? "working" : "waiting");
  }, [batch.markdown, batch.status]);

  return (
    <div className="ph-collection ph-package" role="dialog" aria-modal="true" aria-label={batch.title || "Form"}>
      <div className="ph-collection-grab" aria-hidden="true">
        <span className="ph-collection-grabber" />
      </div>
      <div className="ph-journal-detail-status">{packageStatusText(batch.status)}</div>
      <div ref={bodyRef} className="note-body ph-package-body" contentEditable={false} />
      <NoteActions onBack={onBack} onOpenMenu={onOpenMenu} />
    </div>
  );
}

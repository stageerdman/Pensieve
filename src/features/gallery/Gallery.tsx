import { Fragment, useEffect, useMemo, useRef } from "react";
import type { NoteMeta } from "../../lib/types";
import type { CategoryDef } from "../../lib/categories/defs";
import type { GalleryState } from "../../lib/gallery/view";
import { bucketize } from "../../lib/gallery/buckets";
import { FlaskFor } from "../../components/Flask";
import { FlaskCard } from "./FlaskCard";

// Home: every memory at once, as large flasks grouped by creation date (Apple-Photos
// style, oldest on top). A quiet date rail on the left labels each group. The whole
// region owns its own scroll and always opens at the top (the earliest memories).

interface GalleryProps {
  notes: NoteMeta[];
  state: GalleryState;
  categoryDefs: CategoryDef[];
  onOpen: (id: string, background: boolean) => void;
}

export function Gallery({ notes, state, categoryDefs, onOpen }: GalleryProps) {
  const now = useMemo(() => Date.now(), []);
  const sections = useMemo(() => bucketize(notes, now), [notes, now]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Always land on the top (the oldest memories) when the gallery opens.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  return (
    <div
      ref={scrollRef}
      className="h-full flex-1 overflow-y-auto px-6 pt-6 pb-16"
      role="region"
      aria-label="Memories"
    >
      {sections.length === 0 ? (
        <Empty />
      ) : (
        <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-y-10">
          {sections.map((s) => (
            <Fragment key={s.key}>
              <div className="relative pt-1">
                <span
                  aria-hidden
                  className="sticky top-4 block whitespace-nowrap pr-3 text-right text-[11px] font-medium tracking-wide text-text-muted"
                >
                  {s.label}
                </span>
              </div>
              <section aria-label={s.label} className="border-l border-border pl-5">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,224px))] justify-start gap-x-4 gap-y-6">
                  {s.notes.map((n) => (
                    <FlaskCard
                      key={n.id}
                      note={n}
                      fields={state.fields}
                      snippetLines={state.snippetLines}
                      categoryDefs={categoryDefs}
                      now={now}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              </section>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <FlaskFor chars={0} size={72} className="text-text-muted/40" />
      <p className="text-sm text-text">No memories yet</p>
      <p className="text-[13px] text-text-muted">Capture your first thought.</p>
    </div>
  );
}

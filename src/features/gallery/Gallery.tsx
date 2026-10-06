import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { NoteMeta } from "../../lib/types";
import type { CategoryDef } from "../../lib/categories/defs";
import type { GalleryState } from "../../lib/gallery/view";
import { bucketize } from "../../lib/gallery/buckets";
import { FlaskFor } from "../../components/Flask";
import { FlaskCard, type MenuAnchor, type PeekTarget } from "./FlaskCard";
import { WorkingSetStrip } from "./WorkingSetStrip";
import { PreviewPortal } from "./PreviewPortal";
import { CardContextMenu, type CardMenuTarget } from "./CardContextMenu";

// Home: every memory at once, as large flasks grouped by creation date (Apple-Photos
// style, oldest on top). A quiet date rail on the left labels each group; the working
// set rides on top. The whole region owns its own scroll and always opens at the top
// (the earliest memories). This component also owns the ephemeral peek + context-menu
// state so a single peek/menu is live at a time.

interface GalleryProps {
  notes: NoteMeta[];
  state: GalleryState;
  categoryDefs: CategoryDef[];
  theme: "light" | "dark";
  onOpen: (id: string, background: boolean) => void;
  onToggleWorkingSet: (id: string) => void;
  onRemoveFromWorkingSet: (id: string) => void;
  onMoveInWorkingSet: (id: string, delta: number) => void;
  onReorderWorkingSet: (fromIndex: number, toIndex: number) => void;
}

export function Gallery({
  notes,
  state,
  categoryDefs,
  theme,
  onOpen,
  onToggleWorkingSet,
  onRemoveFromWorkingSet,
  onMoveInWorkingSet,
  onReorderWorkingSet,
}: GalleryProps) {
  const now = useMemo(() => Date.now(), []);
  const wsSet = useMemo(() => new Set(state.workingSet), [state.workingSet]);
  // Working-set memories are pinned to the strip above and hidden from the grid here —
  // the strip is their only home while pinned (like a note moved to the top).
  const sections = useMemo(
    () => bucketize(notes.filter((n) => !wsSet.has(n.id)), now),
    [notes, wsSet, now],
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const [altHeld, setAltHeld] = useState(false);
  const [hovered, setHovered] = useState<PeekTarget | null>(null);
  const [keyPeek, setKeyPeek] = useState<PeekTarget | null>(null);
  const [menu, setMenu] = useState<CardMenuTarget | null>(null);

  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  // Working-set items in saved order, dropping any that no longer map to a live note.
  const wsItems = useMemo(
    () => state.workingSet.map((id) => byId.get(id)).filter(Boolean) as NoteMeta[],
    [state.workingSet, byId],
  );

  // Always land on the top (the most recent memories) when the gallery opens.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  // Track Option/Alt for hover-peek. Clear on blur so a held key never gets stuck.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltHeld(true);
      if (e.key === "Escape") {
        setKeyPeek(null);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltHeld(false);
    };
    const blur = () => setAltHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // The one live peek: a Space-toggled one wins, else an Alt+hover one.
  const peekTarget = keyPeek ?? (altHeld && hovered ? hovered : null);
  const peekNote = peekTarget ? byId.get(peekTarget.id) : undefined;

  const onPeekToggle = (t: PeekTarget) =>
    setKeyPeek((cur) => (cur?.id === t.id ? null : t));

  const openContextMenu = (e: MenuAnchor, id: string) => {
    e.preventDefault();
    setKeyPeek(null);
    setMenu({ id, x: e.clientX, y: e.clientY, inWorkingSet: wsSet.has(id) });
  };

  // The portal is centered (not anchored), so scrolling only ends a transient
  // Alt-hover peek; a Space-pinned peek stays until Esc/Space.
  const onScroll = () => {
    if (hovered) setHovered(null);
  };

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="h-full flex-1 overflow-y-auto px-6 pt-6 pb-16"
      role="region"
      aria-label="Memories"
    >
      {/* The liquid-ripple filter, applied to the background (below) while a peek is
          open — never to the memory itself. A single low-frequency octave gives a few
          big, slow undulations (not many small ones); the turbulence slowly travels so
          it never sits still, and the displacement eases up from 0 on open for a smooth
          ramp-in. Rendered only while peeking (so the ramp runs each time). */}
      {peekTarget && peekNote && (
        <svg aria-hidden className="pointer-events-none fixed left-0 top-0 h-0 w-0">
          <filter id="memory-ripple" x="-12%" y="-12%" width="124%" height="124%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.0045 0.006" numOctaves="1" seed="4" result="noise">
              <animate
                attributeName="baseFrequency"
                dur="28s"
                values="0.0045 0.006;0.006 0.0045;0.0045 0.006"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="noise" xChannelSelector="R" yChannelSelector="G" scale="11">
              <animate attributeName="scale" dur="520ms" values="0;11" keyTimes="0;1" keySplines="0.2 0.8 0.2 1" calcMode="spline" fill="freeze" />
            </feDisplacementMap>
          </filter>
        </svg>
      )}

      {/* The background: everything behind the portal. It ripples (and the portal's
          backdrop blurs its edges) while a peek is open; the portal is a sibling, so the
          memory stays sharp and untouched. */}
      <div className={peekTarget && peekNote ? "water-bg" : undefined}>
        <WorkingSetStrip
          items={wsItems}
          fields={state.fields}
          snippetLines={state.snippetLines}
          categoryDefs={categoryDefs}
          now={now}
          onOpen={onOpen}
          onContextMenu={openContextMenu}
          onHoverChange={setHovered}
          onPeekToggle={onPeekToggle}
          onToggleWorkingSet={onToggleWorkingSet}
          onRemove={onRemoveFromWorkingSet}
          onMove={onMoveInWorkingSet}
          onReorder={onReorderWorkingSet}
        />

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
                        inWorkingSet={wsSet.has(n.id)}
                        onOpen={onOpen}
                        onContextMenu={openContextMenu}
                        onHoverChange={setHovered}
                        onPeekToggle={onPeekToggle}
                        onToggleWorkingSet={onToggleWorkingSet}
                      />
                    ))}
                  </div>
                </section>
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {peekTarget && peekNote && (
        <PreviewPortal
          id={peekTarget.id}
          title={peekNote.title}
          theme={theme}
          interactive={!!keyPeek}
        />
      )}

      {menu && (
        <CardContextMenu
          target={menu}
          onOpen={onOpen}
          onPeek={(id) => {
            const el = scrollRef.current?.querySelector<HTMLElement>(`[data-note-id="${id}"]`);
            if (el) onPeekToggle({ id, el });
          }}
          onToggleWorkingSet={onToggleWorkingSet}
          onClose={() => setMenu(null)}
        />
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

// Glass.tsx — THE GLASS: a fixed transparent loupe frame pinned on the focal line.
//
// Source markup ~464, CSS ~131-148. It paints only rim + sheen (pointer-events pass
// through to the reel); its top/height are set per-layout by useReelFisheye. When the
// VIEW is empty it becomes a dashed empty-state card with a message (source ~714-715).

export function Glass({
  empty,
  message,
  glassRef,
}: {
  empty: boolean;
  message: string;
  glassRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div className={empty ? "glass empty" : "glass"} ref={glassRef}>
      {empty ? message : ""}
    </div>
  );
}

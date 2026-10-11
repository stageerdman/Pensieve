// DesignOverlay.tsx — the arc-resize overlay (shown only while dragging the Adjust
// grip radially): the dashed arc ring, the centre spoke, the end dot, and a live
// "<n> px" readout.
//
// Source markup ~473-478. useWheelGesture mutates the geometry via the element refs
// and toggles .on while resizing.

export function DesignOverlay({
  designRef,
  designNumRef,
  dRingRef,
  dSpokeRef,
  dDotRef,
}: {
  designRef: React.RefObject<SVGSVGElement>;
  designNumRef: React.RefObject<HTMLDivElement>;
  dRingRef: React.RefObject<SVGCircleElement>;
  dSpokeRef: React.RefObject<SVGLineElement>;
  dDotRef: React.RefObject<SVGCircleElement>;
}) {
  return (
    <>
      <svg className="design-layer" ref={designRef} aria-hidden="true">
        <circle ref={dRingRef} className="ring" cx="0" cy="0" r="0" />
        <line ref={dSpokeRef} className="spoke" x1="0" y1="0" x2="0" y2="0" />
        <circle ref={dDotRef} className="dot" cx="0" cy="0" r="4" />
      </svg>
      <div className="design-num" ref={designNumRef} />
    </>
  );
}

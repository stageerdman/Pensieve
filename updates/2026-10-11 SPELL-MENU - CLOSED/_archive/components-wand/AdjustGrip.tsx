// AdjustGrip.tsx — the invisible touch target over the centred button, live ONLY when
// the "Adjust" seat is centred.
//
// Source markup ~482-484. Drag radially = resize the arc · hold ~2s = flip side ·
// swing tangentially = rotate. useWheelGesture positions it on the centred seat,
// toggles .live/.holding, and drives the gold fill ring via the circle ref.

export function AdjustGrip({
  gripRef,
  gripFillRef,
}: {
  gripRef: React.RefObject<HTMLDivElement>;
  gripFillRef: React.RefObject<SVGCircleElement>;
}) {
  return (
    <div className="grip" ref={gripRef} aria-hidden="true">
      <svg className="fill" viewBox="0 0 74 74">
        <circle ref={gripFillRef} cx="37" cy="37" r="34" pathLength="1" />
      </svg>
    </div>
  );
}

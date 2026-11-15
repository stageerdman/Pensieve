// The starred "bright memory" halo: a soft, static gold glow laid BEHIND a flask. Render it
// as the first child of a `relative` box that also holds the flask, and size it (className)
// ~1.5× the flask so the glow reaches past the glass — it is centred by translate, so it may
// be larger than its box. The flask must be positioned too (`relative`), or this absolute
// layer paints over it. Purely visual — callers carry "starred" in their aria-label.
export function StarHalo({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      data-testid="star-halo"
      className={`star-halo pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${className}`}
    />
  );
}

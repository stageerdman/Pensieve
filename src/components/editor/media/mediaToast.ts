// A whisper, not a shout (design.md): one quiet, non-blocking line that fades on its own.
// Used for the few image cases the UI must mention — a rejected non-image drop, or an
// image that couldn't be found on load. Imperative (no React tree wiring) and self-
// cleaning; at most one visible at a time.

let current: HTMLDivElement | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function mediaToast(message: string): void {
  if (typeof document === "undefined") return;
  if (timer) clearTimeout(timer);
  if (!current) {
    current = document.createElement("div");
    current.className = "pensieve-media-toast";
    document.body.appendChild(current);
  }
  current.textContent = message;
  // Reflow so the fade-in transition re-triggers on repeat messages.
  void current.offsetWidth;
  current.classList.add("is-visible");
  timer = setTimeout(() => {
    current?.classList.remove("is-visible");
    const el = current;
    setTimeout(() => el?.remove(), 700);
    current = null;
    timer = null;
  }, 2600);
}

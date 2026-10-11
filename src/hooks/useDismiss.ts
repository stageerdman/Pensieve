import { useEffect, useRef, type RefObject } from "react";

// One home for "close on outside-click or Escape" — the pattern that was reimplemented
// in ~7 popovers/menus (see CODING.md: never build the same thing twice). Attach the
// returned ref to the floating container; everything outside it (mousedown) or an Escape
// key dismisses it.
//
//   const ref = useDismiss<HTMLDivElement>(() => setOpen(false), { enabled: open });
//   return <div ref={ref}>…</div>;
//
// Escape calls stopPropagation() by default (so it doesn't also trigger a parent handler),
// matching every call site we consolidated. Pass `onEscape` when Escape should do
// something other than `onDismiss` (e.g. close an inner layer first).
interface UseDismissOptions {
  /** Attach the listeners only while true (e.g. the `open` flag). Default true. */
  enabled?: boolean;
  /** Override what Escape does. Defaults to `onDismiss`. */
  onEscape?: () => void;
  /** Listen for the Escape keydown in the capture phase. Default false. */
  escapeCapture?: boolean;
  /** Call `e.stopPropagation()` on Escape. Default true. */
  stopPropagationOnEscape?: boolean;
}

export function useDismiss<T extends HTMLElement = HTMLElement>(
  onDismiss: () => void,
  options: UseDismissOptions = {},
): RefObject<T> {
  const { enabled = true, escapeCapture = false } = options;
  const ref = useRef<T>(null);
  // Keep the callbacks fresh without re-attaching listeners on every render, so a handler
  // closing over changing state (e.g. a two-stage menu) always sees the latest values.
  const cbs = useRef({ onDismiss, options });
  cbs.current = { onDismiss, options };

  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cbs.current.onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const { onDismiss: dismiss, options: o } = cbs.current;
      if (o.stopPropagationOnEscape !== false) e.stopPropagation();
      (o.onEscape ?? dismiss)();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, escapeCapture);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, escapeCapture);
    };
  }, [enabled, escapeCapture]);

  return ref;
}

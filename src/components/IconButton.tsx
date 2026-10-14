import { forwardRef, type ReactNode } from "react";

// The one shared icon button — header controls and every panel close button.
// 32px box, 18px icon. Neutral by default; `active` reads as a quiet open state
// (surface-raised, never accent — accent is reserved for content). A keyboard-visible
// accent focus ring (AA) is on by default; pointer clicks stay ringless.

interface IconButtonProps {
  children: ReactNode;
  onClick: () => void;
  label: string; // aria-label
  title?: string; // tooltip (often includes the shortcut)
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { children, onClick, label, title, active },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className={
        "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
        (active
          ? "bg-surface-raised text-text"
          : "text-text-muted hover:bg-surface-raised hover:text-text")
      }
    >
      {children}
    </button>
  );
});

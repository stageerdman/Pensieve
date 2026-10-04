import type { ReactNode } from "react";

// The one shared icon button — header controls and every panel close button.
// 32px box, 18px icon. Neutral by default; `active` reads as a quiet open state
// (surface-raised, never accent — accent is reserved for content).

interface IconButtonProps {
  children: ReactNode;
  onClick: () => void;
  label: string; // aria-label
  title?: string; // tooltip (often includes the shortcut)
  active?: boolean;
}

export function IconButton({ children, onClick, label, title, active }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className={
        "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors " +
        (active
          ? "bg-surface-raised text-text"
          : "text-text-muted hover:bg-surface-raised hover:text-text")
      }
    >
      {children}
    </button>
  );
}

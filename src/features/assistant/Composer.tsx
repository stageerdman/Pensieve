import { useEffect, useRef, type KeyboardEvent } from "react";

const MAX_HEIGHT_PX = 128;

export function Composer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Focus on mount (the window just opened) — no extra click before typing, matching
  // Summon's quick-capture feel elsewhere in the app.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  const autoGrow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  };

  const submit = () => {
    const value = ref.current?.value ?? "";
    if (!value.trim() || disabled) return;
    onSend(value);
    if (ref.current) {
      ref.current.value = "";
      ref.current.style.height = "auto";
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex items-end gap-2 border-t border-border p-3">
      <textarea
        ref={ref}
        rows={1}
        placeholder="Ask anything…"
        onKeyDown={onKeyDown}
        onInput={autoGrow}
        disabled={disabled}
        className="max-h-32 flex-1 resize-none overflow-y-auto rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        Send
      </button>
    </div>
  );
}

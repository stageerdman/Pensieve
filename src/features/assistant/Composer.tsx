import { useRef, type KeyboardEvent } from "react";

export function Composer({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const value = ref.current?.value ?? "";
    if (!value.trim() || disabled) return;
    onSend(value);
    if (ref.current) ref.current.value = "";
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
        disabled={disabled}
        className="max-h-32 flex-1 resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
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

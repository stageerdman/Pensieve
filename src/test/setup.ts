import "@testing-library/jest-dom/vitest";

// jsdom's localStorage is not fully implemented in this env; install a simple,
// complete mock so the browser store can be tested faithfully.
class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  key(i: number) {
    return Array.from(this.m.keys())[i] ?? null;
  }
}

Object.defineProperty(globalThis, "localStorage", {
  value: new MemoryStorage(),
  writable: true,
});

// jsdom ships no PointerEvent, so testing-library downgrades fireEvent.pointer* to a
// bare Event that drops clientX/clientY — which breaks any handler that reads pointer
// coordinates (e.g. the working-set drag). Alias it to MouseEvent, which carries them.
if (typeof window !== "undefined" && typeof window.PointerEvent === "undefined") {
  window.PointerEvent = class PointerEvent extends MouseEvent {} as unknown as typeof window.PointerEvent;
  // Pointer capture is a no-op in jsdom; stub it so guarded calls don't need to throw.
  if (!window.HTMLElement.prototype.setPointerCapture) {
    window.HTMLElement.prototype.setPointerCapture = () => {};
    window.HTMLElement.prototype.releasePointerCapture = () => {};
  }
}

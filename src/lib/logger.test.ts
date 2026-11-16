import { describe, it, expect, beforeEach, vi } from "vitest";
import { log } from "./logger";

describe("logger", () => {
  beforeEach(() => log._reset());

  it("records entries and returns filtered, capped results", () => {
    log.info("store", "save", { id: "a" });
    log.error("editor", "crash");
    log.debug("store", "load");

    const errors = log.query({ level: "error" });
    expect(errors).toHaveLength(1);
    expect(errors[0].module).toBe("editor");

    const storeOnly = log.query({ module: "store" });
    expect(storeOnly.map((e) => e.event).sort()).toEqual(["load", "save"]);
  });

  it("returns newest first and respects limit", () => {
    for (let i = 0; i < 10; i++) log.info("m", "e" + i);
    const two = log.query({ limit: 2 });
    expect(two).toHaveLength(2);
    expect(two[0].event).toBe("e9");
  });

  it("matches events by substring", () => {
    log.info("store", "timeline.append");
    log.info("store", "save");
    expect(log.query({ event: "timeline" })).toHaveLength(1);
  });

  it("stamps every entry with the session id", () => {
    log.info("m", "e");
    expect(log.query()[0].session).toBe(log.sessionId);
  });

  it("batches entries to the sink and flushes on demand", () => {
    const batches: string[][] = [];
    log.setSink((es) => void batches.push(es.map((e) => e.event)));
    log.info("sync", "a");
    log.info("sync", "b");
    expect(batches).toEqual([]); // queued, not one write per entry
    log.flush();
    expect(batches).toEqual([["a", "b"]]);
  });

  it("flushes on a timer, and a throwing sink never breaks logging", () => {
    vi.useFakeTimers();
    try {
      const sink = vi.fn(() => {
        throw new Error("disk full");
      });
      log.setSink(sink);
      log.info("sync", "x");
      vi.advanceTimersByTime(2500);
      expect(sink).toHaveBeenCalledTimes(1);
      expect(() => log.info("sync", "y")).not.toThrow();
      expect(log.query({ event: "y" })).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

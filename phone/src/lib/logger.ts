// Central logger (CLAUDE.md Debugging principle), ported verbatim from
// src/lib/logger.ts — it's pure (no Tauri dependency), so this is a straight copy
// rather than a re-implementation. The phone had no logger at all before this; the
// real OneDrive sync path (network calls, token refresh, conflicts) is exactly the
// kind of background work that's unreadable without one.
//
// Every module logs through here: level, module, event, session id, optional data.
// Capped in-memory ring buffer, queried filtered — never a full dump.

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  ts: number;
  level: LogLevel;
  module: string;
  event: string;
  session: string;
  data?: unknown;
}

export interface LogQuery {
  level?: LogLevel;
  module?: string;
  event?: string;
  since?: number;
  limit?: number;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const CAP = 2000;
const MAX_QUERY = 200;

function newSessionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

class Logger {
  private buf: LogEntry[] = [];
  private session = newSessionId();
  private minConsole: LogLevel = "info";

  private push(level: LogLevel, module: string, event: string, data?: unknown) {
    const entry: LogEntry = { ts: Date.now(), level, module, event, session: this.session, data };
    this.buf.push(entry);
    if (this.buf.length > CAP) this.buf.splice(0, this.buf.length - CAP);
    if (LEVEL_ORDER[level] >= LEVEL_ORDER[this.minConsole]) {
      const line = `[${level}] ${module}:${event}`;
      if (level === "error") console.error(line, data ?? "");
      else if (level === "warn") console.warn(line, data ?? "");
      else console.log(line, data ?? "");
    }
  }

  debug(module: string, event: string, data?: unknown) {
    this.push("debug", module, event, data);
  }
  info(module: string, event: string, data?: unknown) {
    this.push("info", module, event, data);
  }
  warn(module: string, event: string, data?: unknown) {
    this.push("warn", module, event, data);
  }
  error(module: string, event: string, data?: unknown) {
    this.push("error", module, event, data);
  }

  query(q: LogQuery = {}): LogEntry[] {
    const min = q.level ? LEVEL_ORDER[q.level] : 0;
    const limit = Math.min(q.limit ?? 50, MAX_QUERY);
    const out: LogEntry[] = [];
    for (let i = this.buf.length - 1; i >= 0 && out.length < limit; i--) {
      const e = this.buf[i];
      if (LEVEL_ORDER[e.level] < min) continue;
      if (q.module && e.module !== q.module) continue;
      if (q.event && !e.event.includes(q.event)) continue;
      if (q.since && e.ts < q.since) continue;
      out.push(e);
    }
    return out;
  }

  get sessionId() {
    return this.session;
  }

  _reset() {
    this.buf = [];
    this.session = newSessionId();
  }
}

export const log = new Logger();

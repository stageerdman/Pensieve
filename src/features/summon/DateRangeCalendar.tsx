import { useEffect, useMemo, useRef, useState } from "react";

// A compact calendar for picking a custom date range, with a drill-down header for fast
// navigation: the month/year label opens a months grid; the year opens a years grid —
// so you pick year → month → day. Range selection: click a start day, then an end day;
// the days in between highlight. Monday-first. Pure/self-contained — no dependency.

const DAY = 86_400_000;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["M", "T", "W", "T", "F", "S", "S"];

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const endOfDay = (ts: number) => startOfDay(ts) + DAY - 1;

// Magical golden heatmap (Harry-Potter Pensieve). A translucent gold overlay so it reads
// the same on light + dark; intensity scales with how many notes fall in the period.
export const goldBg = (count: number, max: number): string | undefined =>
  count > 0 ? `hsl(43 92% 55% / ${(0.14 + 0.52 * (count / max)).toFixed(3)})` : undefined;
// Today's marker: a golden ring with a soft glow.
const TODAY_RING = "0 0 0 1.5px hsl(43 90% 55%), 0 0 7px hsl(43 95% 60% / 0.55)";

/** A concise label for a [start,end] range, e.g. "Jan 3", "Jan 3 – 18", "Dec 30 – Jan 5",
 *  adding a 2-digit year when the range isn't in the current year. */
export function formatRange(start: number, end: number, now: number): string {
  const ds = new Date(start);
  const de = new Date(end);
  const curYear = ds.getFullYear() === new Date(now).getFullYear() && de.getFullYear() === ds.getFullYear();
  const fmt = (d: Date, withMonth = true) => {
    let s = (withMonth ? MON[d.getMonth()] + " " : "") + d.getDate();
    if (!curYear) s += ` '${String(d.getFullYear()).slice(-2)}`;
    return s;
  };
  if (startOfDay(start) === startOfDay(end)) return fmt(ds);
  const sameMonth = ds.getFullYear() === de.getFullYear() && ds.getMonth() === de.getMonth();
  return `${fmt(ds)} – ${fmt(de, !sameMonth)}`;
}

interface Props {
  start: number; // current range endpoints (ms)
  end: number;
  now: number;
  stamps: number[]; // note timestamps (for the active field) → density heatmap
  onPick: (start: number, end: number) => void; // startOfDay(min) .. endOfDay(max)
}

type Mode = "days" | "months" | "years";

export function DateRangeCalendar({ start, end, now, stamps, onPick }: Props) {
  const [view, setView] = useState(() => {
    const d = new Date(start || now);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [mode, setMode] = useState<Mode>("days");
  const [anchor, setAnchor] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const today = startOfDay(now);
  const nowD = new Date(now);

  // Note-density counts for the current view (per day / per month / per year).
  const heat = useMemo(() => {
    const map = new Map<number, number>();
    if (mode === "days") {
      const mStart = new Date(view.y, view.m, 1).getTime();
      const mEnd = new Date(view.y, view.m + 1, 1).getTime();
      for (const t of stamps) if (t >= mStart && t < mEnd) {
        const d = startOfDay(t);
        map.set(d, (map.get(d) ?? 0) + 1);
      }
    } else if (mode === "months") {
      for (const t of stamps) {
        const d = new Date(t);
        if (d.getFullYear() === view.y) map.set(d.getMonth(), (map.get(d.getMonth()) ?? 0) + 1);
      }
    } else {
      const base = Math.floor(view.y / 12) * 12;
      for (const t of stamps) {
        const y = new Date(t).getFullYear();
        if (y >= base && y < base + 12) map.set(y, (map.get(y) ?? 0) + 1);
      }
    }
    return { map, max: Math.max(1, ...map.values()) };
  }, [mode, view.y, view.m, stamps]);

  const noteTitle = (count: number) => (count > 0 ? `${count} note${count > 1 ? "s" : ""}` : undefined);

  // Scroll the calendar into view the moment it opens, so you don't have to scroll.
  useEffect(() => {
    try {
      rootRef.current?.scrollIntoView({ block: "nearest" });
    } catch {
      /* jsdom / unsupported — ignore */
    }
  }, []);

  const navBtn = "px-1 text-text-muted hover:text-text";
  const headBtn = "rounded px-2 py-0.5 text-[12px] text-text hover:bg-surface";

  const Header = ({ label, onLabel, onPrev, onNext }: { label: string; onLabel?: () => void; onPrev: () => void; onNext: () => void }) => (
    <div className="mb-1 flex items-center justify-between px-1">
      <button type="button" onClick={onPrev} className={navBtn} aria-label="Previous">
        ‹
      </button>
      {onLabel ? (
        <button type="button" onClick={onLabel} className={headBtn}>
          {label}
        </button>
      ) : (
        <span className="text-[12px] text-text">{label}</span>
      )}
      <button type="button" onClick={onNext} className={navBtn} aria-label="Next">
        ›
      </button>
    </div>
  );

  if (mode === "years") {
    const base = Math.floor(view.y / 12) * 12;
    const years = Array.from({ length: 12 }, (_, i) => base + i);
    return (
      <div ref={rootRef} className="mt-1 select-none">
        <Header
          label={`${base} – ${base + 11}`}
          onPrev={() => setView((v) => ({ ...v, y: v.y - 12 }))}
          onNext={() => setView((v) => ({ ...v, y: v.y + 12 }))}
        />
        <div className="grid grid-cols-3 gap-1">
          {years.map((y) => {
            const count = heat.map.get(y) ?? 0;
            const selected = y === view.y;
            return (
              <button
                key={y}
                type="button"
                title={noteTitle(count)}
                onClick={() => {
                  setView((v) => ({ ...v, y }));
                  setMode("months");
                }}
                style={{
                  background: selected ? undefined : goldBg(count, heat.max),
                  boxShadow: y === nowD.getFullYear() ? TODAY_RING : undefined,
                }}
                className={
                  "rounded-md px-2 py-1.5 text-[12px] " +
                  (selected ? "bg-accent/20 text-text" : count ? "text-text" : "text-text-muted hover:bg-surface hover:text-text")
                }
              >
                {y}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (mode === "months") {
    return (
      <div ref={rootRef} className="mt-1 select-none">
        <Header
          label={`${view.y}`}
          onLabel={() => setMode("years")}
          onPrev={() => setView((v) => ({ ...v, y: v.y - 1 }))}
          onNext={() => setView((v) => ({ ...v, y: v.y + 1 }))}
        />
        <div className="grid grid-cols-3 gap-1">
          {MON.map((mName, m) => {
            const count = heat.map.get(m) ?? 0;
            const selected = m === view.m;
            const isToday = view.y === nowD.getFullYear() && m === nowD.getMonth();
            return (
              <button
                key={mName}
                type="button"
                title={noteTitle(count)}
                onClick={() => {
                  setView((v) => ({ ...v, m }));
                  setMode("days");
                }}
                style={{
                  background: selected ? undefined : goldBg(count, heat.max),
                  boxShadow: isToday ? TODAY_RING : undefined,
                }}
                className={
                  "rounded-md px-2 py-1.5 text-[12px] " +
                  (selected ? "bg-accent/20 text-text" : count ? "text-text" : "text-text-muted hover:bg-surface hover:text-text")
                }
              >
                {mName}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- days mode ----
  const firstDow = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();

  const [lo, hi] =
    anchor !== null
      ? [Math.min(anchor, hover ?? anchor), Math.max(anchor, hover ?? anchor)]
      : [startOfDay(start), startOfDay(end)];

  const shiftMonth = (delta: number) => {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  const clickDay = (ts: number) => {
    if (anchor === null) {
      setAnchor(ts);
      setHover(ts);
    } else {
      const s = Math.min(anchor, ts);
      const e = Math.max(anchor, ts);
      setAnchor(null);
      onPick(startOfDay(s), endOfDay(e));
    }
  };

  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.y, view.m, d).getTime());

  return (
    <div ref={rootRef} className="mt-1 select-none">
      <Header
        label={`${MON[view.m]} ${view.y}`}
        onLabel={() => setMode("months")}
        onPrev={() => shiftMonth(-1)}
        onNext={() => shiftMonth(1)}
      />
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WD.map((w, i) => (
          <span key={i} className="text-[9px] uppercase text-text-muted/60">
            {w}
          </span>
        ))}
        {cells.map((ts, i) => {
          if (ts === null) return <span key={i} />;
          const day = startOfDay(ts);
          const inRange = day >= lo && day <= hi;
          const isEnd = day === lo || day === hi;
          const count = heat.map.get(day) ?? 0;
          return (
            <button
              key={i}
              type="button"
              title={noteTitle(count)}
              onPointerEnter={() => anchor !== null && setHover(ts)}
              onClick={() => clickDay(ts)}
              style={{
                background: isEnd || inRange ? undefined : goldBg(count, heat.max),
                boxShadow: day === today ? TODAY_RING : undefined,
              }}
              className={
                "mx-auto flex h-6 w-6 items-center justify-center rounded text-[12px] " +
                (isEnd
                  ? "bg-accent text-surface"
                  : inRange
                    ? "bg-accent/20 text-text"
                    : count
                      ? "text-text"
                      : "text-text-muted hover:bg-surface hover:text-text")
              }
            >
              {new Date(ts).getDate()}
            </button>
          );
        })}
      </div>
      {anchor !== null && <p className="mt-1 px-1 text-[11px] text-text-muted">Pick the end day…</p>}
    </div>
  );
}

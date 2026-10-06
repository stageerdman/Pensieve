import { useState } from "react";

// A compact month calendar for picking a custom date range: click a start day, then an
// end day; the days in between highlight so you see the selected period. Monday-first to
// match the app's week convention. Pure/self-contained — no date-picker dependency.

const DAY = 86_400_000;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["M", "T", "W", "T", "F", "S", "S"];

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const endOfDay = (ts: number) => startOfDay(ts) + DAY - 1;

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
  onPick: (start: number, end: number) => void; // startOfDay(min) .. endOfDay(max)
}

export function DateRangeCalendar({ start, end, now, onPick }: Props) {
  const [view, setView] = useState(() => {
    const d = new Date(start || now);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [anchor, setAnchor] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const firstDow = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();

  // The range to paint: the pending anchor→hover selection, else the committed value.
  const [lo, hi] = anchor !== null
    ? [Math.min(anchor, hover ?? anchor), Math.max(anchor, hover ?? anchor)]
    : [startOfDay(start), startOfDay(end)];

  const shift = (delta: number) => {
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
    <div className="mt-1 select-none">
      <div className="mb-1 flex items-center justify-between px-1">
        <button type="button" onClick={() => shift(-1)} className="px-1 text-text-muted hover:text-text" aria-label="Previous month">
          ‹
        </button>
        <span className="text-[12px] text-text">
          {MON[view.m]} {view.y}
        </span>
        <button type="button" onClick={() => shift(1)} className="px-1 text-text-muted hover:text-text" aria-label="Next month">
          ›
        </button>
      </div>
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
          return (
            <button
              key={i}
              type="button"
              onPointerEnter={() => anchor !== null && setHover(ts)}
              onClick={() => clickDay(ts)}
              className={
                "mx-auto flex h-6 w-6 items-center justify-center rounded text-[12px] " +
                (isEnd
                  ? "bg-accent text-surface"
                  : inRange
                    ? "bg-accent/20 text-text"
                    : "text-text-muted hover:bg-surface hover:text-text")
              }
            >
              {new Date(ts).getDate()}
            </button>
          );
        })}
      </div>
      {anchor !== null && (
        <p className="mt-1 px-1 text-[11px] text-text-muted">Pick the end day…</p>
      )}
    </div>
  );
}

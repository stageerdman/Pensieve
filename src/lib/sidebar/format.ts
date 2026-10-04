// Timestamp formatting for sidebar rows. `now` is injectable for deterministic
// tests. Relative time is the calm default; absolute times are terse (month+day,
// plus a 2-digit year only when it differs from now) and render in mono on the row.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function relativeTime(ts: number, now: number = Date.now()): string {
  const s = Math.floor((now - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

export function absoluteDate(ts: number, now: number = Date.now()): string {
  const d = new Date(ts);
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  const year = d.getFullYear();
  return year === new Date(now).getFullYear()
    ? base
    : `${base} '${String(year).slice(-2)}`;
}

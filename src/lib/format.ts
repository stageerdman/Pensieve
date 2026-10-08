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

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

/** Human byte size: "840 B", "42 MB", "18.2 GB", "1 TB". One decimal only when it
 *  adds information (value < 10 in its unit), and never a trailing ".0". */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  let u = 0;
  let v = n;
  while (v >= 1024 && u < BYTE_UNITS.length - 1) {
    v /= 1024;
    u++;
  }
  const rounded = v < 10 && u > 0 ? Math.round(v * 10) / 10 : Math.round(v);
  return `${rounded} ${BYTE_UNITS[u]}`;
}

export function absoluteDate(ts: number, now: number = Date.now()): string {
  const d = new Date(ts);
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  const year = d.getFullYear();
  return year === new Date(now).getFullYear()
    ? base
    : `${base} '${String(year).slice(-2)}`;
}

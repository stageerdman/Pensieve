// Turn a detected date LABEL (whatever the AI read off a journal page header — "Nov 3",
// "November 3rd", "3/11", "Mon Nov 3") into a real timestamp for the final Memory's
// createdAt/addedAt, so it sorts and displays as if logged that day. No year on the page
// is the common case for a paper journal — a bare "Nov 3" assumes the CURRENT year,
// rolling back one year if that would land in the future (the owner wrote it in the
// past, not next year). Never blocks Memory creation: an unparseable label just falls
// back to `now` — a guess is fine, losing the whole page is not.

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

function monthIndex(token: string): number {
  const t = token.toLowerCase().slice(0, 3);
  return MONTHS.indexOf(t);
}

/** `label` is whatever the AI extracted as a page's date header; `now` defaults to the
 *  real clock but is injectable for deterministic tests. Returns epoch ms, never throws. */
export function parseDetectedDate(label: string | null | undefined, now: Date = new Date()): number {
  const fallback = now.getTime();
  const text = (label ?? "").trim();
  if (!text) return fallback;

  // "Nov 3", "November 3", "Nov 3rd", optionally with a leading weekday or trailing year.
  const monthFirst = text.match(/([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/);
  if (monthFirst) {
    const m = monthIndex(monthFirst[1]);
    const day = Number(monthFirst[2]);
    if (m >= 0 && day >= 1 && day <= 31) {
      return resolveYear(m, day, monthFirst[3] ? Number(monthFirst[3]) : null, now);
    }
  }

  // "3 Nov", "3rd November", optional year.
  const dayFirst = text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})\.?(?:,?\s*(\d{4}))?/);
  if (dayFirst) {
    const m = monthIndex(dayFirst[2]);
    const day = Number(dayFirst[1]);
    if (m >= 0 && day >= 1 && day <= 31) {
      return resolveYear(m, day, dayFirst[3] ? Number(dayFirst[3]) : null, now);
    }
  }

  // Numeric "11/3" or "3/11" or "2026-11-03" — ambiguous day/month order; only trusted
  // with an explicit 4-digit year (ISO) to avoid silently guessing the wrong one.
  const iso = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, mo, d] = iso;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    if (!Number.isNaN(dt.getTime())) return dt.getTime();
  }

  return fallback;
}

function resolveYear(month: number, day: number, explicitYear: number | null, now: Date): number {
  if (explicitYear) return new Date(explicitYear, month, day).getTime();
  const thisYear = now.getFullYear();
  const candidate = new Date(thisYear, month, day);
  // A bare month/day in the future relative to "now" almost certainly means last year's
  // entry (paper journals are written in the past, not pre-dated).
  if (candidate.getTime() > now.getTime()) return new Date(thisYear - 1, month, day).getTime();
  return candidate.getTime();
}

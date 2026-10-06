// Calendar-correct date-phrase resolution for Summon. "Calendar-correct" means "last
// month" in February resolves to all of January — NOT a rolling 30 days. Only the
// explicit "last N days" family is rolling. Everything is computed against an injected
// `now` in LOCAL time, matching the gallery's bucket logic, so tests are deterministic.
//
// Week starts on MONDAY (see wiki.md — revisit if the owner prefers Sunday).

import type { DateRange } from "./types";

const DAY = 86_400_000;

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Last millisecond of the day containing `ts`. */
function endOfDay(ts: number): number {
  return startOfDay(ts) + DAY - 1;
}

/** Start-of-week (Monday 00:00) for the week containing `ts`. */
function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  const offset = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return d.getTime() - offset * DAY;
}

function startOfMonth(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** Start of the month `delta` months away from the month containing `ts` (delta<0 = past). */
function shiftMonth(ts: number, delta: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + delta, 1).getTime();
}

function startOfYear(ts: number): number {
  return new Date(new Date(ts).getFullYear(), 0, 1).getTime();
}

/** A resolved phrase: the range plus a canonical label for the chip. */
export interface ResolvedDate {
  range: DateRange;
  label: string; // canonical phrase, e.g. "last month"
}

function range(start: number, end: number): DateRange {
  return { start, end };
}

/**
 * Resolve a normalized date phrase to a range, or null if it isn't a date phrase.
 * `phrase` should already be lowercased and trimmed. Recognizes:
 *   today · yesterday · today or yesterday
 *   this week · last week · this month · last month · this year · last year
 *   last N days / past N days / last N weeks / last N months
 */
export function resolveDatePhrase(phrase: string, now: number): ResolvedDate | null {
  const p = phrase.trim().toLowerCase().replace(/\s+/g, " ");

  switch (p) {
    case "today":
      return { range: range(startOfDay(now), endOfDay(now)), label: "today" };
    case "yesterday":
      return { range: range(startOfDay(now) - DAY, startOfDay(now) - 1), label: "yesterday" };
    case "today or yesterday":
    case "yesterday or today":
      return { range: range(startOfDay(now) - DAY, endOfDay(now)), label: "today or yesterday" };
    case "this week":
      return { range: range(startOfWeek(now), endOfDay(now)), label: "this week" };
    case "last week": {
      const thisWeek = startOfWeek(now);
      return { range: range(thisWeek - 7 * DAY, thisWeek - 1), label: "last week" };
    }
    case "this month":
      return { range: range(startOfMonth(now), endOfDay(now)), label: "this month" };
    case "last month":
      return { range: range(shiftMonth(now, -1), startOfMonth(now) - 1), label: "last month" };
    case "this year":
      return { range: range(startOfYear(now), endOfDay(now)), label: "this year" };
    case "last year": {
      const thisYear = startOfYear(now);
      const lastYear = new Date(new Date(now).getFullYear() - 1, 0, 1).getTime();
      return { range: range(lastYear, thisYear - 1), label: "last year" };
    }
  }

  // "last <weekday>" → the most recent PAST occurrence of that weekday (never today).
  const wd = p.match(/^last (sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (wd) {
    const target = WEEKDAYS[wd[1]];
    const today = startOfDay(now);
    const dow = new Date(now).getDay();
    let back = (dow - target + 7) % 7;
    if (back === 0) back = 7; // "last monday" on a Monday means the previous one
    const day = today - back * DAY;
    return { range: range(day, day + DAY - 1), label: `last ${wd[1]}` };
  }

  // Rolling "last/past N day|week|month(s)". N calendar days INCLUDING today, i.e.
  // "last 7 days" = today + the previous 6 days.
  const m = p.match(/^(?:last|past) (\d{1,4}) (day|days|week|weeks|month|months)$/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1) {
      const unit = m[2];
      const days = unit.startsWith("day") ? n : unit.startsWith("week") ? n * 7 : null;
      if (days !== null) {
        return {
          range: range(startOfDay(now) - (days - 1) * DAY, endOfDay(now)),
          label: `last ${n} ${unit.replace(/s$/, "")}${n === 1 ? "" : "s"}`,
        };
      }
      // months: from the start of the month (N-1) months ago, through end of today.
      return {
        range: range(shiftMonth(now, -(n - 1)), endOfDay(now)),
        label: `last ${n} month${n === 1 ? "" : "s"}`,
      };
    }
  }

  return null;
}

/** All canonical date phrases we offer as suggestions (for the dropdown + whispering). */
export const DATE_PHRASES = [
  "today",
  "yesterday",
  "today or yesterday",
  "this week",
  "last week",
  "this month",
  "last month",
  "last 7 days",
  "last 30 days",
  "this year",
  "last year",
  "last monday",
  "last tuesday",
  "last wednesday",
  "last thursday",
  "last friday",
  "last saturday",
  "last sunday",
] as const;

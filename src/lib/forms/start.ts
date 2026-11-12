// start.ts — the body of a brand-new memory started from a form: the form's questions
// (blank, charms left out — see instantiate) under a dated title, so a month of Daily
// Reviews reads "Daily Review — Thu 12 Nov", "Daily Review — Fri 13 Nov", …
//
// Pure + dependency-free (shared with the phone PWA).

import { instantiate } from "./answers";
import { parseForm } from "./parse";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dayLabel(d: Date): string {
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function memoryFromForm(templateMd: string, date: Date): string {
  const body = instantiate(templateMd);
  const { title, titleLine } = parseForm(body);
  const dated = `${title || "Form"} — ${dayLabel(date)}`;
  if (titleLine < 0) return dated;
  const lines = body.split("\n");
  // Keep a heading mark if the form's title was a heading.
  const mark = /^\s*(#{1,6}\s+)/.exec(lines[titleLine])?.[1] ?? "";
  lines[titleLine] = mark + dated;
  return lines.join("\n");
}

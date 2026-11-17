import eventData from "../data/events.json";
import type { ChurchEvent, Venue } from "./types";

export const events = eventData.events as unknown as ChurchEvent[];
export const venues = eventData.venues as unknown as Record<string, Venue>;

export interface Occurrence { event: ChurchEvent; date: string; start: string; end: string }

const DAY = 86_400_000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => toIso(new Date(toDate(iso).getTime() + days * DAY));
const weekdayOf = (iso: string) => toDate(iso).getUTCDay();

function firstWeekdayOfMonth(year: number, month: number, weekday: number): string {
  const first = new Date(Date.UTC(year, month, 1));
  return toIso(new Date(first.getTime() + ((weekday - first.getUTCDay() + 7) % 7) * DAY));
}

export function occurrencesBetween(event: ChurchEvent, from: string, until: string, limit = 100): Occurrence[] {
  const schedule = event.schedule;
  const results: Occurrence[] = [];
  const push = (date: string) => results.push({ event, date, start: event.start, end: event.end });
  if (schedule.kind === "single") {
    if (schedule.date >= from && schedule.date <= until) push(schedule.date);
    return results;
  }
  const exclusions = new Set(schedule.exclusions ?? []);
  const stop = schedule.until && schedule.until < until ? schedule.until : until;
  if (schedule.kind === "weekly") {
    let cursor = schedule.from > from ? schedule.from : from;
    cursor = addDays(cursor, (schedule.weekday - weekdayOf(cursor) + 7) % 7);
    while (cursor <= stop && results.length < limit) {
      if (!exclusions.has(cursor)) push(cursor);
      cursor = addDays(cursor, 7);
    }
    return results;
  }
  const start = toDate(schedule.from > from ? schedule.from : from);
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  while (results.length < limit) {
    const candidate = firstWeekdayOfMonth(year, month, schedule.weekday);
    if (candidate > stop) break;
    if (candidate >= from && candidate >= schedule.from && !exclusions.has(candidate)) push(candidate);
    month += 1;
    if (month === 12) { month = 0; year += 1; }
  }
  return results;
}

export function upcoming(today: string, days = 70, limit?: number): Occurrence[] {
  const until = addDays(today, days);
  const all = events.flatMap((event) => occurrencesBetween(event, today, until));
  all.sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)));
  return limit ? all.slice(0, limit) : all;
}

export function eventById(id: string): ChurchEvent | undefined {
  return events.find((event) => event.id === id);
}

export function nextOccurrence(id: string, today: string): Occurrence | null {
  const event = eventById(id);
  return event ? occurrencesBetween(event, today, addDays(today, 366), 1)[0] ?? null : null;
}

export const isRecurring = (event: ChurchEvent) => event.schedule.kind !== "single";

export function pastEvents(today: string): ChurchEvent[] {
  const key = (e: ChurchEvent) => (e.schedule.kind === "single" ? e.schedule.date : e.schedule.until ?? e.schedule.from);
  return events
    .filter((e) => (e.schedule.kind === "single" ? e.schedule.date < today : Boolean(e.schedule.until && e.schedule.until < today)))
    .sort((a, b) => key(b).localeCompare(key(a)));
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "pm" : "am"}`;
}
export const formatTimeRange = (start: string, end: string) => `${formatTime(start)} – ${formatTime(end)}`;
export function formatLongDate(iso: string): string {
  const d = toDate(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function formatDate(iso: string): string {
  const d = toDate(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export const monthAbbreviation = (iso: string) => MONTHS[toDate(iso).getUTCMonth()]!.slice(0, 3).toUpperCase();
export const dayOfMonth = (iso: string) => String(toDate(iso).getUTCDate());

export function scheduleLabel(event: ChurchEvent): string {
  const range = formatTimeRange(event.start, event.end);
  if (event.schedule.kind === "weekly") return `Every ${WEEKDAYS[event.schedule.weekday]}, ${range}`;
  if (event.schedule.kind === "monthly-first") return `First ${WEEKDAYS[event.schedule.weekday]} of the month, ${range}`;
  return `${formatLongDate(event.schedule.date)}, ${range}`;
}

/** Today's date in Melbourne at build time. Scheduled rebuilds keep "next" dates current. */
/** Melbourne's UTC offset on a day at a local time: "+11:00" in daylight saving, "+10:00" otherwise. */
export function melbourneOffset(iso: string, time = "12:00"): string {
  const probe = new Date(`${iso}T${time}:00+10:00`);
  const name = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", timeZoneName: "shortOffset" }).formatToParts(probe).find((part) => part.type === "timeZoneName")?.value ?? "GMT+10";
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/u.exec(name);
  return match ? `${match[1]}${match[2]!.padStart(2, "0")}:${match[3] ?? "00"}` : "+10:00";
}
/** ISO 8601 duration for structured data: 3326 → "PT55M26S". */
export function isoDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || (!h && !m) ? `${s}S` : ""}`;
}

export function melbourneToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

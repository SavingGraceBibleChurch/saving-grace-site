// Subscribable iCalendar feed of the church's gatherings for the coming year.
import { events, venues, occurrencesBetween, melbourneToday, addDays } from "../../lib/events";
import { plainText } from "../../lib/markup";
import { SITE } from "../../lib/content";

const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const fold = (line: string) => line.match(/.{1,73}/gu)?.join("\r\n ") ?? line;
const stamp = (date: string, time: string) => `${date.replaceAll("-", "")}T${time.replace(":", "")}00`;

export function GET() {
  const today = melbourneToday();
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Saving Grace Bible Church//Events//EN", "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH", "X-WR-CALNAME:Saving Grace Bible Church", "X-WR-TIMEZONE:Australia/Melbourne",
  ];
  for (const event of events) {
    const venue = venues[event.venue];
    for (const o of occurrencesBetween(event, addDays(today, -30), addDays(today, 365), 200)) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${event.id}-${o.date}@savinggrace.org.au`,
        `DTSTAMP:${now}`,
        `DTSTART;TZID=Australia/Melbourne:${stamp(o.date, o.start)}`,
        `DTEND;TZID=Australia/Melbourne:${stamp(o.date, o.end)}`,
        `SUMMARY:${escape(event.title)}`,
        `DESCRIPTION:${escape(event.description.map(plainText).join("\n\n"))}`,
        `LOCATION:${escape(venue ? `${venue.name}, ${venue.address}, ${venue.locality}` : "")}`,
        `URL:${SITE}${event.path}`,
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.map(fold).join("\r\n") + "\r\n", { headers: { "Content-Type": "text/calendar; charset=utf-8" } });
}

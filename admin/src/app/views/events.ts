// Events: the list, and an editor for title, schedule, times, place and description.
import type { ChurchEvent, Schedule } from "../../../../src/lib/types";
import { DATA, STAGING } from "../config";
import type { Ctx } from "../context";
import { jsonEdit, type Edit, type Redirect } from "../store";
import { WEEKDAYS, shortDate, slugify, toParagraphs, today } from "../text";
import { badge, button, card, external, field, h, input, mount, nextId, pageHead, problemsBox, saveBar, select, setDirty, textarea } from "../ui";

type Events = { events: ChurchEvent[]; venues: Record<string, { name: string }> };

function to12h(time: string) {
  const [hh, mm] = time.split(":").map(Number);
  return `${((hh! + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh! < 12 ? "am" : "pm"}`;
}
export function describeSchedule(s: Schedule) {
  if (s.kind === "single") return shortDate(s.date);
  const every = s.kind === "weekly" ? `Every ${WEEKDAYS[s.weekday]}` : `First ${WEEKDAYS[s.weekday]} of the month`;
  return `${every}, from ${shortDate(s.from)}${s.until ? ` to ${shortDate(s.until)}` : ""}`;
}
const isPast = (e: ChurchEvent) => (e.schedule.kind === "single" ? e.schedule.date < today() : Boolean(e.schedule.until && e.schedule.until < today()));

export function eventListPage(ctx: Ctx): Node {
  const { events, venues } = ctx.store.data.events;
  const sorted = [...events].sort((a, b) => Number(isPast(a)) - Number(isPast(b)) || a.title.localeCompare(b.title));
  return h("div", null,
    pageHead("Events", button("Add event", () => ctx.go("#/events/new"), "primary")),
    h("p", { class: "page-head__lede", text: "Regular meetings and one-off events. They appear on the Events page, the calendar feed and the linked ministry pages." }),
    h("ul", { class: "rows" }, sorted.map((e) => h("li", { class: "rows__item" },
      h("a", { class: "rows__link", attrs: { href: `#/events/${encodeURIComponent(e.id)}` } },
        h("span", { class: "rows__date", text: `${to12h(e.start)}` }),
        h("span", { class: "rows__main" }, h("span", { class: "rows__title", text: e.title }), h("span", { class: "rows__meta", text: `${describeSchedule(e.schedule)} · ${venues[e.venue]?.name ?? e.venue}` })),
        h("span", { class: "rows__badges" }, isPast(e) ? badge("Finished", "muted") : e.schedule.kind === "single" ? badge("One-off", "info") : badge("Regular", "ok")))))));
}

export async function eventEditPage(ctx: Ctx, id: string | null): Promise<Node> {
  const store = ctx.store;
  const data = store.data.events;
  const original = id === null ? null : data.events.find((e) => e.id === id);
  if (id !== null && !original) return h("div", { class: "empty" }, h("h1", { text: "Event not found" }), h("a", { class: "link", attrs: { href: "#/events" }, text: "Back to events" }));
  const pages = (await store.json<{ id: string; h1: string; path: string }[]>(DATA.pages)) ?? [];

  const draft: ChurchEvent = original ? structuredClone(original) : {
    id: "", title: "", path: "", schedule: { kind: "weekly", weekday: 0, from: today() }, start: "10:30", end: "12:00", venue: "church", description: [], legacyPaths: [],
  };
  let idTouched = false;
  const problems = h("div");

  // details
  const idInfo = h("p", { class: "field__hint" });
  const idInput = input(draft.id, { disabled: Boolean(original), autocomplete: "off", spellcheck: "false" }, (v) => { idTouched = true; draft.id = v.trim(); showId(); });
  const showId = () => {
    if (original) { idInfo.textContent = "The web address can't change once an event is published."; return; }
    const taken = data.events.some((e) => e.id === draft.id);
    idInfo.replaceChildren(draft.id ? `/event/${draft.id}/` : "Fills in from the title.", taken ? h("strong", { class: "is-error", text: " — already used" }) : "");
  };
  const titleInput = input(draft.title, { autocomplete: "off" }, (v) => { draft.title = v; if (!original && !idTouched) { draft.id = slugify(v); idInput.value = draft.id; showId(); } });
  showId();

  // schedule
  const scheduleHost = h("div", { class: "form-grid" });
  const kindSelect = select([{ value: "weekly", label: "Every week" }, { value: "monthly-first", label: "First week of every month" }, { value: "single", label: "One day only" }], draft.schedule.kind, (v) => {
    const prev = draft.schedule;
    const day = prev.kind === "single" ? prev.date : prev.from;
    draft.schedule = v === "single" ? { kind: "single", date: day } : { kind: v as "weekly" | "monthly-first", weekday: prev.kind === "single" ? new Date(`${day}T00:00:00`).getDay() : prev.weekday, from: day, ...(prev.kind !== "single" && prev.until ? { until: prev.until } : {}), ...(prev.kind !== "single" && prev.exclusions?.length ? { exclusions: prev.exclusions } : {}) };
    renderSchedule();
  });
  const renderSchedule = () => {
    const s = draft.schedule;
    if (s.kind === "single") {
      mount(scheduleHost, field("Date", input(s.date, { type: "date" }, (v) => { s.date = v; })));
      return;
    }
    const skipped = h("ul", { class: "chips" });
    const renderSkipped = () => mount(skipped, (s.exclusions ?? []).length ? (s.exclusions ?? []).map((d) => h("li", { class: "chip" }, h("span", { text: shortDate(d) }),
      h("button", { class: "chip__remove", attrs: { type: "button", "aria-label": `Don't skip ${shortDate(d)}` }, text: "×", on: { click: () => { s.exclusions = (s.exclusions ?? []).filter((x) => x !== d); if (!s.exclusions.length) delete s.exclusions; setDirty(true); renderSkipped(); } } })))
      : h("li", { class: "chips__empty", text: "None" }));
    const skipInput = h("input", { class: "input input--inline", attrs: { type: "date", id: nextId("skip"), "aria-label": "Date to skip" } });
    const addSkip = button("Skip this date", () => {
      const v = skipInput.value;
      if (!v) return;
      s.exclusions = [...new Set([...(s.exclusions ?? []), v])].sort();
      skipInput.value = "";
      setDirty(true);
      renderSkipped();
    });
    renderSkipped();
    mount(scheduleHost,
      field("Day", select(WEEKDAYS.map((d, i) => ({ value: String(i), label: d })), String(s.weekday), (v) => { s.weekday = Number(v); })),
      field("Starting from", input(s.from, { type: "date" }, (v) => { s.from = v; })),
      field("Until (optional)", input(s.until ?? "", { type: "date" }, (v) => { if (v) s.until = v; else delete s.until; }), { hint: "Leave empty if it carries on." }),
      h("div", { class: "field field--wide" }, h("span", { class: "field__label", text: "Skipped dates" }), skipped, h("div", { class: "row" }, skipInput, addSkip), h("p", { class: "field__hint", text: "For holidays and other weeks it doesn't meet." })));
  };
  renderSchedule();

  const venueSelect = select(Object.entries(data.venues).map(([value, v]) => ({ value, label: v.name })), draft.venue, (v) => { draft.venue = v; });
  const descInput = textarea(draft.description.join("\n\n"), { rows: 8 }, (v) => { draft.description = toParagraphs(v); });
  const tagInput = input(draft.tag ?? "", { placeholder: "e.g. #TS", autocomplete: "off" }, (v) => { if (v.trim()) draft.tag = v.trim(); else delete draft.tag; });
  const images = store.data.images;
  const mediaSelect = select([{ value: "", label: "No picture" }, ...Object.entries(images).map(([value, img]) => ({ value, label: `${value} — ${img.alt.slice(0, 70)}` }))], draft.media ?? "", (v) => { if (v) draft.media = v; else delete draft.media; });
  const pageSelect = select([{ value: "", label: "No linked page" }, ...pages.map((p) => ({ value: p.id, label: `${p.h1} (${p.path})` }))], draft.page ?? "", (v) => { if (v) draft.page = v; else delete draft.page; });

  const save = async () => {
    const errors: string[] = [];
    draft.title = draft.title.trim();
    if (!draft.title) errors.push("Give the event a title.");
    if (!original && (!draft.id || data.events.some((e) => e.id === draft.id))) errors.push("Choose a web address that isn't already used.");
    if (errors.length) { problems.replaceChildren(problemsBox("Not saved yet:", errors)); return; }
    if (!original) draft.path = `/event/${draft.id}/`;
    const record = orderEvent(draft);
    const sha = await ctx.save(`${original ? "Edit" : "Add"} event: ${draft.title}`, [jsonEdit<Events>(DATA.events, (d) => {
      const at = d.events.findIndex((e) => e.id === record.id);
      if (at >= 0) d.events[at] = record; else d.events.push(record);
    }, (d) => d.events.find((e) => e.id === record.id))], problems);
    if (!sha) return;
    setDirty(false);
    ctx.go(`#/events/${encodeURIComponent(record.id)}?saved=${Date.now()}`);
  };
  const remove = async () => {
    if (!original) return;
    if (!window.confirm(`Remove “${original.title}” from the website?\n\nIts page will redirect to the Events page. This can be undone from the change history.`)) return;
    const edits: Edit[] = [
      jsonEdit<Events>(DATA.events, (d) => { d.events = d.events.filter((e) => e.id !== original.id); }, (d) => d.events.find((e) => e.id === original.id)),
      jsonEdit<Redirect[]>(DATA.redirects, (list) => {
        for (const r of list) if (r.to === original.path) r.to = "/events/";
        const own = list.find((r) => r.from === original.path && r.match === "exact");
        if (own) own.to = "/events/"; else list.push({ from: original.path, to: "/events/", match: "exact", note: `event "${original.title}" removed in the admin` });
      }),
    ];
    const sha = await ctx.save(`Remove event: ${original.title}`, edits, problems);
    if (sha) { setDirty(false); ctx.go("#/events"); }
  };

  return h("div", { class: "editor" },
    h("header", { class: "page-head" },
      h("p", { class: "page-head__crumb" }, h("a", { class: "link", attrs: { href: "#/events" }, text: "Events" }), " / "),
      h("h1", { class: "page-head__title", text: original ? original.title : "Add an event" }),
      original ? h("div", { class: "page-head__extra" }, external("View on staging", `${STAGING}${original.path}`)) : null),
    problems,
    card("Details", h("div", { class: "form-grid" },
      field("Title", titleInput, { wide: true }),
      field("Web address", idInput, { wide: true, hint: idInfo }),
      field("Starts", input(draft.start, { type: "time" }, (v) => { draft.start = v; })),
      field("Ends", input(draft.end, { type: "time" }, (v) => { draft.end = v; })),
      field("Place", venueSelect),
      field("Short tag (optional)", tagInput, { hint: "Shown on the calendar, e.g. #TS." }))),
    card("When", field("How often", kindSelect), scheduleHost),
    card("Description",
      field("Description", descInput, { wide: true, hint: "Separate paragraphs with a blank line. Links: [label](https://…), bold: **text**." }),
      h("div", { class: "form-grid" }, field("Picture", mediaSelect), field("Ministry page to link to", pageSelect))),
    original ? card("Remove", h("p", { class: "card__lede", text: "Take this event off the website. Its page will redirect to the Events page." }), button("Remove event", remove, "danger")) : null,
    saveBar(save, () => { if (window.confirm("Throw away your changes?")) { setDirty(false); ctx.go(original ? `#/events/${encodeURIComponent(original.id)}?reset=${Date.now()}` : "#/events"); } }, original ? "Save and publish" : "Add event"));
}

/** Keep the fields in the same order as the existing data, so the saved change is easy to read. */
function orderEvent(e: ChurchEvent): ChurchEvent {
  const s = e.schedule;
  const schedule: Schedule = s.kind === "single" ? { kind: "single", date: s.date }
    : { kind: s.kind, weekday: s.weekday, from: s.from, ...(s.until ? { until: s.until } : {}), ...(s.exclusions?.length ? { exclusions: s.exclusions } : {}) };
  const out: Record<string, unknown> = { id: e.id, title: e.title, path: e.path, schedule, start: e.start, end: e.end, venue: e.venue, description: e.description };
  for (const key of ["page", "media", "legacyPaths", "sourceIds", "tag"] as const) if ((e as unknown as Record<string, unknown>)[key] !== undefined) out[key] = (e as unknown as Record<string, unknown>)[key];
  return out as unknown as ChurchEvent;
}

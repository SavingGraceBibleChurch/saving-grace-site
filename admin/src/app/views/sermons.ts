// The sermon list: search, filters for what is missing, and links to edit.
import type { Sermon } from "../../../../src/lib/types";
import type { Ctx } from "../context";
import { shortDate } from "../text";
import { badge, button, h, mount, nextId, pageHead } from "../ui";

const PAGE = 60;

export function sermonListPage(ctx: Ctx, _m: RegExpExecArray, query: URLSearchParams): Node {
  const { sermons, taxonomies, descriptions, sources } = ctx.store.data;
  const names = new Map(taxonomies.map((t) => [`${t.kind}:${t.slug}`, t.name]));
  const speakerOf = (s: Sermon) => s.speakers.map((x) => names.get(`speaker:${x}`) ?? x).join(", ");
  const seriesOf = (s: Sermon) => s.series.map((x) => names.get(`series:${x}`) ?? x).join(", ");
  const haystack = new Map(sermons.map((s) => [s, `${s.title} ${speakerOf(s)} ${seriesOf(s)} ${s.passage} ${s.date}`.toLowerCase()]));
  const years = [...new Set(sermons.map((s) => s.date.slice(0, 4)))];
  const speakers = taxonomies.filter((t) => t.kind === "speaker").sort((a, b) => a.name.localeCompare(b.name));

  const state = { q: query.get("q") ?? "", show: query.get("show") ?? "", year: query.get("year") ?? "", speaker: query.get("speaker") ?? "", limit: PAGE };
  const searchId = nextId("search");
  const search = h("input", { class: "input", attrs: { id: searchId, type: "search", placeholder: "Title, speaker, series, passage…", autocomplete: "off" }, value: state.q });
  const mk = (options: [string, string][], value: string, label: string, onChange: (v: string) => void) => {
    const id = nextId("filter");
    const el = h("select", { class: "input input--select", attrs: { id } }, options.map(([v, l]) => h("option", { attrs: { value: v }, text: l })));
    el.value = value;
    el.addEventListener("change", () => onChange(el.value));
    return h("div", { class: "field field--compact" }, h("label", { class: "field__label", attrs: { for: id }, text: label }), el);
  };
  const results = h("div", { class: "list" });
  const count = h("p", { class: "list__count", attrs: { role: "status" } });

  const render = () => {
    const words = state.q.toLowerCase().split(/\s+/u).filter(Boolean);
    const matches = sermons.filter((s) => {
      const id = String(s.wpId);
      if (state.show === "no-description" && descriptions[id]?.trim()) return false;
      if (state.show === "no-transcript" && sources[id]) return false;
      if (state.show === "pending" && !(s.sermonAudioId && !sources[id])) return false;
      if (state.show === "machine" && !(sources[id] && sources[id] !== "church")) return false;
      if (state.year && !s.date.startsWith(state.year)) return false;
      if (state.speaker && !s.speakers.includes(state.speaker)) return false;
      const text = haystack.get(s)!;
      return words.every((w) => text.includes(w));
    });
    count.textContent = `${matches.length} of ${sermons.length} sermons`;
    mount(results, matches.length ? [
      h("ul", { class: "rows" }, matches.slice(0, state.limit).map((s) => row(s))),
      matches.length > state.limit ? button(`Show ${Math.min(PAGE, matches.length - state.limit)} more`, () => { state.limit += PAGE; render(); }, "secondary") : null,
    ] : h("p", { class: "empty", text: "No sermons match." }));
    const params = new URLSearchParams(Object.entries({ q: state.q, show: state.show, year: state.year, speaker: state.speaker }).filter(([, v]) => v));
    history.replaceState(null, "", `#/sermons${params.size ? `?${params}` : ""}`);
  };
  const row = (s: Sermon) => {
    const id = String(s.wpId);
    const source = sources[id];
    return h("li", { class: "rows__item" },
      h("a", { class: "rows__link", attrs: { href: `#/sermons/${s.wpId}` } },
        h("span", { class: "rows__date", text: shortDate(s.date) }),
        h("span", { class: "rows__main" },
          h("span", { class: "rows__title", text: s.title }),
          h("span", { class: "rows__meta", text: [s.passage, speakerOf(s), seriesOf(s)].filter(Boolean).join(" · ") })),
        h("span", { class: "rows__badges" },
          !descriptions[id]?.trim() ? badge("No description", "warn") : null,
          !source ? (s.sermonAudioId ? badge("Transcript pending", "info") : badge("No transcript", "warn")) : null)));
  };

  let debounce: number | undefined;
  search.addEventListener("input", () => { clearTimeout(debounce); debounce = window.setTimeout(() => { state.q = search.value; state.limit = PAGE; render(); }, 120); });
  const view = h("div", null,
    pageHead("Sermons", button("Add sermon", () => ctx.go("#/sermons/new"), "primary")),
    h("div", { class: "toolbar" },
      h("div", { class: "field field--grow" }, h("label", { class: "field__label", attrs: { for: searchId }, text: "Search" }), search),
      mk([["", "All sermons"], ["no-description", "No description"], ["no-transcript", "No transcript"], ["pending", "Transcript pending"], ["machine", "Unchecked machine transcript"]], state.show, "Show", (v) => { state.show = v; state.limit = PAGE; render(); }),
      mk([["", "Any speaker"], ...speakers.map((t): [string, string] => [t.slug, t.name])], state.speaker, "Speaker", (v) => { state.speaker = v; state.limit = PAGE; render(); }),
      mk([["", "Any year"], ...years.map((y): [string, string] => [y, y])], state.year, "Year", (v) => { state.year = v; state.limit = PAGE; render(); })),
    count, results);
  render();
  return view;
}

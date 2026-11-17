// Site search with plain, readable results: title, date, speaker or course, and the page's own summary,
// with no highlighted snippets. Words are matched by Pagefind (whole words, word stems and the start of
// words, so "forgiv" finds "forgiveness"). A Bible reference ("John 3:16", "Luke 6", "1 Peter") also lists
// every sermon whose passage includes it, from the same passage index as the bookshelf.
import { loadPassages, type PassageSermon } from "./passage-data";

export type Scope = "all" | "Sermon" | "Study" | "Page";
interface PagefindResult { id: string; data(): Promise<{ url: string; meta: Record<string, string> }> }
interface Pagefind {
  options(o: unknown): Promise<void>;
  init(): void;
  search(q: string, o?: unknown): Promise<{ results: PagefindResult[] }>;
}

let pagefind: Promise<Pagefind> | undefined;
function loadPagefind(): Promise<Pagefind> {
  const url = "/pagefind/pagefind.js";
  pagefind ??= (import(/* @vite-ignore */ url) as Promise<Pagefind>).then(async (pf) => {
    // Shorter pages are not favoured much (sermon pages vary in length); close word matches count more.
    await pf.options({ ranking: { pageLength: 0.4, termSaturation: 1.2, termSimilarity: 1.5 } });
    pf.init();
    return pf;
  });
  return pagefind;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`; };
const trim = (text: string | undefined, max = 230) => {
  const flat = (text ?? "").replace(/\s+/gu, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).replace(/\s+\S*$/u, "")}…`;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string | null | false)[]) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const child of children) if (child !== null && child !== false) node.append(child);
  return node;
}

interface Hit { url: string; title: string; label: string; meta: string; summary: string }

function fromPagefind(data: { url: string; meta: Record<string, string> }): Hit {
  const m = data.meta;
  const label = m.label ?? "Page";
  const meta = label === "Sermon" ? [m.date, m.speaker, m.passage].filter(Boolean).join(" · ")
    : label === "Tuesday Night Study" ? [m.section ? `${m.course} › ${m.section}` : m.course, m.teacher, m.date].filter(Boolean).join(" · ")
    : "";
  return { url: data.url, title: m.title ?? data.url, label, meta, summary: trim(m.summary) };
}
const fromPassage = (s: PassageSermon): Hit => ({ url: s.u, title: s.t, label: "Sermon", meta: [shortDate(s.d), s.sp, s.r].filter(Boolean).join(" · "), summary: "" });

function hitItem(hit: Hit, showLabel: boolean) {
  return el("li", { class: "hit" },
    showLabel ? el("p", { class: "hit__label" }, hit.label) : null,
    el("h3", { class: "hit__title" }, el("a", { href: hit.url }, hit.title)),
    hit.meta ? el("p", { class: "hit__meta" }, hit.meta) : null,
    hit.summary ? el("p", { class: "hit__summary" }, hit.summary) : null);
}

export interface SearchOptions {
  form: HTMLFormElement;
  input: HTMLInputElement;
  results: HTMLElement;
  status: HTMLElement;
  scope(): Scope;
  /** Called with the query after each search (for example to update the address bar). */
  onSearch?(query: string): void;
  /** Shown while the box is empty or cleared. */
  onClear?(): void;
  pageSize?: number;
}

export function attachSearch(o: SearchOptions) {
  const pageSize = o.pageSize ?? 10;
  let token = 0;
  let timer: number | undefined;

  const clear = () => {
    token++;
    o.results.replaceChildren();
    o.status.textContent = "";
    o.onClear?.();
  };

  const run = async (raw: string) => {
    const query = raw.trim();
    const mine = ++token;
    if (query.length < 2) { clear(); return; }
    o.status.textContent = "Searching…";
    const scope = o.scope();
    try {
      const [pf, passages] = await Promise.all([
        loadPagefind(),
        scope === "all" || scope === "Sermon" ? loadPassages().catch(() => null) : Promise.resolve(null),
      ]);
      const reference = passages?.search(query) ?? null;
      const search = await pf.search(query, scope === "all" ? {} : { filters: { type: scope } });
      if (mine !== token) return;

      const fragment = document.createDocumentFragment();
      const seen = new Set<string>();
      let total = 0;
      if (reference) {
        const hits = reference.results.map(fromPassage);
        hits.forEach((h) => seen.add(h.url));
        total += hits.length;
        const list = el("ol", { class: "hits", role: "list" });
        const showMore = el("button", { class: "button button--outline hits__more", type: "button" }, "Show all");
        const render = (count: number) => { list.replaceChildren(...hits.slice(0, count).map((h) => hitItem(h, false))); showMore.hidden = count >= hits.length; };
        showMore.addEventListener("click", () => render(hits.length));
        render(pageSize);
        fragment.append(el("section", { class: "hits-group", "aria-label": `Sermons on ${reference.label}` },
          el("h2", { class: "hits-group__title" }, hits.length ? `Sermons on ${reference.label}` : `No sermon is recorded on ${reference.label} yet`),
          hits.length ? list : null, hits.length > pageSize ? showMore : null));
      }

      const ranked = search.results;
      const list = el("ol", { class: "hits", role: "list" });
      const more = el("button", { class: "button button--outline hits__more", type: "button" }, "Show more results");
      let shown = 0;
      const showNext = async () => {
        more.disabled = true;
        const slice = ranked.slice(shown, shown + pageSize);
        shown += slice.length;
        const data = await Promise.all(slice.map((r) => r.data()));
        for (const d of data) {
          const hit = fromPagefind(d);
          if (seen.has(hit.url)) continue;
          seen.add(hit.url);
          list.append(hitItem(hit, scope === "all"));
        }
        more.disabled = false;
        more.hidden = shown >= ranked.length;
      };
      more.addEventListener("click", () => void showNext());
      await showNext();
      if (mine !== token) return;
      if (list.children.length) {
        fragment.append(el("section", { class: "hits-group", "aria-label": "Matching words" },
          reference ? el("h2", { class: "hits-group__title" }, "Other matches") : null, list, more));
      }

      o.results.replaceChildren(fragment);
      const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
      o.status.textContent = reference && total
        ? `${plural(total, "sermon", "sermons")} on ${reference.label}${list.children.length ? ", and other pages that mention these words" : ""}`
        : ranked.length
          ? `${plural(ranked.length, "result", "results")} for “${query}”`
          : `Nothing found for “${query}”. Try fewer words, a speaker's name, or a Bible reference such as John 3:16.`;
      o.onSearch?.(query);
    } catch {
      if (mine !== token) return;
      o.status.textContent = "Search is not available right now.";
    }
  };

  o.input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void run(o.input.value), 220);
  });
  o.form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearTimeout(timer);
    void run(o.input.value);
  });
  return { run: (q: string) => { o.input.value = q; return run(q); } };
}

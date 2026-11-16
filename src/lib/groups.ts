// Grouping and ordering helpers for the speaker, series, book and passage pages.
import { sermons, term, termsOf, sermonsFor } from "./content";
import { canonOrder, canonBook } from "./canon";
import { bookGroup } from "./books";
import type { Sermon, TaxonomyTerm } from "./types";

export const mainBook = (sermon: Sermon) => sermon.books.find((slug) => slug !== "selected-text") ?? null;

/** "2019–2021", or "2023" when everything falls in one year. */
export function years(list: Sermon[]): string {
  if (!list.length) return "";
  const all = list.map((s) => Number(s.date.slice(0, 4)));
  const first = Math.min(...all);
  const last = Math.max(...all);
  return first === last ? String(first) : `${first}–${last}`;
}

/** Sort key that reads a book in order: chapter, then verse, then date. */
function passageKey(sermon: Sermon): [number, number, string] {
  const m = sermon.passage.match(/(\d+)(?::(\d+))?/u);
  return [m ? Number(m[1]) : 999, m && m[2] ? Number(m[2]) : 0, sermon.date];
}
export function inPassageOrder(list: Sermon[]): Sermon[] {
  return [...list].sort((a, b) => {
    const [ac, av, ad] = passageKey(a);
    const [bc, bv, bd] = passageKey(b);
    return ac - bc || av - bv || ad.localeCompare(bd);
  });
}
export const oldestFirst = (list: Sermon[]) => [...list].sort((a, b) => a.date.localeCompare(b.date));

export interface BookSection { id: string; title: string; group: string; book?: TaxonomyTerm; sermons: Sermon[] }

/** Splits sermons into one section per Bible book in canonical order, with topical sermons last. */
export function byBook(list: Sermon[]): BookSection[] {
  const map = new Map<string, Sermon[]>();
  for (const sermon of list) {
    const key = mainBook(sermon) ?? "";
    map.set(key, [...(map.get(key) ?? []), sermon]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : canonOrder(a) - canonOrder(b)))
    .map(([slug, items]) => {
      const book = slug ? term("book", slug) : undefined;
      return { id: slug || "topical", title: book?.name ?? "Topical", group: bookGroup(slug || null), book, sermons: slug ? inPassageOrder(items) : items };
    });
}

/** Splits sermons into one section per year, newest year first. */
export function byYear(list: Sermon[]): { year: string; sermons: Sermon[] }[] {
  const map = new Map<string, Sermon[]>();
  for (const sermon of list) map.set(sermon.date.slice(0, 4), [...(map.get(sermon.date.slice(0, 4)) ?? []), sermon]);
  return [...map.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([year, items]) => ({ year, sermons: items }));
}

export interface SeriesInfo { term: TaxonomyTerm; sermons: Sermon[]; book?: TaxonomyTerm; bookStudy: boolean; group: string; years: string; speakers: string[] }

/** A series is tied to a book when 70% of its sermons come from it; it is a book study
 *  when the book is in its name or it runs for eight or more sermons. */
export function seriesInfo(t: TaxonomyTerm): SeriesInfo {
  const list = sermonsFor("series", t.slug);
  const counts = new Map<string, number>();
  for (const sermon of list) {
    const slug = mainBook(sermon);
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const bookSlug = top && t.slug !== "topical" && top[1] / list.length >= 0.7 ? top[0] : null;
  const names = new Map<string, number>();
  for (const sermon of list) for (const slug of sermon.speakers) names.set(slug, (names.get(slug) ?? 0) + 1);
  const book = bookSlug ? term("book", bookSlug) : undefined;
  const named = book ? t.name.toLowerCase().includes(book.name.toLowerCase().replace(/s$/u, "")) : false;
  return {
    term: t, sermons: list, book, bookStudy: Boolean(book) && (named || list.length >= 8), group: bookGroup(bookSlug), years: years(list),
    speakers: [...names.entries()].sort((a, b) => b[1] - a[1]).map(([slug]) => term("speaker", slug)?.name ?? slug),
  };
}

export const allSeries = () => termsOf("series").map(seriesInfo);

export const testamentOf = (slug: string) => (canonOrder(slug) <= 38 ? "Old Testament" : "New Testament");
export { canonBook, canonOrder };
export const totalSermons = sermons.length;

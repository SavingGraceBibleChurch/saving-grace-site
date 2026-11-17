// Which chapters and verses each sermon covers, built from its passage text ("Luke 6:12-16").
// Served as /sermons/passages.json for the bookshelf's chapter and verse picker and for passage searches.
import versificationData from "../data/versification.json";
import { canonBooks } from "./canon";
import { sermons, term, speakerName } from "./content";
import { parseReference, type Range } from "./passages";
import type { Sermon } from "./types";

const versification = versificationData as Record<string, number[]>;
export const bookNames = canonBooks.map((book) => ({ slug: book.slug, name: book.name, abbr: book.abbr }));
export const bookVerses = canonBooks.map((book) => versification[book.slug] ?? []);

/** The verse ranges a sermon covers; empty for "Selected Text" and blank passages. */
export function sermonRanges(sermon: Sermon): Range[] {
  return sermon.passage ? parseReference(sermon.passage, bookNames, bookVerses) : [];
}

export interface PassagePayload {
  books: { s: string; n: string; a: string; g: string; v: number[]; p: string | null; c: number }[];
  sermons: { t: string; u: string; d: string; sp: string; r: string; x: Range[] }[];
}

export function passagePayload(): PassagePayload {
  return {
    books: canonBooks.map((book, index) => {
      const t = term("book", book.slug);
      return { s: book.slug, n: book.name, a: book.abbr, g: book.group, v: bookVerses[index]!, p: t?.path ?? null, c: t?.count ?? 0 };
    }),
    sermons: sermons
      .map((s) => ({ t: s.title, u: s.path, d: s.date, sp: speakerName(s), r: s.passage, x: sermonRanges(s) }))
      .filter((s) => s.x.length > 0),
  };
}

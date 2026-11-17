// Loads /sermons/passages.json once, on first use, for the bookshelf picker and passage searches.
import type { PassagePayload } from "../lib/passage-index";
import { coversVerse, overlaps, parseReference, touchesChapter, type Range } from "../lib/passages";

export interface PassageSermon { t: string; u: string; d: string; sp: string; r: string; x: Range[] }
export interface PassageData {
  books: PassagePayload["books"];
  sermons: PassageSermon[];
  /** Sermons touching a chapter, or covering a verse when one is given; newest first. */
  find(book: number, chapter?: number, verse?: number): PassageSermon[];
  /** Sermons whose passage shares a verse with a typed reference ("John 3:16"); null when the text is not a reference. */
  search(text: string): { label: string; results: PassageSermon[] } | null;
}

let loading: Promise<PassageData> | undefined;

export function loadPassages(): Promise<PassageData> {
  loading ??= fetch("/sermons/passages.json").then((r) => {
    if (!r.ok) throw new Error("Passage index unavailable");
    return r.json() as Promise<PassagePayload>;
  }).then((payload) => {
    const books = payload.books;
    const names = books.map((b) => ({ slug: b.s, name: b.n, abbr: b.a }));
    const verses = books.map((b) => b.v);
    const sermons = payload.sermons as PassageSermon[];
    const byDate = (a: PassageSermon, b: PassageSermon) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0);
    return {
      books,
      sermons,
      find(book, chapter, verse) {
        return sermons.filter((s) => s.x.some((r) => (chapter === undefined ? r[0] === book : verse === undefined ? touchesChapter(r, book, chapter) : coversVerse(r, book, chapter, verse)))).sort(byDate);
      },
      search(text) {
        const query = text.trim();
        // Only treat it as a reference when it has a chapter number or is a whole book name, so a word
        // like "am" is not read as Amos.
        const ranges = parseReference(query, names, verses);
        if (!ranges.length) return null;
        const wholeName = books.some((b) => b.n.toLowerCase() === query.toLowerCase() || (query.toLowerCase() === "psalm" && b.s === "psalms"));
        if (!/\d\s*$|\d\s*[:-]/u.test(query) && !wholeName) return null;
        const results = sermons.filter((s) => s.x.some((r) => ranges.some((q) => overlaps(r, q)))).sort(byDate);
        return { label: query, results };
      },
    };
  });
  return loading;
}

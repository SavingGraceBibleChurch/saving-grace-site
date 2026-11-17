// Bible references as verse ranges. Used at build time (which chapters and verses each sermon covers)
// and in the browser (the bookshelf's chapter and verse picker, and passage searches such as "John 3:16").
// Pure functions only, so the same code runs in both places.

export interface BookName { slug: string; name: string; abbr?: string }
/** [book index, from chapter, from verse, to chapter, to verse]. Verse 0 = start of the chapter, 999 = its end. */
export type Range = [number, number, number, number, number];

const ALIASES: Record<string, string> = { "song of songs": "song-of-solomon", canticles: "song-of-solomon", psalm: "psalms", qoheleth: "ecclesiastes" };
const clean = (text: string) => text.toLowerCase().replace(/[–—]/gu, "-").replace(/\./gu, " ").replace(/\s+/gu, " ").trim();

/** Finds the book a reference starts with ("1 Pet", "psalm", "Song of Songs"), returning its index and the rest of the text. */
export function matchBook(text: string, books: BookName[]): { index: number; rest: string } | null {
  const lower = clean(text);
  // A leading 1–3 (or i–iii followed by a space, so "Isaiah" is not read as "I saiah").
  const head = /^((?:[1-3]\s*|i{1,3}\s+))?([a-z]+(?:\s+[a-z]+){0,3})/u.exec(lower);
  if (!head) return null;
  const number = head[1] ? String({ i: 1, ii: 2, iii: 3 }[head[1].trim() as "i" | "ii" | "iii"] ?? head[1].trim()) : "";
  const words = head[2]!.split(" ");
  // Try the longest run of words first, so "song of solomon" wins over "song".
  for (let count = words.length; count > 0; count--) {
    const alpha = words.slice(0, count).join(" ");
    const wanted = number ? `${number} ${alpha}` : alpha;
    const consumed = (head[1] ?? "") + alpha;
    const alias = ALIASES[wanted];
    let best = -1;
    let exact = false;
    books.forEach((book, index) => {
      const name = clean(book.name);
      const slugName = book.slug.replace(/-/gu, " ");
      const abbr = book.abbr ? clean(book.abbr).replace(/^([1-3])\s*/u, "$1 ") : "";
      if (alias === book.slug || name === wanted || slugName === wanted || abbr === wanted) {
        if (!exact) { best = index; exact = true; }
        return;
      }
      if (exact || best >= 0) return;
      // An abbreviation: at least three letters of the name, with the same leading number ("1 pet").
      const [num, ...rest] = name.split(" ");
      const bookNumber = /^[1-3]$/u.test(num!) ? num! : "";
      const bookAlpha = bookNumber ? rest.join(" ") : name;
      if (bookNumber === number && alpha.length >= 3 && bookAlpha.startsWith(alpha)) best = index;
    });
    if (best >= 0) return { index: best, rest: lower.slice(lower.indexOf(consumed) + consumed.length) };
  }
  return null;
}

/**
 * Parses references such as "Luke 6:12-16", "1 John 2:28-3:3", "Psalm 23", "Genesis 37-50",
 * "Luke 2:51 - Luke 3:6", "John 20:24-29; 11:16" and "Romans 8:1-4, 28". A book alone covers the whole book.
 */
export function parseReference(text: string, books: BookName[], verses: number[][]): Range[] {
  const ranges: Range[] = [];
  let book = -1;
  for (const part of text.split(";")) {
    let rest = part.trim();
    if (!rest) continue;
    const found = matchBook(rest, books);
    if (found) { book = found.index; rest = found.rest.trim(); }
    else if (book < 0) continue;
    const counts = verses[book] ?? [];
    const last = counts.length;
    if (!rest) { ranges.push([book, 1, 0, last, 999]); continue; }
    let chapter = 0;
    for (const piece of rest.split(",")) {
      const m = /^\s*(\d+)(?:\s*:\s*(\d+))?(?:\s*-\s*(?:[1-3]?\s*[a-z][a-z\s]*?\s*)?(\d+)(?:\s*:\s*(\d+))?)?\s*$/u.exec(piece);
      if (!m) break;
      const a = Number(m[1]);
      const b = m[2] === undefined ? undefined : Number(m[2]);
      const c = m[3] === undefined ? undefined : Number(m[3]);
      const d = m[4] === undefined ? undefined : Number(m[4]);
      let range: Range;
      if (b !== undefined) {
        // chapter:verse, chapter:verse-verse or chapter:verse-chapter:verse
        range = d !== undefined ? [book, a, b, c!, d] : c !== undefined ? [book, a, b, a, c] : [book, a, b, a, b];
        chapter = range[3];
      } else if (chapter && piece.trim() && !/:/u.test(piece) && ranges.length && ranges[ranges.length - 1]![2] !== 0 && ranges[ranges.length - 1]![0] === book) {
        // "Romans 8:1-4, 28" — after a verse range a bare number is another verse in the same chapter.
        range = c !== undefined ? [book, chapter, a, chapter, c] : [book, chapter, a, chapter, a];
      } else {
        // whole chapters: "23" or "37-50" (or "2-3:6")
        range = d !== undefined ? [book, a, 0, c!, d] : c !== undefined ? [book, a, 0, c, 999] : [book, a, 0, a, 999];
        chapter = range[3];
      }
      if (range[1] < 1 || range[1] > last || range[3] < range[1] || range[3] > last) break;
      ranges.push(range);
    }
  }
  return ranges;
}

const start = (r: Range) => r[1] * 1000 + r[2];
const end = (r: Range) => r[3] * 1000 + r[4];
/** Whether two ranges share at least one verse. */
export const overlaps = (a: Range, b: Range) => a[0] === b[0] && start(a) <= end(b) && start(b) <= end(a);
export const touchesChapter = (r: Range, book: number, chapter: number) => r[0] === book && r[1] <= chapter && chapter <= r[3];
export const coversVerse = (r: Range, book: number, chapter: number, verse: number) => r[0] === book && start(r) <= chapter * 1000 + verse && chapter * 1000 + verse <= end(r);

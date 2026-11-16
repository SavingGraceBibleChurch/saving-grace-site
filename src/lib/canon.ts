// The 66 books in canonical order, with the two testament bookends, for the bookshelf.
import canonData from "../data/canon.json";

export interface CanonBook { slug: string; name: string; abbr: string; group: string; len: string; sqrt: number }
export interface Bookend { bookend: string; short: string }
export type CanonItem = CanonBook | Bookend;

export const canon = canonData as CanonItem[];
export const isBook = (item: CanonItem): item is CanonBook => "slug" in item;
export const canonBooks = canon.filter(isBook);
const order = new Map(canonBooks.map((book, index) => [book.slug, index]));

/** Position in the canon (Genesis 0 … Revelation 65); unknown slugs sort last. */
export const canonOrder = (slug: string) => order.get(slug) ?? 999;
export const canonBook = (slug: string) => canonBooks.find((book) => book.slug === slug);
/** Chapter count, which sets each spine's width and its share of the strip. */
export const chapters = (book: CanonBook) => Math.round(book.sqrt * book.sqrt);

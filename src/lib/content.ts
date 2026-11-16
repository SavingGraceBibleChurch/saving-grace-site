import pagesData from "../data/pages.json";
import postsData from "../data/posts.json";
import sermonsData from "../data/sermons.json";
import taxonomiesData from "../data/taxonomies.json";
import imagesData from "../data/images.json";
import homeData from "../data/home.json";
import type { Image, Page, Post, Sermon, TaxonomyKind, TaxonomyTerm } from "./types";

export const pages = pagesData as unknown as Page[];
export const posts = postsData as unknown as Post[];
/** Newest first. */
export const sermons = sermonsData as unknown as Sermon[];
export const taxonomyTerms = taxonomiesData as unknown as TaxonomyTerm[];
export const images = imagesData as unknown as Record<string, Image>;
export const home = homeData as unknown as { seo: Page["seo"]; copy: Record<string, any> };

export const SITE = "https://www.savinggrace.org.au";
export const SITE_NAME = "Saving Grace Bible Church";
export const ARCHIVE_PAGE_SIZE = 9;

export const pageById = (id: string) => pages.find((page) => page.id === id);
export const imageFor = (id?: string | null) => (id ? images[id] : undefined);

const termIndex = new Map(taxonomyTerms.map((term) => [`${term.kind}:${term.slug}`, term]));
export const term = (kind: TaxonomyKind, slug: string) => termIndex.get(`${kind}:${slug}`);
export const termsOf = (kind: TaxonomyKind) => taxonomyTerms.filter((t) => t.kind === kind);

export const taxonomyLabels: Record<TaxonomyKind, { singular: string; plural: string; path: string }> = {
  speaker: { singular: "Speaker", plural: "Speakers", path: "/sermons/speaker/" },
  series: { singular: "Series", plural: "Series", path: "/sermons/series/" },
  book: { singular: "Bible book", plural: "Bible books", path: "/sermons/book/" },
  passage: { singular: "Passage", plural: "Passages", path: "/sermons/passage/" },
};

export function sermonsFor(kind: TaxonomyKind, slug: string): Sermon[] {
  const field = { speaker: "speakers", series: "series", book: "books", passage: "passages" }[kind] as "speakers" | "series" | "books" | "passages";
  return sermons.filter((sermon) => sermon[field].includes(slug));
}

export const speakerName = (sermon: Sermon) => sermon.speakers.map((slug) => term("speaker", slug)?.name ?? slug).join(", ");

export function youtubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** A plain meta description for a sermon when the live page had none. */
export function sermonSummary(sermon: Sermon): string {
  const parts = [`${sermon.title}, a sermon by ${speakerName(sermon)}`];
  if (sermon.passage) parts.push(`on ${sermon.passage}`);
  return `${parts.join(" ")} at Saving Grace Bible Church, Westmeadows, Melbourne.`;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

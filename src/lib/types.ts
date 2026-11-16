// Shapes of the generated data in src/data (see scripts/import_sources.py).

export interface Seo {
  title: string;
  description: string;
  canonical?: string;
  indexable: boolean;
  h1?: string | null;
  ogType?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  published?: string | null;
  modified?: string | null;
  captured?: boolean;
}

/** Inline markup: [label](href), **strong**, _emphasis_, "\n" line breaks. */
export type Markup = string;

export interface Tile { title: string; text?: Markup; href: string | null; media?: string; mediaAlt?: string; eyebrow?: string; linkLabel?: string }
export interface Person { name: string; role: string; media?: string; mediaAlt?: string; email?: string; text: Markup[] }

export type Block =
  | { kind: "paragraph"; text: Markup; lede?: boolean }
  | { kind: "heading"; level: 2 | 3 | 4; text: string; id?: string }
  | { kind: "list"; ordered?: boolean; items: Markup[] }
  | { kind: "quote"; text: Markup; cite?: string }
  | { kind: "figure"; media: string; caption?: Markup; size?: "full" | "inset" | "portrait"; alt?: string }
  | { kind: "callout"; title?: string; text: Markup }
  | { kind: "panel"; title?: string; columns?: 1 | 2 | 3; blocks: Block[] }
  | { kind: "tiles"; items: Tile[]; columns?: 2 | 3 | 4 }
  | { kind: "people"; items: Person[] }
  | { kind: "timeline"; items: { when: string; title: string; text: Markup }[] }
  | { kind: "next-event"; event: string; label: string }
  | { kind: "video"; videoId: string; title: string }
  | { kind: "playlist"; listId: string; title: string }
  | { kind: "downloads"; items: { title: string; text: Markup; href: string; label: string }[] }
  | { kind: "hymns"; items: { title: string; text: Markup; href: string }[] }
  | { kind: "index"; items: { href: string; title: string; text: Markup }[] }
  | { kind: "sermon-cards"; heading: string; text?: Markup; linkLabel: string; limit?: number }
  | { kind: "external-plate"; title: string; text: Markup; href: string; label: string }
  | { kind: "book"; media: string; mediaAlt?: string; text: Markup }
  | { kind: "contact-panel"; name: string; addressLines: string[]; telephone: { label: string; href: string }; email: string; map: { label: string; href: string } }
  | { kind: "giving-methods"; heading?: string; intro: Markup; button: { label: string; href: string }; methods: { title: string; text: Markup }[]; bank: { title: string; account: string; lines: string[] }; online: { title: string; links: { label: string; href: string }[] } }
  | { kind: "events-calendar"; upcomingHeading?: string; regularHeading?: string; pastHeading?: string; days?: number; limit?: number; showUpcoming?: boolean; showRegular?: boolean; showPast?: boolean }
  | { kind: "blog-list"; heading?: string; limit?: number }
  | { kind: "sitemap-list" };

export interface Page {
  id: string;
  wpId: number;
  path: string;
  navTitle: string;
  h1: string;
  section: string;
  parent?: string | null;
  eyebrow?: string | null;
  lede?: Markup | null;
  hero?: { enabled?: boolean; media: string; treatment: "banner" | "aside"; alt?: string } | null;
  blocks: Block[];
  aside: Block[];
  related: string[];
  seo: Seo;
}

export interface Post {
  id: string;
  wpId: number;
  path: string;
  title: string;
  h1: string;
  date: string;
  modified?: string | null;
  media?: string | null;
  blocks: Block[];
  seo: Seo;
}

export interface Sermon {
  wpId: number;
  slug: string;
  path: string;
  title: string;
  date: string;
  modified: string;
  speakers: string[];
  series: string[];
  books: string[];
  topics: string[];
  passage: string;
  youtubeId: string | null;
  sermonAudioId: string | null;
  pdf: string | null;
  body: string | null;
  seo: Seo;
}

export type TaxonomyKind = "speaker" | "series" | "book" | "topic";

export interface TaxonomyTerm {
  kind: TaxonomyKind;
  slug: string;
  name: string;
  count: number;
  path: string;
  seo: Seo;
}

export type Schedule =
  | { kind: "weekly"; weekday: number; from: string; until?: string; exclusions?: string[] }
  | { kind: "monthly-first"; weekday: number; from: string; until?: string; exclusions?: string[] }
  | { kind: "single"; date: string };

export interface ChurchEvent {
  id: string;
  title: string;
  path: string;
  schedule: Schedule;
  start: string;
  end: string;
  venue: string;
  description: Markup[];
  page?: string;
  media?: string;
  tag?: string;
  legacyPaths: string[];
}

export interface Venue { id: string; name: string; address: string; locality: string; phone?: string; href?: string; mapHref?: string }

export interface Image { src: string; width: number; height: number; alt: string }

// One sitemap listing every indexable URL with its last-modified date.
import { pages, posts, sermons, taxonomyTerms, sermonsFor, SITE } from "../lib/content";
import { events } from "../lib/events";
import { allSeries, allSessions, seriesPath, sessionPath, studiesPath } from "../lib/studies";

type Entry = { path: string; lastmod?: string | null; images?: string[] };

const day = (value?: string | null) => (value ? value.slice(0, 10) : null);
const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function GET() {
  const newest = sermons[0]?.date ?? null;
  const entries: Entry[] = [
    { path: "/", lastmod: newest },
    { path: "/sermons/", lastmod: newest },
    { path: "/events/" },
    ...pages.filter((p) => p.seo.indexable && p.path !== "/church-events/").map((p) => ({ path: p.path, lastmod: day(p.seo.modified) })),
    ...posts.map((p) => ({ path: p.path, lastmod: day(p.seo.modified) ?? p.modified ?? p.date })),
    ...sermons.filter((s) => s.seo.indexable).map((s) => ({ path: s.path, lastmod: s.modified > s.date ? s.modified : s.date, images: s.youtubeId ? [`https://i.ytimg.com/vi/${s.youtubeId}/hqdefault.jpg`] : [] })),
    ...taxonomyTerms.filter((t) => t.count > 0).map((t) => ({ path: t.path, lastmod: sermonsFor(t.kind, t.slug)[0]?.date })),
    ...["speaker", "series", "book", "passage"].map((k) => ({ path: `/sermons/${k}/`, lastmod: newest })),
    ...events.map((e) => ({ path: e.path })),
    { path: studiesPath },
    ...allSeries.map((s) => ({ path: seriesPath(s) })),
    ...allSessions.map((s) => ({ path: sessionPath(s), lastmod: s.date, images: s.youtubeId ? [`https://i.ytimg.com/vi/${s.youtubeId}/hqdefault.jpg`] : [] })),
  ];
  const body = entries
    .map((e) => `<url><loc>${xmlEscape(SITE + e.path)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}${(e.images ?? []).map((i) => `<image:image><image:loc>${xmlEscape(i)}</image:loc></image:image>`).join("")}</url>`)
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${body}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}

import { sermons, posts, speakerName, sermonSummary, SITE, SITE_NAME } from "./content";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rfc822 = (date: string) => new Date(`${date}T10:30:00+10:00`).toUTCString();

function channel(title: string, link: string, self: string, items: string[]): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(title)}</title>
<link>${link}</link>
<atom:link href="${self}" rel="self" type="application/rss+xml" />
<description>Bible-Based Worship in Melbourne</description>
<language>en-AU</language>
${items.join("\n")}
</channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}

export function sermonFeed(): Response {
  const items = sermons.slice(0, 50).map((s) => `<item><title>${esc(s.title)}</title><link>${SITE}${s.path}</link><guid isPermaLink="true">${SITE}${s.path}</guid><pubDate>${rfc822(s.date)}</pubDate><dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">${esc(speakerName(s))}</dc:creator><description>${esc(s.seo.description || sermonSummary(s))}</description></item>`);
  return channel(`${SITE_NAME} » Sermons`, `${SITE}/sermons/`, `${SITE}/sermons/feed/`, items);
}

export function postFeed(): Response {
  const items = [...posts].sort((a, b) => b.date.localeCompare(a.date)).map((p) => `<item><title>${esc(p.title)}</title><link>${SITE}${p.path}</link><guid isPermaLink="true">${SITE}${p.path}</guid><pubDate>${rfc822(p.date)}</pubDate><description>${esc(p.seo.description)}</description></item>`);
  return channel(SITE_NAME, `${SITE}/`, `${SITE}/feed/`, items);
}

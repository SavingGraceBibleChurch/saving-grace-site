import { SITE } from "../lib/content";

export function GET() {
  const body = ["User-agent: *", "Disallow: /search/", "", `Sitemap: ${SITE}/sitemap.xml`, ""].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

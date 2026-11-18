import { SITE } from "../lib/content";

export function GET() {
  // Applebot may crawl (Siri and Spotlight); Applebot-Extended is Apple's separate switch for AI training, which the
  // church opts out of. Other AI training crawlers are refused by the server (deploy/nginx/savinggrace-blocking-maps.conf).
  const body = ["User-agent: *", "Disallow: /search/", "", "User-agent: Applebot-Extended", "Disallow: /", "", `Sitemap: ${SITE}/sitemap.xml`, ""].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

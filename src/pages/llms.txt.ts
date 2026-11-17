// /llms.txt: a plain summary of the church and its main pages for AI assistants and answer engines
// (https://llmstxt.org). Every fact and description comes from the site's own data.
import { pages, sermons, taxonomyTerms, SITE, SITE_NAME } from "../lib/content";
import { contact, services } from "../lib/site";
import { courses, allSessions, courseSessions, seriesPath, studiesPath } from "../lib/studies";

const page = (path: string) => pages.find((p) => p.path === path);
const link = (path: string, label?: string) => {
  const p = page(path);
  return p ? `- [${label ?? p.navTitle ?? p.h1}](${SITE}${p.path}): ${p.seo.description}` : null;
};
const phone = contact.phone.replace(/^(\d{4})(\d{3})(\d{3})$/u, "$1 $2 $3");

export function GET() {
  const first = sermons.at(-1)?.date.slice(0, 4);
  const speakers = taxonomyTerms.filter((t) => t.kind === "speaker" && t.count > 0).sort((a, b) => b.count - a.count);
  const lines = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_NAME} is a Bible-based church in Westmeadows, Melbourne (Victoria, Australia), founded in 2017 and led by Pastor Wesam Saad. Sunday services: ${services.join("; ")}. The website publishes the church's sermons, each with a written description and most with a full transcript, and its Tuesday night Bible studies with study questions.`,
    "",
    `- Address: ${contact.streetAddress}, ${contact.addressLocality} ${contact.addressRegion} ${contact.postalCode}, Australia`,
    `- Phone: ${phone}`,
    `- Email: ${contact.email}`,
    `- Map: ${contact.map}`,
    "",
    "## About the church",
    ...["/about/", "/what-we-teach/", "/doctrinal-statement/", "/our-history/", "/elders/", "/pages/lordsdayservice/", "/evening-service/", "/church-membership/", "/contact-us-2/"].map((p) => link(p)).filter(Boolean),
    "",
    "## Sermons",
    `- [All sermons](${SITE}/sermons/): ${sermons.length} sermons since ${first}, searchable by word, speaker, series, Bible book and passage.`,
    ...speakers.map((s) => `- [Sermons by ${s.name}](${SITE}${s.path}): ${s.count} sermons.`),
    `- [Sermons by Bible book](${SITE}/sermons/book/) and [by series](${SITE}/sermons/series/).`,
    "",
    "### Latest sermons",
    ...sermons.slice(0, 10).map((s) => `- [${s.title}](${SITE}${s.path}): ${s.date}${s.passage ? `, ${s.passage}` : ""}`),
    "",
    "## Tuesday Night Studies",
    `- [Course library](${SITE}${studiesPath}): ${allSessions.length} studies in ${courses.length} courses, each with its recording, transcript and study questions.`,
    ...courses.map((c) => `- [${c.title}](${SITE}${seriesPath(c)}): ${courseSessions(c).length} studies.`),
    "",
    "## Ministries",
    ...["/ministries/", "/pages/biblestudies/", "/mens-ministry/", "/womens-ministry/", "/teaching-preaching-ministry/", "/music-ministry/", "/pages/sunday-school/", "/pages/local-outreach/"].map((p) => link(p)).filter(Boolean),
    "",
    "## Optional",
    `- [Events](${SITE}/events/): services, studies and church events.`,
    `- [Sermon feed (RSS)](${SITE}/sermons/feed/)`,
    `- [Sitemap](${SITE}/sitemap.xml)`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

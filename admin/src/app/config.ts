// Where the admin reads and writes. On a local machine (127.0.0.1) a test API and branch can be set
// in the browser's storage, so the admin can be tried against admin/dev/mock-github.mjs without touching GitHub.

const local = ["127.0.0.1", "localhost"].includes(location.hostname);
const read = (key: string) => {
  try { return localStorage.getItem(key); } catch { return null; }
};

export const REPO = { owner: "SavingGraceBibleChurch", name: "saving-grace-site", branch: (local && read("sg-admin-branch")) || "main" };
export const API = (local && read("sg-admin-api")) || "https://api.github.com";
/** The public website. A save goes live here a few minutes after it is made; there is no staging site. */
export const SITE_URL = "https://www.savinggrace.org.au";
export const SITE_WORKFLOW = "Site";
export const TOKEN_KEY = "sg-admin-token";
export const isLocalTest = local && API !== "https://api.github.com";

export const DATA = {
  sermons: "src/data/sermons.json",
  taxonomies: "src/data/taxonomies.json",
  descriptions: "src/data/sermon-descriptions.json",
  durations: "src/data/sermon-durations.json",
  sources: "src/data/sermon-transcript-sources.json",
  events: "src/data/events.json",
  studies: "src/data/studies.json",
  settings: "src/data/site-settings.json",
  images: "src/data/images.json",
  canon: "src/data/canon.json",
  pages: "src/data/pages.json",
  posts: "src/data/posts.json",
  home: "src/data/home.json",
  protectedSeo: "src/data/seo-protected.json",
  intentional: "scripts/seo-intentional-changes.json",
  redirects: "src/data/redirects.json",
} as const;
export const transcriptPath = (id: number | string) => `src/data/sermon-transcripts/${id}.txt`;
export const studyContentPath = (slug: string) => `src/data/study-content/${slug}.json`;

export const SEO_SUFFIX = " - Saving Grace Bible Church - Bible-Based Worship in Melbourne";
/** New sermons get IDs above every WordPress ID. */
export const FIRST_NEW_ID = 1_000_001;

/** Pages that set out what the church believes: saving one needs the elders' approval ticked. */
export const DOCTRINAL = new Set([
  "/what-we-teach/", "/what-we-teach/the-gospel/", "/what-we-teach/the-sufficiency-of-scripture/",
  "/what-we-teach/believers-baptism/", "/what-we-teach/mandated-church/", "/doctrinal-statement/", "/pages/church-covenant/",
]);

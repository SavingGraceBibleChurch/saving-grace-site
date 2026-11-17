// Where the admin reads and writes. On a local machine (127.0.0.1) a test API and branch can be set
// in the browser's storage, so the admin can be tried against admin/dev/mock-github.mjs without touching GitHub.

const local = ["127.0.0.1", "localhost"].includes(location.hostname);
const read = (key: string) => {
  try { return localStorage.getItem(key); } catch { return null; }
};

export const REPO = { owner: "samuelsaad", name: "saving-grace-site", branch: (local && read("sg-admin-branch")) || "main" };
export const API = (local && read("sg-admin-api")) || "https://api.github.com";
export const STAGING = "http://54.253.237.138:8080";
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
  redirects: "src/data/redirects.json",
} as const;
export const transcriptPath = (id: number | string) => `src/data/sermon-transcripts/${id}.txt`;
export const studyContentPath = (slug: string) => `src/data/study-content/${slug}.json`;

export const SEO_SUFFIX = " - Saving Grace Bible Church - Bible-Based Worship in Melbourne";
/** New sermons get IDs above every WordPress ID. */
export const FIRST_NEW_ID = 1_000_001;

// Validates everything in src/data that the admin edits. Run before every build (CI does).
// Usage: node scripts/validate-data.mjs
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateData } from "./lib/validate.mjs";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
const json = (name) => JSON.parse(readFileSync(join(DATA, name), "utf8"));
const stems = (dir, ext) => readdirSync(join(DATA, dir)).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length));

const studyContentFiles = stems("study-content", ".json");
const studyContent = Object.fromEntries(studyContentFiles.map((slug) => [slug, json(`study-content/${slug}.json`)]));
const problems = validateData({
  sermons: json("sermons.json"),
  taxonomies: json("taxonomies.json"),
  descriptions: json("sermon-descriptions.json"),
  durations: json("sermon-durations.json"),
  transcriptSources: json("sermon-transcript-sources.json"),
  transcriptFiles: stems("sermon-transcripts", ".txt"),
  events: json("events.json"),
  studies: json("studies.json"),
  studyContentFiles,
  studyContent,
  settings: json("site-settings.json"),
  images: json("images.json"),
  pages: json("pages.json"),
  redirects: json("redirects.json"),
});

if (problems.length) {
  console.error(`${problems.length} problem(s) in src/data:`);
  for (const p of problems.slice(0, 200)) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("src/data is valid.");

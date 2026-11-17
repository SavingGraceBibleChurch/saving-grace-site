// Checks the editable site data for mistakes that would break pages or live URLs.
// Shared by scripts/validate-data.mjs (CI and local) and the admin (before every save).
// Pure functions: no file or network access. Returns a list of plain-English problems.

const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/u;
// Lower-case letters (any script, as WordPress allowed Arabic slugs), digits and single hyphens.
const SLUG = /^[\p{Ll}\p{Lo}\p{Mn}\p{N}]+(?:-[\p{Ll}\p{Lo}\p{Mn}\p{N}]+)*$/u;
const YOUTUBE = /^[A-Za-z0-9_-]{11}$/u;
const SERMONAUDIO = /^\d{6,20}$/u;
export const TERM_FIELDS = { speaker: "speakers", series: "series", book: "books", passage: "passages" };
export const TERM_PATHS = { speaker: "/sermons/speaker/", series: "/sermons/series/", book: "/sermons/book/", passage: "/sermons/passage/" };

export const isDate = (value) => typeof value === "string" && DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
export const isSlug = (value) => typeof value === "string" && SLUG.test(value);
export const isYoutubeId = (value) => typeof value === "string" && YOUTUBE.test(value);
export const isSermonAudioId = (value) => typeof value === "string" && SERMONAUDIO.test(value);

function safeDecode(path) {
  try { return decodeURIComponent(path ?? ""); } catch { return path; }
}

function duplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) (seen.has(value) ? dupes : seen).add(value);
  return [...dupes];
}

/**
 * @param {object} d
 * @param {object[]} d.sermons
 * @param {object[]} d.taxonomies
 * @param {Record<string,string>} [d.descriptions]
 * @param {Record<string,number>} [d.durations]
 * @param {Record<string,string>} [d.transcriptSources]
 * @param {string[]} [d.transcriptFiles]   wpIds that have a transcript file (CLI only)
 * @param {{events: object[], venues: Record<string, object>}} [d.events]
 * @param {{series: object[], sessions: object[]}} [d.studies]
 * @param {string[]} [d.studyContentFiles] slugs that have a content file (CLI only)
 * @param {Record<string, object>} [d.studyContent] parsed content files to check (any subset)
 * @param {{notice: {show: boolean, text: string}}} [d.settings]
 * @param {Record<string, object>} [d.images]
 * @param {object[]} [d.pages]
 * @param {object[]} [d.redirects]
 */
export function validateData(d) {
  const problems = [];
  const fail = (message) => problems.push(message);

  // ------------------------------------------------------------ taxonomies
  const terms = new Map();
  for (const t of d.taxonomies) {
    const label = `${t.kind} "${t.name ?? t.slug}"`;
    if (!TERM_FIELDS[t.kind]) fail(`${label}: unknown kind`);
    if (!isSlug(t.slug)) fail(`${label}: slug "${t.slug}" must be lower-case words joined by hyphens`);
    if (!t.name?.trim()) fail(`${label}: has no name`);
    if (safeDecode(t.path) !== `${TERM_PATHS[t.kind]}${t.slug}/`) fail(`${label}: path should be ${TERM_PATHS[t.kind]}${t.slug}/`);
    if (!t.seo?.title?.trim()) fail(`${label}: has no page title`);
    terms.set(`${t.kind}:${t.slug}`, t);
  }
  for (const key of duplicates(d.taxonomies.map((t) => `${t.kind}:${t.slug}`))) fail(`Two ${key.replace(":", "s share the slug ")}`);

  // ------------------------------------------------------------ sermons
  const ids = new Set(d.sermons.map((s) => String(s.wpId)));
  for (const id of duplicates(d.sermons.map((s) => String(s.wpId)))) fail(`Two sermons share the ID ${id}`);
  for (const slug of duplicates(d.sermons.map((s) => s.slug))) fail(`Two sermons share the address /sermons/${slug}/`);
  d.sermons.forEach((s, i) => {
    const label = `Sermon "${s.title || s.slug}"`;
    if (!Number.isInteger(s.wpId) || s.wpId <= 0) fail(`${label}: ID must be a positive whole number`);
    if (!s.title?.trim()) fail(`${label}: has no title`);
    if (!isSlug(s.slug)) fail(`${label}: address "${s.slug}" must be lower-case words joined by hyphens`);
    if (safeDecode(s.path) !== `/sermons/${s.slug}/`) fail(`${label}: path should be /sermons/${s.slug}/`);
    if (!isDate(s.date)) fail(`${label}: date "${s.date}" is not a real date (YYYY-MM-DD)`);
    if (!isDate(s.modified)) fail(`${label}: modified date "${s.modified}" is not a real date`);
    if (!s.speakers?.length) fail(`${label}: needs a speaker`);
    for (const [kind, field] of Object.entries(TERM_FIELDS)) {
      if (!Array.isArray(s[field])) { fail(`${label}: ${field} must be a list`); continue; }
      for (const slug of s[field]) if (!terms.has(`${kind}:${slug}`)) fail(`${label}: ${kind} "${slug}" does not exist`);
    }
    if (s.youtubeId !== null && !isYoutubeId(s.youtubeId)) fail(`${label}: YouTube ID "${s.youtubeId}" should be 11 letters, digits, - or _`);
    if (s.sermonAudioId !== null && !isSermonAudioId(s.sermonAudioId)) fail(`${label}: SermonAudio ID "${s.sermonAudioId}" should be digits only`);
    if (!s.seo?.title?.trim()) fail(`${label}: has no page title`);
    if (typeof s.seo?.indexable !== "boolean") fail(`${label}: seo.indexable must be true or false`);
    if (i > 0 && s.date > d.sermons[i - 1].date) fail(`${label}: sermons must be listed newest first (it is dated after the one before it)`);
  });

  // ------------------------------------------------------------ sermon content keyed by ID
  for (const [name, map] of [["description", d.descriptions], ["recording length", d.durations], ["transcript source", d.transcriptSources]]) {
    if (!map) continue;
    for (const key of Object.keys(map)) if (!ids.has(key)) fail(`A ${name} is saved for sermon ID ${key}, which does not exist`);
  }
  if (d.descriptions) for (const [key, text] of Object.entries(d.descriptions)) if (typeof text !== "string") fail(`Description for sermon ${key} must be text`);
  if (d.durations) for (const [key, value] of Object.entries(d.durations)) if (!Number.isInteger(value) || value <= 0) fail(`Recording length for sermon ${key} must be whole seconds`);
  if (d.transcriptSources) {
    for (const [key, value] of Object.entries(d.transcriptSources)) if (!["sermonaudio", "captions", "church"].includes(value)) fail(`Transcript source for sermon ${key} is "${value}"`);
    if (d.transcriptFiles) {
      const files = new Set(d.transcriptFiles);
      for (const key of Object.keys(d.transcriptSources)) if (!files.has(key)) fail(`Sermon ${key} is marked as having a transcript, but the file is missing`);
      for (const key of files) if (!d.transcriptSources[key]) fail(`Transcript file ${key}.txt is not listed in sermon-transcript-sources.json`);
      for (const key of files) if (!ids.has(key)) fail(`Transcript file ${key}.txt belongs to no sermon`);
    }
  }

  // ------------------------------------------------------------ events
  if (d.events) {
    const venues = d.events.venues ?? {};
    const pageIds = d.pages ? new Set(d.pages.map((p) => p.id)) : null;
    for (const id of duplicates(d.events.events.map((e) => e.id))) fail(`Two events share the ID ${id}`);
    for (const path of duplicates(d.events.events.map((e) => e.path))) fail(`Two events share the address ${path}`);
    for (const e of d.events.events) {
      const label = `Event "${e.title || e.id}"`;
      if (!e.title?.trim()) fail(`${label}: has no title`);
      if (!isSlug(e.id)) fail(`${label}: ID "${e.id}" must be lower-case words joined by hyphens`);
      if (!/^\/event\/[a-z0-9-]+\/$/u.test(e.path ?? "")) fail(`${label}: address must look like /event/name/`);
      if (!TIME.test(e.start ?? "")) fail(`${label}: start time "${e.start}" should be HH:MM`);
      if (!TIME.test(e.end ?? "")) fail(`${label}: end time "${e.end}" should be HH:MM`);
      if (TIME.test(e.start ?? "") && TIME.test(e.end ?? "") && e.end <= e.start) fail(`${label}: ends before it starts`);
      if (!venues[e.venue]) fail(`${label}: venue "${e.venue}" does not exist`);
      if (!Array.isArray(e.description) || e.description.some((p) => typeof p !== "string")) fail(`${label}: description must be a list of paragraphs`);
      if (e.media && d.images && !d.images[e.media]) fail(`${label}: picture "${e.media}" does not exist`);
      if (e.page && pageIds && !pageIds.has(e.page)) fail(`${label}: linked page "${e.page}" does not exist`);
      const s = e.schedule ?? {};
      if (s.kind === "single") {
        if (!isDate(s.date)) fail(`${label}: date "${s.date}" is not a real date`);
      } else if (s.kind === "weekly" || s.kind === "monthly-first") {
        if (!Number.isInteger(s.weekday) || s.weekday < 0 || s.weekday > 6) fail(`${label}: weekday must be 0 (Sunday) to 6 (Saturday)`);
        if (!isDate(s.from)) fail(`${label}: start date "${s.from}" is not a real date`);
        if (s.until !== undefined && !isDate(s.until)) fail(`${label}: end date "${s.until}" is not a real date`);
        if (s.until && isDate(s.from) && s.until < s.from) fail(`${label}: ends before it starts`);
        for (const x of s.exclusions ?? []) if (!isDate(x)) fail(`${label}: skipped date "${x}" is not a real date`);
      } else fail(`${label}: schedule must be weekly, monthly-first or single`);
    }
  }

  // ------------------------------------------------------------ studies
  if (d.studies) {
    const series = new Map(d.studies.series.map((s) => [s.id, s]));
    for (const id of duplicates(d.studies.series.map((s) => s.id))) fail(`Two study courses/sections share the ID ${id}`);
    for (const slug of duplicates(d.studies.series.map((s) => s.slug))) fail(`Two study courses/sections share the address ${slug}`);
    for (const s of d.studies.series) {
      const label = `Study course/section "${s.title || s.slug}"`;
      if (!s.title?.trim()) fail(`${label}: has no title`);
      if (!isSlug(s.slug)) fail(`${label}: address "${s.slug}" must be lower-case words joined by hyphens`);
      if (s.parentId !== null && !series.has(s.parentId)) fail(`${label}: belongs to a course that does not exist`);
      if (s.parentId && series.get(s.parentId)?.parentId) fail(`${label}: sections can only be one level deep`);
      if (!Number.isInteger(s.order)) fail(`${label}: order must be a whole number`);
    }
    for (const slug of duplicates(d.studies.sessions.map((s) => s.slug))) fail(`Two studies share the address /studies/sessions/${slug}/`);
    for (const s of d.studies.sessions) {
      const label = `Study "${s.title || s.slug}"`;
      if (!s.title?.trim()) fail(`${label}: has no title`);
      if (!isSlug(s.slug)) fail(`${label}: address "${s.slug}" must be lower-case words joined by hyphens`);
      if (!series.has(s.seriesId)) fail(`${label}: belongs to a course/section that does not exist`);
      if (!Number.isInteger(s.order)) fail(`${label}: order must be a whole number`);
      if (s.date !== null && !isDate(s.date)) fail(`${label}: date "${s.date}" is not a real date`);
      if (s.youtubeId !== null && !isYoutubeId(s.youtubeId)) fail(`${label}: YouTube ID "${s.youtubeId}" is not valid`);
      if (s.sermonAudioId !== null && !isSermonAudioId(s.sermonAudioId)) fail(`${label}: SermonAudio ID "${s.sermonAudioId}" is not valid`);
      if (s.durationSeconds !== null && (!Number.isInteger(s.durationSeconds) || s.durationSeconds <= 0)) fail(`${label}: recording length must be whole seconds`);
    }
    if (d.studyContentFiles) {
      const sessions = new Set(d.studies.sessions.map((s) => s.slug));
      const files = new Set(d.studyContentFiles);
      for (const slug of sessions) if (!files.has(slug)) fail(`Study "${slug}" has no content file`);
      for (const slug of files) if (!sessions.has(slug)) fail(`Study content file ${slug}.json belongs to no study`);
    }
    for (const [slug, c] of Object.entries(d.studyContent ?? {})) {
      const label = `Study "${slug}"`;
      if (typeof c.description !== "string" || typeof c.transcript !== "string") fail(`${label}: description and transcript must be text`);
      if (!Array.isArray(c.scripture) || c.scripture.some((x) => typeof x !== "string" || !x.trim())) fail(`${label}: Scripture references must be a list of non-empty lines`);
      if (!Array.isArray(c.questions) || c.questions.some((q) => !q?.question?.trim() || typeof q.answer !== "string")) fail(`${label}: every question needs text`);
    }
  }

  // ------------------------------------------------------------ settings and redirects
  if (d.settings) {
    const n = d.settings.notice;
    if (!n || typeof n.show !== "boolean" || typeof n.text !== "string") fail("Site settings: the notice needs show (true/false) and text");
    else if (n.show && !n.text.trim()) fail("Site settings: the notice is switched on but has no text");
  }
  if (d.redirects) {
    for (const r of d.redirects) if (!r.from?.startsWith("/") || typeof r.to !== "string" || !["exact", "prefix", "query", "rewrite"].includes(r.match)) fail(`Redirect from "${r.from}" is malformed`);
    if (d.events) {
      const eventPaths = new Set(d.events.events.map((e) => e.path));
      for (const r of d.redirects) if (r.match === "exact" && eventPaths.has(r.from)) fail(`${r.from} is a live event page but also redirects elsewhere`);
    }
  }
  return problems;
}

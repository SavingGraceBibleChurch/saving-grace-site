// Tuesday Night Studies: courses, their sections and sessions (see scripts/export_local_content.py).
import data from "../data/studies.json";

export interface StudySeries { id: string; slug: string; title: string; parentId: string | null; order: number }
export interface StudySession {
  slug: string; title: string; originalTitle: string; seriesId: string; order: number;
  teacher: string | null; date: string | null; durationSeconds: number | null; youtubeId: string | null; sermonAudioId: string | null;
}
export interface StudyContent { description: string; scripture: string[]; questions: { question: string; answer: string }[]; transcript: string }

export const allSeries = data.series as StudySeries[];
export const allSessions = data.sessions as StudySession[];

const ordered = <T extends { order: number; title: string }>(items: T[]) => [...items].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
const byId = new Map(allSeries.map((s) => [s.id, s]));

export const courses = ordered(allSeries.filter((s) => !s.parentId));
export const sectionsOf = (s: StudySeries) => ordered(allSeries.filter((x) => x.parentId === s.id));
export const sessionsOf = (s: StudySeries) => ordered(allSessions.filter((x) => x.seriesId === s.id));
export const courseOf = (s: StudySeries) => (s.parentId ? byId.get(s.parentId) ?? s : s);
export const seriesOf = (session: StudySession) => byId.get(session.seriesId)!;
/** Every session in a course, section by section, in order. */
export function courseSessions(s: StudySeries): StudySession[] {
  return [...sessionsOf(s), ...sectionsOf(s).flatMap((section) => sessionsOf(section))];
}
/** Every study on the site in reading order: course by course, section by section. */
export const readingOrder: StudySession[] = courses.flatMap((course) => courseSessions(course));
/** A course keeps one cover colour on its outline and session pages. */
export const toneOf = (s: StudySeries) => ["ink", "ember", "sand", "slate"][Math.max(0, courses.indexOf(courseOf(s))) % 4]!;

export const studiesPath = "/studies/";
export const seriesPath = (s: StudySeries) => `/studies/series/${s.slug}/`;
export const sessionPath = (s: StudySession) => `/studies/sessions/${s.slug}/`;
export const quantity = (n: number, word: string) => `${n} ${n === 1 ? word : word === "study" ? "studies" : `${word}s`}`;

const content = import.meta.glob<StudyContent>("../data/study-content/*.json", { eager: true, import: "default" });
export function contentFor(session: StudySession): StudyContent {
  const found = content[`../data/study-content/${session.slug}.json`];
  if (!found) throw new Error(`No content file for study ${session.slug}`);
  return found;
}

const slugs = allSeries.map((s) => s.slug);
if (new Set(slugs).size !== slugs.length) throw new Error("Duplicate study series slug");

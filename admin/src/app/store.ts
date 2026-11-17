// Holds the site data read from GitHub and turns edits into commits.
//
// An edit is a function from a file's current text to its new text. Saving re-reads the branch:
// if someone else saved in the meantime, every edit is re-applied to their newer version, unless they
// changed the very record being edited, in which case the save stops and says so.
import type { ChurchEvent, Image, Sermon, TaxonomyTerm, Venue } from "../../../src/lib/types";
import { validateData } from "../../../scripts/lib/validate.mjs";
import { DATA } from "./config";
import { GitHub, NotFastForward } from "./github";

export interface StudySeries { id: string; slug: string; title: string; parentId: string | null; order: number }
export interface StudySession {
  slug: string; title: string; originalTitle: string; seriesId: string; order: number; teacher: string | null;
  date: string | null; durationSeconds: number | null; youtubeId: string | null; sermonAudioId: string | null;
}
export interface StudyContent { description: string; scripture: string[]; questions: { question: string; answer: string }[]; transcript: string }
export interface CanonBook { slug: string; name: string; abbr: string }
export interface Redirect { from: string; to: string; match: string; note?: string }
export interface Contact { streetAddress: string; addressLocality: string; addressRegion: string; postalCode: string; phone: string; email: string; map: string }
export interface Settings { notice: { show: boolean; text: string }; contact: Contact; services: string[] }
export type Source = "sermonaudio" | "captions" | "church";

export interface SiteData {
  sermons: Sermon[];
  taxonomies: TaxonomyTerm[];
  descriptions: Record<string, string>;
  durations: Record<string, number>;
  sources: Record<string, Source>;
  events: { events: ChurchEvent[]; venues: Record<string, Venue> };
  studies: { series: StudySeries[]; sessions: StudySession[] };
  settings: Settings;
  images: Record<string, Image>;
  canon: CanonBook[];
}

export class ValidationError extends Error {
  constructor(readonly problems: string[]) { super(problems.join("\n")); }
}
export class ConflictError extends Error {}

export interface Edit {
  path: string;
  /** New text for the file (null deletes it), given its current text (null if it does not exist). */
  apply(text: string | null): string | null;
  /** A message if someone else's change between `base` and `latest` clashes with this edit. */
  clash?(base: string | null, latest: string | null): string | null;
}

export const toJson = (data: unknown) => `${JSON.stringify(data, null, 1)}\n`;

/** Edit a JSON file in place. `pick` returns the part being edited, used to detect clashing edits. */
export function jsonEdit<T>(path: string, mutate: (data: T) => void, pick?: (data: T) => unknown): Edit {
  return {
    path,
    apply(text) {
      if (text === null) throw new Error(`${path} is missing`);
      const data = JSON.parse(text) as T;
      mutate(data);
      return toJson(data);
    },
    clash(base, latest) {
      if (!pick || base === latest) return null;
      if (base === null || latest === null) return "the file was removed";
      const before = JSON.stringify(pick(JSON.parse(base) as T) ?? null);
      const after = JSON.stringify(pick(JSON.parse(latest) as T) ?? null);
      return before === after ? null : "someone else changed the same item";
    },
  };
}

/** Replace a whole file (or delete it with null). Clashes if anyone else changed that file. */
export function fileEdit(path: string, content: string | null): Edit {
  return {
    path,
    apply: () => content,
    clash: (base, latest) => (base === latest ? null : "someone else changed the same text"),
  };
}

export class Store {
  data!: SiteData;
  /** The commit the data was read from. */
  head = "";
  private texts = new Map<string, string | null>();
  private extra = new Map<string, unknown>();

  constructor(readonly gh: GitHub) {}

  async load(): Promise<void> {
    const head = await this.gh.headSha();
    this.texts.clear();
    const keys = ["sermons","taxonomies", "descriptions", "durations", "sources", "events", "studies", "settings", "images", "canon"] as const;
    const texts = await Promise.all(keys.map((k) => this.gh.readText(DATA[k], head)));
    const data: Record<string, unknown> = {};
    keys.forEach((k, i) => {
      const text = texts[i];
      if (text === null) throw new Error(`${DATA[k]} is missing from the repository.`);
      this.texts.set(DATA[k], text);
      data[k] = JSON.parse(text);
    });
    (data as { canon: CanonBook[] }).canon = (data.canon as (CanonBook & { bookend?: string })[]).filter((b) => !b.bookend);
    this.data = data as unknown as SiteData;
    this.head = head;
    this.extra.clear();
  }

  /** A file at the loaded commit (cached), for content not loaded up front. */
  async text(path: string): Promise<string | null> {
    if (!this.texts.has(path)) this.texts.set(path, await this.gh.readText(path, this.head));
    return this.texts.get(path) ?? null;
  }
  async json<T>(path: string): Promise<T | null> {
    if (this.extra.has(path)) return this.extra.get(path) as T;
    const text = await this.text(path);
    const value = text === null ? null : (JSON.parse(text) as T);
    this.extra.set(path, value);
    return value;
  }

  /** Applies the edits as one commit. Returns the new commit's SHA, or null when nothing changed. */
  async save(message: string, edits: Edit[]): Promise<string | null> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const head = await this.gh.headSha();
      const paths = [...new Set(edits.map((e) => e.path))];
      const base = new Map<string, string | null>();
      for (const path of paths) base.set(path, await this.text(path));
      let current = base;
      if (head !== this.head) {
        current = new Map();
        for (const path of paths) current.set(path, await this.gh.readText(path, head));
        for (const edit of edits) {
          const reason = edit.clash?.(base.get(edit.path) ?? null, current.get(edit.path) ?? null);
          if (reason) throw new ConflictError(`Not saved: ${reason} while you were editing. Reload the page to see the latest version, then make your change again.`);
        }
      }
      const next = new Map(current);
      for (const edit of edits) next.set(edit.path, edit.apply(next.get(edit.path) ?? null));
      const changes = paths.filter((p) => next.get(p) !== current.get(p)).map((p) => ({ path: p, content: next.get(p) ?? null }));
      if (!changes.length) return null;
      this.check(next);
      try {
        const sha = await this.gh.commit(head, changes, message);
        const moved = head !== this.head;
        for (const [path, text] of next) this.texts.set(path, text);
        this.head = sha;
        this.applyToData(next);
        if (moved) await this.load(); // others had saved too: pick up everything they changed
        return sha;
      } catch (error) {
        if (!(error instanceof NotFastForward)) throw error;
        // Someone saved at the same moment; go round again on top of their commit.
      }
    }
    throw new ConflictError("Not saved: others kept saving at the same moment. Please try again.");
  }

  private check(next: Map<string, string | null>) {
    const pick = <T>(key: keyof typeof DATA, fallback: T): T => {
      const text = next.get(DATA[key]);
      return text === undefined ? fallback : text === null ? fallback : (JSON.parse(text) as T);
    };
    // Files loaded only for some pages (pages, articles, home, redirects) are checked when they are at hand.
    const extra = <T>(key: keyof typeof DATA): T | undefined => {
      const text = next.get(DATA[key]);
      if (typeof text === "string") return JSON.parse(text) as T;
      return (this.extra.get(DATA[key]) as T | null | undefined) ?? undefined;
    };
    const studyContent: Record<string, object> = {};
    for (const [path, text] of next) {
      const match = /^src\/data\/study-content\/(.+)\.json$/u.exec(path);
      if (match && text !== null) studyContent[match[1]!] = JSON.parse(text);
    }
    const d = this.data;
    const problems = validateData({
      sermons: pick("sermons", d.sermons),
      taxonomies: pick("taxonomies", d.taxonomies),
      descriptions: pick("descriptions", d.descriptions),
      durations: pick("durations", d.durations),
      transcriptSources: pick("sources", d.sources),
      events: pick("events", d.events),
      studies: pick("studies", d.studies),
      studyContent,
      settings: pick("settings", d.settings),
      images: d.images,
      redirects: extra<Redirect[]>("redirects"),
      pages: extra<object[]>("pages"),
      posts: extra<object[]>("posts"),
      home: extra<object>("home"),
      protectedSeo: extra<{ pages: Record<string, { title: string; description: string; h1: string }> }>("protectedSeo"),
    });
    if (problems.length) throw new ValidationError(problems);
  }

  private applyToData(next: Map<string, string | null>) {
    for (const key of Object.keys(DATA) as (keyof typeof DATA)[]) {
      const text = next.get(DATA[key]);
      if (text === undefined || text === null) continue;
      if (["pages", "posts", "home", "protectedSeo", "intentional", "redirects"].includes(key)) this.extra.set(DATA[key], JSON.parse(text));
      else if (key !== "canon") (this.data as unknown as Record<string, unknown>)[key] = JSON.parse(text);
    }
    for (const [path, text] of next) if (path.includes("/study-content/")) this.extra.set(path, text === null ? null : JSON.parse(text));
  }
}

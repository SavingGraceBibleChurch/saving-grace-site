// Transcripts per sermon. "sermonaudio" and "captions" are unchecked machine transcripts;
// "church" means someone at the church saved or corrected it in the admin.
import sourcesData from "../data/sermon-transcript-sources.json";
import type { Sermon } from "./types";

export type TranscriptSource = "sermonaudio" | "captions" | "church";
const files = import.meta.glob<string>("../data/sermon-transcripts/*.txt", { query: "?raw", import: "default", eager: true });
const byId = new Map(Object.entries(files).map(([path, text]) => [path.replace(/^.*\/(\d+)\.txt$/u, "$1"), text]));
const sources = sourcesData as Record<string, TranscriptSource>;

export interface Transcript { text: string; source: TranscriptSource; words: number }

export function transcriptFor(sermon: Sermon): Transcript | undefined {
  const key = String(sermon.wpId);
  const text = byId.get(key)?.trim();
  if (!text) return undefined;
  return { text, source: sources[key] ?? "captions", words: text.split(/\s+/u).filter(Boolean).length };
}

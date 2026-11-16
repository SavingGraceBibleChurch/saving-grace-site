// Sermon descriptions and recording lengths. The base set comes from the local database
// (scripts/export_local_content.py); descriptions written from SermonAudio transcripts
// (scripts/add_description.py) and SermonAudio recording lengths fill the gaps.
import extrasData from "../data/sermon-extras.json";
import addedDescriptions from "../data/sermon-descriptions-added.json";
import addedDurations from "../data/sermon-durations-added.json";
import type { Sermon } from "./types";

interface Extra { summary: string; durationSeconds: number | null; durationProvider: string | null }
const extras = extrasData as Record<string, Extra>;
const descriptions = addedDescriptions as Record<string, string>;
const durations = addedDurations as Record<string, number>;

export function extraFor(sermon: Sermon): Extra | undefined {
  const key = String(sermon.wpId);
  const base = extras[key];
  const summary = base?.summary || descriptions[key] || "";
  const durationSeconds = base?.durationSeconds ?? durations[key] ?? null;
  if (!summary && !durationSeconds) return undefined;
  return {
    summary,
    durationSeconds,
    durationProvider: base?.durationSeconds ? base.durationProvider : durations[key] ? "sermonaudio" : null,
  };
}

/** "55:26" or "1:00:16". */
export function formatDuration(seconds?: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "55 minutes, 26 seconds", for screen readers. */
export function spokenDuration(seconds: number): string {
  const parts: [number, string][] = [[Math.floor(seconds / 3600), "hour"], [Math.floor((seconds % 3600) / 60), "minute"], [seconds % 60, "second"]];
  return parts.filter(([value]) => value > 0).map(([value, unit]) => `${value} ${unit}${value === 1 ? "" : "s"}`).join(", ");
}

/** The first sentences of a description, cut at a word, for meta descriptions. */
export function excerpt(text: string, max = 158): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).replace(/\s+\S*$/u, "")}…`;
}

export const paragraphs = (text: string) => text.split(/\n\s*\n/u).map((p) => p.trim()).filter(Boolean);

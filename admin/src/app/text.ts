// Small text helpers: addresses (slugs), pasted media links, dates.

/** "Angry Little Johnny!" → "angry-little-johnny". Empty for titles with no Latin letters or digits. */
export function slugify(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/gu, "").toLowerCase()
    .replace(/['’]/gu, "").replace(/&/gu, " and ").replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
}

/** WordPress-style passage slug: "1 Corinthians 11:23-30" → "1-corinthians-1123-30". */
export function passageSlug(passage: string): string {
  return passage.toLowerCase().replace(/[:.,;]/gu, "").replace(/[–—]/gu, "-").replace(/[^a-z0-9-]+/gu, "-").replace(/-+/gu, "-").replace(/^-|-$/gu, "");
}

/** Accepts a YouTube ID or any common YouTube link. Returns null when it is not recognisable. */
export function youtubeId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  if (/^[A-Za-z0-9_-]{11}$/u.test(text)) return text;
  try {
    const url = new URL(text.startsWith("http") ? text : `https://${text}`);
    const v = url.searchParams.get("v");
    if (v && /^[A-Za-z0-9_-]{11}$/u.test(v)) return v;
    const match = /^\/(?:embed\/|live\/|shorts\/|v\/)?([A-Za-z0-9_-]{11})(?:\/|$)/u.exec(url.pathname);
    if (match && /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/u.test(url.hostname)) return match[1]!;
  } catch { /* not a link */ }
  return null;
}

/** Accepts a SermonAudio ID or link (sermons/ID, sermoninfo.asp?SID=ID, the embed player). */
export function sermonAudioId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  if (/^\d{6,20}$/u.test(text)) return text;
  try {
    const url = new URL(text.startsWith("http") ? text : `https://${text}`);
    if (!/(^|\.)sermonaudio\.com$/u.test(url.hostname)) return null;
    const sid = url.searchParams.get("SID") ?? url.searchParams.get("sid");
    if (sid && /^\d{6,20}$/u.test(sid)) return sid;
    const match = /\/(\d{6,20})(?:\/|$)/u.exec(url.pathname);
    if (match) return match[1]!;
  } catch { /* not a link */ }
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDate(new Date());
/** Today if it is Sunday, otherwise the Sunday just gone. */
export function lastSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return isoDate(d);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** "2026-11-15" → "15 Nov 2026". */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}
export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)} d ago`;
  return shortDate(iso.slice(0, 10));
}

export const wordCount = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length;

/** Paragraphs split on blank lines, trimmed. */
export const toParagraphs = (text: string) => text.replace(/\r\n/gu, "\n").split(/\n\s*\n/u).map((p) => p.trim()).filter(Boolean);
/** A transcript or description as stored: paragraphs separated by blank lines, ending in one newline. */
export const normaliseLongText = (text: string) => {
  const paragraphs = toParagraphs(text);
  return paragraphs.length ? `${paragraphs.join("\n\n")}\n` : "";
};

// Fetches SermonAudio's machine transcript for sermons that have a SermonAudio ID but no transcript yet,
// cleans it with the same rules as scripts/clean_transcripts.py and saves it, plus the recording length.
// Runs in CI before every build and once a day, so a new sermon's transcript appears once SermonAudio has one.
//
// Needs SERMONAUDIO_API_KEY in the environment (a GitHub secret); without it, it does nothing.
// The key is only ever sent to api.sermonaudio.com and is never printed.
// Usage: node scripts/fetch_new_transcripts.mjs [--limit 20]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
const API = "https://api.sermonaudio.com/v2/node/sermons/";
const key = process.env.SERMONAUDIO_API_KEY?.trim();
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : 20;

const NAMES = { god: "God", jesus: "Jesus", christ: "Christ", i: "I", "i'm": "I'm", "i've": "I've", "i'll": "I'll", "i'd": "I'd" };

/** Same rules as clean() in scripts/clean_transcripts.py: tidy only, never add, drop or reorder words. */
export function clean(raw) {
  let text = raw.replace(/\[(?:music|applause|laughter|inaudible|__)[^\]]*\]/giu, " ");
  text = text.replace(/\s+/gu, " ").trim();
  text = text.replace(/\s+([,.;:?!])/gu, "$1");
  text = text.replace(/\b(god|jesus|christ|i|i'm|i've|i'll|i'd)\b/gu, (word) => NAMES[word]);
  const sentences = text.split(/(?<=[.?!])\s+/u).filter(Boolean).map((s) => s.slice(0, 1).toUpperCase() + s.slice(1));
  const paragraphs = [];
  let current = [];
  let words = 0;
  for (const sentence of sentences) {
    current.push(sentence);
    words += sentence.split(/\s+/u).filter(Boolean).length;
    if (words >= 110) {
      paragraphs.push(current.join(" "));
      current = [];
      words = 0;
    }
  }
  if (current.length) paragraphs.push(current.join(" "));
  return `${paragraphs.join("\n\n")}\n`;
}

/** Python difflib.SequenceMatcher(None, a, b).ratio() for short strings (Ratcliff/Obershelp). */
export function similarity(a, b) {
  const matched = (x, y) => {
    if (!x || !y) return 0;
    let best = 0, bi = 0, bj = 0;
    for (let i = 0; i < x.length; i++) {
      for (let j = 0; j < y.length; j++) {
        let k = 0;
        while (i + k < x.length && j + k < y.length && x[i + k] === y[j + k]) k++;
        if (k > best) { best = k; bi = i; bj = j; }
      }
    }
    return best ? best + matched(x.slice(0, bi), y.slice(0, bj)) + matched(x.slice(bi + best), y.slice(bj + best)) : 0;
  };
  const total = a.length + b.length;
  return total ? (2 * matched(a, b)) / total : 1;
}
const norm = (t) => (t ?? "").toLowerCase().replace(/[^\p{L}\p{N}_ ]/gu, "").trim();

async function get(url, headers = {}) {
  const response = await fetch(url, { headers: { "User-Agent": "church-website-build", ...headers }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));
const readJson = (name) => JSON.parse(readFileSync(join(DATA, name), "utf8"));
const writeJson = (name, data) => writeFileSync(join(DATA, name), `${JSON.stringify(Object.fromEntries(Object.entries(data).sort(([a], [b]) => Number(a) - Number(b))), null, 1)}\n`);

async function main() {
  if (!key) {
    console.log("SERMONAUDIO_API_KEY is not set, so no transcripts were fetched.");
    return;
  }
  const sermons = readJson("sermons.json");
  const sources = readJson("sermon-transcript-sources.json");
  const durations = readJson("sermon-durations.json");
  const targets = sermons.filter((s) => s.sermonAudioId && !sources[String(s.wpId)] && !existsSync(join(DATA, "sermon-transcripts", `${s.wpId}.txt`))).slice(0, LIMIT);
  const report = { checked: 0, saved: [], notYet: [], wrongRecording: [], errors: [] };

  for (const sermon of targets) {
    const id = String(sermon.wpId);
    const label = `${sermon.date} ${sermon.title}`;
    report.checked++;
    try {
      const meta = await (await get(API + encodeURIComponent(sermon.sermonAudioId), { "X-Api-Key": key })).json();
      await pause();
      if (meta.audioDurationSeconds && !durations[id]) durations[id] = Math.round(meta.audioDurationSeconds);
      const ratio = similarity(norm(meta.fullTitle || meta.displayTitle), norm(sermon.title));
      if (ratio < 0.6) {
        report.wrongRecording.push(`${label}: SermonAudio ${sermon.sermonAudioId} is titled "${meta.fullTitle || meta.displayTitle}"`);
        continue;
      }
      const url = meta.transcript?.downloadURL;
      if (!url) {
        report.notYet.push(label);
        continue;
      }
      if (new URL(url).hostname !== "cloud.sermonaudio.com") throw new Error("unexpected transcript host");
      const raw = await (await get(url)).text();
      await pause();
      const text = clean(raw);
      if (text.trim().split(/\s+/u).length < 50) {
        report.notYet.push(`${label} (transcript too short)`);
        continue;
      }
      writeFileSync(join(DATA, "sermon-transcripts", `${id}.txt`), text);
      sources[id] = "sermonaudio";
      report.saved.push(label);
    } catch (error) {
      report.errors.push(`${label}: ${error instanceof Error ? error.message.slice(0, 120) : "failed"}`);
    }
  }
  writeJson("sermon-transcript-sources.json", sources);
  writeJson("sermon-durations.json", durations);
  console.log(JSON.stringify(report, null, 1));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();

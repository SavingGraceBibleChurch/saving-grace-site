// SEO parity check: every live URL must either exist in dist/ with the live title,
// description, canonical and H1, or redirect (one hop) to a page that exists.
//
// Inputs: dist/ (run the build first), src/data/redirects.json,
//         private/inputs/live-capture.json, private/inputs/gsc-pages.csv
// Usage:  node scripts/verify-seo.mjs [--details]
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const DIST = join(ROOT, "dist");
const SITE = "https://www.savinggrace.org.au";
const details = process.argv.includes("--details");

const redirects = JSON.parse(readFileSync(join(ROOT, "src/data/redirects.json"), "utf8"));
const capture = JSON.parse(readFileSync(join(ROOT, "private/inputs/live-capture.json"), "utf8"));
const gsc = readFileSync(join(ROOT, "private/inputs/gsc-pages.csv"), "utf8").trim().split(/\r?\n/).slice(1)
  .map((line) => { const [url, clicks, impressions] = line.split(","); return { url, clicks: Number(clicks), impressions: Number(impressions) }; });

// ---------------------------------------------------------------- helpers
const decode = (p) => { try { return decodeURI(p); } catch { return p; } };
function fileFor(path) {
  const clean = decode(path.split("?")[0]);
  const candidates = clean.endsWith("/") ? [join(DIST, clean, "index.html")] : [join(DIST, clean), join(DIST, clean, "index.html")];
  // Large WordPress uploads are deployed from private/uploads/ (scripts/collect_uploads.py), not from Git.
  if (clean.startsWith("/wp-content/uploads/")) candidates.push(join(ROOT, "private/uploads", clean));
  return candidates.find((c) => existsSync(c)) ?? null;
}
const exact = new Map(redirects.filter((r) => r.match === "exact").map((r) => [r.from, r.to]));
const query = new Map(redirects.filter((r) => r.match === "query").map((r) => [r.from, r.to]));
const prefixes = redirects.filter((r) => r.match === "prefix").sort((a, b) => b.from.length - a.from.length);
const rewrites = new Map(redirects.filter((r) => r.match === "rewrite").map((r) => [r.from, r.to]));

/** What the static host will do with a request: {kind: "page"|"redirect"|"missing", ...}. */
export function resolve(url) {
  const [path, qs] = url.split("?");
  if (qs !== undefined) {
    const hit = query.get(url) ?? query.get(decode(url));
    if (hit) return { kind: "redirect", to: hit, rule: "query" };
    if (/^(s|q)=/.test(qs) && path === "/") return { kind: "redirect", to: "/search/", rule: "search" };
  }
  if (rewrites.has(path) && fileFor(rewrites.get(path))) return { kind: "page", file: fileFor(rewrites.get(path)), rewrite: true };
  if (fileFor(path)) return { kind: "page", file: fileFor(path) };
  const hit = exact.get(path) ?? exact.get(decode(path));
  if (hit) return { kind: "redirect", to: hit, rule: "exact" };
  if (!path.endsWith("/") && !/\.[a-z0-9]{2,5}$/i.test(path) && fileFor(path + "/")) return { kind: "redirect", to: path + "/", rule: "slash" };
  const prefix = prefixes.find((r) => path.startsWith(r.from) || decode(path).startsWith(r.from));
  if (prefix && prefix.to !== path) return { kind: "redirect", to: prefix.to, rule: "prefix" };
  return { kind: "missing" };
}

function meta(html) {
  const pick = (re) => { const m = html.match(re); return m ? decodeEntities(m[1].trim()) : null; };
  return {
    title: pick(/<title>([^<]*)<\/title>/),
    description: pick(/<meta name="description" content="([^"]*)"/),
    canonical: pick(/<link rel="canonical" href="([^"]*)"/),
    robots: pick(/<meta name="robots" content="([^"]*)"/),
    h1: (() => { const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/); return m ? decodeEntities(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) : null; })(),
  };
}
function decodeEntities(s) {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
const norm = (s) => (s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
const toPath = (url) => { const u = new URL(url); return u.pathname + u.search; };

// ----------------------------------------------------- 1. every live URL
const results = { page: 0, redirect: 0, missing: [], brokenRedirect: [], chains: 0 };
const metaIssues = [];
// Reviewed, deliberate departures from the live metadata (each with its reason) are reported, not failed.
const intentional = JSON.parse(readFileSync(join(ROOT, "scripts/seo-intentional-changes.json"), "utf8"));
const intentionalChanges = [];
const isIntentional = (path, issue) => intentional.some((c) => c.path === path && issue.startsWith(c.field));
const indexableKinds = new Set(["page", "post", "sermon"]);
for (const route of capture) {
  const r = resolve(route.path);
  if (r.kind === "missing") {
    if (route.p.kind !== "asset") results.missing.push({ path: route.path, kind: route.p.kind, indexable: route.p.indexable });
    continue;
  }
  if (r.kind === "redirect") {
    results.redirect++;
    const target = resolve(r.to);
    if (target.kind !== "page") results.brokenRedirect.push({ from: route.path, to: r.to, target: target.kind });
    continue;
  }
  results.page++;
  if (!indexableKinds.has(route.p.kind) || !route.p.indexable) continue;
  const m = meta(readFileSync(r.file, "utf8"));
  const expectCanonical = route.p.canonicalSource ? SITE + toPath(route.p.canonicalSource) : SITE + route.path;
  const issues = [];
  if (norm(m.title) !== norm(route.p.title)) issues.push(`title: "${m.title}" ≠ live "${route.p.title}"`);
  if ((route.p.description || "") && norm(m.description) !== norm(route.p.description)) issues.push(`description differs`);
  if (m.canonical !== expectCanonical) issues.push(`canonical ${m.canonical} ≠ ${expectCanonical}`);
  if (!m.robots?.startsWith("index")) issues.push(`robots ${m.robots}`);
  if (route.p.heading && norm(m.h1) !== norm(route.p.heading)) issues.push(`h1: "${m.h1}" ≠ live "${route.p.heading}"`);
  const accepted = issues.filter((issue) => isIntentional(route.path, issue));
  if (accepted.length) intentionalChanges.push({ path: route.path, issues: accepted });
  const remaining = issues.filter((issue) => !isIntentional(route.path, issue));
  if (remaining.length) metaIssues.push({ path: route.path, kind: route.p.kind, issues: remaining });
}

// ------------------------------------------- 2. Search Console traffic URLs
let gscClicksCovered = 0, gscClicksTotal = 0;
const gscMissing = [];
for (const row of gsc) {
  gscClicksTotal += row.clicks;
  const path = toPath(row.url);
  const r = resolve(path);
  const ok = r.kind === "page" || (r.kind === "redirect" && resolve(r.to).kind === "page");
  if (ok) gscClicksCovered += row.clicks; else gscMissing.push({ path, clicks: row.clicks, impressions: row.impressions });
}

// ------------------------------------------- 3. internal links in dist/
import { readdirSync, statSync } from "node:fs";
function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== "pagefind" && name !== "_astro") yield* htmlFiles(full); }
    else if (name.endsWith(".html")) yield full;
  }
}
const brokenLinks = new Map();
let linkCount = 0;
for (const file of htmlFiles(DIST)) {
  const html = readFileSync(file, "utf8");
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#]*)(?:#[^"]*)?"/g)) {
    const href = decodeEntities(m[1]);
    if (href.startsWith("//") || href.startsWith("/_astro/") || href.startsWith("/pagefind/")) continue;
    linkCount++;
    const r = resolve(href);
    if (r.kind === "missing" || (r.kind === "redirect" && resolve(r.to).kind !== "page")) {
      const from = file.slice(DIST.length).replace(/\\/g, "/").replace(/index\.html$/, "");
      brokenLinks.set(href, [...(brokenLinks.get(href) ?? []), from]);
    } else if (r.kind === "redirect") {
      results.chains++;
      results.chainLinks = results.chainLinks ?? new Map();
      results.chainLinks.set(href, r.to);
    }
  }
}

// ------------------------------------------------------------------ report
const byKind = (list) => list.reduce((acc, x) => ((acc[x.kind] = (acc[x.kind] ?? 0) + 1), acc), {});
const report = {
  liveUrlsChecked: capture.length,
  servedAsPages: results.page,
  servedByRedirect: results.redirect,
  missingNonAsset: results.missing.length,
  missingByKind: byKind(results.missing),
  missingIndexable: results.missing.filter((m) => m.indexable).length,
  redirectsToNowhere: results.brokenRedirect.length,
  metadataMismatches: metaIssues.length,
  intentionalChanges: intentionalChanges.length,
  metadataMismatchesByKind: byKind(metaIssues),
  searchConsole: { urls: gsc.length, clicksCovered: gscClicksCovered, clicksTotal: gscClicksTotal, uncoveredUrls: gscMissing.length },
  internalLinksChecked: linkCount,
  brokenInternalLinks: brokenLinks.size,
  internalLinksThroughRedirect: results.chains,
};
console.log(JSON.stringify(report, null, 1));
const out = { intentionalChanges, chainLinks: Object.fromEntries(results.chainLinks ?? []), report, missing: results.missing, brokenRedirects: results.brokenRedirect, metaIssues, gscMissing, brokenLinks: Object.fromEntries(brokenLinks) };
writeFileSync(join(ROOT, "private/seo-verification.json"), JSON.stringify(out, null, 1));
if (details) {
  console.log("\nmissing (sample):", results.missing.slice(0, 25));
  console.log("\nmetadata issues (sample):", metaIssues.slice(0, 15));
  console.log("\nsearch console uncovered:", gscMissing.slice(0, 25));
  console.log("\nbroken links:", [...brokenLinks].slice(0, 20));
}
const failed = report.missingIndexable + report.redirectsToNowhere + report.brokenInternalLinks + gscMissing.filter((g) => g.clicks > 0).length;
process.exitCode = failed ? 1 : 0;

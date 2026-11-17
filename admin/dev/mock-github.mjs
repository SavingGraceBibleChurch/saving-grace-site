// A stand-in for the parts of the GitHub API the admin uses, for trying the admin locally without
// touching the real repository. Commits live in memory on top of the files in this checkout; nothing
// is written to disk. Listens on 127.0.0.1 only.
//
//   node admin/dev/mock-github.mjs            (port 8790, token "test-token")
//   then in the admin's browser console:      localStorage.setItem("sg-admin-api", "http://127.0.0.1:8790")
//
// Test helpers: POST /__mock/commit {path, content, message} makes a commit "by someone else";
// GET /__mock/log lists commits and the files each changed; GET /__mock/file?path=… reads a file at the head.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = Number(process.env.MOCK_PORT ?? 8790);
const TOKEN = "test-token";
const ORIGINS = new Set(["http://127.0.0.1:4330", "http://localhost:4330"]);

let counter = 0;
const id = (prefix) => `${prefix}${(++counter).toString(16).padStart(39, "0")}`;
const trees = new Map([["t0", { base: null, changes: new Map() }]]);
const commits = new Map([["c0", { sha: "c0", parent: null, tree: "t0", message: "Initial state (files in this checkout)", author: "checkout", date: new Date().toISOString(), created: Date.now() }]]);
let head = "c0";

function readAt(treeSha, path) {
  for (let t = trees.get(treeSha); t; t = trees.get(t.base)) if (t.changes.has(path)) return t.changes.get(path);
  const file = normalize(join(ROOT, path));
  const readable = path.startsWith("src/data/") || path === "scripts/seo-intentional-changes.json";
  if (!file.startsWith(normalize(ROOT)) || !readable || !existsSync(file)) return null;
  return readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}
function changedPaths(sha) {
  const c = commits.get(sha);
  const out = [];
  for (let t = trees.get(c.tree); t && t !== trees.get(commits.get(c.parent)?.tree); t = trees.get(t.base)) out.push(...t.changes.keys());
  return [...new Set(out)];
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}
async function body(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, X-GitHub-Api-Version");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  }
  if (req.method === "OPTIONS") return send(res, 204, "", "text/plain");
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  // ---- test helpers (no token needed)
  if (path === "/__mock/log") return send(res, 200, [...commits.values()].map((c) => ({ sha: c.sha, parent: c.parent, message: c.message, author: c.author, files: c.parent ? changedPaths(c.sha) : [] })));
  if (path === "/__mock/file") return send(res, 200, readAt(commits.get(head).tree, url.searchParams.get("path")) ?? "(missing)", "text/plain; charset=utf-8");
  if (path === "/__mock/commit" && req.method === "POST") {
    const b = await body(req);
    const tree = id("t");
    trees.set(tree, { base: commits.get(head).tree, changes: new Map([[b.path, b.content]]) });
    const sha = id("c");
    commits.set(sha, { sha, parent: head, tree, message: b.message ?? "Someone else's change", author: "someone-else", date: new Date().toISOString(), created: Date.now() });
    head = sha;
    return send(res, 200, { sha });
  }

  if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { message: "Bad credentials" });
  let m;
  if (path === "/user") return send(res, 200, { login: "test-editor" });
  if ((m = /^\/repos\/([^/]+)\/([^/]+)$/.exec(path))) return send(res, 200, { full_name: `${m[1]}/${m[2]}`, permissions: { push: true } });
  if ((m = /^\/repos\/[^/]+\/[^/]+\/git\/ref\/heads\/(.+)$/.exec(path))) return send(res, 200, { object: { sha: head } });
  if ((m = /^\/repos\/[^/]+\/[^/]+\/git\/commits\/([^/]+)$/.exec(path)) && req.method === "GET") {
    const c = commits.get(m[1]);
    return c ? send(res, 200, { sha: c.sha, tree: { sha: c.tree } }) : send(res, 404, { message: "Not Found" });
  }
  if ((m = /^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/.exec(path))) {
    const c = commits.get(url.searchParams.get("ref") ?? head);
    if (!c) return send(res, 404, { message: "No commit found for the ref" });
    const text = readAt(c.tree, decodeURIComponent(m[1]));
    return text === null ? send(res, 404, { message: "Not Found" }) : send(res, 200, text, "text/plain; charset=utf-8");
  }
  if (/^\/repos\/[^/]+\/[^/]+\/git\/trees$/.test(path) && req.method === "POST") {
    const b = await body(req);
    if (!trees.has(b.base_tree)) return send(res, 422, { message: "base_tree not found" });
    const sha = id("t");
    trees.set(sha, { base: b.base_tree, changes: new Map(b.tree.map((e) => [e.path, e.sha === null ? null : e.content])) });
    return send(res, 201, { sha });
  }
  if (/^\/repos\/[^/]+\/[^/]+\/git\/commits$/.test(path) && req.method === "POST") {
    const b = await body(req);
    const sha = id("c");
    commits.set(sha, { sha, parent: b.parents[0], tree: b.tree, message: b.message, author: "test-editor", date: new Date().toISOString(), created: Date.now() });
    return send(res, 201, { sha });
  }
  if ((m = /^\/repos\/[^/]+\/[^/]+\/git\/refs\/heads\/(.+)$/.exec(path)) && req.method === "PATCH") {
    const b = await body(req);
    const c = commits.get(b.sha);
    if (!c) return send(res, 422, { message: "Object does not exist" });
    if (c.parent !== head && !b.force) return send(res, 422, { message: "Update is not a fast forward" });
    head = b.sha;
    return send(res, 200, { object: { sha: head } });
  }
  if ((m = /^\/repos\/[^/]+\/[^/]+\/commits\/([^/]+)$/.exec(path))) {
    const c = commits.get(m[1]);
    if (!c) return send(res, 404, { message: "Not Found" });
    return send(res, 200, { sha: c.sha, parents: c.parent ? [{ sha: c.parent }] : [], files: c.parent ? changedPaths(c.sha).map((filename) => ({ filename, status: "modified" })) : [] });
  }
  if (/^\/repos\/[^/]+\/[^/]+\/commits$/.test(path)) {
    const list = [];
    for (let c = commits.get(head); c && list.length < Number(url.searchParams.get("per_page") ?? 30); c = commits.get(c.parent)) {
      list.push({ sha: c.sha, html_url: `https://example.invalid/commit/${c.sha}`, commit: { message: c.message, author: { name: c.author, date: c.date } }, author: { login: c.author } });
    }
    return send(res, 200, list);
  }
  if (/^\/repos\/[^/]+\/[^/]+\/actions\/runs$/.test(path)) {
    const c = commits.get(url.searchParams.get("head_sha"));
    if (!c || c.sha === "c0") return send(res, 200, { workflow_runs: [] });
    const age = Date.now() - c.created;
    return send(res, 200, { workflow_runs: [{ name: "Site", status: age < 8000 ? "in_progress" : "completed", conclusion: age < 8000 ? null : "success", html_url: "https://example.invalid/run" }] });
  }
  send(res, 404, { message: `Mock has no route for ${req.method} ${path}` });
});
server.listen(PORT, "127.0.0.1", () => console.log(`Mock GitHub API on http://127.0.0.1:${PORT} (token "${TOKEN}")`));

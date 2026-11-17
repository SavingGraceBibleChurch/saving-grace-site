// Recent saves to the website, newest first, with their build status and an Undo button.
import { REPO, SITE_WORKFLOW } from "../config";
import type { Ctx } from "../context";
import type { Edit } from "../store";
import { timeAgo } from "../text";
import { badge, external, h, mount, pageHead, toast } from "../ui";
import { undoText } from "../undo";

// Only content can be undone here: the data files the admin edits, never the website's code.
const isContent = (path: string) => path.startsWith("src/data/") || path === "scripts/seo-intentional-changes.json";

export async function changesPage(ctx: Ctx): Promise<Node> {
  const commits = await ctx.gh.recentCommits(30);
  const statusFor = (sha: string) => {
    const host = h("span", { class: "changes__status" });
    ctx.gh.runsFor(sha).then((runs) => {
      const run = runs.find((r) => r.name === SITE_WORKFLOW);
      if (!run) return;
      mount(host, run.status !== "completed" ? badge("Building", "info")
        : run.conclusion === "success" ? badge("Published", "ok")
        : run.conclusion === "failure" ? h("a", { attrs: { href: run.url, target: "_blank", rel: "noopener" } }, badge("Build failed", "warn")) : null);
    }).catch(() => { /* status is a nice-to-have */ });
    return host;
  };

  const undo = async (sha: string, message: string, button: HTMLButtonElement) => {
    button.disabled = true;
    try {
      const details = await ctx.gh.commitDetails(sha);
      if (details.parents.length !== 1) { toast("This change can't be undone here.", "error"); return; }
      if (!details.files.length || !details.files.every((f) => isContent(f.path))) {
        toast("Only changes to the website's content can be undone here. Code changes need a developer.", "error", 8000);
        return;
      }
      if (!window.confirm(`Undo “${message}”?\n\nThis puts back what was there before that change. Changes made since to other items are kept.`)) return;
      const parent = details.parents[0]!;
      const edits: Edit[] = await Promise.all(details.files.map(async (f) => {
        const [atCommit, atParent] = await Promise.all([ctx.gh.readText(f.path, sha), ctx.gh.readText(f.path, parent)]);
        return { path: f.path, apply: (head: string | null) => undoText(f.path, head, atCommit, atParent) };
      }));
      const done = await ctx.save(`Undo: ${message.replace(/^Undo: /u, "")}`, edits);
      if (done) {
        await ctx.store.load(); // everything shown elsewhere reflects the undo
        ctx.go(`#/changes?undone=${Date.now()}`);
      }
    } finally {
      button.disabled = false;
    }
  };

  return h("div", null,
    pageHead("Changes", external("Full history on GitHub", `https://github.com/${REPO.owner}/${REPO.name}/commits/${REPO.branch}`)),
    h("p", { class: "page-head__lede", text: "Every save is kept. Undo puts back what a change replaced, as a new change, so it can itself be undone." }),
    h("ul", { class: "changes" }, commits.map((c, i) => {
      const undoButton = h("button", { class: "btn btn--quiet btn--small", attrs: { type: "button" }, text: "Undo" });
      undoButton.addEventListener("click", () => void undo(c.sha, c.message, undoButton));
      return h("li", { class: "changes__item" },
        h("span", { class: "changes__message" }, c.message),
        h("span", { class: "changes__meta" }, `${c.author} · ${timeAgo(c.date)} · `, external(c.sha.slice(0, 7), c.url)),
        h("span", { class: "changes__side" }, i < 5 ? statusFor(c.sha) : null, undoButton));
    })));
}

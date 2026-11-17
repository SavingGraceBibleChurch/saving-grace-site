// Recent saves to the website, newest first, with whether the latest one has been built.
import { REPO, SITE_WORKFLOW } from "../config";
import type { Ctx } from "../context";
import { timeAgo } from "../text";
import { badge, external, h, mount, pageHead } from "../ui";

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
  return h("div", null,
    pageHead("Changes", external("Full history on GitHub", `https://github.com/${REPO.owner}/${REPO.name}/commits/${REPO.branch}`)),
    h("p", { class: "page-head__lede", text: "Every save is kept. To undo a change, ask whoever looks after the website to revert it on GitHub." }),
    h("ul", { class: "changes" }, commits.map((c, i) => h("li", { class: "changes__item" },
      h("span", { class: "changes__message" }, c.message),
      h("span", { class: "changes__meta" }, `${c.author} · ${timeAgo(c.date)} · `, external(c.sha.slice(0, 7), c.url)),
      i < 5 ? statusFor(c.sha) : null))));
}

// Follows the build of the latest save and shows it in the top bar:
// building → live on the website, or failed (the website keeps the previous version).
import { SITE_WORKFLOW, SITE_URL } from "./config";
import type { GitHub } from "./github";
import { h, mount } from "./ui";

let timer: number | undefined;
let tracking = "";

export function trackBuild(gh: GitHub, sha: string) {
  const el = document.getElementById("build-status");
  if (!el) return;
  tracking = sha;
  clearTimeout(timer);
  const started = Date.now();
  const show = (tone: string, text: string, title: string, href?: string) => {
    const content = [h("span", { class: "pill__dot", attrs: { "aria-hidden": "true" } }), text];
    mount(el, href
      ? h("a", { class: ["pill", `pill--${tone}`], attrs: { href, target: "_blank", rel: "noopener", title, role: "status" } }, content, h("span", { class: "sr-only", text: ` — ${title}` }))
      : h("span", { class: ["pill", `pill--${tone}`], attrs: { title, role: "status" } }, content, h("span", { class: "sr-only", text: ` — ${title}` })));
  };
  show("busy", "Saved", "Saved. Waiting for the site build to start.");

  const poll = async () => {
    if (tracking !== sha) return;
    try {
      const run = (await gh.runsFor(sha)).find((r) => r.name === SITE_WORKFLOW);
      if (!run) {
        if (Date.now() - started > 3 * 60_000) return show("muted", "Saved", "Saved. The build hasn't started yet; it will pick this up.");
      } else if (run.status !== "completed") {
        show("busy", "Building…", "The site is being rebuilt with your change. Click to watch.", run.url);
      } else if (run.conclusion === "success") {
        show("ok", "Published", "Built. It goes live on the website within 2 minutes. Click to open the website.", SITE_URL);
        return;
      } else if (run.conclusion === "cancelled" || run.conclusion === "skipped") {
        show("ok", "Published", "Included in a newer build.");
        return;
      } else {
        show("error", "Build failed", "The build failed, so the website still shows the previous version. Click to see why.", run.url);
        return;
      }
    } catch {
      /* keep trying quietly; the save itself already succeeded */
    }
    if (Date.now() - started < 20 * 60_000) timer = window.setTimeout(poll, 10_000);
  };
  timer = window.setTimeout(poll, 4000);
}

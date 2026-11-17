// Edit a page or article: its wording, and (separately, with care) its search-engine settings.
// Web addresses never change here. The pages that bring in most Google visits have their search title,
// description and main heading locked; changing them takes a deliberate unlock and a reason, which is
// recorded for the SEO check (scripts/seo-intentional-changes.json).
import type { Page, Post } from "../../../../src/lib/types";
import { DATA, DOCTRINAL, STAGING } from "../config";
import type { Ctx } from "../context";
import { blockList, markupField, textField } from "../blocks";
import { jsonEdit, type Edit } from "../store";
import { today } from "../text";
import { badge, card, external, h, mount, nextId, problemsBox, saveBar, setDirty } from "../ui";

export interface Protected { about: string; pages: Record<string, { title: string; description: string; h1: string }> }
export interface Intentional { path: string; field: string; reason: string }

export async function loadPageFiles(ctx: Ctx) {
  const [pages, posts, home, protectedSeo] = await Promise.all([
    ctx.store.json<Page[]>(DATA.pages), ctx.store.json<Post[]>(DATA.posts), ctx.store.json<Record<string, any>>(DATA.home), ctx.store.json<Protected>(DATA.protectedSeo),
    ctx.store.json(DATA.intentional), ctx.store.json(DATA.redirects), // loaded for the link check before saving
  ]);
  return { pages: pages ?? [], posts: posts ?? [], home: home!, protectedSeo: protectedSeo ?? { about: "", pages: {} } };
}

/** The search fields, and what a save of them has to record. */
export function seoSection(opts: {
  path: string; locked: boolean; title: string; description: string; h1: string;
  onChange(field: "title" | "description" | "h1", value: string): void;
  reason: { value: string };
  h1Editable?: boolean;
  /** More fields that count as search settings (the home page's heading parts). */
  extraFields?: HTMLElement[];
}) {
  const counter = (n: number, ideal: [number, number]) => `${n} characters${n < ideal[0] || n > ideal[1] ? ` · Google shows about ${ideal[0]}–${ideal[1]}` : ""}`;
  const titleCount = h("span", { class: "field__count", text: counter(opts.title.length, [30, 65]) });
  const descCount = h("span", { class: "field__count", text: counter(opts.description.length, [70, 160]) });
  const previewTitle = h("p", { class: "serp__title", text: opts.title });
  const previewDesc = h("p", { class: "serp__desc", text: opts.description });
  const fields: HTMLElement[] = [];
  const title = textField("Search title (the blue link in Google)", opts.title, (v) => { opts.onChange("title", v); titleCount.textContent = counter(v.length, [30, 65]); previewTitle.textContent = v; }, { disabled: opts.locked });
  const desc = markupField("Search description (the text under the link)", opts.description, (v) => { opts.onChange("description", v); descCount.textContent = counter(v.length, [70, 160]); previewDesc.textContent = v; }, { rows: 3, plain: true });
  const heading = opts.h1Editable === false ? null : textField("Main heading (the big title on the page)", opts.h1, (v) => opts.onChange("h1", v), { disabled: opts.locked });
  title.append(titleCount);
  desc.append(descCount);
  if (opts.locked) desc.querySelector("textarea")!.disabled = true;
  fields.push(title, desc);
  if (heading) fields.push(heading);
  for (const el of opts.extraFields ?? []) {
    if (opts.locked) el.querySelectorAll<HTMLInputElement>("input, textarea").forEach((x) => { x.disabled = true; });
    fields.push(el);
  }

  const reasonId = nextId("why");
  const reason = h("textarea", { class: "input input--area", attrs: { id: reasonId, rows: 2, placeholder: "e.g. The service time changed to 10 am." } });
  reason.addEventListener("input", () => { opts.reason.value = reason.value; setDirty(true); });
  const reasonField = h("div", { class: "field" }, h("label", { class: "field__label", attrs: { for: reasonId }, text: "Why are you changing these? (kept with the change for the SEO check)" }), reason);

  const unlockHost = h("div");
  if (opts.locked) {
    const ackId = nextId("ack");
    const ack = h("input", { attrs: { type: "checkbox", id: ackId } });
    const unlock = h("button", { class: "btn btn--danger", attrs: { type: "button", disabled: true }, text: "Unlock the search settings" });
    ack.addEventListener("change", () => { unlock.disabled = !ack.checked; });
    unlock.addEventListener("click", () => {
      for (const el of fields) el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea").forEach((x) => { x.disabled = false; });
      mount(unlockHost, h("p", { class: "lock-note lock-note--open", text: "Unlocked. Change only what you must; the reason below is saved with the change." }), reasonField);
    });
    mount(unlockHost,
      h("p", { class: "lock-note" }, "🔒 Locked. This page brings in a large share of the website's Google visits. Changing its search title, description or main heading can move it up or down in Google results."),
      h("label", { class: "check", attrs: { for: ackId } }, ack, h("span", null, "I understand, and this change has been agreed.")),
      unlock);
  } else {
    unlockHost.append(reasonField);
    reasonField.hidden = true;
    // Only ask why once a search field is actually touched.
    for (const el of fields) el.addEventListener("input", () => { reasonField.hidden = false; }, { once: true });
  }

  return h("details", { class: "seo-card" },
    h("summary", { class: "seo-card__summary" }, h("span", { text: "Search engine settings" }), opts.locked ? badge("Locked", "warn") : badge("Change with care", "muted")),
    h("div", { class: "seo-card__body" },
      h("p", { class: "fixed-value" }, h("span", { class: "fixed-value__label", text: "Web address (never changes)" }), h("code", { text: opts.path })),
      h("div", { class: "serp", attrs: { "aria-hidden": "true" } }, h("p", { class: "serp__url", text: `www.savinggrace.org.au${opts.path === "/" ? "" : opts.path}` }), previewTitle, previewDesc),
      fields, unlockHost));
}

/** The edits that record a deliberate change to search settings. */
export function seoEdits(path: string, changed: string[], snapshot: { title: string; description: string; h1: string } | null, reason: string, user: string): Edit[] {
  if (!changed.length) return [];
  const note = `${reason.trim()} (changed in the admin by ${user} on ${today()})`;
  const edits: Edit[] = [jsonEdit<Intentional[]>(DATA.intentional, (list) => {
    for (const field of changed) list.push({ path, field, reason: note });
  })];
  if (snapshot) edits.push(jsonEdit<Protected>(DATA.protectedSeo, (d) => { d.pages[path] = snapshot; }, (d) => d.pages[path]));
  return edits;
}

export async function pageEditPage(ctx: Ctx, kind: "page" | "post", id: string): Promise<Node> {
  const files = await loadPageFiles(ctx);
  const list = (kind === "page" ? files.pages : files.posts) as (Page | Post)[];
  const original = list.find((p) => p.id === id);
  if (!original) return h("div", { class: "empty" }, h("h1", { text: "Page not found" }), h("a", { class: "link", attrs: { href: "#/pages" }, text: "Back to pages" }));
  const draft = structuredClone(original) as Page & Post;
  const locked = Boolean(files.protectedSeo.pages[original.path]);
  const doctrinal = DOCTRINAL.has(original.path);
  const reason = { value: "" };
  const problems = h("div");
  const approveId = nextId("approve");
  const approve = h("input", { attrs: { type: "checkbox", id: approveId } });

  const page = draft as Page;
  const details = kind === "page"
    ? card("Page",
        h("div", { class: "form-grid" },
          textField("Small label above the heading (optional)", page.eyebrow ?? "", (v) => { page.eyebrow = v.trim() ? v : null; }),
          textField("Short name (used in menus and link cards)", page.navTitle, (v) => { page.navTitle = v; })),
        markupField("Introduction (optional)", page.lede ?? "", (v) => { page.lede = v.trim() ? v : null; }, { rows: 3 }))
    : null;

  const save = async () => {
    const errors: string[] = [];
    if (doctrinal && !approve.checked) errors.push("Tick that the elders have approved this change.");
    const changed = (["title", "description", "h1"] as const).filter((f) => (f === "h1" ? draft.h1 !== original.h1 : draft.seo[f] !== original.seo[f]));
    if (changed.length && reason.value.trim().length < 8) errors.push("Say briefly why the search settings are changing (at least a few words).");
    if (errors.length) { problems.replaceChildren(problemsBox("Not saved yet:", errors)); problems.scrollIntoView({ block: "center" }); return; }
    if (draft.seo.ogTitle === original.seo.title) draft.seo.ogTitle = draft.seo.title;
    if (draft.seo.ogDescription === original.seo.description) draft.seo.ogDescription = draft.seo.description;
    const file = kind === "page" ? DATA.pages : DATA.posts;
    const edits: Edit[] = [
      jsonEdit<(Page | Post)[]>(file, (all) => { const at = all.findIndex((p) => p.id === id); all[at] = draft; }, (all) => all.find((p) => p.id === id)),
      ...seoEdits(original.path, changed, locked ? { title: draft.seo.title, description: draft.seo.description, h1: draft.h1 } : null, reason.value, ctx.user),
    ];
    const sha = await ctx.save(`Edit ${kind === "page" ? "page" : "article"}: ${draft.h1}${doctrinal ? " (approved by the elders)" : ""}`, edits, problems);
    if (sha) { setDirty(false); ctx.go(`#/pages/${kind}/${encodeURIComponent(id)}?saved=${Date.now()}`); }
  };

  return h("div", { class: "editor" },
    h("header", { class: "page-head" },
      h("p", { class: "page-head__crumb" }, h("a", { class: "link", attrs: { href: "#/pages" }, text: "Pages" }), " / "),
      h("h1", { class: "page-head__title", text: original.h1 }),
      h("div", { class: "page-head__extra" }, external("View on staging", `${STAGING}${original.path}`))),
    locked ? h("p", { class: "banner banner--warn" }, h("strong", { text: "This page brings in Google visits. " }), "Change its wording freely, but keep it about the same thing. Its search settings are locked below.") : null,
    doctrinal ? h("p", { class: "banner banner--info" }, h("strong", { text: "This page sets out what the church believes. " }), "Saving a change needs the elders' approval.") : null,
    problems,
    details,
    card("Content", h("p", { class: "card__lede", text: "Edit the text in place. Paragraphs, headings, lists, quotes and highlighted boxes can also be added, moved and deleted." }), blockList(draft.blocks)),
    kind === "page" && page.aside?.length ? card("Sidebar", blockList(page.aside)) : null,
    seoSection({
      path: original.path, locked, title: draft.seo.title, description: draft.seo.description, h1: draft.h1, reason,
      onChange: (field, value) => { if (field === "h1") draft.h1 = value; else draft.seo[field] = value; setDirty(true); },
    }),
    doctrinal ? card("Approval", h("label", { class: "check", attrs: { for: approveId } }, approve, h("span", null, h("strong", { text: "The elders have approved this change." }), " It is recorded with the change."))) : null,
    saveBar(save, () => { if (window.confirm("Throw away your changes?")) { setDirty(false); ctx.go(`#/pages/${kind}/${encodeURIComponent(id)}?reset=${Date.now()}`); } }));
}

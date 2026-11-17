// The Pages section: the list of pages and articles, the home page, and the church's details
// (address, phone, email, service times) that appear across the site.
import type { Page, Post } from "../../../../src/lib/types";
import { DATA, DOCTRINAL, STAGING } from "../config";
import type { Ctx } from "../context";
import { linesField, markupField, textField } from "../blocks";
import { jsonEdit, type Contact, type Edit, type Settings } from "../store";
import { badge, card, external, h, pageHead, problemsBox, saveBar, setDirty } from "../ui";
import { loadPageFiles, seoEdits, seoSection } from "./page-edit";

const SECTIONS: [string, string][] = [["about", "About the church"], ["teaching", "What we teach"], ["ministries", "Ministries"]];

export async function pagesListPage(ctx: Ctx): Promise<Node> {
  const { pages, posts, protectedSeo } = await loadPageFiles(ctx);
  const row = (href: string, title: string, path: string) => h("li", { class: "rows__item" },
    h("a", { class: "rows__link rows__link--plain", attrs: { href } },
      h("span", { class: "rows__main" }, h("span", { class: "rows__title", text: title }), h("span", { class: "rows__meta", text: path })),
      h("span", { class: "rows__badges" },
        protectedSeo.pages[path] ? badge("Google visits", "warn") : null,
        DOCTRINAL.has(path) ? badge("Elders approve", "info") : null)));
  const grouped = SECTIONS.map(([key, label]) => [label, pages.filter((p) => p.section === key)] as const);
  const others = pages.filter((p) => !SECTIONS.some(([key]) => key === p.section));
  return h("div", null,
    pageHead("Pages"),
    h("p", { class: "page-head__lede", text: "Change the wording of the website. Web addresses never change. Pages marked “Google visits” bring in most of the search traffic: edit their text freely, but their search settings are locked. Pages marked “Elders approve” need the elders' approval ticked before saving." }),
    h("div", { class: "grid-2" },
      card("Church details", h("p", { class: "card__lede", text: "Address, phone, email and service times, used across the whole site." }), h("a", { class: "btn btn--primary", attrs: { href: "#/pages/details" }, text: "Edit church details" })),
      card("Home page", h("p", { class: "card__lede", text: "The welcome, about, services and ministry text on the front page." }), h("a", { class: "btn btn--secondary", attrs: { href: "#/pages/home" }, text: "Edit the home page" }))),
    ...grouped.map(([label, list]) => h("section", { class: "page-group" }, h("h2", { class: "page-group__title", text: label }),
      h("ul", { class: "rows" }, list.map((p) => row(`#/pages/page/${encodeURIComponent(p.id)}`, p.h1, p.path))))),
    h("section", { class: "page-group" }, h("h2", { class: "page-group__title", text: "Other pages" }),
      h("ul", { class: "rows" }, others.map((p) => row(`#/pages/page/${encodeURIComponent(p.id)}`, p.h1, p.path)))),
    h("section", { class: "page-group" }, h("h2", { class: "page-group__title", text: "Articles" }),
      h("ul", { class: "rows" }, (posts as Post[]).map((p) => row(`#/pages/post/${encodeURIComponent(p.id)}`, p.h1, p.path)))));
}

// ------------------------------------------------------------------ home page
type Home = { seo: { title: string; description: string; ogTitle?: string | null; ogDescription?: string | null }; copy: Record<string, any> };

export async function homeEditPage(ctx: Ctx): Promise<Node> {
  const { home, protectedSeo } = await loadPageFiles(ctx);
  const original = home as Home;
  const draft: Home = structuredClone(original);
  const c = draft.copy;
  const problems = h("div");
  const reason = { value: "" };
  const locked = Boolean(protectedSeo.pages["/"]);
  const t = (label: string, obj: Record<string, any>, key: string) => textField(label, obj[key], (v) => { obj[key] = v; });
  const m = (label: string, obj: Record<string, any>, key: string) => markupField(label, obj[key], (v) => { obj[key] = v; }, { rows: 3, plain: true });
  const h1Of = (x: Home) => [x.copy.heroCopy.eyebrow, x.copy.heroCopy.nameLine1, x.copy.heroCopy.nameLine2].join(" ");

  // The three parts of the big welcome heading are the page's main heading for Google, so they sit with
  // the locked search settings.
  const heroName = [t("Main heading, small first part", c.heroCopy, "eyebrow"), t("Main heading, line 1", c.heroCopy, "nameLine1"), t("Main heading, line 2", c.heroCopy, "nameLine2")];
  const seo = seoSection({
    path: "/", locked, title: draft.seo.title, description: draft.seo.description, h1: h1Of(draft), reason, h1Editable: false, extraFields: heroName,
    onChange: (field, value) => { if (field !== "h1") draft.seo[field] = value; setDirty(true); },
  });

  const save = async () => {
    const changed: string[] = [];
    if (draft.seo.title !== original.seo.title) changed.push("title");
    if (draft.seo.description !== original.seo.description) changed.push("description");
    if (h1Of(draft) !== h1Of(original)) changed.push("h1");
    if (changed.length && reason.value.trim().length < 8) { problems.replaceChildren(problemsBox("Not saved yet:", ["Say briefly why the search settings are changing (at least a few words)."])); return; }
    if (draft.seo.ogTitle === original.seo.title) draft.seo.ogTitle = draft.seo.title;
    if (draft.seo.ogDescription === original.seo.description) draft.seo.ogDescription = draft.seo.description;
    const edits: Edit[] = [
      jsonEdit<Home>(DATA.home, (d) => { d.seo = draft.seo; d.copy = draft.copy; }, (d) => d),
      ...seoEdits("/", changed, locked ? { title: draft.seo.title, description: draft.seo.description, h1: h1Of(draft) } : null, reason.value, ctx.user),
    ];
    const sha = await ctx.save("Edit the home page", edits, problems);
    if (sha) { setDirty(false); ctx.go(`#/pages/home?saved=${Date.now()}`); }
  };

  return h("div", { class: "editor" },
    h("header", { class: "page-head" },
      h("p", { class: "page-head__crumb" }, h("a", { class: "link", attrs: { href: "#/pages" }, text: "Pages" }), " / "),
      h("h1", { class: "page-head__title", text: "Home page" }),
      h("div", { class: "page-head__extra" }, external("View on staging", `${STAGING}/`))),
    h("p", { class: "banner banner--warn" }, h("strong", { text: "The home page brings in the most Google visits. " }), "Change its wording freely; its search settings and main heading are locked below."),
    problems,
    card("Top of the page", h("div", { class: "form-grid" }, t("Small heading above the button", c.heroCopy, "newHere"), t("Service time", c.heroCopy, "serviceTime"), t("Address", c.heroCopy, "address"), t("Button", c.heroCopy, "join"))),
    card("Welcome", t("Heading", c.welcomeCopy, "heading"), m("Text", c.welcomeCopy, "paragraph")),
    card("About", t("Heading", c.aboutCopy, "heading"), m("Text", c.aboutCopy, "paragraph"), h("div", { class: "form-grid" }, t("Link label", c.aboutCopy, "learnMore"), t("Giving heading", c.aboutCopy, "giveHeading"), t("Giving link label", c.aboutCopy, "giveLink")), m("Quote", c.aboutCopy, "quote"), t("Who said it", c.aboutCopy, "attribution")),
    card("Lord's Day services", t("Heading", c.servicesCopy, "heading"),
      h("div", { class: "form-grid" }, t("Morning: title", c.servicesCopy.morning, "title"), t("Evening: title", c.servicesCopy.evening, "title")),
      m("Morning: text", c.servicesCopy.morning, "text"), m("Evening: text", c.servicesCopy.evening, "text")),
    card("Ministry cards", (c.pillars as Record<string, string>[]).map((p, i) => h("div", { class: "block-group" }, h("p", { class: "block-group__title", text: `Card ${i + 1}` }), t("Title", p, "title"), m("Text", p, "text"), t("Link label", p, "readMore")))),
    card("Sermons and events", h("div", { class: "form-grid" }, t("Sermons heading", c.sermonsCopy, "heading"), t("All sermons link", c.sermonsCopy, "viewAll"), t("Events heading", c.eventsCopy, "heading"), t("Calendar link", c.eventsCopy, "viewCalendar"))),
    seo,
    saveBar(save, () => { if (window.confirm("Throw away your changes?")) { setDirty(false); ctx.go(`#/pages/home?reset=${Date.now()}`); } }));
}

// ------------------------------------------------------------------ church details
const phoneForms = (phone: string) => {
  const digits = phone.replace(/\D/gu, "");
  const national = digits.startsWith("61") ? `0${digits.slice(2)}` : digits;
  return [national, `${national.slice(0, 4)} ${national.slice(4, 7)} ${national.slice(7)}`, `+61${national.slice(1)}`];
};

/** Replaces old values with new ones in every string inside an object (in place). Returns how many changed. */
function replaceIn(value: any, pairs: [string, string][]): number {
  let count = 0;
  if (Array.isArray(value)) value.forEach((v, i) => { if (typeof v === "string") { const n = swap(v, pairs); if (n !== v) { value[i] = n; count++; } } else count += replaceIn(v, pairs); });
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { if (typeof v === "string") { const n = swap(v, pairs); if (n !== v) { value[k] = n; count++; } } else count += replaceIn(v, pairs); }
  return count;
}
const swap = (text: string, pairs: [string, string][]) => pairs.reduce((t, [from, to]) => (from && from !== to ? t.split(from).join(to) : t), text);

export async function detailsPage(ctx: Ctx): Promise<Node> {
  await loadPageFiles(ctx);
  const settings = ctx.store.data.settings as Settings;
  const original = settings.contact;
  const draft: Contact = { ...original };
  const services = { list: [...settings.services] };
  const problems = h("div");
  const t = (label: string, key: keyof Contact, hint?: string) => textField(label, draft[key], (v) => { draft[key] = v.trim(); }, { hint });

  const save = async () => {
    // Every other copy of the old details (home page, contact page, the church venue on events) follows.
    const pairs: [string, string][] = [];
    const add = (from: string, to: string) => { if (from !== to) pairs.push([from, to]); };
    const [oldPhone, oldSpaced, oldIntl] = phoneForms(original.phone);
    const [newPhone, newSpaced, newIntl] = phoneForms(draft.phone);
    add(oldIntl!, newIntl!); add(oldSpaced!, newSpaced!); add(oldPhone!, newPhone!);
    add(original.email, draft.email);
    add(original.streetAddress, draft.streetAddress);
    add(original.map, draft.map);
    add(`${original.addressLocality} ${original.addressRegion} ${original.postalCode}`, `${draft.addressLocality} ${draft.addressRegion} ${draft.postalCode}`);
    add(`${original.addressLocality}, Victoria ${original.postalCode}`, `${draft.addressLocality}, Victoria ${draft.postalCode}`);
    add(`${original.addressRegion} ${original.postalCode}`, `${draft.addressRegion} ${draft.postalCode}`);
    add(original.addressLocality, draft.addressLocality);
    const edits: Edit[] = [jsonEdit<Settings>(DATA.settings, (s) => { s.contact = { ...draft }; s.services = services.list; }, (s) => [s.contact, s.services])];
    if (pairs.length) {
      edits.push(jsonEdit<Home>(DATA.home, (d) => { replaceIn(d.copy.contactCopy, pairs); d.copy.heroCopy.address = swap(d.copy.heroCopy.address, pairs); }));
      edits.push(jsonEdit<Page[]>(DATA.pages, (all) => { for (const p of all) for (const b of p.blocks) if (b.kind === "contact-panel") replaceIn(b, pairs); }));
      edits.push(jsonEdit<{ venues: Record<string, unknown> }>(DATA.events, (d) => { replaceIn(d.venues.church, pairs); }));
    }
    const sha = await ctx.save("Update the church details", edits, problems);
    if (sha) { setDirty(false); ctx.go(`#/pages/details?saved=${Date.now()}`); }
  };

  return h("div", { class: "editor" },
    h("header", { class: "page-head" },
      h("p", { class: "page-head__crumb" }, h("a", { class: "link", attrs: { href: "#/pages" }, text: "Pages" }), " / "),
      h("h1", { class: "page-head__title", text: "Church details" })),
    h("p", { class: "page-head__lede", text: "Used in the footer of every page, on the contact page, the home page and in the information search engines read. Saving updates all of them." }),
    problems,
    card("Address", h("div", { class: "form-grid" }, t("Street", "streetAddress", "e.g. Unit 5/217-219 Mickleham Rd"), t("Suburb", "addressLocality"), t("State", "addressRegion", "e.g. VIC"), t("Postcode", "postalCode")),
      t("Map link", "map", "The Google Maps link for “Get directions”.")),
    card("Phone and email", h("div", { class: "form-grid" }, t("Phone", "phone", "Ten digits, e.g. 0450545589"), t("Email", "email"))),
    card("Service times",
      linesField("Shown in the footer of every page", services.list, (v) => { services.list = v; }, "One service per line, e.g. Morning Worship: 10:30 am – 12:30 pm."),
      h("p", { class: "field__hint" }, "Service times are also written on the ", h("a", { class: "link", attrs: { href: "#/pages/home" }, text: "home page" }), " (top and “Lord's Day services”) and in ", h("a", { class: "link", attrs: { href: "#/events" }, text: "Events" }), ". Change them there too.")),
    saveBar(save, () => { if (window.confirm("Throw away your changes?")) { setDirty(false); ctx.go(`#/pages/details?reset=${Date.now()}`); } }));
}

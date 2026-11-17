// Editors for the content blocks of a page. The layout of a page stays as it is: text can be changed
// everywhere, and simple text blocks (paragraphs, headings, lists, quotes, callouts) can also be added,
// moved and removed. Structured blocks (people, tiles, giving, contact…) keep their shape; only their
// wording changes.
import { inline } from "../../../src/lib/markup";
import type { Block } from "../../../src/lib/types";
import { button, h, mount, nextId, setDirty } from "./ui";

type Any = Record<string, any>;
const SIMPLE = new Set(["paragraph", "heading", "list", "quote", "callout"]);
const NAMES: Record<string, string> = {
  paragraph: "Paragraph", heading: "Heading", list: "List", quote: "Quote", callout: "Highlighted box", figure: "Picture",
  tiles: "Link cards", people: "People", timeline: "Timeline", "next-event": "Next event", video: "Video", playlist: "Video playlist",
  downloads: "Downloads", hymns: "Hymns", index: "Contents", "sermon-cards": "Latest sermons", "external-plate": "Link panel",
  book: "Book", "contact-panel": "Contact details", "giving-methods": "Ways to give", "events-calendar": "Events calendar",
  "blog-list": "Blog list", "sitemap-list": "List of all pages", panel: "Panel",
};
const MARKUP_HINT = "Links: [words](/page/ or https://…). Bold: **words**. Italic: _words_.";

// ------------------------------------------------------------------ fields
function grow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight + 4, 640)}px`;
}

export function textField(label: string, value: string | undefined, onChange: (v: string) => void, opts: { disabled?: boolean; hint?: string } = {}) {
  const id = nextId("t");
  const el = h("input", { class: "input", attrs: { id, type: "text", disabled: opts.disabled }, value: value ?? "" });
  el.addEventListener("input", () => { onChange(el.value); setDirty(true); });
  return h("div", { class: "field" }, h("label", { class: "field__label", attrs: { for: id }, text: label }), el, opts.hint ? h("p", { class: "field__hint", text: opts.hint }) : null);
}

/** A text box for inline markup, with a live preview of how it will look (links, bold, italic). */
export function markupField(label: string, value: string | undefined, onChange: (v: string) => void, opts: { rows?: number; plain?: boolean } = {}) {
  const id = nextId("m");
  const el = h("textarea", { class: "input input--area", attrs: { id, rows: opts.rows ?? 3 } });
  el.value = value ?? "";
  const preview = h("div", { class: "markup-preview", attrs: { "aria-hidden": "true" } });
  const show = () => {
    const hasMarkup = !opts.plain && /\[[^\]]+\]\([^)]+\)|\*\*|(^|\s)_\S/u.test(el.value);
    preview.hidden = !hasMarkup;
    if (hasMarkup) preview.innerHTML = inline(el.value); // inline() escapes everything except its own tags
  };
  el.addEventListener("input", () => { onChange(el.value); setDirty(true); grow(el); show(); });
  requestAnimationFrame(() => grow(el));
  show();
  return h("div", { class: "field" }, h("label", { class: "field__label", attrs: { for: id }, text: label }), el, opts.plain ? null : preview);
}

/** One entry per line (list items, address lines). */
export function linesField(label: string, value: string[], onChange: (v: string[]) => void, hint = "One per line.") {
  const id = nextId("l");
  const el = h("textarea", { class: "input input--area", attrs: { id, rows: Math.max(3, value.length + 1) } });
  el.value = value.join("\n");
  el.addEventListener("input", () => { onChange(el.value.split("\n").map((x) => x.trim()).filter(Boolean)); setDirty(true); grow(el); });
  requestAnimationFrame(() => grow(el));
  return h("div", { class: "field" }, h("label", { class: "field__label", attrs: { for: id }, text: label }), el, h("p", { class: "field__hint", text: `${hint} ${MARKUP_HINT}` }));
}

/** Paragraphs separated by blank lines (people's bios). */
function paragraphsField(label: string, value: string[], onChange: (v: string[]) => void) {
  const id = nextId("p");
  const el = h("textarea", { class: "input input--area", attrs: { id, rows: 6 } });
  el.value = value.join("\n\n");
  el.addEventListener("input", () => { onChange(el.value.split(/\n\s*\n/u).map((x) => x.trim()).filter(Boolean)); setDirty(true); grow(el); });
  requestAnimationFrame(() => grow(el));
  return h("div", { class: "field" }, h("label", { class: "field__label", attrs: { for: id }, text: label }), el, h("p", { class: "field__hint", text: `Separate paragraphs with a blank line. ${MARKUP_HINT}` }));
}

const fixed = (label: string, value: string) => h("p", { class: "fixed-value" }, h("span", { class: "fixed-value__label", text: label }), h("code", { text: value }));
const group = (...children: (Node | null)[]) => h("div", { class: "block-group" }, children);

// ------------------------------------------------------------------ one block
function fieldsFor(b: Any): (Node | null)[] {
  const set = (key: string) => (v: unknown) => { b[key] = v; };
  switch (b.kind) {
    case "paragraph": return [markupField("Text", b.text, set("text"), { rows: 4 })];
    case "heading": {
      const id = nextId("lvl");
      const level = h("select", { class: "input input--select input--inline", attrs: { id } }, [2, 3, 4].map((n) => h("option", { attrs: { value: String(n) }, text: n === 2 ? "Section heading" : n === 3 ? "Sub-heading" : "Small heading" })));
      level.value = String(b.level ?? 2);
      level.addEventListener("change", () => { b.level = Number(level.value); setDirty(true); });
      return [textField("Heading", b.text, set("text")), h("div", { class: "field" }, h("label", { class: "field__label", attrs: { for: id }, text: "Size" }), level)];
    }
    case "list": {
      const id = nextId("ord");
      const ordered = h("input", { attrs: { type: "checkbox", id }, checked: Boolean(b.ordered) });
      ordered.addEventListener("change", () => { b.ordered = ordered.checked || undefined; if (!b.ordered) delete b.ordered; setDirty(true); });
      return [linesField("Items", b.items ?? [], set("items")), h("label", { class: "check check--inline", attrs: { for: id } }, ordered, h("span", { text: "Numbered list" }))];
    }
    case "quote": return [markupField("Quote", b.text, set("text"), { rows: 3 }), textField("Who said it (optional)", b.cite, (v) => { if (v.trim()) b.cite = v; else delete b.cite; })];
    case "callout": return [textField("Title (optional)", b.title, (v) => { if (v.trim()) b.title = v; else delete b.title; }), markupField("Text", b.text, set("text"), { rows: 3 })];
    case "figure": return [fixed("Picture", b.media), markupField("Caption (optional)", b.caption, (v) => { if (v.trim()) b.caption = v; else delete b.caption; }, { rows: 2 }), textField("Description for people who can't see it (optional)", b.alt, (v) => { if (v.trim()) b.alt = v; else delete b.alt; })];
    case "book": return [fixed("Picture", b.media), markupField("Text", b.text, set("text"), { rows: 4 })];
    case "next-event": return [fixed("Event", b.event), textField("Label", b.label, set("label"))];
    case "video": case "playlist": return [textField("Title", b.title, set("title"))];
    case "external-plate": return [textField("Title", b.title, set("title")), markupField("Text", b.text, set("text"), { rows: 2 }), textField("Button label", b.label, set("label")), fixed("Link", b.href)];
    case "sermon-cards": return [textField("Heading", b.heading, set("heading")), markupField("Text (optional)", b.text, (v) => { if (v.trim()) b.text = v; else delete b.text; }, { rows: 2 }), textField("Link label", b.linkLabel, set("linkLabel"))];
    case "blog-list": return [textField("Heading (optional)", b.heading, (v) => { if (v.trim()) b.heading = v; else delete b.heading; })];
    case "events-calendar": return [
      textField("Upcoming heading", b.upcomingHeading, (v) => { b.upcomingHeading = v; }),
      textField("Regular events heading", b.regularHeading, (v) => { b.regularHeading = v; }),
      textField("Past events heading", b.pastHeading, (v) => { b.pastHeading = v; })];
    case "sitemap-list": return [h("p", { class: "muted", text: "Lists every page automatically. Nothing to edit." })];
    case "contact-panel": return [h("p", { class: "muted" }, "Address, phone and email come from ", h("a", { class: "link", attrs: { href: "#/pages/details" }, text: "Church details" }), " and are updated from there.")];
    case "tiles": return (b.items as Any[]).map((x, i) => group(h("p", { class: "block-group__title", text: `Card ${i + 1}` }), textField("Title", x.title, (v) => { x.title = v; }), markupField("Text", x.text, (v) => { x.text = v; }, { rows: 2 }), x.linkLabel !== undefined ? textField("Link label", x.linkLabel, (v) => { x.linkLabel = v; }) : null, x.href ? fixed("Links to", x.href) : null));
    case "people": return (b.items as Any[]).map((x) => group(textField("Name", x.name, (v) => { x.name = v; }), textField("Role", x.role, (v) => { x.role = v; }), paragraphsField("About them", x.text ?? [], (v) => { x.text = v; })));
    case "downloads": return (b.items as Any[]).map((x) => group(textField("Title", x.title, (v) => { x.title = v; }), markupField("Text", x.text, (v) => { x.text = v; }, { rows: 2 }), textField("Button label", x.label, (v) => { x.label = v; }), fixed("File", x.href)));
    case "hymns": case "index": return (b.items as Any[]).map((x) => group(textField("Title", x.title, (v) => { x.title = v; }), markupField("Text", x.text, (v) => { x.text = v; }, { rows: 2 }), fixed("Links to", x.href)));
    case "timeline": return [timelineEditor(b)];
    case "giving-methods": return [
      textField("Heading (optional)", b.heading, (v) => { if (v.trim()) b.heading = v; else delete b.heading; }),
      markupField("Introduction", b.intro, set("intro"), { rows: 2 }),
      textField("Button label", b.button.label, (v) => { b.button.label = v; }), fixed("Button link", b.button.href),
      ...(b.methods as Any[]).map((m, i) => group(h("p", { class: "block-group__title", text: `Way to give ${i + 1}` }), textField("Title", m.title, (v) => { m.title = v; }), markupField("Text", m.text, (v) => { m.text = v; }, { rows: 2 }))),
      group(h("p", { class: "block-group__title", text: "Bank transfer" }), textField("Title", b.bank.title, (v) => { b.bank.title = v; }), textField("Account name", b.bank.account, (v) => { b.bank.account = v; }), linesField("Details", b.bank.lines, (v) => { b.bank.lines = v; }, "One per line (BSB, account number…).")),
      group(h("p", { class: "block-group__title", text: "Online" }), textField("Title", b.online.title, (v) => { b.online.title = v; }), ...(b.online.links as Any[]).map((l, i) => textField(`Link ${i + 1} label`, l.label, (v) => { l.label = v; }))),
    ];
    case "panel": return [textField("Title (optional)", b.title, (v) => { if (v.trim()) b.title = v; else delete b.title; }), blockList(b.blocks)];
    default: return [h("p", { class: "muted", text: "This block has nothing to edit here." })];
  }
}

function timelineEditor(b: Any) {
  const host = h("div");
  const render = () => mount(host, (b.items as Any[]).map((x, i) => group(
    h("div", { class: "block-group__head" }, h("p", { class: "block-group__title", text: x.when || `Entry ${i + 1}` }),
      h("span", { class: "block__tools" },
        h("button", { class: "icon-btn", attrs: { type: "button", "aria-label": "Move up" }, text: "↑", on: { click: () => { if (i > 0) { [b.items[i - 1], b.items[i]] = [b.items[i], b.items[i - 1]]; setDirty(true); render(); } } } }),
        h("button", { class: "icon-btn", attrs: { type: "button", "aria-label": "Move down" }, text: "↓", on: { click: () => { if (i < b.items.length - 1) { [b.items[i + 1], b.items[i]] = [b.items[i], b.items[i + 1]]; setDirty(true); render(); } } } }),
        h("button", { class: "icon-btn icon-btn--danger", attrs: { type: "button", "aria-label": "Remove entry" }, text: "×", on: { click: () => { if (window.confirm("Remove this entry?")) { b.items.splice(i, 1); setDirty(true); render(); } } } }))),
    textField("When", x.when, (v) => { x.when = v; }), textField("Title", x.title, (v) => { x.title = v; }), markupField("Text", x.text, (v) => { x.text = v; }, { rows: 2 }))),
    button("+ Add an entry", () => { b.items.push({ when: "", title: "", text: "" }); setDirty(true); render(); }));
  render();
  return host;
}

// ------------------------------------------------------------------ a list of blocks
function newBlock(kind: string): Any {
  switch (kind) {
    case "heading": return { kind, level: 2, text: "" };
    case "list": return { kind, items: [] };
    case "callout": return { kind, text: "" };
    default: return { kind, text: "" };
  }
}

/** Edits a list of blocks in place. */
export function blockList(blocks: Block[]): HTMLElement {
  const host = h("div", { class: "blocks" });
  const list = blocks as unknown as Any[];
  const adder = (at: number) => {
    const id = nextId("add");
    const sel = h("select", { class: "input input--select input--inline input--quiet", attrs: { id, "aria-label": "Add a block here" } },
      h("option", { attrs: { value: "" }, text: "+ Add here…" }),
      ["paragraph", "heading", "list", "quote", "callout"].map((k) => h("option", { attrs: { value: k }, text: NAMES[k] })));
    sel.addEventListener("change", () => {
      if (!sel.value) return;
      list.splice(at, 0, newBlock(sel.value));
      setDirty(true);
      render();
      host.querySelectorAll<HTMLElement>(".block")[at]?.querySelector<HTMLElement>("input, textarea")?.focus();
    });
    return h("div", { class: "blocks__add" }, sel);
  };
  const render = () => {
    mount(host, list.map((b, i) => {
      const simple = SIMPLE.has(b.kind);
      const tools = simple ? h("span", { class: "block__tools" },
        h("button", { class: "icon-btn", attrs: { type: "button", "aria-label": `Move ${NAMES[b.kind]} up` }, text: "↑", on: { click: () => { if (i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; setDirty(true); render(); } } } }),
        h("button", { class: "icon-btn", attrs: { type: "button", "aria-label": `Move ${NAMES[b.kind]} down` }, text: "↓", on: { click: () => { if (i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; setDirty(true); render(); } } } }),
        h("button", { class: "icon-btn icon-btn--danger", attrs: { type: "button", "aria-label": `Delete ${NAMES[b.kind]}` }, text: "×", on: { click: () => { if (window.confirm(`Delete this ${NAMES[b.kind]!.toLowerCase()}?`)) { list.splice(i, 1); setDirty(true); render(); } } } })) : null;
      return [
        h("section", { class: ["block", `block--${b.kind}`] },
          h("header", { class: "block__head" }, h("span", { class: "block__kind", text: NAMES[b.kind] ?? b.kind }), tools),
          fieldsFor(b)),
        adder(i + 1),
      ];
    }), list.length ? null : adder(0));
  };
  render();
  return host;
}

export { MARKUP_HINT };

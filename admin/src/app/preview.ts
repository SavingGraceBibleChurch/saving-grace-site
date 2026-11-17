// The visual page editor. A page is drawn inside a frame that carries the website's own stylesheets
// (pages/preview-frame.astro), using the same HTML structure and class names as the site's components
// (PageHead, Doc and Blocks), so it looks like the real page. Text is edited where it sits: click and
// type. Selecting words shows a small toolbar for bold, italic and links; hovering a paragraph, heading,
// list, quote or highlighted box shows tools to move, add or delete it. Every edit goes straight into the
// page's data, using the site's inline markup ([label](href), **bold**, _italic_).
import { inline } from "../../../src/lib/markup";
import type { Image, Page, Post } from "../../../src/lib/types";
import { REPO } from "./config";

type Any = Record<string, any>;
type Path = (string | number)[];
type Mode = "plain" | "markup" | "paragraphs";

export interface PreviewOptions {
  kind: "page" | "post";
  draft: Page | Post;
  images: Record<string, Image>;
  pages: Page[];
  /** Whether the main heading is locked by the search-settings lock. */
  headingLocked(): boolean;
  /** Called after every edit. */
  onChange(): void;
}

const SIMPLE = new Set(["paragraph", "heading", "list", "quote", "callout"]);
const LABELS: Record<string, string> = { paragraph: "Paragraph", heading: "Heading", list: "List", quote: "Quote", callout: "Highlighted box" };
const BASE = import.meta.env.BASE_URL.replace(/\/$/u, "");
// Pictures come from the repository itself, so the editor shows the files the site will publish.
const imageUrl = (src: string) => (src.startsWith("http") ? src : `https://raw.githubusercontent.com/${REPO.owner}/${REPO.name}/main/public${src}`);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2024-01-15" → "15 January 2024", as the site shows article dates. */
const longDate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`; };
const getAt = (root: Any, path: Path): any => path.reduce((o: any, k) => (o == null ? undefined : o[k]), root);
function setAt(root: Any, path: Path, value: unknown) {
  const parent = getAt(root, path.slice(0, -1));
  if (parent) parent[path[path.length - 1]!] = value;
}
const pathKey = (p: Path) => p.join("/");
const parsePath = (s: string): Path => s.split("/").map((x) => (/^\d+$/u.test(x) ? Number(x) : x));

// ------------------------------------------------------------------ HTML back to the site's markup
// Nodes live in the frame's document, so they are checked by nodeType: `instanceof Element` would compare
// them with this window's Element and always fail.
const isElement = (n: Node | null | undefined): n is Element => n?.nodeType === 1;
const NBSP = new RegExp(String.fromCharCode(160), "gu");
function toMarkup(node: Node): string {
  let out = "";
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) { out += (n.textContent ?? "").replace(NBSP, " "); return; }
    if (!isElement(n)) return;
    const tag = n.tagName;
    if (tag === "BR") { out += "\n"; return; }
    if (tag === "DIV" || tag === "P") { const inner = toMarkup(n); out += out && !out.endsWith("\n") ? `\n${inner}` : inner; return; }
    const inner = toMarkup(n);
    const wrap = (marker: string) => {
      const m = /^(\s*)([\s\S]*?)(\s*)$/u.exec(inner)!;
      return m[2] ? `${m[1]}${marker}${m[2]}${marker}${m[3]}` : inner;
    };
    if (tag === "STRONG" || tag === "B") out += wrap("**");
    else if (tag === "EM" || tag === "I") out += wrap("_");
    else if (tag === "A") { const href = n.getAttribute("href") ?? ""; out += href && inner.trim() ? `[${inner.trim()}](${href})` : inner; }
    else out += inner;
  });
  return out;
}
const cleanMarkup = (text: string) => text.replace(/[ \t]+\n/gu, "\n").trim();
function serialize(el: HTMLElement, mode: Mode): string {
  if (mode === "plain") return (el.textContent ?? "").replace(NBSP, " ").replace(/\s*\n\s*/gu, " ");
  if (mode === "markup") return cleanMarkup(toMarkup(el));
  // paragraphs: each block child is a paragraph, joined by blank lines
  const parts: string[] = [];
  let loose = "";
  el.childNodes.forEach((n) => {
    if (isElement(n) && (n.tagName === "P" || n.tagName === "DIV")) {
      if (loose.trim()) { parts.push(cleanMarkup(loose)); loose = ""; }
      const t = cleanMarkup(toMarkup(n));
      if (t.trim()) parts.push(t);
    } else {
      const holder = el.ownerDocument.createElement("span");
      holder.append(n.cloneNode(true));
      loose += toMarkup(holder);
    }
  });
  if (loose.trim()) parts.push(cleanMarkup(loose));
  return parts.join("\n\n");
}

// ------------------------------------------------------------------ the editor
export function mountPreview(host: HTMLElement, opts: PreviewOptions) {
  const frame = document.createElement("iframe");
  frame.className = "preview__frame";
  frame.title = "The page as it will look. Click any text to change it.";
  frame.src = `${BASE}/preview-frame/`;
  host.append(frame);
  let doc: Document | null = null;
  let win: Window | null = null;
  let focusAfter: { path: string; at: "start" | "end" } | null = null;
  const draft = opts.draft as Any;

  // ---- building blocks of the page, mirroring the site's components
  const e = (tag: string, attrs: Record<string, string | boolean | undefined | null> = {}, ...kids: (Node | string | null | undefined | false | (Node | string | null | undefined | false)[])[]) => {
    const n = doc!.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? "" : v);
    const add = (k: unknown) => {
      if (k === null || k === undefined || k === false) return;
      if (Array.isArray(k)) k.forEach(add);
      else n.append(typeof k === "string" ? doc!.createTextNode(k) : (k as Node));
    };
    kids.forEach(add);
    return n;
  };
  /** An element whose text is edited in place. */
  const edit = (tag: string, path: Path, mode: Mode, attrs: Record<string, string | undefined> = {}, placeholder = "Type here…", fallback = "") => {
    // `fallback` is what the website shows when the field is empty; it is displayed, never saved unless edited.
    const value = getAt(draft, path) ?? fallback;
    const el = e(tag, { ...attrs, "data-edit": pathKey(path), "data-mode": mode, "data-placeholder": placeholder, spellcheck: "true" });
    if (mode === "plain") el.textContent = value;
    else if (mode === "markup") el.innerHTML = inline(value); // inline() escapes everything but its own tags
    else for (const p of String(value).split(/\n\s*\n/u).filter(Boolean)) el.append(Object.assign(doc!.createElement("p"), { innerHTML: inline(p) }));
    el.setAttribute("contenteditable", mode === "plain" ? "plaintext-only" : "true");
    if (mode === "plain" && el.contentEditable !== "plaintext-only") el.setAttribute("contenteditable", "true");
    return el;
  };
  const picture = (id: string | undefined | null, cls: string, alt?: string) => {
    const img = id ? opts.images[id] : undefined;
    return img ? e("img", { class: cls, src: imageUrl(img.src), width: String(img.width), height: String(img.height), alt: alt ?? img.alt, loading: "lazy" }) : null;
  };
  const placeholder = (title: string, note: string) => e("div", { class: "preview-placeholder" }, e("strong", {}, title), e("span", {}, note));

  const block = (b: Any, path: Path): HTMLElement | null => {
    const at = (...rest: (string | number)[]) => [...path, ...rest];
    const out = ((): HTMLElement | null => {
      switch (b.kind) {
        case "paragraph": return edit("p", at("text"), "markup", { class: b.lede ? "lede page__lede" : undefined }, "Type a paragraph…");
        case "heading": return edit(`h${b.level}`, at("text"), "plain", { class: `page__h${b.level}` }, "Heading");
        case "list": return e(b.ordered ? "ol" : "ul", { class: "page__list" }, (b.items as string[]).map((_, i) => edit("li", at("items", i), "markup", {}, "List item")));
        case "quote": return e("blockquote", { class: "verse" }, edit("p", at("text"), "markup", {}, "Quote…"), b.cite !== undefined ? edit("footer", at("cite"), "plain", { class: "verse__cite" }, "Who said it") : null);
        case "figure": return e("figure", { class: `figure figure--${b.size ?? "inset"}` }, picture(b.media, "figure__image", b.alt), b.caption !== undefined ? edit("figcaption", at("caption"), "markup", { class: "figure__caption" }, "Caption") : null);
        case "callout": return e("aside", { class: "callout" }, b.title !== undefined ? edit("h2", at("title"), "plain", { class: "callout__title" }, "Title") : null, edit("p", at("text"), "markup", {}, "Text…"));
        case "panel": return e("div", { class: `panel${b.columns ? ` cms-panel-columns cms-panel-columns--${b.columns}` : ""}` }, b.title !== undefined ? edit("h3", at("title"), "plain", { class: "panel__title" }) : null, blocks(b.blocks, at("blocks")));
        case "tiles": return e("ul", { class: `tiles tiles--${b.columns ?? 3}`, role: "list" }, (b.items as Any[]).map((tile, i) => e("li", { class: ["tile", tile.media && "tile--pictured", tile.href && "tile--linked"].filter(Boolean).join(" ") },
          tile.media ? e("div", { class: "tile__picture" }, picture(tile.media, "tile__image", tile.mediaAlt ?? "")) : null,
          e("div", { class: "tile__body" },
            e("h3", { class: "tile__title" }, edit("span", at("items", i, "title"), "plain")),
            tile.eyebrow && tile.eyebrow !== tile.title ? edit("p", at("items", i, "eyebrow"), "plain", { class: "tile__metadata" }) : null,
            tile.text !== undefined ? edit("p", at("items", i, "text"), "markup", { class: "tile__text" }) : null,
            tile.linkLabel && tile.href ? e("span", { class: "tile__more" }, edit("span", at("items", i, "linkLabel"), "plain")) : null))));
        case "people": return e("ul", { class: "people", role: "list" }, (b.items as Any[]).map((person, i) => e("li", { class: "person" },
          person.media ? e("div", { class: "person__picture" }, picture(person.media, "person__image", person.mediaAlt)) : null,
          e("div", { class: "person__body" },
            edit("h3", at("items", i, "name"), "plain", { class: "person__name" }),
            edit("p", at("items", i, "role"), "plain", { class: "person__role" }),
            (person.text as string[]).map((_, k) => edit("p", at("items", i, "text", k), "markup", { class: "person__text" })),
            person.email ? e("p", { class: "person__contact" }, e("a", { href: `mailto:${person.email}` }, person.email)) : null))));
        case "timeline": return e("ol", { class: "timeline", role: "list" }, (b.items as Any[]).map((_, i) => e("li", { class: "timeline__item" },
          edit("span", at("items", i, "when"), "plain", { class: "timeline__when" }),
          e("div", { class: "timeline__body" }, edit("h3", at("items", i, "title"), "plain", { class: "timeline__title" }), edit("p", at("items", i, "text"), "markup", { class: "timeline__text" })))));
        case "next-event": return e("p", { class: "next-event" }, edit("span", at("label"), "plain", { class: "next-event__label" }), " ", e("a", { class: "next-event__link", href: "#" }, "the next date, filled in automatically"));
        case "video": case "playlist": return e("figure", { class: "video-embed" }, placeholder(b.kind === "video" ? "YouTube video" : "YouTube playlist", "Shown here on the website."), edit("figcaption", at("title"), "plain", { class: "video-embed__caption" }));
        case "downloads": return e("ul", { class: "downloads", role: "list" }, (b.items as Any[]).map((_, i) => e("li", { class: "download" },
          edit("h3", at("items", i, "title"), "plain", { class: "download__title" }), edit("p", at("items", i, "text"), "markup", { class: "download__text" }),
          e("p", { class: "download__link" }, e("span", { class: "button button--outline" }, edit("span", at("items", i, "label"), "plain"), " ↗")))));
        case "hymns": return e("ul", { class: "hymns", role: "list" }, (b.items as Any[]).map((_, i) => e("li", { class: "hymn" },
          edit("h3", at("items", i, "title"), "plain", { class: "hymn__title" }), edit("p", at("items", i, "text"), "markup", { class: "hymn__text" }), e("p", {}, e("a", { class: "hymn__link", href: "#" }, "Play & Lyrics →")))));
        case "index": return e("ol", { class: "index-grid", role: "list" }, (b.items as Any[]).map((_, i) => e("li", { class: "index-grid__item" },
          e("div", { class: "index-grid__link" }, edit("span", at("items", i, "title"), "plain", { class: "index-grid__title" }), edit("span", at("items", i, "text"), "markup", { class: "index-grid__text" })))));
        case "sermon-cards": return e("section", { class: "page__sermons" }, edit("h2", at("heading"), "plain", { class: "page__h2" }),
          b.text !== undefined ? edit("p", at("text"), "markup") : null, placeholder("Latest sermons", "The newest sermons appear here automatically."),
          e("p", { class: "page__sermons-link" }, e("span", { class: "button" }, edit("span", at("linkLabel"), "plain"))));
        case "external-plate": return e("div", { class: "plate plate--church plate--external" }, e("div", { class: "plate__consent" },
          edit("p", at("title"), "plain", { class: "plate__title" }), edit("p", at("text"), "markup", { class: "plate__note" }),
          e("p", { class: "plate__actions" }, e("span", { class: "button button--onink" }, edit("span", at("label"), "plain"), " ↗"))));
        case "book": return e("div", { class: "book" }, picture(b.media, "book__cover", b.mediaAlt), edit("div", at("text"), "paragraphs", { class: "book__text" }));
        case "contact-panel": return e("div", { class: "contact-panel", title: "Change these in Pages → Church details" },
          e("address", { class: "contact-panel__address" }, e("strong", { class: "contact-panel__name" }, b.name), (b.addressLines as string[]).map((l) => e("span", {}, l)), e("span", {}, e("a", { href: "#" }, b.telephone.label)), e("span", {}, e("a", { href: "#" }, b.email))),
          e("p", { class: "contact-panel__actions" }, e("span", { class: "button" }, "Send us an email"), " ", e("span", { class: "button button--outline" }, b.map.label, " →")));
        case "giving-methods": {
          return e("div", { class: "giving" },
            edit("h2", at("heading"), "plain", { class: "page__h2" }, "Heading", "Ways to make an offering"), edit("p", at("intro"), "markup", { class: "giving__intro" }),
            e("p", { class: "giving__cta" }, e("span", { class: "button" }, edit("span", at("button", "label"), "plain"), " ↗")),
            e("ul", { class: "giving__methods", role: "list" }, (b.methods as Any[]).map((_, i) => e("li", { class: "giving__method" }, edit("h3", at("methods", i, "title"), "plain", { class: "giving__method-title" }), edit("p", at("methods", i, "text"), "markup")))),
            e("div", { class: "giving__details" },
              e("section", { class: "giving__bank" }, edit("h3", at("bank", "title"), "plain", { class: "giving__method-title" }), e("p", {}, edit("strong", at("bank", "account"), "plain")), (b.bank.lines as string[]).map((_, k) => edit("p", at("bank", "lines", k), "plain", { class: "tabular" }))),
              e("section", { class: "giving__online" }, edit("h3", at("online", "title"), "plain", { class: "giving__method-title" }), e("ul", { class: "page__list" }, (b.online.links as Any[]).map((_, k) => e("li", {}, e("a", { href: "#" }, edit("span", at("online", "links", k, "label"), "plain"), " ↗")))))));
        }
        case "events-calendar": return placeholder("Events calendar", "Upcoming, regular and past events fill in automatically from Events.");
        case "blog-list": return placeholder("Blog articles", "The list of articles fills in automatically.");
        case "sitemap-list": return placeholder("Every page", "The list of all pages fills in automatically.");
        default: return null;
      }
    })();
    if (out) { out.setAttribute("data-block", pathKey(path)); out.setAttribute("data-kind", b.kind); }
    return out;
  };
  const blocks = (list: Any[], base: Path) => list.map((b, i) => block(b, [...base, i]));

  /** The page body, laid out like Doc.astro: an introduction, then one section per main heading. */
  const doc_ = (list: Any[], aside: Any[] | undefined) => {
    const isMain = (b: Any) => b.kind === "heading" && b.level === 2;
    const first = list.findIndex(isMain);
    const intro = (first === -1 ? list : list.slice(0, first)).map((b, i) => block(b, ["blocks", i]));
    const sections: { index: number; items: [Any, number][] }[] = [];
    if (first !== -1) list.slice(first).forEach((b, k) => {
      const i = first + k;
      if (isMain(b)) sections.push({ index: i, items: [] });
      else sections[sections.length - 1]!.items.push([b, i]);
    });
    const paragraphs = (first === -1 ? list : list.slice(0, first)).filter((b) => b.kind === "paragraph" && !b.lede).length;
    const number = (n: number) => String(n + 1).padStart(2, "0");
    return e("div", { class: "doc" },
      intro.length ? e("div", { class: `doc__intro prose${paragraphs >= 2 ? " doc__intro--columns" : ""}` }, intro) : null,
      sections.length >= 4 ? e("nav", { class: "doc__toc" }, e("p", { class: "doc__toc-label" }, "On this page"), e("ol", { role: "list" }, sections.map((s, n) => e("li", {}, e("a", { href: "#" }, e("span", {}, number(n)), list[s.index].text))))) : null,
      sections.map((s, n) => {
        const heading = edit("h2", ["blocks", s.index, "text"], "plain", { class: "doc__heading" }, "Section heading");
        heading.setAttribute("data-block", pathKey(["blocks", s.index]));
        heading.setAttribute("data-kind", "heading");
        return e("section", { class: "doc__section" },
          e("header", { class: "doc__aside" }, e("p", { class: "doc__num" }, number(n)), heading),
          e("div", { class: "doc__content prose" }, s.items.map(([b, i]) => block(b, ["blocks", i]))));
      }),
      aside?.length ? e("div", { class: "doc__intro doc__after prose" }, blocks(aside, ["aside"])) : null);
  };

  /** The heading area, laid out like PageHead.astro. */
  const head = () => {
    const page = draft as Page & Post;
    const trail = [e("li", {}, e("a", { href: "#" }, "Home"))];
    let eyebrow: HTMLElement | null = null;
    let hero: Image | undefined;
    if (opts.kind === "page") {
      const parent = page.parent ? opts.pages.find((p) => p.id === page.parent) : undefined;
      if (parent && parent.path !== page.path) trail.push(e("li", {}, e("a", { href: "#" }, parent.navTitle)));
      if (page.eyebrow !== null && page.eyebrow !== undefined && page.eyebrow !== page.h1) eyebrow = edit("p", ["eyebrow"], "plain", { class: "eyebrow" });
      hero = page.hero && page.hero.enabled !== false ? opts.images[page.hero.media] : undefined;
    } else {
      trail.push(e("li", {}, e("a", { href: "#" }, "Blogs")));
      eyebrow = e("p", { class: "eyebrow" }, "Blog");
    }
    const banner = hero ? hero.width / hero.height >= 1.5 && hero.width >= 900 : false;
    const aside = Boolean(hero) && !banner;
    const upright = hero ? hero.width / hero.height < 0.9 : false;
    const locked = opts.headingLocked();
    const title = locked
      ? e("h1", { class: `page-head__title${page.h1.length > 34 ? " is-long" : ""}`, "data-locked": "", title: "Locked: this heading is part of the search settings. Unlock them below to change it." }, page.h1)
      : edit("h1", ["h1"], "plain", { class: `page-head__title${page.h1.length > 34 ? " is-long" : ""}` }, "Main heading");
    const heroImg = hero ? e("img", { src: imageUrl(hero.src), width: String(hero.width), height: String(hero.height), alt: (page.hero?.alt ?? hero.alt) }) : null;
    return e("header", { class: `page-head${aside ? " page-head--aside" : ""}${banner ? " page-head--banner" : ""}` },
      e("div", { class: "wrap" },
        e("div", { class: "page-head__inner" },
          e("div", { class: "page-head__text" },
            e("nav", { "aria-label": "Breadcrumb" }, e("ol", { class: "trail", role: "list" }, trail)),
            eyebrow, title,
            opts.kind === "page" && page.lede ? edit("p", ["lede"], "markup", { class: "page-head__lede" }) : null,
            opts.kind === "post" ? e("p", { class: "page-head__extra" }, e("time", {}, longDate(page.date))) : null),
          aside && upright ? e("figure", { class: "page-head__arch" }, e("div", { class: "arch" }, heroImg)) : null,
          aside && !upright ? e("figure", { class: "page-head__frame" }, heroImg) : null),
        banner ? e("figure", { class: "page-head__banner" }, heroImg) : null));
  };

  // ---- drawing, and keeping the frame as tall as the page
  const fit = () => { if (doc) frame.style.height = `${Math.max(400, doc.documentElement.scrollHeight)}px`; };
  const render = () => {
    if (!doc) return;
    const main = doc.getElementById("main-content")!;
    const page = draft as Page & Post;
    const related = opts.kind === "page" ? (page.related ?? []).map((id) => opts.pages.find((p) => p.id === id)).filter(Boolean) as Page[] : [];
    main.replaceChildren(e("article", { class: opts.kind === "page" ? `page page--${page.section}` : "page page--blog" },
      head(),
      opts.kind === "post" && page.media ? e("div", { class: "wrap" }, e("figure", { class: "figure figure--full doc__lead-image" }, picture(page.media, "figure__image"))) : null,
      doc_(page.blocks as Any[], opts.kind === "page" ? (page.aside as Any[]) : undefined),
      related.length ? e("nav", { class: "page__related" }, e("h2", { class: "section__title" }, "Also in this section"), e("ul", { class: "related-list", role: "list" }, related.map((p) => e("li", {}, e("a", { href: "#" }, p.navTitle))))) : null));
    main.append(blockBar, formatBar);
    blockBar.hidden = true;
    formatBar.hidden = true;
    if (focusAfter) {
      const target = doc.querySelector<HTMLElement>(`[data-edit="${focusAfter.path}"]`);
      if (target) {
        target.focus();
        const range = doc.createRange();
        range.selectNodeContents(target);
        range.collapse(focusAfter.at === "start");
        win!.getSelection()?.removeAllRanges();
        win!.getSelection()?.addRange(range);
      }
      focusAfter = null;
    }
    requestAnimationFrame(fit);
  };

  // ---- the block tools (move, add, delete) and the text tools (bold, italic, link)
  let blockBar!: HTMLElement;
  let formatBar!: HTMLElement;
  let hovered: Path | null = null;
  const listOf = (path: Path) => getAt(draft, path.slice(0, -1)) as Any[];
  const structure = (fn: (list: Any[], index: number) => void, then?: { path: Path; at: "start" | "end" }) => {
    if (!hovered) return;
    fn(listOf(hovered), hovered[hovered.length - 1] as number);
    opts.onChange();
    focusAfter = then ? { path: pathKey(then.path), at: then.at } : null;
    render();
  };
  const newBlock = (kind: string): Any => (kind === "heading" ? { kind, level: 2, text: "" } : kind === "list" ? { kind, items: [""] } : { kind, text: "" });
  const textPathOf = (blockPath: Path, b: Any): Path => (b.kind === "list" ? [...blockPath, "items", 0] : [...blockPath, "text"]);

  const buildBars = () => {
    const btn = (label: string, title: string, onClick: () => void) => {
      const b = doc!.createElement("button");
      b.type = "button"; b.textContent = label; b.title = title; b.setAttribute("aria-label", title);
      b.addEventListener("mousedown", (ev) => ev.preventDefault()); // keep the text selection
      b.addEventListener("click", onClick);
      return b;
    };
    blockBar = e("div", { class: "edit-bar", "data-ui": "" });
    const add = doc!.createElement("select");
    add.title = "Add below";
    add.append(Object.assign(doc!.createElement("option"), { value: "", textContent: "+ Add below" }), ...Object.entries(LABELS).map(([k, v]) => Object.assign(doc!.createElement("option"), { value: k, textContent: v })));
    add.addEventListener("change", () => {
      const kind = add.value;
      add.value = "";
      if (!kind || !hovered) return;
      const at = (hovered[hovered.length - 1] as number) + 1;
      const fresh = newBlock(kind);
      structure((list) => list.splice(at, 0, fresh), { path: textPathOf([...hovered.slice(0, -1), at], fresh), at: "start" });
    });
    blockBar.append(
      btn("↑", "Move up", () => structure((list, i) => { if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]]; })),
      btn("↓", "Move down", () => structure((list, i) => { if (i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]]; })),
      e("span", { class: "edit-bar__sep" }), add, e("span", { class: "edit-bar__sep" }),
      btn("✕", "Delete", () => { if (win!.confirm("Delete this from the page?")) structure((list, i) => list.splice(i, 1)); }));

    formatBar = e("div", { class: "edit-bar", "data-ui": "" });
    const command = (name: string, value?: string) => { doc!.execCommand("styleWithCSS", false, "false"); doc!.execCommand(name, false, value); };
    formatBar.append(
      btn("B", "Bold", () => command("bold")),
      btn("I", "Italic", () => command("italic")),
      btn("Link", "Make a link", () => {
        const url = win!.prompt("Link to (a page on this site like /about/, or a full address like https://…):", "/")?.trim();
        if (!url) return;
        if (!/^(\/|#|https?:\/\/|mailto:|tel:)/iu.test(url)) { win!.alert("Links should start with /, https://, mailto: or tel:"); return; }
        command("createLink", url);
      }),
      btn("Unlink", "Remove the link", () => command("unlink")));
  };

  const showBlockBar = (target: HTMLElement) => {
    const path = parsePath(target.dataset.block!);
    if (!SIMPLE.has(target.dataset.kind ?? "")) { blockBar.hidden = true; return; }
    hovered = path;
    doc!.querySelectorAll(".block-hover").forEach((x) => x.classList.remove("block-hover"));
    target.classList.add("block-hover");
    const r = target.getBoundingClientRect();
    blockBar.hidden = false;
    blockBar.style.top = `${r.top + win!.scrollY - blockBar.offsetHeight - 8}px`;
    blockBar.style.left = `${Math.max(8, r.right + win!.scrollX - blockBar.offsetWidth)}px`;
  };
  const showFormatBar = () => {
    const sel = win!.getSelection();
    const field = sel?.anchorNode ? (isElement(sel.anchorNode) ? sel.anchorNode : sel.anchorNode.parentElement)?.closest<HTMLElement>("[data-edit]") : null;
    if (!sel || sel.isCollapsed || !field || field.dataset.mode === "plain") { formatBar.hidden = true; return; }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    formatBar.hidden = false;
    formatBar.style.top = `${r.top + win!.scrollY - formatBar.offsetHeight - 10}px`;
    formatBar.style.left = `${Math.max(8, r.left + win!.scrollX + r.width / 2 - formatBar.offsetWidth / 2)}px`;
  };

  // ---- typing
  const sync = (field: HTMLElement) => {
    setAt(draft, parsePath(field.dataset.edit!), serialize(field, field.dataset.mode as Mode));
    opts.onChange();
  };
  const onKey = (ev: KeyboardEvent) => {
    const field = (ev.target as Element).closest?.<HTMLElement>("[data-edit]");
    if (!field) return;
    const path = parsePath(field.dataset.edit!);
    const mode = field.dataset.mode as Mode;
    const last = path[path.length - 1];
    const isParagraph = last === "text" && getAt(draft, path.slice(0, -1))?.kind === "paragraph";
    const isListItem = path[path.length - 2] === "items" && getAt(draft, path.slice(0, -2))?.kind === "list";
    if (ev.key === "Enter" && mode === "plain") { ev.preventDefault(); return; }
    if (ev.key === "Enter" && !ev.shiftKey && (isParagraph || isListItem)) {
      // Split at the caret: the rest becomes a new paragraph (or list item) below.
      ev.preventDefault();
      const sel = win!.getSelection()!;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const after = doc!.createRange();
      after.setStart(range.endContainer, range.endOffset);
      after.setEnd(field, field.childNodes.length);
      const holder = doc!.createElement("div");
      holder.append(after.extractContents());
      const rest = cleanMarkup(toMarkup(holder));
      setAt(draft, path, serialize(field, "markup"));
      if (isParagraph) {
        const blockPath = path.slice(0, -1);
        const list = getAt(draft, blockPath.slice(0, -1)) as Any[];
        const i = blockPath[blockPath.length - 1] as number;
        list.splice(i + 1, 0, { kind: "paragraph", text: rest });
        focusAfter = { path: pathKey([...blockPath.slice(0, -1), i + 1, "text"]), at: "start" };
      } else {
        const items = getAt(draft, path.slice(0, -1)) as string[];
        const i = last as number;
        items.splice(i + 1, 0, rest);
        focusAfter = { path: pathKey([...path.slice(0, -1), i + 1]), at: "start" };
      }
      opts.onChange();
      render();
      return;
    }
    if (ev.key === "Enter" && mode === "markup") { ev.preventDefault(); doc!.execCommand("insertLineBreak"); return; }
    if (ev.key === "Backspace" && !(field.textContent ?? "").length && (isParagraph || isListItem)) {
      // An empty paragraph or list item disappears, and the caret goes back to the end of the one before.
      ev.preventDefault();
      if (isParagraph) {
        const blockPath = path.slice(0, -1);
        const list = getAt(draft, blockPath.slice(0, -1)) as Any[];
        const i = blockPath[blockPath.length - 1] as number;
        list.splice(i, 1);
        const prev = list[i - 1];
        focusAfter = prev && prev.kind === "paragraph" ? { path: pathKey([...blockPath.slice(0, -1), i - 1, "text"]), at: "end" } : null;
      } else {
        const items = getAt(draft, path.slice(0, -1)) as string[];
        if (items.length <= 1) return;
        const i = last as number;
        items.splice(i, 1);
        focusAfter = { path: pathKey([...path.slice(0, -1), Math.max(0, i - 1)]), at: "end" };
      }
      opts.onChange();
      render();
    }
  };

  frame.addEventListener("load", () => {
    doc = frame.contentDocument!;
    win = frame.contentWindow!;
    buildBars();
    doc.addEventListener("input", (ev) => {
      const field = (ev.target as Element).closest?.<HTMLElement>("[data-edit]");
      if (field) { sync(field); fit(); }
    });
    doc.addEventListener("keydown", onKey);
    doc.addEventListener("paste", (ev) => {
      // Paste words only, never formatting from other programs.
      const field = (ev.target as Element).closest?.<HTMLElement>("[data-edit]");
      if (!field) return;
      ev.preventDefault();
      let text = ev.clipboardData?.getData("text/plain") ?? "";
      if (field.dataset.mode === "plain") text = text.replace(/\s*\n\s*/gu, " ");
      doc!.execCommand("insertText", false, text);
    });
    doc.addEventListener("click", (ev) => {
      // Links never navigate inside the editor.
      if ((ev.target as Element).closest?.("a")) ev.preventDefault();
    });
    doc.addEventListener("mouseover", (ev) => {
      if ((ev.target as Element).closest?.("[data-ui]")) return;
      const target = (ev.target as Element).closest?.<HTMLElement>("[data-block]");
      if (target) showBlockBar(target);
    });
    doc.addEventListener("focusin", (ev) => {
      const target = (ev.target as Element).closest?.<HTMLElement>("[data-block]");
      if (target) showBlockBar(target);
    });
    doc.addEventListener("selectionchange", showFormatBar);
    new (win as Window & typeof globalThis).ResizeObserver(fit).observe(doc.body);
    render();
  });

  return {
    /** Redraw from the data (after a change made outside the editor, such as unlocking the heading). */
    refresh: render,
    /** Show the page at a phone's width, or at full width. */
    setWidth(px: number | null) { frame.style.width = px ? `${px}px` : "100%"; requestAnimationFrame(fit); },
  };
}

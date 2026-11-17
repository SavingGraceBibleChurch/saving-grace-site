// The bookshelf's open book: choosing a spine shows that book's chapters, choosing a chapter shows its verses,
// and filled numbers are the ones a sermon has been preached from. Without JavaScript the spines simply link
// to each book's sermon page.
import { loadPassages, type PassageData, type PassageSermon } from "./passage-data";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`; };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string | null)[]) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const child of children) if (child !== null) node.append(child);
  return node;
}

function sermonList(items: PassageSermon[]) {
  return el("ol", { class: "picker__list", role: "list" }, ...items.map((s) => el("li", {},
    el("a", { class: "picker__sermon", href: s.u },
      el("span", { class: "picker__date" }, shortDate(s.d)),
      el("span", { class: "picker__name" }, s.t),
      el("span", { class: "picker__ref" }, [s.r, s.sp].filter(Boolean).join(" · "))))));
}

export function attachPicker(shelf: HTMLElement) {
  const panel = shelf.querySelector<HTMLElement>("[data-picker]");
  if (!panel) return;
  let data: PassageData | null = null;
  let current: { book: number; chapter?: number; verse?: number } | null = null;

  const render = () => {
    if (!data || !current) return;
    const book = data.books[current.book]!;
    const chapters = book.v.length;
    const all = data.find(current.book);
    const chapterCount = (c: number) => data!.find(current!.book, c).length;
    panel.className = `picker hue--${book.g}`;
    panel.replaceChildren();

    const close = el("button", { class: "picker__close", type: "button", "aria-label": `Close ${book.n}` }, "×");
    close.addEventListener("click", () => closePicker(true));
    panel.append(el("div", { class: "picker__head" },
      el("div", {}, el("h3", { class: "picker__title", id: "picker-title" }, book.n),
        el("p", { class: "picker__meta" }, `${plural(chapters, "chapter")} · ${plural(book.c, "sermon")}`)),
      book.p ? el("a", { class: "link-arrow picker__all", href: book.p }, `All sermons on ${book.n}`) : null,
      close));

    // Chapters
    const chapterGrid = el("ol", { class: "ruler", role: "list", "aria-label": `Chapters of ${book.n}` });
    for (let c = 1; c <= chapters; c++) {
      const n = chapterCount(c);
      const button = el("button", { class: `ruler__cell${n ? " is-marked" : ""}`, type: "button", "aria-pressed": String(current.chapter === c), "aria-label": `Chapter ${c}${n ? `, ${plural(n, "sermon")}` : ", no sermons yet"}` }, String(c));
      button.addEventListener("click", () => { current = { book: current!.book, chapter: current!.chapter === c ? undefined : c }; render(); focusCell("chapter", c); });
      chapterGrid.append(el("li", {}, button));
    }
    panel.append(el("p", { class: "picker__label" }, el("span", {}, "Chapters"), el("span", { class: "picker__key" }, el("span", { class: "picker__swatch", "aria-hidden": "true" }), "Preached from")), chapterGrid);

    // Verses of the chosen chapter
    if (current.chapter !== undefined) {
      const c = current.chapter;
      const verseGrid = el("ol", { class: "ruler", role: "list", "aria-label": `Verses of ${book.n} ${c}` });
      const count = book.v[c - 1] ?? 0;
      for (let v = 1; v <= count; v++) {
        const n = data.find(current.book, c, v).length;
        const button = el("button", { class: `ruler__cell${n ? " is-marked" : ""}`, type: "button", "aria-pressed": String(current.verse === v), "aria-label": `Verse ${v}${n ? `, ${plural(n, "sermon")}` : ", no sermons yet"}` }, String(v));
        button.addEventListener("click", () => { current = { book: current!.book, chapter: c, verse: current!.verse === v ? undefined : v }; render(); focusCell("verse", v); });
        verseGrid.append(el("li", {}, button));
      }
      panel.append(el("p", { class: "picker__label" }, el("span", {}, `Verses of ${book.n} ${c}`)), verseGrid);
    }

    // What has been preached from the choice
    const scope = current.chapter === undefined ? book.n : current.verse === undefined ? `${book.n} ${current.chapter}` : `${book.n} ${current.chapter}:${current.verse}`;
    const results = current.chapter === undefined ? [] : data.find(current.book, current.chapter, current.verse);
    const status = el("div", { class: "picker__results", "aria-live": "polite" });
    if (current.chapter === undefined) {
      const marked = Array.from({ length: chapters }, (_, i) => i + 1).filter((c) => chapterCount(c) > 0);
      status.append(el("p", { class: "picker__hint" }, all.length
        ? `Choose a chapter to see its sermons. Preached from chapter${marked.length === 1 ? "" : "s"} ${marked.join(", ")}.`
        : `No sermon has a passage recorded in ${book.n} yet.`));
    } else {
      status.append(el("h4", { class: "picker__heading" }, results.length ? `${plural(results.length, "sermon")} on ${scope}` : `No sermons on ${scope} yet`));
      if (results.length) status.append(sermonList(results));
      else status.append(el("p", { class: "picker__hint" }, "Filled numbers have sermons. Choose another chapter or verse, or see all sermons on the book."));
    }
    panel.append(status);
    panel.hidden = false;
  };

  const focusCell = (kind: "chapter" | "verse", n: number) => {
    const grid = panel.querySelectorAll(".ruler")[kind === "chapter" ? 0 : 1];
    grid?.querySelectorAll<HTMLButtonElement>(".ruler__cell")[n - 1]?.focus({ preventScroll: true });
  };

  const closePicker = (refocus: boolean) => {
    const book = current ? data?.books[current.book] : undefined;
    current = null;
    panel.hidden = true;
    panel.replaceChildren();
    shelf.querySelectorAll(".spine.is-open").forEach((s) => s.classList.remove("is-open"));
    if (refocus && book?.p) shelf.querySelector<HTMLAnchorElement>(`.spine__link[href="${book.p}"]`)?.focus();
  };

  shelf.addEventListener("click", async (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>(".spine__link");
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const slug = /\/sermons\/book\/([^/]+)\//u.exec(link.getAttribute("href") ?? "")?.[1];
    if (!slug) return;
    event.preventDefault();
    try {
      data ??= await loadPassages();
    } catch {
      location.href = link.href; // no index: fall back to the book's page
      return;
    }
    const index = data.books.findIndex((b) => b.s === slug);
    if (index < 0) { location.href = link.href; return; }
    if (current?.book === index) { closePicker(true); return; }
    current = { book: index };
    shelf.querySelectorAll(".spine.is-open").forEach((s) => s.classList.remove("is-open"));
    link.closest(".spine")?.classList.add("is-open");
    render();
    panel.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    panel.querySelector<HTMLElement>(".picker__title")?.setAttribute("tabindex", "-1");
    panel.querySelector<HTMLElement>(".picker__title")?.focus({ preventScroll: true });
  });
  panel.addEventListener("keydown", (event) => { if (event.key === "Escape") closePicker(true); });
}

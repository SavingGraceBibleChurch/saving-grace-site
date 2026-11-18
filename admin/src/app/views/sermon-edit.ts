// Add or edit a sermon: details, recording, description and transcript, saved as one commit.
import type { Sermon, TaxonomyKind, TaxonomyTerm } from "../../../../src/lib/types";
import { DATA, FIRST_NEW_ID, SEO_SUFFIX, SITE_URL, transcriptPath } from "../config";
import type { Ctx } from "../context";
import { fileEdit, jsonEdit, type Edit, type Source } from "../store";
import { lastSunday, normaliseLongText, passageSlug, sermonAudioId, slugify, today, wordCount, youtubeId } from "../text";
import { badge, button, card, external, field, h, input, mount, nextId, problemsBox, saveBar, select, setDirty, textarea } from "../ui";

const TERM_PATH: Record<TaxonomyKind, string> = { speaker: "/sermons/speaker/", series: "/sermons/series/", book: "/sermons/book/", passage: "/sermons/passage/" };
const LEGACY: Record<TaxonomyKind, string> = { speaker: "sermon_speaker", series: "sermon_series", book: "sermon_book", passage: "sermon_topics" };

function newTerm(kind: TaxonomyKind, slug: string, name: string): TaxonomyTerm {
  return { kind, slug, name, count: 0, path: `${TERM_PATH[kind]}${slug}/`, legacyQuery: [LEGACY[kind], slug], seo: { title: `${name}${SEO_SUFFIX}`, description: "", indexable: true, captured: false } } as TaxonomyTerm;
}

interface Draft {
  title: string; slug: string; date: string; speaker: string; series: string[]; books: string[]; passages: string[]; passage: string;
  youtube: string; sermonAudio: string; description: string; transcript: string | null; checked: boolean;
}

export async function sermonEditPage(ctx: Ctx, id: number | null): Promise<Node> {
  const data = ctx.store.data;
  const original = id === null ? null : data.sermons.find((s) => s.wpId === id);
  if (id !== null && !original) return h("div", { class: "empty" }, h("h1", { text: "Sermon not found" }), h("a", { class: "link", attrs: { href: "#/sermons" }, text: "Back to sermons" }));
  const key = original ? String(original.wpId) : "";
  const source: Source | undefined = original ? data.sources[key] : undefined;
  const terms = new Map(data.taxonomies.map((t) => [`${t.kind}:${t.slug}`, t]));
  const created: TaxonomyTerm[] = [];
  const nameOf = (kind: TaxonomyKind, slug: string) => terms.get(`${kind}:${slug}`)?.name ?? created.find((t) => t.kind === kind && t.slug === slug)?.name ?? slug;

  const lastSpeaker = data.sermons[0]?.speakers[0] ?? "";
  const draft: Draft = original ? {
    title: original.title, slug: original.slug, date: original.date, speaker: original.speakers[0] ?? "", series: [...original.series], books: [...original.books],
    passages: [...original.passages], passage: original.passage, youtube: original.youtubeId ?? "", sermonAudio: original.sermonAudioId ?? "",
    description: data.descriptions[key] ?? "", transcript: null, checked: source === "church",
  } : { title: "", slug: "", date: lastSunday(), speaker: lastSpeaker, series: [], books: [], passages: [], passage: "", youtube: "", sermonAudio: "", description: "", transcript: null, checked: true };
  let slugTouched = false;
  let transcriptLoaded = false;
  let transcriptDirty = false;
  const problems = h("div");

  // ---------------------------------------------------------------- details
  const slugInfo = h("p", { class: "field__hint" });
  const slugInput = input(draft.slug, { autocomplete: "off", spellcheck: "false", disabled: Boolean(original) }, (v) => { slugTouched = true; draft.slug = v.trim(); checkSlug(); });
  const checkSlug = () => {
    if (original) { slugInfo.textContent = "The web address can't change once a sermon is published, because links to it would break."; return; }
    const taken = data.sermons.some((s) => s.slug === draft.slug);
    slugInfo.replaceChildren(draft.slug ? `${SITE_URL.replace(/^https?:\/\//u, "")}/sermons/${draft.slug}/` : "Fills in from the title.", taken ? h("strong", { class: "is-error", text: " — already used by another sermon" }) : "");
  };
  const titleInput = input(draft.title, { required: true, autocomplete: "off" }, (v) => {
    draft.title = v;
    if (!original && !slugTouched) { draft.slug = slugify(v); slugInput.value = draft.slug; checkSlug(); }
  });
  const dateInput = input(draft.date, { type: "date", required: true }, (v) => { draft.date = v; });
  checkSlug();

  const speakerOptions = () => [{ value: "", label: "Choose a speaker…" }, ...[...terms.values(), ...created].filter((t) => t.kind === "speaker").sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ value: t.slug, label: t.name })), { value: "__new", label: "+ New speaker…" }];
  const speakerSelect = select(speakerOptions(), draft.speaker, (v) => {
    if (v !== "__new") { draft.speaker = v; return; }
    const name = window.prompt("New speaker's full name")?.trim();
    const slug = name ? slugify(name) : "";
    if (name && slug) {
      if (!terms.has(`speaker:${slug}`) && !created.some((t) => t.kind === "speaker" && t.slug === slug)) created.push(newTerm("speaker", slug, name));
      draft.speaker = slug;
    }
    mount(speakerSelect, speakerOptions().map((o) => h("option", { attrs: { value: o.value }, text: o.label })));
    speakerSelect.value = draft.speaker;
  });

  const seriesPicker = termPicker("series", draft.series, "Add to a series…", "+ New series…");
  const bookPicker = termPicker("book", draft.books, "Add a Bible book…", null);
  const passagePicker = termPicker("passage", draft.passages, null, null);
  const passageInput = input(draft.passage, { autocomplete: "off", placeholder: "e.g. Luke 6:12-16" }, (v) => {
    const previous = passageSlug(draft.passage);
    draft.passage = v;
    // Keep the passage page in step while there is at most one, and guess the book.
    if (draft.passages.length <= 1 && (draft.passages.length === 0 || draft.passages[0] === previous || !original)) {
      const slug = passageSlug(v);
      draft.passages.splice(0, draft.passages.length, ...(slug ? [slug] : []));
      if (slug && !terms.has(`passage:${slug}`) && !created.some((t) => t.kind === "passage" && t.slug === slug)) {
        for (let i = created.length - 1; i >= 0; i--) if (created[i]!.kind === "passage" && !draft.passages.includes(created[i]!.slug)) created.splice(i, 1);
        created.push(newTerm("passage", slug, v.trim()));
      }
      passagePicker.refresh();
    }
    const book = data.canon.filter((b) => v.toLowerCase().startsWith(b.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
    if (book && !draft.books.includes(book.slug) && draft.books.length === 0) { draft.books.push(book.slug); bookPicker.refresh(); }
  });

  function termPicker(kind: TaxonomyKind, values: string[], addLabel: string | null, newLabel: string | null) {
    const chips = h("ul", { class: "chips", attrs: { "aria-label": kind } });
    const id = nextId(kind);
    const adder = addLabel ? h("select", { class: "input input--select input--inline", attrs: { id } }) : null;
    const refresh = () => {
      mount(chips, values.length ? values.map((slug) => h("li", { class: "chip" }, h("span", { text: nameOf(kind, slug) }),
        h("button", { class: "chip__remove", attrs: { type: "button", "aria-label": `Remove ${nameOf(kind, slug)}` }, text: "×", on: { click: () => { values.splice(values.indexOf(slug), 1); setDirty(true); refresh(); } } })))
        : h("li", { class: "chips__empty", text: "None" }));
      if (adder) {
        const options = kind === "book"
          ? data.canon.filter((b) => !values.includes(b.slug)).map((b) => ({ value: b.slug, label: b.name }))
          : [...terms.values(), ...created].filter((t) => t.kind === kind && !values.includes(t.slug)).sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ value: t.slug, label: t.name }));
        mount(adder, h("option", { attrs: { value: "" }, text: addLabel! }), options.map((o) => h("option", { attrs: { value: o.value }, text: o.label })), newLabel ? h("option", { attrs: { value: "__new" }, text: newLabel }) : null);
        adder.value = "";
      }
    };
    adder?.addEventListener("change", () => {
      let slug = adder.value;
      if (slug === "__new") {
        const name = window.prompt(`Name of the new ${kind}`)?.trim();
        slug = name ? slugify(name) : "";
        if (name && slug && !terms.has(`${kind}:${slug}`) && !created.some((t) => t.kind === kind && t.slug === slug)) created.push(newTerm(kind, slug, name));
      } else if (kind === "book" && slug && !terms.has(`book:${slug}`) && !created.some((t) => t.kind === "book" && t.slug === slug)) {
        created.push(newTerm("book", slug, data.canon.find((b) => b.slug === slug)!.name));
      }
      if (slug && !values.includes(slug)) values.push(slug);
      setDirty(true);
      refresh();
    });
    refresh();
    return { el: h("div", { class: "picker" }, chips, adder), refresh, id: adder ? id : undefined };
  }

  // ---------------------------------------------------------------- recording
  const ytStatus = h("div", { class: "media-check" });
  const saStatus = h("div", { class: "media-check" });
  const checkYoutube = () => {
    const parsed = youtubeId(draft.youtube);
    if (!draft.youtube.trim()) return mount(ytStatus, h("span", { class: "muted", text: "No video." }));
    if (!parsed) return mount(ytStatus, h("span", { class: "is-error", text: "That doesn't look like a YouTube link or video ID." }));
    const img = h("img", { class: "media-check__thumb", attrs: { src: `https://i.ytimg.com/vi/${parsed}/mqdefault.jpg`, alt: "", width: 160, height: 90 } });
    const note = h("span", { class: "muted", text: `Video ID ${parsed}` });
    img.addEventListener("load", () => { if (img.naturalWidth <= 120) note.replaceWith(h("span", { class: "is-error", text: "YouTube has no video with that ID." })); });
    img.addEventListener("error", () => note.replaceWith(h("span", { class: "is-error", text: "YouTube has no video with that ID." })));
    mount(ytStatus, img, h("span", null, note, " · ", external("Open on YouTube", `https://www.youtube.com/watch?v=${parsed}`)));
  };
  const checkSermonAudio = () => {
    const parsed = sermonAudioId(draft.sermonAudio);
    if (!draft.sermonAudio.trim()) return mount(saStatus, h("span", { class: "muted", text: "No audio. Without a SermonAudio ID the transcript can't be fetched automatically." }));
    if (!parsed) return mount(saStatus, h("span", { class: "is-error", text: "That doesn't look like a SermonAudio link or sermon ID." }));
    mount(saStatus, h("span", { class: "muted", text: `Sermon ID ${parsed} · ` }), external("Check it on SermonAudio", `https://www.sermonaudio.com/sermons/${parsed}`));
  };
  const ytInput = input(draft.youtube, { autocomplete: "off", placeholder: "Paste the YouTube link" }, (v) => { draft.youtube = v; checkYoutube(); });
  const saInput = input(draft.sermonAudio, { autocomplete: "off", placeholder: "Paste the SermonAudio link" }, (v) => { draft.sermonAudio = v; checkSermonAudio(); });
  checkYoutube();
  checkSermonAudio();

  // ---------------------------------------------------------------- description
  const descCount = h("span", { class: "field__count" });
  const countDesc = () => { const n = wordCount(draft.description); descCount.textContent = `${n} words${n && (n < 80 || n > 320) ? " · aim for about 150–250" : ""}`; };
  const descInput = textarea(draft.description, { rows: 10 }, (v) => { draft.description = v; countDesc(); });
  countDesc();

  // ---------------------------------------------------------------- transcript
  const transcriptHost = h("div", { class: "transcript" });
  const sourceLabel: Record<Source, string> = { sermonaudio: "Machine transcript from SermonAudio (not checked)", captions: "Machine transcript from the video captions (not checked)", church: "Checked by the church" };
  const renderTranscript = () => {
    if (!transcriptLoaded) {
      const status = source ? badge(sourceLabel[source], source === "church" ? "ok" : "info")
        : original?.sermonAudioId ? badge("Waiting for SermonAudio's transcript", "info") : badge("No transcript", "warn");
      mount(transcriptHost,
        h("p", { class: "transcript__status" }, status),
        !source && draft.sermonAudio ? h("p", { class: "field__hint", text: "It is fetched automatically once SermonAudio publishes one, usually within a day. If it's still missing after a few days, paste it in yourself." }) : null,
        button(source ? "Open the transcript to edit" : "Paste a transcript", async (event) => {
          const b = event.currentTarget as HTMLButtonElement;
          b.disabled = true;
          draft.transcript = source ? (await ctx.store.text(transcriptPath(key))) ?? "" : "";
          transcriptLoaded = true;
          renderTranscript();
        }, "secondary"));
      return;
    }
    const counter = h("span", { class: "field__count", text: `${wordCount(draft.transcript ?? "").toLocaleString("en-AU")} words` });
    const area = textarea(draft.transcript ?? "", { rows: 22, spellcheck: "true" }, (v) => { draft.transcript = v; transcriptDirty = true; counter.textContent = `${wordCount(v).toLocaleString("en-AU")} words`; });
    const checkId = nextId("checked");
    const check = h("input", { attrs: { type: "checkbox", id: checkId }, checked: draft.checked, on: { change: () => { draft.checked = check.checked; transcriptDirty = true; setDirty(true); } } });
    mount(transcriptHost,
      field("Transcript", area, { hint: "Separate paragraphs with a blank line.", error: counter }),
      source && source !== "church" ? h("label", { class: "check", attrs: { for: checkId } }, check, h("span", null, h("strong", { text: "I've checked this against the recording." }), " This removes the “machine transcript, may contain errors” note on the sermon page.")) : null);
  };
  renderTranscript();

  // ---------------------------------------------------------------- save
  const save = async () => {
    const errors: string[] = [];
    const title = draft.title.trim();
    if (!title) errors.push("Give the sermon a title.");
    if (!original) {
      if (!draft.slug) errors.push("Fill in the web address (lower-case words joined by hyphens).");
      else if (data.sermons.some((s) => s.slug === draft.slug)) errors.push("Another sermon already uses that web address.");
    }
    if (!draft.date) errors.push("Choose the date it was preached.");
    if (!draft.speaker) errors.push("Choose the speaker.");
    const yt = draft.youtube.trim() ? youtubeId(draft.youtube) : null;
    const sa = draft.sermonAudio.trim() ? sermonAudioId(draft.sermonAudio) : null;
    if (draft.youtube.trim() && !yt) errors.push("The YouTube link isn't recognised.");
    if (draft.sermonAudio.trim() && !sa) errors.push("The SermonAudio link isn't recognised.");
    if (transcriptLoaded && transcriptDirty && !source && !(draft.transcript ?? "").trim()) transcriptDirty = false;
    if (errors.length) { problems.replaceChildren(problemsBox("Not saved yet:", errors)); problems.scrollIntoView({ block: "center" }); return; }

    const wpId = original?.wpId ?? Math.max(FIRST_NEW_ID - 1, ...data.sermons.map((s) => s.wpId)) + 1;
    const sermon: Sermon = original ? structuredClone(original) : {
      wpId, slug: draft.slug, path: `/sermons/${draft.slug}/`, title, date: draft.date, modified: today(), speakers: [], series: [], books: [], passages: [], passage: "",
      youtubeId: null, sermonAudioId: null, pdf: null, body: null,
      seo: { title: `${title}${SEO_SUFFIX}`, description: "", canonical: `/sermons/${draft.slug}/`, indexable: true, h1: null, ogType: "website", ogTitle: null, ogDescription: null, captured: false },
    };
    if (original && original.title !== title && sermon.seo.title === `${original.title}${SEO_SUFFIX}`) sermon.seo.title = `${title}${SEO_SUFFIX}`;
    Object.assign(sermon, {
      title, date: draft.date, speakers: [draft.speaker], series: [...draft.series], books: [...draft.books], passages: [...draft.passages], passage: draft.passage.trim(),
      youtubeId: yt, sermonAudioId: sa,
    });
    if (original) sermon.modified = today();
    const id = String(wpId);
    const usedTerms = created.filter((t) => (t.kind === "speaker" ? draft.speaker === t.slug : (sermon[({ series: "series", book: "books", passage: "passages" } as const)[t.kind as "series" | "book" | "passage"]] as string[]).includes(t.slug)));

    const edits: Edit[] = [
      jsonEdit<Sermon[]>(DATA.sermons, (list) => {
        const at = list.findIndex((s) => s.wpId === wpId);
        if (at >= 0) list.splice(at, 1);
        const insert = list.findIndex((s) => s.date <= sermon.date);
        list.splice(insert < 0 ? list.length : insert, 0, sermon);
      }, (list) => list.find((s) => s.wpId === wpId)),
    ];
    if (usedTerms.length) edits.push(jsonEdit<TaxonomyTerm[]>(DATA.taxonomies, (list) => {
      for (const t of usedTerms) if (!list.some((x) => x.kind === t.kind && x.slug === t.slug)) list.push(t);
    }, (list) => list.filter((x) => usedTerms.some((t) => t.kind === x.kind && t.slug === x.slug))));
    const description = normaliseLongText(draft.description).trim();
    if (description !== (data.descriptions[id] ?? "").trim()) edits.push(jsonEdit<Record<string, string>>(DATA.descriptions, (map) => {
      if (description) map[id] = description; else delete map[id];
      const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => Number(a) - Number(b)));
      for (const k of Object.keys(map)) delete map[k];
      Object.assign(map, sorted);
    }, (map) => map[id]));
    if (transcriptLoaded && transcriptDirty) {
      const text = normaliseLongText(draft.transcript ?? "");
      const newSource: Source | null = !text ? null : !source ? "church" : draft.checked ? "church" : source;
      edits.push(fileEdit(transcriptPath(id), text || null));
      edits.push(jsonEdit<Record<string, string>>(DATA.sources, (map) => {
        if (newSource) map[id] = newSource; else delete map[id];
        const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => Number(a) - Number(b)));
        for (const k of Object.keys(map)) delete map[k];
        Object.assign(map, sorted);
      }, (map) => map[id]));
    }
    const sha = await ctx.save(`${original ? "Edit" : "Add"} sermon: ${title}`, edits, problems);
    if (!sha) return;
    setDirty(false);
    if (!original) ctx.go(`#/sermons/${wpId}`);
    else ctx.go(`#/sermons/${wpId}?saved=${Date.now()}`);
  };
  const discard = () => {
    if (!window.confirm("Throw away your changes?")) return;
    setDirty(false);
    if (original) ctx.go(`#/sermons/${original.wpId}?reset=${Date.now()}`); else ctx.go("#/sermons");
  };

  const ids = { title: titleInput.id, slug: slugInput.id };
  const view = h("div", { class: "editor" },
    h("header", { class: "page-head" },
      h("p", { class: "page-head__crumb" }, h("a", { class: "link", attrs: { href: "#/sermons" }, text: "Sermons" }), " / "),
      h("h1", { class: "page-head__title", text: original ? original.title : "Add a sermon" }),
      original ? h("div", { class: "page-head__extra" },
        external("View on the website", `${SITE_URL}${original.path}`),
        // Sermons added in the admin are not on the old WordPress site.
        original.wpId < FIRST_NEW_ID ? external("View on the live site", `https://www.savinggrace.org.au${original.path}`) : null) : null),
    problems,
    card("Details",
      h("div", { class: "form-grid" },
        field("Title", titleInput, { id: ids.title, wide: true }),
        field("Web address", slugInput, { id: ids.slug, wide: true, hint: slugInfo }),
        field("Date preached", dateInput),
        field("Speaker", speakerSelect),
        field("Passage", passageInput, { hint: "As it should appear, e.g. Luke 6:12-16." }),
        h("div", { class: "field" }, h("span", { class: "field__label", text: "Passage pages" }), passagePicker.el),
        bookPicker.id ? field("Bible books", bookPicker.el, { id: bookPicker.id }) : bookPicker.el,
        seriesPicker.id ? field("Series", seriesPicker.el, { id: seriesPicker.id }) : seriesPicker.el)),
    card("Recording",
      h("div", { class: "form-grid" },
        field("YouTube", ytInput, { wide: true, hint: ytStatus }),
        field("SermonAudio", saInput, { wide: true, hint: saStatus }))),
    card("Description",
      field("About this sermon", descInput, { hint: "Shown under the video and used by search engines. Separate paragraphs with a blank line.", error: descCount, wide: true })),
    card("Transcript", transcriptHost),
    saveBar(save, discard, original ? "Save and publish" : "Add sermon"));
  return view;
}

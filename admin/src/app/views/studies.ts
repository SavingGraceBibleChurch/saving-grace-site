// Tuesday Night Studies: courses → sections → studies, with reordering, and editors for each.
import { DATA, SITE_URL, studyContentPath } from "../config";
import type { Ctx } from "../context";
import { fileEdit, jsonEdit, toJson, type StudyContent, type StudySeries, type StudySession } from "../store";
import { normaliseLongText, sermonAudioId, shortDate, slugify, wordCount, youtubeId } from "../text";
import { badge, button, card, external, field, h, input, mount, nextId, pageHead, problemsBox, saveBar, select, setDirty, textarea } from "../ui";

type Studies = { series: StudySeries[]; sessions: StudySession[] };
/** Plain code-point comparison, matching Python's sort in scripts/export_local_content.py. */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byOrder = <T extends { order: number; title: string }>(a: T, b: T) => a.order - b.order || cmp(a.title, b.title);

/** The same ordering scripts/export_local_content.py used, so saved files stay tidy. */
function tidy(d: Studies) {
  d.series.sort((a, b) => cmp(a.parentId ?? "", b.parentId ?? "") || byOrder(a, b));
  d.sessions.sort((a, b) => cmp(a.seriesId, b.seriesId) || byOrder(a, b));
}

export function studiesPage(ctx: Ctx): Node {
  const local: Studies = structuredClone(ctx.store.data.studies);
  const host = h("div", { class: "tree" });
  const problems = h("div");
  let changed = false;

  const move = <T extends { order: number; title: string }>(list: T[], item: T, by: -1 | 1) => {
    const sorted = [...list].sort(byOrder);
    const at = sorted.indexOf(item);
    const to = at + by;
    if (to < 0 || to >= sorted.length) return;
    [sorted[at], sorted[to]] = [sorted[to]!, sorted[at]!];
    sorted.forEach((x, i) => { x.order = i; });
    changed = true;
    setDirty(true);
    render();
  };
  const arrows = <T extends { order: number; title: string }>(list: T[], item: T) => h("span", { class: "tree__move" },
    h("button", { class: "icon-btn", attrs: { type: "button", "aria-label": `Move “${item.title}” up` }, text: "↑", on: { click: () => move(list, item, -1) } }),
    h("button", { class: "icon-btn", attrs: { type: "button", "aria-label": `Move “${item.title}” down` }, text: "↓", on: { click: () => move(list, item, 1) } }));

  const sessionList = (group: StudySeries) => {
    const sessions = local.sessions.filter((s) => s.seriesId === group.id).sort(byOrder);
    return h("ol", { class: "tree__sessions" }, sessions.map((s) => h("li", { class: "tree__session" },
      h("a", { class: "tree__link", attrs: { href: `#/studies/study/${encodeURIComponent(s.slug)}` } }, h("span", { text: s.title }), s.date ? h("span", { class: "tree__meta", text: shortDate(s.date) }) : null),
      arrows(sessions, s))),
      h("li", { class: "tree__add" }, h("a", { class: "link", attrs: { href: `#/studies/study/new?in=${encodeURIComponent(group.id)}` }, text: "+ Add a study here" })));
  };

  const render = () => {
    const courses = local.series.filter((s) => !s.parentId).sort(byOrder);
    mount(host, courses.map((course) => {
      const sections = local.series.filter((s) => s.parentId === course.id).sort(byOrder);
      const count = local.sessions.filter((s) => s.seriesId === course.id || sections.some((x) => x.id === s.seriesId)).length;
      return h("section", { class: "tree__course" },
        h("header", { class: "tree__head" },
          h("h2", { class: "tree__title" }, course.title, h("span", { class: "tree__meta", text: ` ${count} ${count === 1 ? "study" : "studies"}` })),
          h("span", { class: "tree__actions" }, h("a", { class: "link", attrs: { href: `#/studies/group/${encodeURIComponent(course.id)}` }, text: "Edit" }), arrows(courses, course))),
        local.sessions.some((s) => s.seriesId === course.id) || !sections.length ? sessionList(course) : null,
        sections.map((section) => h("div", { class: "tree__section" },
          h("header", { class: "tree__head tree__head--section" },
            h("h3", { class: "tree__subtitle", text: section.title }),
            h("span", { class: "tree__actions" }, h("a", { class: "link", attrs: { href: `#/studies/group/${encodeURIComponent(section.id)}` }, text: "Edit" }), arrows(sections, section))),
          sessionList(section))),
        h("p", { class: "tree__add" }, h("a", { class: "link", attrs: { href: `#/studies/group/new?in=${encodeURIComponent(course.id)}` }, text: "+ Add a section to this course" })));
    }));
  };
  render();

  const save = async () => {
    if (!changed) return;
    const orders = { series: new Map(local.series.map((s) => [s.id, s.order])), sessions: new Map(local.sessions.map((s) => [s.slug, s.order])) };
    const sha = await ctx.save("Reorder Tuesday Night Studies", [jsonEdit<Studies>(DATA.studies, (d) => {
      for (const s of d.series) if (orders.series.has(s.id)) s.order = orders.series.get(s.id)!;
      for (const s of d.sessions) if (orders.sessions.has(s.slug)) s.order = orders.sessions.get(s.slug)!;
      tidy(d);
    }, (d) => [d.series.map((s) => [s.id, s.order]), d.sessions.map((s) => [s.slug, s.order])])], problems);
    if (sha) { setDirty(false); ctx.go(`#/studies?saved=${Date.now()}`); }
  };

  return h("div", null,
    pageHead("Tuesday Night Studies", button("Add a course", () => ctx.go("#/studies/group/new"), "secondary")),
    h("p", { class: "page-head__lede", text: "Use the arrows to change the order, then save. Open a study to edit its details, questions and transcript." }),
    problems, host,
    saveBar(save, () => { setDirty(false); ctx.go(`#/studies?reset=${Date.now()}`); }, "Save the new order"));
}

// ------------------------------------------------------------------ one study
export async function studyEditPage(ctx: Ctx, slug: string | null, inGroup: string | null): Promise<Node> {
  const studies = ctx.store.data.studies;
  const original = slug === null ? null : studies.sessions.find((s) => s.slug === slug);
  if (slug !== null && !original) return h("div", { class: "empty" }, h("h1", { text: "Study not found" }), h("a", { class: "link", attrs: { href: "#/studies" }, text: "Back to studies" }));
  const content: StudyContent = original
    ? (await ctx.store.json<StudyContent>(studyContentPath(original.slug))) ?? { description: "", scripture: [], questions: [], transcript: "" }
    : { description: "", scripture: [], questions: [], transcript: "" };
  const groups = groupOptions(studies.series);
  const draft: StudySession = original ? structuredClone(original) : {
    slug: "", title: "", originalTitle: "", seriesId: inGroup && studies.series.some((s) => s.id === inGroup) ? inGroup : groups[0]?.value ?? "", order: 0,
    teacher: studies.sessions.find((s) => s.teacher)?.teacher ?? null, date: null, durationSeconds: null, youtubeId: null, sermonAudioId: null,
  };
  const c: StudyContent = structuredClone(content);
  const problems = h("div");
  let slugTouched = false;

  const slugInfo = h("p", { class: "field__hint" });
  const slugInput = input(draft.slug, { disabled: Boolean(original), autocomplete: "off", spellcheck: "false" }, (v) => { slugTouched = true; draft.slug = v.trim(); showSlug(); });
  const showSlug = () => {
    if (original) { slugInfo.textContent = "The web address can't change once a study is published."; return; }
    const taken = studies.sessions.some((s) => s.slug === draft.slug);
    slugInfo.replaceChildren(draft.slug ? `/studies/sessions/${draft.slug}/` : "Fills in from the title.", taken ? h("strong", { class: "is-error", text: " — already used" }) : "");
  };
  showSlug();
  const titleInput = input(draft.title, { autocomplete: "off" }, (v) => { draft.title = v; if (!original && !slugTouched) { draft.slug = slugify(v); slugInput.value = draft.slug; showSlug(); } });
  const teachers = [...new Set(studies.sessions.map((s) => s.teacher).filter(Boolean))] as string[];
  const listId = nextId("teachers");
  const teacherInput = input(draft.teacher ?? "", { list: listId, autocomplete: "off" }, (v) => { draft.teacher = v.trim() || null; });
  const yt = input(draft.youtubeId ?? "", { placeholder: "Paste the YouTube link" }, (v) => { draft.youtubeId = v; });
  const sa = input(draft.sermonAudioId ?? "", { placeholder: "Paste the SermonAudio link" }, (v) => { draft.sermonAudioId = v; });

  // questions
  const qHost = h("ol", { class: "qa" });
  const renderQuestions = () => mount(qHost, c.questions.map((q, i) => {
    const qi = input(q.question, { "aria-label": `Question ${i + 1}` }, (v) => { q.question = v; });
    const ai = textarea(q.answer, { rows: 3, "aria-label": `Answer ${i + 1}` }, (v) => { q.answer = v; });
    const shift = (by: number) => { const to = i + by; if (to < 0 || to >= c.questions.length) return; [c.questions[i], c.questions[to]] = [c.questions[to]!, c.questions[i]!]; setDirty(true); renderQuestions(); };
    return h("li", { class: "qa__item" },
      h("div", { class: "qa__fields" }, h("span", { class: "field__label", text: `Question ${i + 1}` }), qi, h("span", { class: "field__label", text: "Answer" }), ai),
      h("div", { class: "qa__tools" },
        h("button", { class: "icon-btn", attrs: { type: "button", "aria-label": `Move question ${i + 1} up` }, text: "↑", on: { click: () => shift(-1) } }),
        h("button", { class: "icon-btn", attrs: { type: "button", "aria-label": `Move question ${i + 1} down` }, text: "↓", on: { click: () => shift(1) } }),
        h("button", { class: "icon-btn icon-btn--danger", attrs: { type: "button", "aria-label": `Delete question ${i + 1}` }, text: "×", on: { click: () => { if (window.confirm("Delete this question?")) { c.questions.splice(i, 1); setDirty(true); renderQuestions(); } } } })));
  }));
  renderQuestions();

  const transcriptCount = h("span", { class: "field__count", text: `${wordCount(c.transcript).toLocaleString("en-AU")} words` });

  const save = async () => {
    const errors: string[] = [];
    draft.title = draft.title.trim();
    if (!draft.title) errors.push("Give the study a title.");
    if (!original && (!draft.slug || studies.sessions.some((s) => s.slug === draft.slug))) errors.push("Choose a web address that isn't already used.");
    const ytId = draft.youtubeId?.trim() ? youtubeId(draft.youtubeId) : null;
    const saId = draft.sermonAudioId?.trim() ? sermonAudioId(draft.sermonAudioId) : null;
    if (draft.youtubeId?.trim() && !ytId) errors.push("The YouTube link isn't recognised.");
    if (draft.sermonAudioId?.trim() && !saId) errors.push("The SermonAudio link isn't recognised.");
    if (c.questions.some((q) => !q.question.trim())) errors.push("Every question needs text (delete empty ones).");
    if (errors.length) { problems.replaceChildren(problemsBox("Not saved yet:", errors)); return; }
    const movedGroup = !original || original.seriesId !== draft.seriesId;
    const record: StudySession = {
      slug: draft.slug, title: draft.title, originalTitle: original?.originalTitle ?? draft.title, seriesId: draft.seriesId, order: draft.order,
      teacher: draft.teacher, date: draft.date || null, durationSeconds: draft.durationSeconds, youtubeId: ytId, sermonAudioId: saId,
    };
    const cleaned: StudyContent = {
      description: normaliseLongText(c.description).trim(),
      scripture: c.scripture.map((x) => x.trim()).filter(Boolean),
      questions: c.questions.map((q) => ({ question: q.question.trim(), answer: normaliseLongText(q.answer).trim() })),
      transcript: normaliseLongText(c.transcript).trim(),
    };
    const sha = await ctx.save(`${original ? "Edit" : "Add"} study: ${record.title}`, [
      jsonEdit<Studies>(DATA.studies, (d) => {
        const at = d.sessions.findIndex((s) => s.slug === record.slug);
        if (movedGroup) record.order = Math.max(-1, ...d.sessions.filter((s) => s.seriesId === record.seriesId && s.slug !== record.slug).map((s) => s.order)) + 1;
        if (at >= 0) d.sessions[at] = record; else d.sessions.push(record);
        tidy(d);
      }, (d) => d.sessions.find((s) => s.slug === record.slug)),
      fileEdit(studyContentPath(record.slug), toJson(cleaned)),
    ], problems);
    if (sha) { setDirty(false); ctx.go(`#/studies/study/${encodeURIComponent(record.slug)}?saved=${Date.now()}`); }
  };

  return h("div", { class: "editor" },
    h("header", { class: "page-head" },
      h("p", { class: "page-head__crumb" }, h("a", { class: "link", attrs: { href: "#/studies" }, text: "Tuesday Night Studies" }), " / "),
      h("h1", { class: "page-head__title", text: original ? original.title : "Add a study" }),
      original ? h("div", { class: "page-head__extra" }, external("View on the website", `${SITE_URL}/studies/sessions/${original.slug}/`)) : null),
    problems,
    card("Details", h("div", { class: "form-grid" },
      field("Title", titleInput, { wide: true }),
      field("Web address", slugInput, { wide: true, hint: slugInfo }),
      field("Course / section", select(groups, draft.seriesId, (v) => { draft.seriesId = v; })),
      field("Teacher", teacherInput),
      h("datalist", { attrs: { id: listId } }, teachers.map((t) => h("option", { attrs: { value: t } }))),
      field("Date taught (optional)", input(draft.date ?? "", { type: "date" }, (v) => { draft.date = v || null; })),
      field("YouTube", yt),
      field("SermonAudio", sa))),
    card("Description", field("Description", textarea(c.description, { rows: 8 }, (v) => { c.description = v; }), { wide: true, hint: "Separate paragraphs with a blank line." }),
      field("Scripture references", textarea(c.scripture.join("\n"), { rows: 4 }, (v) => { c.scripture = v.split("\n"); }), { wide: true, hint: "One reference per line, e.g. 1 Corinthians 12:4-11." })),
    card("Questions and answers", qHost, button("+ Add a question", () => { c.questions.push({ question: "", answer: "" }); setDirty(true); renderQuestions(); (qHost.lastElementChild?.querySelector("input") as HTMLInputElement | null)?.focus(); })),
    card("Transcript", field("Transcript", textarea(c.transcript, { rows: 18 }, (v) => { c.transcript = v; transcriptCount.textContent = `${wordCount(v).toLocaleString("en-AU")} words`; }), { wide: true, error: transcriptCount, hint: "Shown in full under a “Transcript” toggle on the study page." })),
    saveBar(save, () => { if (window.confirm("Throw away your changes?")) { setDirty(false); ctx.go(original ? `#/studies/study/${encodeURIComponent(original.slug)}?reset=${Date.now()}` : "#/studies"); } }, original ? "Save and publish" : "Add study"));
}

function groupOptions(series: StudySeries[]) {
  const courses = series.filter((s) => !s.parentId).sort(byOrder);
  return courses.flatMap((course) => [
    { value: course.id, label: course.title },
    ...series.filter((s) => s.parentId === course.id).sort(byOrder).map((s) => ({ value: s.id, label: `${course.title} › ${s.title}` })),
  ]);
}

// ------------------------------------------------------------------ a course or section
export function seriesEditPage(ctx: Ctx, id: string | null, parentId: string | null): Node {
  const studies = ctx.store.data.studies;
  const original = id === null ? null : studies.series.find((s) => s.id === id);
  if (id !== null && !original) return h("div", { class: "empty" }, h("h1", { text: "Course not found" }), h("a", { class: "link", attrs: { href: "#/studies" }, text: "Back to studies" }));
  const parent = original ? (original.parentId ? studies.series.find((s) => s.id === original.parentId) : null) : parentId ? studies.series.find((s) => s.id === parentId) ?? null : null;
  const kind = parent ? "section" : "course";
  const draft: StudySeries = original ? structuredClone(original) : { id: crypto.randomUUID(), slug: "", title: "", parentId: parent?.id ?? null, order: 0 };
  const problems = h("div");
  let slugTouched = false;
  const slugInfo = h("p", { class: "field__hint" });
  const showSlug = () => {
    if (original) { slugInfo.textContent = "The web address can't change once published."; return; }
    const taken = studies.series.some((s) => s.slug === draft.slug);
    slugInfo.replaceChildren(draft.slug ? `/studies/series/${draft.slug}/` : "Fills in from the title.", taken ? h("strong", { class: "is-error", text: " — already used" }) : "");
  };
  const slugInput = input(draft.slug, { disabled: Boolean(original), autocomplete: "off", spellcheck: "false" }, (v) => { slugTouched = true; draft.slug = v.trim(); showSlug(); });
  const titleInput = input(draft.title, { autocomplete: "off" }, (v) => { draft.title = v; if (!original && !slugTouched) { draft.slug = slugify(v); slugInput.value = draft.slug; showSlug(); } });
  showSlug();
  const sessions = original ? studies.sessions.filter((s) => s.seriesId === original.id).length : 0;

  const save = async () => {
    draft.title = draft.title.trim();
    const errors: string[] = [];
    if (!draft.title) errors.push(`Give the ${kind} a title.`);
    if (!original && (!draft.slug || studies.series.some((s) => s.slug === draft.slug))) errors.push("Choose a web address that isn't already used.");
    if (errors.length) { problems.replaceChildren(problemsBox("Not saved yet:", errors)); return; }
    const record = { ...draft };
    const sha = await ctx.save(`${original ? "Edit" : "Add"} study ${kind}: ${record.title}`, [jsonEdit<Studies>(DATA.studies, (d) => {
      const at = d.series.findIndex((s) => s.id === record.id);
      if (at < 0) record.order = Math.max(-1, ...d.series.filter((s) => s.parentId === record.parentId).map((s) => s.order)) + 1;
      if (at >= 0) d.series[at] = record; else d.series.push(record);
      tidy(d);
    }, (d) => d.series.find((s) => s.id === record.id))], problems);
    if (sha) { setDirty(false); ctx.go(original ? "#/studies" : `#/studies/study/new?in=${encodeURIComponent(record.id)}`); }
  };

  return h("div", { class: "editor" },
    h("header", { class: "page-head" },
      h("p", { class: "page-head__crumb" }, h("a", { class: "link", attrs: { href: "#/studies" }, text: "Tuesday Night Studies" }), parent ? ` / ${parent.title}` : "", " / "),
      h("h1", { class: "page-head__title", text: original ? original.title : `Add a ${kind}` }),
      original ? h("div", { class: "page-head__extra" }, external("View on the website", `${SITE_URL}/studies/series/${original.slug}/`)) : null),
    problems,
    card(null, h("div", { class: "form-grid" }, field("Title", titleInput, { wide: true }), field("Web address", slugInput, { wide: true, hint: slugInfo })),
      original ? h("p", { class: "card__foot" }, badge(`${sessions} ${sessions === 1 ? "study" : "studies"} directly in this ${kind}`, "muted")) : h("p", { class: "card__foot", text: `After saving you'll be taken to add its first study.` })),
    saveBar(save, () => { setDirty(false); ctx.go("#/studies"); }, original ? "Save and publish" : `Add ${kind}`));
}

// Home: add this week's sermon, the church notice, what needs attention, and recent changes.
import { DATA, SITE_URL } from "../config";
import type { Ctx } from "../context";
import { jsonEdit, type Settings } from "../store";
import { shortDate, timeAgo } from "../text";
import { button, card, external, h, link, mount, nextId, setDirty } from "../ui";

export function homePage(ctx: Ctx): Node {
  const { sermons, descriptions, sources } = ctx.store.data;
  const latest = sermons[0];
  const noDescription = sermons.filter((s) => !descriptions[String(s.wpId)]?.trim()).length;
  const noTranscript = sermons.filter((s) => !sources[String(s.wpId)]).length;
  const pending = sermons.filter((s) => s.sermonAudioId && !sources[String(s.wpId)]).length;

  const recent = h("ul", { class: "changes changes--compact" }, h("li", { class: "changes__loading", text: "Loading…" }));
  ctx.gh.recentCommits(5).then((commits) => mount(recent, commits.map((c) =>
    h("li", { class: "changes__item" }, h("span", { class: "changes__message", text: c.message }), h("span", { class: "changes__meta", text: `${c.author} · ${timeAgo(c.date)}` }))))).catch(() => mount(recent, h("li", { text: "Could not load recent changes." })));

  return h("div", { class: "home" },
    h("header", { class: "page-head" }, h("h1", { class: "page-head__title", text: `Welcome, ${ctx.user}` }), h("p", { class: "page-head__lede", text: "Changes you save here go live on the website within about five minutes." })),
    h("section", { class: "hero-card" },
      h("div", null,
        h("h2", { class: "hero-card__title", text: "Add this week's sermon" }),
        h("p", { class: "hero-card__text" }, latest ? `Latest on the site: “${latest.title}”, ${shortDate(latest.date)}.` : "No sermons yet.")),
      button("Add sermon", () => ctx.go("#/sermons/new"), "primary", { "data-size": "large" })),
    h("div", { class: "grid-2" },
      noticeCard(ctx),
      card("Needs attention",
        h("ul", { class: "stats" },
          stat(noDescription, "sermons have no description", "#/sermons?show=no-description"),
          stat(noTranscript, "sermons have no transcript", "#/sermons?show=no-transcript"),
          stat(pending, "have SermonAudio audio but no transcript yet", "#/sermons?show=pending")),
        h("p", { class: "card__foot" }, "SermonAudio transcripts are fetched automatically every day once they exist."))),
    h("div", { class: "grid-2" },
      card("Recent changes", recent, h("p", { class: "card__foot" }, link("All changes", "#/changes"))),
      card("Go to",
        h("ul", { class: "quick" },
          h("li", null, link("Sermons", "#/sermons"), h("span", { text: `${sermons.length} sermons` })),
          h("li", null, link("Tuesday Night Studies", "#/studies"), h("span", { text: `${ctx.store.data.studies.sessions.length} studies` })),
          h("li", null, link("Events", "#/events"), h("span", { text: `${ctx.store.data.events.events.length} events` })),
          h("li", null, external("The website", SITE_URL), h("span", { text: "what visitors see" }))))));
}

function stat(count: number, label: string, href: string) {
  return h("li", { class: "stats__item" }, h("a", { class: "stats__link", attrs: { href } }, h("span", { class: ["stats__count", count > 0 && "is-warn"], text: String(count) }), h("span", { class: "stats__label", text: label })));
}

function noticeCard(ctx: Ctx) {
  const current = ctx.store.data.settings.notice;
  const draft = { ...current };
  const textId = nextId("notice");
  const text = h("textarea", { class: "input input--area", attrs: { id: textId, rows: 2, maxlength: 200 } });
  text.value = draft.text;
  const show = h("input", { attrs: { type: "checkbox", id: `${textId}-show` }, checked: draft.show });
  const previewText = h("p", { text: draft.text });
  const preview = h("div", { class: ["notice-preview", !draft.show && "is-off"], attrs: { "aria-hidden": "true" } }, h("span", { class: "notice-preview__dot" }), previewText);
  const host = h("div");
  const save = button("Save notice", async () => {
    save.disabled = true;
    const sha = await ctx.save(draft.show ? `Update the church notice` : "Hide the church notice",
      [jsonEdit<Settings>(DATA.settings, (s) => { s.notice = { show: draft.show, text: draft.text.trim() }; }, (s) => s.notice)], host);
    save.disabled = false;
    if (sha) { setDirty(false); ctx.go(`#/?saved=${Date.now()}`); }
  }, "primary");
  const sync = () => {
    draft.text = text.value;
    draft.show = show.checked;
    previewText.textContent = draft.text || "(empty)";
    preview.classList.toggle("is-off", !draft.show);
    setDirty(draft.text !== current.text || draft.show !== current.show);
  };
  text.addEventListener("input", sync);
  show.addEventListener("change", sync);
  return card("Church notice",
    h("p", { class: "card__lede", text: "The bar across the top of every page." }),
    preview,
    h("div", { class: "field" }, h("label", { class: "field__label", attrs: { for: textId }, text: "Notice text" }), text),
    h("div", { class: "row row--between" },
      h("label", { class: "switch", attrs: { for: `${textId}-show` } }, show, h("span", { class: "switch__track", attrs: { "aria-hidden": "true" } }), h("span", { text: "Show on the website" })),
      save),
    host);
}

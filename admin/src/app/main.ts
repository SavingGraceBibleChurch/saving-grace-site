// Starts the admin: sign-in, the top bar, and hash routing between pages.
import { REPO, STAGING, TOKEN_KEY, isLocalTest } from "./config";
import { makeCtx, type Ctx } from "./context";
import { GitHub, GitHubError } from "./github";
import { Store } from "./store";
import { confirmLeave, external, h, mount, setDirty, toast } from "./ui";
import { homePage } from "./views/home";
import { sermonListPage } from "./views/sermons";
import { sermonEditPage } from "./views/sermon-edit";
import { eventListPage, eventEditPage } from "./views/events";
import { studiesPage, studyEditPage, seriesEditPage } from "./views/studies";
import { changesPage } from "./views/changes";

const app = document.getElementById("app")!;
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };

type View = (ctx: Ctx, match: RegExpExecArray, query: URLSearchParams) => Node | Promise<Node>;
const routes: [RegExp, View, string][] = [
  [/^\/$/u, homePage, "home"],
  [/^\/sermons$/u, sermonListPage, "sermons"],
  [/^\/sermons\/new$/u, (ctx) => sermonEditPage(ctx, null), "sermons"],
  [/^\/sermons\/(\d+)$/u, (ctx, m) => sermonEditPage(ctx, Number(m[1])), "sermons"],
  [/^\/studies$/u, studiesPage, "studies"],
  [/^\/studies\/study\/new$/u, (ctx, _m, q) => studyEditPage(ctx, null, q.get("in")), "studies"],
  [/^\/studies\/study\/([^/]+)$/u, (ctx, m) => studyEditPage(ctx, decodeURIComponent(m[1]!), null), "studies"],
  [/^\/studies\/group\/new$/u, (ctx, _m, q) => seriesEditPage(ctx, null, q.get("in")), "studies"],
  [/^\/studies\/group\/([^/]+)$/u, (ctx, m) => seriesEditPage(ctx, decodeURIComponent(m[1]!), null), "studies"],
  [/^\/events$/u, eventListPage, "events"],
  [/^\/events\/new$/u, (ctx) => eventEditPage(ctx, null), "events"],
  [/^\/events\/([^/]+)$/u, (ctx, m) => eventEditPage(ctx, decodeURIComponent(m[1]!)), "events"],
  [/^\/changes$/u, changesPage, "changes"],
];

function parseHash() {
  const raw = location.hash.replace(/^#/u, "") || "/";
  const [path, query] = raw.split("?");
  return { path: path || "/", query: new URLSearchParams(query ?? "") };
}

async function start() {
  const token = getToken();
  if (!token) return loginPage();
  const gh = new GitHub(token);
  mount(app, h("div", { class: "loading" }, h("span", { class: "spinner", attrs: { "aria-hidden": "true" } }), "Loading the site data…"));
  let user: string;
  const store = new Store(gh);
  try {
    user = await gh.user();
    if (!(await gh.canAccessRepo())) throw new GitHubError(`This token cannot see ${REPO.owner}/${REPO.name}. Make a token for that repository.`, 404);
    await store.load();
  } catch (error) {
    if (error instanceof GitHubError && (error.status === 401 || error.status === 404)) {
      try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
      return loginPage(error.message);
    }
    mount(app, h("div", { class: "fatal" }, h("h1", { text: "The admin could not load" }), h("p", { text: error instanceof Error ? error.message : String(error) }), h("button", { class: "btn btn--primary", attrs: { type: "button" }, on: { click: () => location.reload() }, text: "Try again" })));
    return;
  }

  let lastHash = location.hash;
  let skipNext = false;
  const go = (hash: string) => { location.hash = hash; };
  const ctx = makeCtx(store, gh, user, go);

  const nav = (label: string, hash: string, key: string) => h("a", { class: "nav__link", attrs: { href: hash, "data-key": key } }, label);
  const main = h("main", { class: "main", attrs: { id: "main", tabindex: "-1" } });
  mount(app,
    h("a", { class: "skip", attrs: { href: "#main" }, on: { click: (e) => { e.preventDefault(); main.focus(); } } }, "Skip to content"),
    h("header", { class: "topbar" },
      h("div", { class: "topbar__inner" },
        h("a", { class: "brand", attrs: { href: "#/" } }, h("span", { class: "brand__name", text: "Saving Grace" }), h("span", { class: "brand__tag", text: "Admin" })),
        h("nav", { class: "nav", attrs: { "aria-label": "Admin sections" } },
          nav("Home", "#/", "home"), nav("Sermons", "#/sermons", "sermons"), nav("Studies", "#/studies", "studies"), nav("Events", "#/events", "events"), nav("Changes", "#/changes", "changes")),
        h("div", { class: "topbar__end" },
          h("div", { attrs: { id: "build-status" } }),
          h("details", { class: "account" },
            h("summary", { class: "account__summary" }, h("span", { class: "sr-only", text: "Signed in as " }), user),
            h("div", { class: "account__menu" },
              external("Open staging site", STAGING, "account__item"),
              external("Code and history on GitHub", `https://github.com/${REPO.owner}/${REPO.name}`, "account__item"),
              h("button", { class: "account__item", attrs: { type: "button" }, on: { click: signOut }, text: "Sign out" })))))),
    isLocalTest ? h("p", { class: "testbanner", text: `Test mode: saving to a local test server (branch ${REPO.branch}), not GitHub.` }) : null,
    main);

  const render = async () => {
    const { path, query } = parseHash();
    const route = routes.find(([pattern]) => pattern.test(path));
    for (const link of app.querySelectorAll<HTMLAnchorElement>(".nav__link")) {
      if (route && link.dataset.key === route[2]) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    if (!route) { mount(main, h("div", { class: "empty" }, h("h1", { text: "Page not found" }), h("a", { class: "link", attrs: { href: "#/" }, text: "Back to the admin home" }))); return; }
    mount(main, h("div", { class: "loading" }, h("span", { class: "spinner", attrs: { "aria-hidden": "true" } }), "Loading…"));
    try {
      const view = await route[1](ctx, route[0].exec(path)!, query);
      setDirty(false);
      mount(main, view);
      const heading = main.querySelector("h1");
      document.title = `${heading?.textContent ?? "Admin"} · Saving Grace admin`;
      window.scrollTo(0, 0);
    } catch (error) {
      mount(main, h("div", { class: "fatal" }, h("h1", { text: "Something went wrong" }), h("p", { text: error instanceof Error ? error.message : String(error) })));
    }
  };

  window.addEventListener("hashchange", () => {
    if (skipNext) { skipNext = false; return; }
    if (!confirmLeave()) { skipNext = true; location.hash = lastHash; return; }
    lastHash = location.hash;
    void render();
  });
  await render();
}

function signOut() {
  if (!confirmLeave()) return;
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  location.hash = "";
  location.reload();
}

function loginPage(message?: string) {
  const tokenInput = h("input", { class: "input", attrs: { id: "token", type: "password", autocomplete: "off", spellcheck: "false", required: true, placeholder: "github_pat_…" } });
  const error = h("p", { class: "login__error", attrs: { role: "alert" } }, message ?? "");
  const submit = h("button", { class: "btn btn--primary btn--block", attrs: { type: "submit" }, text: "Sign in" });
  const form = h("form", { class: "login__form", on: { submit: async (event) => {
    event.preventDefault();
    const token = tokenInput.value.trim();
    if (!token) return;
    submit.disabled = true;
    submit.textContent = "Checking…";
    error.textContent = "";
    try {
      const gh = new GitHub(token);
      await gh.user();
      if (!(await gh.canAccessRepo())) throw new Error(`This token cannot see ${REPO.owner}/${REPO.name}. Choose that repository when you make the token.`);
      localStorage.setItem(TOKEN_KEY, token);
      location.reload();
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : "That did not work.";
      submit.disabled = false;
      submit.textContent = "Sign in";
    }
  } } },
  h("label", { class: "field__label", attrs: { for: "token" }, text: "Your GitHub token" }), tokenInput, error, submit);

  mount(app, h("main", { class: "login" },
    h("div", { class: "login__card" },
      h("p", { class: "brand brand--login" }, h("span", { class: "brand__name", text: "Saving Grace" }), h("span", { class: "brand__tag", text: "Admin" })),
      h("h1", { class: "login__title", text: "Sign in" }),
      h("p", { class: "login__lede", text: "Edit sermons, studies, events and the church notice. Every change is saved to the website's GitHub repository and published to the staging site a few minutes later." }),
      form,
      h("details", { class: "login__help" },
        h("summary", { text: "How do I get a token? (one-time setup, about 2 minutes)" }),
        h("ol", null,
          h("li", null, "You need a GitHub account that has been given access to the ", h("strong", { text: `${REPO.owner}/${REPO.name}` }), " repository."),
          h("li", null, "Open ", external("GitHub → New fine-grained token", "https://github.com/settings/personal-access-tokens/new"), "."),
          h("li", null, "Name it ", h("em", { text: "Saving Grace admin" }), " and pick an expiry (90 days is sensible; you'll make a new one when it runs out)."),
          h("li", null, "Resource owner: ", h("strong", { text: REPO.owner }), ". Repository access: ", h("strong", { text: "Only select repositories" }), " → ", h("strong", { text: REPO.name }), "."),
          h("li", null, "Permissions → Repository: set ", h("strong", { text: "Contents" }), " to ", h("em", { text: "Read and write" }), " and ", h("strong", { text: "Actions" }), " to ", h("em", { text: "Read-only" }), "."),
          h("li", null, "Generate the token, copy it and paste it above.")),
        h("p", { class: "login__note", text: `Not the owner of ${REPO.owner}/${REPO.name}? GitHub's fine-grained tokens can't reach a repository that belongs to someone else's personal account, so your token will be refused. Ask Samuel to move the repository into a (free) GitHub organisation and add you to it; the steps above then work with that organisation as the resource owner.` })),
      h("p", { class: "login__note", text: "The token stays in this browser only. On a shared computer, use Sign out when you finish." }))));
  tokenInput.focus();
}

window.addEventListener("unhandledrejection", (event) => {
  toast(event.reason instanceof Error ? event.reason.message : "Something went wrong.", "error");
});
void start();

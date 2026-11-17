// Starts the admin: sign-in, the top bar, and hash routing between pages.
import { REPO, STAGING, TOKEN_KEY, isLocalTest } from "./config";
import { makeCtx, type Ctx } from "./context";
import { GitHub, GitHubError, type EditProblem } from "./github";
import { Store } from "./store";
import { confirmLeave, external, h, mount, setDirty, toast } from "./ui";
import { homePage } from "./views/home";
import { sermonListPage } from "./views/sermons";
import { sermonEditPage } from "./views/sermon-edit";
import { eventListPage, eventEditPage } from "./views/events";
import { studiesPage, studyEditPage, seriesEditPage } from "./views/studies";
import { changesPage } from "./views/changes";
import { pagesListPage, homeEditPage, detailsPage } from "./views/pages";
import { pageEditPage } from "./views/page-edit";

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
  [/^\/pages$/u, pagesListPage, "pages"],
  [/^\/pages\/details$/u, detailsPage, "pages"],
  [/^\/pages\/home$/u, homeEditPage, "pages"],
  [/^\/pages\/(page|post)\/([^/]+)$/u, (ctx, m) => pageEditPage(ctx, m[1] as "page" | "post", decodeURIComponent(m[2]!)), "pages"],
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
      return loginPage(error.status === 401 ? "Your saved token no longer works; it may have expired. Make a new one with the steps below and sign in again." : error.message);
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
          nav("Home", "#/", "home"), nav("Sermons", "#/sermons", "sermons"), nav("Studies", "#/studies", "studies"), nav("Events", "#/events", "events"), nav("Pages", "#/pages", "pages"), nav("Changes", "#/changes", "changes")),
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

/** What sign-in says when a token can't be used to edit yet, and how to fix it. */
const EDIT_PROBLEMS: Record<EditProblem, string> = {
  repository: `This token can't see ${REPO.owner}/${REPO.name}. Make a new one with the steps below, choosing ${REPO.owner} as the resource owner and ${REPO.name} as the repository.`,
  access: `GitHub says your account can't make changes to ${REPO.name} yet. Ask Samuel to give you Write access (and to approve your token, if GitHub said it needs approval), then sign in again.`,
  save: "This token can't save changes yet. If GitHub said it needs approval, ask Samuel to approve it, then sign in again. Otherwise make a new one with the steps below, with Contents set to Read and write.",
  builds: "This token can save but can't see the website's build progress. Make a new one with the steps below, with Actions set to Read-only.",
};

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
      const problem = await gh.editProblem();
      if (problem) throw new Error(EDIT_PROBLEMS[problem]);
      localStorage.setItem(TOKEN_KEY, token);
      location.reload();
    } catch (e) {
      error.textContent = e instanceof GitHubError && e.status === 401 ? "GitHub didn't accept this token. Check you copied all of it, or make a new one with the steps below."
        : e instanceof Error ? e.message : "That did not work.";
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
          h("li", null, "Accept your invitation to the ", h("strong", { text: REPO.owner }), " organisation on GitHub (it comes by email). Samuel gives you Write access to ", h("strong", { text: REPO.name }), "."),
          h("li", null, "Open ", external("GitHub → New fine-grained token", "https://github.com/settings/personal-access-tokens/new"), "."),
          h("li", null, "Name it ", h("em", { text: "Saving Grace admin" }), " and pick an expiry (90 days is sensible; you'll make a new one when it runs out)."),
          h("li", null, "Resource owner: ", h("strong", { text: REPO.owner }), ". Repository access: ", h("strong", { text: "Only select repositories" }), " → ", h("strong", { text: REPO.name }), "."),
          h("li", null, "Under Permissions (click ", h("em", { text: "Add permissions" }), " if GitHub shows that button), set ", h("strong", { text: "Contents" }), " to ", h("em", { text: "Read and write" }), " and ", h("strong", { text: "Actions" }), " to ", h("em", { text: "Read-only" }), ". GitHub adds Metadata by itself."),
          h("li", null, "Generate the token, copy it (GitHub shows it only once) and paste it above. If GitHub says the token needs approval, ask Samuel to approve it first.")),
        h("p", { class: "login__note", text: "Signing in checks that the token can save changes, and says what to fix if it can't." })),
      h("p", { class: "login__note", text: "The token stays in this browser only. On a shared computer, use Sign out when you finish." }))));
  tokenInput.focus();
}

window.addEventListener("unhandledrejection", (event) => {
  toast(event.reason instanceof Error ? event.reason.message : "Something went wrong.", "error");
});
void start();

# Saving Grace Bible Church website

A static rebuild of https://www.savinggrace.org.au.
Every page is generated ahead of time with [Astro](https://astro.build), so there is no
WordPress, PHP, plugins, database or server to patch. Search is built at the same time
by [Pagefind](https://pagefind.app).

**Status:** the pages, sermons, events and SEO layer are built, verified, and running on public staging behind
the nginx setup planned for production. WordPress is still the live site.

## Design history

`main` is the editorial redesign: Newsreader and Instrument Sans type, warm paper with deep navy and a brick-ember accent, and photos framed in a church-window arch.

The original Astra + Impeccable design is kept at the tag `original-design`. To look at it, run `git switch --detach original-design`, then `npm install` and `npm run build`. `git switch main` brings the redesign back.

Both use the same data, URLs, titles, descriptions and H1s, and both pass `scripts/verify-seo.mjs`.

## What's in the redesign

- **Sermons page:** the SermonsV5 layout from the old project (finder, Bible bookshelf, journal rows, series and speaker tables) in this site's colours, nine sermons per page with "More sermons".
- **Speaker, series, Bible book and passage pages:** sectioned tables. WordPress's "topics" are Scripture passages, so they live under `/sermons/passage/`.
- **Content pages:** on wide screens each main heading sits in a left column beside its section; on phones they stack.
- **Tuesday Night Studies** at `/studies/`: 15 courses, 128 studies, each with its recording, description, study questions and transcript.
- **Descriptions and recording lengths** for 455 sermons, plus all study content. They first came from the old local database and SermonAudio; they are now edited in the admin.
- **Transcripts** on 455 sermon pages (SermonAudio's machine transcripts, or the video captions), marked as unchecked until someone ticks "checked" in the admin.

## Commands

```bash
npm install
npm run build          # astro build + pagefind search index -> dist/
npm run preview        # http://127.0.0.1:4321
npm run check          # type check
npm run validate       # checks src/data for broken references, duplicate addresses, bad dates…
node scripts/verify-seo.mjs --details   # SEO parity check (needs private/inputs, see below)
npm run admin:dev      # the admin at http://127.0.0.1:4330/saving-grace-site/
```

## The admin

The admin is a separate static app in `admin/`, published to GitHub Pages at
**https://savinggracebiblechurch.github.io/saving-grace-site/**. It edits sermons, Tuesday Night Studies, events and the
church notice. Each editor signs in with their own fine-grained GitHub token (this repository only,
Contents read/write, Actions read); there is no server, password store or database.

- **A save is one commit to `main`**, with a plain message such as "Edit sermon: Thomas the Brave". The git
  history is the audit log. If someone else saved first, the admin re-applies the edit on top of theirs, or
  stops and says so if they changed the same item.
- **Every save is validated** in the browser and again in CI (`scripts/lib/validate.mjs`) before anything is built.
- **`.github/workflows/site.yml`** runs on every push and daily. It fetches new SermonAudio transcripts
  (`scripts/fetch_new_transcripts.mjs`, using the `SERMONAUDIO_API_KEY` repository secret), validates, type-checks
  and builds, and only then publishes the build to the `staging` release. The staging server pulls it within
  2 minutes (see `deploy/staging/README.md`).
- **`.github/workflows/admin.yml`** publishes the admin to GitHub Pages (Settings → Pages → Source: GitHub Actions).
- Sermons added in the admin get IDs from 1,000,001 up; web addresses of published items are locked.
- **Pages** shows each page and article as it looks on the site (`admin/src/app/preview.ts` draws it inside
  `admin/src/pages/preview-frame.astro`, which carries the site's own stylesheets) and lets editors click any
  text and type, with a toolbar for bold, italic and links; "Edit as a form" is still there for anything else.
  It also edits the wording of every page and article, the home page, and the church details (address,
  phone, email, service times in `site-settings.json`; saving them also updates the copies on the home page,
  the contact page and the church venue). Text blocks can be added, moved and deleted; structured blocks keep
  their shape.
- **SEO lock:** `src/data/seo-protected.json` holds the search title, description and main heading of the pages
  that bring in most Google visits. The validator fails the build if they drift; the admin's unlock (with a
  reason) updates that file and records the change in `scripts/seo-intentional-changes.json`, which
  `verify-seo.mjs` accepts as reviewed. Any page's search settings need a reason to change.
- **Doctrinal pages** (What We Teach and its subpages, Doctrinal Statement, Church Covenant) need "the elders
  have approved this change" ticked; the commit message records it.
- **Undo** on the Changes page reverses one change item by item (`admin/src/app/undo.ts`), keeping later changes
  to other items, and refuses if the same item changed again since. Only content files can be undone there.
- **Editors:** the repository belongs to the SavingGraceBibleChurch organisation on GitHub. Invite editors to the
  organisation, give them Write access to this repository, and each makes a fine-grained token with the
  organisation as resource owner (approve it under the organisation's pending token requests if approval is on).
- To try the admin without touching GitHub: `node admin/dev/mock-github.mjs`, `npm run admin:dev`, then in the
  browser console `localStorage.setItem("sg-admin-api", "http://127.0.0.1:8790")` and sign in with `test-token`.

## How the content got here

`src/data/*.json` was first generated by `python scripts/import_sources.py` from private inputs
that are **never committed** (they're in `private/`, which is gitignored). Since the admin, `src/data` is the
source of truth: the import scripts (`import_sources.py`, `export_local_content.py`, `clean_transcripts.py`)
refuse to run without `--overwrite-admin-edits`, because they would replace edits made in the admin.

| Input | What it is |
|---|---|
| `private/inputs/database.sql` | WP Migrate dump of the live WordPress site (16 Nov 2026) |
| `private/inputs/live-capture.json` | the live title, description, canonical and H1 of all 6,789 captured URLs |
| `private/inputs/old-frontend/` | the cleaned page text from the Astra + Impeccable redesign |
| `private/inputs/gsc-pages.csv` | Search Console "Pages" export, last 12 months |

Rules the importer follows:

- Every page, post and sermon keeps its **live URL, title, meta description, canonical and H1**.
- Sermon slugs come from WordPress (the old Codex database had placeholder slugs for 296 sermons).
- Links to unpublished pages are turned into plain text.

## SEO parity (the launch gate)

`scripts/verify-seo.mjs` checks the built site against the live site:

1. Each of the 6,789 captured live URLs must either be served as a page or redirect, in one hop, to a page that exists.
2. Every indexable page, post and sermon must match live on title, description, canonical, robots and H1.
3. Every URL in the Search Console export must resolve, and its clicks are tallied.
4. Every internal link in `dist/` must resolve without going through a redirect.

Last run (16 Nov 2026):

- 6,789 live URLs: 0 missing, 0 redirects to nowhere
- 0 metadata mismatches
- 2,466 of 2,466 Search Console clicks covered
- 65,613 internal links: 0 broken, 0 through a redirect

Improvements over the live site:

- **Video schema:** sermon pages get VideoObject structured data.
- **Social previews:** share images use the site's own files; the live site points at a dead `stage.` domain.
- **Sitemap:** one sitemap with image entries.
- **Sermon filter pages:** each speaker, series, book and topic gets a real page instead of a `?sermon_…=` query URL. The old query URLs 301 there.
- **Demo page removed:** `/pages/im-new-here/` (2013 theme placeholder text) 301s to the Lord's Day Service page.

## Deployment requirements

The production plan is a plain Linux server with nginx: see `deploy/production/README.md` (server, firewall,
HTTPS, updates, switch-over, rollback, security checks). The points below are what any host must do.

- **Canonical host is `www.savinggrace.org.au`.** `savinggrace.org.au` must 301 to `www`.
- **Redirects:** `src/data/redirects.json` must be implemented at the host. It has 2,400+ rules of four kinds, applied in this order:
  1. `query`: match path plus query exactly (for example `/sermons/?sermon_speaker=wesam-saad`), even though `/sermons/` exists.
  2. `rewrite`: serve the target file without redirecting (`/sermons/feed/` → `/sermons/feed/index.xml`).
  3. `exact`: 301 when no file exists at the path.
  4. `prefix`: 301 when no file exists and the path starts with `from`. The longest prefix wins.

  `/?s=…` and `/?q=…` go to `/search/`. Every build turns these into nginx rules (`dist/_nginx/redirect-maps.conf`,
  from `scripts/nginx-redirects.mjs`), which the server's updater installs after checking they are only redirects.
- **Uploads:** WordPress files that old URLs point at (452 files, 1.16 GB, mostly sermon MP3s) are uploaded from `private/uploads/` to `/wp-content/uploads/…`. Create that folder with `python scripts/collect_uploads.py <backup.zip>`.
- **Daily rebuild:** "next service" and upcoming-event dates are worked out at build time. `site.yml` already rebuilds every day; the production host should take its builds the same way staging does.
- **Rollback:** keep WordPress running, untouched, for about a month after the switch.

## Not done yet

- Sermon Q&A, descriptions for the 8 sermons without a transcript, and transcripts for those 8.
- Image uploads and deleting sermons in the admin; editing the home page visually (it is edited as a form).
- Stripe/PayPal giving and a contact form. The giving and contact pages show the current content for now.
- Setting up the production server (`deploy/production/README.md`; the same nginx setup already runs on staging).

# Public staging (http://54.253.237.138:8080/)

The static site is the only thing this staging EC2 host serves. Staging runs **the same nginx rules as production** (`deploy/nginx/`) on a private port, so redirects, headers and
caching are tested here before launch.

| File | Installed at | Purpose |
| --- | --- | --- |
| `../nginx/savinggrace-site.conf`, `../nginx/savinggrace-headers.conf` | `/etc/nginx/snippets/` | The site rules and security headers, shared with production |
| `../nginx/savinggrace-blocking-maps.conf`, `../nginx/savinggrace-ip-deny.conf` | `/etc/nginx/snippets/` | The bots, probes and addresses refused with 403, carried over from the WordPress server. Only the bot and probe rules take effect here: every request reaches this nginx from 127.0.0.1. Curl is refused too, so test with `curl -A "Mozilla/5.0"` |
| `../nginx/staging-nginx.conf` | `/etc/nginx/savinggrace-staging.conf` | A separate nginx on 127.0.0.1:8084 only, with `X-Robots-Tag: noindex` and no HTTPS |
| `savinggrace-nginx.service` | `/etc/systemd/system/` | Runs that nginx (the system `nginx.service` stays disabled) |
| `savinggrace-nginx.logrotate` | `/etc/logrotate.d/savinggrace-nginx` | Rotates its logs in `/var/log/nginx/savinggrace-staging/` daily, keeping a week |
| `proxy-static.conf` | `/etc/systemd/system/savinggrace-staging-public.service.d/static-site.conf` | Points public port 8080 at that nginx. The base unit, `savinggrace-staging-public`, is left over from the old Codex app; this drop-in replaces its target |
| `../upload-old-files.sh` | uploads to `/srv/savinggrace-static/uploads/` | The old WordPress files (`/wp-content/uploads/…`), kept outside the builds so updates never remove them |
| `update.py` | `/srv/savinggrace-static/update.py` | Pulls the newest build from the `staging` GitHub release, checks its SHA-256, switches `current` and installs the build's redirect rules |
| `savinggrace-static-update.service` / `.timer` | `/etc/systemd/system/` | Runs `update.py` every 2 minutes |
| `static-server.py`, `savinggrace-static.service` | `/srv/savinggrace-static/`, `/etc/systemd/system/` | The small Python server used before nginx (127.0.0.1:8083); stopped and disabled, kept as a fallback |

The flow: a save in the admin (or any push to `main`) runs `.github/workflows/site.yml`, which validates and builds
the site and publishes it to the `staging` release only if everything passes. The timer picks it up within 2 minutes.

## Redirect rules

Each build carries its redirect rules as nginx maps (`_nginx/redirect-maps.conf`, written by
`scripts/nginx-redirects.mjs`). When they change, the updater:

1. refuses them unless they are only the three redirect maps (no other nginx settings, targets on this site, plain
   prefixes), so a push to the repository can change redirects but never nginx itself. CI runs the same check
   (`update.py --check-rules`) before it publishes a build;
2. installs them as `/srv/savinggrace-static/nginx/redirect-maps.conf` and runs `nginx -t`;
3. reloads nginx, or puts the previous rules back if the check failed.

Tested on staging on 17 Nov 2026:

- 4,243 requests (every redirect kind, pages, feeds, missing pages) gave the answers `scripts/verify-seo.mjs`
  expects.
- A rule removed by hand was put back and nginx reloaded by the updater.
- A build adding a `server` block was refused.
- A build that nginx rejected was rolled back.

## Blocking rules

`savinggrace-blocking-maps.conf` and `savinggrace-ip-deny.conf` were installed on 18 Nov 2026. They are carried
over from the WordPress server; see section 9 of `deploy/production/README.md`.

- **Same answers for browsers:** before and after, all 11,011 site addresses gave the same answers to a browser. That covers every page, feed and redirect, and every URL from the live site and Search Console.
- **Refused:** bots on the list, curl's own user agent and probes such as `/.env` now get 403.
- **Address rules:** these can't take effect here, because every visitor reaches this nginx as 127.0.0.1. They were tested in a copy of this nginx that trusted `X-Forwarded-For`.
- **To undo:** the previous files are in `/root/savinggrace-backups/2026-11-18-blocking-rules/`.
  1. Copy `savinggrace-site.conf` back to `/etc/nginx/snippets/` and `savinggrace-staging.conf` back to `/etc/nginx/`.
  2. Delete the two new snippets.
  3. Run `sudo systemctl reload savinggrace-nginx`.

## Rolling back

- **To an earlier build:** `sudo systemctl stop savinggrace-static-update.timer`, then
  `sudo ln -sfn /srv/savinggrace-static/releases/<commit> /srv/savinggrace-static/current`.
  Start the timer again to resume automatic updates.
- **To the Python server:**
  1. Run `sudo systemctl enable --now savinggrace-static.service`.
  2. Put `/root/savinggrace-backups/static-site.conf.python-8083` back as `static-site.conf`.
  3. Run `sudo systemctl daemon-reload && sudo systemctl restart savinggrace-staging-public.service`.
## The old Codex app (removed 18 Nov 2026)

The Codex app that used to run here was removed to free the disk, which went from 95% to 13% full. That covered its 5
containers, 2 PostgreSQL databases, Docker images and build cache, the `/opt/savinggrace-*` release folders, its
media store and its upload bundles. Docker is stopped and disabled because nothing uses it now.

Before the removal, its databases (full `pg_dumpall` dumps), unused data volumes, private study files and the media
not already in the WordPress uploads were downloaded to Samuel's PC. A `MANIFEST.txt` with each file's SHA-256 is
kept with them. The app's systemd unit files are in `/root/savinggrace-backups/2026-11-18-codex-units/`. There is no
going back to the Codex app on this server.

The 452 old WordPress files were then uploaded with `deploy/upload-old-files.sh`. Every `/wp-content/uploads/`
address from the live site now serves the same bytes as WordPress.

## Logs

- Updates: `journalctl -u savinggrace-static-update --since today`.
- Requests and errors: `/var/log/nginx/savinggrace-staging/`.

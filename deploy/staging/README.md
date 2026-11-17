# Public staging (http://54.253.237.138:8080/)

The static site is served on the staging EC2 host next to the old Codex app, which is left running untouched.
Staging runs **the same nginx rules as production** (`deploy/nginx/`) on a private port, so redirects, headers and
caching are tested here before launch.

| File | Installed at | Purpose |
| --- | --- | --- |
| `../nginx/savinggrace-site.conf`, `../nginx/savinggrace-headers.conf` | `/etc/nginx/snippets/` | The site rules and security headers, shared with production |
| `../nginx/staging-nginx.conf` | `/etc/nginx/savinggrace-staging.conf` | A separate nginx on 127.0.0.1:8084 only, with `X-Robots-Tag: noindex` and no HTTPS |
| `savinggrace-nginx.service` | `/etc/systemd/system/` | Runs that nginx (the system `nginx.service` stays disabled) |
| `savinggrace-nginx.logrotate` | `/etc/logrotate.d/savinggrace-nginx` | Rotates its logs in `/var/log/nginx/savinggrace-staging/` daily, keeping a week |
| `proxy-static.conf` | `/etc/systemd/system/savinggrace-staging-public.service.d/static-site.conf` | Points public port 8080 at that nginx instead of the old app |
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

## Rolling back

- **To an earlier build:** `sudo systemctl stop savinggrace-static-update.timer`, then
  `sudo ln -sfn /srv/savinggrace-static/releases/<commit> /srv/savinggrace-static/current`.
  Start the timer again to resume automatic updates.
- **To the Python server:**
  1. Run `sudo systemctl enable --now savinggrace-static.service`.
  2. Put `/root/savinggrace-backups/static-site.conf.python-8083` back as `static-site.conf`.
  3. Run `sudo systemctl daemon-reload && sudo systemctl restart savinggrace-staging-public.service`.
- **To the old Codex app:** delete `static-site.conf`, then `sudo systemctl daemon-reload && sudo systemctl restart savinggrace-staging-public.service`.
  The original unit files are backed up under `/root/savinggrace-backups/`.

Logs:

- Updates: `journalctl -u savinggrace-static-update --since today`.
- Requests and errors: `/var/log/nginx/savinggrace-staging/`.

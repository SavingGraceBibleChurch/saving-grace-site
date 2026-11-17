# Public staging (http://54.253.237.138:8080/)

The static site is served on the staging EC2 host next to the old Codex app, which is left running untouched.

| File | Installed at | Purpose |
| --- | --- | --- |
| `static-server.py` | `/srv/savinggrace-static/static-server.py` | Serves `/srv/savinggrace-static/current` on 127.0.0.1:8083 with `X-Robots-Tag: noindex` |
| `savinggrace-static.service` | `/etc/systemd/system/` | Runs the server |
| `proxy-static.conf` | `/etc/systemd/system/savinggrace-staging-public.service.d/static-site.conf` | Points public port 8080 at the static server instead of the old app |
| `update.py` | `/srv/savinggrace-static/update.py` | Pulls the newest build from the `staging` GitHub release, checks its SHA-256 and switches `current` |
| `savinggrace-static-update.service` / `.timer` | `/etc/systemd/system/` | Runs `update.py` every 2 minutes |

The flow: a save in the admin (or any push to `main`) runs `.github/workflows/site.yml`, which validates and builds
the site and publishes it to the `staging` release only if everything passes. The timer picks it up within 2 minutes.

## Rolling back

- **To an earlier build:** `sudo systemctl stop savinggrace-static-update.timer`, then
  `sudo ln -sfn /srv/savinggrace-static/releases/<commit> /srv/savinggrace-static/current`.
  Start the timer again to resume automatic updates.
- **To the old Codex app:** delete `static-site.conf`, then `sudo systemctl daemon-reload && sudo systemctl restart savinggrace-staging-public.service`.
  The original unit files are backed up under `/root/savinggrace-backups/`.

Logs: `journalctl -u savinggrace-static-update --since today`.

## Moving staging to nginx (ready, not installed)

Production runs nginx (`deploy/production/README.md`). Staging can run the very same rules on a private port,
so redirects and headers can be tested before launch: install nginx, copy the three files from `deploy/nginx/`
(`savinggrace-headers.conf`, `savinggrace-site.conf` into `/etc/nginx/snippets/`, `staging-nginx.conf` as
`/etc/nginx/savinggrace-staging.conf`), install `savinggrace-nginx.service` (listens on 127.0.0.1:8084 only),
point `static-site.conf` at 127.0.0.1:8084, and add `--nginx-unit savinggrace-nginx --nginx-conf
/etc/nginx/savinggrace-staging.conf` to the updater's ExecStart (with the extra ReadWritePaths in
`deploy/production/savinggrace-static-update.service`). Until then the small Python server serves staging and
refuses `/_nginx/`.


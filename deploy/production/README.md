# Production server for www.savinggrace.org.au

The website is now a **static site**: plain HTML, CSS, JavaScript and images. There is no database, no PHP, no
Docker and nothing that runs code on the server per visit. Production is a plain Linux server with **nginx**.

How a change reaches the site:

1. Someone saves in the admin (or a developer pushes to `main`).
2. GitHub Actions (`.github/workflows/site.yml`) checks the data, builds the site, and publishes the build
   (`site-<commit>.tar.gz` + its SHA-256 in `latest.json`) to the repository's `staging` release. A build that
   fails any check is never published.
3. Every 2 minutes the server's updater (`deploy/staging/update.py`) checks that release. When there is a new
   build it downloads it, **verifies the SHA-256**, unpacks it into `/srv/savinggrace-static/releases/<commit>`
   and switches `/srv/savinggrace-static/current` to it in one atomic step (keeping the last 3 builds).
4. If the build's redirect rules changed, the updater installs them, runs `nginx -t`, and reloads nginx. If the
   check fails, it puts the previous rules back and nginx keeps running unchanged. It accepts only redirect maps
   from a build, never other nginx settings, so a push to the repository cannot change the server's configuration.

Staging already runs this setup (same nginx rules, same updater) and it was tested there: see
`deploy/staging/README.md`.

Nothing is pushed **to** the server: it pulls from the public repository, so no passwords or SSH keys are
stored in GitHub, and the server needs no inbound access other than the website itself.

The files referred to below are in this repository: `deploy/nginx/` and `deploy/production/` (and `deploy/staging/update.py`).

---

## 1. The server

- **Ubuntu 24.04 LTS** on the smallest EC2 or Lightsail size is plenty (the site is ~85 MB per build; give it a
  10 GB disk). Amazon Linux 2023 also works; the commands differ slightly (`dnf` instead of `apt`, nginx runs
  as `nginx` instead of `www-data`, and there is no `sites-enabled`).
- An **Elastic IP** (fixed address), because the DNS will point at it.

## 2. Firewall

**AWS security group**, inbound:

| Port | From | Why |
| --- | --- | --- |
| 80 (HTTP) | anywhere (IPv4 and IPv6) | redirects to HTTPS, and Let's Encrypt renewals |
| 443 (HTTPS) | anywhere (IPv4 and IPv6) | the website |
| 22 (SSH) | **your IP address only** | administration |

Nothing else. On the server as a second layer:

```sh
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 80,443/tcp
sudo ufw allow from <your-ip> to any port 22 proto tcp
sudo ufw enable
```

SSH: keys only (`PasswordAuthentication no`, `PermitRootLogin no` in `/etc/ssh/sshd_config` — the defaults on
Ubuntu cloud images). Security updates install themselves (`unattended-upgrades`, on by default on Ubuntu;
check with `systemctl status unattended-upgrades`).

## 3. Install nginx and the site

```sh
sudo apt update && sudo apt install -y nginx certbot python3
sudo rm -f /etc/nginx/sites-enabled/default        # the stock "Welcome to nginx" site
sudo mkdir -p /srv/savinggrace-static/nginx /var/www/letsencrypt /etc/nginx/snippets

# From this repository:
sudo install -m 644 deploy/nginx/savinggrace-headers.conf deploy/nginx/savinggrace-site.conf \
  deploy/nginx/savinggrace-tls.conf /etc/nginx/snippets/
sudo install -m 755 deploy/staging/update.py /srv/savinggrace-static/update.py
sudo install -m 644 deploy/production/savinggrace-static-update.service \
  deploy/production/savinggrace-static-update.timer /etc/systemd/system/

# Fetch the current build once, and put its redirect rules in place.
sudo python3 -I /srv/savinggrace-static/update.py
sudo install -m 644 /srv/savinggrace-static/current/_nginx/redirect-maps.conf /srv/savinggrace-static/nginx/
```

## 4. HTTPS certificate (Let's Encrypt)

Let's Encrypt has to see the domain pointing at this server. Two ways:

**A. No downtime (recommended if the DNS is in Route 53):** get the certificate with a DNS challenge *before*
switching, using the Route 53 plugin so renewals stay automatic:

```sh
sudo apt install -y python3-certbot-dns-route53   # needs an IAM role/user allowed to change that hosted zone's TXT records
sudo certbot certonly --dns-route53 -d www.savinggrace.org.au -d savinggrace.org.au \
  --deploy-hook "systemctl reload nginx"
```

**B. At switch-over:** point the DNS here (section 6), serve plain HTTP for a minute, get the certificate, then
switch to HTTPS:

```sh
sudo install -m 644 deploy/nginx/bootstrap-http.conf /etc/nginx/conf.d/savinggrace.conf
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/letsencrypt -d www.savinggrace.org.au -d savinggrace.org.au \
  --deploy-hook "systemctl reload nginx"
```

Either way certbot renews by itself (`systemctl list-timers | grep certbot`) and reloads nginx afterwards.

## 5. Turn it on

```sh
sudo install -m 644 deploy/nginx/production.conf /etc/nginx/conf.d/savinggrace.conf
sudo nginx -t && sudo systemctl reload nginx
sudo systemctl enable --now savinggrace-static-update.timer
```

What `production.conf` does:

- `http://` (both names) → `https://www.savinggrace.org.au` (301), except Let's Encrypt's renewal path.
- `https://savinggrace.org.au` → `https://www.savinggrace.org.au` (the canonical host, as on WordPress).
- Serves the site from `/srv/savinggrace-static/current` with the shared rules in `savinggrace-site.conf`:
  - pages at their WordPress addresses, with `/page` → `/page/` (301);
  - the **2,400 WordPress redirects** (old query links like `/sermons/?sermon_speaker=…`, moved pages, and old
    event/feed addresses), generated from `src/data/redirects.json` by `scripts/nginx-redirects.mjs`;
  - `/?s=` and `/?q=` → the site search; the RSS feeds at `/feed/` and `/sermons/feed/`;
  - long caching for hashed files, `no-cache` for pages, gzip;
  - security headers: Content-Security-Policy, HSTS (1 year, not subdomains), nosniff, frame and referrer policy.
- Drops requests for the bare IP or any other hostname.

Check before switching the DNS (with option A's certificate):

```sh
curl -sI --resolve www.savinggrace.org.au:443:<server-ip> https://www.savinggrace.org.au/
curl -sI --resolve www.savinggrace.org.au:443:<server-ip> "https://www.savinggrace.org.au/sermons/?sermon_speaker=wesam-saad"   # 301 to /sermons/speaker/wesam-saad/
```

## 6. Switch over from WordPress

1. A day before, lower the DNS TTL of `savinggrace.org.au` and `www` to 300 seconds.
2. Point both names' A (and AAAA, if any) records at the new server's Elastic IP.
3. Keep the WordPress server running, **untouched**, for about a month. Rolling back is pointing the DNS back.
4. In Google Search Console, submit `https://www.savinggrace.org.au/sitemap.xml` and watch the Pages and 404
   reports for a few weeks; `grep " 404 " /var/log/nginx/savinggrace-access.log` shows anything missed.

## 7. Rolling back

- **A bad build:** `sudo systemctl stop savinggrace-static-update.timer`, then
  `sudo ln -sfn /srv/savinggrace-static/releases/<previous-commit> /srv/savinggrace-static/current`. Start the
  timer again once the problem is fixed in GitHub.
- **Redirect rules:** the updater already refuses rules that fail `nginx -t` and keeps the previous ones.
- **The whole server:** point the DNS back at WordPress.

## 8. Security checks before launch

- [ ] `sudo ss -tlnp` shows only 22, 80 and 443 listening; the security group matches section 2.
- [ ] `sudo nginx -T` reviewed; `curl -sI` shows the security headers and no nginx version.
- [ ] SSL Labs (ssllabs.com/ssltest) grades the site **A**; securityheaders.com shows the headers.
- [ ] Automatic security updates are on (`unattended-upgrades`).
- [ ] GitHub organisation: **require two-factor authentication** for members; repository: Dependabot alerts and
      secret scanning on (both free for public repositories).
- [ ] Any API key ever shared outside GitHub's encrypted secrets has been rotated.
- [ ] `npm audit` on the repository (it only affects the build, never the live server).

There is no login on the public site. Admin sign-in is a GitHub account with write access to the repository
(see the main README), so no separate login service (such as Amazon Cognito) is needed.

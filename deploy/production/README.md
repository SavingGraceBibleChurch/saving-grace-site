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

This setup has been live since 18 Nov 2026. Before that it ran on staging (same nginx rules, same updater), where it
was tested: see `deploy/staging/README.md`. The release is still called `staging`, a name left over from then.

Nothing is pushed **to** the server: it pulls from the public repository. GitHub never connects to the server and
has no address, SSH key, password or AWS credentials for it. The updater only makes outbound HTTPS requests to
GitHub (`api.github.com`, and `github.com`, which hands the download to GitHub's file servers), so the server
needs no inbound access other than the website itself.

What the server trusts is the repository: anyone with write access to it can change what the site shows, as
anyone with a WordPress admin login can today. That is why the organisation should require two-factor
authentication (section 8). A build is only files: nothing in it runs on the server, and the only server setting
it can change is the redirect list, which the updater checks line by line. To release by hand instead of
automatically, leave the timer off (section 5) and run the updater yourself when you want the newest build.

The files referred to below are in this repository: `deploy/nginx/` and `deploy/production/` (and `deploy/staging/update.py`).

---

## How it was launched (18 Nov 2026)

On 18 Nov 2026, at about 15:00 Melbourne time, Yang put the prepared staging disk behind the Elastic IP 3.24.78.170.
www.savinggrace.org.au went live on the new site with no DNS change. The WordPress server is kept for about a month:
rolling back means putting it behind the Elastic IP again. The steps below are how the disk was prepared, kept for
reference.

The staging server's disk (Amazon Linux 2023, x86_64, UEFI boot) already has the site, its updater, the nginx rules
and the 452 old WordPress files. It becomes production's disk, so the production instance keeps its address
(3.24.78.170) and **the DNS does not change**. The site uses the purchased Sectigo certificate.

`deploy/production/switch-to-production.sh` switches the disk from staging to production, and back. It was tested
on staging on 18 Nov 2026 with a throwaway certificate: `check` → `apply` → its 10 HTTPS tests passed (including no
noindex header, HSTS, old links and old files) → the updater reloaded the production nginx → `rollback` restored
staging.

1. **Before the day.**
   - Bring the content up to date in the admin (anything added to WordPress since 16 Nov).
   - Confirm 3.24.78.170 is an **Elastic IP**: stopping an instance without one changes its address.
   - Confirm the production instance is x86 (not Graviton) and a type that boots UEFI, such as t3, t3a or m5.
2. **Certificate onto the staging disk.** Copy it from the WordPress server (Bitnami keeps it in
   `/opt/bitnami/nginx/conf/bitnami/certs/`) straight to the staging server, never by email:
   - `/etc/nginx/ssl/savinggrace-fullchain.crt`: the certificate followed by Sectigo's intermediate certificates;
   - `/etc/nginx/ssl/savinggrace.key`: the key, owned by root, mode 600.

   If the certificate is renewed with a new key before the switch, as recommended, use the new files.
3. **Check, on the staging server:**
   ```sh
   curl -L https://github.com/SavingGraceBibleChurch/saving-grace-site/archive/refs/heads/main.tar.gz | tar -xz -C /tmp
   sudo bash /tmp/saving-grace-site-main/deploy/production/switch-to-production.sh check
   ```
   It changes nothing. It checks that the key matches the certificate, that the certificate covers both names and
   chains to a trusted root, and that it is valid for more than 14 days. It also checks the build, the redirect
   rules and the old files are in place, and that the production configuration passes `nginx -t`. Fix anything it
   reports, then run it again.
4. **Switch:** `sudo bash /tmp/saving-grace-site-main/deploy/production/switch-to-production.sh apply`. This:
   - turns off staging's nginx and the port 8080 proxy;
   - starts the system nginx on 80 and 443 with `production.conf`;
   - points the updater at it;
   - tests the site over HTTPS on the server itself.

   If any test fails, it puts staging back by itself.
5. **Swap the disks** (AWS console):
   1. Snapshot both root volumes.
   2. Stop both instances.
   3. Detach the production instance's root volume and **keep it**: it is the rollback.
   4. Attach the staging volume to the production instance as its root device (the same device name), then start
      it. nginx and the updater start by themselves.
6. **After the start.**
   - Open https://www.savinggrace.org.au and run `check` once more.
   - SSH is now `ec2-user` with the staging key. The host key changes, which is expected; cloud-init may also add
     the production instance's own key pair.
   - Security group: 80 and 443 from anywhere, 22 from your addresses only, nothing else (close 3307 and 8080).
7. **Rolling back:** stop the instance and put the WordPress root volume back. The DNS was never changed.
   (`switch-to-production.sh rollback` only turns the disk back into staging.)

The sections below describe setting up a **fresh** server instead, and remain as the reference for every
setting. On a fresh server, the certificate paths in `production.conf` are the same, whichever certificate is used.

## 1. The server

- **Ubuntu 24.04 LTS** on the smallest EC2 or Lightsail size is plenty (the site is ~85 MB per build; give it a
  10 GB disk). Amazon Linux 2023 also works; the commands differ slightly (`dnf` instead of `apt`, nginx runs
  as `nginx` instead of `www-data`, and there is no `sites-enabled`). `production.conf` uses `http2 on;`, which
  needs nginx 1.25.1 or newer: Amazon Linux 2023 has 1.30, but Ubuntu 24.04 has 1.24, so there either install
  nginx from nginx.org's own packages or change each `listen 443 ssl;` + `http2 on;` back to `listen 443 ssl http2;`.
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
  deploy/nginx/savinggrace-tls.conf deploy/nginx/savinggrace-blocking-maps.conf \
  deploy/nginx/savinggrace-ip-deny.conf /etc/nginx/snippets/
sudo install -m 755 deploy/staging/update.py /srv/savinggrace-static/update.py
sudo install -m 644 deploy/production/savinggrace-static-update.service \
  deploy/production/savinggrace-static-update.timer /etc/systemd/system/

# Fetch the current build once, and put its redirect rules in place.
sudo python3 -I /srv/savinggrace-static/update.py
sudo install -m 644 /srv/savinggrace-static/current/_nginx/redirect-maps.conf /srv/savinggrace-static/nginx/
```

Then, from a computer with `private/uploads/` (made by `scripts/collect_uploads.py` from the WordPress backup),
upload the old WordPress files that live links point at: 452 files, 1.1 GB, mostly sermon MP3s and images. They go
to `/srv/savinggrace-static/uploads`, a permanent folder that builds never touch, and nginx serves them at their
original `/wp-content/uploads/` addresses:

```sh
deploy/upload-old-files.sh <user>@<server> -i <ssh-key>
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

**C. Keep the WordPress server's current certificate for the switch-over** (no gap, no DNS access needed): copy
its certificate (with the chain) and key from the WordPress server **straight to this server**, never by email,
into `/etc/nginx/ssl/` with the key readable by root only (`chmod 600`). Point `ssl_certificate` and
`ssl_certificate_key` in `production.conf` at them, switch the DNS, run B's `certbot` command (port 80 already
serves `/.well-known/acme-challenge/`), then put the Let's Encrypt paths back and delete the copied key.

Either way certbot renews by itself (`systemctl list-timers | grep certbot`) and reloads nginx afterwards.
`production.conf` reads the certificate from `/etc/nginx/ssl/`, so with Let's Encrypt link it there once:
`sudo mkdir -p /etc/nginx/ssl && sudo ln -s /etc/letsencrypt/live/www.savinggrace.org.au/fullchain.pem /etc/nginx/ssl/savinggrace-fullchain.crt && sudo ln -s /etc/letsencrypt/live/www.savinggrace.org.au/privkey.pem /etc/nginx/ssl/savinggrace.key`.

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
  - security headers: Content-Security-Policy, HSTS (1 year, not subdomains), nosniff, frame and referrer policy;
  - refuses (403) the bots, WordPress/PHP probes and addresses that the WordPress server blocked
    (`savinggrace-blocking-maps.conf`, `savinggrace-ip-deny.conf`; see section 9).
- Drops requests for the bare IP or any other hostname.

Check before switching the DNS (with option A's certificate). The bot rules refuse curl's own user agent, so these
send a browser's:

```sh
curl -sI -A "Mozilla/5.0" --resolve www.savinggrace.org.au:443:<server-ip> https://www.savinggrace.org.au/
curl -sI -A "Mozilla/5.0" --resolve www.savinggrace.org.au:443:<server-ip> "https://www.savinggrace.org.au/sermons/?sermon_speaker=wesam-saad"   # 301 to /sermons/speaker/wesam-saad/
```

To release by hand instead of automatically, skip `enable --now` for the timer and run
`sudo python3 -I /srv/savinggrace-static/update.py --nginx-unit nginx` whenever you want the newest build.

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
- [ ] `sudo nginx -T` reviewed; `curl -sI -A "Mozilla/5.0"` shows the security headers and no nginx version.
- [ ] SSL Labs (ssllabs.com/ssltest) grades the site **A**; securityheaders.com shows the headers.
- [ ] Automatic security updates are on (`unattended-upgrades`).
- [ ] GitHub organisation: **require two-factor authentication** for members; repository: Dependabot alerts and
      secret scanning on (both free for public repositories).
- [ ] Any API key ever shared outside GitHub's encrypted secrets has been rotated.
- [ ] `npm audit` on the repository (it only affects the build, never the live server).

There is no login on the public site. Admin sign-in is a GitHub account with write access to the repository
(see the main README), so no separate login service (such as Amazon Cognito) is needed.

## 9. Rules carried over from the WordPress server

Yang's nginx files from the WordPress server (November 2026), and what became of each here:

| WordPress server | Here |
| --- | --- |
| `bot-blocking.conf`: the bad-bot user-agent list | Kept, in `savinggrace-blocking-maps.conf` (403), except the AI search bots (OAI-SearchBot, ChatGPT-User, PerplexityBot, Applebot). As agreed with Yang, these are allowed so the church appears in ChatGPT, Perplexity and Siri answers, but each bot is held to 5 requests a second (bursts of 30, then 429). AI training crawlers stay refused, and robots.txt opts out of Apple's AI training (`Applebot-Extended`). The list also refuses curl, so test with `curl -A "Mozilla/5.0"`. |
| `bot-blocking.conf`: the bad-request list | Kept, in the same file, less two patterns that match this site's own addresses: `https?:/(?!/)` would refuse the `/https:/…` redirect for malformed self-links that Search Console reported, and `union.*select` could refuse a sermon whose address has "union" then "select" in it. |
| `ip-blocking.conf` and `ip-blocking-safe.conf` (the same list), and the eight `deny` lines in `nginx.conf` | Kept, in `savinggrace-ip-deny.conf`. |
| The rate-limit zones `bot_zone`, `api_zone` (`bot-blocking.conf`), `event_zone` and `event_feed_zone` (`event-protection.conf`) | Left out. They protected the WordPress login, its API, and the events calendar and its feeds, which ran PHP and MySQL on every request. Here every page is a file on disk, and a per-address limit would risk refusing a room of people on the church Wi-Fi, who all share one address. |
| `nginx.conf`: the `stream` block that forwards port 3307 to MySQL | Left out: the site has no database. |
| `nginx.conf`: TLS 1.0 and 1.1 | Left out: `savinggrace-tls.conf` allows TLS 1.2 and 1.3 only. |
| `nginx.conf`: Bitnami paths and user, 4 GB upload limit, `stub_status` at `/status` | Left out: specific to the Bitnami WordPress stack. |
| `nginx.conf`: gzip, `server_tokens off`, `X-Frame-Options` | Already here (`savinggrace-site.conf`, `savinggrace-headers.conf`). |
| `default-https-server-block.conf` with `bitnami/certs/server.crt` and `server.key` | Not needed: `production.conf` has its own catch-all server, and the site gets its own certificate (section 4). |

Staging ran the same files before the launch. There every request reached nginx from 127.0.0.1 (through the port
8080 proxy), so only the user-agent and request rules took effect; in production the address rules apply too.

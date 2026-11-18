#!/bin/bash
# Turns the staging disk (Amazon Linux 2023) into the production web server for www.savinggrace.org.au, or back.
# Run with sudo from a copy of this repository's deploy/ folder on the server (deploy/production/README.md, "Switch").
#
#   sudo bash deploy/production/switch-to-production.sh check      # changes nothing; says what is missing
#   sudo bash deploy/production/switch-to-production.sh apply      # switches to production, then tests it
#   sudo bash deploy/production/switch-to-production.sh rollback   # back to staging (127.0.0.1:8084 behind port 8080)
#
# Production: the system nginx.service serves 80 and 443 with /etc/nginx/conf.d/savinggrace.conf
# (deploy/nginx/production.conf) and the certificate in /etc/nginx/ssl/; the staging nginx and the port 8080 proxy
# are switched off; the updater reloads the system nginx. "apply" puts staging back by itself if its tests fail.
# --allow-test-cert (testing only): accept a self-signed certificate that does not cover the real names.
set -uo pipefail

MODE="${1:-check}"
TEST_CERT=0
[ "${2:-}" = "--allow-test-cert" ] && TEST_CERT=1
DEPLOY="$(cd "$(dirname "$0")/.." && pwd)"
CRT=/etc/nginx/ssl/savinggrace-fullchain.crt
KEY=/etc/nginx/ssl/savinggrace.key
SNIPPETS="savinggrace-headers.conf savinggrace-site.conf savinggrace-tls.conf savinggrace-blocking-maps.conf savinggrace-ip-deny.conf"
STAGING_UNITS="savinggrace-staging-public.socket savinggrace-staging-public.service savinggrace-nginx.service"
BACKUPS=/root/savinggrace-backups
problems=0
ok() { echo "  ok    $*"; }
warn() { echo "  WARN  $*"; }
bad() { echo "  FAIL  $*"; problems=$((problems + 1)); }

[ "$(id -u)" = 0 ] || { echo "Run with sudo."; exit 1; }
for f in $SNIPPETS; do [ -f "$DEPLOY/nginx/$f" ] || { echo "Missing $DEPLOY/nginx/$f: run this from the repository's deploy/ folder."; exit 1; }; done

pubkey_hash() { openssl "$@" -outform DER 2>/dev/null | sha256sum | cut -d' ' -f1; }

check() {
  problems=0
  echo "Certificate ($CRT, $KEY):"
  if [ ! -f "$CRT" ] || [ ! -f "$KEY" ]; then
    bad "certificate or key missing: copy them from the WordPress server (README, Switch step 2)"
  else
    [ "$(stat -c '%U %a' "$KEY")" = "root 600" ] || [ "$(stat -c '%U %a' "$KEY")" = "root 400" ] \
      && ok "key readable by root only" || bad "key must be owned by root with mode 600: sudo chown root: $KEY && sudo chmod 600 $KEY"
    if [ "$(openssl x509 -in "$CRT" -noout -pubkey 2>/dev/null | pubkey_hash pkey -pubin)" = "$(pubkey_hash pkey -in "$KEY" -pubout)" ]; then
      ok "key matches the certificate"
    else
      bad "key does not match the certificate"
    fi
    echo "        $(openssl x509 -in "$CRT" -noout -subject -enddate 2>/dev/null | tr '\n' ' ')"
    for name in www.savinggrace.org.au savinggrace.org.au; do
      if openssl x509 -in "$CRT" -noout -checkhost "$name" 2>/dev/null | grep -q "does match"; then ok "covers $name"
      elif [ $TEST_CERT = 1 ]; then warn "does not cover $name (test certificate allowed)"
      elif [ "$name" = savinggrace.org.au ]; then warn "does not cover $name: https://$name will show a certificate error instead of redirecting to www"
      else bad "does not cover $name"; fi
    done
    if ! openssl x509 -in "$CRT" -noout -checkend 0 >/dev/null 2>&1; then bad "certificate has expired"
    elif ! openssl x509 -in "$CRT" -noout -checkend $((14 * 86400)) >/dev/null 2>&1; then warn "certificate expires within 14 days"
    else ok "valid for more than 14 days"; fi
    n=$(grep -c "BEGIN CERTIFICATE" "$CRT")
    if openssl x509 -in "$CRT" 2>/dev/null | openssl verify -untrusted "$CRT" >/dev/null 2>&1; then ok "chain is trusted ($n certificates in the file)"
    elif [ $TEST_CERT = 1 ]; then warn "chain not trusted (test certificate allowed)"
    else bad "chain not trusted: the file needs the certificate followed by Sectigo's intermediate certificates ($n in the file now)"; fi
  fi

  echo "Site:"
  [ -f /srv/savinggrace-static/current/index.html ] && ok "build $(basename "$(readlink -f /srv/savinggrace-static/current)" | cut -c1-12) in place" || bad "no build in /srv/savinggrace-static/current"
  [ -f /srv/savinggrace-static/nginx/redirect-maps.conf ] && ok "redirect rules installed" || bad "no /srv/savinggrace-static/nginx/redirect-maps.conf"
  n=$(find /srv/savinggrace-static/uploads -type f 2>/dev/null | wc -l)
  [ "$n" -ge 452 ] && ok "$n old WordPress files in /srv/savinggrace-static/uploads" || warn "only $n old WordPress files in /srv/savinggrace-static/uploads (452 expected; deploy/upload-old-files.sh)"

  echo "nginx:"
  local t; t=$(mktemp -d)
  for f in $SNIPPETS; do sed "s#/etc/nginx/snippets/#$t/#g" "$DEPLOY/nginx/$f" > "$t/$f"; done
  sed "s#/etc/nginx/snippets/#$t/#g" "$DEPLOY/nginx/production.conf" > "$t/savinggrace.conf"
  sed -e "s#include /etc/nginx/conf.d/\*.conf;#include $t/savinggrace.conf;#" -e "s#^pid .*#pid $t/nginx.pid;#" /etc/nginx/nginx.conf > "$t/nginx.conf"
  if out=$(nginx -t -q -c "$t/nginx.conf" -e "$t/error.log" 2>&1); then
    ok "the production configuration passes nginx -t"
    [ -n "$out" ] && echo "        $out"
  else
    bad "nginx -t: $out"
  fi
  rm -rf "$t"
  echo "$problems problem(s)."
  return $problems
}

verify() {
  echo "Testing production on this server:"
  local k="" fails=0 out
  [ $TEST_CERT = 1 ] && k="-k"
  t() { # description, expected, curl arguments...
    local name=$1 want=$2; shift 2
    out=$(curl -s -o /dev/null -m 10 $k -w '%{http_code} %{redirect_url}' "$@" 2>/dev/null)
    case "$out" in "$want"*) echo "  ok    $name: $out" ;; *) echo "  FAIL  $name: '$out' (expected $want)"; fails=$((fails + 1)) ;; esac
  }
  local W="--resolve www.savinggrace.org.au:443:127.0.0.1" A="--resolve savinggrace.org.au:443:127.0.0.1" B="Mozilla/5.0"
  t "https://www home page" "200" $W -A "$B" https://www.savinggrace.org.au/
  t "https://www sermons" "200" $W -A "$B" https://www.savinggrace.org.au/sermons/
  t "old speaker link" "301 https://www.savinggrace.org.au/sermons/speaker/wesam-saad/" $W -A "$B" "https://www.savinggrace.org.au/sermons/?sermon_speaker=wesam-saad"
  t "old WordPress file" "200" $W -A "$B" "https://www.savinggrace.org.au/wp-content/uploads/2017/02/SavingGraceBC-Doctrinal-Statement.pdf"
  t "curl's own user agent refused" "403" $W https://www.savinggrace.org.au/
  t "https://savinggrace.org.au to www" "301 https://www.savinggrace.org.au/about/" $A -A "$B" https://savinggrace.org.au/about/
  t "http://www to https" "301 https://www.savinggrace.org.au/" -A "$B" -H "Host: www.savinggrace.org.au" http://127.0.0.1/
  t "unknown name dropped" "000" -A "$B" -H "Host: example.com" http://127.0.0.1/
  local h; h=$(curl -s -D - -o /dev/null -m 10 $k $W -A "$B" https://www.savinggrace.org.au/ | tr -d '\r')
  echo "$h" | grep -qi '^strict-transport-security: max-age=31536000' && echo "  ok    HSTS header sent" || { echo "  FAIL  no HSTS header"; fails=$((fails + 1)); }
  echo "$h" | grep -qi '^x-robots-tag:.*noindex' && { echo "  FAIL  staging's noindex header is still sent"; fails=$((fails + 1)); } || echo "  ok    no noindex header"
  echo "$fails test(s) failed."
  return $fails
}

to_staging() {
  local b=$1
  systemctl disable --now nginx.service 2>&1 | grep -v '^Removed' || true
  rm -f /etc/nginx/conf.d/savinggrace.conf
  for f in "$b"/snippets/*; do [ -e "$f" ] && cp -a "$f" /etc/nginx/snippets/; done
  [ -f "$b/had-no-tls-snippet" ] && rm -f /etc/nginx/snippets/savinggrace-tls.conf
  cp -a "$b/savinggrace-static-update.service" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now $STAGING_UNITS 2>&1 | grep -v '^Created' || true
  systemctl restart savinggrace-static-update.timer
  sleep 1
  echo "Staging: $(curl -s -o /dev/null -m 10 -A Mozilla/5.0 -w '%{http_code}' http://127.0.0.1:8084/) from its nginx; units: $(systemctl is-active $STAGING_UNITS | tr '\n' ' ')"
}

case "$MODE" in
  check)
    check; exit $? ;;
  apply)
    [ -f /etc/nginx/conf.d/savinggrace.conf ] && { echo "Already switched to production (/etc/nginx/conf.d/savinggrace.conf exists)."; exit 1; }
    check || { echo "Not switching: fix the problems above first."; exit 1; }
    b="$BACKUPS/to-production-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$b/snippets"
    cp -a /etc/nginx/snippets/savinggrace-* "$b/snippets/"
    [ -f /etc/nginx/snippets/savinggrace-tls.conf ] || touch "$b/had-no-tls-snippet"
    cp -a /etc/systemd/system/savinggrace-static-update.service "$b/"
    echo "Staging settings saved in $b."
    mkdir -p /var/www/ssl-validation /var/www/letsencrypt
    for f in $SNIPPETS; do install -m 644 "$DEPLOY/nginx/$f" /etc/nginx/snippets/; done
    install -m 644 "$DEPLOY/nginx/production.conf" /etc/nginx/conf.d/savinggrace.conf
    if ! nginx -t -q; then
      echo "nginx refused the production configuration; putting staging back."
      to_staging "$b"; exit 1
    fi
    systemctl stop savinggrace-static-update.timer
    install -m 644 "$DEPLOY/production/savinggrace-static-update.service" /etc/systemd/system/
    systemctl daemon-reload
    systemctl disable --now $STAGING_UNITS 2>&1 | grep -v '^Removed' || true
    systemctl enable --now nginx.service 2>&1 | grep -v '^Created' || true
    systemctl start savinggrace-static-update.timer
    sleep 1
    if verify; then
      echo "Production is running: nginx on 80 and 443, updates every 2 minutes. To undo: $0 rollback"
    else
      echo "Production tests failed; putting staging back."
      to_staging "$b"; exit 1
    fi ;;
  rollback)
    b=$(ls -d "$BACKUPS"/to-production-* 2>/dev/null | sort | tail -1)
    [ -n "$b" ] || { echo "No saved staging settings in $BACKUPS."; exit 1; }
    echo "Putting staging back from $b."
    to_staging "$b"
    echo "Note: port 8080 listens on the private address staging had; on a different instance, edit"
    echo "/etc/systemd/system/savinggrace-staging-public.socket (ListenStream) to the new private address." ;;
  *)
    echo "Usage: $0 check|apply|rollback [--allow-test-cert]"; exit 2 ;;
esac

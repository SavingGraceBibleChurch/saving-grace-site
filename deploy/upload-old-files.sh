#!/bin/bash
# Uploads the old WordPress files that live links point at (private/uploads/wp-content/uploads/..., made by
# scripts/collect_uploads.py) to the server's permanent folder /srv/savinggrace-static/uploads, where nginx
# serves them at their original /wp-content/uploads/ addresses. Builds never touch that folder.
# Safe to run again: existing files are overwritten with the same content, nothing is deleted.
#
#   deploy/upload-old-files.sh <ssh-user@host> [ssh options...]
#   e.g. deploy/upload-old-files.sh ec2-user@my-server -i ~/key.pem
set -euo pipefail
HOST="$1"; shift
SRC="$(cd "$(dirname "$0")/.." && pwd)/private/uploads"
test -d "$SRC/wp-content/uploads" || { echo "No $SRC/wp-content/uploads: run scripts/collect_uploads.py first."; exit 1; }
echo "Uploading $(find "$SRC/wp-content/uploads" -type f | wc -l) files ($(du -sh "$SRC" | cut -f1)) to $HOST..."
tar -C "$SRC" -cf - wp-content | ssh "$@" "$HOST" '
  set -e
  sudo mkdir -p /srv/savinggrace-static/uploads
  sudo tar -C /srv/savinggrace-static/uploads --no-same-owner --no-same-permissions -xf -
  sudo find /srv/savinggrace-static/uploads -type d -exec chmod 755 {} +
  sudo find /srv/savinggrace-static/uploads -type f -exec chmod 644 {} +
  echo "On the server: $(sudo find /srv/savinggrace-static/uploads -type f | wc -l) files, $(sudo du -sh /srv/savinggrace-static/uploads | cut -f1)"'

#!/usr/bin/env python3
"""Keeps public staging on the latest successful build of main.

Run every 2 minutes by savinggrace-static-update.timer. It reads latest.json from the "staging" release of
the public GitHub repository (published by .github/workflows/site.yml), downloads that build, checks its
SHA-256, unpacks it into /srv/savinggrace-static/releases/<commit> and points `current` at it in one atomic
step. The three newest builds are kept. No credentials are needed or stored: the repository is public.

To hold staging on an older build: stop the timer, then point `current` at that release:
  sudo systemctl stop savinggrace-static-update.timer
  sudo ln -sfn /srv/savinggrace-static/releases/<commit> /srv/savinggrace-static/current
"""
import hashlib
import json
import os
import re
import shutil
import sys
import tarfile
import tempfile
import urllib.error
import urllib.request

REPO = "samuelsaad/saving-grace-site"
BASE = "/srv/savinggrace-static"
RELEASES = os.path.join(BASE, "releases")
CURRENT = os.path.join(BASE, "current")
KEEP = 3
MAX_BYTES = 300 * 1024 * 1024


def get(url, accept="application/octet-stream"):
    request = urllib.request.Request(url, headers={"User-Agent": "savinggrace-staging-updater", "Accept": accept})
    return urllib.request.urlopen(request, timeout=60)


def switch(target):
    link = CURRENT + ".new"
    if os.path.lexists(link):
        os.remove(link)
    os.symlink(target, link)
    os.replace(link, CURRENT)


def prune(current):
    builds = sorted((os.path.join(RELEASES, d) for d in os.listdir(RELEASES) if not d.startswith(".")), key=os.path.getmtime, reverse=True)
    for old in builds[KEEP:]:
        if os.path.realpath(old) != current:
            shutil.rmtree(old, ignore_errors=True)


def main():
    if not hasattr(tarfile, "data_filter"):
        sys.exit("This Python cannot extract archives safely (needs the tarfile data filter).")
    try:
        release = json.load(get(f"https://api.github.com/repos/{REPO}/releases/tags/staging", "application/vnd.github+json"))
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return print("No staging release yet.")
        if error.code in (403, 429):
            return print("GitHub rate limit reached; will try again later.")
        raise
    assets = {a["name"]: a["browser_download_url"] for a in release.get("assets", [])}
    if "latest.json" not in assets:
        return print("The staging release has no build yet.")
    latest = json.load(get(assets["latest.json"]))
    commit, name, expected = latest.get("commit", ""), latest.get("file", ""), latest.get("sha256", "")
    if not re.fullmatch(r"[0-9a-f]{40}", commit) or name != f"site-{commit}.tar.gz" or not re.fullmatch(r"[0-9a-f]{64}", expected):
        sys.exit("latest.json is malformed; staging left as it is.")
    if name not in assets:
        return print(f"Build {commit[:12]} is not uploaded yet.")

    target = os.path.join(RELEASES, commit)
    current = os.path.realpath(CURRENT)
    if current == target:
        return
    if os.path.isfile(os.path.join(target, "index.html")):
        switch(target)
        return print(f"Switched back to {commit[:12]}.")

    os.makedirs(RELEASES, exist_ok=True)
    work = tempfile.mkdtemp(prefix=".incoming-", dir=RELEASES)
    try:
        archive = os.path.join(work, "site.tar.gz")
        digest, size = hashlib.sha256(), 0
        with get(assets[name]) as response, open(archive, "wb") as out:
            while chunk := response.read(1 << 20):
                size += len(chunk)
                if size > MAX_BYTES:
                    sys.exit("Build is unexpectedly large; staging left as it is.")
                digest.update(chunk)
                out.write(chunk)
        if digest.hexdigest() != expected:
            sys.exit(f"SHA-256 mismatch for {commit[:12]}; staging left as it is.")
        site = os.path.join(work, "site")
        with tarfile.open(archive, "r:gz") as tar:
            tar.extractall(site, filter="data")
        if not os.path.isfile(os.path.join(site, "index.html")) or not os.path.isfile(os.path.join(site, "404.html")):
            sys.exit(f"Build {commit[:12]} has no home or 404 page; staging left as it is.")
        for root, dirs, files in os.walk(site):
            for d in dirs:
                os.chmod(os.path.join(root, d), 0o755)
            for f in files:
                os.chmod(os.path.join(root, f), 0o644)
        os.chmod(site, 0o755)
        os.rename(site, target)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    switch(target)
    prune(target)
    print(f"Staging now serves {commit[:12]} (built {latest.get('builtAt', '?')}).")


if __name__ == "__main__":
    main()

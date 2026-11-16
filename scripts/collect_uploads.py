"""Copies the WordPress uploads that live URLs point at into private/uploads/.

These files (sermon MP3s, images, documents) are too large for Git. They are
synced to the web host at their original /wp-content/uploads/ paths during
deployment so old links, Google Images and podcast apps keep working.

Run: python scripts/collect_uploads.py <path to the WordPress backup .zip>
"""
import json
import sys
import zipfile
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "private" / "uploads"
backup = Path(sys.argv[1])

capture = json.loads((ROOT / "private" / "inputs" / "live-capture.json").read_text(encoding="utf-8"))
wanted = {unquote(r["path"].split("?")[0]) for r in capture if r["path"].startswith("/wp-content/uploads/")}

with zipfile.ZipFile(backup) as archive:
    members = {}
    for name in archive.namelist():
        if name.startswith("files/wp-content/uploads/") and not name.endswith("/"):
            members["/" + name[len("files/"):].replace("//", "/")] = name
    found = missing = size = 0
    for path in sorted(wanted):
        member = members.get(path)
        if not member:
            missing += 1
            print("not in backup:", path)
            continue
        target = OUT / path.lstrip("/")
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.stat().st_size != archive.getinfo(member).file_size:
            with archive.open(member) as src, open(target, "wb") as dst:
                dst.write(src.read())
        found += 1
        size += archive.getinfo(member).file_size
print(f"{found} files ({size / 1e6:.0f} MB) in private/uploads, {missing} referenced files not in the backup")

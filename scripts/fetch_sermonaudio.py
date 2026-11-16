"""Fetches SermonAudio metadata and transcripts for sermons that have no description yet.

The API key is read from a local file outside the repository and is never printed or saved.
Raw responses go to private/sermonaudio/ (gitignored).

Run: python scripts/fetch_sermonaudio.py <path to api-key.txt>
"""
import json
import sys
import time
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "private" / "sermonaudio"
API = "https://api.sermonaudio.com/v2/node/sermons/"

key = Path(sys.argv[1]).read_text(encoding="utf-8").strip()
sermons = json.loads((ROOT / "src/data/sermons.json").read_text(encoding="utf-8"))
extras = json.loads((ROOT / "src/data/sermon-extras.json").read_text(encoding="utf-8"))
targets = [s for s in sermons if not extras.get(str(s["wpId"]), {}).get("summary")]
OUT.mkdir(parents=True, exist_ok=True)


def get(url, headers=None):
    request = urllib.request.Request(url, headers={"User-Agent": "church-website-build", **(headers or {})})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


report = {"targets": len(targets), "noSermonAudioId": [], "fetched": 0, "transcripts": 0, "noTranscript": [], "errors": []}
for sermon in targets:
    wp, said = sermon["wpId"], sermon["sermonAudioId"]
    if not said:
        report["noSermonAudioId"].append(f"{sermon['date']} {sermon['title']}")
        continue
    meta_path = OUT / f"{wp}.json"
    try:
        if not meta_path.exists():
            meta_path.write_bytes(get(API + said, {"X-Api-Key": key}))
            time.sleep(1)
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        report["fetched"] += 1
        transcript = (meta.get("transcript") or {})
        url = transcript.get("downloadURL")
        if not url:
            report["noTranscript"].append(f"{sermon['date']} {sermon['title']}")
            continue
        if urlsplit(url).hostname != "cloud.sermonaudio.com":
            raise ValueError("unexpected transcript host")
        text_path = OUT / f"{wp}.transcript"
        if not text_path.exists():
            text_path.write_bytes(get(url))
            time.sleep(1)
        report["transcripts"] += 1
    except Exception as error:  # report and carry on with the rest
        report["errors"].append(f"{sermon['date']} {sermon['title']}: {type(error).__name__} {str(error)[:120]}")

print(json.dumps(report, indent=1))

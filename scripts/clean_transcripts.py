"""Builds src/data/sermon-transcripts/<wpId>.txt, one machine transcript per sermon.

Sources, best first:
  private/sermonaudio/<wpId>.transcript  SermonAudio's transcript (mostly punctuated), from scripts/fetch_sermonaudio.py
  private/db-transcripts/<wpId>.txt      YouTube caption text from the local database, from scripts/export_local_content.py

The text is joined, spacing and capitals are tidied, caption tags such as [Music] are dropped and it is
grouped into paragraphs. Words are never added, removed or reordered. A SermonAudio transcript whose
recording title does not match the sermon is treated as a wrong recording and skipped in favour of the
captions, and identical transcripts on two sermons are reported; both point at a wrong audio embed.

Also writes src/data/sermon-transcript-sources.json and adds missing lengths to src/data/sermon-durations.json.
Transcripts saved in the admin (source "church") are always kept as they are.
One-time migration: new sermons' transcripts are fetched by scripts/fetch_new_transcripts.mjs in CI.
Run: python scripts/clean_transcripts.py --overwrite-admin-edits
"""
import hashlib
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from migration_guard import require_overwrite_flag  # noqa: E402

require_overwrite_flag("every machine transcript")
ROOT = Path(__file__).resolve().parent.parent
SA = ROOT / "private" / "sermonaudio"
DB = ROOT / "private" / "db-transcripts"
OUT = ROOT / "src" / "data" / "sermon-transcripts"
OUT.mkdir(parents=True, exist_ok=True)

NAMES = {"god": "God", "jesus": "Jesus", "christ": "Christ", "i": "I", "i'm": "I'm", "i've": "I've", "i'll": "I'll", "i'd": "I'd"}


def clean(text: str) -> str:
    text = re.sub(r"\[(?:music|applause|laughter|inaudible|__)[^\]]*\]", " ", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([,.;:?!])", r"\1", text)
    text = re.sub(r"\b(god|jesus|christ|i|i'm|i've|i'll|i'd)\b", lambda m: NAMES[m.group(1)], text)
    sentences = re.split(r"(?<=[.?!])\s+", text)
    sentences = [s[:1].upper() + s[1:] for s in sentences if s]
    paragraphs, current, words = [], [], 0
    for sentence in sentences:
        current.append(sentence)
        words += len(sentence.split())
        if words >= 110:
            paragraphs.append(" ".join(current))
            current, words = [], 0
    if current:
        paragraphs.append(" ".join(current))
    return "\n\n".join(paragraphs) + "\n"


def title_match(meta_path: Path, title: str) -> float:
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    norm = lambda t: re.sub(r"[^\w ]", "", (t or "").lower()).strip()
    return SequenceMatcher(None, norm(meta.get("fullTitle") or meta.get("displayTitle")), norm(title)).ratio()


sermons = json.loads((ROOT / "src/data/sermons.json").read_text(encoding="utf-8"))
SOURCES = ROOT / "src" / "data" / "sermon-transcript-sources.json"
previous = json.loads(SOURCES.read_text(encoding="utf-8")) if SOURCES.exists() else {}
church = {wp for wp, source in previous.items() if source == "church"}
for old in OUT.glob("*.txt"):
    if old.stem not in church:
        old.unlink()

sources, durations, mismatched, seen = {wp: "church" for wp in church}, {}, [], {}
for sermon in sermons:
    wp = str(sermon["wpId"])
    if wp in church:
        continue
    sa_path, db_path = SA / f"{wp}.transcript", DB / f"{wp}.txt"
    sa = sa_path.read_text(encoding="utf-8") if sa_path.exists() else ""
    db = db_path.read_text(encoding="utf-8") if db_path.exists() else ""
    if sa and title_match(SA / f"{wp}.json", sermon["title"]) < 0.6:
        mismatched.append(f"{sermon['date']} {sermon['title']}: SermonAudio recording has another title")
        sa = ""
    text, source = (sa, "sermonaudio") if sa.strip() else (db, "captions") if db.strip() else ("", None)
    if not source:
        continue
    digest = hashlib.sha256(re.sub(r"\W", "", text.lower()).encode()).hexdigest()
    if digest in seen:
        mismatched.append(f"{sermon['date']} {sermon['title']} duplicates {seen[digest]}")
        continue
    seen[digest] = f"{sermon['date']} {sermon['title']}"
    (OUT / f"{wp}.txt").write_text(clean(text), encoding="utf-8")
    sources[wp] = source
    meta_path = SA / f"{wp}.json"
    if source == "sermonaudio" and meta_path.exists():
        seconds = json.loads(meta_path.read_text(encoding="utf-8")).get("audioDurationSeconds")
        if seconds:
            durations[wp] = int(seconds)

data = ROOT / "src" / "data"
(data / "sermon-transcript-sources.json").write_text(json.dumps(dict(sorted(sources.items(), key=lambda kv: int(kv[0]))), indent=1) + "\n", encoding="utf-8")
existing = json.loads((data / "sermon-durations.json").read_text(encoding="utf-8"))
merged = {**durations, **existing}  # lengths already on record win
(data / "sermon-durations.json").write_text(json.dumps(dict(sorted(merged.items(), key=lambda kv: int(kv[0]))), indent=1) + "\n", encoding="utf-8")
print(json.dumps({
    "sermons": len(sermons), "transcripts": len(sources), "fromSermonAudio": sum(1 for s in sources.values() if s == "sermonaudio"),
    "fromCaptions": sum(1 for s in sources.values() if s == "captions"), "durations": len(durations),
    "withoutTranscript": [f"{s['date']} {s['title']}" for s in sermons if str(s["wpId"]) not in sources],
    "skippedAsWrongRecording": mismatched,
}, indent=1))

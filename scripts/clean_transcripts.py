"""Cleans SermonAudio transcripts in private/sermonaudio/ into src/data/sermon-transcripts/<wpId>.txt.

SermonAudio's machine transcripts are mostly punctuated but arrive as short wrapped
caption lines. This joins the lines, tidies spacing and capitals, and groups the text
into paragraphs. Words are never added, removed or reordered.

Run: python scripts/clean_transcripts.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "private" / "sermonaudio"
OUT = ROOT / "src" / "data" / "sermon-transcripts"
OUT.mkdir(parents=True, exist_ok=True)

NAMES = {"god": "God", "jesus": "Jesus", "christ": "Christ", "i": "I", "i'm": "I'm", "i've": "I've", "i'll": "I'll", "i'd": "I'd"}


def clean(text: str) -> str:
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


durations = {}
for raw in sorted(RAW.glob("*.transcript")):
    wp = raw.stem
    (OUT / f"{wp}.txt").write_text(clean(raw.read_text(encoding="utf-8")), encoding="utf-8")
    meta = json.loads((RAW / f"{wp}.json").read_text(encoding="utf-8"))
    if meta.get("audioDurationSeconds"):
        durations[wp] = int(meta["audioDurationSeconds"])
(ROOT / "private" / "sermonaudio-durations.json").write_text(json.dumps(durations, indent=1), encoding="utf-8")
print(len(list(OUT.glob("*.txt"))), "transcripts cleaned;", len(durations), "durations")

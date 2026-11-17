"""Adds or replaces one sermon description in src/data/sermon-descriptions.json.

The admin is the normal way to do this; this is for scripted bulk work.
Usage: python scripts/add_description.py <wpId> <file containing the description>
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "src" / "data" / "sermon-descriptions.json"
wp, source = sys.argv[1], Path(sys.argv[2])
text = source.read_text(encoding="utf-8").strip()
data = json.loads(TARGET.read_text(encoding="utf-8")) if TARGET.exists() else {}
data[wp] = text
TARGET.write_text(json.dumps(dict(sorted(data.items(), key=lambda kv: int(kv[0]))), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(wp, len(text.split()), "words;", len(data), "descriptions saved")

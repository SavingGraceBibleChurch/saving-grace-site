"""Read-only export from the local PostgreSQL database used during the Codex project.

Writes:
  src/data/sermon-extras.json        description and recording length per sermon (keyed by WordPress ID)
  src/data/studies.json              Tuesday Night Studies courses, sections and session index
  src/data/study-content/<slug>.json description, transcript, questions and Scripture references per study
  private/db-transcripts/<wpId>.txt  caption transcripts per sermon, the fallback used by scripts/clean_transcripts.py

The connection is forced read-only and uses the standard PostgreSQL password file,
so no credential ever appears here. Run: python scripts/export_local_content.py
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data"
PSQL = os.environ.get("PSQL", r"C:\Program Files\PostgreSQL\16\bin\psql.exe")
DATABASE = "savinggrace_sermons_test"


def query(sql):
    env = {**os.environ, "PGOPTIONS": "-c default_transaction_read_only=on", "PGCLIENTENCODING": "UTF8"}
    out = subprocess.run(
        [PSQL, "-w", "-h", "127.0.0.1", "-p", "5432", "-U", "postgres", "-d", DATABASE, "-X", "-A", "-t", "-c",
         f"select coalesce(json_agg(x), '[]'::json) from ({sql}) x"],
        capture_output=True, env=env, check=True,
    ).stdout.decode("utf-8")
    return json.loads(out)


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def clean(text):
    return re.sub(r"[ \t]+\n", "\n", (text or "").replace("\r\n", "\n")).strip()


# ---------------------------------------------------------------- sermons
site_sermons = json.loads((DATA / "sermons.json").read_text(encoding="utf-8"))
by_wp = {s["wpId"]: s for s in site_sermons}
by_title_date = {(s["title"].strip().lower(), s["date"]): s for s in site_sermons}

rows = query("""
  select s.source_wordpress_id as wp, s.title, s.service_date::text as date, s.summary,
         (select t.body_text from sermon_transcripts t where t.sermon_id = s.id order by t.updated_at desc limit 1) as transcript,
         (select json_agg(json_build_object('provider', m.provider, 'seconds', m.duration_seconds))
            from sermon_media m where m.sermon_id = s.id and m.duration_seconds is not null) as media
  from sermons s
  where s.deleted_at is null and s.source_wordpress_id is not null
""")
extras, unmatched = {}, []
db_transcripts = ROOT / "private" / "db-transcripts"
db_transcripts.mkdir(parents=True, exist_ok=True)
for old in db_transcripts.glob("*.txt"):
    old.unlink()
for row in rows:
    sermon = by_wp.get(row["wp"]) or by_title_date.get((row["title"].strip().lower(), row["date"]))
    if not sermon:
        unmatched.append(row["wp"])
        continue
    if clean(row["transcript"]):
        (db_transcripts / f"{sermon['wpId']}.txt").write_text(clean(row["transcript"]) + "\n", encoding="utf-8")
    media = row["media"] or []
    # The video length is preferred because the video is the main player; audio is the fallback.
    pick = next((m for m in media if m["provider"] == "youtube"), None) or next(iter(media), None)
    extras[str(sermon["wpId"])] = {
        "summary": clean(row["summary"]),
        "durationSeconds": pick["seconds"] if pick else None,
        "durationProvider": pick["provider"] if pick else None,
    }
write(DATA / "sermon-extras.json", dict(sorted(extras.items(), key=lambda kv: int(kv[0]))))

# ---------------------------------------------------------------- studies
series = query("select id::text, slug, title, parent_id::text as \"parentId\", display_order as \"order\" from study_series")
sessions = query("""
  select ss.sermon_id::text as id, ss.slug, ss.title, ss.original_title as "originalTitle",
         ss.series_id::text as "seriesId", ss.display_order as "order",
         sp.name as teacher, s.service_date::text as date, s.summary,
         (select t.body_text from sermon_transcripts t where t.sermon_id = s.id order by t.updated_at desc limit 1) as transcript,
         (select json_agg(json_build_object('question', q.question_text, 'answer', q.answer_text) order by q.display_order)
            from sermon_question_answers q where q.sermon_id = s.id) as questions,
         (select json_agg(r.display_text order by r.display_order)
            from scripture_references r where r.sermon_id = s.id) as scripture,
         (select json_agg(json_build_object('provider', m.provider, 'id', m.external_id, 'seconds', m.duration_seconds) order by m.is_primary desc, m.display_order)
            from sermon_media m where m.sermon_id = s.id) as media
  from study_sessions ss
  join sermons s on s.id = ss.sermon_id
  left join speakers sp on sp.id = s.speaker_id
  where ss.assignment_state = 'supported' and s.deleted_at is null
""")

content_dir = DATA / "study-content"
if content_dir.exists():
    for old in content_dir.glob("*.json"):
        old.unlink()
index = []
for row in sessions:
    slug = re.sub(r"^study-", "", row["slug"])
    media = row["media"] or []
    youtube = next((m for m in media if m["provider"] == "youtube"), None)
    audio = next((m for m in media if m["provider"] == "sermonaudio"), None)
    seconds = next((m["seconds"] for m in media if m["seconds"]), None)
    index.append({
        "slug": slug, "title": row["title"].strip(), "originalTitle": row["originalTitle"].strip(),
        "seriesId": row["seriesId"], "order": row["order"], "teacher": row["teacher"], "date": row["date"],
        "durationSeconds": seconds, "youtubeId": youtube["id"] if youtube else None,
        "sermonAudioId": audio["id"] if audio else None,
    })
    write(content_dir / f"{slug}.json", {
        "description": clean(row["summary"]),
        "scripture": [s for s in (row["scripture"] or []) if s],
        "questions": [{"question": clean(q["question"]), "answer": clean(q["answer"])} for q in (row["questions"] or [])],
        "transcript": clean(row["transcript"]),
    })
used = {s["seriesId"] for s in index}
for item in series:
    if item["id"] in used and item["parentId"]:
        used.add(item["parentId"])
write(DATA / "studies.json", {
    "series": sorted((s for s in series if s["id"] in used), key=lambda s: (s["parentId"] or "", s["order"], s["title"])),
    "sessions": sorted(index, key=lambda s: (s["seriesId"], s["order"], s["title"])),
})

slugs = [s["slug"] for s in index]
print(json.dumps({
    "sermonExtras": len(extras), "withSummary": sum(1 for e in extras.values() if e["summary"]),
    "withDuration": sum(1 for e in extras.values() if e["durationSeconds"]), "unmatchedDatabaseSermons": unmatched,
    "studySeries": len([s for s in series if s["id"] in used]), "studySessions": len(index),
    "duplicateStudySlugs": len(slugs) - len(set(slugs)),
    "studiesWithTranscript": sum(1 for r in sessions if clean(r["transcript"])),
    "studiesWithQuestions": sum(1 for r in sessions if r["questions"]),
}, indent=1))
if len(slugs) != len(set(slugs)):
    sys.exit("duplicate study slugs")

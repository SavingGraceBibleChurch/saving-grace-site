"""Builds src/data/*.json from the private source material.

Inputs (private/inputs/, never committed):
  database.sql         WP Migrate dump of the live WordPress site (16 Nov 2026)
  live-capture.json    captured live title/description/canonical/H1 per URL
  old-frontend/*.json  cleaned page copy from the Astra + Impeccable redesign

Rules: every public URL keeps its live path, title, description and H1.
Run: python scripts/import_sources.py
"""
import html
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import unquote, urlsplit

sys.path.insert(0, str(Path(__file__).parent))
from wpsql import read_tables  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
INPUTS = ROOT / "private" / "inputs"
OUT = ROOT / "src" / "data"
HOSTS = {"savinggrace.org.au", "www.savinggrace.org.au"}
ARCHIVE_PAGE_SIZE = 9
TAXONOMIES = {
    "sermon_speaker": "speaker",
    "sermon_series": "series",
    "sermon_book": "book",
    "sermon_topics": "passage",
}
warnings = []


def load(name):
    return json.loads((INPUTS / name).read_text(encoding="utf-8"))


def write(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def text(value):
    return html.unescape(value or "").strip()


def site_path(url):
    """Root-relative path for a church URL, or None for other hosts."""
    if not url:
        return None
    if url.startswith("/"):
        return url
    parts = urlsplit(url)
    if parts.hostname not in HOSTS:
        return None
    return (parts.path or "/") + (("?" + parts.query) if parts.query else "")


# ---------------------------------------------------------------- sources
db = read_tables(INPUTS / "database.sql", [
    "wp_posts", "wp_postmeta", "wp_terms", "wp_term_taxonomy", "wp_term_relationships",
    "wp_redirection_items",
])
capture = {r["path"]: r for r in load("live-capture.json")}
old_pages = load("old-frontend/pages.json")
old_posts = load("old-frontend/posts.json")
old_events = load("old-frontend/events.json")
old_home = load("old-frontend/home.json")
old_images = load("old-frontend/images.json")

posts_by_id = {p["ID"]: p for p in db["wp_posts"]}
meta = defaultdict(dict)
for m in db["wp_postmeta"]:
    meta[m["post_id"]][m["meta_key"]] = m["meta_value"] or ""

terms = {t["term_id"]: t for t in db["wp_terms"]}
term_tax = {t["term_taxonomy_id"]: t for t in db["wp_term_taxonomy"]}
object_terms = defaultdict(list)
for rel in db["wp_term_relationships"]:
    tt = term_tax.get(rel["term_taxonomy_id"])
    if tt and tt["taxonomy"] in TAXONOMIES:
        object_terms[rel["object_id"]].append((tt["taxonomy"], terms[tt["term_id"]]))

live_by_wp = defaultdict(list)
for path, route in capture.items():
    if route["p"]["kind"] in ("page", "post") and route["source_wordpress_id"]:
        live_by_wp[str(route["source_wordpress_id"])].append(path)


def seo_for(path, fallback_title="", fallback_description=""):
    route = capture.get(path)
    if not route:
        warnings.append(f"no live capture for {path}; using fallback SEO")
        return {"title": fallback_title, "description": fallback_description, "canonical": path,
                "indexable": True, "h1": None, "ogType": "website", "ogTitle": None, "ogDescription": None,
                "captured": False}
    p = route["p"]
    canonical = site_path(p.get("canonicalSource")) or path
    return {
        "title": p["title"],
        "description": p.get("description") or "",
        "canonical": canonical,
        "indexable": bool(p["indexable"]),
        "h1": p.get("heading") or None,
        "ogType": p.get("socialType") or "website",
        "ogTitle": p.get("socialTitle") or None,
        "ogDescription": p.get("socialDescription") or None,
        "published": p.get("publishedAt"),
        "modified": p.get("modifiedAt"),
        "captured": True,
    }


# ------------------------------------------------- old path -> live path
path_map = {}
for item in old_pages + old_posts:
    live = live_by_wp.get(str(item["source"]["id"]), [])
    if len(live) == 1 and item.get("status", "published") == "published":
        path_map[item["path"]] = live[0]

# The church's Events page is rendered at the live /events/ archive URL; /church-events/ redirects there.
path_map["/events/"] = "/events/"

events_out = []
event_path_map = {}
for event in old_events["events"]:
    new_path = f"/event/{event['id']}/"
    event_path_map[event["path"]] = new_path
    path_map[event["path"]] = new_path


def map_href(href):
    if not isinstance(href, str):
        return href
    local = site_path(href) if href.startswith("http") else href
    if local is None or not local.startswith("/"):
        return href
    split = re.search(r"[?#]", local)
    path, suffix = (local[:split.start()], local[split.start():]) if split else (local, "")
    if not path.endswith("/") and "." not in path.rsplit("/", 1)[-1]:
        path += "/"
    return path_map.get(path, path) + suffix


LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")


def remap(value):
    if isinstance(value, dict):
        return {k: (map_href(v) if k == "href" or k.endswith("Href") else remap(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [remap(v) for v in value]
    if isinstance(value, str) and "](" in value:
        return LINK.sub(lambda m: f"[{m.group(1)}]({map_href(m.group(2))})", value)
    return value


# ------------------------------------------------------------------ pages
pages = []
for page in old_pages:
    if page["status"] != "published":
        continue
    live = path_map.get(page["path"])
    if not live:
        warnings.append(f"page {page['id']} has no live URL; skipped")
        continue
    seo = seo_for(live, page["title"], page["description"])
    pages.append({
        "id": page["id"],
        "wpId": page["source"]["id"],
        "path": live,
        "navTitle": page["title"],
        "h1": seo["h1"] or page.get("heading") or page["title"],
        "section": page["section"],
        "parent": page.get("parent"),
        "eyebrow": page.get("eyebrow"),
        "lede": remap(page.get("lede")),
        "hero": page.get("hero"),
        "blocks": remap(page["blocks"]),
        "aside": remap(page.get("aside") or []),
        "related": page.get("related") or [],
        "seo": seo,
    })

posts = []
for post in old_posts:
    live = path_map.get(post["path"])
    if not live:
        warnings.append(f"post {post['id']} has no live URL; skipped")
        continue
    seo = seo_for(live, post["title"], post["description"])
    wp_post = posts_by_id.get(str(post["source"]["id"]), {})
    posts.append({
        "id": post["id"],
        "wpId": post["source"]["id"],
        "path": live,
        "title": text(wp_post.get("post_title")) or post["title"],
        "h1": seo["h1"] or post["title"],
        "date": (wp_post.get("post_date") or post["date"])[:10],
        "modified": (wp_post.get("post_modified") or "")[:10] or None,
        "media": post.get("media"),
        "blocks": remap(post["blocks"]),
        "seo": seo,
    })

home_route = capture["/"]["p"]
home = {
    "seo": seo_for("/"),
    "copy": remap({k: v for k, v in old_home.items() if k not in ("homepageInventory", "pendingLabels")}),
}

# ---------------------------------------------------------------- sermons
YOUTUBE = [r"youtu\.be/([\w-]{11})", r"[?&]v=([\w-]{11})", r"/embed/([\w-]{11})", r"/live/([\w-]{11})", r"/shorts/([\w-]{11})"]


def youtube_id(value):
    for pattern in YOUTUBE:
        m = re.search(pattern, value or "")
        if m:
            return m.group(1)
    return None


def sermonaudio_id(value):
    m = re.search(r"/player/[a-z]/(\d+)", value or "") or re.search(r"[?&]SID=(\d+)", value or "", re.I) \
        or re.search(r"sermonaudio\.com/sermons/(\d+)", value or "")
    return m.group(1) if m else None


sermon_rows = [p for p in db["wp_posts"] if p["post_type"] == "sermons" and p["post_status"] == "publish"]
taxonomy_terms = {kind: {} for kind in TAXONOMIES.values()}
sermons = []
for row in sorted(sermon_rows, key=lambda r: r["post_date"], reverse=True):
    m = meta[row["ID"]]
    groups = defaultdict(list)
    for taxonomy, term in object_terms[row["ID"]]:
        kind = TAXONOMIES[taxonomy]
        groups[kind].append(term["slug"])
        taxonomy_terms[kind].setdefault(term["slug"], {"slug": term["slug"], "name": text(term["name"]), "count": 0})
        taxonomy_terms[kind][term["slug"]]["count"] += 1
    path = f"/sermons/{row['post_name']}/"
    title = text(row["post_title"])
    seo = seo_for(path, f"{title} - Saving Grace Bible Church - Bible-Based Worship in Melbourne", "")
    if len(groups["speaker"]) > 1:
        warnings.append(f"sermon {row['post_name']} has {len(groups['speaker'])} speakers")
    sermons.append({
        "wpId": int(row["ID"]),
        "slug": unquote(row["post_name"]),
        "path": path,
        "title": title,
        "date": row["post_date"][:10],
        "modified": row["post_modified"][:10],
        "speakers": groups["speaker"],
        "series": groups["series"],
        "books": groups["book"],
        "passages": groups["passage"],
        "passage": text(m.get("asp_sermon_bible_passage")),
        "youtubeId": youtube_id(m.get("asp_sermon_youtube")),
        "sermonAudioId": sermonaudio_id(m.get("asp_sermon_audio_embed")),
        "pdf": site_path(m.get("asp_sermon_pdf")) if m.get("asp_sermon_pdf") else None,
        "body": row["post_content"].strip() or None,
        "seo": seo,
    })

# Taxonomy landing pages keep the live filter titles.
taxonomy_pages = []
for taxonomy, kind in TAXONOMIES.items():
    for slug, term in sorted(taxonomy_terms[kind].items()):
        live_paths = [f"/sermons/?{taxonomy}={slug}", f"/sermons/?{taxonomy}=/{slug}"]
        captured = next((capture[p] for p in live_paths if p in capture), None)
        title = captured["p"]["title"] if captured else f"{term['name']} - Saving Grace Bible Church - Bible-Based Worship in Melbourne"
        taxonomy_pages.append({
            "kind": kind,
            "slug": slug,
            "name": term["name"],
            "count": term["count"],
            "path": f"/sermons/{kind}/{slug}/",
            "legacyQuery": [taxonomy, slug],
            "seo": {"title": title, "description": (captured["p"].get("description") if captured else "") or "",
                    "indexable": True, "captured": bool(captured)},
        })

# ----------------------------------------------------------------- events
for event in old_events["events"]:
    events_out.append(remap({**event, "path": event_path_map[event["path"]],
                             "legacyPaths": event.get("legacyPaths", [])}))

# ------------------------------------------------------------- redirects
built_paths = {"/", "/sermons/", "/events/", "/blogs/"} | {p["path"] for p in pages} | {p["path"] for p in posts} \
    | {s["path"] for s in sermons} | {t["path"] for t in taxonomy_pages} | {e["path"] for e in events_out}
redirects = []  # {"from": path, "to": path, "match": "exact"|"prefix"|"query", ...}


def add(src, dst, match="exact", note=""):
    redirects.append({"from": src, "to": dst, "match": match, "note": note})


add("/home/", "/", note="WordPress front page")
add("/church-events/", "/events/", note="duplicate events page")
for event in events_out:
    for legacy in event["legacyPaths"]:
        add(legacy, event["path"], "prefix", "event and its dated occurrences")
add("/events/", "/events/", "prefix", "calendar views (day/list/month/category/tag) collapse to the events page")
add("/event/", "/events/", "prefix", "unknown event slugs")
add("/series/", "/events/", "prefix", "event series")
add("/venue/", "/contact-us-2/", "prefix", "event venues")
add("/organizer/", "/contact-us-2/", "prefix", "event organisers")
add("/tag/", "/events/", "prefix", "event tags")
add("/category/", "/blogs/", "prefix", "post categories")
add("/author/", "/blogs/", "prefix", "post authors")
add("/pages/im-new-here/", "/pages/lordsdayservice/", note="2013 theme demo page (placeholder text)")
add("/organiser/", "/contact-us-2/", "prefix", "event organisers (UK spelling)")
add("/sermons/page/", "/sermons/", "prefix", "archive pages beyond the new page count")
add("/page/", "/", "prefix", "WordPress front-page pagination and event views")
add("/https:/", "/", "prefix", "malformed self-links seen in Search Console")
add("/sermons/feed/", "/sermons/feed/index.xml", "rewrite", "sermon RSS feed (served, not redirected)")
add("/feed/", "/feed/index.xml", "rewrite", "site RSS feed (served, not redirected)")
add("/2023/12/mens-ministry/", "/mens-ministry/", note="old post URL")
add("/2023/12/womens-ministry/", "/womens-ministry/", note="old post URL")
for taxonomy_page in taxonomy_pages:
    taxonomy, slug = taxonomy_page["legacyQuery"]
    add(f"/sermons/?{taxonomy}={slug}", taxonomy_page["path"], "query", "sermon filter")
    add(f"/sermons/?{taxonomy}=/{slug}", taxonomy_page["path"], "query", "sermon filter (leading slash form)")
for taxonomy, kind in TAXONOMIES.items():
    add(f"/{taxonomy}/", f"/sermons/{kind}/", "prefix", "taxonomy archive base")

# Live sermon sub-pages (/sermons/slug/2/) collapse to the sermon.
for sermon in sermons:
    add(sermon["path"], sermon["path"], "prefix", "sermon pagination and query variants")

# ?p= and ?page_id= shortlinks for everything that still exists.
by_wp_id = {str(p["wpId"]): p["path"] for p in pages + posts} | {str(s["wpId"]): s["path"] for s in sermons}
for wp_id, path in by_wp_id.items():
    add(f"/?p={wp_id}", path, "query", "WordPress shortlink")
    add(f"/?page_id={wp_id}", path, "query", "WordPress shortlink")

# WordPress Redirection plugin rules whose destination still exists.
kept, dropped = 0, Counter()
seen = set()
for item in db["wp_redirection_items"]:
    if item["status"] != "enabled" or item["action_type"] != "url":
        continue
    src = item["url"]
    dst = site_path(item["action_data"])
    if dst is None:
        dropped["external or staging destination"] += 1
        continue
    dst = map_href(dst)
    if dst.split("?")[0] not in built_paths:
        dropped["destination no longer exists"] += 1
        continue
    if (src, dst) in seen:
        continue
    seen.add((src, dst))
    add(src, dst, "exact", "WordPress Redirection plugin")
    kept += 1

# ------------------------------------------- unlink unpublished targets
redirect_sources = {r["from"] for r in redirects if r["match"] == "exact"}
unlinked = []


def reachable(href):
    if not isinstance(href, str) or not href.startswith("/"):
        return True
    path = href.split("#")[0].split("?")[0]
    return (path in built_paths or path in redirect_sources or path.startswith("/wp-content/uploads/")
            or path.startswith("/sermons/") or path.startswith("/event/") or path in ("/search/",))


def unlink(value):
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if (k == "href" or k.endswith("Href")) and not reachable(v):
                unlinked.append(v)
                out[k] = None
            else:
                out[k] = unlink(v)
        return out
    if isinstance(value, list):
        return [unlink(v) for v in value]
    if isinstance(value, str) and "](" in value:
        def repl(m):
            if reachable(m.group(2)):
                return m.group(0)
            unlinked.append(m.group(2))
            return m.group(1)
        return LINK.sub(repl, value)
    return value


pages = unlink(pages)
posts = unlink(posts)
home = unlink(home)
events_out = unlink(events_out)
warnings.extend(f"unlinked unpublished target {href}" for href in sorted(set(unlinked)))

# --------------------------------------------------------------- outputs
images ={i["id"]: {"src": i["path"], "width": i["width"], "height": i["height"], "alt": i["alt"]} for i in old_images}
write("pages.json", pages)
write("posts.json", posts)
write("home.json", home)
write("sermons.json", sermons)
write("taxonomies.json", taxonomy_pages)
write("events.json", {"events": events_out, "venues": old_events["venues"]})
write("images.json", images)
write("redirects.json", redirects)
write("events-seo.json", seo_for("/events/"))
write("import-report.json", {
    "pages": len(pages), "posts": len(posts), "sermons": len(sermons),
    "taxonomyPages": Counter(t["kind"] for t in taxonomy_pages),
    "events": len(events_out), "redirects": len(redirects),
    "wordpressRedirectionKept": kept, "wordpressRedirectionDropped": dict(dropped),
    "sermonsWithoutCapture": [s["path"] for s in sermons if not s["seo"]["captured"]],
    "warnings": warnings,
})
print(json.dumps(json.loads((OUT / "import-report.json").read_text(encoding="utf-8")), indent=1)[:3000])

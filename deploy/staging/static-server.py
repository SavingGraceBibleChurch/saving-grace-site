"""Serves the static Astro build for public staging on 127.0.0.1:8083 (Python standard library only).

Every response carries X-Robots-Tag: noindex so the staging copy is never indexed in place of the real site.
Usage: python3 static-server.py <site directory>
"""
import http.server
import os
import sys

# Not resolved once: every request follows the `current` link, so a new build is served as soon as it is switched in.
ROOT = sys.argv[1]


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("X-Robots-Tag", "noindex, nofollow")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_head(self):
        # Build-time files (the nginx redirect rules) are never served, as on production.
        if self.path.split("?", 1)[0].startswith("/_nginx/"):
            self.send_error(404)
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def send_error(self, code, message=None, explain=None):
        page = os.path.join(ROOT, "404.html")
        if code == 404 and os.path.isfile(page):
            with open(page, "rb") as f:
                body = f.read()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            return
        super().send_error(code, message, explain)

    def log_message(self, fmt, *args):
        pass


http.server.SimpleHTTPRequestHandler.extensions_map.update({".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json", ".pf_meta": "application/octet-stream", ".pf_index": "application/octet-stream", ".pf_fragment": "application/octet-stream", ".pagefind": "application/octet-stream"})
http.server.ThreadingHTTPServer(("127.0.0.1", 8083), Handler).serve_forever()

"""Dev server that never serves stale files. `python -m http.server` lets the
browser cache old HTML/JS after edits, which makes a fresh build look broken.

Usage: python serve.py [port]   (default 8123)
"""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    print(f"Serving on http://127.0.0.1:{port}/demo/  (no browser caching)")
    HTTPServer(("", port), NoCacheHandler).serve_forever()

#!/usr/bin/env python3
"""Dev server that disables caching, so a reload always runs the latest code.

Plain `python3 -m http.server` lets the browser cache the ES modules, which means
after you change/redeploy a file you can end up running a stale mix of old and new
modules until a hard refresh. This sends `Cache-Control: no-store` on everything
so every reload fetches fresh files.

    python3 serve.py            # http://localhost:8000/
    python3 serve.py 5500       # custom port
"""
import sys
from http.server import SimpleHTTPRequestHandler
from socketserver import TCPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()


TCPServer.allow_reuse_address = True
with TCPServer(("", PORT), NoCacheHandler) as httpd:
    print(f"Serving http://localhost:{PORT}/  (no-cache; Ctrl+C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass

"""Run Hauntface in a browser from source (no Electron needed).

    python tools/serve.py        then open  http://127.0.0.1:8777/

Serves the app/ folder and forwards /api/nvidia/* to NVIDIA's API, which does not accept
calls straight from a browser (no CORS). Put your NVIDIA key in the app settings (H) or in the
NVIDIA_API_KEY environment variable. Only requests from this server's own page are forwarded.
"""
import os
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", 8777))
APP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app")
PROXIES = {"/api/nvidia/": "https://integrate.api.nvidia.com/"}
ALLOWED_HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
MAX_BODY = 2 * 1024 * 1024


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=APP_DIR, **kwargs)

    def list_directory(self, path):  # no directory listings
        self.send_error(404)

    def do_POST(self):
        # Block other websites (and DNS rebinding) from using this proxy and your key.
        origin = self.headers.get("Origin", "")
        if self.headers.get("Host") not in ALLOWED_HOSTS or (origin and origin.split("//", 1)[-1] not in ALLOWED_HOSTS):
            return self.send_error(403)
        length = int(self.headers.get("Content-Length", 0))
        if length > MAX_BODY:
            return self.send_error(413)
        for prefix, target in PROXIES.items():
            if self.path.startswith(prefix):
                return self.proxy(target + self.path[len(prefix):], self.rfile.read(length))
        self.send_error(404)

    def proxy(self, url, body):
        headers = {"Content-Type": self.headers.get("Content-Type", "application/json")}
        auth = self.headers.get("Authorization", "").strip()
        if not auth or auth == "Bearer":
            key = os.environ.get("NVIDIA_API_KEY", "")
            auth = f"Bearer {key}" if key else ""
        if auth:
            headers["Authorization"] = auth
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                status, data, ctype = r.status, r.read(), r.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as e:
            status, data, ctype = e.code, e.read(), e.headers.get("Content-Type", "application/json")
        except Exception as e:  # network error / timeout
            status, data, ctype = 502, str(e).encode(), "text/plain"
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    print(f"Hauntface: http://127.0.0.1:{PORT}/")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()

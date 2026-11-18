import json
import re
import secrets
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urlsplit

TOKEN = "/" + secrets.token_urlsafe(32) + "/"
DOCUMENT_POLICY = (
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
    "img-src data: blob:; font-src data:; media-src data: blob:; "
    "base-uri 'none'; form-action 'none'; object-src 'none'; sandbox allow-scripts allow-downloads"
)
SHELL_POLICY = (
    "default-src 'none'; style-src 'unsafe-inline'; frame-src 'self'; "
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
)
document = b""


class Preview(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.headers.get("Host") != "127.0.0.1:" + str(self.server.server_port):
            self.send_error(404)
            return
        target = urlsplit(self.path)
        if target.path == TOKEN:
            params = parse_qs(target.query)
            mode = "flat" if params.get("mode") == ["flat"] else "live"
            screen = params.get("screen", ["invite"])[0]
            if not re.fullmatch(r"[a-z_]{1,32}", screen):
                screen = "invite"
            fragment = "flat" if mode == "flat" else screen
            html = (
                '<!doctype html><meta charset="utf-8"><style>html,body,iframe{'
                'width:100%;height:100%;margin:0;border:0;display:block;background:transparent}'
                '</style><iframe title="R8 手机体验" sandbox="allow-scripts allow-downloads" '
                f'src="{TOKEN}document?{urlencode({"mode": mode})}#{fragment}"></iframe>'
            ).encode("utf-8")
            self.send_html(html, SHELL_POLICY)
        elif target.path == TOKEN + "document" and document:
            self.send_html(document, DOCUMENT_POLICY)
        else:
            self.send_error(404)

    def send_html(self, html, policy):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Security-Policy", policy)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(html)))
        self.end_headers()
        self.wfile.write(html)


with ThreadingHTTPServer(("127.0.0.1", 0), Preview) as server:
    server.daemon_threads = True
    print(json.dumps({"url": f"http://127.0.0.1:{server.server_port}{TOKEN}"}), flush=True)

    def serve():
        server.serve_forever()

    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    for line in sys.stdin:
        value = json.loads(line)
        if isinstance(value, str) and len(value) <= 50 * 1024 * 1024:
            document = value.encode("utf-8")
            print('{"ready":true}', flush=True)
    server.shutdown()

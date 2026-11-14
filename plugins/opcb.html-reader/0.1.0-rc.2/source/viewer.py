"""Ephemeral, memory-only HTML preview for Buzz's bridge-free native browser."""
import json, secrets, sys, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LIMIT = 50 * 1024 * 1024
line = sys.stdin.readline(LIMIT * 6 + 1024)
if not line.endswith('\n'):
    raise ValueError('document exceeds input limit')
doc = json.loads(line)
body = doc['html'].encode('utf-8')
if not body or len(body) > LIMIT:
    raise ValueError('document exceeds preview limit')
token = '/' + secrets.token_urlsafe(32) + '/'
POLICY = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: data:; style-src 'unsafe-inline' blob: data:; img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors *"
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.headers.get('Host') != '127.0.0.1:' + str(self.server.server_port) or self.path != token:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', POLICY)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *args):
        pass
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
server.daemon_threads = True
threading.Thread(target=server.serve_forever, daemon=True).start()
print(json.dumps({'url': 'http://127.0.0.1:' + str(server.server_port) + token}), flush=True)
# EOF or an explicit stop line retires this preview and releases the only copy.
sys.stdin.readline(16)
server.shutdown()
server.server_close()

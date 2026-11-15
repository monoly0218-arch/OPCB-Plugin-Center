"""One mounted native video. Memory only, one signed source, loopback only."""
import http.server
import json
import re
import secrets
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request


def source_url(value):
    if not isinstance(value, str) or len(value) > 8192:
        raise ValueError('invalid source')
    url = urllib.parse.urlsplit(value)
    if (url.scheme != 'https' or url.netloc != 'staging.paolab.cn'
            or url.username or url.password or url.fragment
            or not re.fullmatch(r'/ins/(media|results)/[A-Za-z0-9._/-]+', url.path)
            or '..' in url.path or not urllib.parse.parse_qs(url.query).get('opcb_media')):
        raise ValueError('invalid source')
    return value


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def serve(source, input_stream=sys.stdin):
    source = source_url(source)
    nonce = secrets.token_urlsafe(32)
    opener = urllib.request.build_opener(NoRedirect())

    class Handler(http.server.BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def log_message(self, *args):
            pass  # Never log media tickets, local tokens or asset names.

        def do_HEAD(self):
            self.stream(True)

        def do_GET(self):
            self.stream(False)

        def stream(self, head):
            if (self.path != '/' + nonce + '/media'
                    or self.headers.get('Host') != '127.0.0.1:' + str(self.server.server_port)
                    or self.headers.get('Origin', '') not in ['', 'tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']):
                self.send_error(403)
                return
            headers = {}
            requested_range = self.headers.get('Range')
            if requested_range:
                if not re.fullmatch(r'bytes=\d*-\d*', requested_range) or requested_range == 'bytes=-':
                    self.send_error(416)
                    return
                headers['Range'] = requested_range
            try:
                request = urllib.request.Request(source, headers=headers, method='HEAD' if head else 'GET')
                with opener.open(request, timeout=20) as response:
                    if response.status not in [200, 206] or response.headers.get_content_type() not in ['video/mp4', 'video/webm', 'video/quicktime', 'application/octet-stream']:
                        self.send_error(502)
                        return
                    self.send_response(response.status)
                    self.send_header('Cache-Control', 'no-store')
                    self.send_header('X-Content-Type-Options', 'nosniff')
                    self.send_header('Connection', 'close')
                    for name in ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']:
                        if response.headers.get(name):
                            self.send_header(name, response.headers[name])
                    self.end_headers()
                    if not head:
                        while True:
                            chunk = response.read(256 * 1024)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
            except urllib.error.HTTPError as error:
                self.send_error(error.code if error.code in [401, 403, 404, 410, 416] else 502)
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception:
                self.close_connection = True

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server.daemon_threads = True
    print(json.dumps({'url': 'http://127.0.0.1:' + str(server.server_port) + '/' + nonce + '/media'}), flush=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        for _ in input_stream:
            pass
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    serve(json.loads(sys.stdin.readline())['url'])

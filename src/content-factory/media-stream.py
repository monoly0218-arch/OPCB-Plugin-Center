"""One mounted native video. Memory only, one signed source, loopback only."""
import base64
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


def upload(config, input_stream=sys.stdin):
    target = urllib.parse.urlsplit(config['url'])
    path = r'/ins/api/cards/[a-zA-Z0-9_-]+/(result|production-versions/[a-zA-Z0-9_-]+/project)'
    if target.scheme != 'https' or target.netloc != 'staging.paolab.cn' or target.fragment or not re.fullmatch(path, target.path):
        raise ValueError('invalid upload route')
    token = config['token']
    filename = config['name']
    size = config['size']
    mime = config['type']
    if not re.fullmatch(r'[a-zA-Z0-9_.-]{1,4096}', token):
        raise ValueError('invalid session')
    if not (0 < size <= 130 * 1024 * 1024) or not isinstance(config['version'], int) or config['version'] < 0:
        raise ValueError('invalid upload size or version')
    if mime not in ('video/mp4', 'video/webm', 'video/quicktime', 'application/zip') or len(filename) > 240:
        raise ValueError('invalid upload type')

    def chunks():
        sent = 0
        while sent < size:
            chunk = base64.b64decode(input_stream.readline(16385), validate=False)
            if not chunk or sent + len(chunk) > size:
                raise ValueError('invalid upload bytes')
            sent += len(chunk)
            yield chunk

    request = urllib.request.Request(config['url'], method='POST', data=chunks(), headers={
        'Authorization': 'Bearer ' + token, 'Origin': 'tauri://localhost',
        'Content-Type': mime, 'Content-Length': str(size), 'X-Upload-Length': str(size),
        'X-Card-Version': str(config['version']), 'X-File-Name': urllib.parse.quote(filename, safe=''),
    })
    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(request, timeout=60) as response:
            status = response.status
    except urllib.error.HTTPError as error:
        status = error.code
    print(json.dumps({'status': status}), flush=True)


if __name__ == '__main__':
    options = json.loads(sys.stdin.readline())
    if options.get('operation') == 'upload':
        upload(options)
    else:
        serve(options['url'])

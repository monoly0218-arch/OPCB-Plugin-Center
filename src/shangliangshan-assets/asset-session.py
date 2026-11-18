"""Fresh asset-site session owned by this plugin, never a copied browser jar.

Only explicit member login and existing read routes are implemented. Cookies
stay in this process; only authorized JSON and bounded media reach the UI.
"""
import base64
import concurrent.futures
import html.parser
import http.cookiejar
import http.server
import json
import re
import secrets
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request

ORIGIN = 'https://staging.paolab.cn'
ROOT = ORIGIN + '/assets'
IMAGE_LIMIT = 8 * 1024 * 1024
JSON_LIMIT = 12 * 1024 * 1024


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def media_source(raw):
    if not isinstance(raw, str) or len(raw) > 8192:
        raise ValueError('无效媒体地址')
    if raw.startswith('/api/assets/'):
        raw = '/assets' + raw
    u = urllib.parse.urlsplit(urllib.parse.urljoin(ROOT + '/', raw))
    if (u.scheme != 'https' or u.netloc != 'staging.paolab.cn'
            or u.username or u.password or u.query or u.fragment
            or not re.fullmatch(r'/assets/api/assets/files/[a-f0-9-]{36}/(?:preview|poster)', u.path)):
        raise ValueError('媒体地址不属于当前资产库')
    return urllib.parse.urlunsplit(u)


class MemberParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.member = None
        self.rows = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'form':
            self.member = None
        if tag == 'input' and a.get('name') == 'member':
            self.member = a.get('value')
        if tag == 'button' and self.member and a.get('aria-label', '').startswith('以'):
            name = a['aria-label'].removeprefix('以').removesuffix('进入')
            if re.fullmatch(r'[a-z0-9_-]{1,64}', self.member):
                self.rows.append({'id': self.member, 'name': name})


class AssetSession:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar), NoRedirect())
        self.files = {}
        self.reverse = {}
        self.member = ''
        self.epoch = 0
        self.roster = []

    def reset(self):
        self.epoch += 1
        self.jar.clear()
        self.member = ''
        self.files = {}
        self.reverse = {}

    def request(self, path, method='GET', body=None):
        headers = {'Origin': ORIGIN, 'Accept': 'application/json'}
        if body is not None:
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
        req = urllib.request.Request(ROOT + path, data=body, headers=headers, method=method)
        return self.opener.open(req, timeout=25)

    def members(self):
        with self.request('/login') as r:
            parser = MemberParser()
            parser.feed(r.read(256 * 1024).decode('utf-8'))
        if not parser.rows:
            raise ValueError('原站没有返回可选择的成员')
        self.roster = parser.rows
        return self.roster

    def read_json(self, path):
        try:
            with self.request(path) as response:
                raw = response.read(JSON_LIMIT + 1)
                if len(raw) > JSON_LIMIT:
                    raise ValueError('资产数据超过本次读取上限')
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                self.reset()
                raise PermissionError('资产署名会话已过期或无权限，请重新进入') from None
            raise ValueError('资产读取失败（%d）' % e.code) from None

    def login(self, member):
        if member not in {r['id'] for r in self.roster}:
            raise ValueError('请先选择原站当前成员')
        self.reset()
        try:
            with self.request('/login', 'POST', urllib.parse.urlencode({'member': member, 'next': '/assets/'}).encode()) as response:
                if response.status != 200:
                    raise ValueError('原站成员选择未确认')
        except urllib.error.HTTPError as error:
            target = urllib.parse.urljoin(ROOT + '/login', error.headers.get('Location', ''))
            if error.code not in (302, 303) or target != ROOT + '/':
                raise ValueError('原站成员选择失败') from None
            error.close()
        self.member = member
        state = self.state()
        if state['data'].get('user', {}).get('id') != member:
            self.reset()
            raise PermissionError('原站回读的成员与所选成员不一致')
        return state

    def state(self):
        if not self.member:
            raise PermissionError('请选择自己的原站成员进入资产库')
        data = self.read_json('/api/assets')
        if (not isinstance(data, dict) or not isinstance(data.get('assets'), list)
                or not isinstance(data.get('files'), list) or data.get('user', {}).get('id') != self.member):
            self.reset()
            raise PermissionError('资产身份或数据回读无效，请重新进入')
        files = {}
        reverse = {}
        for f in data['files']:
            for raw in (f.get('url'), f.get('poster')):
                if not raw:
                    continue
                try:
                    source = media_source(raw)
                except ValueError:
                    continue
                token = self.reverse.get(source) or secrets.token_urlsafe(18)
                files[token] = source
                reverse[source] = token
        self.files, self.reverse = files, reverse
        projection = self.read_json('/api/folders')
        data.update(projection)
        for asset in data['assets']:
            asset['folderIds'] = projection.get('memberships', {}).get(asset['id'], [])
        return {'data': data, 'media': reverse}

    def mutate(self, action, args):
        if not self.member:
            raise PermissionError('请先进入资产库')
        routes = {'folder': '/api/folders', 'assign': '/api/folders/assign', 'share': '/api/shares', 'lifecycle': '/api/assets/lifecycle'}
        if action not in routes or not isinstance(args, dict):
            raise ValueError('资产操作无效')
        raw = json.dumps(args, ensure_ascii=False).encode()
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError('选择数量超过上限')
        request = urllib.request.Request(ROOT + routes[action], data=raw, method='POST', headers={'Origin': ORIGIN, 'Accept': 'application/json', 'Content-Type': 'application/json'})
        try:
            with self.opener.open(request, timeout=45) as response:
                result = json.loads(response.read(JSON_LIMIT + 1))
        except urllib.error.HTTPError as error:
            try:
                message = json.loads(error.read(8192)).get('error', '资产操作失败')
            except Exception:
                message = '资产操作失败（%d）' % error.code
            raise ValueError(message) from None
        state = self.state()
        state['mutation'] = {key: result[key] for key in ['folder', 'url', 'id', 'expiresAt', 'result'] if key in result}
        return state

    def image(self, raw):
        source = media_source(raw)
        if source not in self.reverse or not self.member:
            raise PermissionError('当前资产文件不可访问')
        epoch = self.epoch
        with self.opener.open(urllib.request.Request(source), timeout=25) as response:
            kind = response.headers.get_content_type()
            if kind not in ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']:
                raise ValueError('此文件没有可用图片预览')
            data = response.read(IMAGE_LIMIT + 1)
            if len(data) > IMAGE_LIMIT:
                raise ValueError('图片超过8MB，请在原站查看原件')
        if epoch != self.epoch:
            raise PermissionError('资产署名会话已变化')
        return 'data:' + kind + ';base64,' + base64.b64encode(data).decode('ascii')

    def copy(self, id, platform):
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,160}', id or '') or platform not in ['xhs', 'douyin', 'taobao', 'pdd', 'channels']:
            raise ValueError('无效平台文案请求')
        if not self.member:
            raise PermissionError('请先进入资产库')
        return self.read_json('/api/assets/platform-copy?' + urllib.parse.urlencode({'id': id, 'platform': platform}))


def serve(session):
    secret = secrets.token_urlsafe(32)

    class Media(http.server.BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def log_message(self, *args):
            pass

        def do_GET(self):
            self.stream(False)

        def do_HEAD(self):
            self.stream(True)

        def stream(self, head):
            prefix = '/' + secret + '/'
            token = self.path[len(prefix):] if self.path.startswith(prefix) else ''
            source = session.files.get(token)
            if (not source or not session.member
                    or self.headers.get('Host') != '127.0.0.1:' + str(self.server.server_port)
                    or self.headers.get('Origin', '') not in ['', 'tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']):
                self.send_error(403)
                return
            headers = {}
            value = self.headers.get('Range')
            if value:
                if not re.fullmatch(r'bytes=\d*-\d*', value) or value == 'bytes=-':
                    self.send_error(416)
                    return
                headers['Range'] = value
            epoch = session.epoch
            try:
                with session.opener.open(urllib.request.Request(source, headers=headers, method='HEAD' if head else 'GET'), timeout=25) as response:
                    if epoch != session.epoch or source not in session.reverse:
                        self.send_error(403)
                        return
                    kind = response.headers.get_content_type()
                    if kind not in ['video/mp4', 'video/webm', 'video/quicktime', 'application/pdf', 'application/octet-stream']:
                        self.send_error(415)
                        return
                    self.send_response(response.status)
                    self.send_header('Cache-Control', 'no-store')
                    self.send_header('Connection', 'close')
                    self.send_header('X-Content-Type-Options', 'nosniff')
                    for key in ['Content-Type', 'Content-Length', 'Accept-Ranges', 'Content-Range']:
                        if response.headers.get(key):
                            self.send_header(key, response.headers[key])
                    self.end_headers()
                    if not head:
                        while epoch == session.epoch and source in session.reverse:
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

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Media)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(json.dumps({'ready': True, 'base': 'http://127.0.0.1:' + str(server.server_port) + '/' + secret + '/'}), flush=True)
    output_lock = threading.Lock()
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=3)

    def answer(request):
        try:
            action = request.get('action')
            if action == 'members':
                result = session.members()
            elif action == 'login':
                result = session.login(request.get('member'))
            elif action == 'state':
                result = session.state()
            elif action in ['folder', 'assign', 'share', 'lifecycle']:
                result = session.mutate(action, request.get('args'))
            elif action == 'image':
                result = session.image(request.get('source'))
            elif action == 'copy':
                result = session.copy(request.get('asset'), request.get('platform'))
            else:
                raise ValueError('此操作尚未接入原生资产库')
            output = {'id': request.get('id'), 'result': result}
        except urllib.error.HTTPError as error:
            if error.code in [401, 403]:
                session.reset()
            output = {'id': request.get('id'), 'error': '资产文件不可访问，请刷新后重试', 'authExpired': not bool(session.member)}
        except (ValueError, PermissionError) as e:
            output = {'id': request.get('id'), 'error': str(e), 'authExpired': not bool(session.member)}
        except Exception:
            output = {'id': request.get('id'), 'error': '资产服务暂不可用，请重试', 'authExpired': not bool(session.member)}
        with output_lock:
            print(json.dumps(output, ensure_ascii=False, separators=(',', ':')), flush=True)

    try:
        while True:
            line = sys.stdin.readline(256 * 1024)
            if not line:
                break
            try:
                request = json.loads(line)
                if not isinstance(request, dict):
                    raise ValueError()
            except Exception:
                break
            if request.get('action') == 'image':
                pool.submit(answer, request)
            else:
                answer(request)
    finally:
        session.reset()
        pool.shutdown(wait=False, cancel_futures=True)
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    serve(AssetSession())

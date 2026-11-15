// REPOS/mobile-design-plan-20261115/src/mobile-design/binding.mjs
var key = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
var COLLECTION = { name: "mobile-design-workspace", type: "opcb.mobile-design.workspace", version: 1, project: () => [] };
var PREFERENCE = "execution-binding";
var MAPPINGS = Object.freeze([
  { reference: "\u793E\u4EA4\u52A8\u6001", target: "\u9996\u9875", page: "home" },
  { reference: "\u5BF9\u8BDD\u4E0E\u72B6\u6001", target: "OPCB Agent \u804A\u5929", page: "agent_chat" },
  { reference: "\u4EBA\u7269\u53D1\u73B0", target: "\u4E0A\u4F20\u56FE\u7247\u4E0E\u6267\u884C\u5236\u4F5C", page: "ready" },
  { reference: "\u4E2A\u4EBA\u4E3B\u9875", target: "\u4E0B\u8F7D\u4E0E\u53D1\u5E03", page: "detail" },
  { reference: "\u76F4\u64AD\u9875\u9762\uFF0F\u8DEF\u7EBF\u7ED3\u679C", target: "\u586B\u5199\u9080\u8BF7\u7801", page: "invite" }
]);
function canRead(channel, viewer) {
  return !!viewer && !!channel && !channel.archived && !channel.cached && !channel.pending && !channel.metadataPending && !channel.metadataCached && Array.isArray(channel.members) && channel.members.includes(viewer);
}
function canBind(channel, viewer) {
  return canRead(channel, viewer) && !channel.readOnly;
}
function validateBinding(value, viewer) {
  if (value == null) return null;
  if (value.schema !== 1 || value.owner !== viewer || !Number.isInteger(value.revision) || value.revision < 1 || typeof value.channel !== "string" || !value.channel || typeof value.label !== "string" || value.label.length > 100 || value.source && (!key(value.source.message) || typeof value.source.url !== "string" || !isHtml(value.source))) throw Error("\u6267\u884C\u4F1A\u8BDD\u8BB0\u5F55\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u7ED1\u5B9A");
  return value;
}
function isHtml(file) {
  return typeof file?.url === "string" && /^https:\/\//.test(file.url) && (/\.html?(?:[?#]|$)/i.test(file.url) || /\.html?$/i.test(file.name || "") || /^text\/html(?:;|$)/i.test(file.mime || ""));
}
function chooseSource(row, url) {
  const candidates = (row.attachments || []).filter(isHtml);
  for (const match of String(row.content || "").matchAll(/https:\/\/[^\s<>"'()]+\.html?(?:\?[^\s<>"'()]*)?/g)) {
    if (!candidates.some((c) => c.url === match[0])) candidates.push({ url: match[0], name: "\u8BBE\u8BA1\u8BA1\u5212\u4E0E\u6210\u679C.html", mime: "text/html" });
  }
  const found = url ? candidates.find((f) => f.url === url) : candidates.length === 1 ? candidates[0] : null;
  if (!found) throw Error("\u8BF7\u6307\u5B9A\u5F53\u524D\u4F1A\u8BDD\u539F\u6D88\u606F\u4E2D\u7684HTML\u9644\u4EF6");
  if (found.size && found.size > 50 * 1024 * 1024) throw Error("HTML\u9644\u4EF6\u8D85\u8FC750MB");
  const parsed = new URL(found.url);
  if (parsed.username || parsed.password) throw Error("\u9644\u4EF6URL\u4E0D\u53EF\u5305\u542B\u51ED\u636E");
  return { message: row.id, url: found.url, name: found.name || "\u8BBE\u8BA1\u8BA1\u5212\u4E0E\u6210\u679C.html", mime: found.mime || "text/html" };
}
async function exactMessage(session, client, channel, id, check) {
  if (!key(id) || typeof client.effectiveEdit !== "function" || typeof session.thread !== "function") throw Error("\u9700\u8981\u539F\u59CB\u6D88\u606F\u53CA\u5BBF\u4E3B\u8BFB\u53D6\u80FD\u529B");
  check();
  await client.effectiveEdit(id, channel);
  check();
  const thread = session.thread(channel, id, { exact: true });
  try {
    await thread.refresh();
    check();
    const s = thread.snapshot(), row = s.target;
    if (s.targetStatus !== "ready" || row?.id !== id || row.channelId !== channel || row.edited || row.delivery && !["accepted", "seen"].includes(row.delivery)) throw Error("\u539F\u6D88\u606F\u5DF2\u53D8\u5316\u6216\u65E0\u6743\u8BFB\u53D6");
    return row;
  } finally {
    thread.dispose();
  }
}
function agentContext(ctx, client, context) {
  const relay = ctx.agents.relay(client.key), connection = relay?.snapshot(), owner = ctx.relay.snapshot();
  const check = () => {
    client.signal?.throwIfAborted();
    const now = relay?.snapshot(), human = ctx.relay.snapshot();
    if (!client.signal || connection?.status !== "ready" || connection.cached || owner.status !== "ready" || owner.cached || now?.session !== connection.session || now.scope !== connection.scope || now.generation !== connection.generation || human.session !== owner.session || human.generation !== owner.generation || human.scope !== connection.scope || human.session.viewer !== client.owner || connection.session.viewer !== client.owner) throw Error("\u5F53\u524D\u8EAB\u4EFD\u6216\u793E\u533A\u5DF2\u53D8\u5316");
    for (const session of [connection.session, human.session]) {
      const list = session.channels.list(), channel = list.channels.find((c) => c.id === context.channel);
      if (list.status !== "ready" || !canBind(channel, client.owner) || !channel.members.includes(client.pubkey)) throw Error("\u53EA\u80FD\u7ED1\u5B9A\u672C\u4EBA\u548C\u672CAgent\u5747\u53EF\u8BBF\u95EE\u7684\u5F53\u524D\u6267\u884C\u4F1A\u8BDD");
    }
  };
  check();
  return { connection, check };
}
async function bindFromAgent(ctx, client, context, args) {
  const { connection, check } = agentContext(ctx, client, context);
  const request = await exactMessage(connection.session, client, context.channel, args.request_id, check);
  if (request.authorId !== client.owner || !/绑定|执行会话/.test(request.content || "")) throw Error("\u7ED1\u5B9A\u9700\u672C\u4EBA\u660E\u786E\u8981\u6C42\u6267\u884C\u4F1A\u8BDD\u7684\u539F\u59CB\u6307\u4EE4");
  const row = await exactMessage(connection.session, client, context.channel, args.source_message_id, check);
  if (![client.owner, client.pubkey].includes(row.authorId)) throw Error("HTML\u9700\u6765\u81EA\u672C\u4EBA\u6216\u5F53\u524D\u6267\u884CAgent");
  const source = chooseSource(row, args.attachment_url);
  check();
  const collection = ctx.artifactStorage.open(COLLECTION);
  try {
    const old = validateBinding(await collection.preferences.get(PREFERENCE), client.owner);
    check();
    if (old?.request === args.request_id && old.channel === context.channel && old.source?.message === source.message && old.source.url === source.url) return old;
    if ((old?.revision || 0) !== args.expected_revision) throw Error("\u7ED1\u5B9A\u8F6E\u6B21\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6");
    const binding = { schema: 1, revision: args.expected_revision + 1, owner: client.owner, channel: context.channel, label: args.label || "\u6267\u884C\u4F1A\u8BDD", source, request: args.request_id };
    if (binding.label.length > 100) throw Error("\u4F1A\u8BDD\u540D\u79F0\u8FC7\u957F");
    await collection.preferences.update(PREFERENCE, (current) => {
      check();
      if ((current?.revision || 0) !== args.expected_revision) throw Error("\u7ED1\u5B9A\u5DF2\u88AB\u5176\u4ED6\u64CD\u4F5C\u4FEE\u6539");
      return binding;
    });
    check();
    const saved = validateBinding(await collection.preferences.get(PREFERENCE), client.owner);
    check();
    if (saved?.revision !== binding.revision || saved.channel !== binding.channel || saved.source?.message !== binding.source.message) throw Error("\u7ED1\u5B9A\u4FDD\u5B58\u672A\u786E\u8BA4\uFF0C\u8BF7\u56DE\u8BFB\u72B6\u6001");
    return saved;
  } finally {
    collection.close();
  }
}
async function readAttachment(connection, binding, check) {
  check();
  const source = binding?.source;
  if (!source) throw Error("\u5C1A\u672A\u5173\u8054HTML\u6210\u679C");
  const thread = connection.session.thread(binding.channel, source.message, { exact: true });
  try {
    await thread.refresh();
    check();
    const s = thread.snapshot(), row = s.target;
    if (s.targetStatus !== "ready" || row?.id !== source.message || row.channelId !== binding.channel || row.edited) throw Error("HTML\u6765\u6E90\u5DF2\u53D8\u5316\u6216\u65E0\u6743\u8BFB\u53D6");
    chooseSource(row, source.url);
    return connection.session.media(source.url);
  } finally {
    thread.dispose();
  }
}

// REPOS/mobile-design-plan-20261115/plugins/opcb.html-reader/0.1.0-rc.2/source/reader.mjs
var MAX_BYTES = 50 * 1024 * 1024;
async function readSource(source, signal, request = fetch) {
  const response = await request(source, { signal, redirect: "error" });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "\u65E0\u6743\u8BFB\u53D6\u6B64 HTML\uFF0C\u8BF7\u786E\u8BA4\u539F\u804A\u5929\u4E0E\u767B\u5F55\u72B6\u6001" : `\u8BFB\u53D6\u5931\u8D25\uFF08${response.status}\uFF09`);
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("HTML \u6587\u4EF6\u8D85\u8FC7 50 MB");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("\u5F53\u524D\u5BA2\u6237\u7AEF\u4E0D\u652F\u6301\u8BFB\u53D6\u9644\u4EF6\u5185\u5BB9");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parts = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) throw new Error("HTML \u6587\u4EF6\u8D85\u8FC7 50 MB");
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
  } finally {
    await reader.cancel().catch(() => {
    });
  }
  if (!length) throw new Error("HTML \u6587\u4EF6\u4E3A\u7A7A");
  return { html: parts.join(""), size: length };
}
async function startPreview(host, html, source, signal) {
  let child, buffer = "", settle, fail;
  const ready = new Promise((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  ready.catch(() => {
  });
  const stop = () => {
    fail(new Error("\u9884\u89C8\u5DF2\u5173\u95ED"));
    if (child) void child.kill().catch(() => {
    });
  };
  signal.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(() => {
    fail(new Error("\u9884\u89C8\u542F\u52A8\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5 Python 3"));
    if (child) void child.kill().catch(() => {
    });
  }, 2e4);
  try {
    if (signal.aborted) throw new Error("\u9884\u89C8\u5DF2\u5173\u95ED");
    child = await host.spawn("preview", { onStdout(data) {
      buffer += data;
      if (buffer.length > 2048) {
        fail(new Error("\u9884\u89C8\u8FDB\u7A0B\u8FD4\u56DE\u5F02\u5E38"));
        return;
      }
      if (!buffer.includes("\n")) return;
      try {
        const result = JSON.parse(buffer.trim());
        if (!/^http:\/\/127\.0\.0\.1:\d{1,5}\/[A-Za-z0-9_-]{43}\/$/.test(result.url)) throw new Error();
        settle(result.url);
      } catch {
        fail(new Error("\u9884\u89C8\u5730\u5740\u65E0\u6548"));
      }
    } });
    if (signal.aborted) throw new Error("\u9884\u89C8\u5DF2\u5173\u95ED");
    child.exited.then(() => fail(new Error("\u9884\u89C8\u8FDB\u7A0B\u5DF2\u9000\u51FA\uFF0C\u8BF7\u68C0\u67E5 Python 3")));
    const input = JSON.stringify(source) + "\n" + JSON.stringify({ html }) + "\n";
    for (let offset = 0; offset < input.length; offset += 65536) {
      if (signal.aborted) throw new Error("\u9884\u89C8\u5DF2\u5173\u95ED");
      await child.write(input.slice(offset, offset + 65536));
    }
    const url = await ready;
    return { url, close: stop, exited: child.exited };
  } catch (error) {
    stop();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// REPOS/mobile-design-plan-20261115/src/mobile-design/plugin.mjs
var inject = ["react", "pages", "conversation", "relay", "artifactStorage", "agents", "browser", "host"];
function apply(ctx) {
  const R = ctx.react, h = R.createElement, ID = "opcb.mobile-design";
  const current = () => ctx.relay.snapshot();
  const button = (text, onClick, props = {}) => h("button", { type: "button", onClick, ...props }, text);
  const inset = { padding: "var(--space-panel-inset, 20px)" }, row = { display: "flex", alignItems: "center", gap: "var(--space-2, 8px)", flexWrap: "wrap" }, muted = { color: "var(--text-subtle)", fontSize: 18 };
  const destination = { version: 1, kind: "plugin", pluginId: ID, pageId: "design" };
  function check(connection) {
    const now = current();
    if (now.status !== "ready" || now.cached || !now.session?.viewer || now.session !== connection.session || now.scope !== connection.scope || now.generation !== connection.generation) throw Error("\u5F53\u524D\u8EAB\u4EFD\u6216\u793E\u533A\u5DF2\u53D8\u5316");
  }
  function useBinding(connection) {
    const [state, setState] = R.useState({ loading: true, binding: null, error: "" });
    const collection = R.useRef(null);
    R.useEffect(() => {
      let alive = true, ticket = 0, off;
      try {
        const store = ctx.artifactStorage.open(COLLECTION);
        collection.current = store;
        const load = async () => {
          const n = ++ticket;
          try {
            const binding = validateBinding(await store.preferences.get(PREFERENCE), connection.session.viewer);
            check(connection);
            if (alive && n === ticket) setState({ loading: false, binding, error: "" });
          } catch (error) {
            if (alive && n === ticket) setState({ loading: false, binding: null, error: error.message });
          }
        };
        off = store.subscribe(() => void load());
        void load();
        return () => {
          alive = false;
          ticket++;
          off?.();
          collection.current = null;
          store.close();
        };
      } catch (error) {
        collection.current?.close();
        collection.current = null;
        setState({ loading: false, binding: null, error: error.message });
        return () => {
          alive = false;
        };
      }
    }, [connection.session, connection.scope, connection.generation]);
    const save = async (channel) => {
      const store = collection.current;
      if (!store) throw Error("\u4E2A\u4EBA\u8BBE\u7F6E\u5C1A\u672A\u5C31\u7EEA");
      check(connection);
      const c = connection.session.channels.list().channels.find((c2) => c2.id === channel);
      if (!canBind(c, connection.session.viewer)) throw Error("\u6B64\u4F1A\u8BDD\u5F53\u524D\u4E0D\u53EF\u6267\u884C");
      const revision = state.binding?.revision || 0;
      await store.preferences.update(PREFERENCE, (old) => {
        check(connection);
        if ((old?.revision || 0) !== revision) throw Error("\u7ED1\u5B9A\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u6838\u5BF9");
        if (old?.channel === channel) return old;
        return { schema: 1, revision: revision + 1, owner: connection.session.viewer, channel, label: c.name || "\u6267\u884C\u4F1A\u8BDD", source: null };
      });
      check(connection);
    };
    return { ...state, save };
  }
  function Preview({ connection, binding, allowed, localHtml }) {
    const [state, setState] = R.useState({ url: "", error: "", loading: false }), [refresh, setRefresh] = R.useState(0);
    const available = ctx.browser.available && typeof ctx.host.spawn === "function";
    R.useEffect(() => {
      setState({ url: "", error: "", loading: false });
      if (!available || !allowed || !localHtml && !binding?.source) return;
      const controller = new AbortController();
      let close;
      const guard = () => {
        controller.signal.throwIfAborted();
        check(connection);
        const list = connection.session.channels.list(), c = list.channels.find((c2) => c2.id === binding.channel);
        if (list.status !== "ready" || !canBind(c, connection.session.viewer)) throw Error("\u6765\u6E90\u4F1A\u8BDD\u6743\u9650\u5DF2\u53D8\u5316");
      };
      setState({ url: "", error: "", loading: true });
      (async () => {
        guard();
        const html = localHtml || (await readSource(await readAttachment(connection, binding, guard), controller.signal)).html;
        guard();
        const preview = await startPreview(ctx.host, html, `"""Ephemeral, memory-only HTML preview for Buzz's bridge-free native browser."""
import json, secrets, sys, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LIMIT = 50 * 1024 * 1024
line = sys.stdin.readline(LIMIT * 6 + 1024)
if not line.endswith('\\n'):
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
`, controller.signal);
        close = preview.close;
        guard();
        setState({ url: preview.url, error: "", loading: false });
        preview.exited.then(() => {
          if (!controller.signal.aborted) setState({ url: "", error: "\u9884\u89C8\u8FDB\u7A0B\u5DF2\u505C\u6B62", loading: false });
        });
      })().catch((error) => {
        close?.();
        if (!controller.signal.aborted) setState({ url: "", error: error.message, loading: false });
      });
      return () => {
        controller.abort();
        close?.();
      };
    }, [connection.session, connection.scope, connection.generation, binding, allowed, localHtml, refresh, available]);
    R.useEffect(() => {
      if (!binding?.source || typeof connection.session.subscribeLive !== "function") return;
      return connection.session.subscribeLive((batch) => {
        const id = binding.source.message;
        if (batch.events?.some((e) => e.id === id || e.tags?.some((t) => t[0] === "e" && t[1] === id))) {
          setState({ url: "", error: "", loading: true });
          setRefresh((n) => n + 1);
        }
      });
    }, [connection.session, binding]);
    if (!available) return h("div", { style: inset }, h("h2", null, "\u5F53\u524D\u5BA2\u6237\u7AEF\u4E0D\u652F\u6301\u5185\u5D4C\u9884\u89C8"), h("p", { style: muted }, "\u672C\u7248\u9700\u8981Mac Buzz\u548CPython 3\uFF1B\u6267\u884C\u4F1A\u8BDD\u4ECD\u7531\u5BBF\u4E3B\u63A7\u5236\u3002"));
    if (state.url) return h("div", { style: { flex: 1, minHeight: 0, display: "flex", position: "relative" } }, h(ctx.browser.View, { url: state.url, label: "OPCB \u5E73\u53F0\u624B\u673A\u7248\u8BBE\u8BA1\u8BA1\u5212\u4E0E\u6210\u679C" }));
    return h("div", { style: inset, "aria-busy": state.loading }, h("h2", null, state.loading ? "\u6B63\u5728\u6253\u5F00\u8BBE\u8BA1\u7A3F" : state.error ? "\u672A\u80FD\u8BFB\u53D6\u8BBE\u8BA1\u7A3F" : "\u7B49\u5F85\u5173\u8054HTML\u6210\u679C"), h("p", { style: muted }, state.error || "\u539F\u4F1A\u8BDD\u4E2D\u7684HTML\u9644\u4EF6\u4FDD\u7559\u539F\u6743\u9650\uFF0C\u4E0D\u968F\u516C\u5F00\u63D2\u4EF6\u5206\u53D1\u3002"), state.error && button("\u91CD\u8BD5", () => setRefresh((n) => n + 1)));
  }
  const skin = `.opcb-md{--md-paper:var(--bg-panel,var(--background-primary,#fefcfb));--md-ink:var(--text-primary,#202022);background:#0d0c0f;color:var(--md-ink);font-family:Nunito,"PingFang SC",sans-serif;padding:12px;gap:12px}.opcb-md .md-toolbar{background:#0d0c0f;color:#f7f5f3;border:0!important;padding:12px 8px!important;gap:12px!important}.opcb-md button{border:0;border-radius:26px;min-height:46px;padding:10px 18px;font:inherit;font-size:18px;font-weight:600;background:#29272c;color:#e5e1e8;cursor:pointer}.opcb-md button[aria-pressed=true]{background:#f7f5f3;color:#19191b}.opcb-md button:focus-visible{outline:3px solid #fa543c;outline-offset:3px}.opcb-md .md-surface{background:var(--md-paper);border-radius:22px;min-height:0;flex:1;overflow:hidden;display:flex;flex-direction:column}.opcb-md .md-plan{padding:32px;overflow:auto;flex:1}.opcb-md h2{font-size:30px;line-height:1.3;margin:0 0 24px;font-weight:800}.opcb-md .md-plan-row{display:flex;align-items:center;gap:20px;border-bottom:1px solid var(--border-standard,#e4e2e0);padding:24px 0}.opcb-md .md-plan-row strong{display:block;font-size:22px;font-weight:700}.opcb-md .md-plan-row p{font-size:20px;margin:10px 0 0;color:var(--text-subtle,#777)}.opcb-md .md-number{font-size:28px;color:var(--text-subtle,#888)}.opcb-md .md-plan-note{margin-top:32px;font-size:20px;line-height:1.6}.opcb-md .md-label{font-size:18px;color:#c1bbc6;margin-left:auto}@media(max-width:700px){.opcb-md{padding:8px}.opcb-md .md-plan{padding:24px}.opcb-md .md-label{display:none}.opcb-md .md-toolbar{flex-wrap:wrap}.opcb-md .md-plan-row{gap:12px}}`;
  const changes = ["\u4EBA\u7269\u3001\u4F5C\u54C1\u3001\u64CD\u4F5C\u8FDE\u5728\u4E00\u8D77", "\u5BF9\u8BDD\u91CC\u786E\u8BA4\u7D20\u6750\u3001\u67E5\u770B\u5236\u4F5C\u72B6\u6001", "\u4EBA\u7269\u5927\u56FE\u3001\u7D20\u6750\u6A2A\u6392\u3001\u5E95\u90E8\u6267\u884C", "\u4F5C\u54C1\u5360\u4E3B\u5C4F\uFF0C\u4FDD\u5B58\u53D1\u5E03\u6536\u5728\u5E95\u90E8", "\u5B8C\u6574\u753B\u9762\u5F00\u573A\uFF0C\u5E95\u90E8\u8F93\u5165\u9080\u8BF7\u7801"];
  function Plan() {
    return h("div", { className: "md-plan" }, h("h2", null, "\u628A\u53C2\u8003\uFF0C\u53D8\u6210\u9875\u9762"), ...MAPPINGS.map((m, i) => h("section", { key: m.reference, className: "md-plan-row" }, h("span", { className: "md-number" }, `0${i + 1}`), h("div", null, h("strong", null, `${m.reference} \u2192 ${m.target}`), h("p", null, changes[i])))), h("div", { className: "md-plan-note" }, h("strong", null, "R2 \xB7 \u53C2\u8003\u4E0E\u6539\u7A3F\u9010\u9879\u5BF9\u7167"), h("p", null, "\u6210\u679C\u4FDD\u7559\u5B8C\u6574\u624B\u673A\u6D41\u7A0B\uFF0C\u5E76\u65B0\u589E Agent \u5BF9\u8BDD\u6F14\u793A\u3002\u5B9E\u9645\u9875\u9762\u4EE5\u672C\u4EBA\u5173\u8054\u7684 HTML \u4E3A\u51C6\u3002")));
  }
  function Content({ connection, binding, allowed, open, close, isOpen }) {
    const [mode, setMode] = R.useState("\u6210\u679C"), [notice, setNotice] = R.useState(""), [localHtml, setLocalHtml] = R.useState("");
    const input = R.useRef(null);
    const key2 = binding ? `${binding.channel}:${binding.revision}` : "";
    const navigation = R.useRef({ open, close, isOpen });
    navigation.current = { open, close, isOpen };
    R.useEffect(() => {
      setLocalHtml("");
      setNotice("");
    }, [key2]);
    R.useEffect(() => {
      const nav = navigation.current;
      if (!binding || !allowed || !nav.open) return;
      const target = { channelId: binding.channel };
      if (!nav.isOpen?.(target) && nav.open(target) === false) setNotice("\u5BBF\u4E3B\u672A\u80FD\u6253\u5F00\u6267\u884C\u4F1A\u8BDD\uFF0C\u8BF7\u6838\u5BF9\u6210\u5458\u6743\u9650");
      return () => nav.close?.(target);
    }, [connection.session, connection.scope, connection.generation, key2, allowed]);
    async function importFile(file) {
      if (!file) return;
      try {
        check(connection);
        if (!/\.html?$/i.test(file.name) || file.size <= 0 || file.size > 50 * 1024 * 1024) throw Error("\u8BF7\u9009\u62E9\u4E0D\u8D85\u8FC750MB\u7684HTML");
        const html = await file.text();
        check(connection);
        setLocalHtml(html);
        setMode("\u6210\u679C");
      } catch (error) {
        setNotice(error.message);
      }
    }
    return h("section", { className: "opcb-md", style: { height: "100%", minHeight: 0, display: "flex", flexDirection: "column", minWidth: 0 } }, h("style", null, skin), h("div", { className: "md-toolbar", style: { ...row, ...inset, borderBottom: "1px solid var(--border-standard)" } }, ...["\u8BA1\u5212", "\u6210\u679C"].map((m) => button(m, () => setMode(m), { "aria-pressed": mode === m, key: m })), h("span", { className: "md-label" }, binding?.label || "\u5C1A\u672A\u7ED1\u5B9A\u6267\u884C\u4F1A\u8BDD"), button("\u5BFC\u5165HTML", () => input.current?.click(), { disabled: !allowed }), binding && open && button("\u6253\u5F00\u6267\u884C\u4F1A\u8BDD", () => open({ channelId: binding.channel }))), h("input", { type: "file", accept: ".html,.htm,text/html", hidden: true, ref: input, onChange: (e) => {
      void importFile(e.target.files?.[0]);
      e.target.value = "";
    } }), notice && h("p", { role: "status", style: inset }, notice), h("div", { className: "md-surface" }, mode === "\u8BA1\u5212" ? h(Plan) : h(Preview, { connection, binding, allowed, localHtml })));
  }
  function Workspace({ connection }) {
    const binding = useBinding(connection);
    const roster = R.useSyncExternalStore(connection.session.channels.subscribeList, connection.session.channels.list, connection.session.channels.list);
    const [selected, setSelected] = R.useState(""), [notice, setNotice] = R.useState("");
    R.useEffect(() => {
      connection.session.channels.ensureList();
    }, [connection.session]);
    const allowed = roster.status === "ready" && binding.binding && canBind(roster.channels.find((c) => c.id === binding.binding.channel), connection.session.viewer);
    const Tabs = ctx.conversation.ui.Tabs;
    const pane = !binding.loading && !allowed ? h("div", { style: inset }, h("h2", null, binding.binding ? "\u6267\u884C\u4F1A\u8BDD\u6682\u4E0D\u53EF\u7528" : "\u5173\u8054\u6267\u884C\u4F1A\u8BDD"), h("p", { style: muted }, binding.error || "\u5B89\u88C5\u540E\u53EF\u5728\u539F\u5BF9\u8BDD\u7ED1\u5B9AHTML\u6210\u679C\uFF1B\u4E5F\u53EF\u7531\u672C\u4EBA\u9009\u62E9\u5DF2\u6709\u4F1A\u8BDD\u3002"), h("div", { style: row }, h("select", { value: selected, "aria-label": "\u9009\u62E9\u6267\u884C\u4F1A\u8BDD", onChange: (e) => setSelected(e.target.value), style: { minHeight: 44, maxWidth: "100%" } }, h("option", { value: "" }, "\u9009\u62E9\u5DF2\u6709\u4F1A\u8BDD"), ...(roster.status === "ready" ? roster.channels.filter((c) => canBind(c, connection.session.viewer)) : []).map((c) => h("option", { key: c.id, value: c.id }, c.name || c.id))), button("\u7ED1\u5B9A", () => {
      void binding.save(selected).catch((e) => setNotice(e.message));
    }, { disabled: !selected })), notice && h("p", { role: "alert" }, notice), h(Plan)) : null;
    if (pane) return pane;
    if (binding.loading) return h("p", { style: inset, role: "status" }, "\u6B63\u5728\u8BFB\u53D6\u4E2A\u4EBA\u7ED1\u5B9A\u2026");
    if (!Tabs) return h("div", { style: inset }, h("h2", null, "\u8BF7\u542F\u7528Buzz\u7684Channels\u63D2\u4EF6"), h("p", { style: muted }, "\u53F3\u4FA7\u6267\u884C\u4F1A\u8BDD\u4F7F\u7528\u5BBF\u4E3B\u539F\u751F\u804A\u5929\uFF0C\u4E0D\u53E6\u9020\u804A\u5929\u7EC4\u4EF6\u3002"));
    return h(Tabs, { id: "opcb-mobile-design", session: connection.session, scope: connection.scope, label: "\u624B\u673A\u8BBE\u8BA1\u8BA1\u5212\u4E0E\u6210\u679C", children: (open, close, isOpen) => h(Content, { key: `${binding.binding.channel}:${binding.binding.revision}`, connection, binding: binding.binding, allowed, open, close, isOpen }) });
  }
  function Page() {
    const connection = R.useSyncExternalStore(ctx.relay.subscribe, ctx.relay.snapshot, ctx.relay.snapshot);
    return connection.status === "ready" && !connection.cached && connection.session?.viewer ? h(Workspace, { key: JSON.stringify([connection.scope, connection.generation]), connection }) : h("p", { style: inset }, "\u8BF7\u8FDE\u63A5\u793E\u533A\u5E76\u4F7F\u7528\u672C\u4EBA\u8EAB\u4EFD\u6253\u5F00\u3002");
  }
  ctx.pages.register({ id: "design", title: "OPCB \u5E73\u53F0\u624B\u673A\u7248\u8BBE\u8BA1\u8BA1\u5212\u4E0E\u6210\u679C", primary: true, placement: "sidebar", layout: "workspace", component: Page });
  ctx.agents.addTool({ name: "opcb_mobile_design_context", description: "\u8BFB\u53D6\u624B\u673A\u7248\u8BBE\u8BA1\u63D2\u4EF6\u5728\u672C\u4EBA\u5F53\u524D\u8EAB\u4EFD\u4E0B\u7684\u6267\u884C\u4F1A\u8BDD\u4E0EHTML\u6765\u6E90\u7ED1\u5B9A\uFF0C\u4E0D\u8BFB\u53D6\u5176\u4ED6\u804A\u5929\u3001\u4E0D\u53D1\u9001\u6D88\u606F\u3002", inputSchema: { type: "object", properties: {}, additionalProperties: false }, async call(client, context) {
    const { check: check2 } = agentContext(ctx, client, context);
    const store = ctx.artifactStorage.open(COLLECTION);
    try {
      const binding = validateBinding(await store.preferences.get(PREFERENCE), client.owner);
      check2();
      if (binding && binding.channel !== context.channel) throw Error("\u8BF7\u5728\u5DF2\u7ED1\u5B9A\u7684\u539F\u6267\u884C\u4F1A\u8BDD\u8BFB\u53D6");
      return JSON.stringify({ binding, revision: binding?.revision || 0, page: destination });
    } finally {
      store.close();
    }
  } });
  ctx.agents.addTool({ name: "opcb_mobile_design_bind", description: "\u6309\u672C\u4EBA\u660E\u786E\u539F\u6307\u4EE4\uFF0C\u5C06\u5F53\u524D\u4F1A\u8BDD\u548C\u5176\u4E2D\u7684HTML\u9644\u4EF6\u5173\u8054\u4E3A\u624B\u673A\u7248\u8BBE\u8BA1\u63D2\u4EF6\u7684\u6267\u884C\u4F1A\u8BDD\u4E0E\u6210\u679C\u3002\u53EA\u5B58\u4E2A\u4EBA\u7ED1\u5B9A\uFF0C\u4E0D\u65B0\u5EFA\u804A\u5929\u3001\u4E0D\u53D1\u6D88\u606F\u3001\u4E0D\u6269\u5927\u7D20\u6750\u6743\u9650\u3002", inputSchema: { type: "object", properties: { request_id: { type: "string" }, source_message_id: { type: "string" }, attachment_url: { type: "string" }, label: { type: "string", maxLength: 100 }, expected_revision: { type: "integer", minimum: 0 } }, required: ["request_id", "source_message_id", "expected_revision"], additionalProperties: false }, async call(client, context, args) {
    return JSON.stringify(await bindFromAgent(ctx, client, context, args));
  } });
}
export {
  apply,
  inject
};

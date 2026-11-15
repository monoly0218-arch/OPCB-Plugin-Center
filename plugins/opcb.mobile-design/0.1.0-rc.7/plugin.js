// src/mobile-design/live.mjs
async function startLive(host, source, helper, signal, onEvent) {
  let child, buffer = "", resolve, reject, readyDone = false, stopped = false, queue = Promise.resolve();
  const ready = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  ready.catch(() => {
  });
  const stop = () => {
    if (stopped) return;
    stopped = true;
    reject(Error("Preview closed"));
    if (child) void child.kill().catch(() => {
    });
  };
  signal.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(() => {
    reject(Error("Preview startup timed out"));
    stop();
  }, 2e4);
  try {
    signal.throwIfAborted();
    child = await host.spawn("preview", { onStdout(data) {
      buffer += data;
      if (buffer.length > 256e3) {
        stop();
        return;
      }
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        try {
          const event = JSON.parse(line);
          if (!readyDone) {
            if (!/^http:\/\/127\.0\.0\.1:\d{1,5}\/[A-Za-z0-9_-]{43}\/$/.test(event.url)) throw Error("Invalid preview URL");
            readyDone = true;
            resolve(event.url);
          } else onEvent(event);
        } catch (error) {
          if (!readyDone) reject(error);
        }
      }
    } });
    signal.throwIfAborted();
    child.exited.then(() => reject(Error("Preview process stopped")));
    await child.write(JSON.stringify(source) + "\n");
    await child.write(JSON.stringify({ helper }) + "\n");
    const url = await ready;
    const write = (message) => {
      queue = queue.then(async () => {
        signal.throwIfAborted();
        const line = JSON.stringify(message) + "\n";
        for (let i = 0; i < line.length; i += 65536) {
          signal.throwIfAborted();
          await child.write(line.slice(i, i + 65536));
        }
      });
      return queue;
    };
    return { url, close: stop, exited: child.exited, control: (action, value) => write({ type: "control", action, value }), update: (html, source2) => write({ type: "document", html, source: source2 }), marks: (notes) => write({ type: "marks", notes }), ack: (id, error) => write({ type: "note-status", id, error }) };
  } catch (error) {
    stop();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// src/mobile-design/annotations.mjs
function validateNote(note) {
  if (!note || typeof note.id !== "string" || note.id.length > 80 || typeof note.page !== "string" || note.page.length > 120 || typeof note.selector !== "string" || note.selector.length > 500 || typeof note.comment !== "string" || note.comment.length > 2e3 || !note.comment.trim() || !Array.isArray(note.rect) || note.rect.length !== 4 || note.rect.some((n) => !Number.isFinite(n) || n < 0 || n > 1) || note.rect[2] <= 0 || note.rect[3] <= 0 || note.rect[0] + note.rect[2] > 1.001 || note.rect[1] + note.rect[3] > 1.001 || typeof note.revision !== "string" || !/^[a-f0-9]{64}$/.test(note.revision)) throw Error("Invalid design annotation");
  return { id: note.id, page: note.page, selector: note.selector, comment: note.comment.trim(), rect: note.rect.map((n) => Math.round(n * 1e4) / 1e4), revision: note.revision, label: String(note.label || "Selected area").slice(0, 160), source: note.source && typeof note.source.url === "string" && /^https:\/\//.test(note.source.url) ? { url: note.source.url.slice(0, 2048), message: String(note.source.message || "").slice(0, 64) } : null };
}
function formatNotes(notes, source) {
  if (!notes.length || notes.length > 50) throw Error("Select between 1 and 50 notes");
  return ["Please apply these design changes. Preserve the remaining flow and the agreed Ayo reference mappings.", `Source: ${source?.url || "Local imported HTML"}`, `Source message: ${source?.message || "local"}`, "Coordinates are fractions of the selected phone screen or reference image (x, y, width, height). Each note includes its original document SHA-256; check the current page before applying it.", "", ...notes.map((raw, i) => {
    const n = validateNote(raw);
    return `${i + 1}. Page: ${n.page}
   Element: ${n.selector}
   Area: [${n.rect.join(", ")}]
   Label: ${n.label}
   Source: ${n.source?.url || source?.url || "local HTML"}
   Source message: ${n.source?.message || source?.message || "local"}
   Document: ${n.revision}
   Change: ${n.comment}`;
  })].join("\n");
}
function appendToComposer(editors, connection, channel, text) {
  const matches = [...editors.values()].filter((e) => e.scope === connection.scope && e.session.viewer === connection.session.viewer && e.channelId === channel && !e.threadRootId && !e.disabled);
  if (matches.length !== 1 || matches[0].insertText("\n" + text + "\n") !== true) throw Error("Open the bound execution chat to add this note to its draft");
  return true;
}
async function submitNotes(session, channel, prompt, check) {
  check();
  if (typeof session.messages?.send !== "function") throw Error("Message sending is unavailable");
  const id = await session.messages.send(channel, prompt);
  check();
  if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) throw Error("Submission was not confirmed. Check the chat before trying again.");
  return id;
}

// src/mobile-design/binding.mjs
var key = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
var COLLECTION = { name: "mobile-design-workspace", type: "opcb.mobile-design.workspace", version: 1, project: () => [] };
var PREFERENCE = "execution-binding";
var MAPPINGS = Object.freeze([
  { reference: "Social feed", target: "Home", page: "home" },
  { reference: "Conversation & status", target: "OPCB Agent chat", page: "agent_chat" },
  { reference: "People discovery", target: "Create with your photo", page: "ready" },
  { reference: "Profile", target: "Save & publish", page: "detail" },
  { reference: "Live / route result", target: "Invite", page: "invite" }
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

// plugins/opcb.html-reader/0.1.0-rc.2/source/reader.mjs
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

// src/mobile-design/plugin.mjs
var PHONE_ICON = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect x="11" y="2" width="26" height="44" rx="7" fill="#dce6f2"/><rect x="14" y="5" width="20" height="38" rx="5" fill="#233449"/><rect x="16" y="9" width="16" height="28" rx="2" fill="#86b7de"/><path d="M21 6.5h6M21 40h6" stroke="#dce6f2" stroke-width="2" stroke-linecap="round"/></svg>');
var inject = ["react", "pages", "conversation", "relay", "artifactStorage", "agents", "browser", "host"];
function apply(ctx) {
  const R = ctx.react, h = R.createElement, ID = "opcb.mobile-design";
  const editors = /* @__PURE__ */ new Map();
  const current = () => ctx.relay.snapshot();
  function DraftTool(props) {
    const key2 = R.useRef(/* @__PURE__ */ Symbol());
    R.useEffect(() => {
      editors.set(key2.current, props);
      return () => editors.delete(key2.current);
    }, [props]);
    return null;
  }
  if (typeof ctx.conversation?.registerTool === "function") ctx.conversation.registerTool({ id: "design-annotation-draft", title: "Design note draft bridge", component: DraftTool });
  const uiError = (e) => /[\u3400-\u9fff]/.test(e?.message || "") ? "Could not load this workspace. Check your access and try again." : e?.message || "Could not load this workspace.";
  const button = (text, onClick, props = {}) => h("button", { type: "button", onClick, ...props }, text);
  const inset = { padding: "var(--space-panel-inset, 20px)" }, row = { display: "flex", alignItems: "center", gap: "var(--space-2, 8px)", flexWrap: "wrap" }, muted = { color: "var(--text-subtle)", fontSize: 18 };
  const destination = { version: 1, kind: "plugin", pluginId: ID, pageId: "design" };
  function check(connection) {
    const now = current();
    if (now.status !== "ready" || now.cached || !now.session?.viewer || now.session !== connection.session || now.scope !== connection.scope || now.generation !== connection.generation) throw Error("Your identity or community changed");
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
            if (alive && n === ticket) setState((old) => !old.loading && !old.error && JSON.stringify(old.binding) === JSON.stringify(binding) ? old : { loading: false, binding, error: "" });
          } catch (error) {
            if (alive && n === ticket) setState({ loading: false, binding: null, error: uiError(error) });
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
        setState({ loading: false, binding: null, error: uiError(error) });
        return () => {
          alive = false;
        };
      }
    }, [connection.session, connection.scope, connection.generation]);
    const save = async (channel) => {
      const store = collection.current;
      if (!store) throw Error("Your personal settings are not ready");
      check(connection);
      const c = connection.session.channels.list().channels.find((c2) => c2.id === channel);
      if (!canBind(c, connection.session.viewer)) throw Error("This conversation is not available");
      const revision = state.binding?.revision || 0;
      await store.preferences.update(PREFERENCE, (old) => {
        check(connection);
        if ((old?.revision || 0) !== revision) throw Error("The connection changed. Review it again.");
        if (old?.channel === channel) return old;
        return { schema: 1, revision: revision + 1, owner: connection.session.viewer, channel, label: c.name || "Execution chat", source: null };
      });
      check(connection);
    };
    return { ...state, save };
  }
  function Preview({ connection, binding, allowed, localHtml, mode, control }) {
    const [state, setState] = R.useState({ url: "", error: "", loading: false }), [retry, setRetry] = R.useState(0), [notes, setNotes] = R.useState([]), [notice, setNotice] = R.useState(""), [sending, setSending] = R.useState(false);
    const runtime = R.useRef(null), latest = R.useRef(null), store = R.useRef(null), busy = R.useRef(false), sourceByVersion = R.useRef(/* @__PURE__ */ new Map()), transferred = R.useRef(/* @__PURE__ */ new Set());
    latest.current = { binding, localHtml, mode, notes };
    const available = ctx.browser.available && typeof ctx.host.spawn === "function";
    const guard = () => {
      check(connection);
      const list = connection.session.channels.list(), c = list.channels.find((c2) => c2.id === binding.channel);
      if (!allowed || list.status !== "ready" || !canBind(c, connection.session.viewer)) throw Error("Access to the execution conversation changed");
    };
    const preference = "annotation-drafts:" + binding.channel;
    R.useEffect(() => {
      const collection = ctx.artifactStorage.open(COLLECTION);
      store.current = collection;
      let alive = true, ticket = 0;
      const load = async () => {
        const n = ++ticket;
        try {
          const raw = await collection.preferences.get(preference);
          guard();
          const list = (raw?.notes || []).map(validateNote);
          if (alive && n === ticket) setNotes((old) => JSON.stringify(old) === JSON.stringify(list) ? old : list);
        } catch (error) {
          if (alive) setNotice(uiError(error));
        }
      };
      const off = collection.subscribe(() => void load());
      void load();
      return () => {
        alive = false;
        ticket++;
        off();
        store.current = null;
        collection.close();
      };
    }, [connection.session, connection.scope, connection.generation, binding.channel, allowed]);
    R.useEffect(() => {
      void runtime.current?.marks(notes).catch(() => {
      });
    }, [notes]);
    R.useEffect(() => {
      if (control) void runtime.current?.control(control.action, control.value).catch((e) => setNotice(uiError(e)));
    }, [control]);
    R.useEffect(() => {
      if (!available || !allowed) return;
      const controller = new AbortController();
      let preview, loadTicket = 0, lastHash = "";
      setState({ url: "", error: "", loading: true });
      (async () => {
        guard();
        preview = await startLive(ctx.host, `"""Memory-only live preview. Only annotations cross the isolated document boundary."""
import hashlib, json, queue, re, secrets, sys, threading
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
LIMIT = 50 * 1024 * 1024
config = json.loads(sys.stdin.readline(1024 * 1024))
helper = config['helper']
token = '/' + secrets.token_urlsafe(32) + '/'
csrf = secrets.token_urlsafe(32)
lock = threading.RLock()
clients = set()
current = None
versions = []
notes = []
last_control = None
documents = OrderedDict()

def emit(event):
    with lock:
        print(json.dumps(event, ensure_ascii=True), flush=True)

def broadcast(event):
    with lock:
        for client in list(clients):
            try:
                client.put_nowait(event)
            except queue.Full:
                clients.discard(client)

DOCUMENT_POLICY = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: data:; style-src 'unsafe-inline' blob: data:; img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"

def prepare(html, source):
    raw = html.encode('utf-8')
    if not raw or len(raw) > LIMIT:
        raise ValueError('HTML must be between 1 byte and 50 MB')
    revision = hashlib.sha256(raw).hexdigest()
    # Keep the inner page on HTTP: Buzz validates every subframe navigation.
    # The opaque-origin sandbox and document CSP still deny host/network access.
    html = '<meta name="opcb-document" content="' + revision + '">' + html
    html += '<script>' + helper.replace('<\/script', '<\\\\/script') + '<\/script>'
    with lock:
        documents[revision] = html.encode('utf-8')
        documents.move_to_end(revision)
        while len(documents) > 3:
            documents.popitem(last=False)
    return dict(type='document', revision=revision, source=source)

SHELL = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{height:100%;margin:0;background:#0d0c0f;font:18px system-ui;color:#fff}body{display:flex;flex-direction:column}header[hidden]{display:none}header{padding:10px 16px;display:flex;gap:16px;align-items:center}#retry{font:inherit;color:inherit;background:transparent;border:1px solid #777;border-radius:8px;padding:6px 12px}#status{margin-left:auto;font-size:16px;color:#b9d9bb}iframe{border:0;flex:1;min-height:0;width:100%}</style><header hidden><span>Live design</span><span id="status" role="status">Connecting\u2026</span><button id="retry" hidden>Retry preview</button></header><iframe sandbox="allow-scripts allow-downloads" title="Mobile design preview"></iframe><script>
const base=location.pathname,csrf=__CSRF__,frame=document.querySelector('iframe'),status=document.querySelector('#status');let current=null,pending=null,state=null,notes=[],loading=false,timer,initialized='';const retry=document.querySelector('#retry');
const tell=m=>frame.contentWindow?.postMessage({opcbDesign:1,...m},'*');
async function load(doc){initialized='';loading=true;current=doc;retry.hidden=true;clearTimeout(timer);frame.src=base+'document/'+doc.revision;status.textContent='Applying latest design\u2026';timer=setTimeout(()=>{status.textContent='Design did not open. Retry the preview.';retry.hidden=false;status.closest('header').hidden=false},15000)}
retry.onclick=()=>current&&load(current)
async function event(message){const response=await fetch(base+'event',{method:'POST',headers:{'Content-Type':'application/json','X-Design-Token':csrf},body:JSON.stringify(message)});if(!response.ok)throw Error('Annotation could not be saved')}
window.addEventListener('message',async e=>{if(e.source!==frame.contentWindow||e.data?.opcbDesign!==1)return;const m=e.data;
if(m.type==='ready'&&m.revision===current?.revision&&initialized!==m.revision){initialized=m.revision;tell({type:'init',revision:current.revision,notes,...state})}
if(m.type==='applied'&&m.revision===current?.revision){clearTimeout(timer);retry.hidden=true;status.closest('header').hidden=true;loading=false;status.textContent='Live \xB7 '+m.revision.slice(0,8);if(pending)tell({type:'snapshot'})}
if(m.type==='busy')status.textContent='Update waits for your note';
if(m.type==='state'){state={state:m.state,viewer:m.viewer,scroll:m.scroll,theme:m.theme};if(pending){const next=pending;pending=null;load(next)}}
if(m.type==='note'){status.textContent='Saving note\u2026';try{await event({type:'note',note:m.note})}catch{status.textContent='Could not save note \xB7 try again';tell({type:'note-status',id:m.note.id,error:'Could not save note. Try again.'})}}
});
const events=new EventSource(base+'events');events.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='document'){if(current?.revision===m.revision)return;pending=m;if(!current){pending=null;load(m)}else if(!loading)tell({type:'snapshot'})}if(m.type==='marks'){if(JSON.stringify(notes)!==JSON.stringify(m.notes)){notes=m.notes;tell(m)}}if(m.type==='control')tell(m);if(m.type==='note-status'){tell(m);status.textContent=m.error?'Note could not be saved':'Live \xB7 '+(current?.revision||'').slice(0,8)}};events.onerror=()=>status.textContent='Connection interrupted \xB7 reconnecting';
<\/script></html>'''.replace('__CSRF__', json.dumps(csrf))

class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def valid(self):
        return self.headers.get('Host') == '127.0.0.1:' + str(self.server.server_port)
    def reply(self, status, body, kind='application/json', policy=None):
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Connection', 'close')
        self.close_connection = True
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', policy or "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src 'self'; img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors *")
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        if not self.valid():
            return self.reply(404, b'{}')
        if self.path == token:
            return self.reply(200, SHELL.encode(), 'text/html; charset=utf-8')
        if self.path.startswith(token + 'document/'):
            revision = self.path[len(token + 'document/'):]
            with lock:
                body = documents.get(revision) if re.fullmatch('[a-f0-9]{64}', revision) else None
            if body is None:
                return self.reply(404, b'{}')
            return self.reply(200, body, 'text/html; charset=utf-8', DOCUMENT_POLICY)
        if self.path != token + 'events':
            return self.reply(404, b'{}')
        stream = queue.Queue(maxsize=8)
        with lock:
            clients.add(stream)
            if current:
                stream.put(current)
            stream.put(dict(type='marks', notes=notes))
            if last_control:
                stream.put(last_control)
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        try:
            while True:
                try:
                    event = stream.get(timeout=15)
                    self.wfile.write(('data: ' + json.dumps(event) + '\\n\\n').encode())
                except queue.Empty:
                    self.wfile.write(b': keepalive\\n\\n')
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            with lock:
                clients.discard(stream)
    def do_POST(self):
        origin = 'http://127.0.0.1:' + str(self.server.server_port)
        if not self.valid() or self.path != token + 'event' or self.headers.get('X-Design-Token') != csrf or self.headers.get('Origin') != origin:
            return self.reply(403, b'{}')
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 16000:
                raise ValueError('event too large')
            event = json.loads(self.rfile.read(size))
            note = event.get('note', {})
            if event.get('type') != 'note' or not isinstance(note, dict) or len(json.dumps(note)) > 12000:
                raise ValueError('invalid annotation')
            with lock:
                if note.get('revision') not in versions:
                    raise ValueError('document changed')
            emit(dict(type='note', note=note))
            self.reply(200, b'{"ok":true}')
        except (ValueError, TypeError):
            self.reply(400, b'{}')
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
server.daemon_threads = True
threading.Thread(target=server.serve_forever, daemon=True).start()
emit(dict(url='http://127.0.0.1:' + str(server.server_port) + token))
try:
    while True:
        line = sys.stdin.readline(LIMIT * 6 + 4096)
        if not line:
            break
        if not line.endswith('\\n'):
            raise ValueError('input exceeds limit')
        message = json.loads(line)
        if message.get('type') == 'document':
            revision = hashlib.sha256(message['html'].encode('utf-8')).hexdigest()
            with lock:
                unchanged = current is not None and current['revision'] == revision
            if unchanged:
                continue
            prepared = prepare(message['html'], message.get('source'))
            with lock:
                current = prepared
                versions.append(prepared['revision'])
                versions[:] = versions[-20:]
            broadcast(prepared)
            emit(dict(type='version', revision=prepared['revision']))
        elif message.get('type') == 'note-status':
            broadcast(dict(type='note-status', id=message['id'], error=message.get('error')))
        elif message.get('type') == 'control':
            action = message.get('action')
            if action in ['view', 'annotate', 'theme', 'flow']:
                control = dict(type='control', action=action, value=message.get('value'))
                if action == 'view':
                    last_control = control
                broadcast(control)
        elif message.get('type') == 'marks':
            with lock:
                notes = message.get('notes', [])[:50]
            broadcast(dict(type='marks', notes=notes))
finally:
    server.shutdown()
    server.server_close()
`, "// Injected into the isolated design document. No host or network capability.\n(()=>{\n const send=(type,data={})=>parent.postMessage({opcbDesign:1,type,...data},'*');\n let initialized=false,enabled=false,drag=null,editing=null,notes=[],revision='',pendingSnapshot=false,awaiting=false;\n const style=document.createElement('style');style.textContent=`#md-annotate-tools{position:fixed;inset:auto 16px 16px auto;margin:0;padding:8px;display:flex;gap:8px;border:1px solid #d8d5d2;background:#fff;color:#181719;border-radius:18px;font:18px system-ui;box-shadow:0 4px 24px #0002}#md-annotate-tools button,#md-note-editor button{font:inherit;min-height:44px;border:0;border-radius:12px;padding:8px 16px;background:#181719;color:white}#md-annotate-tools button[aria-pressed=true]{background:#cf3f29}#md-note-editor{font:18px system-ui;background:#fff;color:#181719;max-width:min(480px,90vw);width:480px;border:0;border-radius:20px;padding:24px}#md-note-editor textarea{box-sizing:border-box;width:100%;min-height:120px;font:18px system-ui;padding:12px;margin:16px 0;border:1px solid #aaa;border-radius:12px}#md-note-editor h2{font:24px system-ui;margin:0 0 12px}#md-note-editor menu{padding:0;display:flex;gap:12px;margin:0}#md-draw{position:fixed;border:3px solid #fa543c;background:#fa543c25;pointer-events:none;z-index:2147483646;box-sizing:border-box}#md-note-editor::backdrop{background:#0005}`;style.textContent+=`.design-shell>.design-top,.design-shell>.design-nav{display:none!important}.design-shell{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:minmax(0,1fr)!important;padding:0!important;gap:0!important}`;document.head.append(style);\n const bar=document.createElement('div');bar.id='md-annotate-tools';bar.setAttribute('popover','manual');bar.innerHTML='<button type=\"button\" aria-pressed=\"false\">Annotate</button><span style=\"padding:10px\" role=\"status\">Drag a box</span>';document.body.append(bar);bar.showPopover?.();\n bar.querySelector('button').onclick=e=>{e.stopPropagation();enabled=!enabled;e.currentTarget.setAttribute('aria-pressed',String(enabled));bar.lastElementChild.textContent=enabled?'Select a phone or reference':'Drag a box'};\n const editor=document.createElement('dialog');editor.id='md-note-editor';editor.innerHTML='<h2>Add a design note</h2><div class=\"location\"></div><textarea aria-label=\"Design change\" maxlength=\"2000\" placeholder=\"What should change here?\"></textarea><menu><button type=\"button\" data-save>Save note</button><button type=\"button\" data-cancel>Cancel</button></menu>';document.body.append(editor);\n function finish(){awaiting=false;editor.querySelector('[data-save]').disabled=false;editing=null;editor.close();document.getElementById('md-draw')?.remove();if(pendingSnapshot)void snapshot()}\n editor.querySelector('[data-cancel]').onclick=finish;editor.addEventListener('cancel',e=>{e.preventDefault();finish()});\n editor.querySelector('[data-save]').onclick=()=>{const text=editor.querySelector('textarea').value.trim();if(!text){editor.querySelector('textarea').focus();return}if(awaiting)return;awaiting=true;editor.querySelector('[data-save]').disabled=true;send('note',{note:{...editing,comment:text}});bar.lastElementChild.textContent='Saving note\u2026'};\n function path(el,root){if(!el||el===root)return root.matches('.phone-screen')?'.phone-screen':'.reference-mount img';const parts=[];while(el&&el!==root&&parts.length<6){const tag=el.tagName.toLowerCase();const attrs=['data-action','data-go','data-field','aria-label'].find(a=>el.hasAttribute(a));parts.unshift(attrs?`${tag}[${attrs}=${JSON.stringify(el.getAttribute(attrs))}]`:`${tag}:nth-child(${[...el.parentElement.children].indexOf(el)+1})`);el=el.parentElement}return parts.join(' > ').slice(0,500)}\n function drawMarks(){document.querySelectorAll('.md-saved-mark').forEach(n=>n.remove());document.querySelectorAll('.phone-screen').forEach(root=>{notes.filter(n=>n.page===page(root)&&n.revision===revision).forEach((n,i)=>{const box=document.createElement('div');box.className='md-saved-mark';box.style.cssText=`position:absolute;pointer-events:none;z-index:1000;border:2px solid #fa543c;box-sizing:border-box;left:${n.rect[0]*100}%;top:${n.rect[1]*100}%;width:${n.rect[2]*100}%;height:${n.rect[3]*100}%`;const badge=document.createElement('span');badge.textContent=String(notes.indexOf(n)+1);badge.style.cssText='position:absolute;left:-2px;top:-22px;background:#cf3f29;color:white;font:16px system-ui;padding:2px 7px;border-radius:6px';box.append(badge);root.append(box)})})}\n function page(root){if(root.matches('.source-card img'))return 'Ayo original: '+root.closest('.source-card').querySelector('h2').textContent;if(root.matches('.reference-mount img'))return (typeof appState!=='undefined'?appState.compare:'Reference')+' / Ayo reference';const card=root.closest('.device-card');return root.closest('#viewer')&&typeof appState!=='undefined'?appState.current:card?.querySelector('[data-compare]')?.dataset.compare||root.closest('[data-screen]')?.dataset.screen||(typeof appState!=='undefined'?appState.compare:'Document')}\n document.addEventListener('pointerdown',e=>{\n  if(!enabled||e.button!==0||e.target.closest('#md-annotate-tools,#md-note-editor'))return;\n  const root=e.target.closest('.phone-screen,.reference-mount img,.source-card img');if(!root)return;\n  e.preventDefault();e.stopImmediatePropagation();const bounds=root.getBoundingClientRect();drag={root,bounds,x:e.clientX,y:e.clientY,el:e.target,page:page(root),selector:path(e.target,root),label:e.target.getAttribute('aria-label')||e.target.getAttribute('alt')||e.target.textContent?.trim().slice(0,160)||'Selected area'};\n  const box=document.createElement('div');box.id='md-draw';(document.querySelector('#viewer[open]')||document.body).append(box);box.style.left=e.clientX+'px';box.style.top=e.clientY+'px';\n },true);\n document.addEventListener('pointermove',e=>{if(!drag)return;e.preventDefault();const r=drag.bounds,x=Math.max(r.left,Math.min(r.right,e.clientX)),y=Math.max(r.top,Math.min(r.bottom,e.clientY)),box=document.getElementById('md-draw');Object.assign(box.style,{left:Math.min(x,drag.x)+'px',top:Math.min(y,drag.y)+'px',width:Math.abs(x-drag.x)+'px',height:Math.abs(y-drag.y)+'px'});},true);\n document.addEventListener('pointerup',e=>{if(!drag)return;e.preventDefault();e.stopImmediatePropagation();const d=drag,r=d.bounds;drag=null;const x=Math.max(r.left,Math.min(r.right,e.clientX)),y=Math.max(r.top,Math.min(r.bottom,e.clientY)),w=Math.abs(x-d.x),h=Math.abs(y-d.y);if(w<8||h<8){document.getElementById('md-draw')?.remove();return}editing={id:crypto.randomUUID(),page:d.page,selector:d.selector,label:d.label,revision,rect:[(Math.min(d.x,x)-r.left)/r.width,(Math.min(d.y,y)-r.top)/r.height,w/r.width,h/r.height]};editor.querySelector('.location').textContent=d.page+' \xB7 '+d.label.slice(0,80);editor.querySelector('textarea').value='';editor.showModal();editor.querySelector('textarea').focus()},true);\n document.addEventListener('pointercancel',()=>{drag=null;document.getElementById('md-draw')?.remove();if(pendingSnapshot)void snapshot()},true);\n async function snapshot(){if(drag||editing){pendingSnapshot=true;send('busy');return}pendingSnapshot=false;const state=typeof appState==='undefined'?null:{...appState};try{if(state?.photo?.startsWith('blob:')){const blob=await(await fetch(state.photo)).blob();state.photo=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob)})}send('state',{state,viewer:!!document.querySelector('#viewer[open]'),scroll:document.querySelector('.design-panel')?.scrollTop||0,theme:document.documentElement.dataset.theme})}catch{send('busy')}}\n window.addEventListener('message',e=>{if(e.source!==parent||e.data?.opcbDesign!==1)return;const m=e.data;if(m.type==='init'&&!initialized){initialized=true;revision=m.revision;notes=m.notes||[];bar.lastElementChild.textContent=`${notes.length} notes`;if(m.state&&typeof appState!=='undefined'){Object.assign(appState,m.state);renderMain();if(m.viewer)openPage(appState.current);if(document.querySelector('.design-panel'))document.querySelector('.design-panel').scrollTop=m.scroll||0}if(m.theme)document.documentElement.dataset.theme=m.theme;drawMarks();send('applied',{revision})}if(m.type==='control'){if(m.action==='annotate')bar.querySelector('button').click();if(m.action==='theme')document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';if(m.action==='flow'&&typeof openPage==='function')openPage('invite');if(m.action==='view'&&typeof appState!=='undefined'&&['compare','gallery','sources'].includes(m.value)&&appState.view!==m.value){appState.view=m.value;renderMain()}}if(m.type==='snapshot')void snapshot();if(m.type==='note-status'&&editing?.id===m.id){if(m.error){awaiting=false;editor.querySelector('[data-save]').disabled=false;editor.querySelector('.location').textContent=m.error}else{bar.lastElementChild.textContent='Note saved';finish()}}if(m.type==='marks'){notes=m.notes||[];bar.lastElementChild.textContent=`${notes.length} notes`;drawMarks()}});\n document.addEventListener('click',()=>requestAnimationFrame(drawMarks));\n send('ready',{revision:document.querySelector('meta[name=\"opcb-document\"]')?.content});\n})();\n", controller.signal, (event) => {
          if (controller.signal.aborted) return;
          if (event.type === "note") void (async () => {
            let accepted = false;
            try {
              guard();
              const note = validateNote({ ...event.note, source: sourceByVersion.current.get(event.note.revision) });
              if (!sourceByVersion.current.has(note.revision)) throw Error("This document version is no longer available");
              await store.current.preferences.update(preference, (old) => {
                guard();
                const list = old?.notes || [];
                if (list.some((n) => n.id === note.id)) return old;
                if (list.length >= 50) throw Error("Send or remove notes before adding more");
                accepted = true;
                return { notes: [...list, note] };
              });
              guard();
              await preview.ack(note.id);
              if (!accepted) return;
              if (latest.current.mode === "draft") {
                try {
                  appendToComposer(editors, connection, binding.channel, formatNotes([note], note.source));
                  transferred.current.add(note.id);
                  setNotice("Note added to the execution chat draft");
                  await remove([note.id]);
                } catch (error) {
                  setNotice(uiError(error) + " \xB7 Your note is saved below");
                }
              } else setNotice("Note saved. Review the batch below.");
            } catch (error) {
              if (!controller.signal.aborted) {
                setNotice(uiError(error));
                void preview?.ack(event.note?.id, uiError(error)).catch(() => {
                });
              }
            }
          })();
        });
        guard();
        if (controller.signal.aborted) {
          preview.close();
          return;
        }
        runtime.current = preview;
        setState({ url: preview.url, error: "", loading: false });
        await preview.marks(latest.current.notes);
        preview.exited.then(() => {
          if (!controller.signal.aborted) setState({ url: "", error: "The preview process stopped", loading: false });
        });
        const load = async () => {
          const ticket = ++loadTicket, item = latest.current;
          guard();
          const html = item.localHtml || (await readSource(await readAttachment(connection, item.binding, guard), controller.signal)).html;
          guard();
          if (ticket !== loadTicket || item.binding.revision !== latest.current.binding.revision || item.localHtml !== latest.current.localHtml) return;
          const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(html)))].map((n) => n.toString(16).padStart(2, "0")).join("");
          if (ticket !== loadTicket) return;
          sourceByVersion.current.set(hash, item.localHtml ? null : item.binding.source);
          if (sourceByVersion.current.size > 20) sourceByVersion.current.delete(sourceByVersion.current.keys().next().value);
          if (lastHash === hash) return;
          await preview.update(html, item.localHtml ? null : item.binding.source);
          lastHash = hash;
        };
        runtime.current.load = load;
        await load();
      })().catch((error) => {
        preview?.close();
        if (!controller.signal.aborted) setState({ url: "", error: uiError(error), loading: false });
      });
      return () => {
        controller.abort();
        preview?.close();
        runtime.current = null;
        sourceByVersion.current.clear();
      };
    }, [connection.session, connection.scope, connection.generation, binding.channel, allowed, available, retry]);
    R.useEffect(() => {
      if (typeof connection.session.subscribeLive !== "function") return;
      return connection.session.subscribeLive((batch) => {
        const id = latest.current.binding?.source?.message;
        if (id && batch.events?.some((e) => e.id === id || e.tags?.some((t) => t[0] === "e" && t[1] === id))) void runtime.current?.load?.().catch((error) => {
          runtime.current?.close();
          setState({ url: "", error: uiError(error), loading: false });
        });
      });
    }, [connection.session, binding.channel]);
    R.useEffect(() => {
      let alive = true;
      const run = async () => {
        try {
          await runtime.current?.load?.();
        } catch (error) {
          if (alive) setNotice(uiError(error));
        }
      };
      void run();
      return () => {
        alive = false;
      };
    }, [binding.revision, localHtml]);
    async function remove(ids) {
      guard();
      await store.current.preferences.update(preference, (old) => {
        guard();
        return { ...old, notes: (old?.notes || []).filter((n) => !ids.includes(n.id)) };
      });
    }
    async function sendBatch() {
      if (busy.current || !notes.length) return;
      busy.current = true;
      setSending(true);
      try {
        guard();
        const batch = notes.filter((n) => !transferred.current.has(n.id));
        if (!batch.length) return;
        const prompt2 = formatNotes(batch, binding.source);
        const id = await submitNotes(connection.session, binding.channel, prompt2, guard);
        batch.forEach((n) => transferred.current.add(n.id));
        setNotice("Submitted to the execution chat \xB7 " + id.slice(0, 8) + ". Delivery is shown in Buzz.");
        await remove(batch.map((n) => n.id));
      } catch (error) {
        setNotice(uiError(error));
      } finally {
        busy.current = false;
        setSending(false);
      }
    }
    if (!available) return h("div", { style: inset }, h("h2", null, "Embedded preview is unavailable"), h("p", { style: muted }, "This preview needs Mac Buzz and Python 3."));
    let prompt = "";
    try {
      if (notes.length) prompt = formatNotes(notes, binding.source);
    } catch (error) {
      prompt = uiError(error);
    }
    return h(
      "div",
      { style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } },
      state.url ? h("div", { className: "md-preview", style: { flex: 1, minHeight: 260, display: "flex" } }, h(ctx.browser.View, { url: state.url, label: "Live mobile design with annotations" })) : h("div", { style: inset, "aria-busy": state.loading }, h("h2", null, state.loading ? "Opening live preview" : "Could not open preview"), h("p", null, state.error), state.error && button("Try again", () => setRetry((n) => n + 1))),
      h("div", { style: { padding: "12px 16px", maxHeight: 260, overflow: "auto", borderTop: "1px solid var(--border-standard)", fontSize: 18 } }, notice && h("p", { role: "status" }, notice), notes.length > 0 && h(R.Fragment, null, h("div", { style: row }, h("strong", null, notes.length + " design notes"), button("Add batch to draft", () => {
        try {
          guard();
          const batch = notes.filter((n) => !transferred.current.has(n.id));
          if (!batch.length) return;
          appendToComposer(editors, connection, binding.channel, formatNotes(batch, binding.source));
          batch.forEach((n) => transferred.current.add(n.id));
          setNotice("Batch added to the execution chat draft");
          void remove(batch.map((n) => n.id)).catch((e) => setNotice("Draft added. " + uiError(e)));
        } catch (error) {
          setNotice(uiError(error));
        }
      }, { disabled: sending || notes.every((n) => transferred.current.has(n.id)) }), button(sending ? "Submitting\u2026" : "Confirm & send", () => void sendBatch(), { disabled: sending || notes.every((n) => transferred.current.has(n.id)) })), h("details", null, h("summary", null, "Review prompt and locations"), ...notes.map((n, i) => h("div", { key: n.id, style: { ...row, marginTop: 8 } }, h("span", null, `${i + 1}. ${n.page}: ${n.comment}`), button("Remove", () => void remove([n.id]).catch((e) => setNotice(uiError(e))), { disabled: sending }))), h("pre", { style: { whiteSpace: "pre-wrap", fontSize: 18 } }, prompt))))
    );
  }
  const StablePreview = typeof R.memo === "function" ? R.memo(Preview) : Preview;
  const skin = `.opcb-md{--md-paper:var(--bg-panel,var(--background-primary,#fefcfb));--md-ink:var(--text-primary,#202022);background:#0d0c0f;color:var(--md-ink);font-family:Nunito,"PingFang SC",sans-serif;padding:12px;gap:12px}.opcb-md .md-toolbar{height:52px;min-height:52px;display:flex;align-items:center;flex-wrap:nowrap!important;white-space:nowrap;overflow-x:auto;scrollbar-width:none;flex-shrink:0;background:#0d0c0f;color:#f7f5f3;border:0!important;padding:8px 0!important;gap:8px!important}.opcb-md button{border:0;border-radius:26px;min-height:46px;padding:10px 18px;font:inherit;font-size:18px;font-weight:600;background:#29272c;color:#e5e1e8;cursor:pointer}.opcb-md button[aria-pressed=true]{background:#f7f5f3;color:#19191b}.opcb-md button:focus-visible{outline:3px solid #fa543c;outline-offset:3px}.opcb-md .md-toolbar>button,.opcb-md .md-toolbar>select{min-height:36px;height:36px;padding:6px 12px;font-size:16px;flex:none}.opcb-md .md-toolbar .md-label{font-size:16px;margin-left:auto}.opcb-md .md-preview [role=toolbar][aria-label="Browser controls"]{display:none}.opcb-md .md-toolbar select{font:inherit;font-size:16px;min-height:36px;max-width:100%;padding:6px 12px;border:1px solid var(--border-standard,#555);border-radius:10px;background:#29272c;color:#e5e1e8}.opcb-md .md-surface{background:var(--md-paper);border-radius:22px;min-height:0;flex:1;overflow:hidden;display:flex;flex-direction:column}.opcb-md .md-plan{padding:32px;overflow:auto;flex:1}.opcb-md h2{font-size:30px;line-height:1.3;margin:0 0 24px;font-weight:800}.opcb-md .md-plan-row{display:flex;align-items:center;gap:20px;border-bottom:1px solid var(--border-standard,#e4e2e0);padding:24px 0}.opcb-md .md-plan-row strong{display:block;font-size:22px;font-weight:700}.opcb-md .md-plan-row p{font-size:20px;margin:10px 0 0;color:var(--text-subtle,#777)}.opcb-md .md-number{font-size:28px;color:var(--text-subtle,#888)}.opcb-md .md-plan-note{margin-top:32px;font-size:20px;line-height:1.6}.opcb-md .md-label{font-size:18px;color:#c1bbc6;margin-left:auto}@media(max-width:700px){.opcb-md{padding:8px}.opcb-md .md-plan{padding:24px}.opcb-md .md-label{display:none}.opcb-md .md-toolbar{flex-wrap:nowrap}.opcb-md .md-plan-row{gap:12px}}`;
  const changes = ["People, films and actions stay together", "Review materials and follow the job in chat", "Portrait deck, material rail and one create action", "Film first, save and publish at the bottom", "An image-led entry with a floating code field"];
  function Plan() {
    return h("div", { className: "md-plan" }, h("h2", null, "One reference system. Every screen."), ...MAPPINGS.map((m, i) => h("section", { key: m.reference, className: "md-plan-row" }, h("span", { className: "md-number" }, `0${i + 1}`), h("div", null, h("strong", null, `${m.reference} \u2192 ${m.target}`), h("p", null, changes[i])))), h("div", { className: "md-plan-note" }, h("strong", null, "R4 \xB7 Live review & annotations"), h("p", null, "Open Results for all 22 screens, original references and the corrected English flow.")));
  }
  function Content({ connection, binding, allowed, open, close, isOpen }) {
    const [mode, setMode] = R.useState("Results"), [resultView, setResultView] = R.useState("compare"), [noteMode, setNoteMode] = R.useState("batch"), [notice, setNotice] = R.useState(""), [localHtml, setLocalHtml] = R.useState(""), [control, setControl] = R.useState(null);
    const input = R.useRef(null);
    const key2 = binding ? `${binding.channel}` : "";
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
      if (!nav.isOpen?.(target) && nav.open(target) === false) setNotice("Buzz could not open the execution chat. Check membership.");
      return () => nav.close?.(target);
    }, [connection.session, connection.scope, connection.generation, key2, allowed]);
    async function importFile(file) {
      if (!file) return;
      try {
        check(connection);
        if (!/\.html?$/i.test(file.name) || file.size <= 0 || file.size > 50 * 1024 * 1024) throw Error("Choose an HTML file up to 50 MB");
        const html = await file.text();
        check(connection);
        setLocalHtml(html);
        setMode("Results");
      } catch (error) {
        setNotice(uiError(error));
      }
    }
    return h("section", { className: "opcb-md", style: { height: "100%", minHeight: 0, display: "flex", flexDirection: "column", minWidth: 0 } }, h("style", null, skin), h("div", { className: "md-toolbar", role: "toolbar", "aria-label": "Design controls" }, ...["Plan", "Results"].map((m) => button(m, () => setMode(m), { "aria-pressed": mode === m, key: m })), mode === "Results" && h("select", { value: resultView, onChange: (e) => {
      setResultView(e.target.value);
      setControl({ action: "view", value: e.target.value, id: crypto.randomUUID() });
    }, "aria-label": "Result view" }, h("option", { value: "compare" }, "Compare"), h("option", { value: "gallery" }, "All screens"), h("option", { value: "sources" }, "Originals")), mode === "Results" && button("Annotate", () => setControl({ action: "annotate", id: crypto.randomUUID() })), mode === "Results" && h("select", { value: noteMode, onChange: (e) => setNoteMode(e.target.value), "aria-label": "Annotation mode" }, h("option", { value: "batch" }, "Batch notes"), h("option", { value: "draft" }, "Add to draft")), h("span", { className: "md-label" }, binding?.label || "No chat"), h("select", { "aria-label": "More actions", value: "", onChange: (e) => {
      const a = e.target.value;
      if (a === "import") input.current?.click();
      else if (a === "chat") open?.({ channelId: binding.channel });
      else if (a) setControl({ action: a, id: crypto.randomUUID() });
    } }, h("option", { value: "" }, "More"), h("option", { value: "flow" }, "Try the flow"), h("option", { value: "theme" }, "Theme"), h("option", { value: "import" }, "Import HTML"), h("option", { value: "chat" }, "Open execution chat"))), h("input", { type: "file", accept: ".html,.htm,text/html", hidden: true, ref: input, onChange: (e) => {
      void importFile(e.target.files?.[0]);
      e.target.value = "";
    } }), notice && h("p", { role: "status", style: inset }, notice), h("div", { className: "md-surface" }, mode === "Plan" ? h(Plan) : h(StablePreview, { connection, binding, allowed, localHtml, mode: noteMode, control })));
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
    const pane = !binding.loading && !allowed ? h("div", { style: inset }, h("h2", null, binding.binding ? "Execution chat is unavailable" : "Connect an execution chat"), h("p", { style: muted }, binding.error || "Connect an HTML result from the source chat, or select an existing conversation."), h("div", { style: row }, h("select", { value: selected, "aria-label": "Choose an execution chat", onChange: (e) => setSelected(e.target.value), style: { minHeight: 44, maxWidth: "100%" } }, h("option", { value: "" }, "Choose a conversation"), ...(roster.status === "ready" ? roster.channels.filter((c) => canBind(c, connection.session.viewer)) : []).map((c) => h("option", { key: c.id, value: c.id }, c.name || c.id))), button("Connect", () => {
      void binding.save(selected).catch((e) => setNotice(uiError(e)));
    }, { disabled: !selected })), notice && h("p", { role: "alert" }, notice), h(Plan)) : null;
    if (pane) return pane;
    if (binding.loading) return h("p", { style: inset, role: "status" }, "Loading your workspace\u2026");
    if (!Tabs) return h("div", { style: inset }, h("h2", null, "Enable Channels in Buzz"), h("p", { style: muted }, "The right panel uses the native Buzz conversation."));
    return h(Tabs, { id: "opcb-mobile-design", session: connection.session, scope: connection.scope, label: "Mobile Design & Results", children: (open, close, isOpen) => h(Content, { key: `${binding.binding.channel}`, connection, binding: binding.binding, allowed, open, close, isOpen }) });
  }
  function Page() {
    const connection = R.useSyncExternalStore(ctx.relay.subscribe, ctx.relay.snapshot, ctx.relay.snapshot);
    return connection.status === "ready" && !connection.cached && connection.session?.viewer ? h(Workspace, { key: JSON.stringify([connection.scope, connection.generation]), connection }) : h("p", { style: inset }, "Connect to your community and open with your own identity.");
  }
  ctx.pages.register({ id: "design", title: "OPCB Mobile Design & Results", primary: true, placement: "dock", icon: PHONE_ICON, layout: "workspace", component: Page });
  if (typeof ctx.agents.addInstructions === "function") ctx.agents.addInstructions({ id: "mobile-design-live-results", text: "When the owner asks to revise the bound mobile design, publish the revised self-contained HTML in that same execution conversation, then read opcb_mobile_design_context and call opcb_mobile_design_bind with its existing binding.request, the new source message and current revision. This updates the live preview without a manual refresh. Preserve the owner-scoped source. Design annotation prompts contain original page, element, normalized area and document version; recheck the current design before editing. Do not bind unrelated attachments or treat an automatic update as authorization to send messages." });
  ctx.agents.addTool({ name: "opcb_mobile_design_context", description: "Read the owner-scoped execution chat and HTML source binding for this mobile design workspace.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, async call(client, context) {
    const { check: check2 } = agentContext(ctx, client, context);
    const store = ctx.artifactStorage.open(COLLECTION);
    try {
      const binding = validateBinding(await store.preferences.get(PREFERENCE), client.owner);
      check2();
      if (binding && binding.channel !== context.channel) throw Error("Read this binding in its original execution conversation");
      return JSON.stringify({ binding, revision: binding?.revision || 0, page: destination });
    } finally {
      store.close();
    }
  } });
  ctx.agents.addTool({ name: "opcb_mobile_design_bind", description: "Bind this conversation and its HTML result under the owner\u2019s explicit instruction. Stores personal references only; creates no chat and sends no messages.", inputSchema: { type: "object", properties: { request_id: { type: "string" }, source_message_id: { type: "string" }, attachment_url: { type: "string" }, label: { type: "string", maxLength: 100 }, expected_revision: { type: "integer", minimum: 0 } }, required: ["request_id", "source_message_id", "expected_revision"], additionalProperties: false }, async call(client, context, args) {
    return JSON.stringify(await bindFromAgent(ctx, client, context, args));
  } });
}
export {
  apply,
  inject
};

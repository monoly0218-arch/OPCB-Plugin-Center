// Independent Buzz plugin; all runtime resources are scoped to apply().
export const inject = ["react", "agents", "host"];

export function validEndpoint(value) {
  const raw = String(value || "").trim();
  let url;
  try { url = new URL(raw); } catch { throw new Error("请粘贴完整的 Webhook POST 地址"); }
  if (url.protocol !== "https:" || url.hostname !== "api2.cursor.sh" ||
      (url.port && url.port !== "443") || url.username || url.password || url.hash ||
      url.pathname === "/" || /[\s\x00-\x1f\x7f]/.test(raw)) {
    throw new Error("仅接受已测试的 https://api2.cursor.sh/… Webhook 地址");
  }
  return raw;
}

export function validKey(value) {
  const key = String(value || "").trim().replace(/^authorization\s*:\s*/i, "").replace(/^bearer\s+/i, "");
  if (!/^[A-Za-z0-9._~+/=-]+$/.test(key)) throw new Error("请粘贴密钥或完整的 Authorization 标头");
  return key;
}

export function destination(delivery) {
  const event = delivery.trigger?.event;
  if (delivery.trigger?.type !== "mention" || !event || event.pubkey !== delivery.agent.owner) return null;
  const channel = delivery.channelId;
  if (!channel || channel !== delivery.config?.channel ||
      !event.tags?.some(t => t[0] === "h" && t[1] === channel)) return null;
  const refs = event.tags.filter(t => t[0] === "e" && /^[0-9a-f]{64}$/.test(t[1] || ""));
  const root = refs.find(t => t[3] === "root")?.[1] || refs.find(t => t[3] === "reply")?.[1] || refs[0]?.[1] || event.id;
  return { channel, root, event };
}

export function routineInstructions(callbackUrl) {
  return `将「Buzz 接入测试」Webhook Routine 改成 Buzz 频道任务接收器，保留原来的 Webhook 地址与密钥。\n\n每次读取 JSON 中的 request_id、message、callback_url、callback_token。message 是用户本次交给你的任务；按当前平台权限处理，不扩大已有授权。其余字段仅用于回传。\n\n任务完成或无法完成时，把结果文本通过 HTTP POST 回传到 ${callbackUrl}。只有 callback_url 与此地址完全一致时才回传；不跟随重定向。\n请求头：Authorization: Bearer <本次 callback_token> 和 Content-Type: application/json\n请求体：{\"request_id\":\"本次 request_id 原值\",\"message\":\"任务结果或无法完成的原因\"}\n\ncallback_token 只用于本次请求头，不写到回复正文，不保存为长期记忆。不要回传原始通信参数、密钥或其他对话内容。结果正文最多 50000 个 UTF-8 字节（中文约 15000 字）；超过时先摘要，并保留完整结果在本对话。HTTP 202 表示连接器已接收，不能据此宣称 Buzz 已发布。失败时在 Grok Bot 当前对话保留结果和 request_id，不自动重试，不再次调用原始 Webhook。\n\n设置完成后，只告诉我 Routine 已更新，不立即运行。`;
}

export function apply(ctx) {
  const React = ctx.react, h = React.createElement;
  const connections = new Map(), pending = new Map(), seen = new Set(), listeners = new Set();
  const calls = new Map();
  let process, boot, publicUrl = "", disposed = false, buffer = "", serial = 0;
  const notify = () => listeners.forEach(f => f());
  const failure = message => new Error(message);
  const randomToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, "0")).join("");
  function complete(id, error, message) {
    const task = pending.get(id);
    if (!task) return;
    pending.delete(id);
    task.cleanup();
    error ? task.reject(error) : task.resolve(message);
    notify();
  }
  function stopped() {
    publicUrl = "";
    connections.clear();
    for (const id of [...pending.keys()]) complete(id, failure("回传连接已关闭；Grok Bot 任务可能仍在运行，请在原应用查看结果"));
    for (const call of calls.values()) { clearTimeout(call.timer); call.reject(failure("本机回传进程已停止")); }
    calls.clear();
    process = undefined;
    boot = undefined;
    notify();
  }
  function line(data) {
    if (data.kind === "reply") {
      const call = calls.get(data.id);
      if (!call) return;
      calls.delete(data.id); clearTimeout(call.timer);
      data.error ? call.reject(failure(data.error)) : call.resolve(data.value);
    } else if (data.kind === "result" && typeof data.message === "string" && data.message.trim() && new TextEncoder().encode(data.message).length <= 50000) {
      complete(data.request_id, null, data.message);
    }
  }
  async function host() {
    if (disposed) throw failure("插件已关闭");
    if (boot) return boot;
    boot = (async () => {
      if (!ctx.host.spawn) throw failure("此连接器需要 Buzz 桌面版");
      process = await ctx.host.spawn("receiver", {
        onStdout(chunk) {
          buffer += chunk;
          if (buffer.length > 524288) { process?.kill(); stopped(); return; }
          let at;
          while ((at = buffer.indexOf("\n")) >= 0) {
            const row = buffer.slice(0, at); buffer = buffer.slice(at + 1);
            try { const data = JSON.parse(row); if (data.kind === "fatal") { stopped(); return; } line(data); } catch { /* no raw child output is logged */ }
          }
        },
      });
      const launched = process;
      launched.exited.then(() => { if (process === launched) stopped(); });
      await launched.write(JSON.stringify(PYTHON_SOURCE) + "\n");
      return launched;
    })();
    try { return await boot; } catch (error) { boot = undefined; throw error; }
  }
  async function rpc(op, data = {}) {
    const proc = await host();
    const id = String(++serial);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { calls.delete(id); reject(failure("本机回传配置超时，请检查 Tailscale；没有自动重试")); }, 55000);
      calls.set(id, { resolve, reject, timer });
      proc.write(JSON.stringify({ id, op, ...data }) + "\n").catch(() => {
        if (!calls.has(id)) return;
        calls.delete(id); clearTimeout(timer); reject(failure("无法与本机回传进程通信"));
      });
    });
  }
  async function connect(pubkey, config, endpoint, key, save) {
    if (!config.channel) throw failure("先选择一个普通频道");
    const verified = { endpoint: validEndpoint(endpoint), key: validKey(key) };
    await save({ channel: config.channel });
    if (!publicUrl) publicUrl = await rpc("start");
    connections.set(pubkey, verified);
    notify();
  }
  async function disconnect(pubkey) {
    connections.delete(pubkey);
    for (const [id, task] of [...pending]) if (task.pubkey === pubkey) complete(id, failure("已停止等待；Grok Bot 中的任务可能仍在运行"));
    if (!connections.size && process) {
      await rpc("stop");
      publicUrl = "";
      const held = process;
      await held.end();
    }
    notify();
  }
  async function run(delivery) {
    const where = destination(delivery);
    if (!where) { delivery.ignored?.(); return; }
    if (!delivery.current() || disposed) return;
    const { channel, root, event } = where;
    const summary = ctx.agents.relay(delivery.agent.pubkey)?.snapshot()?.session?.channels?.list()?.channels?.find(c => c.id === channel);
    if (!summary || !["stream", "forum"].includes(summary.channelType)) throw failure("首版只支持设置中选定的普通频道，不支持 Solo 或私信");
    const connection = connections.get(delivery.agent.pubkey);
    if (!connection || !publicUrl) throw failure("请先打开此 Agent 的设置，配置本次连接并更新 Grok Bot Routine");
    const callbackUrl = publicUrl;
    const dedupe = delivery.agent.pubkey + ":" + event.id;
    if (seen.has(dedupe)) { delivery.ignored?.(); return; }
    if (pending.size >= 16) throw failure("等待回传的任务已满，请先等现有任务结束");
    if (event.content.length > 30000) throw failure("本次消息过长，请缩短到 30000 字符以内");
    const requestId = "buzz-" + crypto.randomUUID();
    const token = randomToken();
    let abort;
    const result = new Promise((resolve, reject) => {
      abort = () => complete(requestId, failure("已停止等待；远端任务可能仍在运行，请在 Grok Bot 查看结果"));
      delivery.signal.addEventListener("abort", abort, { once: true });
      pending.set(requestId, { pubkey: delivery.agent.pubkey, resolve, reject,
        cleanup: () => delivery.signal.removeEventListener("abort", abort) });
    });
    // An error during submission must not leave an unhandled callback promise.
    result.catch(() => {});
    try {
      await rpc("register", { request_id: requestId, token });
      if (!pending.has(requestId)) return await result;
      if (delivery.signal.aborted || !delivery.current() || disposed ||
          connections.get(delivery.agent.pubkey) !== connection || publicUrl !== callbackUrl) { abort(); return await result; }
      seen.add(dedupe);
      if (seen.size > 256) seen.delete(seen.values().next().value);
      delivery.acknowledged?.();
      delivery.step?.("发送给 Grok Bot");
      delivery.interruptible?.(async () => { abort(); });
      let response;
      try {
        response = await ctx.host.request({ url: connection.endpoint, method: "POST", timeoutMs: 20000,
          headers: { "Authorization": "Bearer " + connection.key, "Content-Type": "application/json" },
          body: JSON.stringify({ request_id: requestId, message: event.content,
            callback_url: callbackUrl, callback_token: token }) });
      } catch { delivery.step?.("发送状态未知，等待回传"); }
      if (response && response.status !== 200 && pending.has(requestId)) throw failure("Grok Bot 返回 HTTP " + response.status + "，未确认启动；没有自动重试");
      if (response?.status === 200) delivery.step?.("Grok Bot 已接收，等待结果");
      const message = await result;
      if (disposed || delivery.signal.aborted || !delivery.current()) return;
      delivery.step?.("回传到原线程");
      await delivery.agent.publish({ kind: 9, content: message, tags: [["h", channel], ["e", root, "", "reply"], ["p", delivery.agent.owner]] });
    } finally {
      complete(requestId, failure("请求已结束"));
      if (process) rpc("forget", { request_id: requestId }).catch(() => {});
    }
  }
  function Settings({ agent, save }) {
    const [channel, setChannel] = React.useState(agent.config?.channel || "");
    const [endpoint, setEndpoint] = React.useState("");
    const [key, setKey] = React.useState("");
    const [status, setStatus] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [, refresh] = React.useState(0);
    React.useEffect(() => { const f = () => refresh(n => n + 1); listeners.add(f); return () => listeners.delete(f); }, []);
    const snapshot = ctx.agents.relay(agent.pubkey)?.snapshot();
    const channels = (snapshot?.session?.channels?.list()?.channels || []).filter(c => ["stream", "forum"].includes(c.channelType) && !c.archived && !c.readOnly);
    const connected = connections.has(agent.pubkey);
    const submit = async event => {
      event.preventDefault(); setBusy(true); setStatus("");
      try { await connect(agent.pubkey, { channel }, endpoint, key, save); setKey(""); setEndpoint(""); setStatus("连接已准备。请更新下方 Routine 指令，再在选定频道测试。"); }
      catch (error) { setStatus(error.message || "连接失败"); }
      finally { setBusy(false); }
    };
    const field = (label, control) => h("label", { style: { display: "grid", gap: "var(--space-2)" } }, h("span", null, label), control);
    return h("section", { style: { display: "grid", gap: "var(--space-4)" } },
      h("h2", null, "Grok Bot 接入"),
      h("p", null, connected ? "已配置本次连接；完整收发仍需频道测试" : "尚未连接"),
      h("p", null, "此 Agent 只处理你在所选普通频道里的提及。当前仅传递这条消息，不携带历史或附件。"),
      h("form", { onSubmit: submit, style: { display: "grid", gap: "var(--space-4)" } },
        field("频道", h("select", { value: channel, disabled: busy || connected, required: true, onChange: e => setChannel(e.target.value) },
          h("option", { value: "" }, "选择普通频道"), ...channels.map(c => h("option", { key: c.id, value: c.id }, c.name || c.id)))),
        field("Grok Bot 的 POST 地址", h("input", { type: "url", value: endpoint, required: !connected, disabled: busy, autoComplete: "off", onChange: e => setEndpoint(e.target.value) })),
        field("Webhook 密钥或完整标头", h("input", { type: "password", value: key, required: !connected, disabled: busy, autoComplete: "off", onChange: e => setKey(e.target.value) })),
        h("p", null, "密钥只保留在本次 Buzz 运行内存中，关闭或重载后需重新填写。连接会启用独立的公网 HTTPS 8443 回传入口；既有 443 服务保留。"),
        h("div", { style: { display: "flex", flexWrap: "wrap", gap: "var(--space-2)" } },
          !connected && h("button", { type: "submit", disabled: busy }, busy ? "正在连接…" : "连接本次会话并启用回传"),
          connected && h("button", { type: "button", disabled: busy, onClick: async () => { setBusy(true); try { await disconnect(agent.pubkey); setStatus("已断开本次连接"); } catch (error) { setStatus(error.message); } finally { setBusy(false); } } }, "断开本次连接"))),
      status && h("p", { role: "status" }, status),
      connected && publicUrl && h("section", { style: { display: "grid", gap: "var(--space-2)" } },
        h("h3", null, "把这段话发给 Grok Bot"),
        h("textarea", { readOnly: true, value: routineInstructions(publicUrl), rows: 12, "aria-label": "Routine 更新指令", style: { width: "100%", boxSizing: "border-box" } }),
        h("p", null, "Routine 更新后，把此 Agent 添加到所选频道并提及它。结果会以此 Agent 身份回复原线程。")));
  }
  ctx.agents.addTool({ name: "grokbot_bridge_status", description: "只读诊断 Grok Bot 连接器与 Tailscale 的状态，不返回地址、密钥或任务内容，不启用公网回传。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    call: async () => JSON.stringify({ connectedAgents: connections.size, pendingTasks: pending.size,
      callbackReady: Boolean(publicUrl), tailscale: await rpc("diagnose") }) });
  ctx.agents.register({ id: "grokbot", title: "Grok Bot 连接器", description: "连接已有 Grok Bot Webhook，并把结果回复到原频道线程",
    defaults: () => ({ config: { channel: "" } }),
    summary: () => "已有 Grok Bot · Webhook",
    tabs: [{ id: "settings", title: "Settings", role: "settings", component: Settings }],
    timeoutMs: 600000, run });
  ctx.effect(() => async () => {
    disposed = true;
    const held = process;
    stopped();
    if (held) {
      try {
        await held.end();
        let timer;
        const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(false), 5000); });
        const exited = await Promise.race([held.exited.then(() => true), timeout]);
        clearTimeout(timer);
        // If normal EOF cleanup was interrupted, the host still owns the process.
        if (!exited) await held.kill();
      } catch { await held.kill().catch(() => {}); }
    }
  });
}

// BUILD: the maintained bridge_host.py is embedded here for single-file API v1.
const PYTHON_SOURCE = "\"\"\"Loopback result receiver. No keys or task content are persisted.\"\"\"\nimport hmac\nimport json\nimport os\nimport signal\nimport subprocess\nimport sys\nimport threading\nimport time\nfrom http.server import BaseHTTPRequestHandler, ThreadingHTTPServer\n\nTAILSCALE = \"/Applications/Tailscale.app/Contents/MacOS/Tailscale\"\nTARGET = \"http://127.0.0.1:18741\"\nPUBLIC_PORT = \"8443\"\nMAX_BODY = 320000\n\n\nclass Registry:\n    def __init__(self):\n        self.pending = {}\n        self.lock = threading.Lock()\n\n    def register(self, request_id, token):\n        with self.lock:\n            self.pending = {k: v for k, v in self.pending.items() if v[1] > time.monotonic()}\n            if len(self.pending) >= 16:\n                raise ValueError(\"回传等待队列已满\")\n            self.pending[request_id] = (token, time.monotonic() + 600)\n\n    def forget(self, request_id):\n        with self.lock:\n            self.pending.pop(request_id, None)\n\n    def accept(self, request_id, token):\n        with self.lock:\n            entry = self.pending.get(request_id)\n            if not entry or entry[1] <= time.monotonic() or not hmac.compare_digest(entry[0], token):\n                return False\n            del self.pending[request_id]\n            return True\n\n\ndef receiver(registry, emit):\n    class Handler(BaseHTTPRequestHandler):\n        def setup(self):\n            super().setup()\n            self.connection.settimeout(5)\n\n        def log_message(self, *_):\n            pass\n\n        def answer(self, status):\n            self.send_response(status)\n            self.send_header(\"Content-Length\", \"0\")\n            self.send_header(\"Cache-Control\", \"no-store\")\n            self.end_headers()\n\n        def do_POST(self):\n            if self.path != \"/result\":\n                return self.answer(404)\n            if self.headers.get(\"Transfer-Encoding\"):\n                return self.answer(400)\n            try:\n                size = int(self.headers.get(\"Content-Length\", \"0\"))\n            except ValueError:\n                return self.answer(400)\n            if size < 1 or size > MAX_BODY:\n                return self.answer(413)\n            auth = self.headers.get(\"Authorization\", \"\")\n            if not auth.startswith(\"Bearer \") or len(auth) > 256:\n                return self.answer(401)\n            try:\n                data = json.loads(self.rfile.read(size))\n            except (ValueError, TimeoutError, OSError):\n                return self.answer(400)\n            if not isinstance(data, dict):\n                return self.answer(400)\n            request_id, message = data.get(\"request_id\"), data.get(\"message\")\n            if not isinstance(request_id, str) or not isinstance(message, str) or not message.strip() or len(message.encode(\"utf-8\")) > 50000:\n                return self.answer(400)\n            try:\n                accepted = registry.accept(request_id, auth[7:])\n            except (TypeError, UnicodeError):\n                return self.answer(401)\n            if not accepted:\n                return self.answer(401)\n            emit({\"kind\": \"result\", \"request_id\": request_id, \"message\": message})\n            self.answer(202)\n    return Handler\n\n\ndef command(args):\n    label = \" \".join(args[:3])\n    # A desktop host has no terminal markers. The macOS Tailscale binary then\n    # selects its GUI startup path even when given CLI arguments.\n    env = dict(os.environ)\n    env[\"TERM\"] = env.get(\"TERM\") or \"dumb\"\n    try:\n        result = subprocess.run([TAILSCALE, *args], stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding=\"utf-8\", timeout=15, env=env)\n    except subprocess.TimeoutExpired:\n        raise RuntimeError(\"Tailscale \" + label + \" 超过 15 秒；请检查 Tailscale 连接状态\") from None\n    except OSError:\n        raise RuntimeError(\"无法运行本机 Tailscale；请检查应用是否可用\") from None\n    if result.returncode:\n        raise RuntimeError(\"Tailscale 操作失败；请检查登录及 Funnel 权限，既有 443 配置未修改\")\n    return result.stdout\n\n\ndef command_json(args):\n    output = command(args)\n    try:\n        value = json.loads(output)\n    except ValueError:\n        raise RuntimeError(\"Tailscale \" + \" \".join(args) + \" 未返回有效 JSON（输出 \" + str(len(output)) + \" 字符）；尚未确认回传配置\") from None\n    if not isinstance(value, dict):\n        raise RuntimeError(\"Tailscale \" + \" \".join(args) + \" 返回了非对象数据；尚未确认回传配置\")\n    return value\n\n\ndef diagnostics():\n    status = command_json([\"status\", \"--json\"])\n    config = command_json([\"funnel\", \"status\", \"--json\"])\n    return {\"backend_state\": status.get(\"BackendState\"),\n            \"dns_ready\": bool((status.get(\"Self\") or {}).get(\"DNSName\", \"\").rstrip(\".\").endswith(\".ts.net\")),\n            \"tcp_ports\": sorted((config.get(\"TCP\") or {}).keys())}\n\n\nclass Funnel:\n    def __init__(self):\n        self.host = None\n        self.owned = False\n\n    def start(self):\n        status = command_json([\"status\", \"--json\"])\n        if status.get(\"BackendState\") != \"Running\":\n            raise RuntimeError(\"Tailscale 尚未连接；请先在 Tailscale 中连接，再启用回传\")\n        config = command_json([\"funnel\", \"status\", \"--json\"])\n        host = status.get(\"Self\", {}).get(\"DNSName\", \"\").rstrip(\".\")\n        if not host.endswith(\".ts.net\") or not all(c.isalnum() or c in \".-\" for c in host):\n            raise RuntimeError(\"无法确认 Tailscale 的 HTTPS 主机名\")\n        key = host + \":\" + PUBLIC_PORT\n        handlers = config.get(\"Web\", {}).get(key, {}).get(\"Handlers\", {})\n        if PUBLIC_PORT in config.get(\"TCP\", {}) or handlers:\n            raise RuntimeError(\"8443 已有服务；为保护现有配置，没有覆盖，请先核实该端口的用途\")\n        self.host, self.owned = host, True\n        try:\n            command([\"funnel\", \"--bg\", \"--https=\" + PUBLIC_PORT, TARGET])\n        except Exception:\n            self.stop()\n            raise\n        return \"https://\" + key + \"/result\"\n\n    def stop(self):\n        if not self.owned:\n            return\n        config = command_json([\"funnel\", \"status\", \"--json\"])\n        handlers = config.get(\"Web\", {}).get(self.host + \":\" + PUBLIC_PORT, {}).get(\"Handlers\", {})\n        if handlers == {\"/\": {\"Proxy\": TARGET}}:\n            command([\"funnel\", \"--https=\" + PUBLIC_PORT, \"off\"])\n        self.owned = False\n\n\ndef main():\n    lock = threading.Lock()\n    def emit(data):\n        with lock:\n            print(json.dumps(data, ensure_ascii=False), flush=True)\n\n    registry, funnel = Registry(), Funnel()\n    server = ThreadingHTTPServer((\"127.0.0.1\", 18741), receiver(registry, emit))\n    server.daemon_threads = True\n    threading.Thread(target=server.serve_forever, daemon=True).start()\n    def stopped(*_):\n        raise SystemExit()\n    signal.signal(signal.SIGTERM, stopped)\n    emit({\"kind\": \"ready\"})\n    try:\n        for line in sys.stdin:\n            if len(line) > 8192:\n                break\n            data = {}\n            try:\n                data = json.loads(line)\n                call_id = data.get(\"id\")\n                op = data.get(\"op\")\n                if op == \"diagnose\":\n                    value = diagnostics()\n                elif op == \"start\":\n                    value = funnel.start()\n                elif op == \"register\":\n                    rid, token = data[\"request_id\"], data[\"token\"]\n                    if not isinstance(rid, str) or len(rid) > 100 or not isinstance(token, str) or not token.isascii() or len(token) != 64:\n                        raise ValueError(\"无效请求标识\")\n                    registry.register(rid, token)\n                    value = True\n                elif op == \"forget\":\n                    registry.forget(data[\"request_id\"])\n                    value = True\n                elif op == \"stop\":\n                    funnel.stop()\n                    value = True\n                else:\n                    raise ValueError(\"未知操作\")\n                emit({\"kind\": \"reply\", \"id\": call_id, \"value\": value})\n            except (ValueError, KeyError, TypeError):\n                emit({\"kind\": \"reply\", \"id\": data.get(\"id\") if isinstance(data, dict) else None, \"error\": \"回传配置无效\"})\n            except (RuntimeError, subprocess.SubprocessError) as error:\n                emit({\"kind\": \"reply\", \"id\": data.get(\"id\"), \"error\": str(error)})\n    finally:\n        try:\n            funnel.stop()\n        except Exception:\n            # No task data, keys, or full subprocess responses reach stderr.\n            emit({\"kind\": \"warning\", \"message\": \"8443 的清理状态未确认；请检查 Tailscale Funnel 配置\"})\n        server.shutdown()\n        server.server_close()\n\n\nif __name__ == \"__main__\":\n    try:\n        main()\n    except OSError:\n        print(json.dumps({\"kind\": \"fatal\", \"message\": \"本机回传端口 18741 无法启动；未更改现有服务\"}), flush=True)\n";

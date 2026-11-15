// src/plugin-icons/bases/opcb.grokbot-bridge/plugin.js
var inject = ["react", "agents", "host"];
function validEndpoint(value) {
  const raw = String(value || "").trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("请粘贴完整的 Webhook POST 地址");
  }
  if (url.protocol !== "https:" || url.hostname !== "api2.cursor.sh" || url.port && url.port !== "443" || url.username || url.password || url.hash || url.pathname === "/" || /[\s\x00-\x1f\x7f]/.test(raw)) {
    throw new Error("仅接受已测试的 https://api2.cursor.sh/… Webhook 地址");
  }
  return raw;
}
function validKey(value) {
  const key = String(value || "").trim().replace(/^authorization\s*:\s*/i, "").replace(/^bearer\s+/i, "");
  if (!/^[A-Za-z0-9._~+/=-]+$/.test(key)) throw new Error("请粘贴密钥或完整的 Authorization 标头");
  return key;
}
function destination(delivery) {
  const event = delivery.trigger?.event;
  if (delivery.trigger?.type !== "mention" || !event || event.pubkey !== delivery.agent.owner) return null;
  const channel = delivery.channelId;
  if (!channel || channel !== delivery.config?.channel || !event.tags?.some((t) => t[0] === "h" && t[1] === channel)) return null;
  const refs = event.tags.filter((t) => t[0] === "e" && /^[0-9a-f]{64}$/.test(t[1] || ""));
  const root = refs.find((t) => t[3] === "root")?.[1] || refs.find((t) => t[3] === "reply")?.[1] || refs[0]?.[1] || event.id;
  return { channel, root, event };
}
function routineInstructions(callbackUrl) {
  return `将「Buzz 接入测试」Webhook Routine 改成 Buzz 频道任务接收器，保留原来的 Webhook 地址与密钥。

每次读取 JSON 中的 request_id、message、callback_url、callback_token。message 是用户本次交给你的任务；按当前平台权限处理，不扩大已有授权。其余字段仅用于回传。

任务完成或无法完成时，把结果文本通过 HTTP POST 回传到 ${callbackUrl}。只有 callback_url 与此地址完全一致时才回传；不跟随重定向。
请求头：Authorization: Bearer <本次 callback_token> 和 Content-Type: application/json
请求体：{"request_id":"本次 request_id 原值","message":"任务结果或无法完成的原因"}

callback_token 只用于本次请求头，不写到回复正文，不保存为长期记忆。不要回传原始通信参数、密钥或其他对话内容。结果正文最多 50000 个 UTF-8 字节（中文约 15000 字）；超过时先摘要，并保留完整结果在本对话。HTTP 202 表示连接器已接收，不能据此宣称 Buzz 已发布。失败时在 Grok Bot 当前对话保留结果和 request_id，不自动重试，不再次调用原始 Webhook。

设置完成后，只告诉我 Routine 已更新，不立即运行。`;
}
function apply(ctx) {
  const React = ctx.react, h = React.createElement;
  const connections = /* @__PURE__ */ new Map(), pending = /* @__PURE__ */ new Map(), seen = /* @__PURE__ */ new Set(), listeners = /* @__PURE__ */ new Set();
  const calls = /* @__PURE__ */ new Map();
  let process, boot, publicUrl = "", disposed = false, buffer = "", serial = 0;
  const notify = () => listeners.forEach((f) => f());
  const failure = (message) => new Error(message);
  const randomToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
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
    for (const call of calls.values()) {
      clearTimeout(call.timer);
      call.reject(failure("本机回传进程已停止"));
    }
    calls.clear();
    process = void 0;
    boot = void 0;
    notify();
  }
  function line(data) {
    if (data.kind === "reply") {
      const call = calls.get(data.id);
      if (!call) return;
      calls.delete(data.id);
      clearTimeout(call.timer);
      data.error ? call.reject(failure(data.error)) : call.resolve(data.value);
    } else if (data.kind === "result" && typeof data.message === "string" && data.message.trim() && new TextEncoder().encode(data.message).length <= 5e4) {
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
          if (buffer.length > 524288) {
            process?.kill();
            stopped();
            return;
          }
          let at;
          while ((at = buffer.indexOf("\n")) >= 0) {
            const row = buffer.slice(0, at);
            buffer = buffer.slice(at + 1);
            try {
              const data = JSON.parse(row);
              if (data.kind === "fatal") {
                stopped();
                return;
              }
              line(data);
            } catch {
            }
          }
        }
      });
      const launched = process;
      launched.exited.then(() => {
        if (process === launched) stopped();
      });
      await launched.write(JSON.stringify(PYTHON_SOURCE) + "\n");
      return launched;
    })();
    try {
      return await boot;
    } catch (error) {
      boot = void 0;
      throw error;
    }
  }
  async function rpc(op, data = {}) {
    const proc = await host();
    const id = String(++serial);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        calls.delete(id);
        reject(failure("本机回传配置超时，请检查 Tailscale；没有自动重试"));
      }, 55e3);
      calls.set(id, { resolve, reject, timer });
      proc.write(JSON.stringify({ id, op, ...data }) + "\n").catch(() => {
        if (!calls.has(id)) return;
        calls.delete(id);
        clearTimeout(timer);
        reject(failure("无法与本机回传进程通信"));
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
    if (!where) {
      delivery.ignored?.();
      return;
    }
    if (!delivery.current() || disposed) return;
    const { channel, root, event } = where;
    const summary = ctx.agents.relay(delivery.agent.pubkey)?.snapshot()?.session?.channels?.list()?.channels?.find((c) => c.id === channel);
    if (!summary || !["stream", "forum"].includes(summary.channelType)) throw failure("首版只支持设置中选定的普通频道，不支持 Solo 或私信");
    const connection = connections.get(delivery.agent.pubkey);
    if (!connection || !publicUrl) throw failure("请先打开此 Agent 的设置，配置本次连接并更新 Grok Bot Routine");
    const callbackUrl = publicUrl;
    const dedupe = delivery.agent.pubkey + ":" + event.id;
    if (seen.has(dedupe)) {
      delivery.ignored?.();
      return;
    }
    if (pending.size >= 16) throw failure("等待回传的任务已满，请先等现有任务结束");
    if (event.content.length > 3e4) throw failure("本次消息过长，请缩短到 30000 字符以内");
    const requestId = "buzz-" + crypto.randomUUID();
    const token = randomToken();
    let abort;
    const result = new Promise((resolve, reject) => {
      abort = () => complete(requestId, failure("已停止等待；远端任务可能仍在运行，请在 Grok Bot 查看结果"));
      delivery.signal.addEventListener("abort", abort, { once: true });
      pending.set(requestId, {
        pubkey: delivery.agent.pubkey,
        resolve,
        reject,
        cleanup: () => delivery.signal.removeEventListener("abort", abort)
      });
    });
    result.catch(() => {
    });
    try {
      await rpc("register", { request_id: requestId, token });
      if (!pending.has(requestId)) return await result;
      if (delivery.signal.aborted || !delivery.current() || disposed || connections.get(delivery.agent.pubkey) !== connection || publicUrl !== callbackUrl) {
        abort();
        return await result;
      }
      seen.add(dedupe);
      if (seen.size > 256) seen.delete(seen.values().next().value);
      delivery.acknowledged?.();
      delivery.step?.("发送给 Grok Bot");
      delivery.interruptible?.(async () => {
        abort();
      });
      let response;
      try {
        response = await ctx.host.request({
          url: connection.endpoint,
          method: "POST",
          timeoutMs: 2e4,
          headers: { "Authorization": "Bearer " + connection.key, "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: requestId,
            message: event.content,
            callback_url: callbackUrl,
            callback_token: token
          })
        });
      } catch {
        delivery.step?.("发送状态未知，等待回传");
      }
      if (response && response.status !== 200 && pending.has(requestId)) throw failure("Grok Bot 返回 HTTP " + response.status + "，未确认启动；没有自动重试");
      if (response?.status === 200) delivery.step?.("Grok Bot 已接收，等待结果");
      const message = await result;
      if (disposed || delivery.signal.aborted || !delivery.current()) return;
      delivery.step?.("回传到原线程");
      await delivery.agent.publish({ kind: 9, content: message, tags: [["h", channel], ["e", root, "", "reply"], ["p", delivery.agent.owner]] });
    } finally {
      complete(requestId, failure("请求已结束"));
      if (process) rpc("forget", { request_id: requestId }).catch(() => {
      });
    }
  }
  function Settings({ agent, save }) {
    const [channel, setChannel] = React.useState(agent.config?.channel || "");
    const [endpoint, setEndpoint] = React.useState("");
    const [key, setKey] = React.useState("");
    const [status, setStatus] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [, refresh] = React.useState(0);
    React.useEffect(() => {
      const f = () => refresh((n) => n + 1);
      listeners.add(f);
      return () => listeners.delete(f);
    }, []);
    const snapshot = ctx.agents.relay(agent.pubkey)?.snapshot();
    const channels = (snapshot?.session?.channels?.list()?.channels || []).filter((c) => ["stream", "forum"].includes(c.channelType) && !c.archived && !c.readOnly);
    const connected = connections.has(agent.pubkey);
    const submit = async (event) => {
      event.preventDefault();
      setBusy(true);
      setStatus("");
      try {
        await connect(agent.pubkey, { channel }, endpoint, key, save);
        setKey("");
        setEndpoint("");
        setStatus("连接已准备。请更新下方 Routine 指令，再在选定频道测试。");
      } catch (error) {
        setStatus(error.message || "连接失败");
      } finally {
        setBusy(false);
      }
    };
    const field = (label, control) => h("label", { style: { display: "grid", gap: "var(--space-2)" } }, h("span", null, label), control);
    return h(
      "section",
      { style: { display: "grid", gap: "var(--space-4)" } },
      h("h2", null, "Grok Bot 接入"),
      h("p", null, connected ? "已配置本次连接；完整收发仍需频道测试" : "尚未连接"),
      h("p", null, "此 Agent 只处理你在所选普通频道里的提及。当前仅传递这条消息，不携带历史或附件。"),
      h(
        "form",
        { onSubmit: submit, style: { display: "grid", gap: "var(--space-4)" } },
        field("频道", h(
          "select",
          { value: channel, disabled: busy || connected, required: true, onChange: (e) => setChannel(e.target.value) },
          h("option", { value: "" }, "选择普通频道"),
          ...channels.map((c) => h("option", { key: c.id, value: c.id }, c.name || c.id))
        )),
        field("Grok Bot 的 POST 地址", h("input", { type: "url", value: endpoint, required: !connected, disabled: busy, autoComplete: "off", onChange: (e) => setEndpoint(e.target.value) })),
        field("Webhook 密钥或完整标头", h("input", { type: "password", value: key, required: !connected, disabled: busy, autoComplete: "off", onChange: (e) => setKey(e.target.value) })),
        h("p", null, "密钥只保留在本次 Buzz 运行内存中，关闭或重载后需重新填写。连接会启用独立的公网 HTTPS 8443 回传入口；既有 443 服务保留。"),
        h(
          "div",
          { style: { display: "flex", flexWrap: "wrap", gap: "var(--space-2)" } },
          !connected && h("button", { type: "submit", disabled: busy }, busy ? "正在连接…" : "连接本次会话并启用回传"),
          connected && h("button", { type: "button", disabled: busy, onClick: async () => {
            setBusy(true);
            try {
              await disconnect(agent.pubkey);
              setStatus("已断开本次连接");
            } catch (error) {
              setStatus(error.message);
            } finally {
              setBusy(false);
            }
          } }, "断开本次连接")
        )
      ),
      status && h("p", { role: "status" }, status),
      connected && publicUrl && h(
        "section",
        { style: { display: "grid", gap: "var(--space-2)" } },
        h("h3", null, "把这段话发给 Grok Bot"),
        h("textarea", { readOnly: true, value: routineInstructions(publicUrl), rows: 12, "aria-label": "Routine 更新指令", style: { width: "100%", boxSizing: "border-box" } }),
        h("p", null, "Routine 更新后，把此 Agent 添加到所选频道并提及它。结果会以此 Agent 身份回复原线程。")
      )
    );
  }
  ctx.agents.addTool({
    name: "grokbot_bridge_status",
    description: "只读诊断 Grok Bot 连接器与 Tailscale 的状态，不返回地址、密钥或任务内容，不启用公网回传。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    call: async () => JSON.stringify({
      connectedAgents: connections.size,
      pendingTasks: pending.size,
      callbackReady: Boolean(publicUrl),
      tailscale: await rpc("diagnose")
    })
  });
  ctx.agents.register({
    id: "grokbot",
    title: "Grok Bot 连接器",
    description: "连接已有 Grok Bot Webhook，并把结果回复到原频道线程",
    defaults: () => ({ config: { channel: "" } }),
    summary: () => "已有 Grok Bot · Webhook",
    tabs: [{ id: "settings", title: "Settings", role: "settings", component: Settings }],
    timeoutMs: 6e5,
    run
  });
  ctx.effect(() => async () => {
    disposed = true;
    const held = process;
    stopped();
    if (held) {
      try {
        await held.end();
        let timer;
        const timeout = new Promise((resolve) => {
          timer = setTimeout(() => resolve(false), 5e3);
        });
        const exited = await Promise.race([held.exited.then(() => true), timeout]);
        clearTimeout(timer);
        if (!exited) await held.kill();
      } catch {
        await held.kill().catch(() => {
        });
      }
    }
  });
}
var PYTHON_SOURCE = '"""Loopback result receiver. No keys or task content are persisted."""\nimport hmac\nimport json\nimport os\nimport signal\nimport subprocess\nimport sys\nimport threading\nimport time\nfrom http.server import BaseHTTPRequestHandler, ThreadingHTTPServer\n\nTAILSCALE = "/Applications/Tailscale.app/Contents/MacOS/Tailscale"\nTARGET = "http://127.0.0.1:18741"\nPUBLIC_PORT = "8443"\nMAX_BODY = 320000\n\n\nclass Registry:\n    def __init__(self):\n        self.pending = {}\n        self.lock = threading.Lock()\n\n    def register(self, request_id, token):\n        with self.lock:\n            self.pending = {k: v for k, v in self.pending.items() if v[1] > time.monotonic()}\n            if len(self.pending) >= 16:\n                raise ValueError("回传等待队列已满")\n            self.pending[request_id] = (token, time.monotonic() + 600)\n\n    def forget(self, request_id):\n        with self.lock:\n            self.pending.pop(request_id, None)\n\n    def accept(self, request_id, token):\n        with self.lock:\n            entry = self.pending.get(request_id)\n            if not entry or entry[1] <= time.monotonic() or not hmac.compare_digest(entry[0], token):\n                return False\n            del self.pending[request_id]\n            return True\n\n\ndef receiver(registry, emit):\n    class Handler(BaseHTTPRequestHandler):\n        def setup(self):\n            super().setup()\n            self.connection.settimeout(5)\n\n        def log_message(self, *_):\n            pass\n\n        def answer(self, status):\n            self.send_response(status)\n            self.send_header("Content-Length", "0")\n            self.send_header("Cache-Control", "no-store")\n            self.end_headers()\n\n        def do_POST(self):\n            if self.path != "/result":\n                return self.answer(404)\n            if self.headers.get("Transfer-Encoding"):\n                return self.answer(400)\n            try:\n                size = int(self.headers.get("Content-Length", "0"))\n            except ValueError:\n                return self.answer(400)\n            if size < 1 or size > MAX_BODY:\n                return self.answer(413)\n            auth = self.headers.get("Authorization", "")\n            if not auth.startswith("Bearer ") or len(auth) > 256:\n                return self.answer(401)\n            try:\n                data = json.loads(self.rfile.read(size))\n            except (ValueError, TimeoutError, OSError):\n                return self.answer(400)\n            if not isinstance(data, dict):\n                return self.answer(400)\n            request_id, message = data.get("request_id"), data.get("message")\n            if not isinstance(request_id, str) or not isinstance(message, str) or not message.strip() or len(message.encode("utf-8")) > 50000:\n                return self.answer(400)\n            try:\n                accepted = registry.accept(request_id, auth[7:])\n            except (TypeError, UnicodeError):\n                return self.answer(401)\n            if not accepted:\n                return self.answer(401)\n            emit({"kind": "result", "request_id": request_id, "message": message})\n            self.answer(202)\n    return Handler\n\n\ndef command(args):\n    label = " ".join(args[:3])\n    # A desktop host has no terminal markers. The macOS Tailscale binary then\n    # selects its GUI startup path even when given CLI arguments.\n    env = dict(os.environ)\n    env["TERM"] = env.get("TERM") or "dumb"\n    try:\n        result = subprocess.run([TAILSCALE, *args], stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding="utf-8", timeout=15, env=env)\n    except subprocess.TimeoutExpired:\n        raise RuntimeError("Tailscale " + label + " 超过 15 秒；请检查 Tailscale 连接状态") from None\n    except OSError:\n        raise RuntimeError("无法运行本机 Tailscale；请检查应用是否可用") from None\n    if result.returncode:\n        raise RuntimeError("Tailscale 操作失败；请检查登录及 Funnel 权限，既有 443 配置未修改")\n    return result.stdout\n\n\ndef command_json(args):\n    output = command(args)\n    try:\n        value = json.loads(output)\n    except ValueError:\n        raise RuntimeError("Tailscale " + " ".join(args) + " 未返回有效 JSON（输出 " + str(len(output)) + " 字符）；尚未确认回传配置") from None\n    if not isinstance(value, dict):\n        raise RuntimeError("Tailscale " + " ".join(args) + " 返回了非对象数据；尚未确认回传配置")\n    return value\n\n\ndef diagnostics():\n    status = command_json(["status", "--json"])\n    config = command_json(["funnel", "status", "--json"])\n    return {"backend_state": status.get("BackendState"),\n            "dns_ready": bool((status.get("Self") or {}).get("DNSName", "").rstrip(".").endswith(".ts.net")),\n            "tcp_ports": sorted((config.get("TCP") or {}).keys())}\n\n\nclass Funnel:\n    def __init__(self):\n        self.host = None\n        self.owned = False\n\n    def start(self):\n        status = command_json(["status", "--json"])\n        if status.get("BackendState") != "Running":\n            raise RuntimeError("Tailscale 尚未连接；请先在 Tailscale 中连接，再启用回传")\n        config = command_json(["funnel", "status", "--json"])\n        host = status.get("Self", {}).get("DNSName", "").rstrip(".")\n        if not host.endswith(".ts.net") or not all(c.isalnum() or c in ".-" for c in host):\n            raise RuntimeError("无法确认 Tailscale 的 HTTPS 主机名")\n        key = host + ":" + PUBLIC_PORT\n        handlers = config.get("Web", {}).get(key, {}).get("Handlers", {})\n        if PUBLIC_PORT in config.get("TCP", {}) or handlers:\n            raise RuntimeError("8443 已有服务；为保护现有配置，没有覆盖，请先核实该端口的用途")\n        self.host, self.owned = host, True\n        try:\n            command(["funnel", "--bg", "--https=" + PUBLIC_PORT, TARGET])\n        except Exception:\n            self.stop()\n            raise\n        return "https://" + key + "/result"\n\n    def stop(self):\n        if not self.owned:\n            return\n        config = command_json(["funnel", "status", "--json"])\n        handlers = config.get("Web", {}).get(self.host + ":" + PUBLIC_PORT, {}).get("Handlers", {})\n        if handlers == {"/": {"Proxy": TARGET}}:\n            command(["funnel", "--https=" + PUBLIC_PORT, "off"])\n        self.owned = False\n\n\ndef main():\n    lock = threading.Lock()\n    def emit(data):\n        with lock:\n            print(json.dumps(data, ensure_ascii=False), flush=True)\n\n    registry, funnel = Registry(), Funnel()\n    server = ThreadingHTTPServer(("127.0.0.1", 18741), receiver(registry, emit))\n    server.daemon_threads = True\n    threading.Thread(target=server.serve_forever, daemon=True).start()\n    def stopped(*_):\n        raise SystemExit()\n    signal.signal(signal.SIGTERM, stopped)\n    emit({"kind": "ready"})\n    try:\n        for line in sys.stdin:\n            if len(line) > 8192:\n                break\n            data = {}\n            try:\n                data = json.loads(line)\n                call_id = data.get("id")\n                op = data.get("op")\n                if op == "diagnose":\n                    value = diagnostics()\n                elif op == "start":\n                    value = funnel.start()\n                elif op == "register":\n                    rid, token = data["request_id"], data["token"]\n                    if not isinstance(rid, str) or len(rid) > 100 or not isinstance(token, str) or not token.isascii() or len(token) != 64:\n                        raise ValueError("无效请求标识")\n                    registry.register(rid, token)\n                    value = True\n                elif op == "forget":\n                    registry.forget(data["request_id"])\n                    value = True\n                elif op == "stop":\n                    funnel.stop()\n                    value = True\n                else:\n                    raise ValueError("未知操作")\n                emit({"kind": "reply", "id": call_id, "value": value})\n            except (ValueError, KeyError, TypeError):\n                emit({"kind": "reply", "id": data.get("id") if isinstance(data, dict) else None, "error": "回传配置无效"})\n            except (RuntimeError, subprocess.SubprocessError) as error:\n                emit({"kind": "reply", "id": data.get("id"), "error": str(error)})\n    finally:\n        try:\n            funnel.stop()\n        except Exception:\n            # No task data, keys, or full subprocess responses reach stderr.\n            emit({"kind": "warning", "message": "8443 的清理状态未确认；请检查 Tailscale Funnel 配置"})\n        server.shutdown()\n        server.server_close()\n\n\nif __name__ == "__main__":\n    try:\n        main()\n    except OSError:\n        print(json.dumps({"kind": "fatal", "message": "本机回传端口 18741 无法启动；未更改现有服务"}), flush=True)\n';

// src/plugin-icons/context.mjs
function withPluginIcon(context, icon) {
  const services = /* @__PURE__ */ new Map();
  return new Proxy(context, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if ((key === "pages" || key === "panels") && value) {
      if (!services.has(key)) services.set(key, new Proxy(value, { get(service, name) {
        const method = Reflect.get(service, name, service);
        if (name === "register") return (contribution) => method.call(service, key === "pages" ? { ...contribution, icon } : contribution.launcher ? { ...contribution, launcher: { ...contribution.launcher, icon } } : contribution);
        return typeof method === "function" ? method.bind(service) : method;
      } }));
      return services.get(key);
    }
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

// <stdin>
function apply2(ctx) {
  return apply(withPluginIcon(ctx, "data:image/png;base64,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"));
}
export {
  apply2 as apply,
  destination,
  inject,
  routineInstructions,
  validEndpoint,
  validKey
};

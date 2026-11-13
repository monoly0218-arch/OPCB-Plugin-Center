export const inject = ["react", "agents", "host"];

export function destination(delivery) {
  const event = delivery.trigger?.event, channel = delivery.channelId;
  if (delivery.trigger?.type !== "mention" || event?.pubkey !== delivery.agent.owner ||
      channel !== delivery.config?.channel || !event.tags?.some(t => t[0] === "h" && t[1] === channel)) return null;
  const refs = event.tags.filter(t => t[0] === "e" && /^[a-f0-9]{64}$/.test(t[1] || ""));
  const root = refs.find(t => t[3] === "root")?.[1] || refs.find(t => t[3] === "reply")?.[1] || refs[0]?.[1] || event.id;
  return { event, channel, root };
}

export function apply(ctx) {
  const React = ctx.react, h = React.createElement;
  const listeners = new Set(), seen = new Set();
  let proc, boot, buffer = "", pending, closed = false;
  const notify = () => listeners.forEach(f => f());
  function stopped() {
    pending?.reject(new Error("电脑 Muse Link 已断开；任务可能仍在运行，没有自动重试"));
    pending = undefined; proc = undefined; boot = undefined; buffer = ""; notify();
  }
  async function launch() {
    if (closed) throw new Error("插件已关闭");
    if (!boot) boot = (async () => {
      if (!ctx.host.spawn) throw new Error("需要 Buzz 桌面版");
      const active = await ctx.host.spawn("bridge", { onStdout(chunk) {
        buffer += chunk;
        if (buffer.length > 500000) { active.kill(); stopped(); return; }
        let index;
        while ((index = buffer.indexOf("\n")) >= 0) {
          const row = buffer.slice(0, index); buffer = buffer.slice(index + 1);
          let result;
          try { result = JSON.parse(row); } catch { active.kill(); stopped(); return; }
          const call = pending; pending = undefined;
          call?.resolve(result); notify();
        }
      }});
      proc = active;
      active.exited.then(() => { if (proc === active) stopped(); });
      await active.write(JSON.stringify(CLIENT) + "\n");
      return active;
    })().catch(error => { boot = undefined; throw error; });
    return boot;
  }
  async function request(data, signal) {
    const active = await launch();
    if (pending) throw new Error("正在处理另一条请求，请等当前任务结束后再发新消息");
    if (signal?.aborted) throw new Error("已停止等待");
    let timer, abort, call;
    const result = new Promise((resolve, reject) => {
      call = pending = { resolve, reject };
      const terminate = message => {
        if (proc === active) { active.kill(); stopped(); }
        reject(new Error(message));
      };
      timer = setTimeout(() => terminate("等待超时；Muse 任务可能仍在运行，没有自动重试"), 615000);
      abort = () => terminate("已停止等待；Muse 任务可能仍在运行，没有自动重试");
      signal?.addEventListener("abort", abort, { once: true });
    });
    result.catch(() => {});
    notify();
    try {
      if (signal?.aborted) throw new Error("已停止等待");
      await active.write(JSON.stringify(data) + "\n");
      return await result;
    } catch (error) {
      if (proc === active) { active.kill(); stopped(); }
      throw error;
    } finally {
      clearTimeout(timer); signal?.removeEventListener("abort", abort);
      if (pending === call) { pending = undefined; notify(); }
    }
  }
  const errors = {
    not_connected: "请先启动电脑 Muse Link 并完成配对",
    local_link_unavailable: "电脑 Muse Link 未启动或连接中断；若已发送任务，请到 Muse 查看，不要重发旧任务",
    reply_timeout: "Muse 未在时限内通过专用命令返回结果；任务可能仍在运行，没有自动重试",
    send_not_confirmed: "未确认 Muse 接收状态；请在 Muse 查看，没有自动重试",
    duplicate_request: "这条请求已处理过，没有重复发送",
    busy: "Muse Link 正在处理上一条任务，请结束后再发新消息",
  };
  async function run(delivery) {
    const where = destination(delivery);
    if (!where) { delivery.ignored?.(); return; }
    if (!delivery.current() || closed) return;
    const summary = ctx.agents.relay(delivery.agent.pubkey)?.snapshot()?.session?.channels?.list()?.channels?.find(c => c.id === where.channel);
    if (!summary || !["stream", "forum"].includes(summary.channelType)) throw new Error("当前只支持设置中选定的普通频道");
    const key = delivery.agent.pubkey + ":" + where.event.id;
    if (seen.has(key)) { delivery.ignored?.(); return; }
    if (!where.event.content?.trim() || new TextEncoder().encode(where.event.content).length > 50000) throw new Error("消息需为 1–50000 个 UTF-8 字节");
    seen.add(key);
    if (seen.size > 4096) seen.delete(seen.values().next().value);
    delivery.acknowledged?.();
    delivery.step?.("正在交给电脑 Muse Link");
    const rid = crypto.randomUUID();
    const result = await request({ op: "ask", request_id: rid, message: where.event.content, wait: 300 }, delivery.signal);
    if (result?.ok !== true) throw new Error(errors[result?.error] || "Muse 回传失败，没有自动重试");
    if (result.request_id !== rid || typeof result.message !== "string" || !result.message.trim() || new TextEncoder().encode(result.message).length > 50000) throw new Error("Muse 返回的文字无效");
    if (!delivery.current() || closed || delivery.signal?.aborted) throw new Error("当前请求已停止，结果未发布");
    await delivery.agent.publish({ kind: 9, content: result.message,
      tags: [["h", where.channel], ["e", where.root, "", "reply"], ["p", delivery.agent.owner]] });
  }
  function Settings({ agent, save }) {
    const [channel, setChannel] = React.useState(agent.config?.channel || "");
    const [status, setStatus] = React.useState("");
    const [working, setWorking] = React.useState(false);
    const channels = (ctx.agents.relay(agent.pubkey)?.snapshot()?.session?.channels?.list()?.channels || []).filter(c => ["stream", "forum"].includes(c.channelType) && !c.archived && !c.readOnly);
    React.useEffect(() => { const update = () => setWorking(Boolean(pending)); listeners.add(update); return () => listeners.delete(update); }, []);
    async function check() {
      try { const result = await request({ op: "status" }); setStatus(result.ready ? "Muse 已连接，可发送新测试" : errors[result.error] || "电脑 Muse Link 尚未连接"); }
      catch (error) { setStatus(error.message); }
    }
    return h("section", { className: "ui-card", style: { padding: "var(--space-panel-inset)", display: "grid", gap: "var(--space-2)" } },
      h("p", null, "先启动电脑端「Buzz Muse Link」，完成手机配对，再选择一个普通频道。"),
      h("label", null, "频道", h("select", { value: channel, onChange: e => setChannel(e.target.value), style: { width: "100%" } },
        h("option", { value: "" }, "选择普通频道"), ...channels.map(c => h("option", { key: c.id, value: c.id }, c.name || c.id)))),
      h("button", { disabled: working || !channel.trim(), onClick: async () => { await save({ channel: channel.trim() }); setStatus("频道已保存；请检查连接后发一条新测试"); } }, "保存频道"),
      h("button", { disabled: working, onClick: check }, working ? "正在处理请求" : "检查连接"),
      status && h("p", { role: "status" }, status),
      h("p", null, "连接后，由你本人在所选频道提及此 Agent，发送「只回复收到」。以原线程出现真实回复为验收。"));
  }
  ctx.agents.register({ id: "muse", title: "Muse 连接器", description: "电脑独立配对的 Muse Link",
    defaults: () => ({ config: { channel: "" } }), summary: () => "Muse · 独立 Mac Link",
    tabs: [{ id: "settings", title: "Settings", role: "settings", component: Settings }], timeoutMs: 620000, run });
  ctx.effect(() => () => { closed = true; const active = proc; stopped(); active?.kill(); });
}

// Generated from scripts/buzz-client.py; contains no credentials.
const CLIENT = "#!/usr/bin/env python3\n# SPDX-License-Identifier: Apache-2.0\n\"\"\"Bounded stdio to owner-only local Muse socket. No credential access.\"\"\"\nimport json\nfrom pathlib import Path\nimport socket\nimport sys\n\nPATH = Path.home() / 'Library/Application Support/OPCB/MuseBuzzLink/bridge.sock'\nMAX_LINE = 320000\n\n\ndef main():\n    for line in sys.stdin:\n        request = None\n        try:\n            if len(line.encode('utf-8')) > MAX_LINE:\n                raise ValueError('too long')\n            request = json.loads(line)\n            if not isinstance(request, dict):\n                raise ValueError('invalid')\n            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:\n                connection.settimeout(610)\n                connection.connect(str(PATH))\n                connection.sendall(json.dumps(request).encode() + b'\\n')\n                raw = connection.makefile('rb').readline(MAX_LINE + 1)\n                if len(raw) > MAX_LINE or not raw.endswith(b'\\n'):\n                    raise ValueError('invalid response')\n                result = json.loads(raw)\n        except Exception:\n            result = {'ok': False, 'error': 'local_link_unavailable', 'may_have_run': bool(request and request.get('op') == 'ask')}\n        print(json.dumps(result, ensure_ascii=False), flush=True)\n\n\nif __name__ == '__main__':\n    main()\n";

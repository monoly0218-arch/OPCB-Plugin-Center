// src/plugin-icons/bases/opcb.muse-link/plugin.js
var inject = ["react", "agents", "host"];
function destination(delivery) {
  const event = delivery.trigger?.event, channel = delivery.channelId;
  if (delivery.trigger?.type !== "mention" || event?.pubkey !== delivery.agent.owner || channel !== delivery.config?.channel || !event.tags?.some((t) => t[0] === "h" && t[1] === channel)) return null;
  const refs = event.tags.filter((t) => t[0] === "e" && /^[a-f0-9]{64}$/.test(t[1] || ""));
  const root = refs.find((t) => t[3] === "root")?.[1] || refs.find((t) => t[3] === "reply")?.[1] || refs[0]?.[1] || event.id;
  return { event, channel, root };
}
function apply(ctx) {
  const React = ctx.react, h = React.createElement;
  const listeners = /* @__PURE__ */ new Set(), seen = /* @__PURE__ */ new Set();
  let proc, boot, buffer = "", pending, closed = false;
  const notify = () => listeners.forEach((f) => f());
  function stopped() {
    pending?.reject(new Error("电脑 Muse Link 已断开；任务可能仍在运行，没有自动重试"));
    pending = void 0;
    proc = void 0;
    boot = void 0;
    buffer = "";
    notify();
  }
  async function launch() {
    if (closed) throw new Error("插件已关闭");
    if (!boot) boot = (async () => {
      if (!ctx.host.spawn) throw new Error("需要 Buzz 桌面版");
      const active = await ctx.host.spawn("bridge", { onStdout(chunk) {
        buffer += chunk;
        if (buffer.length > 5e5) {
          active.kill();
          stopped();
          return;
        }
        let index;
        while ((index = buffer.indexOf("\n")) >= 0) {
          const row = buffer.slice(0, index);
          buffer = buffer.slice(index + 1);
          let result;
          try {
            result = JSON.parse(row);
          } catch {
            active.kill();
            stopped();
            return;
          }
          const call = pending;
          pending = void 0;
          call?.resolve(result);
          notify();
        }
      } });
      proc = active;
      active.exited.then(() => {
        if (proc === active) stopped();
      });
      await active.write(JSON.stringify(CLIENT) + "\n");
      return active;
    })().catch((error) => {
      boot = void 0;
      throw error;
    });
    return boot;
  }
  async function request(data, signal) {
    const active = await launch();
    if (pending) throw new Error("正在处理另一条请求，请等当前任务结束后再发新消息");
    if (signal?.aborted) throw new Error("已停止等待");
    let timer, abort, call;
    const result = new Promise((resolve, reject) => {
      call = pending = { resolve, reject };
      const terminate = (message) => {
        if (proc === active) {
          active.kill();
          stopped();
        }
        reject(new Error(message));
      };
      timer = setTimeout(() => terminate("等待超时；Muse 任务可能仍在运行，没有自动重试"), 615e3);
      abort = () => terminate("已停止等待；Muse 任务可能仍在运行，没有自动重试");
      signal?.addEventListener("abort", abort, { once: true });
    });
    result.catch(() => {
    });
    notify();
    try {
      if (signal?.aborted) throw new Error("已停止等待");
      await active.write(JSON.stringify(data) + "\n");
      return await result;
    } catch (error) {
      if (proc === active) {
        active.kill();
        stopped();
      }
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (pending === call) {
        pending = void 0;
        notify();
      }
    }
  }
  const errors = {
    not_connected: "请先启动电脑 Muse Link 并完成配对",
    local_link_unavailable: "电脑 Muse Link 未启动或连接中断；若已发送任务，请到 Muse 查看，不要重发旧任务",
    reply_timeout: "Muse 未在时限内通过专用命令返回结果；任务可能仍在运行，没有自动重试",
    send_not_confirmed: "未确认 Muse 接收状态；请在 Muse 查看，没有自动重试",
    duplicate_request: "这条请求已处理过，没有重复发送",
    busy: "Muse Link 正在处理上一条任务，请结束后再发新消息"
  };
  async function run(delivery) {
    const where = destination(delivery);
    if (!where) {
      delivery.ignored?.();
      return;
    }
    if (!delivery.current() || closed) return;
    const summary = ctx.agents.relay(delivery.agent.pubkey)?.snapshot()?.session?.channels?.list()?.channels?.find((c) => c.id === where.channel);
    if (!summary || !["stream", "forum"].includes(summary.channelType)) throw new Error("当前只支持设置中选定的普通频道");
    const key = delivery.agent.pubkey + ":" + where.event.id;
    if (seen.has(key)) {
      delivery.ignored?.();
      return;
    }
    if (!where.event.content?.trim() || new TextEncoder().encode(where.event.content).length > 5e4) throw new Error("消息需为 1–50000 个 UTF-8 字节");
    seen.add(key);
    if (seen.size > 4096) seen.delete(seen.values().next().value);
    delivery.acknowledged?.();
    delivery.step?.("正在交给电脑 Muse Link");
    const rid = crypto.randomUUID();
    const result = await request({ op: "ask", request_id: rid, message: where.event.content, wait: 300 }, delivery.signal);
    if (result?.ok !== true) throw new Error(errors[result?.error] || "Muse 回传失败，没有自动重试");
    if (result.request_id !== rid || typeof result.message !== "string" || !result.message.trim() || new TextEncoder().encode(result.message).length > 5e4) throw new Error("Muse 返回的文字无效");
    if (!delivery.current() || closed || delivery.signal?.aborted) throw new Error("当前请求已停止，结果未发布");
    await delivery.agent.publish({
      kind: 9,
      content: result.message,
      tags: [["h", where.channel], ["e", where.root, "", "reply"], ["p", delivery.agent.owner]]
    });
  }
  function Settings({ agent, save }) {
    const [channel, setChannel] = React.useState(agent.config?.channel || "");
    const [status, setStatus] = React.useState("");
    const [working, setWorking] = React.useState(false);
    const channels = (ctx.agents.relay(agent.pubkey)?.snapshot()?.session?.channels?.list()?.channels || []).filter((c) => ["stream", "forum"].includes(c.channelType) && !c.archived && !c.readOnly);
    React.useEffect(() => {
      const update = () => setWorking(Boolean(pending));
      listeners.add(update);
      return () => listeners.delete(update);
    }, []);
    async function check() {
      try {
        const result = await request({ op: "status" });
        setStatus(result.ready ? "Muse 已连接，可发送新测试" : errors[result.error] || "电脑 Muse Link 尚未连接");
      } catch (error) {
        setStatus(error.message);
      }
    }
    return h(
      "section",
      { className: "ui-card", style: { padding: "var(--space-panel-inset)", display: "grid", gap: "var(--space-2)" } },
      h("p", null, "先启动电脑端「Buzz Muse Link」，完成手机配对，再选择一个普通频道。"),
      h("label", null, "频道", h(
        "select",
        { value: channel, onChange: (e) => setChannel(e.target.value), style: { width: "100%" } },
        h("option", { value: "" }, "选择普通频道"),
        ...channels.map((c) => h("option", { key: c.id, value: c.id }, c.name || c.id))
      )),
      h("button", { disabled: working || !channel.trim(), onClick: async () => {
        await save({ channel: channel.trim() });
        setStatus("频道已保存；请检查连接后发一条新测试");
      } }, "保存频道"),
      h("button", { disabled: working, onClick: check }, working ? "正在处理请求" : "检查连接"),
      status && h("p", { role: "status" }, status),
      h("p", null, "连接后，由你本人在所选频道提及此 Agent，发送「只回复收到」。以原线程出现真实回复为验收。")
    );
  }
  ctx.agents.register({
    id: "muse",
    title: "Muse 连接器",
    description: "电脑独立配对的 Muse Link",
    defaults: () => ({ config: { channel: "" } }),
    summary: () => "Muse · 独立 Mac Link",
    tabs: [{ id: "settings", title: "Settings", role: "settings", component: Settings }],
    timeoutMs: 62e4,
    run
  });
  ctx.effect(() => () => {
    closed = true;
    const active = proc;
    stopped();
    active?.kill();
  });
}
var CLIENT = `#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Bounded stdio to owner-only local Muse socket. No credential access."""
import json
from pathlib import Path
import socket
import sys

PATH = Path.home() / 'Library/Application Support/OPCB/MuseBuzzLink/bridge.sock'
MAX_LINE = 320000


def main():
    for line in sys.stdin:
        request = None
        try:
            if len(line.encode('utf-8')) > MAX_LINE:
                raise ValueError('too long')
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError('invalid')
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
                connection.settimeout(610)
                connection.connect(str(PATH))
                connection.sendall(json.dumps(request).encode() + b'\\n')
                raw = connection.makefile('rb').readline(MAX_LINE + 1)
                if len(raw) > MAX_LINE or not raw.endswith(b'\\n'):
                    raise ValueError('invalid response')
                result = json.loads(raw)
        except Exception:
            result = {'ok': False, 'error': 'local_link_unavailable', 'may_have_run': bool(request and request.get('op') == 'ask')}
        print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
`;

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
  return apply(withPluginIcon(ctx, "data:image/webp;base64,UklGRuoJAABXRUJQVlA4IN4JAACwMgCdASqGAIYAPjEWiEKiISEWup1EIAMEs5nLqbjOwYZXMN0aofr6v8Ar2UM/Nzq+nYQMp90auXipsq0BILzH82Ujkzl7SGmBesYGy+/3uBGOg8hvm0Y8P+y2HZRcVjC9sZRQAtSA9G5etdmMOyoa+5Ds6ve6oIQ3+xn+GEHSKX/Qc/JQoxD6bDBglOuqsH0KCEypChPVGK4hZa1L+R3LC5D0D6aXf5D2UkdaY/E5W1OQ2EI19+4vqmjnCyQE3SyfuXOBs0BCAvR/cEUyMgreFwhcqnlmV+Sys6SxNEkgb6WgDwzNu6TTrr8G5YYB91X5h9JSCCnIvcdhlMsoEgNrfVEt1Vaa1gIgkJQdn+594zdtImqTiAgJuwZS/qfXEA8YXAAGuawI+5+Mk+Ac4sTMB331KrlyZKHx8+b5YaXXgElpibcminmemeCbSLAtmGuMOIR1jJOgM9AoJHhwmyyAMb4bicjcoaZDT/ac5cnbRpajKydWgFRorcsMPwSbiIU5XKSNVj7PuTv/raq80+/8xDYdnZgNEAfughuWkAAA/v5G+6bpgc5h1PFOq82JST1I+mpoF09YwFGHDWsaNlcFGM+QLQJig7JyZUe5wivcZx9e/nnwzoapKottEu7QvsxOoR7lzqXCE9/IA803wuclmNsNzD0OUB8jopHXaXHx9uRs2Fl5xgm7ZpCvy9jtsVIp/swGpU0swFcc4JGNJocbQEXlKY9DO6VeuGjxYFQGeMhezGyQX+iTKOZ4luSOFHJ6HJdndt5Mttz5i96TiXft7HwrVsdYS6zpFhwWbJxQ3N9fEJ3K+eiUO/KcQDlL0uY5Zu4dgm4bz0mbqELKJuvIObmVRptEqGsslptotTi/bwfeePVMjEv8jcWs8B47dKcl71UF8KiE5r8101zcZ3u9y+Vfme/rmNntFP2gdbN8Py6ZDg3pi2fPyRScEnsHrRcG4hjLBoDD213R/u1ZNSGpe7y+jnvX12h76pS3G1IvUt8R+axquSgSZBLNwnAG5HkGCL4qAAcCGjV5hXK9unUNUqtilBHyAnqTiNr1CBWnPO+6c6G98AOVJ+6KDvpP7m1JP+/21fjyQl7nf6kyY0rER2ZLM/maP7H69+z704HE7drxNgV5wiqnYpiSZH7YH9VC70hQC5D5cVPxUasCesQhPq5ce/9IH9hiAT/u3FlLL8ciUhz19UTCr/C6PttVe0UI5GpZmi+nq3Mthuk+2bYqwOkwt3oxejanO1L/hBvjx5FBDDrzMulTboZmCvUqIeuwlp/OAuvKgJf/vmv/zoP3iyS3vVOEo6Iazf+7Zr//dPH/BADFwbuvr5fTo03OumjExejnurypzoSGfkBLPdyHQN3+/uH88vAWNNskEG5Kp7inGXL+YAKdsYkLoOImPUY1rExiYBGSSgeSCIQMsrI7yE3i/faECN95k7/0q69ptENvFrerNOCs7rpoj3XVqKc8w8c6PBZTQCZj1gPEJrjLZEr8PxmiTyaQW/CxuRstacgQqgOA7tKAZDF/n0/pikfDJCfCoJfDjx+KI2GQE1xZ+PvB2+McNv7qNhEH1cU+Ruc3mWewldzmmSW9zIbn2xWZYv/j1nrv1ugn7Gkytv2oMiDTam6z5g9r7k8UmvpiVF+kX42nJ8EBwGHaBflGiG+VwElz6AWi1oqIyiM4yarAsnp6FidooZaGGjKGnSm5sCE+E/KU8Ed2Cc3a2dZ8fZLM9qH9EvSXcLb2w7fnaaJoC76OfZaZgjXdnSoxdseOveS0nS7l2BtxpzascLuf19CXbn14oWIOcXNBYQUKmfUkhEFAnvi1WCTtwxAFK0uyPDz7KTeAXJ9OT0Pyie5mAEoXhemqKe/VIjG2SpZlQqVYCamqGk9P7vB0vMtzpO/p1eAxjWfYCHltOsBC7lknobL8ZvpvKeZeqpkazJyete4Eug9+SGXKw0SblBw29gCuU9yEPZfeK6LGUfEbR8WdH7KOif7DZ8txfDtG5oZXYmj+aqsPzhn93GhjM65NKbs3Rok2c4MTg5zP9v5dZfIwmYFxANQFZ/fTcq9B3lkQf+FpSoTPVtWadrqlkNcDMWiQXAmAMblrzTPHe3lydgcekLivHAoubRZl5hwDoBY+mQEqjlfZMj4MYwxj2ldEzTzrHCD7OwXxin3Ampblbb7KbNDyOX2tibXqlLJGUyRXiiiniktPMZdYBOus931X5JXdw4uJMWtbHSF2vbagk7/HRh5wzo/plL5VEEZchuvsMAb+WKZjL+l5jfWTn9ZKyuRwENkgpAF2oCL38sGWtgFermj0gn1a5Y4T7CTcB8g4HclndhYjz3YY2uas0rD3LE8NFj7ZbO8olqjYeQpUI8FzMTnmrG51TobisA8UMNWG3DhUQ0rghgm+8FU8mIHwhTbYTR/6+RIDpf/DhCjAW7gR1x7jWht0KyRAnd3odOIUDs/gf9k6DtyjhIA95vaAOsav/SI1EU4MfgpuXpsbamt0EWx6lYCl0tVwe0Wl1tRf2PqbnSTvHIiHOuVQjAd/n0WhBzlAGnBAFe11U9qbuFP8z5lB7isi0ubX9J7l8k7hxZLoK7/6O4aH2kl5A21hAmGIXzdKfI9ac1rXmtpAEkyXUvz4UrEemCDQ6K+KztoWpSRTeELiC1a3UeuUpTcKGSGSu1VDKXG2SqK1LJwmdiahaCdDVs+X6guxh1EThj4SGVFrCAz96aoviBF52dfv3q4q/2drcrRe5pAxv7gjk/XZTb7fDkY84LSoN2M4sqH9zt1tjy4ivukTLBiq4Eb/eCOLEZtJjYAmYR9ASqmfCbYcrHoLISWEzKg2G0SB0/eodF9YHmWtvSFYNhPMnwB2D1DY31RzjVNmKawN8MLX7p0S/EbcQyfs/OXVQz44Fm4/Al8vaSK27EjC8UeVUj0xlSjtuPfAGVyApic1yZUSpnunTdukpxFIPkQzzXh7IhGxxdRzXZIru3s62m2nxmLiD5LVT8BZTSnYkHFpMh17yCC74qt39nxu99rRwp10Spe9wqNaatdYgMgY3VHc8kSNdOMSY7eBMIpWyBQPI/9yRdPz/6CPVzon2i5KvtOBj5iope8wIPzFGgwFJuyYGCwOf9cB19VmcBuP4stJN1g834t8S/eXXaZ/LK4SgFwIhATYhAxwLJgIDF3zUfYBU9GvqR6Y/Z5IYG7g+f8sZBSA3EaA1T53s5q4B5Z5w7a5id2fkZQHYANYXnfHt+lDetv3A8H/94btj9WoLDW+WiFYs48jZ4fE/pRDqymwGu9BighRdNRkwflQHm5UnWreJgFkdFdcpXm0FKWDZJb4ufcpVtH+SlhUrO8/uENBUkAS4zIq+EyddKUIc44H5K8HvMWAAAA="));
}
export {
  apply2 as apply,
  destination,
  inject
};

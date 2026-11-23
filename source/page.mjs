export const inject = ["react", "pages", "host"];

const WORKER_TIMEOUT = 300_000;

function makeBridge(ctx) {
  let active = false;
  let process = null;
  let stopped = false;
  ctx.effect(() => () => {
    stopped = true;
    if (process) void process.kill().catch(() => {});
  });

  return async function run(action, data) {
    if (stopped) throw Error("插件已关闭");
    if (active) throw Error("上一项网络操作还在进行");
    if (!ctx.host.spawn) throw Error("当前 Buzz 不支持桌面进程");
    active = true;
    let timer;
    try {
      let output = "";
      process = await ctx.host.spawn("network-bridge", {
        onStdout(chunk) {
          if (output.length <= 65536) output += chunk;
        },
      });
      if (stopped) throw Error("插件已关闭");
      const expired = new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("操作超时，请刷新状态后重试")), WORKER_TIMEOUT);
      });
      const result = await Promise.race([
        (async () => {
          await process.end(NETWORK_HELPER_NATIVE + "\n" + JSON.stringify({ action, ...data }) + "\n");
          return await process.exited;
        })(),
        expired,
      ]);
      if (result !== 0 || output.length > 65536) throw Error("无法启动本机网络组件，请重试");
      let response;
      try { response = JSON.parse(output); }
      catch { throw Error("本机网络组件返回了无效结果"); }
      if (response?.ok !== true) {
        const error = Error(response?.error || "操作未完成，请重试");
        error.disconnected = response?.disconnected === true;
        throw error;
      }
      return response.value;
    } finally {
      clearTimeout(timer);
      if (process) await process.kill().catch(() => {});
      process = null;
      active = false;
    }
  };
}

function supportsMac(output) {
  const [arch, version] = (output ?? "").trim().split(/\s+/);
  return arch === "1" && /^\d+\.\d+(\.\d+)?$/.test(version ?? "") && Number(version.split(".")[0]) >= 13;
}

const spacing = {
  page: { padding: "var(--space-panel-inset, 24px)", maxWidth: 840, margin: "0 auto", display: "grid", gap: 16 },
  section: { padding: 18, display: "grid", gap: 12, minWidth: 0 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px 12px", flexWrap: "wrap" },
  actions: { display: "flex", alignItems: "center", gap: "8px 12px", flexWrap: "wrap" },
  text: { margin: 0, lineHeight: 1.55 },
  heading: { margin: 0, fontSize: 18 },
  list: { margin: 0, paddingInlineStart: 22, lineHeight: 1.65 },
  rows: { display: "grid", margin: 0, gap: 7 },
  field: { display: "grid", gap: 6 },
  input: { width: "100%", maxWidth: 400, minHeight: 34, paddingInline: 8, boxSizing: "border-box" },
};

const extensionLabels = {
  installation: "在 sing-box 点「安装系统扩展」。",
  approval: "在「网络扩展」中开启 SFMExtension 并确认。",
  vpnPermission: "在 sing-box 中允许添加 VPN 配置。",
  unknown: "检查 macOS 网络扩展设置后重新读取状态。",
};

export function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const run = makeBridge(ctx);
  const ui = ctx.reflect?.get("ui");

  function button(label, props = {}, variant = "subtle") {
    return h(ui?.Button ?? "button", {
      type: "button",
      ...props,
      ...(ui?.Button ? { variant } : {}),
    }, label);
  }

  function section(title, ...children) {
    return h("section", { className: "ui-card", style: spacing.section },
      h("h2", { style: spacing.heading }, title), ...children);
  }

  function facts(rows) {
    return h("dl", { style: spacing.rows }, ...rows.map(row => h("div", { key: row.title, style: spacing.row },
      h("dt", { style: { margin: 0 } }, row.title),
      h("dd", { style: { margin: 0, overflowWrap: "anywhere" } }, row.value),
    )));
  }

  function NetworkPage() {
    const [platform, setPlatform] = React.useState("loading");
    const [tab, setTab] = React.useState("member");
    const [busy, setBusy] = React.useState("");
    const [message, setMessage] = React.useState(null);
    const [status, setStatus] = React.useState(null);
    const [activation, setActivation] = React.useState(null);
    const [report, setReport] = React.useState(null);
    const [cutover, setCutover] = React.useState(false);
    const [issuerReady, setIssuerReady] = React.useState(false);
    const [receipt, setReceipt] = React.useState(null);
    const locked = React.useRef(false);
    const issuerInput = React.useRef(null);

    async function task(description, operation) {
      if (locked.current) return;
      locked.current = true;
      setBusy(description);
      setMessage(null);
      try { await operation(); }
      catch (error) { setMessage({ error: true, text: error.message }); }
      finally {
        locked.current = false;
        setBusy("");
      }
    }

    React.useEffect(() => {
      const mac = globalThis.navigator?.platform?.startsWith("Mac");
      if (!mac) {
        setPlatform("unsupported");
        return;
      }
      let live = true;
      void (async () => {
        let supported;
        try { supported = supportsMac(await ctx.host.runCommand("mac-version")) && !!ctx.host.spawn; }
        catch { supported = false; }
        if (!live) return;
        setPlatform(supported ? "ready" : "unsupported");
        if (supported) {
          await task("读取本机状态", async () => {
            setStatus(await run("scan"));
            setActivation((await run("activation-status")).active);
          });
        }
      })();
      return () => { live = false; };
    }, []);

    const action = (description, fn, disabled = false) => ({
      disabled: Boolean(busy) || disabled,
      onClick: () => void task(description, fn),
    });

    const refresh = () => action("读取本机状态", async () => setStatus(await run("scan")));

    function perform(description, command, setter, success, disabled = false) {
      return action(description, async () => {
        const value = await run(command);
        setter?.(value);
        if (success) setMessage({ text: success });
      }, disabled);
    }

    function activate(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const code = new FormData(form).get("code");
      return task("正在激活", async () => {
        const value = await run("activate", { code });
        setActivation(value.active);
        form.reset();
        setMessage({ text: "本机已激活，可以获取团队节点。" });
      });
    }

    function issue(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const values = new FormData(form);
      const code = String(values.get("code")).trim().normalize("NFC");
      return task("正在发放口令", async () => {
        setReceipt(null);
        try {
          const { expires } = await run("issue", { code, minutes: Number(values.get("minutes")) });
          setReceipt({ code, expires });
          form.querySelector("[name=code]").value = "";
        } catch (error) {
          if (error.disconnected) setIssuerReady(false);
          throw error;
        }
      });
    }

    const note = busy ? h("p", { role: "status", style: spacing.text }, busy + "…")
      : message ? h("p", { role: message.error ? "alert" : "status", style: spacing.text }, message.text) : null;

    const diagnostic = section("网络检查",
      h("div", { style: spacing.row },
        h("strong", null, status ? "健康度 " + status.score + " / 100" : "状态待读取"),
        button("刷新状态", refresh()),
      ),
      status ? facts(status.rows) : null,
      status?.ports?.length ? h("details", null, h("summary", null, "查看占用端口"), facts(status.ports)) : null,
    );

    const activationSection = section("本机激活",
      h("p", { style: spacing.text }, activation === true ? "已激活" : activation === false ? "输入团队发给你的一次性口令。" : "激活状态待确认。"),
      activation !== true ? h("form", { onSubmit: activate, style: spacing.field },
        h("label", { style: spacing.field }, "激活口令", h("input", { style: spacing.input, type: "password",
          name: "code", required: true, maxLength: 96, autoComplete: "off", disabled: Boolean(busy) })),
        h("div", { style: spacing.actions }, button("激活此 Mac", { type: "submit", disabled: Boolean(busy) }, "primary"),
          button("检查激活", perform("查询激活状态", "activation-status", value => setActivation(value.active)))),
      ) : null,
    );

    const installSection = section("安装与 macOS 授权",
      h("p", { style: spacing.text }, !status?.installed ? "下载安装经过校验的官方 sing-box。"
        : status.extension === "complete" ? "安装和 VPN 授权已完成。"
          : extensionLabels[status.extension] ?? "安装后刷新状态。"),
      status?.extensionError ? h("p", { style: spacing.text }, "系统扩展验证失败时，请在「隐私与安全性」检查 App 管理权限。") : null,
      h("div", { style: spacing.actions },
        !status?.installed ? button("安装 sing-box", perform("下载并校验官方安装包", "install", null, "macOS 安装器已打开。安装完成后刷新状态。"), "primary") : null,
        status?.installed && status.extension !== "complete" ? button("进入系统网络扩展", perform("打开系统设置", "extension-settings")) : null,
        status?.extensionError ? button("隐私与安全性", perform("打开隐私设置", "privacy-settings")) : null,
        status?.installed && status.extension !== "complete" ? button("打开 sing-box", perform("打开 sing-box", "open-sfm")) : null,
        button("刷新授权状态", refresh()),
      ),
    );

    const configured = status?.extension === "complete" && status?.installed;
    const profileSection = section("导入团队节点并切换",
      h("p", { style: spacing.text }, status?.imported ? "团队节点已确认导入。"
        : status?.hasProfile ? "已获取节点。请在 sing-box 的导入窗口确认。"
          : "激活后获取分配给这台 Mac 的团队节点。"),
      h("div", { style: spacing.actions },
        button("获取团队节点", perform("获取并校验团队节点", "fetch-profile", value => {
          setStatus(value);
          setReport(null);
        }, "节点已保存，可以导入。", activation !== true)),
        button("导入 sing-box", perform("打开节点导入", "import", null, "请在 sing-box 确认导入，再回来登记。", !configured || !status?.hasProfile)),
        status?.hasProfile && !status.imported ? button("确认已导入", perform("登记节点导入", "confirm-import", setStatus, "已登记导入。", !configured)) : null,
      ),
      status?.hasLegacy ? h("p", { style: spacing.text }, "检测到旧代理。切换会先验证团队节点，并按 macOS 提示退出旧服务。") : null,
      h("div", { style: spacing.actions },
        status?.hasLegacy && !cutover ? button("切换旧代理", {
          disabled: Boolean(busy) || !configured || !status.imported,
          onClick: () => setCutover(true),
        }) : null,
        status?.hasLegacy && cutover ? button("验证节点并退出旧代理", action("验证节点与退出旧代理", async () => {
          setStatus(await run("cutover"));
          setCutover(false);
        }), "primary") : null,
        status?.hasLegacy && cutover ? button("取消切换", { disabled: Boolean(busy), onClick: () => setCutover(false) }) : null,
        !status?.hasLegacy ? button("启动 sing-box", perform("启动 sing-box", "start", setStatus, null,
          !configured || !status?.imported || status?.vpn === "Connected"), "primary") : null,
      ),
      status?.needsHelper && status.vpn !== "Connected" ? h("p", { style: spacing.text },
        "如提示需要辅助服务，在 sing-box 的「设置 → 应用 → 辅助服务」点击「安装」，并按 macOS 提示授权。") : null,
    );

    const testSection = section("连接验证",
      h("p", { style: spacing.text }, report ? (report.passed ? "检查全部通过。" : "有检查未通过。")
        : "运行双节点、DNS、Buzz 及站点连通性检查。"),
      button("验证连接", action("验证连接", async () => {
        setReport(null);
        setReport(await run("test"));
      }, status?.vpn !== "Connected" || !status?.imported), "primary"),
      report ? facts(report.rows) : null,
    );

    const issuer = section("发放一次性口令",
      h("div", { style: spacing.row },
        h("p", { style: spacing.text }, issuerReady ? "激活与节点服务已就绪" : "需要管理员 Mac 上的团队服务器权限。"),
        button("检查服务器", action("检查团队服务器", async () => {
          setIssuerReady(false);
          setIssuerReady((await run("issuer-status")).ready);
        })),
      ),
      h("form", { onSubmit: issue, style: spacing.field },
        h("label", { style: spacing.field }, "口令", h("input", { ref: issuerInput, style: spacing.input, type: "text",
          name: "code", required: true, minLength: 4, maxLength: 96, autoComplete: "off", spellCheck: false, disabled: Boolean(busy) })),
        h("label", { style: spacing.field }, "有效期（分钟）", h("input", { style: { ...spacing.input, maxWidth: 130 }, type: "number",
          name: "minutes", defaultValue: 50, min: 1, max: 43200, required: true, disabled: Boolean(busy) })),
        h("div", { style: spacing.actions }, button("随机生成", {
          disabled: Boolean(busy),
          onClick: () => {
            const bytes = crypto.getRandomValues(new Uint8Array(24));
            issuerInput.current.value = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_");
            issuerInput.current.focus();
          },
        }), button("发放口令", { type: "submit", disabled: Boolean(busy) || !issuerReady }, "primary")),
      ),
      receipt ? h("div", { style: spacing.field },
        h("p", { style: { ...spacing.text, overflowWrap: "anywhere" } }, receipt.code),
        h("p", { style: spacing.text }, "有效至 " + new Date(receipt.expires * 1000).toLocaleString()),
        button("复制口令", action("复制口令", async () => {
          if (ctx.host.writeClipboardText) await ctx.host.writeClipboardText(receipt.code);
          else await navigator.clipboard.writeText(receipt.code);
          setMessage({ text: "已复制口令。请私下发给对应成员。" });
        })),
      ) : null,
    );

    return h("main", { style: spacing.page },
      h("header", null, h("h1", { style: { margin: 0, fontSize: 25 } }, "OPCB 网络助手")),
      platform === "loading" ? h("p", { role: "status", style: spacing.text }, "检查设备…") : null,
      platform === "unsupported" ? h("p", { style: spacing.text }, "请使用 Buzz 桌面端与 macOS 13 或更新的 Apple 芯片 Mac。") : null,
      platform === "ready" ? h(React.Fragment, null,
        h("nav", { style: spacing.actions, "aria-label": "网络助手功能" },
          button("成员接入", { "aria-pressed": tab === "member", disabled: Boolean(busy), onClick: () => { setTab("member"); setMessage(null); } },
            tab === "member" ? "primary" : "subtle"),
          button("管理员发放", { "aria-pressed": tab === "issuer", disabled: Boolean(busy), onClick: () => { setTab("issuer"); setMessage(null); } },
            tab === "issuer" ? "primary" : "subtle"),
        ),
        note,
        tab === "member" ? h(React.Fragment, null, diagnostic, activationSection, installSection, profileSection, testSection) : issuer,
      ) : null,
    );
  }

  ctx.pages.register({ id: "network", title: "网络助手", primary: true, component: NetworkPage, icon: NETWORK_HELPER_ICON });
}

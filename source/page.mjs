import { resumeSetup, setupIssue, stages } from "./flow.mjs";

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

const icons = {
  check: "M1 12h3l1.5-3.5 1.5 8 2-11 1.7 16 1.7-20 2 15 1.6-10 1.5 8 1.3-3h4",
  install: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
  switch: "M3 8h17l-4-4M21 16H4l4 4",
  verify: "M12 2 4 5v6c0 5 4 8 8 11 4-3 8-6 8-11V5l-8-3Zm-4 10 3 3 5-6",
};

const extensionSteps = [
  { title: "安装系统扩展", asset: "sfm-install-extension", label: "在 sing-box 的仪表页点安装系统扩展",
    size: [1816,1304], crop: [420,199,365,115], mark: [469,236,234,49], max: 276 },
  { title: "打开系统设置", asset: "sfm-open-system-settings", label: "在弹窗点 Open System Settings",
    size: [518,168], crop: [0,0,518,168], mark: [28,78,462,60], max: 276 },
  { title: "开启 SFMExtension", asset: "sfm-network-extensions", label: "网络扩展右侧的详情按钮",
    text: "「网络扩展」右侧点 ⓘ", size: [900,112], crop: [0,0,900,112], mark: [840,23,54,50] },
  { title: "允许添加 VPN 配置", asset: "sfm-allow-vpn", label: "在添加 VPN 配置的弹窗点允许",
    size: [488,227], crop: [0,0,488,227], mark: [13,157,234,63], max: 226 },
];

const launchSteps = [
  ["在 sing-box 左上角点「启动」▶", "若弹出「需要辅助服务」，点「打开设置」。"],
  ["安装辅助服务", "在「设置」→「应用」找到「辅助服务」，点「安装」。"],
  ["允许 macOS 权限", "允许 sing-box 在后台运行。出现「允许修改 App」时，核对应用名称后点「允许」。"],
  ["再点一次「启动」▶", "回到 Buzz 刷新状态，检测到 VPN 已连接后即可验证。"],
];

export function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const run = makeBridge(ctx);

  function button(text, props = {}, primary = false) {
    return h("button", { type: "button", className: "onh-btn", "data-primary": primary, ...props }, text);
  }

  function wordmark() {
    return h("img", { className: "onh-mark", src: NETWORK_HELPER_ART["opcb-wordmark"], alt: "OPCB" });
  }

  function symbol(type) {
    if (icons[type]) return h("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8,
      strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, h("path", { d: icons[type] }));
    const filled = type === "good" || type === "warning";
    return h("svg", { width: 16, height: 16, viewBox: "0 0 16 16", className: "onh-" + type, "aria-hidden": true },
      h("circle", { cx: 8, cy: 8, r: 6.5, fill: filled ? "currentColor" : "none", stroke: "currentColor", strokeWidth: 1.2 }),
      type === "good" ? h("path", { d: "m4.8 8 2 2 4.3-4.6", fill: "none", stroke: "white", strokeWidth: 1.35, strokeLinecap: "round" })
        : type === "warning" ? h("path", { d: "M8 4.7v3.9m0 2.2v.2", stroke: "white", strokeWidth: 1.4, strokeLinecap: "round" }) : null,
    );
  }

  const item = (title, value, tone = "neutral") => ({ title, value, tone });

  function rows(items) {
    return h("dl", { className: "onh-rows" }, ...items.map(({ title, tone, value }) =>
      h("div", { key: title, className: "onh-row" }, h("dt", null, title), h("dd", null, symbol(tone), value))));
  }

  function extensionGuide(progress) {
    const current = { installation: [0], approval: [1,2], vpnPermission: [3] }[progress] ?? [];
    return h("div", { className: "onh-guide-grid" }, ...extensionSteps.map((step, index) => {
      const active = current.includes(index);
      const complete = current.length && index < current[0];
      const [x,y,w,l] = step.crop;
      const [a,b,c,d] = step.mark;
      return h("div", { className: "onh-guide", "data-current": active, key: step.asset },
        h("h3", null, h("span", { className: active ? "onh-warning" : "onh-neutral" }, (index + 1) + "."), step.title,
          active ? h("small", null, "待操作") : complete ? symbol("good") : null),
        step.text ? h("p", null, step.text) : null,
        h("div", { className: "onh-shot", style: { aspectRatio: w + "/" + l, maxWidth: step.max } },
          h("img", { src: NETWORK_HELPER_ART[step.asset], alt: step.label, style: {
            width: (step.size[0] / w * 100) + "%", left: (-x / w * 100) + "%", top: (-y / l * 100) + "%",
          } }),
          h("i", { "aria-hidden": true, style: {
            width: (c / w * 100) + "%", height: (d / l * 100) + "%",
            left: ((a - x) / w * 100) + "%", top: ((b - y) / l * 100) + "%",
          } }),
        ),
      );
    }));
  }

  function NetworkPage() {
    const [platform, setPlatform] = React.useState("loading");
    const [page, setPage] = React.useState("activate");
    const [daily, setDaily] = React.useState(false);
    const [issuerOpen, setIssuerOpen] = React.useState(false);
    const [busy, setBusy] = React.useState("");
    const [message, setMessage] = React.useState(null);
    const [status, setStatus] = React.useState(null);
    const [activation, setActivation] = React.useState("unknown");
    const [activationCodeEntered, setActivationCodeEntered] = React.useState(false);
    const [report, setReport] = React.useState(null);
    const [confirmStop, setConfirmStop] = React.useState(false);
    const [issuerReady, setIssuerReady] = React.useState(false);
    const [receipt, setReceipt] = React.useState(null);
    const locked = React.useRef(false);
    const issuerInput = React.useRef(null);
    const portsSheet = React.useRef(null);

    async function task(title, operation) {
      if (locked.current) return;
      locked.current = true;
      setBusy(title);
      setMessage(null);
      try { await operation(); }
      catch (error) { setMessage({ error: true, text: error.message }); }
      finally {
        locked.current = false;
        setBusy("");
      }
    }

    function feedback(text, error = false) { setMessage({ text, error }); }

    async function refresh() {
      const latest = await run("scan");
      setStatus(latest);
      return latest;
    }

    async function activationStatus() {
      const value = await run("activation-status");
      setActivation(value.state);
      return value;
    }

    React.useEffect(() => {
      if (!globalThis.navigator?.platform?.startsWith("Mac")) {
        setPlatform("unsupported");
        return;
      }
      let live = true;
      void (async () => {
        let supported;
        try { supported = supportsMac(await ctx.host.runCommand("mac-version")) && !!ctx.host.spawn; }
        catch { supported = false; }
        if (!live) return;
        if (!supported) return setPlatform("unsupported");
        await task("正在验证", async () => {
          try {
            const value = await activationStatus();
            const latest = await refresh();
            const initial = resumeSetup(value.state, latest);
            setDaily(initial.daily);
            setPage(initial.page);
            if (value.message && !initial.daily) feedback(value.message, true);
          } finally {
            setPlatform("ready");
          }
        });
      })();
      return () => { live = false; };
    }, []);

    React.useEffect(() => {
      if (issuerOpen || (page !== "install" && page !== "switch")) return;
      const onFocus = () => void task("正在刷新本机状态", refresh);
      globalThis.addEventListener("focus", onFocus);
      return () => globalThis.removeEventListener("focus", onFocus);
    }, [page, issuerOpen]);

    function action(text, title, operation, options = {}) {
      return button(text, {
        disabled: Boolean(busy) || options.disabled,
        onClick: () => void task(title, operation),
      }, options.primary);
    }

    function go(target) {
      setMessage(null);
      setConfirmStop(false);
      setPage(target);
    }

    function nav(text, target, primary = false) {
      return button(text, { disabled: Boolean(busy), onClick: () => go(target) }, primary);
    }

    function native(text, title, command, after, primary = false) {
      return action(text, title, async () => {
        const result = await run(command);
        after(result);
      }, { primary });
    }

    function openCommand(text, title, command, primary = false) {
      return action(text, title, async () => { await run(command); }, { primary });
    }

    async function activated() {
      setActivation("active");
      const latest = await refresh();
      if (latest.setupHistory) setDaily(true);
      go("check");
    }

    function activate(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const code = new FormData(form).get("code");
      void task("正在激活这台 Mac", async () => {
        await run("activate", { code });
        form.reset();
        setActivationCodeEntered(false);
        await activated();
      });
    }

    function goIssue(issue) {
      go(issue.page);
      feedback(issue.reason, true);
    }

    async function verify() {
      setReport(null);
      const latest = await refresh();
      const issue = setupIssue(activation, latest);
      if (issue) return goIssue(issue);
      const result = await run("test");
      setReport(result);
      setDaily(true);
      feedback(result.passed ? "连接检查全部通过" : "检查完成，请查看有异常的项目", !result.passed);
    }

    const knownHealth = setupIssue(activation, status);
    const extensionPending = status?.installed && !status.extensionError && status.extension !== "complete";
    const launchGuide = status?.needsHelper && status.imported && !status.hasLegacy
      && status.vpn !== "Connected" && status.extension === "complete";
    const readyToRecheck = action("刷新状态", "正在刷新本机状态", refresh);
    const notice = busy ? h("p", { className: "onh-notice", role: "status" }, h("span", { className: "onh-spinner", "aria-hidden": true }), busy)
      : message ? h("p", { className: "onh-notice", role: message.error ? "alert" : "status" },
        message.error ? symbol("warning") : null, message.text) : null;

    function tools(primary, ...secondary) {
      return h("footer", { className: "onh-footer" }, notice,
        h("div", { className: "onh-actions" }, ...secondary,
          h("div", { className: "onh-primary-slot" }, primary)));
    }

    function checkView() {
      return {
        main: status ? [
          rows(status.networkRows || status.rows),
          status.ports.length ? h("div", null, button("查看占用端口", {
            disabled: Boolean(busy), onClick: () => portsSheet.current.showModal(),
          })) : null,
          h("div", { className: "onh-score" }, h("span", null, "网络健康度"),
            h("strong", { className: status.score >= 85 ? "onh-good" : "onh-warning" }, status.score + " / 100")),
          daily && knownHealth ? h("div", { className: "onh-repair" }, symbol("warning"), knownHealth.reason,
            button(knownHealth.action, {
              disabled: Boolean(busy), onClick: () => knownHealth.page === "check" ? void task("正在检查", refresh) : go(knownHealth.page),
            })) : null,
        ] : [h("p", null, busy || "等待检查")],
        footer: tools(nav(daily ? "连接验证" : "下一步", daily ? "verify" : "install", true),
          action("重新检查", "正在检查这台 Mac", async () => {
            await refresh();
            if (daily) await activationStatus();
          })),
      };
    }

    function installView() {
      const installed = status?.installed && !status.extensionError;
      return {
        main: [rows([
          item("安装平台", "Apple 芯片", "good"),
          item("sing-box", installed ? "已安装 " + status.version : "待安装", installed ? "good" : "neutral"),
          item("安装包", "官方签名 · 1.14.4"),
        ])],
        footer: tools(installed ? nav("下一步", "switch", true)
          : openCommand("打开官方安装器", "下载并校验官方安装包", "install", true), readyToRecheck),
      };
    }

    function switchView() {
      const connected = status?.vpn === "Connected";
      const nextStep = !status?.installed ? null : extensionPending ? null
        : !status?.hasProfile ? null : !status.imported ? "在 sing-box 点「导入」后，回到这里点「我已导入」。"
          : status.hasLegacy ? "节点已导入。下一步退出旧代理。"
            : !connected ? "下一步启动 sing-box。"
              : status.dnsOnTunnel !== true || status.routeOnTunnel !== true ? "在 sing-box 选中刚导入的配置。"
                : "sing-box 已启动。下一步验证连接。";
      const serviceRows = rows([
        item("团队节点", status?.imported ? "已确认导入" : status?.hasProfile ? "在 sing-box 确认导入" : "待获取", status?.imported ? "good" : "neutral"),
        status?.extensionRow ?? item("网络扩展", "待检查"),
        item("旧代理", status?.hasLegacy ? (status.legacy.join("、") || "Clash Verge 后台服务") : "未运行", status?.hasLegacy ? "warning" : "good"),
        item("sing-box VPN", connected ? "已连接" : "待启动", connected ? "good" : "neutral"),
        ...(status?.extensionError ? [item("扩展签名", "请用官方安装器重装", "warning")] : []),
      ]);
      const secondary = [readyToRecheck];
      let primary;
      if (!status?.installed) primary = nav("先安装 sing-box", "install", true);
      else if (status.extensionError) primary = openCommand("打开官方安装器", "下载并校验官方安装包", "install", true);
      else if (extensionPending) primary = status.extension === "approval"
        ? openCommand("打开系统设置", "正在打开系统设置", "extension-settings", true)
        : openCommand("打开 sing-box", "正在打开 sing-box", "open-sfm", true);
      else if (!status.hasProfile) primary = action("获取团队节点", "正在获取并校验团队节点", async () => {
        if (activation !== "active") return goIssue(setupIssue(activation, status));
        const latest = await run("fetch-profile");
        setStatus(latest);
        setReport(null);
        if (!latest.imported) await run("import");
      }, { primary: true });
      else if (!status.imported) {
        secondary.push(openCommand("重新打开导入", "正在打开节点导入", "import"));
        primary = native("我已导入", "登记节点导入", "confirm-import", setStatus, true);
      } else if (status.hasLegacy) primary = button("退出旧代理", { disabled: Boolean(busy), onClick: () => setConfirmStop(true) }, true);
      else if (!connected) {
        if (launchGuide) secondary.push(openCommand("打开隐私设置", "正在打开隐私设置", "privacy-settings"));
        primary = native(launchGuide ? "打开 sing-box" : "启动 sing-box", "正在启动 sing-box", "start", setStatus, true);
      } else if (status.dnsOnTunnel !== true || status.routeOnTunnel !== true) {
        primary = openCommand("打开 sing-box", "正在打开 sing-box", "open-sfm", true);
      } else primary = nav("前往验证", "verify", true);

      return {
        title: extensionPending ? "安装网络扩展" : launchGuide ? "启动 sing-box" : null,
        main: extensionPending ? [extensionGuide(status.extension), status.extension === "unknown" ? rows([status.extensionRow]) : null]
          : launchGuide ? [h("div", { className: "onh-guide onh-guide-text" }, ...launchSteps.map(([title, text], index) =>
            h("div", { key: title }, h("strong", null, (index + 1) + ". " + title), h("p", null, text)))), rows([status.helperRow])]
            : [nextStep ? h("p", { className: "onh-inline" }, nextStep) : null, serviceRows],
        footer: confirmStop ? h("footer", { className: "onh-footer" }, notice,
          h("p", null, "退出旧代理时，当前网络可能短暂切换。"),
          h("div", { className: "onh-actions" },
            button("取消", { disabled: Boolean(busy), onClick: () => setConfirmStop(false) }),
            action("确认退出", "验证团队节点并退出旧代理", async () => {
              setStatus(await run("cutover"));
              setConfirmStop(false);
            }, { primary: true })))
          : tools(primary, ...secondary),
      };
    }

    function verifyView() {
      const vpnReady = status?.vpn === "Connected";
      return {
        main: [rows(report?.rows ?? [
          item("节点", status?.imported ? "已导入" : "待导入", status?.imported ? "good" : "warning"),
          item("sing-box VPN", vpnReady ? "已连接" : "待连接", vpnReady ? "good" : "warning"),
          item("实际连接", "待测试"),
        ]), knownHealth ? h("div", { className: "onh-repair" }, symbol("warning"), knownHealth.reason) : null],
        footer: tools(action(report ? "重新验证" : "开始验证", "正在验证连接", verify, { primary: true }),
          nav(daily ? "返回检查" : "返回切换", daily ? "check" : "switch")),
      };
    }

    function memberView() {
      const view = { check: checkView, install: installView, switch: switchView, verify: verifyView }[page]();
      const simplified = daily && (page === "check" || page === "verify");
      const steps = simplified ? ["check","verify"] : Object.keys(stages);
      return h("div", { className: "onh-frame" },
        h("header", { className: "onh-header" }, wordmark(), h("span", { className: "onh-divider", "aria-hidden": true }),
          h("span", { className: "onh-brand" }, "网络助手"),
          h("div", { className: "onh-header-right" },
            page !== "check" && status?.vpn === "Connected" ? h("span", { className: "onh-connected" }, symbol("good"), "sing-box 已连接") : null,
            issuerLink())),
        h("div", { className: "onh-body" },
          h("nav", { className: "onh-nav", "aria-label": simplified ? "网络检查导航" : "首次设置步骤" },
            ...steps.map(id => h("button", { key: id, type: "button", className: "onh-step",
              "aria-current": page === id ? "step" : undefined, disabled: Boolean(busy), onClick: () => go(id),
            }, simplified ? null : h("small", null, stages[id].number),
            h("strong", null, simplified ? (id === "check" ? "网络检查" : "连接验证") : stages[id].label)))),
          h("section", { className: "onh-pane" },
            h("h1", { className: "onh-headline" }, symbol(page), view.title || stages[page].headline),
            h("div", { className: "onh-scroll" }, ...view.main),
            view.footer)),
        status?.ports?.length ? h("dialog", { ref: portsSheet, className: "onh-sheet", "aria-label": "端口占用" },
          h("h2", null, "端口占用"), rows(status.ports),
          h("div", { className: "onh-actions" }, button("完成", { onClick: () => portsSheet.current.close() }, true))) : null,
      );
    }

    function issuerLink() {
      return h("button", { type: "button", className: "onh-link", disabled: Boolean(busy),
        onClick: () => { setIssuerOpen(!issuerOpen); setMessage(null); setReceipt(null); setActivationCodeEntered(false); },
      }, issuerOpen ? "返回网络助手" : "管理员发放");
    }

    function activationView() {
      const shouldEnter = activation === "inactive";
      return h("div", { className: "onh-center" },
        h("div", { className: "onh-issuer-nav" }, issuerLink()),
        h("form", { className: "onh-activation", onSubmit: activate },
          wordmark(), h("h1", null, "激活网络助手"),
          shouldEnter ? h("input", { className: "onh-input", placeholder: "团队激活口令", "aria-label": "团队激活口令",
            type: "password", name: "code", required: true, maxLength: 96, autoComplete: "off", disabled: Boolean(busy),
            onChange: event => setActivationCodeEntered(event.currentTarget.value.trim() !== "") }) : null,
          notice,
          shouldEnter ? button("激活这台 Mac", { type: "submit", disabled: Boolean(busy) || !activationCodeEntered }, true)
            : action("检查激活状态", "正在验证", async () => {
              const value = await activationStatus();
              if (value.state === "active") await activated();
              else if (value.message) feedback(value.message, true);
            }, { primary: true }),
          daily ? nav("返回检查", "check") : null,
        ),
      );
    }

    function issue(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const input = form.elements.namedItem("code");
      const code = input.value.trim().normalize("NFC");
      const minutes = Number(form.elements.namedItem("minutes").value);
      void task("正在发放口令", async () => {
        setReceipt(null);
        try {
          const { expires } = await run("issue", { code, minutes });
          setReceipt({ code, expires });
          input.value = "";
        } catch (error) {
          if (error.disconnected) setIssuerReady(false);
          throw error;
        }
      });
    }

    function issuerView() {
      return h("div", { className: "onh-center" },
        h("div", { className: "onh-issuer-nav" }, issuerLink()),
        h("section", { className: "onh-issuer" },
          h("div", { className: "onh-actions onh-issuer-top" }, wordmark(),
            action(issuerReady ? "服务器已连接" : "检查服务器", "正在检查团队服务器", async () => {
              setIssuerReady(false);
              setIssuerReady((await run("issuer-status")).ready);
            })),
          h("h1", null, "生成激活口令"),
          h("form", { onSubmit: issue },
            h("label", null, "口令",
              h("div", { className: "onh-issuer-input" },
                h("input", { ref: issuerInput, className: "onh-input", name: "code", "aria-label": "口令",
                  placeholder: "输入中文或英文口令", minLength: 4, maxLength: 96, required: true, autoComplete: "off", disabled: Boolean(busy) }),
                button("随机生成", { disabled: Boolean(busy), onClick: () => {
                  const bytes = crypto.getRandomValues(new Uint8Array(24));
                  issuerInput.current.value = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_");
                  issuerInput.current.focus();
                } }))),
            h("label", null, "有效期", h("span", { className: "onh-actions" },
              h("input", { className: "onh-input", style: { width: 76 }, type: "number", name: "minutes",
                "aria-label": "有效分钟数", defaultValue: 50, min: 1, max: 43200, required: true, disabled: Boolean(busy) }),
              "分钟")),
            notice,
            receipt ? h("div", { className: "onh-receipt" },
              h("strong", null, receipt.code), h("p", null, "有效至 " + new Date(receipt.expires * 1000).toLocaleString()),
              action("复制口令", "正在复制", async () => {
                if (ctx.host.writeClipboardText) await ctx.host.writeClipboardText(receipt.code);
                else await navigator.clipboard.writeText(receipt.code);
                feedback("已复制口令。请私下发给对应成员。");
              })) : null,
            h("div", { className: "onh-actions onh-issuer-top" }, h("span", { className: "onh-neutral" }, "每个口令限一台 Mac"),
              button("生成口令", { type: "submit", disabled: Boolean(busy) || !issuerReady }, true))),
        ),
      );
    }

    return h("main", { className: "onh" }, h("style", null, NETWORK_HELPER_STYLES),
      platform === "loading" ? h("div", { className: "onh-center" },
        h("div", { className: "onh-activation" }, wordmark(), h("h1", null, "激活网络助手"),
          h("p", { className: "onh-notice", role: "status" }, h("span", { className: "onh-spinner", "aria-hidden": true }), "正在核对本机状态")))
        : platform === "unsupported" ? h("div", { className: "onh-center" },
          h("p", null, "请在 macOS 13 或更新版本的 Apple 芯片 Mac 上打开 Buzz 桌面端。"))
          : issuerOpen ? issuerView() : page === "activate" ? activationView() : memberView(),
    );
  }

  ctx.pages.register({ id: "network", title: "网络助手", primary: true, layout: "workspace",
    component: NetworkPage, icon: NETWORK_HELPER_ICON });
}

export const inject = ["react", "pages", "host"];

const ICON = "data:image/png;base64,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";
const MEMBER_DOWNLOAD = "https://github.com/miaopantao/opcb-network-helper/releases/tag/v1.1.2";

const VPN_STATUS = new Map([
  ["Connected", "已连接"],
  ["Connecting", "连接中"],
  ["Disconnected", "未连接"],
  ["Disconnecting", "正在断开"],
  ["Invalid", "配置无效"],
  ["No service", "尚未创建 VPN 配置"],
]);

const APPS = {
  helper: {
    command: "open-helper",
    name: "OPCB 网络助手",
    recovery: "请先下载成员端，解压后将 App 放到「应用程序」，再试一次。",
  },
  issuer: {
    command: "open-issuer",
    name: "OPCB 口令管理",
    recovery: "请使用团队私下发放的口令管理 App，解压后将它放到「应用程序」，再试一次。",
  },
};

const spacing = {
  page: { maxWidth: 700, margin: "0 auto", padding: "var(--space-panel-inset, 24px)", display: "grid", gap: 16 },
  card: { padding: 18, minWidth: 0, display: "grid", gap: 12 },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 },
  actions: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 },
  title: { margin: 0, fontSize: 24, lineHeight: 1.25 },
  heading: { margin: 0, fontSize: 17, lineHeight: 1.4 },
  text: { margin: 0, lineHeight: 1.6 },
  steps: { margin: 0, paddingInlineStart: 22, lineHeight: 1.65 },
};

function supportsMac(result) {
  const [arm64, version] = (result ?? "").trim().split(/\s+/);
  if (arm64 === "0") return false;
  if (arm64 !== "1" || !/^\d+\.\d+(\.\d+)?$/.test(version ?? "")) return null;
  return Number(version.split(".")[0]) >= 13;
}

function activeMac() {
  const platform = globalThis.navigator?.platform;
  return !platform || platform.startsWith("Mac");
}

export function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const Button = ctx.reflect?.get("ui")?.Button;
  function button(label, props) {
    return h(Button ?? "button", { type: "button", ...props }, label);
  }

  function NetworkHelper() {
    const [device, setDevice] = React.useState(activeMac() ? null : false);
    const [vpn, setVpn] = React.useState("尚未读取");
    const [refreshing, setRefreshing] = React.useState(activeMac());
    const [launch, setLaunch] = React.useState(null);
    const refreshInFlight = React.useRef(false);
    const launchInFlight = React.useRef(false);

    async function refresh() {
      if (!activeMac() || refreshInFlight.current) return;
      refreshInFlight.current = true;
      setRefreshing(true);
      try {
        const supported = supportsMac(await ctx.host.runCommand("mac-version"));
        setDevice(supported);
        if (supported !== true) return;
        const output = await ctx.host.runCommand("vpn-status");
        const firstLine = output?.split("\n", 1)[0].trim();
        setVpn(VPN_STATUS.get(firstLine) ?? "无法读取");
      } catch {
        setVpn("无法读取");
      } finally {
        refreshInFlight.current = false;
        setRefreshing(false);
      }
    }

    React.useEffect(() => { void refresh(); }, []);

    async function openApp(role) {
      if (device !== true || launchInFlight.current) return;
      launchInFlight.current = true;
      const app = APPS[role];
      setLaunch({ role, action: "opening", message: `正在打开「${app.name}」…` });
      try {
        const result = await ctx.host.runCommand(app.command);
        if (result === null) throw new Error("App could not be opened");
        setLaunch({ role, action: "opened", message: `已请求 macOS 打开「${app.name}」。` });
      } catch {
        setLaunch({ role, action: "failed", message: `无法打开「${app.name}」。${app.recovery}` });
      } finally {
        launchInFlight.current = false;
      }
    }

    const launchDisabled = device !== true || launch?.action === "opening";
    const feedback = role => launch?.role === role ? launch.message : "";
    const status = refreshing ? "正在读取…" : device === false ? "需要 Apple 芯片 Mac" :
      device === null ? "无法确认设备是否支持" : vpn;

    return h("main", { style: spacing.page },
      h("header", null,
        h("h1", { style: spacing.title }, "OPCB 网络助手"),
        h("p", { style: { ...spacing.text, marginTop: 6 } }, "适用于 macOS 13 或更高版本的 Apple 芯片 Mac。"),
      ),
      h("section", { className: "ui-card", style: spacing.card, "aria-labelledby": "opcb-network-status" },
        h("div", { style: spacing.row },
          h("div", null,
            h("h2", { id: "opcb-network-status", style: spacing.heading }, "sing-box 连接"),
            h("p", { style: spacing.text, role: "status" }, status),
          ),
          activeMac() ? button("刷新状态", { disabled: refreshing, onClick: refresh }) : null,
        ),
      ),
      h("section", { className: "ui-card", style: spacing.card, "aria-labelledby": "opcb-network-member" },
        h("h2", { id: "opcb-network-member", style: spacing.heading }, "成员安装与激活"),
        h("ol", { style: spacing.steps },
          h("li", null, "向管理员领取一次性激活口令，在网络助手中输入。"),
          h("li", null, "跟随向导安装 sing-box，在 macOS 中允许网络扩展及 VPN 配置。"),
          h("li", null, "获取团队节点，在 sing-box 导入并启动。回到 Buzz 可刷新连接状态。"),
        ),
        h("div", { style: spacing.actions },
          button("打开网络助手", { disabled: launchDisabled, onClick: () => openApp("helper") }),
          device !== false ? h("a", { href: MEMBER_DOWNLOAD, target: "_blank", rel: "noopener noreferrer" }, "下载成员 App 1.1.2") : null,
        ),
        h("div", { role: "status", style: feedback("helper") ? spacing.text : { display: "contents" } }, feedback("helper")),
      ),
      h("details", { className: "ui-card", style: { padding: 18 } },
        h("summary", { style: { ...spacing.heading, cursor: "pointer", fontWeight: 600 } }, "管理员发放口令"),
        h("p", { style: { ...spacing.text, marginBlock: "10px 12px" } },
          "在已配置团队服务器权限的 Mac 上打开口令管理。生成后，把一次性口令私下发给对应成员。"),
        button("打开口令管理", { disabled: launchDisabled, onClick: () => openApp("issuer") }),
        h("div", { role: "status", style: feedback("issuer") ? { ...spacing.text, marginTop: 8 } : { display: "contents" } }, feedback("issuer")),
      ),
    );
  }

  ctx.pages.register({ id: "network", title: "网络助手", primary: true, icon: ICON, component: NetworkHelper });
}

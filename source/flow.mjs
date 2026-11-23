export const stages = {
  check: { number: "第一步", label: "检查", headline: "检查这台 Mac" },
  install: { number: "第二步", label: "安装", headline: "安装 sing-box" },
  switch: { number: "第三步", label: "切换", headline: "导入并切换" },
  verify: { number: "第四步", label: "验证", headline: "验证连接" },
};

export function setupIssue(activation, status) {
  if (activation !== "active") {
    return { page: "activate", reason: activation === "revoked" ? "本机激活已停用"
      : activation === "inactive" ? "本机还未激活" : "激活状态待核对",
    action: activation === "inactive" ? "激活本机" : "核对激活" };
  }
  if (!status) return { page: "check", reason: "本机状态待读取", action: "重新检查" };
  if (!status.installed || status.extensionError) {
    return { page: "install", reason: status.extensionError ? "扩展签名需要修复" : "需要安装官方 sing-box", action: "前往安装" };
  }
  if (status.extension !== "complete") return { page: "switch", reason: "网络扩展或 VPN 待授权", action: "前往授权" };
  if (!status.hasProfile || !status.imported) {
    return { page: "switch", reason: status.hasProfile ? "团队节点待确认导入" : "尚未获取团队节点", action: "前往导入" };
  }
  if (status.hasLegacy) return { page: "switch", reason: "检测到旧代理，切换后再验证", action: "前往切换" };
  if (status.vpn !== "Connected") return { page: "switch", reason: "sing-box 尚未连接", action: "前往启动" };
  if (status.dnsOnTunnel !== true || status.routeOnTunnel !== true) {
    return { page: "switch", reason: "请在 sing-box 选中已导入的团队配置", action: "检查配置" };
  }
  return null;
}

export function resumeSetup(activation, status) {
  if (status?.setupHistory) return { daily: true, page: "check" };
  if (activation !== "active") return { daily: false, page: "activate" };
  if (status?.imported) return { daily: false, page: setupIssue(activation, status)?.page ?? "verify" };
  if (status?.hasProfile) return { daily: false, page: status.installed && !status.extensionError ? "switch" : "install" };
  return { daily: false, page: "check" };
}

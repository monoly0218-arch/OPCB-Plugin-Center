import AppKit
import Darwin
import Foundation

struct CheckRow: Identifiable {
    enum Kind { case good, neutral, warning }
    let title: String
    let value: String
    let kind: Kind
    var id: String { title }
}

enum ExtensionState: Sendable {
    case missing, pending, enabled, removalPending, unknown

    init(list: Output?) {
        guard let list, list.status == 0 else {
            self = .unknown
            return
        }
        let entries = list.text.split(whereSeparator: \.isNewline)
            .filter { $0.split(whereSeparator: \.isWhitespace).contains(Substring(Release.extensionID)) }
        if entries.contains(where: { $0.contains("[activated enabled]") }) { self = .enabled }
        else if entries.contains(where: { $0.contains("waiting for user") || $0.contains("[activated disabled]") }) { self = .pending }
        else if entries.contains(where: { $0.contains("waiting to uninstall on reboot") }) { self = .removalPending }
        else if entries.isEmpty { self = .missing }
        else { self = .unknown }
    }

    var row: CheckRow {
        switch self {
        case .missing: return CheckRow(title: "网络扩展", value: "待安装", kind: .neutral)
        case .pending: return CheckRow(title: "网络扩展", value: "待 macOS 授权", kind: .warning)
        case .enabled: return CheckRow(title: "网络扩展", value: "已启用", kind: .good)
        case .removalPending: return CheckRow(title: "网络扩展", value: "重启 Mac 后再安装", kind: .warning)
        case .unknown: return CheckRow(title: "网络扩展", value: "无法读取状态", kind: .warning)
        }
    }
}

enum ExtensionProgress {
    case installation, approval, vpnPermission, complete, unknown

    init(state: ExtensionState, hasVPNConfiguration: Bool) {
        switch state {
        case .missing, .removalPending: self = .installation
        case .pending: self = .approval
        case .enabled: self = hasVPNConfiguration ? .complete : .vpnPermission
        case .unknown: self = .unknown
        }
    }

    var currentSteps: ClosedRange<Int>? {
        switch self {
        case .installation: return 1...1
        case .approval: return 2...3
        case .vpnPermission: return 4...4
        case .complete, .unknown: return nil
        }
    }

    func hasCompleted(_ step: Int) -> Bool {
        self == .complete || currentSteps.map { step < $0.lowerBound } == true
    }
}

enum HelperServiceState: Sendable {
    case missing, stopped, running, unknown

    init(result: Output?) {
        guard let result else { self = .unknown; return }
        guard result.status == 0 else {
            self = result.error.contains("Could not find service") ? .missing : .unknown
            return
        }
        let state = result.text.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .first { $0.hasPrefix("state = ") }
        if state == "state = running" { self = .running }
        else { self = state == nil ? .unknown : .stopped }
    }

    var needsSetup: Bool { self == .missing || self == .stopped }

    var row: CheckRow {
        switch self {
        case .missing: return CheckRow(title: "辅助服务", value: "待安装", kind: .warning)
        case .stopped: return CheckRow(title: "辅助服务", value: "已安装 · 尚未运行", kind: .warning)
        case .running: return CheckRow(title: "辅助服务", value: "已运行", kind: .good)
        case .unknown: return CheckRow(title: "辅助服务", value: "状态待确认", kind: .neutral)
        }
    }
}

struct MacStatus {
    let busyPorts: [CheckRow]
    let legacy: [String]
    let clashService: Bool
    let systemProxy: Bool
    let interface: String?
    let vpn: String
    let extensionState: ExtensionState
    let helperService: HelperServiceState
    let version: String?
    let trustedApp: Bool
    let dnsOnTunnel: Bool?
    let competingTunnel: Bool
    let recentExtensionError: Bool

    var vpnReady: Bool { vpn == "Connected" }
    var hasVPNConfiguration: Bool { ["Connected", "Disconnected", "Connecting", "Disconnecting"].contains(vpn) }
    var extensionProgress: ExtensionProgress {
        ExtensionProgress(state: extensionState, hasVPNConfiguration: hasVPNConfiguration)
    }
    var hasLegacy: Bool { !legacy.isEmpty || clashService }

    var healthScore: Int {
        guard interface != nil else { return 0 }
        let legacyCount = legacy.count + (clashService && !legacy.contains("Clash Verge") ? 1 : 0)
        let proxyCount = legacyCount + (vpnReady ? 1 : 0)
        let overlap = min(3, max(0, proxyCount - 1))
        let portPressure = overlap > 0 ? min(3, busyPorts.count) * 3 : 0
        let deductions = (legacyCount > 0 ? 10 : 0) + overlap * 23 + portPressure
            + (systemProxy ? 12 : 0) + (competingTunnel ? 15 : 0) + (dnsOnTunnel == false ? 20 : 0)
        return max(0, 100 - deductions)
    }

    var activeVersion: String? {
        guard trustedApp, let version, version.compare(Release.version, options: .numeric) != .orderedAscending else { return nil }
        return version
    }

    var rows: [CheckRow] {
        [
            CheckRow(title: "代理端口", value: busyPorts.isEmpty ? "常用端口空闲" : "\(busyPorts.count) 个端口在用",
                     kind: busyPorts.isEmpty ? .good : .neutral),
            CheckRow(title: "旧代理", value: hasLegacy ? "检测到旧代理在运行" : "未运行",
                     kind: hasLegacy ? .warning : .good),
            CheckRow(title: "系统代理", value: systemProxy ? "已启用 · 待核对" : "未启用",
                     kind: systemProxy ? .warning : .good),
            CheckRow(title: "网络路径", value: competingTunnel ? "公网仍有旧隧道接管" : interface.map { vpnReady ? "sing-box 已连接" : "已连接 · \($0)" } ?? "未找到默认路由",
                     kind: competingTunnel || interface == nil ? .warning : .good),
            CheckRow(title: "sing-box", value: activeVersion.map { "已安装 \($0)" } ?? (version == nil ? "待安装" : "待核对版本与签名"),
                     kind: activeVersion == nil ? .neutral : .good),
        ] + (dnsOnTunnel == false ? [CheckRow(title: "分流 DNS", value: "未进入 sing-box 隧道", kind: .warning)] : [])
    }
}

struct TestReport {
    let hy2: Int
    let vless: Int
    let chatgpt: Bool
    let buzz: Bool
    let domestic: Bool
    let dns: Bool
    let throughSFM: Bool

    var passed: Bool { hy2 == 3 && vless == 3 && chatgpt && buzz && domestic && dns && throughSFM }

    var rows: [CheckRow] {
        let results = [("ChatGPT", chatgpt), ("Buzz", buzz), ("国内网站", domestic), ("分流 DNS", dns)]
        return [
            CheckRow(title: "Hysteria2", value: "\(hy2)/3 通过", kind: hy2 == 3 ? .good : .warning),
            CheckRow(title: "VLESS Reality", value: "\(vless)/3 通过", kind: vless == 3 ? .good : .warning),
        ] + results.map { title, success in
            CheckRow(title: title, value: throughSFM ? (success ? "已连通" : "连接异常") : "待确认 VPN 路由",
                     kind: throughSFM && success ? .good : .warning)
        }
    }
}

enum Network {
    static let ports = [1082, 1083, 17897, 7890, 7891, 7897, 9090]
    static let oldApps: [String: String] = [
        "com.liguangming.Shadowrocket": "小火箭",
        "io.github.clash-verge-rev.clash-verge-rev": "Clash Verge",
        "com.west2online.ClashXPro": "ClashX Pro",
        "com.follow.clash": "FlClash",
    ]
    static let clash = "io.github.clash-verge-rev.clash-verge-rev.service"

    static func interface(to host: String = "default") -> String? {
        guard !host.isEmpty, !host.hasPrefix("-") else { return nil }
        return routeInterface(["-n", "get", host])
    }

    private static func routeInterface(_ arguments: [String]) -> String? {
        let output = Command.text("/sbin/route", arguments)
        return output.split(whereSeparator: \.isNewline)
            .first(where: { $0.trimmingCharacters(in: .whitespaces).hasPrefix("interface:") })?
            .split(whereSeparator: \.isWhitespace).last.map(String.init)
    }

    private static func physicalInterface(to host: String) -> String? {
        if let selected = interface(to: host), selected.hasPrefix("en") { return selected }
        let paths = Command.text("/usr/sbin/scutil", ["--nwi"])
        return paths.split(whereSeparator: \.isNewline)
            .compactMap { $0.split(whereSeparator: \.isWhitespace).first }
            .first(where: { $0.hasPrefix("en") && $0.dropFirst(2).allSatisfy(\.isNumber) })
            .map(String.init)
    }

    static func vpnState(_ name: String = "SFM") -> String {
        Command.text("/usr/sbin/scutil", ["--nc", "status", name])
            .split(whereSeparator: \.isNewline).first.map(String.init) ?? ""
    }

    static func extensionState() -> ExtensionState {
        ExtensionState(list: try? Command.run("/usr/bin/systemextensionsctl", ["list"], timeout: 4))
    }

    static func helperServiceState() -> HelperServiceState {
        HelperServiceState(result: try? Command.run("/bin/launchctl",
                                                   ["print", "system/io.nekohasekai.sfamt.helper"], timeout: 4))
    }

    static func scan(appIDs: Set<String>, dnsAddress: String?) -> MacStatus {
        let sockets = Command.text("/usr/sbin/lsof", ["-nP", "-sTCP:LISTEN", "-Fpcn"] + ports.map { "-iTCP:\($0)" })
        var owner = ""
        var owners: [Int: Set<String>] = [:]
        for line in sockets.split(whereSeparator: \.isNewline) {
            if line.hasPrefix("c") { owner = String(line.dropFirst()) }
            if line.hasPrefix("n"), let port = Int(line.split(separator: ":").last ?? ""),
               ports.contains(port), !owner.isEmpty { owners[port, default: []].insert(owner) }
        }
        let busy = ports.compactMap { port -> CheckRow? in
            let names = owners[port]
            guard names != nil || portBusy(port, family: AF_INET) || portBusy(port, family: AF_INET6) else { return nil }
            return CheckRow(title: String(port),
                            value: names?.sorted().joined(separator: "、") ?? "端口在用 · 程序未识别",
                            kind: .neutral)
        }
        let oldVPN = vpnState("Shadowrocket")
        var legacy = Set(appIDs.compactMap { oldApps[$0] })
        if oldVPN == "Connected" || oldVPN == "Connecting" { legacy.insert("小火箭") }
        let processNames = Command.text("/bin/ps", ["-axo", "comm"])
        let isClash = processNames.contains("/MacOS/clash-verge-service") || processNames.contains("/cores/verge-mihomo")
        let systemProxy = Command.text("/usr/sbin/scutil", ["--proxy"])
        let proxyOn = ["HTTPEnable : 1", "HTTPSEnable : 1", "SOCKSEnable : 1"].contains(where: { systemProxy.contains($0) })
            || (systemProxy.contains("ProxyAutoConfigEnable : 1") && !systemProxy.contains("127.0.0.1:19873/codex.pac"))
        let version = Bundle(url: Release.app)?.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        let trusted = version != nil && isOfficialApp()
        let vpn = vpnState()
        let netInterface = interface() ?? routeInterface(["-n", "get", "-inet6", "default"])
        let publicInterface = vpn != "Connected" && (isClash || !legacy.isEmpty)
            ? interface(to: "1.1.1.1") ?? netInterface : nil
        let state = extensionState()
        let badSignature = trusted && state == .missing && hasRecentExtensionError()
        return MacStatus(busyPorts: busy, legacy: legacy.sorted(), clashService: isClash,
                         systemProxy: proxyOn, interface: netInterface, vpn: vpn,
                         extensionState: state, helperService: trusted ? helperServiceState() : .unknown,
                         version: version, trustedApp: trusted,
                         dnsOnTunnel: vpn == "Connected" ? dnsAddress.map(activeDNS) : nil,
                         competingTunnel: ["utun", "tun"].contains(where: { publicInterface?.hasPrefix($0) == true }),
                         recentExtensionError: badSignature)
    }

    static func isOfficialApp() -> Bool {
        let requirement = "anchor apple generic and identifier \"\(Release.appID)\" and certificate leaf[subject.OU] = \"\(Release.team)\""
        let check = try? Command.run("/usr/bin/codesign", ["--verify", "--strict", "-R=" + requirement, Release.app.path], timeout: 6)
        return check?.status == 0
    }

    private static func hasRecentExtensionError() -> Bool {
        let predicate = "process == \"sysextd\" AND eventMessage CONTAINS[c] \"\(Release.extensionID)\""
        let report = try? Command.run("/usr/bin/log", ["show", "--last", "15m", "--style", "compact", "--predicate", predicate], timeout: 3)
        return report?.text.contains("extension failed to validate") == true
    }

    static func portBusy(_ port: Int, family: Int32 = AF_INET) -> Bool {
        let fd = socket(family, SOCK_STREAM, 0)
        guard fd >= 0 else { return false }
        defer { close(fd) }
        var result: Int32
        if family == AF_INET {
            var addr = sockaddr_in()
            addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
            addr.sin_family = sa_family_t(AF_INET)
            addr.sin_port = in_port_t(port).bigEndian
            addr.sin_addr = in_addr(s_addr: in_addr_t(INADDR_LOOPBACK).bigEndian)
            result = withUnsafePointer(to: &addr) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
            }
        } else {
            var addr = sockaddr_in6()
            addr.sin6_len = UInt8(MemoryLayout<sockaddr_in6>.size)
            addr.sin6_family = sa_family_t(AF_INET6)
            addr.sin6_port = in_port_t(port).bigEndian
            addr.sin6_addr = in6addr_loopback
            result = withUnsafePointer(to: &addr) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in6>.size)) }
            }
        }
        return result != 0 && errno == EADDRINUSE
    }

    static func stopOldServices(clash: Bool, shadow: Bool) throws {
        if clash {
            let command = """
                label=\(Self.clash)
                /bin/launchctl disable system/$label || exit 1
                if /bin/launchctl print system/$label >/dev/null 2>&1; then
                  /bin/launchctl bootout system/$label || exit 1
                fi
                /usr/bin/pkill -f '^/Library/Application Support/clash-verge-service/cores/verge-mihomo$' || true
                """
            let result = try Command.run("/usr/bin/osascript", [
                "-e", "on run argv",
                "-e", "do shell script (item 1 of argv) with administrator privileges",
                "-e", "end run", command
            ], timeout: 180)
            guard result.status == 0 else {
                throw SetupError.message("Clash Verge 服务仍待管理员确认")
            }
        }
        if shadow && ["Connected", "Connecting"].contains(vpnState("Shadowrocket")) {
            _ = try Command.run("/usr/sbin/scutil", ["--nc", "stop", "Shadowrocket"])
        }
    }

    static func activeDNS(_ host: String) -> Bool {
        let configured = Command.text("/usr/sbin/scutil", ["--dns"])
            .split(whereSeparator: \.isNewline)
            .contains { $0.contains("nameserver[") && $0.split(whereSeparator: \.isWhitespace).last == Substring(host) }
        return configured && interface(to: host)?.hasPrefix("utun") == true
    }

    static func verifyBeforeCutover(_ profile: NodeProfile, core: URL) throws {
        for node in profile.nodes where try probe(node, core: core, rounds: 1) == 1 { return }
        throw SetupError.message("两个节点均未连通，旧代理仍在运行")
    }

    static func tests(_ profile: NodeProfile, core: URL) throws -> TestReport {
        guard vpnState() == "Connected", let dnsAddress = profile.dnsAddress,
              activeDNS(dnsAddress),
              interface(to: "1.1.1.1")?.hasPrefix("utun") == true else {
            throw SetupError.message("请先启动 sing-box 并确认 DNS 路由")
        }
        let dns = ["www.qq.com", "chatgpt.com"].allSatisfy { host in
            let answer = try? Command.run("/usr/bin/dig", ["@" + dnsAddress, host, "A", "+short", "+time=3", "+tries=1"])
            return answer?.status == 0 && answer?.text.split(whereSeparator: \.isNewline).contains(where: { $0.split(separator: ".").count == 4 && $0.first?.isNumber == true }) == true
        }
        let chatgpt = status("https://chatgpt.com/") == "200"
        let buzz = status("https://paogroup.communities.buzz.xyz/") == "200" && buzzWebSocket()
        let domestic = ["https://www.baidu.com/", "https://www.bilibili.com/"].allSatisfy {
            ["200", "301", "302"].contains(status($0))
        }
        let counts = try profile.nodes.map { try probe($0, core: core) }
        let usingVPN = vpnState() == "Connected" && activeDNS(dnsAddress)
        return TestReport(hy2: counts[0], vless: counts[1], chatgpt: chatgpt, buzz: buzz,
                          domestic: domestic, dns: dns, throughSFM: usingVPN)
    }

    private static func buzzWebSocket() -> Bool {
        let nonce = Data((0..<16).map { _ in UInt8.random(in: 0...255) }).base64EncodedString()
        let result = try? Command.run("/usr/bin/curl", [
            "-q", "--silent", "--noproxy", "", "--proxy", "", "--http1.1", "--max-time", "5",
            "-H", "Connection: Upgrade", "-H", "Upgrade: websocket", "-H", "Sec-WebSocket-Version: 13",
            "-H", "Sec-WebSocket-Key: " + nonce, "-o", "/dev/null", "-w", "%{http_code} %{ssl_verify_result}",
            "https://paogroup.communities.buzz.xyz/"
        ])
        return result?.text == "101 0"
    }

    private static func status(_ url: String, proxy: String = "", timeout: Double = 9) -> String {
        let attempt = try? Command.run("/usr/bin/curl", [
            "-q", "--silent", "--show-error", "--noproxy", "", "--proxy", proxy, "--compressed",
            "--connect-timeout", "4", "--max-time", String(Int(timeout)), "--output", "/dev/null",
            "--write-out", "%{http_code} %{ssl_verify_result}", url
        ], timeout: timeout + 2)
        guard let attempt, attempt.status == 0 else { return "" }
        let fields = attempt.text.split(separator: " ")
        return fields.count == 2 && fields[1] == "0" ? String(fields[0]) : ""
    }

    private static func probe(_ source: [String: Any], core: URL, rounds: Int = 3) throws -> Int {
        guard let host = source["server"] as? String, let route = physicalInterface(to: host) else {
            throw SetupError.message("节点地址没有可验证的物理网卡路由")
        }
        guard let port = (0..<25).map({ _ in Int.random(in: 22000...48000) }).first(where: { !portBusy($0) }) else {
            throw SetupError.message("没有可用的本机测试端口")
        }
        let folder = try PrivateFolder()
        defer { folder.remove() }
        var node = source
        node["tag"] = "test-node"
        node["bind_interface"] = route
        node.removeValue(forKey: "detour")
        let config: [String: Any] = [
            "log": ["level": "warn"],
            "inbounds": [["type": "socks", "listen": "127.0.0.1", "listen_port": port]],
            "outbounds": [node], "route": ["final": "test-node"]
        ]
        let configFile = folder.url.appendingPathComponent("test.json")
        try PrivateFolder.write(JSONSerialization.data(withJSONObject: config), to: configFile)
        let service = Process()
        service.executableURL = core
        service.arguments = ["run", "-c", configFile.path]
        service.standardOutput = FileHandle.nullDevice
        service.standardError = FileHandle.nullDevice
        service.standardInput = FileHandle.nullDevice
        try service.run()
        defer {
            if service.isRunning {
                service.terminate()
                for _ in 0..<10 where service.isRunning { Thread.sleep(forTimeInterval: 0.05) }
                if service.isRunning { kill(service.processIdentifier, SIGKILL) }
            }
            service.waitUntilExit()
        }
        for _ in 0..<35 {
            if !service.isRunning || portBusy(port) { break }
            Thread.sleep(forTimeInterval: 0.05)
        }
        guard service.isRunning, portBusy(port) else { return 0 }
        return (0..<rounds).reduce(0) { hits, _ in
            hits + (status("https://www.google.com/generate_204", proxy: "socks5h://127.0.0.1:\(port)") == "204" ? 1 : 0)
        }
    }
}

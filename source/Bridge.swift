import AppKit
import CryptoKit
import Darwin
import Foundation

private struct Input: Decodable {
    let action: String
    let code: String?
    let minutes: Int?

    func canonicalCode() throws -> String {
        let value = (code ?? "").trimmingCharacters(in: .whitespacesAndNewlines).precomposedStringWithCanonicalMapping
        guard (4...48).contains(value.unicodeScalars.count),
              !value.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains) else {
            throw SetupError.message("请输入 4–48 个字符，口令内不能换行")
        }
        return value
    }
}

@main
struct Bridge {
    @MainActor
    static func main() async {
        umask(0o077)
        do {
            guard let line = readLine(), line.utf8.count <= 4096,
                  let request = try? JSONDecoder().decode(Input.self, from: Data(line.utf8)) else {
                throw SetupError.message("请求格式不正确")
            }
            let value = try await withLocalOperation(request)
            output(["ok": true, "value": value])
        } catch let failure as IssuerFailure {
            output(["ok": false, "error": failure.message, "disconnected": failure.disconnected])
        } catch let failure as SetupError {
            output(["ok": false, "error": failure.errorDescription ?? "操作未完成"])
        } catch {
            output(["ok": false, "error": "操作未完成，请重试"])
        }
    }

    private static func output(_ value: [String: Any]) {
        guard var data = try? JSONSerialization.data(withJSONObject: value) else { return }
        data.append(10)
        FileHandle.standardOutput.write(data)
    }

    @MainActor
    private static func perform(_ input: Input) async throws -> [String: Any] {
        switch input.action {
        case "version":
            return ["api": 1]
        case "scan":
            let profile = try? savedProfile()
            return status(scan(profile), profile: profile)
        case "activation-status":
            return ["active": try await ActivationClient().verify()]
        case "activate":
            let client = try ActivationClient()
            if try await !client.verify() {
                try await client.activate(code: input.canonicalCode())
            }
            return ["active": true]
        case "install":
            guard NSWorkspace.shared.open(try Assets.installer()) else {
                throw SetupError.message("无法打开官方安装器")
            }
        case "extension-settings":
            guard NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.ExtensionsPreferences?ExtensionItems")!) else {
                throw SetupError.message("请打开系统设置中的「网络扩展」")
            }
        case "privacy-settings":
            guard NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy")!) else {
                throw SetupError.message("请在「隐私与安全性」打开「App 管理」")
            }
        case "open-sfm":
            try openSingBox()
        case "fetch-profile":
            try await fetchProfile()
            let profile = try savedProfile()
            return status(scan(profile), profile: profile)
        case "import":
            let profile = try savedProfile()
            let current = scan(profile)
            guard current.activeVersion != nil, current.extensionProgress == .complete else {
                throw SetupError.message("请完成 sing-box 安装、网络扩展及 VPN 授权")
            }
            try await NSWorkspace.shared.open([profile.file], withApplicationAt: Release.app, configuration: .init())
        case "confirm-import":
            let profile = try savedProfile()
            try PrivateFolder.write(Data(profile.fingerprint.utf8), to: confirmationFile())
            return status(scan(profile), profile: profile)
        case "cutover":
            let profile = try savedProfile()
            let current = scan(profile)
            guard current.activeVersion != nil, current.extensionProgress == .complete, isImported(profile) else {
                throw SetupError.message("请先导入节点并完成 macOS 授权")
            }
            if current.hasLegacy {
                try Assets.withCore { try Network.verifyBeforeCutover(profile, core: $0) }
                try Network.stopOldServices(clash: current.clashService, shadow: current.legacy.contains("小火箭"))
                let oldApps = NSWorkspace.shared.runningApplications.filter {
                    $0.bundleIdentifier.map { Network.oldApps[$0] != nil } == true
                }
                oldApps.forEach { $0.terminate() }
                for _ in 0..<24 where !oldApps.allSatisfy(\.isTerminated) {
                    try await Task.sleep(nanoseconds: 125_000_000)
                }
            }
            return status(scan(profile), profile: profile)
        case "start":
            let profile = try savedProfile()
            let current = scan(profile)
            guard current.activeVersion != nil, !current.hasLegacy,
                  current.extensionProgress == .complete, isImported(profile) else {
                throw SetupError.message("请先确认节点、网络扩展和旧代理状态")
            }
            if !current.vpnReady {
                if !(profile.requiresHelper && current.helperService.needsSetup), current.vpn == "Disconnected" {
                    _ = try? Command.run("/usr/sbin/scutil", ["--nc", "start", "SFM"])
                }
                for _ in 0..<12 {
                    if Network.vpnState() == "Connected" { break }
                    try await Task.sleep(nanoseconds: 250_000_000)
                }
                if Network.vpnState() != "Connected" { try openSingBox() }
            }
            return status(scan(profile), profile: profile)
        case "test":
            let profile = try savedProfile()
            guard isImported(profile), Network.vpnState() == "Connected",
                  let dns = profile.dnsAddress, Network.activeDNS(dns) else {
                throw SetupError.message("请先导入团队节点并确认 VPN 和 DNS 已就绪")
            }
            let report = try Assets.withCore { try Network.tests(profile, core: $0) }
            return ["passed": report.passed, "rows": report.rows.map(row)]
        case "issuer-status":
            try IssuerServer.check()
            return ["ready": true]
        case "issue":
            let code = try input.canonicalCode()
            guard let minutes = input.minutes, (1...43_200).contains(minutes) else {
                throw SetupError.message("有效期需为 1–43,200 分钟")
            }
            let id = try issuerRequestID(code: code)
            let timestamp = try IssuerServer.issue(IssueRequest(code: code, minutes: minutes, request: id))
            return ["expires": timestamp]
        default:
            throw SetupError.message("此版本不支持该操作")
        }
        return [:]
    }

    @MainActor
    private static func withLocalOperation(_ input: Input) async throws -> [String: Any] {
        let readOnly = ["version", "scan", "activation-status", "issuer-status"]
        guard !readOnly.contains(input.action) else { return try await perform(input) }
        let lock = try ActivationClient.privateDirectory().appendingPathComponent("plugin-operation.lock")
        let fd = open(lock.path, O_CREAT | O_RDWR | O_NOFOLLOW | O_CLOEXEC, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw SetupError.message("无法打开本机操作锁") }
        defer { close(fd) }
        guard flock(fd, LOCK_EX | LOCK_NB) == 0 else {
            throw SetupError.message("本机还有一项网络操作正在执行")
        }
        return try await perform(input)
    }

    private static func issuerRequestID(code: String) throws -> String {
        let file = try ActivationClient.privateDirectory().appendingPathComponent("plugin-issuer-request-key")
        let key: Data
        if FileManager.default.fileExists(atPath: file.path) {
            key = try Data(contentsOf: file)
            guard key.count == 32 else { throw SetupError.message("无法读取本机发放记录的校验密钥") }
        } else {
            key = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
            try PrivateFolder.write(key, to: file)
        }
        let message = Data(("opcb-issuer-v1:" + code).utf8)
        let id = HMAC<SHA256>.authenticationCode(for: message, using: SymmetricKey(data: key))
        return id.prefix(16).map { String(format: "%02x", $0) }.joined()
    }

    private static func profileFile() throws -> URL {
        try ActivationClient.privateDirectory().appendingPathComponent("OPCB 节点.bpf")
    }

    private static func confirmationFile() throws -> URL {
        try ActivationClient.privateDirectory().appendingPathComponent("plugin-import-confirmation")
    }

    private static func savedProfile() throws -> NodeProfile {
        let file = try profileFile()
        guard FileManager.default.fileExists(atPath: file.path) else {
            throw SetupError.message("请先获取团队节点")
        }
        return try NodeProfile.load(file)
    }

    private static func isImported(_ profile: NodeProfile) -> Bool {
        let confirmation = try? String(contentsOf: confirmationFile(), encoding: .utf8)
        let previous = UserDefaults(suiteName: "com.paolab.opcb-network-helper")?.string(forKey: "confirmedTeamProfile")
        return (confirmation ?? previous) == profile.fingerprint
    }

    private static func fetchProfile() async throws {
        let bytes = try await ActivationClient().profile()
        let temp = try PrivateFolder()
        defer { temp.remove() }
        let candidate = temp.url.appendingPathComponent("candidate.bpf")
        try PrivateFolder.write(bytes, to: candidate)
        try Assets.withCore { core in _ = try NodeProfile.load(candidate, core: core) }
        try PrivateFolder.write(bytes, to: profileFile())
    }

    @MainActor
    private static func scan(_ profile: NodeProfile?) -> MacStatus {
        let running = Set(NSWorkspace.shared.runningApplications.compactMap(\.bundleIdentifier))
        return Network.scan(appIDs: running, dnsAddress: profile?.dnsAddress)
    }

    private static func row(_ check: CheckRow) -> [String: String] {
        ["title": check.title, "value": check.value, "tone": String(describing: check.kind)]
    }

    private static func status(_ value: MacStatus, profile: NodeProfile?) -> [String: Any] {
        [
            "score": value.healthScore, "rows": (value.rows + [value.extensionState.row, value.helperService.row]).map(row),
            "ports": value.busyPorts.map(row), "vpn": value.vpn, "hasLegacy": value.hasLegacy,
            "legacy": value.legacy, "installed": value.activeVersion != nil,
            "extension": String(describing: value.extensionProgress), "extensionError": value.recentExtensionError,
            "hasProfile": profile != nil, "imported": profile.map(isImported) == true,
            "needsHelper": profile?.requiresHelper == true && value.helperService.needsSetup,
        ]
    }

    @MainActor
    private static func openSingBox() throws {
        guard Network.isOfficialApp(), NSWorkspace.shared.open(Release.app) else {
            throw SetupError.message("无法打开通过签名校验的 sing-box")
        }
    }
}

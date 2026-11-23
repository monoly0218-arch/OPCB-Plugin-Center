import AppKit
import CryptoKit
import Darwin
import Foundation

enum SetupError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        if case let .message(text) = self { return text }
        return nil
    }
}

struct Output {
    let status: Int32
    let data: Data
    let error: String
    var text: String { String(decoding: data, as: UTF8.self) }
}

enum Command {
    static func run(_ executable: String, _ arguments: [String] = [], timeout: Double = 8, input: Data? = nil) throws -> Output {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        let out = Pipe()
        let err = Pipe()
        process.standardOutput = out
        process.standardError = err
        let stdin = input.map { _ in Pipe() }
        process.standardInput = stdin ?? FileHandle.nullDevice
        let stopped = DispatchSemaphore(value: 0)
        process.terminationHandler = { _ in stopped.signal() }

        try process.run()
        let stdout = PipeReader(out)
        let stderr = PipeReader(err)
        if let stdin, let input {
            do { try stdin.fileHandleForWriting.write(contentsOf: input) }
            catch {}
            try? stdin.fileHandleForWriting.close()
        }
        if stopped.wait(timeout: .now() + timeout) == .timedOut {
            if process.isRunning { process.terminate() }
            if stopped.wait(timeout: .now() + 0.5) == .timedOut, process.isRunning {
                kill(process.processIdentifier, SIGKILL)
                _ = stopped.wait(timeout: .now() + 1)
            }
            throw SetupError.message("操作超时")
        }
        return Output(status: process.terminationStatus, data: stdout.read(),
                      error: String(decoding: stderr.read(), as: UTF8.self))
    }

    static func text(_ path: String, _ args: [String] = []) -> String {
        (try? run(path, args).text) ?? ""
    }
}

private final class PipeReader: @unchecked Sendable {
    private var result = Data()
    private let done = DispatchSemaphore(value: 0)

    init(_ pipe: Pipe) {
        DispatchQueue.global(qos: .utility).async {
            let limit = 8_388_609
            while let data = try? pipe.fileHandleForReading.read(upToCount: 65_536), !data.isEmpty {
                let remaining = limit - self.result.count
                if remaining > 0 { self.result.append(data.prefix(remaining)) }
            }
            self.done.signal()
        }
    }

    func read() -> Data {
        done.wait()
        return result
    }
}

struct PrivateFolder {
    let url: URL

    init() throws {
        var template = Array((NSTemporaryDirectory() as NSString).appendingPathComponent("opcb-net.XXXXXXXX").utf8CString)
        guard let path = template.withUnsafeMutableBufferPointer({ buffer in
            mkdtemp(buffer.baseAddress!).map { String(cString: $0) }
        }) else { throw SetupError.message("无法创建私密工作目录") }
        url = URL(fileURLWithPath: path, isDirectory: true)
    }

    func remove() { try? FileManager.default.removeItem(at: url) }

    static func write(_ data: Data, to url: URL) throws {
        try data.write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
}

enum Release {
    static let version = "1.14.4"
    static let app = URL(fileURLWithPath: "/Applications/SFM.app", isDirectory: true)
    static let appID = "io.nekohasekai.sfamt.standalone"
    static let team = "P8XK3KHB48"
    static let extensionID = "io.nekohasekai.sfamt.system"

}

struct NodeProfile {
    let file: URL
    let configuration: Data
    let nodes: [[String: Any]]
    let dnsAddress: String?
    let requiresHelper: Bool

    var fingerprint: String { SHA256.hash(data: configuration).description }

    static func load(_ file: URL, core: URL? = nil) throws -> NodeProfile {
        let byteCount = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard file.pathExtension.lowercased() == "bpf", (3...4_194_304).contains(byteCount) else {
            throw SetupError.message("请选择团队提供的 .bpf 节点文件")
        }
        let raw = try Data(contentsOf: file)
        guard raw.starts(with: [3, 1, 0x1f, 0x8b]) else {
            throw SetupError.message("节点文件格式不正确")
        }
        let temp = try PrivateFolder()
        defer { temp.remove() }
        let compressed = temp.url.appendingPathComponent("profile.gz")
        try PrivateFolder.write(Data(raw.dropFirst(2)), to: compressed)
        let expanded = try Command.run("/usr/bin/gzip", ["-dc", compressed.path], timeout: 6)
        guard expanded.status == 0, expanded.data.count <= 8_388_608 else {
            throw SetupError.message("无法读取节点文件")
        }
        var reader = ProfileReader(Array(expanded.data))
        _ = try reader.field()
        guard try reader.bytes(4).allSatisfy({ $0 == 0 }) else {
            throw SetupError.message("请选择本地节点文件")
        }
        let config = try reader.field()
        guard reader.atEnd,
              let object = try JSONSerialization.jsonObject(with: config) as? [String: Any],
              let outbounds = object["outbounds"] as? [[String: Any]],
              let hy2 = outbounds.first(where: { $0["type"] as? String == "hysteria2" }),
              let vless = outbounds.first(where: { $0["type"] as? String == "vless" }),
              secure(hy2), secure(vless),
              let hyTLS = hy2["tls"] as? [String: Any],
              hasCertificate(hyTLS["certificate"]),
              let vTLS = vless["tls"] as? [String: Any],
              let reality = vTLS["reality"] as? [String: Any],
              reality["enabled"] as? Bool == true,
              vless["flow"] as? String == "xtls-rprx-vision" else {
            throw SetupError.message("节点缺少 Reality 或 HY2 证书校验")
        }
        if let core {
            let configURL = temp.url.appendingPathComponent("config.json")
            try PrivateFolder.write(config, to: configURL)
            guard try Command.run(core.path, ["check", "-c", configURL.path]).status == 0 else {
                throw SetupError.message("sing-box 配置校验失败")
            }
        }
        let inbounds = object["inbounds"] as? [[String: Any]] ?? []
        let tun = inbounds.first { $0["type"] as? String == "tun" }
        let dns = (tun?["dns_address"] as? [String])?.first
        let route = object["route"] as? [String: Any] ?? [:]
        let requiresHelper = route["find_process"] as? Bool == true
            || usesProcessRules(route["rules"])
            || usesProcessRules(route["rule_set"])
        return NodeProfile(file: file, configuration: config, nodes: [hy2, vless],
                           dnsAddress: dns, requiresHelper: requiresHelper)
    }

    private static func usesProcessRules(_ value: Any?) -> Bool {
        let processKeys = ["process_name", "process_name_regex", "process_path", "process_path_regex"]
        return (value as? [[String: Any]] ?? []).contains { rule in
            processKeys.contains { rule[$0] != nil } || usesProcessRules(rule["rules"])
        }
    }

    private static func secure(_ node: [String: Any]) -> Bool {
        guard let tls = node["tls"] as? [String: Any],
              tls["enabled"] as? Bool == true,
              tls["insecure"] as? Bool != true,
              let host = node["server"] as? String, !host.isEmpty,
              let port = node["server_port"] as? Int, (1...65535).contains(port) else { return false }
        return true
    }

    private static func hasCertificate(_ value: Any?) -> Bool {
        let certificates = (value as? [String]) ?? (value as? String).map { [$0] } ?? []
        return certificates.contains { $0.contains("-----BEGIN CERTIFICATE-----") }
    }
}

private struct ProfileReader {
    private let data: [UInt8]
    private var cursor = 0

    init(_ data: [UInt8]) { self.data = data }
    var atEnd: Bool { cursor == data.count }

    mutating func bytes(_ count: Int) throws -> Data {
        guard count >= 0, count <= data.count - cursor else { throw SetupError.message("节点文件不完整") }
        defer { cursor += count }
        return Data(data[cursor..<(cursor + count)])
    }

    mutating func field() throws -> Data {
        var length = 0
        for offset in stride(from: 0, through: 28, by: 7) {
            guard let byte = try bytes(1).first else { break }
            length |= Int(byte & 0x7f) << offset
            if byte & 0x80 == 0 { return try bytes(length) }
        }
        throw SetupError.message("节点文件长度无效")
    }
}

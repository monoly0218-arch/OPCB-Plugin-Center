import CryptoKit
import Foundation
import IOKit

struct ActivationClient {
    private let endpoint: URL
    private let keyFile: URL

    init() throws {
        endpoint = URL(string: "https://staging.paolab.cn/network-activation")!
        keyFile = try Self.privateDirectory().appendingPathComponent("device-key")
    }

    func verify() async throws -> Bool {
        guard let key = try deviceKey(create: false) else { return false }
        return try await request(action: "status", key: key).active == true
    }

    func activate(code: String) async throws {
        guard let key = try deviceKey(create: true) else {
            throw SetupError.message("无法创建本机激活密钥")
        }
        _ = try await request(action: "activate", key: key, code: code)
    }

    func profile() async throws -> Data {
        guard let key = try deviceKey(create: false),
              let profile = try await request(action: "profile", key: key).profile,
              let data = Data(base64Encoded: profile), (3...4_194_304).contains(data.count) else {
            throw SetupError.message("无法获取节点，请重新激活或联系管理员")
        }
        return data
    }

    private func request(action: String, key: SecureEnclave.P256.Signing.PrivateKey, code: String = "") async throws -> Reply {
        let publicKey = key.publicKey.x963Representation.base64EncodedString()
        let hardware = action == "activate" ? try Self.hardwareID() : ""
        let challenge = try await post("challenge", ["action": action, "key": publicKey])
        guard let nonce = challenge.nonce, nonce.count == 43 else {
            throw SetupError.message("激活服务返回了无效响应")
        }

        let message = ["opcb-network-v1", action, nonce, publicKey, hardware, code].joined(separator: "\n")
        let signature = try key.signature(for: Data(message.utf8)).derRepresentation.base64EncodedString()
        return try await post(action, ["nonce": nonce, "signature": signature, "hardware": hardware, "code": code])
    }

    private func post(_ action: String, _ fields: [String: String]) async throws -> Reply {
        var request = URLRequest(url: endpoint.appendingPathComponent("v1").appendingPathComponent(action))
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(fields)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 12
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForResource = 20
        configuration.httpCookieStorage = nil
        configuration.urlCredentialStorage = nil
        let session = URLSession(configuration: configuration, delegate: NoActivationRedirects(), delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        let data: Data
        let response: URLResponse
        do { (data, response) = try await session.data(for: request) }
        catch { throw SetupError.message("无法连接激活服务，请检查网络后重试") }
        guard let http = response as? HTTPURLResponse, data.count < 5_600_000,
              let reply = try? JSONDecoder().decode(Reply.self, from: data) else {
            throw SetupError.message("激活服务暂不可用，请稍后重试")
        }
        guard http.statusCode == 200 else {
            let message: String
            switch reply.error {
            case "invalid_code": message = "口令无效或已过期"
            case "code_used": message = "此口令已在另一台 Mac 使用"
            case "device_exists": message = "这台 Mac 已激活，请联系管理员恢复"
            case "revoked": message = "本机激活已停用，请联系管理员"
            case "not_active": message = "本机还未激活"
            case "profile_missing": message = "节点尚未分配，请联系管理员"
            default: message = "激活请求未完成，请重试"
            }
            throw SetupError.message(message)
        }
        guard reply.ok == true else { throw SetupError.message("激活服务返回了无效响应") }
        return reply
    }

    static func privateDirectory() throws -> URL {
        let directory = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/OPCB 网络助手/团队激活", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                                attributes: [.posixPermissions: 0o700])
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path)
        return directory
    }

    private func deviceKey(create: Bool) throws -> SecureEnclave.P256.Signing.PrivateKey? {
        do {
            if FileManager.default.fileExists(atPath: keyFile.path) {
                return try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: Data(contentsOf: keyFile))
            }
            guard create else { return nil }
            let key = try SecureEnclave.P256.Signing.PrivateKey()
            // Only the Secure Enclave wrapped representation is persisted.
            try PrivateFolder.write(key.dataRepresentation, to: keyFile)
            return key
        } catch {
            throw SetupError.message("无法读取本机安全密钥，请联系管理员")
        }
    }

    private static func hardwareID() throws -> String {
        let service = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("IOPlatformExpertDevice"))
        guard service != IO_OBJECT_NULL else { throw SetupError.message("无法识别这台 Mac") }
        defer { IOObjectRelease(service) }
        guard let value = IORegistryEntryCreateCFProperty(service, "IOPlatformUUID" as CFString,
                                                           kCFAllocatorDefault, 0)?.takeRetainedValue() as? String,
              let uuid = UUID(uuidString: value) else { throw SetupError.message("无法识别这台 Mac") }
        return SHA256.hash(data: Data(("opcb-network-device:" + uuid.uuidString).utf8))
            .map { String(format: "%02x", $0) }.joined()
    }

    private struct Reply: Decodable {
        let ok: Bool?
        let active: Bool?
        let nonce: String?
        let profile: String?
        let error: String?
    }
}

private final class NoActivationRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

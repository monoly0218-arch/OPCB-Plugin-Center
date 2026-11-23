import Foundation

struct IssueRequest: Encodable {
    let code: String
    let minutes: Int
    let request: String
}

struct IssuerFailure: Error {
    let message: String
    var disconnected = false
}

enum IssuerServer {
    struct Reply: Decodable {
        let ready: Bool?
        let expires: TimeInterval?
        let error: String?
        let vlessID: String?
        let hy2Password: String?
        let port: Int?
        let templateHash: String?

        private enum CodingKeys: String, CodingKey {
            case ready, expires, error, port
            case vlessID = "vless_id"
            case hy2Password = "hy2_password"
            case templateHash = "template_hash"
        }
    }

    private static let activation = "runuser -u opcb-network-activation -- /usr/bin/python3 /opt/opcb-network-activation/server.py --db /var/lib/opcb-network-activation/activation.db"
    private static let templateArgument = " --template /opt/opcb-network-activation/team-template.bpf"
    private static let nodeScript = "/opt/opcb-network-node-issuer/node_issuer.py"
    private static let nodeSettings = "/etc/opcb-network-node-issuer/settings.json"

    static func check() throws {
        let activation = try call("opcb-preview-studio", Self.activation + " issuer-status" + templateArgument)
        guard activation.ready == true else {
            throw IssuerFailure(message: "激活服务器发放接口未就绪", disconnected: true)
        }
        let nodes = try nodeCommand("status")
        guard nodes.ready == true else {
            throw IssuerFailure(message: "节点入口暂不可用", disconnected: true)
        }
        guard let hash = activation.templateHash, hash == nodes.templateHash else {
            throw IssuerFailure(message: "节点模板尚未同步", disconnected: true)
        }
    }

    static func issue(_ request: IssueRequest) throws -> TimeInterval {
        let requestData = try JSONEncoder().encode(request)
        let previous = try call("opcb-preview-studio", activation + " issue-check", input: requestData)
        try checkIssuanceError(previous.error)
        if let expires = previous.expires { return expires }
        guard previous.ready == true else {
            throw IssuerFailure(message: "激活服务器未就绪", disconnected: true)
        }
        let nodeRequest = try JSONEncoder().encode(["request": request.request])
        let nodeReply = try nodeCommand("issue-credentials", input: nodeRequest)
        guard let vless = nodeReply.vlessID, let password = nodeReply.hy2Password,
              let port = nodeReply.port, let hash = nodeReply.templateHash else {
            throw IssuerFailure(message: "节点入口暂时无法开通，请重试", disconnected: true)
        }
        let payload = try JSONEncoder().encode(CredentialIssue(
            code: request.code, minutes: request.minutes, request: request.request,
            vless_id: vless, hy2_password: password, port: port, template_hash: hash
        ))
        let reply = try call("opcb-preview-studio", activation + " issue-credentials" + templateArgument, input: payload)
        if reply.error == "duplicate_code" {
            _ = try? nodeCommand("revoke", input: nodeRequest)
        }
        try checkIssuanceError(reply.error)
        guard let expires = reply.expires else {
            throw IssuerFailure(message: "服务器未能保存口令，请重试")
        }
        return expires
    }

    private struct CredentialIssue: Encodable {
        let code: String
        let minutes: Int
        let request: String
        let vless_id: String
        let hy2_password: String
        let port: Int
        let template_hash: String
    }

    private static func checkIssuanceError(_ error: String?) throws {
        switch error {
        case "duplicate_code": throw IssuerFailure(message: "这个口令已存在，请换一个")
        case "issue_expired": throw IssuerFailure(message: "上次请求的口令已过期，请换一个")
        case "invalid_code": throw IssuerFailure(message: "请输入 4–48 个可见字符，可以使用中文")
        case "invalid_minutes": throw IssuerFailure(message: "有效期需为 1–43,200 分钟")
        case "template_mismatch": throw IssuerFailure(message: "节点模板尚未同步", disconnected: true)
        case nil: return
        default: throw IssuerFailure(message: "服务器未能保存口令，请重试")
        }
    }

    private static func nodeCommand(_ command: String, input: Data = Data()) throws -> Reply {
        let check = "if test -r \(nodeScript) && test -r \(nodeSettings); then"
        let run = "exec /usr/bin/python3 \(nodeScript) --settings \(nodeSettings) \(command)"
        let missing = "else printf '%s\\n' '{\"error\":\"node_entry_not_configured\"}'; fi"
        let reply = try call("opcb-network-node-admin", "\(check) \(run); \(missing)", input: input)
        if reply.error == "node_entry_not_configured" {
            throw IssuerFailure(message: "激活服务已连接，独立节点入口尚未上线", disconnected: true)
        }
        return reply
    }

    private static func call(_ host: String, _ command: String, input payload: Data = Data()) throws -> Reply {
        let result: Output
        do {
            result = try Command.run("/usr/bin/ssh", [
                "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
                "-o", "ConnectTimeout=6", "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=2",
                "-o", "ClearAllForwardings=yes", "-o", "ForwardAgent=no",
                host, command
            ], timeout: 25, input: payload)
        } catch {
            throw IssuerFailure(message: "服务器连接超时，请用原口令重试", disconnected: true)
        }
        guard result.status == 0 else {
            let name = host == "opcb-preview-studio" ? "激活服务器" : "节点服务器"
            let message = result.status == 255
                ? "无法建立到\(name)的 SSH 连接"
                : "\(name)已连接，发放命令未执行成功"
            throw IssuerFailure(message: message, disconnected: true)
        }
        guard let reply = try? JSONDecoder().decode(Reply.self, from: result.data) else {
            throw IssuerFailure(message: "服务器返回了无效响应", disconnected: true)
        }
        return reply
    }
}

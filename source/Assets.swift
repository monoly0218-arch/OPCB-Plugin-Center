import CryptoKit
import Foundation

enum Assets {
    private static let release = "https://github.com/SagerNet/sing-box/releases/download/v1.14.4/"

    static func installer() throws -> URL {
        let file = try download("SFM-1.14.4-Apple.pkg",
            digest: "6eb140750dfdc386ebb5da3957e8d8024fee8f2316318b7b7b79e015a088274c")
        let signer = try Command.run("/usr/sbin/pkgutil", ["--check-signature", file.path], timeout: 20)
        guard signer.status == 0, signer.text.contains("Developer ID Installer: Metamerism LLC (P8XK3KHB48)") else {
            throw SetupError.message("sing-box 安装包签名不符")
        }
        return file
    }

    static func withCore<T>(_ use: (URL) throws -> T) throws -> T {
        let name = "sing-box-1.14.4-darwin-arm64"
        let archive = try download(name + ".tar.gz",
            digest: "0d8c7f5ed5d587b0f1a5e9772a708ec3bfa4ac4c9329604b01d8d9c2ba406838")
        let work = try PrivateFolder()
        defer { work.remove() }
        let result = try Command.run("/usr/bin/tar", ["-xzf", archive.path, "-C", work.url.path, name + "/sing-box"], timeout: 15)
        let executable = work.url.appendingPathComponent(name + "/sing-box")
        guard result.status == 0, FileManager.default.isExecutableFile(atPath: executable.path) else {
            throw SetupError.message("无法读取 sing-box 检测内核")
        }
        return try use(executable)
    }

    private static func download(_ filename: String, digest: String) throws -> URL {
        let cache = try ActivationClient.privateDirectory().appendingPathComponent("plugin-assets", isDirectory: true)
        let fm = FileManager.default
        try fm.createDirectory(at: cache, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let destination = cache.appendingPathComponent(filename)
        if try matches(destination, digest: digest) { return destination }
        let temporary = try PrivateFolder()
        defer { temporary.remove() }
        let file = temporary.url.appendingPathComponent(filename)
        let result = try Command.run("/usr/bin/curl", [
            "-q", "--fail", "--silent", "--show-error", "--location", "--proto", "=https", "--proto-redir", "=https",
            "--connect-timeout", "10", "--max-time", "120", "--max-filesize", "60000000",
            "--output", file.path, release + filename,
        ], timeout: 125)
        guard result.status == 0 else { throw SetupError.message("官方 sing-box 文件下载失败，请联网后重试") }
        guard try matches(file, digest: digest) else { throw SetupError.message("官方 sing-box 文件校验失败") }
        try PrivateFolder.write(Data(contentsOf: file, options: .mappedIfSafe), to: destination)
        return destination
    }

    private static func matches(_ file: URL, digest: String) throws -> Bool {
        guard let size = try? file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey]),
              size.isRegularFile == true, let bytes = size.fileSize, (1...60_000_000).contains(bytes) else { return false }
        let hash = SHA256.hash(data: try Data(contentsOf: file, options: .mappedIfSafe))
        return hash.map { String(format: "%02x", $0) }.joined() == digest
    }
}

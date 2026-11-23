import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const source = dirname(fileURLToPath(import.meta.url));
const plugin = dirname(source);
const work = await mkdtemp(join(tmpdir(), "opcb-buzz-bridge-"));
try {
  const bridge = join(work, "bridge");
  const swift = ["Bridge", "Activation", "Assets", "Issuer", "Network", "Support"];
  execFileSync("/usr/bin/swiftc", [
    "-swift-version", "5", "-O", "-target", "arm64-apple-macos13.0", "-parse-as-library",
    ...swift.map(name => join(source, name + ".swift")), "-o", bridge,
  ], { stdio: "inherit" });
  execFileSync("/usr/bin/codesign", ["--verify", "--strict", bridge], { stdio: "inherit" });

  const bytes = await readFile(bridge);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const script = (await readFile(join(source, "bootstrap.zsh"), "utf8")).trim()
    .replace("__BRIDGE_SHA256__", digest);
  if (Buffer.byteLength(script) > 1024) throw Error("Buzz process argument exceeds 1024 bytes");
  const manifest = {
    id: "opcb.network-helper",
    name: "OPCB 网络助手",
    apiVersion: 1,
    description: "在 Buzz 内激活、安装向导、切换、验证连接与发放团队口令。",
    host: {
      commands: [
        { id: "mac-version", program: "env", args: ["/usr/sbin/sysctl", "-n", "hw.optional.arm64", "kern.osproductversion"] },
      ],
      processes: [
        { id: "network-bridge", program: "env", args: ["/bin/zsh", "-f", "-c", script] },
      ],
    },
  };
  await writeFile(join(plugin, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const icon = await readFile(join(plugin, "icon.png"));
  await build({
    entryPoints: [join(source, "page.mjs")], outfile: join(plugin, "plugin.js"),
    bundle: true, format: "esm", platform: "browser", target: "es2022", charset: "utf8",
    define: {
      NETWORK_HELPER_NATIVE: JSON.stringify(gzipSync(bytes, { level: 9 }).toString("base64")),
      NETWORK_HELPER_ICON: JSON.stringify("data:image/png;base64," + icon.toString("base64")),
    },
  });
  console.log("Network helper bridge SHA-256 " + digest);
} finally {
  await rm(work, { recursive: true, force: true });
}

# OPCB 智能体口令服务

Node.js 22 或更新版本。使用仓库锁定依赖构建可部署文件。

```sh
npm ci
node --test tests/agent-activation.test.mjs
./node_modules/.bin/esbuild services/agent-activation/run.mjs \
  --bundle --platform=node --format=esm --target=node22 \
  --minify --outfile=/tmp/opcb-agent-activation.mjs
```

将 bundle、Node 运行时和 systemd 单元装入各自路径。以权限为 `0600` 的 `/etc/opcb-agent-activation/service.env` 设置 `OPCB_ACTIVATION_URL`、`OPCB_ACTIVATION_OWNER` 和 `OPCB_ACTIVATION_KEY`。前两项为部署的 HTTPS 基址和唯一管理员的 OPCB 十六进制公钥。密钥用 `openssl rand -hex 32` 在服务器生成。保留密钥与 SQLite 的一致备份。

用 HTTPS 反向代理原样转发激活基址下的请求到 `127.0.0.1:4861`。`GET /healthz` 可探测服务。管理和兑换要求 NIP-98 POST 签名，管理还须匹配服务器配置的个人公钥。口令和上游密钥不写进访问日志。运行数据由 systemd 单独管理。

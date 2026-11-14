# 历史共享密码协议（兼容期）

2.0 身份版不采用此登录方式；本文只记录旧客户端兼容边界。服务是否已退役以实际切换回执为准。

# 知识工作台：共享密码访问

本入口通过服务端共享密码开放当前配置的全部知识源，只提供目录、状态、搜索和正文读取。任何人或 Agent 持密码均可连接，无需登记成员或签发邀请码。密码不是身份凭证；64位十六进制 `viewer` 仅用于分隔会话，不代表验签后的本人或 Agent 归属。原3035签名API、采集器、索引和业务名单保持独立。

## 服务器配置

`web_gateway.py --password-file /var/lib/opcb-knowledge-web/access.json` 启用共享模式。私有文件仅保存 `PasswordAccess.encode(password)` 产生的随机salt和scrypt摘要，必须是服务用户所有的普通文件、0600权限。密码长度1–256字符，不进入Git、插件、URL或日志。管理员在服务器终端以隐藏输入读取密码后生成文件；切勿把明文作为shell命令行参数或构建变量。

共享模式默认使用 `/var/lib/opcb-knowledge-web/shared-sessions.sqlite3`，与旧邀请码会话库分开。部署不得通过 `--sessions` 指向旧库，旧token不能继承新范围。轮换密码后已有会话仍有效至注销/撤销或12小时到期；需要立即失效时停服务并将共享会话库移到私有备份，再重启。原数据库不自动删除。

不传 `--password-file` 可回滚到原成员名单和个人邀请码模式；生产systemd单元显式传该参数，缺失或格式/权限错误的密码配置会使启动失败，不降级为匿名访问。共享模式禁止 `--issue`；`--revoke <viewer>` 仅撤销该分区已有会话，持密码者仍可重新登录。

## 网页与原生插件

网页地址为 `https://shangliangshan.paolab.cn/opcb-plugins/knowledge/`，输入共享密码后使用原 HttpOnly/Secure/SameSite=Strict cookie。未指定viewer的网页使用公共分区。原生Buzz插件复用宿主表单、输入、按钮和工作区；`/api/desktop/login|query|logout` 接受 `Origin: tauri://localhost`、`X-OPCB-Desktop: 1`，返回页面内存中的Bearer会话。换账号、社区、连接代次、切页/卸载均清空资料并尽力注销，离线时以服务端期限为准。密码不内置到插件，插件安装或更新必须经过Buzz审核卡。

登录body统一为 `{"viewer":"<64位hex>","password":"<由使用者输入>"}`；旧 `code` 字段不再接受。请求/响应上限、并发与频率限制沿用原服务，查询只允许catalog/status/search/get，索引连接使用SQLite `mode=ro`。

## Agent认证

Agent使用同一共享密码登录专用客户端入口，不复用人的页面cookie，也不需要人的签名或私钥。它自行选用自身64位公钥作为viewer即可，服务不校验owner归属。

所有客户端POST请求带：

- `Origin: https://shangliangshan.paolab.cn`
- `X-OPCB-Client: 1`
- `Content-Type: application/json`

1. POST `/opcb-plugins/knowledge/api/client/login`，body为上述viewer/password，得到 `{owner,token}`，最长12小时。
2. POST `/opcb-plugins/knowledge/api/client/query`，附 `Authorization: Bearer <token>`，body为 `{"viewer":"<同一viewer>","request":{"op":"catalog"}}`。搜索使用 `{"op":"search","source":"recordings","query":"关键词","limit":5}`；正文使用 `{"op":"get","source":"recordings","id":"<搜索返回原ID>"}`。
3. POST `/opcb-plugins/knowledge/api/client/logout`，附同一Bearer，body为 `{"viewer":"<同一viewer>"}`。注销后token拒绝，401需重新输入密码。

密码和token只保留在受控运行内存中，不贴到聊天或写入共享日志。Origin和自定义头仅为传输约束，密码及有效会话才是访问证明。

## 部署与验证

服务复用 `opcb-knowledge` 系统用户、loopback3036和已有Caddy `handle_path /opcb-plugins/knowledge/*`。`PYTHONPATH=/opt/opcb-knowledge` 继续导入线上原 knowledge/team_api/source_adapters，不能用客户端分支中的旧采集代码覆盖生产。新版本只部署gateway/session/web/service，原索引保持只读，仅认证目录可写。

以当前完整提交的已有GitHub Actions信号灯路线运行仓库要求的完整CI，检查知识Node/Python回归及revision/SHA256产物；Studio不承担CI。不把排队、局部通过或服务器smoke当完整CI。通过后保存旧release、unit和会话库，原子切换web-current，单独重启知识库网页服务；原3035、采集timer和其他网站不改。

上线核正确/错误密码、未登记人及Agent目录/搜索/正文、旧邀请码token拒绝、注销和过期拒绝、非法写操作拒绝、原索引不变。代码、服务部署、插件审核安装和真实宿主人工验收分别记录。回滚切回旧release/unit，重启网页服务；不删除业务资料或索引。

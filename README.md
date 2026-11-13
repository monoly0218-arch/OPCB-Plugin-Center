# higgsfiled号池1.4

本版在 1.3 的账号、收码、领取恢复基础上，补充四个 Buzz Agent 工具。显示名称、页面标题及左侧插件中心卡片统一为 **higgsfiled号池1.4**；插件 ID 仍为 `opcb.higgsfield-mailbox`。

## 在其他对话使用

在同一台 Mac 上运行的 Buzz Agent 对话中发送：

> 使用 higgsfiled号池1.4 查询 HF-020。搜索并调用 higgsfield_account_get，核对账号和辅助邮箱，不把密码发到聊天里。

本轮开始时已固定的工具清单可能仍是旧版；在该对话发送一条新消息，让下一轮加载插件工具。无需手动打开账号页面。远程 Agent、云电脑或其他人的设备不会因本机安装自动获得这些工具；各设备仍需安装启用插件，且 Agent 须能读取原社区的授权账号笔记。

| 工具 | 功能 |
| --- | --- |
| `higgsfield_account_get` | 按 `account_id` 读取账号、辅助邮箱及收码入口。密码默认隐藏，仅任务确需时显式 `include_password:true` |
| `higgsfield_pool_status` | 只读检查 Moo 本机分配器是否开放、数量及指定账号占用，不领取 |
| `higgsfield_mailbox_begin` | 读取现有邮件建立十分钟基线，返回 `window_id`，不发送验证码 |
| `higgsfield_mailbox_query` | 用原 `account_id` 与 `window_id` 读取本次匹配的新验证码 |

收码顺序：begin → 在正确账号的登录页请求一次新验证码 → query。窗口绑定发起 Agent、owner、社区、频道及线程；不能跨对话复用。插件重载会清空窗口，重新 begin 后再请求新码。

## 权限与范围

工具通过调用 Agent 的签名 `client.query` 读固定原作者的最新账号记录，不使用桌面查看者的社区会话。每次查码重新核对来源和权限；来源变化、过期窗口及其他对话的窗口均拒绝。工具结果供当前授权任务使用，不自动发布邮件正文、密码或验证码。

号池状态工具仅限 Moo 本机的 Agent，且须读到当前社区原号池记录。它调用既有分配器的 status，不修改库存。领取仍使用原来的页面或 `higgsfield-self-service`；本版没有另建库存或跨设备锁。

旧专属邮箱缺可靠邮件时间，按码值保守去重，同值重发会排除；本版没有重新触发真实验证码。临时邮箱仍使用保留 @ 分隔符的请求路径与原新邮件过滤。

## 安装与验证

本机已从原批准的目录重载，manifest.host 未增加权限，运行状态 active，四个 Agent 工具已注册。插件中心卡片也已更新到 1.4。注册成功不等于已完成真实工具调用；本轮固定工具清单尚未刷新，HF-020 的原生调用待下一轮核对。

JS 完整检查包含 27 项单元测试和一个实际 React 浏览器流程；Python 7 项隔离库存测试。新增测试覆盖默认隐藏密码、显式密码选项、原作者检查、分页、身份缺失、状态只读、基线去旧码、跨 Agent/对话窗口拒绝、来源变更、过期和卸载清理。

本包不含真实凭据、邮件、收码窗口、领取日志或库存数据库。旧 1.3 及 V3 交付物保留。

本机继续安装路径：`/Users/moo/.buzz/REPOS/HIGGSFIELD_MAILBOX_PLUGIN/源文件/higgsfield-mailbox`。包内桥接脚本和 manifest 仍指向 Moo 的本机路径；其他电脑的领取功能需要另行配置分配器，不是解压即可跨设备领取。

授权来源：buzz://message?channel=1f171b32-064b-43ea-8f86-3a00829721cb&id=2dcfdc769e0ea0399d3c8d2226c3e319b98d98ea822682cab081645d10dfa581

版本命名来源：buzz://message?channel=1f171b32-064b-43ea-8f86-3a00829721cb&id=0d187c6105d121541b8e4759b868d38f1834729186e62d74109a68e6a4c7b58b

## GitHub 下载说明

此目录保存 1.4 原始插件源码。manifest 中的桥接命令及 pool_bridge.py 的后端路径依赖 Moo 本机环境；其他设备须先配置授权号池后端并修改路径，再在 Buzz 中安装插件。下载包不含账号凭据或运行数据库。

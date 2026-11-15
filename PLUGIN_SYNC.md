# 一句话对齐整套 OPCB 插件

触发语：**帮我全面更新插件中心上的所有插件到我的本机。**

含义：读取本仓库当前 `BASELINE.json`，将目标设备的 OPCB 插件代码版本、固定安装来源和启用状态对齐到这一套；不是安装历史目录的所有版本。初次使用的 Agent 不知道“插件中心”指哪个仓库时，可把 `https://github.com/monoly0218-arch/OPCB-Plugin-Center` 附在请求后。已经知道仓库后无需重复地址。

当前基线 `studio-2026-11-15-r1`：潘涛 Studio 实际已安装的 17 项，包含插件中心 0.3.3、HTML 阅读器 rc.3、Mobile Design rc.9、任务中心 rc.17、公司看板 rc.14。号池固定 Studio 正在使用的 **1.3** 线路；同 ID 的 1.4 保留独立分发，不混入本套。

## Agent 执行契约

1. 从官方插件中心的 `distribution/3dicons-catalog-20261115` 解析完整 HEAD；本次全程使用这个固定提交的 `BASELINE.json`、`REGISTRY.json` 和工具，不能中途混用移动中的目录。读取目标设备的原生 `plugin_list`，核对平台、Buzz 版本与 API。当前整套仅验证 macOS / Buzz 1.0.2 / API 1；不自动安装、升级或重启宿主。
2. 将 `plugin_list` 返回的 `{ "plugins": [...] }` 暂存为本机 JSON，运行下方工具。工具纯读取、不联网、不安装；它输出每项的 `aligned/install/update/enable/blocked`、固定请求参数和保留项。已对齐的跳过；缺少项安装；本仓库同源旧版更新；已停用项通过审核启用。目标以基线提交和 revision 为准，不能用版本号大小替代，也不能把“同 ID 已装”当作一致。
3. 对每个可执行项使用**当前设备** Buzz 原生 `plugin_request`，原样传 `request`。同源 `update` 读取原安装仓库，不传新仓库冒充换源；`install` 固定 repository/reference/commit/path。审核卡由同事本人最终确认。逐项处理，不在等待审核时循环轮询，不批量生成重复卡；取消、拒绝或失效保持未完成，下次继续时重读本机状态。
4. 批准后重新读取 `plugin_list` 并重新运行比对；更新没有自动启用时再发 `enable` 审核。最后用 `plugin_status` 核对全部目标为 active 且无加载错误。只有 17 项的来源、revision、启用状态均一致并且加载通过，才报告“整套插件已对齐”；未批准、缺项、换源阻塞、加载失败须列出，不能用“审核卡已发”代替完成。
5. 版本对齐后按对应 README 处理各人的业务登录、知识源授权、连接器依赖和配对。插件代码一致不代表账号、数据或业务服务可用；不复制潘涛的配置、密钥、Cookie、聊天、收藏或私人素材。基线以外的插件保留，Buzz 自带插件不重复分发，不自动删除同事已有的其他插件。

```sh
node scripts/plan_plugin_sync.mjs \
  --installed /本机临时目录/plugin_list.json \
  --platform macos \
  --host-version 1.0.2
```

比对工具需要 Node.js 18+，无需安装 npm 依赖。若设备没有 Node.js，Agent 仍可直接按 BASELINE 的 ID、revision、来源与启用字段比对，不能未经授权安装额外软件。也可用 `--installed -` 从标准输入读取 JSON。`--baseline` 可指定已固定版本的基线文件。请在实际核对设备版本后填写 `--host-version`，不要照抄示例。缺少平台或不属于 macOS 时整套计划会阻塞；版本不同会提示核对兼容性。该命令成功仅代表比对执行成功；是否对齐读取输出的 `versionsAligned`，运行状态和业务权限必须另外验证。

## 旧来源与个人状态

不同仓库、文件夹或不同子目录的旧插件输出 `blocked`。Buzz 1.0.2 的更新工具不能直接换源；参阅 [SOURCE_MIGRATION.md](SOURCE_MIGRATION.md)。先记录旧源码、固定提交、revision、启用状态及恢复方式，再逐项由本人审核换源；涉及移除须单独确认。不能为了整套同步先批量卸载，不能修改宿主注册表或复制安装目录绕过审核。

## 下载与维护

`releases/OPCB_STUDIO_BASELINE_20261115_R1.zip` 只含本套 17 项及基线/工具/说明，文件与固定分发提交逐字节核对。下载本身不安装；安装继续使用每项 `reviewSource` 的原生审核卡。合集中的版本目录按 `BASELINE.json` 选择，不能用扫描结果猜入口。

后续整套更新从原生 `plugin_list` 重新采集，经固定来源与包哈希验证后发布新 baseline ID；保留旧版基线、目录和包，更新实际运行的正式发布目录，刷新仓库首页入口。单项发布可继续进入 REGISTRY，但不得自动冒充“潘涛已经安装的整套”。历史 `CATALOG.json` 与 `OPCB_STUDIO_PLUGINS_20261113.zip` 仅作旧快照，不参与全面更新。

## 本次验证边界

官方最新发布与 Studio 实际版本均为 Buzz 1.0.2。基线记录原生清单的实际 revision；17 项公开目录的所有文件与对应安装来源的完整 Git 提交一致。比对工具验证空设备、混合旧版本、重复号池、停用、错来源、错误输入、取消后重算及重复运行场景。其他同事设备、Android/iOS 和各人的业务登录未由本机测试代为验收。

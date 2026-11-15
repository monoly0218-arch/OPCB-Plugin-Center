# OPCB 插件中心 0.3.0 · 聊天安装卡

在已确认的插件中心 0.2.4 上增加原生聊天安装卡，保留目录、品牌图标、贡献者头像与认证媒体修复。卡片沿用黑白圆角、Nunito 与中文圆体，默认只显示图标、名称、目标版本、详情和安装操作；所有卡片正文至少20px。

## 使用

安装并启用本插件后，Agent 可调用 `opcb_plugin_install_card`，指定中心目录中的插件 ID 和可选版本，返回可直接发送的完整卡片文字。发到聊天后，本机渲染为交互卡片；未安装本插件的读者仍看到插件名、版本、固定源码链接和结构化版本信息。

点击「审阅安装」进入 Buzz 原生审核。已存在同 ID 时显示「查看更新」，不据此声称版本一致或业务可用。取消、失败、缺少能力、过期版本均明确显示。卡片必须与当前可信目录的 ID、版本和提交同时一致；目录刷新失败或版本来源变化时禁止安装。打开卡片、读取详情或 Agent 工具本身不会安装插件。

卡片语法为 `OPCB 插件安装卡` 开头，末尾 `opcb-plugin-install` JSON 代码块：`{"version":1,"id":"opcb.html-reader","release":"0.1.0-rc.2","commit":"完整40位提交"}`。名称、图标、摘要和真实安装来源均从中心目录读取，不信任消息自填的任意仓库、URL或命令。宿主仍管理作者、时间、附件、编辑与消息权限。

## API、权限与分发

ID 保持 `opcb.plugin-center`；页面仍为 `catalog`。声明服务增加 conversation 与 agents，host 权限仍仅 `https://api.github.com`，不增加文件、进程、MCP、私钥或私有聊天权限。复用当前目录和原生 `pluginInstaller`，不创建第二份业务数据。

本轮核对官方最新发布及本机实际版本，并对照本机 preview.268.1 的公开 MessageRenderer / PluginInstaller 契约；实际设备安装与最终验证见交付报告。普通插件验证不重建宿主，桌面结果不代表手机端插件渲染通过。

构建：`node scripts/build_plugin_center.mjs`。打包：`python3 scripts/package_release.py`。完整检查：`npm run ci`。历史版本与分发分支保留。

字体、图标与 Unslop 署名继承 0.2.4，OFL / MIT 与 CC BY 4.0 来源说明随包保留。

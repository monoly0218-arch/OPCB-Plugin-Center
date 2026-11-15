# 原生插件安装卡 0.3.0

潘涛已确认黑白圆角、粗圆体和原版图标设计，并于本线程授权接入执行。卡片接入插件中心本体，不复制第二份插件目录。基于 PR #10 头像修复头 `0f01074db4b687fa777b2d51307227726e5bc3e3` 追加，保留其目录与身份逻辑；本特性独立分支与PR，不直接修改或合并他人的PR。

## 实现

- `conversation.registerMessage` 仅匹配指定版本的 `opcb-plugin-install` 安装卡；原生 pluginRequest 消息继续由宿主渲染。
- 卡片文本绑定插件ID、目录版本及40位提交，渲染和点击时重新核对可信目录。名称、图标、来源和条件都取自同一目录。缺失、变更和目录错误时禁止安装。
- 点击操作复用当前 `createDirectoryStore.review` 和可选 `pluginInstaller.requestInstall`，安装、更新、取消、失败分别处理。不据同ID存在宣称版本一致。
- `opcb_plugin_install_card` 工具只生成可发送文本，不发送消息、不安装插件。未启用渲染插件的设备保留文字和固定来源链接。
- 字体与图标本地内嵌，卡片首屏无说明小字；正文20px、标题24/30px，窄屏换行。详情按需展开，取消和失败在卡片内保留20px可读反馈。
- 保持ID、页面与既有 api.github.com 权限；不增加文件、进程、私钥或业务权限。聊天渲染和Agent工具使用官方公开服务。

## 版本与验证

官方最新可见发布为 v1.0.3-preview.2；本机实际版本为 preview.268.1。按本机固定tag的公开 MessageRenderer、ChannelMessage.content 与 PluginInstaller 契约核对，不将官方最新版直接当成本机版本。本轮没有更新或构建宿主。

全仓本机检查首次通过：84项Node测试、69项Python服务测试、构建一致性和完整分发校验。实际发布提交绑定后会再核对最终目录、ZIP与完整检查；远端CI与原生安装分别报告。

生产React组件的EgoLite合成宿主验证：首屏/详情不触发安装；取消不报成功；缺失能力显示失败；成功返回后订阅回读使按钮切换为查看更新；卡片提交变化时移除安装动作；卸载后订阅为0。深浅主题与390px布局无外层横溢。这些合成结果不替代原生宿主审核或设备安装验收。

## 固定分发

分支 `distribution/plugin-center-cards-0.3.0`，根路径 `.`，提交 `e2aedb29a7c21f2143f87ae3a38094aedb96faf8`；生成自源提交 `ea1486e874df4e2ce2264db9cf34b0a4b873c9f6` 的 `plugins/opcb.plugin-center/0.3.0`。REGISTRY、CATALOG和CANDIDATES绑定同一源，历史版本保留。

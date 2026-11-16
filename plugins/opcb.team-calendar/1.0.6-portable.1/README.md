# 团队日历 1.0.6 · 可移植分发

保留 Studio 已安装 1.0.6 的页面和工具代码；仅将 manifest 中固定电脑路径改为内嵌原客户端。该分发 manifest 与本机安装 revision 不同，不替换本机插件。

需要 Node.js 22.13+ 和本机日历服务。首次部署从插件中心下载完整包，进入 integrations/opcb.team-calendar/1.0.6，运行：

```sh
CALENDAR_DATA_DIR="$HOME/.config/opcb-team-calendar" node server/main.mjs --workspace
```

客户端默认读取 ~/.config/opcb-team-calendar/client.json；也可通过启动 Buzz 时的 CALENDAR_CONFIG 环境变量指定已有连接文件。已有工作区继续使用原数据库和个人连接，不能以新空库覆盖。连接凭据只留本机，不提交到仓库。服务配置个人用户绑定后，回到插件中心发起原生安装审核卡，由本人确认。下载和启动服务不等于安装或授权。

原工作区只允许配置中的本人身份与会话；本包不扩大权限、不复制成员凭据或任务。未绑定时读取失败属明确未配置，不会改用他人身份。共享部署、真实任务中心接入、腾讯会议创建、关页后台提醒仍未实现。macOS/Buzz 1.0.2/API1；其他平台未验证。

完整源码、原说明、构建锁文件和测试在配套 integrations 目录。历史验收只作来源记录；当前验证范围见 docs/STUDIO_PUBLISH_20261116.md。

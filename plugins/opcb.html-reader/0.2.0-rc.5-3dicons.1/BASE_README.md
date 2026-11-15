# HTML 阅读器 0.2.0-rc.5

聊天中的 HTML 附件使用低饱和墨蓝色胶囊（#244863）：偏白主文字（#f3f7fc）、灰蓝次文字和蓝色悬停/焦点。仅在 HTML 插件附件渲染范围重绑定原生颜色 tokens，保留原生 FileCard 的预览、下载、下载中/成功/重试、文件大小与无障碍语义；不覆盖其他类型文件或聊天气泡。浅色/深色主题中都可辨识。

保留上一版修复：修复聊天活动或会话列表更新触发的自动刷新/阅读回顶。保留统一工作区、四种快照比例、正文铺满、收藏与Agent按会话选择。

- 会话列表按文档实际依赖更新；无关消息、回复和表情不会重启预览或重新下载正文。
- 来源编辑、删除才重验；重验结果内容相同时保留原iframe，避免丢失滚动、输入和页面内部状态。
- 收藏、标题与目录变化不重建正在阅读的正文。重复目录、相同内容事件和预览事件流重连不会重复导航。
- 在本次阅读器进程内，返回工作区再打开同一文档可恢复根页面滚动位置；持续阅读时保留所有内部容器滚动。关闭阅读器/撤权/进程退出后不保留正文或阅读位置，不承诺跨设备同步。
- 来源不可读、已编辑或已删除时仍清空预览并报错；没有为了保滚动关闭权限核验。会话/线程绑定、expected_revision冲突保护不变。

官方与Studio实际基线Buzz1.0.2/API1、macOS＋Python3。原host权限不变；自包含HTML单份50MiB、进程合计160MiB；不加载外部资源。HTML正文仅进程内存。Android/iOS与原生分栏人工验收单独核实。

源码src/html-reader，构建node scripts/build_html_reader_session.mjs，统一身份构建npm run build:identity，完整检查npm run ci，打包python3 scripts/package_release.py。固定提交通过Buzz原生更新审核卡交付，保留本人最终安装审核。

设计方法参考Damir Sokolovsky [Unslop](https://github.com/heydamir/unslop)，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，经本地界面与信息可视化Skill适配。保留字体和图标原许可；实际分发继续使用3dicons V1身份图。

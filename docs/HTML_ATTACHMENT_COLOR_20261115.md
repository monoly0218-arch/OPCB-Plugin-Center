# HTML 聊天附件浅蓝胶囊

本人请求：d6f0ce9c185b99c30dc45e3821872ed100689a73aa15fc631e952b472ae503dc。

在HTML插件的Attachment渲染范围增加display:contents容器，只重绑定原生颜色tokens。底色#e2f2ff，主文字#183e5b，次文字#486a83，边框#aacfe9；hover/pressed/focus使用相同蓝色体系。仍完整复用宿主FileCard与原props，不重写下载、请求额外权限、改变附件链接或覆盖其他格式。

已装基线392ac847234e8b902895ccee857b3ee5f754ba2b、0.2.0-rc.3-3dicons.1。官方和设备均Buzz1.0.2/API1，保留阅读位置修复与当前3dicons原图。

EGO本地组件验证直接使用官方v1.0.2 FileAttachment.tsx、原设计系统与Messages CSS，以及候选实际附件renderer；合成HTML/PDF作对照。浅/深色中HTML实测rgb(226,242,255)，普通文件分别保持浅灰/深黑；360px无横向溢出，卡片和下载按钮完整。点预览产生正确opcb-html目标；下载得到原HTML文件且不误触预览。真实Buzz原生下载状态继续由宿主管理，组件浏览器验证不冒称安装后的人工验收。保留当前插件权限、配置、个人历史和收藏。

源码构建与统一身份构建、npm run ci、package_release.py沿用当前流程；正式分发与插件中心读取的目录分支同步，最终安装仍经本人审核卡确认。

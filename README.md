# OPCB 插件中心 0.2.2 候选

按 OPCB v3 共享界面重做插件目录。默认页只展示用途图标、插件名、目录版本、安装状态和操作；不显示说明小字。详情页以18px正文保留用途与实际依赖。中文标题沿用OPCB圆体，数字沿用Nunito；支持宿主深浅主题、窄窗口分类导航和键盘返回。

图标优先级为原生品牌/IP、已选Fluent立体图标、未知插件拼图回退。Muse使用官网IP玩偶，Grok Bot使用应用自带圆形双眼图标，Higgsfield使用官网Logo；其余通用插件沿用本人认可的Fluent立体图标。插件中心的包内icon.png、宿主导航icon和目录使用相同拼图。所有资源与字体本地内嵌，不从CDN加载。

品牌来源与摘要见 `src/plugin-center/assets/BRAND_ICONS.json`，使用说明见包内 `BRAND_ASSETS_NOTICE.md`；Fluent来源见 `MANIFEST.json`。目录支持可选 `icon` 内嵌图片，不接受远程图标URL。此次不更新Muse、Grok、号池等业务插件本体。

成果报告推荐项同步到已分发的 `2026-11-14-commercial`，名称为「OPCB 平台商业化计划与报告」，审核来源固定到已有提交 `bbc10c81776e438404f505950c89a4227eb14cef`；保留旧名称和历史包，不重写业务代码。

## 版本与状态

- 卡片显示 **目录目标版本**，不是当前设备已安装版本；日期快照显示为`2026.11.13`，不虚构成2.0升级。`rc`及历史版本标识保留。
- 「已安装」仅表示同ID存在，不代表版本、启用或业务权限已核验。Buzz 1.0.2的公开安装状态接口不返回本机语义版本；点击「查看更新」进入原生审核核对。
- 插件中心自身版本为0.2.2，在侧栏显示；基础目录仍固定到同一main提交的REGISTRY。商业化报告已独立分发并在本机安装，目录若仍指向已知旧快照，则使用其固定发布提交补齐新名称与安装目标，不覆盖未来目录版本。报告源码和下载也直接指向该发布提交。

## 权限与审核

保持ID `opcb.plugin-center`、页面ID `catalog`，只申请现有 `https://api.github.com` 网络权限。安装仍由可选 `pluginInstaller` 发起宿主原生审核，固定分发来源与提交；取消或失败不显示为安装成功。不轮询、不批量静默安装，不读取账号配置、凭据或个人数据。

缺失宿主安装接口时保留源码和下载入口，给出实际错误；刷新失败保留旧目录并禁用安装。搜索、分类、安装状态筛选、历史版本及详情仍可使用。插件停用释放目录与安装状态订阅。

## 验证

参考官方Buzz v1.0.2，本机Buzz 1.0.2，apiVersion 1。构建 `node scripts/build_plugin_center.mjs`；完整仓库检查 `npm run ci`；打包 `python3 scripts/package_release.py`。EGO中的React预览使用真实目录及合成安装状态，不能代替原生宿主、Android或iOS验收。最终安装保留本人原生审核。

界面方法参考 Damir Sokolovsky / Unslop，CC BY 4.0：https://github.com/heydamir/unslop 。现有共享OPCB v3规范优先；实现：潘涛 Studio。Fluent Emoji MIT、Nunito和Resource Han Rounded OFL授权随包保留。

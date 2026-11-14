# OPCB 插件中心 0.2.0 候选

按 OPCB v3 共享界面重做插件目录。默认页只展示用途图标、插件名、目录版本、安装状态和操作；不显示说明小字。详情页以18px正文保留用途与实际依赖。中文标题沿用OPCB圆体，数字沿用Nunito；支持宿主深浅主题、窄窗口分类导航和键盘返回。

每个已收录插件有独立的 Microsoft Fluent 3D 图标，构建时内嵌16张透明PNG与字体，不从图标或字体CDN加载。图标来源与SHA256在 `src/plugin-center/assets/MANIFEST.json`，研究记录在 `docs/PLUGIN_CENTER_REDESIGN_20261114.md`。未知后续插件使用拼图图标，版本仍来自实际目录。

## 版本与状态

- 卡片显示 **目录目标版本**，不是当前设备已安装版本；日期快照显示为`2026.11.13`，不虚构成2.0升级。`rc`及历史版本标识保留。
- 「已安装」仅表示同ID存在，不代表版本、启用或业务权限已核验。Buzz 1.0.2的公开安装状态接口不返回本机语义版本；点击「查看更新」进入原生审核核对。
- 插件中心自身版本为0.2.0，在侧栏显示；目录仍由同一main提交的REGISTRY读取，不混入未合入候选。

## 权限与审核

保持ID `opcb.plugin-center`、页面ID `catalog`，只申请现有 `https://api.github.com` 网络权限。安装仍由可选 `pluginInstaller` 发起宿主原生审核，固定分发来源与提交；取消或失败不显示为安装成功。不轮询、不批量静默安装，不读取账号配置、凭据或个人数据。

缺失宿主安装接口时保留源码和下载入口，给出实际错误；刷新失败保留旧目录并禁用安装。搜索、分类、安装状态筛选、历史版本及详情仍可使用。插件停用释放目录与安装状态订阅。

## 验证

参考官方Buzz v1.0.2，本机Buzz 1.0.2，apiVersion 1。构建 `node scripts/build_plugin_center.mjs`；完整仓库检查 `npm run ci`；打包 `python3 scripts/package_release.py`。EGO中的React预览使用真实目录及合成安装状态，不能代替原生宿主、Android或iOS验收。最终安装保留本人原生审核。

界面方法参考 Damir Sokolovsky / Unslop，CC BY 4.0：https://github.com/heydamir/unslop 。现有共享OPCB v3规范优先；实现：潘涛 Studio。Fluent Emoji MIT、Nunito和Resource Han Rounded OFL授权随包保留。

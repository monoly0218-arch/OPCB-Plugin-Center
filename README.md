# 15号成果报告 · 品牌模板库

版本：2026-11-13-brand。保留原报告、手机页面与示例/真实数据切换；模板库从固定10个位置改为按类别整理、持续新增。

## 使用

1. 品牌顺序固定为：产品质感展示 → 产品使用场景 → 品牌故事／工艺 → 上新促销。其他／待归类保留生日等原内容。
2. 展示实际收录数量，原10个单独显示为阶段目标，不限制模板数量。新增项标记“候选 · 待确认”，不算成片或上线通过。
3. 可以调整模板分类。备份导入只合并未收录编号，保留已作修改；原图、样片和手机截图可以从私人JSON备份迁入。实际数据仍留空，不从模板数量推算商业成果。
4. 本机按当前Buzz身份和社区保存；切换身份/社区会重新读取对应库。可导出JSON备份；不自动上传素材、不提供跨设备同步。卸载/迁移前先导出。

## 兼容与权限

本轮参考官方 block/buzz-app v1.0.1；Studio应用包实际为1.0.1/1.0.1。API v1，注入 react、pages、relay、artifactStorage，使用官方v1.0.1的collection.preferences.get/update与close/subscribe契约；无shell、网络或文件宿主授权。文件由用户在选择器中选择，导出使用浏览器下载。素材播放器保留Blob方式与销毁清理。

公开包不含团队模板记录、样片或手机截图。导入接受含templates/screens数组的JSON；支持HTTPS素材、内嵌PNG/JPEG/WebP与MP4、Buzz记录链接。文件上限50MB；失败提示不报告保存成功。原有5条记录按key分类：wipe/cinema→产品质感，washer/car→使用场景，birthday→其他。旧10位置中其余5位原本为空，迁移不会冒充5个已完成模板。

当前业务素材需要私密迁入；历史样片与最新验收回执分开。源文件不含素材且不自动读取本机旧插件。首次更新与迁移不删除原安装或修改注册表。

## 安装与跨来源迁移

安装源为本仓库 distribution/results-report-brand-20261113 分支、路径`.`，完整提交见REGISTRY.json的reviewSource。通过Buzz原生审核卡安装，保持ID opcb.results-report。

Studio旧版本来自社区Git。v1.0.1原生install拒绝已有同ID，update仍读取旧来源；需要用户审核移除旧注册，再审核安装中心固定版本。移除前保留旧源码/可回装材料、实际revision和私密模板备份；不能用update参数静默换源，不能修改宿主注册表。新版本安装后，在“原有模板迁移与备份”选择私人JSON，恢复原5项与11屏。原业务媒体不放入公开库。

## 验证范围

完整检查：npm run ci；打包：python3 scripts/package_release.py。自动测试覆盖四类顺序、历史分类、超过10项、筛选、候选保存、失败保留与非法导入。EgoLite浏览器使用React和官方存储契约替身验证导入、Blob视频、11项、重开保留、改分类及390px/深浅色布局；这是浏览器验证，不等于宿主安装或Android/iOS验收。最终须在人工审核安装后回读revision、active与error，再检查导入和播放。

## 参考署名

界面方法参考 [Damir Sokolovsky / Unslop](https://github.com/heydamir/unslop)，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。潘涛 Studio 制作。

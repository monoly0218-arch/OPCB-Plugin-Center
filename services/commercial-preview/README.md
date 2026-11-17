# 商业图谱常驻预览服务

仅用于已授权的9号报告预览。派生自本机 opcb-page-annotations 服务，继续使用独立的版本化批注数据文件；不更改通用Skill或其他槽位。

- `GET/PUT __annotations`：原批注/评论与CAS及历史。
- `GET/PUT __review_state`：标题草稿独立JSON，修订号冲突返回409，留历史；浏览器核对同字段并发与保存读回。
- 任务与实绩来源是Agent核对后发布的 `report-data.json` 快照。此服务没有Buzz签名或实时任务权限；不模拟成功保存到Buzz。
- 显式资产白名单，数据与历史放网页目录外；继续loopback与现有来源检查。哈希资源immutable缓存，文本gzip，视频支持单区间Range。
- `scripts/preview_patrol.mjs` 为网页适配器构建入口，打包时拒绝超出此前报告范围的新任务。只导出规范化报告字段，不放原Canvas或假宿主。
- 版本页为不可变 `version-1.0.html` 起快照，`versions.json`记哈希与变化。回退只替换网页与对应来源快照，服务器批注与标题草稿不覆盖；资产清单保留历史依赖。

验证：`python3 -m unittest discover -s services/commercial-preview -v`；仓库完整 `npm run ci`；EGO实走共享草稿、并发、评论恢复、任务入口、手机原稿和历史页面。

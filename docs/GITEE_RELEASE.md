# Gitee 发行维护

[OPCB 插件中心](https://gitee.com/miaopantao/OPCB-Plugin-Center) 的 `distribution/3dicons-catalog-20261115` 是插件中心 0.3.6 的目录。宿主先从 Gitee API 获得该分支的提交，再从该提交读取 `REGISTRY.json`。详情链接和 ZIP 指向同一个目录提交，ZIP 的摘要在该提交的 `SHA256SUMS.txt`。

1. 先推送带完整提交固定值的 `distribution/` 原生 Git 分发分支。新安装使用公开 Gitee Git 地址和完整提交。
2. 更新目录、构建产物和候选清单。运行 `python3 scripts/release_identity.py`、`python3 scripts/package_gitee_artifacts.py` 和 `python3 scripts/package_release.py`，随后运行 `npm run ci`。
3. 原生 HTTPS 产物与目录发布指纹一致。支持 URL 安装的 Buzz 可用此入口原地更新已装的中心插件，审批页显示来源切换。签名包及超过 8 MiB 的包使用 Git 发布。
4. 发布后用无登录态核对 Gitee 分支和目录提交，核对实际下载的 SHA‑256，然后回读目标设备的安装来源、revision 和启用状态。

历史整套基线保留当时 GitHub 来源和设备指纹。对其历史记录的校对继续使用原始固定提交。新版本的 Gitee 发行按当期目录和原生审核校对。

# 上粮山资产库 2.0.0-rc.1

默认直接打开 <https://staging.paolab.cn/assets/> 的实时工作区，移除空白快照入口与重复进入步骤。沿用原站上传、下载、版本等功能；新增可展开使用说明、重新载入及不支持设备的原站入口，私人助手按需展开。

首次进入由本人选择网站成员，Buzz 与网站署名分别管理；不复制登录态、不包含旧本机素材。网页选中项不会自动传给助手，本次没有实现原生资产 API。原站业务流程需本人登录后核验。

保持 ID `opcb.shangliangshan-assets`、原有权限和立体图标。API v1；内嵌网站仅适用于支持该能力的 Buzz macOS。移动端不宣称通过。

源码 `src/shangliangshan-assets`，构建 `npm run build:factory-assets`，完整检查 `npm run ci`。安装使用 REGISTRY 固定提交原生审核卡，保留本人确认。候选代码、安装与业务验收分开。

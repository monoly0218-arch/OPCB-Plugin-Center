# KEo 资产库角色绑定

授权：buzz://message?channel=27d27399-2c03-4446-9561-c7217630cae6&id=bee96811bf76a54eec1329529ced6287f7be1cdfeb1b2e484f2bbb441175913e。

本轮目标为 KEo 的资产库访问。Buzz 身份按原安装线程发言及用户资料核实：823091f2c74e48e8eda43eb4c3830af13ec2ab99afa8abf3f2635bddecf2316b；原站 /assets/login 返回已有 keo / KEO 成员。新增这一条资产库映射，保留 keo 的原权限；不创建后台成员、不新增管理员授权、不授权内容工厂、不接受 Agent 公钥或昵称替代个人身份。

版本 2.0.0-rc.5 / API1；官方稳定 v1.0.2、本机 Buzz1.0.2/macOS，Python3。保持既有 3dicons、页面、执行分栏与权限声明。旧版 rc.4 和已发布 BASELINE/CATALOG/STUDIO 的目标版本保持不变；沿用既有打包契约，19 项合集仅刷新内嵌 REGISTRY 目录信息；本修订作为独立候选列入 REGISTRY/CANDIDATES，不静默替换整套基线。

完整原业务源码维护分支 feat/factory-assets-latest-20261114 的已发布源码提交 20f3de8897abf45f6a64378a197d216f3aefbf75。main 尚未合并该完整业务源码，本轮将其角色模块接入 src/media-workspace/role-binding.mjs，以固定 SHA256 的 rc.4 包为其余业务基线。node scripts/build_assets_roles.mjs 仅替换对应模块；完整 npm run ci 包含源码/包一致性、个人身份及跨社区拒绝测试和所有既有分发检查。

通过 REGISTRY.reviewSource 固定分支、提交和路径发起 Buzz 原生审核。发布、审核、安装和 KEo 设备业务验收分别记录；没有远端设备实际安装回执时不得称 KEo 已生效。服务端仍沿用已有 member 会话，不能称为服务端 Buzz 签名身份同步。

原站只读回验：当前 keo / KEO 的已有角色为 admin；本修订沿用该已有角色，没有修改后台角色。

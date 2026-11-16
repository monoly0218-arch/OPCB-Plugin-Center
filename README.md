# 上粮山资产库 2.0.0-rc.5

补齐 KEo 当前 Buzz 个人公钥与原站已有成员 keo 的对应关系，保留其原有业务角色。仅授权资产库，不新增内容工厂或管理员授权；其他成员与其他社区仍按原有检查执行。

本人授权：buzz://message?channel=27d27399-2c03-4446-9561-c7217630cae6&id=bee96811bf76a54eec1329529ced6287f7be1cdfeb1b2e484f2bbb441175913e。

基于已发布 rc.4 的固定包，仅更新身份绑定模块；不改后端成员、数据、页面、权限声明或内嵌 3dicons 图标。完整保留 rc.4 的 API1、macOS/Python3 要求与原站会话边界。服务端尚未验证 Buzz 签名，不能称为服务端统一身份认证。移动端未验收。

来源 src/media-workspace/role-binding.mjs；构建 node scripts/build_assets_roles.mjs，完整验证 npm run ci。当前 main 未合并原完整业务源码分支，构建校验 rc.4 的固定 SHA256 后仅替换对应模块，其余字节保持不变。保留旧包和既有整套基线；固定来源原生审核更新，安装后再核验实际用户身份。

原站只读回验：当前 keo / KEO 的已有角色为 admin；本修订沿用该已有角色，没有修改后台角色。

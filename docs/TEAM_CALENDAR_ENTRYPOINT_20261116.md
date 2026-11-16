# 团队日历加入团队协作

插件中心0.3.4在「团队协作」加入本设备已安装的团队日历，点击「打开日历」打开宿主实际注册的 `opcb.team-calendar/main`。原分类键 `工作协作` 保持兼容，界面使用「团队协作」。

## 目录与授权

`REGISTRY.json.installedEntrypoints` 与可安装版本的 `entries` 分开记录。只在宿主确认已安装时显示入口，订阅安装状态变化；用户点击时再次核对安装状态，再调用原生导航。目录刷新不会打开日历，不会安装或替换它，也不申请新的日历权限。

日历仍由原设备安装包和本人授权配置接入。公开仓库仅存入口元数据；不复制日历程序、运行连接、设备令牌或业务安排。未安装日历的设备不会看到虚假的可用入口。原生安装状态不表示插件已启用或业务依赖可用，导航失败时显示检查提示。

保留插件中心既有3dicons图标、贡献者、聊天安装卡、固定版本审核与原有业务；不改变17项整套基线。原生宿主授权仍仅访问 `api.github.com`，新增导航使用宿主服务。

## 发布与验证

当前正式目录为 `distribution/3dicons-catalog-20261115`，发布必须保留该分支已有任务中心等版本。插件中心独立审核源为 `distribution/plugin-center-calendar-0.3.4-20261116`，完整提交由该目录的reviewSource固定。

完整检查为 `OPCB_KNOWLEDGE_PYTHON=/opt/homebrew/bin/python3.10 npm run ci`；本机默认Xcode Python不含scrypt，使用已有的Homebrew Python，不修改测试或安装新运行时。构建脚本当前需要英文绝对工作路径，中文路径下URL.pathname会阻止正确构建。

新增检查覆盖目录版本固定、现有页面导航、无安装副作用、未知/消失的安装状态、导航失败、停止后的操作，以及入口显示。ego-browser隔离页面验证了分类、搜索、详情、点击目标与安装状态变化。隔离页面使用宿主模拟，不等同于原生Buzz安装后验收。

本机原生日历已核对active及main页面；插件中心更新须本人在Buzz原生审核卡确认。安装后需回读实际revision/active/error，再点击「插件中心 → 团队协作 → 团队日历 → 打开日历」核对。Android/iOS与另一人的实体设备尚未验收。

依据：本次Moo的收录及分类请求；Buzz plugin_authoring_guide、plugin_status、plugin_list；当前仓库AGENTS、README及图标发布约定。具体运行日志与界面预览保存在本次独立项目目录。

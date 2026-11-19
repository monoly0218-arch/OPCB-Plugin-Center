# Higgsfield 号池

团队通过一个私有 Buzz 频道共享账号。成员直接使用现在的 Buzz 身份，Agent 领取时自动记录成员和 Agent。看板显示剩余、占用中、已使用、没有免费次数与待核对，并可按状态筛选。

## 开通

1. 团队负责人创建唯一名为「Higgsfield 号池」的私有普通频道，使用专用空 Canvas。将需要领号的团队成员加为可写成员。原生频道权限同时保护账号、密码和辅助邮箱。
2. 在 Buzz 安装审核中确认此版本。插件打开后选择由团队负责人核对的库存 JSON，确认数量，再点击「导入到团队号池」。实际库存独立于发布包。
3. 原生 Buzz API 1 的 Canvas 写入需要中继支持 `expected-revision` 原子比较交换。当前实现基于 Buzz v1.0.5 和 Studio v1.0.6-preview.1 的原生接口。仅在支持该前置条件的中继启用多人领号。[Buzz 中继实现](https://github.com/block/buzz/pull/6780)

## Agent 使用

- `higgsfield_pool_status` 查看库存、领取者和使用状态。
- `higgsfield_pool_claim` 按需领取，回执提供主邮箱、密码、辅助邮箱、接码网址和登录步骤。用每个新请求独立的 `request_id`，网络重试复用它及原参数。
- 用独立 Ego 个人资料打开 Higgsfield 并选择微软登录。发码前打开本号原辅助邮箱。临时邮箱网页选「改变」，真实粘贴完整地址，确认原域名和最终地址。发一次码，读取本次新邮件，返回 Higgsfield 核对站内账号及页面免费次数。
- `higgsfield_pool_report` 写回本次申请的 `used` 和模版名，或经页面确认后的 `no_free`。未使用且无在途任务时 `release`，号池清除该次占用和模版显示。

## 库存 JSON

使用包含 `accounts` 数组的 JSON。每项字段为 `id`、`email`、`password`、`auxiliary_email`、`inbox_url`、`state` 和可选 `note`。状态为 `available` 或 `review`。待核对账号不参与分配。真实凭据只能导入团队私有频道。

原生频道 access 负责团队访问，Canvas 前置版本负责并发更新。保存未确认时先刷新并以原编号核对。本包使用 Ego 已有免费网页流程，无单机分配器、服务端订阅或附加账号验证。

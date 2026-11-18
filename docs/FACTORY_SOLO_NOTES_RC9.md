# 内容工厂 rc.9：发送到右侧 Solo 与版本备注

本人要求：开始执行直接交给右侧Solo Agent，不提供左侧执行人选择；新增备注按钮与本轮物料一起发送；宽屏左右胶囊面板等高。沿用Mobile Design组件与双提示词、原视频、角色、产品及历史版本。

公开原生 ComposerToolProps.audience/recipients 提供右侧实际收件人，不读取宿主私有缓存或复制原生输入框。选择变化、不可用或不唯一时不猜测。首次加入走 channelWrites.addAgents；旧普通成员接口会报“Add agents by tagging them in the chat composer instead.”，已替换。固定本轮提示词、备注和附件快照后以本人身份发送一次，重复点击只核对回执。

备注最多3000字，保存到对应制作版本，历史输入档案和验收工程NOTES.md保留。草稿和下一版备注独立，不改旧版。宽屏左侧拉长到与右侧等高且可独立滚动，窄屏仍上下可收起。

官方v1.0.5 / 本机macOS 1.0.5-preview.2 / API1；权限与rc.8相同。验证使用真实源码和隔离原生API；实际安装、实体iPad、真实生成独立验收。原生审核保留，不因按钮可发送而声称生成完成。

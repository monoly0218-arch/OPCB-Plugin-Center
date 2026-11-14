# 跑圈集团知识库：首阶段实现

当前候选 reader rc.5，沿用用户暂定的 v3 视觉方向。已实现集团目录、七团队、业务专题、用途/类型筛选和来源关联；并未宣称已接入实际多媒体原件。生产部署、原生安装和浏览器/实体 iPad 验收以本次回执为准。

## 信息结构与真实资料

集团名「跑圈集团知识库」；团队为 OPCB、有点可乐、跑圈、跑圈制作、Six Lab、逐点、iSense。团队目录独立于权限树，不创建或扩大任何个人/团队授权。默认不按提及某个团队猜测归属。

现有 business/research/content 根据服务器已有来源语义关联上粮山专题，分别为经营研究、经营研究、素材案例。business/research 是结构化数据，content 是素材关系文本，不冒充图片/视频原件。recordings 与其他尚无明确分类依据的条目保留用途/归属待确认。原始 source/ID、数据、时间和授权继续保留，不复制到另一套文本库。

首页团队/专题/共享入口，列表按用途和文件类型筛选，支持全集团或当前范围关键词搜索与分页。集团共享默认无条目；只有明确确认 shared 的资料进入此视图，仍需原来源权限。计数、搜索、预览都在已有来源授权后计算，拒绝的源不会出现在计数或结果里；同步未就绪的源单独报告。目录存在不代表成员已加入团队或原件已归档。

## 服务与协议

`group_catalog.py` 为只读索引提供组织视图。现有 catalog/list/search/get 兼容，并在条目加入 organization。catalog 新增 organization（集团名、团队、专题、用途、类型与授权范围计数）；新只读 op browse 支持 space(all/team/project/shared/unassigned)、space_id、category、kind、query、limit≤20、offset。读请求继续验签及策略 revision 栅栏；Agent 仅继承个人读取。

新增 Agent 工具 opcb_knowledge_browse；既有 sources/search/read 保留。新旧客户端与管理端仍可读取原协议。新插件接旧服务时继续原来源界面，不假装集团后端已接通；得到新 catalog.organization 后才展示团队目录。

集团 browse 不作为离线缓存入口；正文沿用现有加密缓存并在线核来源权限。身份绑定、缓存格式和管理员资格未改变。structured-data.mjs 显示原 JSON 字段、单位、日期和 null，保留完整原始结构，不重算经营指标。

## 归属确认与原件链接

可选 `--organization /private/path/organization.json` 指向服务账号可读的私有分类文件；缺失时使用安全默认结构。只允许服务器本地操作员配置，不开放 Agent 或匿名写入口。`classify_documents.py` 默认仅校验/预览；显式 --apply 加 expected revision 后原子替换分类文件，使用锁防止并发覆盖，不写源索引或 ACL。

manifest 须是0600普通文件，外层 version=1/revision/projects/documents；文档键为 source + ':' + 原ID，例如 recordings:123。每次归属须有 evidence；项目不在预设中时在 projects 明确声明。源ID不变，不能通过改分类越过权限。

原件引用须明确 name/kind/url/access='source'，只接受安全HTTPS地址，不保存密码、签名或临时票据。原件链接按原资料可见范围公开其元数据，操作员应先确认可共享范围；实际文件访问仍由来源站验证。没有显式原件引用时，不允许将文本记录标成音频/视频/图片/PPT/PDF。链接显示为 linked/archived=false，不代表文件已归档、已转写或插件已具备流式播放。

## 当前实施依赖

第一批实际视频、图片、音频、PPT/PDF原件的位置尚待用户提供。需要项目链接、授权文件夹或明确NAS路径，不能自动扫描整个个人云盘。媒体原件存储、播放器、ASR/OCR、PPT/PDF页面提取与页码/时间点引用仍属后续接入，先用授权样本验证再扩展。现有获取工具没有可用语音转写服务，不虚构已完成的AI提取。

既有EGO服务器空间128处于用户控制，工具明确硬停止；部署和浏览器验收必须等用户明确交还。不能另开窗口、换浏览器/SSH或读取私有凭据绕过。已准备候选与离线合成预览，未由此升级或重启宿主。

## 验证与交付

兼容核对：官方最新Buzz v1.0.2，本机1.0.1/build1.0.1，公开插件API v1。完整入口 `npm run ci`；隔离HTTP签名用例验证集团检索、来源隔离、撤权、原绑定和缓存；Python验证组织计数/分页/筛选、无归属推断、侧车校验和只读索引。离线演示用 `node scripts/build_group_preview.mjs /absolute/path/GROUP_PREVIEW.html`，只用合成资料，无签名密钥、登录态或真实业务数据。

包与固定候选分发源通过原生审核卡交付。管理包同步共享客户端只读协议，管理流程和权限不变；不要求安装它才能使用新的阅读包。旧pending审核卡不自动替换为新版本，不手动安装。

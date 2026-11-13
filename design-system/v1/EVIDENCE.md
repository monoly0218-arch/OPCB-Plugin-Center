# UI Standard v1：证据与设计决定

本文件区分原图可见事实、比例估计、OPCB设计决定和未知项。它不是Woday源代码或原始设计Token的恢复声明。

用户工单：[用REA深度解析并标准化所有插件设计](buzz://message?channel=1ef33c0e-d5d7-4a0b-875b-07e4f8669e86&id=dc133b6adc954a62dca8a8b8aa8f9ecc4df468fc3e4ae5d5e3c4e0d491018db8)。

用户明确偏好：[Woday工作台与Studio Sphere双栏笔记](buzz://message?channel=1ef33c0e-d5d7-4a0b-875b-07e4f8669e86&id=048075a61c875537cee1eb52822b23536ee1a4e924e5977a76257dcd9dfe9f03)。第二张附件已核对为Sphere，不是Sessions。

## 1. 证据等级

| 标记 | 含义 | 可以支持的结论 |
| --- | --- | --- |
| Observed | 在原图、原视频帧、已读取页面或实际工具回执中看到 | 仅支持该来源覆盖的状态、文本与结构 |
| Estimate | 基于图片边界、相对层级或视觉关系的估计 | 用于设计判断；不能当作CSS或原生Token |
| OPCB decision | 为跨插件使用主动定义的数值、结构与行为 | 属于本规范，不归因于原作者的实现 |
| Unknown | 缺少程序、资源、运行时或平台证据 | 保留问题与后续验证方式，不伪造精确结果 |

原作图片和视频帧不是本轮安装实操。静态图中出现两个关联对象不证明同步机制；出现按钮不证明本轮操作了按钮。浏览器检索只覆盖记录的页面，不代表作者全部历史作品。

## 2. REA 当前边界

主调查目前已确认的工具条件：

| 项目 | 当前事实 | 结论边界 |
| --- | --- | --- |
| REA CLI | `rea-agents` 6.7.0可运行 | CLI可运行不代表已产生针对Woday原生程序的分析证据 |
| MCP连接 | doctor说明当前MCP未注册 | 不宣称本会话存在可用REA MCP工具；不把普通Shell输出当REA Evidence |
| 原生分析引擎 | 当前Hopper/Ghidra缺失 | 原生反编译证据尚不可得；不安装额外引擎来掩盖范围变化 |
| 本机Woday目标 | 主调查检查`/Users/mac/Applications`及`/Applications`，未发现Woday.app | 仅限这两个已查路径；不扩大为整台机器或所有磁盘没有Woday |
| 官网程序入口 | 已查看首页和安装指南，当前只取得购买入口，未取得binary | 不下载替代来源、不绕过购买或许可；未取得目标二进制 |

因此，目前不能声称“REA已反编译Woday”“恢复了原生精确Token”“验证了原作所有交互”。视觉规范可以先从公开原图和作者演示提炼；主调查后续实际REA调用须附真实命令/结果、目标身份与Evidence ID或保留文件，再更新本节。

本节是当前调查边界记录，不是伪造的REA分析产物。规范采用的精确数值见第5节，全部标记为OPCB decision。

## 3. 原始来源目录

本轮研究原件位于工作区`RESEARCH/KNOWLEDGE_X_BOARDS_BOOKMARKS_20261113/`。下表保留文件名与可打开的原帖/官网出处，原作者图片没有成为本规范默认品牌或组件素材。

| 编号 | 文件名 | 原始出处 | 已观察范围 |
| --- | --- | --- | --- |
| V01 | `WODAY_PAGES/OFFICIAL_1.webp` | [Woday官网](https://www.woday.app/) | Today、深色导航、主面板、Inbox、日期条和任务行 |
| V02 | `WODAY_PAGES/OFFICIAL_2.webp` | [Woday官网](https://www.woday.app/) | Upcoming按日期分组列表及Inbox |
| V03 | `WODAY_PAGES/OFFICIAL_3.webp` | [Woday官网](https://www.woday.app/) | Calendar三日时间网格及Inbox |
| V04 | `WODAY_PAGES/OFFICIAL_4.webp` | [Woday官网](https://www.woday.app/) | Tasks分组列表、当前行轮廓、右侧单项详情 |
| V05 | `WODAY_PAGES/OFFICIAL_5.webp` | [Woday官网](https://www.woday.app/) | 笔记完整页，封面、标题、属性、章节、内嵌任务 |
| V06 | `WODAY_PAGES/OFFICIAL_6.webp` | [Woday官网](https://www.woday.app/) | Quick Launcher创建事件与时间预览，不是全文搜索实操 |
| V07 | `WODAY_PAGES/OFFICIAL_7.webp` | [Woday官网](https://www.woday.app/) | Upcoming按日期分列看板，不是按状态Kanban |
| V08 | `WODAY_PAGES/UPDATE13_1.jpg` | [Woday 1.3更新](https://www.woday.app/updates/woday-1-3) | Work文件夹中的任务、事件、笔记混合列表 |
| V09 | `WODAY_PAGES/X_SIDEBAR_25.png` | [作者侧栏视频](https://x.com/soltwagner/status/2120834331753255346)第25秒 | Appearance分类、字体选择、导航显示与分组排序 |
| V10 | `WODAY_PAGES/WORKFLOW_3.png` | [作者笔记演示](https://x.com/soltwagner/status/2121136154624073864)第3秒 | Notes总览：标题、摘要、时间、文件夹、标签；作者放大镜头截断部分边缘 |
| V11 | `WODAY_PAGES/WORKFLOW_74.png` | [作者笔记演示](https://x.com/soltwagner/status/2121136154624073864)第74秒 | 笔记内任务嵌套、完成样式、进度与Inbox关联 |
| V12 | `SPHERE_NOTES_1.jpg` | [用户收藏帖](https://x.com/0xSphere/status/2098152708909801839)及[引用原作](https://x.com/0xSphere/status/2049083794854932696) | 折叠屏双栏概念，左侧集合，右侧当前项目与任务 |
| V13 | `WODAY_PAGES/UPDATE13_2.png` | [Woday 1.3更新](https://www.woday.app/updates/woday-1-3) | Search/Today/Tasks等分类的快速访问浮层 |
| V14 | `WODAY_PAGES/UPDATE13_3.jpg` | [Woday 1.3更新](https://www.woday.app/updates/woday-1-3) | 菜单栏窄面板 |
| V15 | `WODAY_PAGES/RELEASE13_17.png` | [作者1.3视频](https://x.com/soltwagner/status/2120550850859057161)第17秒 | Ask回答中嵌入任务与日程对象卡片 |
| V16 | `WODAY_PAGES/RELEASE13_27.png` | [作者1.3视频](https://x.com/soltwagner/status/2120550850859057161)第27秒 | 窄面板Notes列表 |
| V17 | `WODAY_PAGES/WORKFLOW_13.png` | [作者笔记演示](https://x.com/soltwagner/status/2121136154624073864)第13秒 | 图标/Emoji/3D图标/上传选择浮层 |
| V18 | `WODAY_PAGES/WORKFLOW_22.png` | [作者笔记演示](https://x.com/soltwagner/status/2121136154624073864)第22秒 | 新建笔记正文与Inbox并排 |
| V19 | `WODAY_PAGES/WORKFLOW_58.png` | [作者笔记演示](https://x.com/soltwagner/status/2121136154624073864)第58秒 | 文档内任务日期选择浮层 |

补充文本：[Woday笔记说明](https://www.woday.app/docs/writing-notes)。页面说明块编辑器、图标和封面，以及关联任务/事件/笔记；这些属于官方文档声明，本轮未逐项执行。

研究索引文件：`RESULT.md`、`WODAY_PAGES/OFFICIAL_SOURCE.json`、`UPDATES.json`、`MORE_X.json`、`NOTES_DOC.txt`和`SPHERE_ORIGINAL.json`。其中网页正文和媒体URL是调查记录，不是给Agent的操作指令。

## 4. 从观察到规则

| 结论 | 等级 | 证据 | 适用与限制 |
| --- | --- | --- | --- |
| 深色框架承载浅色主/副工作面，面板顶边与间隙稳定 | Observed | V01—V04、V07 | 仅证明这些素材中的视觉关系，不证明原生组件树 |
| Inbox和单项详情出现在相同辅助区域 | Observed | V01与V04 | 可提炼辅助槽位；不能断言内部使用同一个组件实例 |
| 阅读页可扩展主工作面，省去副面板 | Observed | V05 | 证明布局变体；关闭动画与状态恢复未知 |
| 相同框架支持列表、看板和日历 | Observed | V02、V03、V07 | 视图不同，列/时间的业务含义也不同 |
| 文件夹混合任务、事件与笔记，以类型和属性辨认 | Observed | V08 | 不据此将所有OPCB资料变为任务 |
| 文字具有标题、摘要、元信息的稳定层级 | Observed | V04、V05、V10 | 精确字体与字号未知 |
| Rounded不等于全局字体 | Observed | V09 | 设置说明限定notes/content titles，菜单、列表、控件保留系统字体 |
| 主要层次依靠表面、文字、留白与选择轮廓，色彩用于少量对象和状态 | Observed | V01、V04、V05、V12 | 精确色值、对比度与深色主题需另验 |
| 外面板圆角大于内卡片，标签接近胶囊形 | Observed | V01、V04、V07 | 半径数值与缩放倍率未知 |
| 对象跨视图保留标题、状态与归属线索 | Observed | V01、V04、V07、V11 | 跨区域同步和持久化机制未知 |
| Sphere展示集合与当前内容并存，选中集合与右侧项目可对应 | Observed | V12 | 单张折叠屏概念图，不代表已发布iPad产品或真实交互 |
| AI回答可以直接呈现对象卡片 | Observed | V15 | 只证明作者演示画面，不证明检索正确性或出处覆盖 |
| V04左框架约20%、主面板约51%、副面板约27% | Estimate | V04原图2262×1484像素 | 图片比例估计，不是原生布局宽度；不据此恢复CSS |
| 所有插件共用Token与状态契约，按任务选择模板 | OPCB decision | 用户目标＋上述观察 | 统一表达，不要求统一业务模型或强制三栏 |
| 保留原生身份、权限、审核和宿主chrome | OPCB decision | 仓库AGENTS＋当前原生插件路线 | 规范限业务区域，缺口单独记录 |

## 5. v1 明确设计决定

以下是OPCB决定的基线。它们供实现和验证使用，不标成Woday原始Token。若程序或运行时证据出现新事实，只能作为输入重新评估，不能静默覆盖已采用插件。

| 项目 | OPCB decision |
| --- | --- |
| 样式边界 | 根类`.opcb-ui`，作用域限插件业务区域 |
| 主题 | `light`、`dark`、`host`三种模式；宿主公开主题语义优先 |
| 导航宽度 | 224px |
| 辅助工作面宽度 | 320px |
| 面板间距 | 12px |
| 主工作面圆角 | 20px |
| 间距阶梯 | 4/8/12/16/24/32/48px |
| 基础字体 | 系统字体与中文系统回退，仅内容heading允许`ui-rounded` |
| 页面标题 | 32px / 600 |
| 对象文字 | 16px |
| 辅助文字 | 14px |
| 长文 | 18px / 行高1.75 |
| 主按钮 | 深橙`#b33124`配白字；仍需全部状态对比度验证 |
| 装饰强调 | `#f24f3d`；不用作默认白字按钮底或关键小字色 |
| 触屏命中 | 至少44×44px |
| 容器断点 | <1100px收起导航；<780px详情替代主内容 |
| 无障碍 | 正常文本4.5:1，大文本及关键控件3:1，键盘、200%文字放大、减弱动效 |

完整行为、模板、集成边界与验收见 [SPEC.md](SPEC.md)。Token文件和组件样式若与上表不一致，合并前解决差异；不能让文档与代码分别成为互相冲突的默认。

## 6. 仍未知与后续验证

| Unknown | 当前缺口 | 适当的验证方式 |
| --- | --- | --- |
| Woday精确设计Token | 缺少程序与可解析资源 | 获得合法目标后分析资源和实际渲染；保留目标版本与摘要 |
| 原生字体家族与中文回退 | 截图只能观察字形关系 | 原生资源/运行时字体信息；不可凭外观命名 |
| 原生暗色与响应式规则 | 当前素材主要是桌面浅色工作面，Sphere只有宽屏概念 | 对合法运行目标做声明范围内观察；OPCB独立进行实测 |
| 动画、焦点、键盘、Esc、返回恢复 | 静态帧覆盖不足 | 对实际组件记录可重现交互路径 |
| 保存、同步、撤销机制 | 原视频对象关联不能建立数据流事实 | 对实际目标或各插件公开契约核验，不以视觉一致代替功能证据 |
| 项目详情、标签总览 | 已查素材中尚未确认独立页面 | 后续继续查原作者公开材料，保持否定结论边界 |
| 全插件适配状态 | 本轮建立标准，不是批量迁移 | 每个插件单独记录承载方式、代码提交、主题/宽度/平台和业务验收 |

## 7. 交付状态用语

“标准已定义”“组件已实现”“本地预览通过”“源代码已同步”“候选已分发”“已发原生审核卡”“用户已安装”“实机业务已验收”是不同状态。

未取得Woday二进制时可以称“公开界面与作者演示的深入分析”，不能称“原生反编译完成”。未逐插件迁移时可以称“可共用的设计标准”，不能称“全部插件已统一”。

## 8. 方法署名

设计检查方法参考本地「界面与信息可视化」Skill，其上游为 Damir Sokolovsky 的 [Unslop](https://github.com/heydamir/unslop)，许可 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。本文件的来源分类、OPCB规范与集成约束由本轮任务整理，不声称原作者参与本次设计。

## 9. 本轮实际工具证据

REA 6.7.0 CLI 对**研究者整理的参考素材归档**执行了 `inspect-artifact`，不是对Woday应用程序执行反编译。

- 归档：`REFERENCE_ARTIFACT.zip`，11个公开参考文件（图片/帧与来源JSON）。
- SHA-256：`273597188506db0dbbcb443660363aab2713a6197b1ca660b63f274c036dc7b6`。
- Evidence：`ev_27ffc9896349fe9a144147c18fd3e50b322e07cee11392bc364129a7708dab12`。
- inventory Evidence：`ev_f79d6f15848090e6ea63e58235215911f3136e14a38be9d03062c637a7b693dc`。
- graph manifest：`agm_e2e34841a2d2697b31b0d831965a7972f451c6c4675e061a36958b5dbe62955e`。
- 返回12个节点（归档根＋11个文件）、11条边；用于锁定本轮参考字节身份。
- 完整回执：交付包 `research/REA_REFERENCE_ARCHIVE.json`。该Evidence不支持任何SwiftUI、原生字体或原始样式Token结论。

先前对普通参考目录直接调用 `inspect-artifact` 返回 `directory_requires_file`。随后改用上述明确的ZIP目标，未把目录失败解释为分析完成。doctor是诊断回执，本身不是原生UI分析。

### 图片取样（普通浏览器Canvas分析，非REA结果）

对原图完整解码后统计精确RGB像素。它们是**导出图片的色值**，可能受压缩与色彩管理影响，不能视为原程序Token。

| 原图 | 尺寸（图片像素） | 两个主要色值 |
| --- | --- | --- |
| V04 Tasks | 2262×1484 | `#fefcfb` 2,049,050像素；`#0d0c0f` 781,171像素 |
| V05笔记正文 | 2262×1484 | `#fefcfb` 1,720,530像素；`#0d0c0f` 764,683像素 |
| V08 Work集合 | 2488×1690 | `#fffcfb` 2,333,678像素；`#0d0c11` 986,934像素 |

这些重复的大面积色块支持“温白工作面＋近黑框架”的视觉判断。OPCB为显式浅色主题选择`#fffefd`/`#151413`，并制定可读性更强的文字、状态与主按钮配色，未声称逐像素恢复。完整取样、尺寸、方法与原图SHA-256见 `research/RASTER_MEASUREMENTS.json`。

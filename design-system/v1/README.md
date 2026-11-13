# OPCB UI Standard v1

`1.0.0-candidate.1`：可复用设计基础候选。设计数值由 OPCB 制定，参考 Woday 的框架、内容与对象层级，以及 Sphere 的双栏组织；不是从两者源码恢复的官方 token。

本目录只提供 token、局部 CSS 和宿主 React 工厂；没有自动改变任何业务插件。不会修改 Buzz 外壳、原生聊天、安装审核或嵌入原站内部。

## 文件与接入

| 文件 | 职责 |
|---|---|
| `tokens.json` | 值与主题的可读清单，包含来源性质说明 |
| `tokens.css` | `--opcb-*` 变量，host/light/dark 主题 |
| `components.css` | `.opcb-ui` 下的组件与容器响应规则 |
| `react.mjs` | `createUI(ctx.react)`，不导入另一份 React |

消费方构建时把两份 CSS 作为字符串合入自己的自包含插件，不从 CDN 动态载入。esbuild 可对 CSS 导入配置 `loader:{'.css':'text'}`；具体应用的原有 CSS 打包方式须分别核实，不全局改 loader。也可在生成入口前读入受控文本再静态内联。运行时工厂不读文件、不访问外部 URL。

```js
import {createUI} from './design-system/v1/react.mjs';
// 使用消费方已经配置的 text loader；这里不是普通浏览器 CSS import。
import tokensCSS from './design-system/v1/tokens.css';
import componentsCSS from './design-system/v1/components.css';

export function apply(ctx) {
  const h = ctx.react.createElement;
  const UI = createUI(ctx.react);
  function Page() {
    const [opened, setOpened] = ctx.react.useState(false);
    return h(UI.Workspace, {
      theme: 'host',
      nav: h('button', {className:'opcb-nav-item', 'aria-current':'page'}, '资料'),
      inspectorOpen: opened,
      inspector: h('section', null,
        h(UI.Button, {variant:'quiet', onClick:()=>setOpened(false)}, '返回资料'),
        h('h2', {className:'opcb-section-title'}, '选中资料'),
      ),
    },
      h(UI.StyleSheet, {css:tokensCSS+'\n'+componentsCSS}),
      h('h1', {className:'opcb-heading'}, '工作资料'),
      h(UI.ObjectRow, {
        title:'产品研究', meta:'演示资料 · 时间未提供', onOpen:()=>setOpened(true),
        actions:h(UI.Button, {variant:'quiet', onClick:()=>{}}, '其他操作'),
      }),
    );
  }
  ctx.pages.register({id:'main', title:'资料', layout:'workspace', component:Page});
}
```

主题 `host` 为默认，通过宿主 `--surface-panel`、`--text-standard` 等已有变量解析；实际宿主 token 值和对比度仍须实机核对。`light` 为近黑导航框架与近白工作面，`dark` 为全深色层次。独立预览应显式选择 light/dark，生产默认保留 host，不推断系统主题属性或私有事件。

## 字体、颜色与密度

正文 `18px / 1.75`，对象标题16px、辅助14px、页面标题32px/600。`ui-rounded` 只用于标题，中文字体回退保留系统无衬线。间距使用4、8、12、16、24、32、48px；触屏关键控件最小44px。

红橙 `#f24f3d` 是装饰强调；文字按钮和主按钮使用深橙 `#b33124` 搭配白色，普通文字对比度需至少4.5:1。状态 success/warning/info/danger 有不同语义，必须同时写出文字；颜色不能替代“待同步”“无权限”“网络失败”等明确状态。

## 组件契约

| 组件 | 可用 props 与责任 |
|---|---|
| Button / IconButton | 原生button，默认type=button；variant=primary/quiet/danger；IconButton必须有label |
| Input | 原生input，透传id、type、disabled、aria属性及事件；可使用受控value/onChange |
| Chip | 非交互span；tone=neutral/info/success/warning/danger；交互标签用Button |
| Panel | 默认section，可通过as选语义容器；消费方负责标题/aria-label |
| ObjectRow | title/meta为纯文本；onOpen使主内容变button；actions作为兄弟节点，避免按钮嵌套 |
| Field | id/label/help/error；推荐children函数自动传入id、aria-describedby、aria-invalid |
| EmptyState | title/description/action；默认role=status，可显式role=alert展示错误 |
| Workspace | nav、inspector、children；theme、navOpen、inspectorOpen由消费方管理 |
| StyleSheet | css字符串与可选nonce；每个工作区只挂一份，React卸载时移除，无全局样式写入 |

```js
h(UI.Field, {id:'source-name',label:'知识库名称',help:'用于目录展示',error:errorText},
  inputProps=>h(UI.Input,{...inputProps,value:name,onChange:e=>setName(e.target.value)}));
```

所有 CSS 选择器均从 `.opcb-ui` 开始；禁止改 `body/:root` 或覆盖宿主 `--text-*`。样式变量只用命名空间。若渲染嵌套的第三方/宿主聊天组件，其本体应放在独立边界；本库仅给自有业务 UI 使用，不把通用规则强加给聊天内部。

## 布局与响应

容器命名为 `opcb`，在 `.opcb-ui` 上建立 inline-size container。Workspace 内 nav224px、inspector320px、面板间12px、面板圆角20px。

1. 容器至少1100px：导航＋主内容，可按需展开详情。
2. 小于1100px：导航收起，`data-nav=open`/navOpen提供覆盖式导航；不要把窗口宽度当插件宽度。
3. 小于780px：打开详情后，详情覆盖主区，主区保留挂载与状态但不可见；消费方提供返回按钮、焦点转移与返回位置恢复。
4. Board 仅自身横向滚动；表格使用 `.opcb-table-scroll` 包裹；不要让整个页面横向滚动。
5. 原生 Browser View 内部不受这些规则控制，继续走原站维护来源。

CSS只负责布局，不模拟完整Dialog行为。消费方负责导航展开/关闭、Escape、焦点管理、键盘顺序、滚动位置、对话范围及真实请求状态。视图切换后应把焦点放在新标题或返回按钮；不在隐藏面板里留下焦点。

## 候选验收

单元检查：`node --test tests/ui_standard.test.mjs`。覆盖样式局部作用域、变量引用与主题完整性、文字色对比度、宿主 React 注入、原生button与非嵌套操作、字段关联、状态文字和响应契约。单元检查不代替视觉或原生宿主验收。

主 Agent 负责中心完整 `npm run ci` 和 EGO 预览。实际使用须检查390/768/1024/1440容器、深浅主题、键盘焦点、长中文标题、滚动、无权限/空/加载/错误与移动平台。未验证的平台不宣称通过；安装仍走固定提交审核卡。

### 交付索引

- `SPEC.md`：布局、字体、组件、状态、交互与验收契约。
- `EVIDENCE.md`：原图来源、观察/估值/OPCB决定/未知项，以及REA实际证据边界。
- `ADOPTION.md`：15个插件ID对应的接入范围和迁移路径；本轮尚未逐插件迁移。
- `PREVIEW.html`：无需构建的独立交互样例，包含六种场景、深浅/宿主主题、宽度与状态切换；数据全为演示。
- `icons.mjs`：15个原创描边图标，`createIcons(ctx.react)`，继承当前文字颜色，不加载字体或远程资源。

生成独立预览：`node design-system/v1/scripts/build-preview.mjs`。
预览与组件默认参数同源；`preview.css`只负责展示，不编译进业务插件。实际采用方应导入`tokens.css`、`components.css`与所需React工厂。

宿主主题模式只对内容表面、文字与边界继承公开语义变量；插件自有导航框架保持近黑及对应浅色导航文字，确保本标准的结构识别稳定。它不改变宿主外层导航的配色。

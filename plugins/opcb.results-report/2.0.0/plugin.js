export const inject = ["react", "pages"];

export function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const report = {"templates":[],"screens":[],"demo":{"posts":10,"views":1200,"arrivals":120,"codeUsers":80,"starts":60,"successes":42,"saves":30,"registrations":12,"paidUsers":6,"willingToShare":8,"repeatUsers":5,"revenue":179.4,"refunds":0,"generationCost":126,"acquisitionCost":60},"actual":{"posts":null,"views":null,"arrivals":null,"codeUsers":null,"starts":null,"successes":null,"saves":null,"registrations":null,"paidUsers":null,"willingToShare":null,"repeatUsers":null,"revenue":null,"refunds":null,"generationCost":null,"acquisitionCost":null},"reviewExample":{"summary":"预演结论：已有用户完成并付费；计入获客投入后，本轮收支尚未覆盖。","result":"42位用户生成成功，6位付费；8位反馈愿意发布，5位再次使用。付费与体验意愿分别有小样本信号。","gap":"到站120人，60人提交，入口到提交损失50%；生成成功用户比例70%。获客投入后差额为−¥6.60，仍未计人工与固定费用。","next":"先简化口令与上传；保留小批量预算继续测试；观察提交率、成功率、付费人数和测试收支能否改善。"},"dictionary":[["内容","发布篇数、曝光、原帖链接","按统计期内原帖去重；曝光按平台定义，不等于去重用户。","周洋"],["体验","到站、有效口令、提交、成功、保存","按用户去重，排除团队测试；成功绑定原任务；保存需设备或回访确认，下载点击另记。","周洋 · Steven"],["转化","注册、付费、愿意发布、再次使用","注册单列；付费排除测试订单；愿意发布取自反馈，实际发布另存原帖；复用需第二次生成记录。","周洋 · Steven"],["收支","实收、退款、生成消耗、获客投入","沿真实订单与账单；生成费用包含收费失败和重试；差额不包含人工及固定费用。","Steven"]]};
  const c = {
    text: "var(--text-standard, #171717)",
    sub: "var(--text-subtle, #686868)",
    paper: "var(--surface-panel, #ffffff)",
    inset: "var(--surface-inset, #f1f1f2)",
    inverse: "var(--surface-inverse, #202020)",
    inverseText: "var(--text-inverse, #ffffff)",
    line: "var(--border-standard, rgba(127,127,127,.22))",
    warning: "var(--text-warning, #946000)",
  };
  const format = (value, money = false) => {
    if (value === null || value === undefined) return "—";
    const n = Number(value);
    if (!money) return n.toLocaleString("zh-CN");
    return `${n < 0 ? "−" : ""}¥${Math.abs(n).toFixed(2)}`;
  };
  const text = { margin: 0, fontSize: 16, lineHeight: 1.7, color: c.sub };
  const meta = { ...text, fontSize: 14 };
  const number = { fontSize: 32, fontWeight: 500, lineHeight: 1.2, fontVariantNumeric: "tabular-nums", color: c.text };
  const card = { border: `1px solid ${c.line}`, borderRadius: 16, background: c.paper, padding: 24, minWidth: 0 };
  const button = { minHeight: 40, padding: "8px 16px", borderRadius: 8, border: `1px solid ${c.line}`, background: c.paper, color: c.text, fontSize: 14, fontWeight: 500, cursor: "pointer" };
  const link = (label, url) => h("a", { href: url, target: "_blank", rel: "noopener noreferrer", style: { color: c.sub, fontSize: 14 } }, label);

  function SampleVideo({ item, compact }) {
    const player = React.useRef(null);
    const [url, setUrl] = React.useState(undefined);
    const [failed, setFailed] = React.useState(false);
    const [attempt, setAttempt] = React.useState(0);
    React.useEffect(() => {
      const element = player.current;
      let objectUrl;
      setFailed(false);
      try {
        // Buzz permits blob: media, while its media CSP excludes data: URLs.
        const separator = item.video.indexOf(",");
        const binary = atob(item.video.slice(separator + 1));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
        setUrl(objectUrl);
      } catch {
        setUrl(undefined);
        setFailed(true);
      }
      return () => {
        element?.pause();
        element?.removeAttribute("src");
        element?.load();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }, [item.video, attempt]);
    return h("div", { style: { minWidth: 0 } },
      h("video", { ref: player, controls: true, playsInline: true, preload: "metadata", src: url, poster: item.poster,
        onError: () => setFailed(true), "aria-label": `${item.name}实际样片`,
        style: { display: "block", width: "100%", height: compact ? 240 : 256, objectFit: "contain", borderRadius: 8, background: "#111111" } }),
      failed ? h("div", { role: "status", style: { marginTop: 12 } },
        h("p", { style: meta }, "样片暂时无法播放，请重新加载。"),
        h("button", { type: "button", style: { ...button, marginTop: 8 }, onClick: () => setAttempt((value) => value + 1) }, "重新加载样片")) : null);
  }

  function ReportPage() {
    const root = React.useRef(null);
    const rail = React.useRef(null);
    const preview = React.useRef(null);
    const [width, setWidth] = React.useState(1100);
    const [example, setExample] = React.useState(false);
    const [selected, setSelected] = React.useState(0);
    const [phone, setPhone] = React.useState(null);
    React.useEffect(() => {
      const el = root.current;
      if (!el || typeof ResizeObserver === "undefined") return undefined;
      const observer = new ResizeObserver((entries) => {
        const next = entries[0]?.contentRect?.width;
        if (next) setWidth(next);
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, []);
    React.useEffect(() => {
      if (phone !== null) { preview.current?.scrollIntoView({ block: "nearest", behavior: "auto" }); preview.current?.focus({ preventScroll: true }); }
    }, [phone !== null]);
    const compact = width < 760;
    const columns = width < 520 ? 2 : width < 900 ? 3 : 5;
    const data = example ? report.demo : report.actual;
    const active = report.templates[selected];
    const known = (...keys) => keys.every((key) => data[key] !== null && data[key] !== undefined);
    const balance = known("revenue", "refunds", "generationCost") ? data.revenue - data.refunds - data.generationCost : null;
    const experiment = balance !== null && known("acquisitionCost") ? balance - data.acquisitionCost : null;

    function sectionTitle(index, title, note) {
      return h("div", { style: { display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 } },
        h("h2", { style: { margin: 0, fontSize: compact ? 22 : 24, lineHeight: 1.4, fontWeight: 500, color: c.text } },
          h("span", { style: { display: "inline-block", width: 32, fontSize: 14, color: c.sub, fontVariantNumeric: "tabular-nums" } }, index), title),
        note ? h("p", { style: meta }, note) : null);
    }
    function metric(label, key, foot) {
      return h("div", { key, style: { minWidth: 0 } },
        h("p", { style: meta }, label),
        h("p", { "data-metric": key, style: { ...number, fontSize: 26, margin: "8px 0" } }, format(data[key])),
        h("p", { style: { ...meta, fontSize: 13 } }, foot));
    }
    function moneyRow(label, value, emphasis = false) {
      return h("div", { key: label, style: { display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 0", borderTop: `1px solid ${c.line}`, fontSize: 15, color: emphasis ? c.text : c.sub } },
        h("span", null, label), h("span", { "data-money": label, style: { fontWeight: emphasis ? 600 : 500, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } }, format(value, true)));
    }
    const templates = h("section", { "data-section": "templates" },
      sectionTitle("01", "10个内容方向", "公开分发模板，制作证据待补充"),
      h("div", { style: { display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`, gap: 12 } },
        ...Array.from({ length: 10 }, (_, index) => {
          const item = report.templates[index];
          if (!item) return h("div", { key: index, style: { minHeight: 144, border: `1px dashed ${c.line}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", justifyContent: "space-between" } },
            h("span", { style: { ...number, fontSize: 24, color: c.sub } }, String(index + 1).padStart(2, "0")),
            h("div", null, h("p", { style: { ...meta, color: c.text } }, "内容方向待补"), h("p", { style: { ...meta, fontSize: 13 } }, "保留位置")));
          return h("button", { key: item.key, type: "button", "data-template": index, "aria-pressed": index === selected, onClick: () => setSelected(index), style: {
            padding: 0, border: `1px solid ${index === selected ? c.text : c.line}`, borderRadius: 12,
            background: c.paper, color: c.text, overflow: "hidden", textAlign: "left", cursor: "pointer", minWidth: 0,
            boxShadow: index === selected ? `0 0 0 1px ${c.text}` : "none",
          } },
          h("img", { src: item.poster, alt: `${item.name}实际样片画面`, style: { width: "100%", height: compact ? 92 : 104, display: "block", objectFit: "cover" } }),
          h("div", { style: { padding: "12px 12px 14px" } },
            h("p", { style: { margin: 0, fontSize: 15, fontWeight: 500, lineHeight: 1.4 } }, `${String(index + 1).padStart(2, "0")} ${item.name}`),
            h("p", { style: { ...meta, fontSize: 13, marginTop: 4 } }, item.status)));
        })),
      active ? h("div", { style: { ...card, marginTop: 20, display: "grid", gridTemplateColumns: compact ? "1fr" : "minmax(240px, 0.7fr) minmax(0, 1.3fr)", gap: 24, alignItems: "center" } },
        h(SampleVideo, { key: active.key, item: active, compact }),
        h("div", null,
          h("p", { style: { ...meta, fontSize: 13 } }, `真实制作样片 / ${active.status}`),
          h("h3", { style: { margin: "8px 0 12px", fontSize: 24, fontWeight: 500 } }, active.name),
          h("p", { style: text }, active.description),
          h("p", { style: { ...meta, marginTop: 16, marginBottom: 8 } }, active.note),
          link("制作与验收记录 ↗", active.source))) : h("p", { style: { ...text, marginTop: 20 } }, "公开分发包不含团队样片，请补充获授权的素材。"));

    const phonePreview = phone === null ? null : h("div", { ref: preview, tabIndex: -1, "data-phone-preview": true,
      onKeyDown: (event) => {
        if (event.key === "ArrowLeft") { setPhone((phone + 10) % 11); event.preventDefault(); }
        if (event.key === "ArrowRight") { setPhone((phone + 1) % 11); event.preventDefault(); }
        if (event.key === "Escape") setPhone(null);
      }, style: { ...card, marginTop: 20 } },
      h("div", { style: { display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 } },
        h("div", null, h("h3", { style: { margin: 0, fontSize: 20, fontWeight: 500 } }, `${String(phone + 1).padStart(2, "0")} ${report.screens[phone].title}`), h("p", { style: meta }, report.screens[phone].note)),
        h("button", { type: "button", style: button, onClick: () => setPhone(null) }, "收起大图")),
      h("img", { src: report.screens[phone].image, alt: report.screens[phone].title, style: { display: "block", maxWidth: "100%", width: "auto", maxHeight: 800, margin: "0 auto", objectFit: "contain", borderRadius: 8 } }),
      h("div", { style: { display: "flex", gap: 12, justifyContent: "center", marginTop: 20 } },
        h("button", { type: "button", style: button, onClick: () => setPhone((phone + 10) % 11) }, "← 上一屏"),
        h("span", { style: { ...meta, alignSelf: "center" } }, `${phone + 1} / 11`),
        h("button", { type: "button", style: button, onClick: () => setPhone((phone + 1) % 11) }, "下一屏 →")));
    const journey = h("section", { "data-section": "journey" },
      sectionTitle("02", "用户用手机，怎样做出自己的作品", "公开分发包不含团队截图"),
      h("p", { style: { ...text, marginBottom: 20 } }, "看到内容与口令 → Safari打开模板 → 上传并生成 → 保存／可选注册 → 首页与再次使用"),
      h("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 12 } },
        h("button", { type: "button", style: button, "aria-label": "向前浏览手机页面", onClick: () => rail.current?.scrollBy({ left: -rail.current.clientWidth * 0.75, behavior: "auto" }) }, "←"),
        h("button", { type: "button", style: button, "aria-label": "向后浏览手机页面", onClick: () => rail.current?.scrollBy({ left: rail.current.clientWidth * 0.75, behavior: "auto" }) }, "→")),
      h("div", { ref: rail, tabIndex: 0, "aria-label": "11屏手机页面，横向滚动", style: { display: "flex", overflowX: "auto", gap: 16, padding: "0 0 16px" } },
        ...report.screens.map((screen, index) => h("button", { key: screen.title, type: "button", "data-screen": index, onClick: () => setPhone(index), style: { padding: 0, border: 0, borderRadius: 12, background: "transparent", color: c.text, flex: `0 0 ${compact ? Math.max(220, width * 0.68) : 192}px`, textAlign: "left", cursor: "pointer" } },
          h("img", { src: screen.image, alt: `iPhone 15 Pro Max带壳页面：${screen.title}`, loading: "lazy", style: { display: "block", width: "100%", borderRadius: 12 } }),
          h("p", { style: { ...text, fontSize: 15, fontWeight: 500, color: c.text, marginTop: 12 } }, `${String(index + 1).padStart(2, "0")} ${screen.title}`),
          h("p", { style: { ...meta, fontSize: 13, marginTop: 4 } }, screen.note)))),
      h("p", { style: { ...meta, marginTop: 12 } }, "请补充获授权的手机页面截图；真实生成、权益与相册保存须另外验证。"),
      phonePreview);

    const steps = [["arrivals", "到站用户"], ["codeUsers", "有效口令"], ["starts", "发起生成"], ["successes", "生成成功"], ["saves", "确认保存"]];
    const results = h("section", { "data-section": "results" },
      sectionTitle("03", "来了多少人，做成多少，花了多少钱", example ? "示例数据，用于检查呈现" : "缺失数据留空"),
      h("div", { style: { display: "grid", gridTemplateColumns: compact ? "1fr" : "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 20 } },
        h("div", { style: card },
          h("h3", { style: { margin: "0 0 20px", fontSize: 18, fontWeight: 500 } }, "使用路径"),
          h("div", { style: { display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 24 } },
            h("p", { style: meta }, "发布内容 ", h("span", { "data-metric": "posts", style: { color: c.text, fontWeight: 500 } }, format(data.posts)), " 篇"),
            h("p", { style: meta }, "内容曝光 ", h("span", { "data-metric": "views", style: { color: c.text, fontWeight: 500 } }, format(data.views)), " 次")),
          h("div", { "aria-label": example ? "示例使用转化，非实际结果" : "使用数据待填", style: { display: "flex", flexDirection: "column", gap: 16 } },
            ...steps.map(([key, label], index) => {
              const previous = index ? data[steps[index - 1][0]] : null;
              const ratio = data[key] !== null && previous ? `${(100 * data[key] / previous).toFixed(1)}% / 上一步` : "—";
              return h("div", { key, style: { display: "grid", gridTemplateColumns: compact ? "76px 44px minmax(0,1fr)" : "88px 56px minmax(0,1fr)", columnGap: 12, alignItems: "center" } },
                h("span", { style: { ...meta, fontSize: 15 } }, label),
                h("span", { "data-metric": key, style: { ...number, fontSize: compact ? 26 : 30 } }, format(data[key])),
                h("div", null,
                  h("div", { style: { height: 6, borderRadius: 3, background: c.inset, overflow: "hidden" } },
                    h("div", { style: { height: "100%", width: data[key] !== null && data.arrivals ? `${Math.min(100, 100 * data[key] / data.arrivals)}%` : 0, background: c.text, borderRadius: 3 } })),
                  h("p", { style: { ...meta, fontSize: 12, marginTop: 6 } }, index ? ratio : "去重到站用户")));
            })),
          h("div", { style: { display: "grid", gridTemplateColumns: compact ? "repeat(2,minmax(0,1fr))" : "repeat(4,minmax(0,1fr))", gap: 16, borderTop: `1px solid ${c.line}`, marginTop: 24, paddingTop: 20 } },
            metric("注册账号", "registrations", "保存与注册单列"), metric("真实付费", "paidUsers", "排除团队测试"), metric("愿意发布", "willingToShare", "反馈意愿，非发帖"), metric("再次使用", "repeatUsers", "第二次发起生成"))),
        h("div", { style: card },
          h("h3", { style: { margin: "0 0 20px", fontSize: 18, fontWeight: 500 } }, "测试收支"),
          h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 } },
            h("div", null, h("p", { style: meta }, "实际收入"), h("p", { "data-money": "revenue", style: { ...number, margin: "12px 0 0", fontSize: compact ? 28 : 34 } }, format(data.revenue, true))),
            h("div", null, h("p", { style: meta }, "生成消耗"), h("p", { "data-money": "generationCost", style: { ...number, margin: "12px 0 0", fontSize: compact ? 28 : 34 } }, format(data.generationCost, true)))),
          moneyRow("退款", data.refunds), moneyRow("生成收支差额", balance), moneyRow("获客投入", data.acquisitionCost), moneyRow("测试收支差额", experiment, true),
          h("p", { style: { ...meta, fontSize: 13, marginTop: 16 } }, "收入 − 退款 − 生成消耗 − 获客投入；未计人工与固定费用。生成消耗包含收费失败与重试。"))),
      h("details", { style: { marginTop: 20, fontSize: 14, color: c.sub } },
        h("summary", { style: { cursor: "pointer" } }, "数据从哪里来、怎样统计"),
        h("div", { style: { display: "grid", gap: 12, marginTop: 16 } }, ...report.dictionary.map((row) => h("p", { key: row[0], style: meta }, h("span", { style: { color: c.text, fontWeight: 500 } }, `${row[0]} · `), `${row[1]}。${row[2]} 来源：${row[3]}`))),
        h("p", { style: { ...meta, marginTop: 12 } }, "统一统计截止时间待填写。人数按同一窗口去重；保存需设备或回访确认，下载点击另记。未知不是0。")));

    const reviewText = example ? [report.reviewExample.result, report.reviewExample.gap, report.reviewExample.next] : ["完成作品与付费结果 —；愿意发布、再次使用 —", "主要流失环节 —；失败原因 —；收支差额 —", "优先动作 —；负责人 —；复测范围与预算 —；下一次观察指标 —"];
    const review = h("section", { "data-section": "review" },
      sectionTitle("04", "这次验证了什么，下一轮怎么做", example ? "示例复盘，非实际结论" : "待真实结果填写"),
      h("p", { "data-review-summary": true, style: { margin: "0 0 24px", fontSize: compact ? 20 : 22, lineHeight: 1.7, color: c.text } }, example ? report.reviewExample.summary : "本轮结论：待真实用户与收支数据填写"),
      h("div", { style: { display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(3,minmax(0,1fr))", gap: 24 } },
        ...["验证结果", "主要问题", "下一轮动作"].map((title, index) => h("article", { key: title, style: { borderTop: `1px solid ${c.line}`, paddingTop: 16 } },
          h("h3", { style: { margin: "0 0 12px", fontSize: 18, fontWeight: 500 } }, title), h("p", { style: text }, reviewText[index])))),
      h("p", { style: { ...meta, marginTop: 24 } }, "公开分发模板不附团队成果，页面稿、成片效果、网站可用和商业结果需分别填写与验收。"));

    return h("div", { ref: root, style: { width: "100%", minWidth: 0, overflowY: "auto", padding: compact ? 20 : 32, color: c.text, fontFamily: "inherit", boxSizing: "border-box" } },
      h("div", { style: { display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24 } },
        h("div", null, h("h1", { style: { margin: 0, fontSize: compact ? 28 : 32, fontWeight: 500, lineHeight: 1.3 } }, "15号成果报告"), h("p", { style: { ...meta, marginTop: 8 } }, "内容方向、手机体验、测试结果与复盘")),
        h("button", { type: "button", "data-mode-toggle": true, "aria-pressed": example, onClick: () => setExample(!example), style: { ...button, background: example ? c.inverse : c.paper, color: example ? c.inverseText : c.text } }, example ? "示例预演 · 切回留空" : "查看示例数据")),
      h("p", { role: "status", "aria-live": "polite", "data-mode-status": true, style: { ...meta, borderLeft: `2px solid ${example ? c.warning : c.line}`, paddingLeft: 12, marginBottom: 32, color: example ? c.warning : c.sub } }, example ? "示例预演：以下数字与复盘均为模拟；公开包不附样片和手机页面。" : "交付视图：缺失的用户数据、账务和复盘结论留空"),
      h("div", { style: { display: "flex", flexDirection: "column", gap: 44 } }, templates, journey, results, review),
      h("details", { style: { marginTop: 36, paddingTop: 20, borderTop: `1px solid ${c.line}`, color: c.sub, fontSize: 14 } },
        h("summary", { style: { cursor: "pointer" } }, "来源与视觉参考"),
        h("div", { style: { display: "grid", gap: 12, marginTop: 16 } },
                              link("手机页面原工作", "buzz://message?channel=507c2186-9889-44e0-b6a9-189ff96a98cc&id=3766239581703c375a51a34d6a91196ce85656076ca187b157c47cd9e4e67224"),
          h("p", { style: meta }, "视觉方向从已收藏的ChatGPT重设计、Flow AI工具界面、支付卡片归纳，尚非已获确认的个人风格规范。"),
                                        h("p", { style: { ...meta, fontSize: 13 } }, "界面方法参考 Damir Sokolovsky / Unslop，CC BY 4.0；潘涛 Studio 制作"),
          link("Unslop · CC BY 4.0", "https://github.com/heydamir/unslop"))));
  }

  ctx.pages.register({
    id: "report",
    title: "15号成果报告",
    primary: true,
    layout: "document",
    component: ReportPage,
  });
}

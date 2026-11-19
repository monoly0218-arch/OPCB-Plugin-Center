// src/sixlab-portfolio/plugin.mjs
var pluginId = "opcb.sixlab-portfolio";
var inject = ["react", "pages", "browser"];
var title = "sixlab 作品集";
var url = "https://staging.paolab.cn/sixlab-portfolio/";
function apply(ctx, icon) {
  const h = ctx.react.createElement;
  const View = ctx.browser.View;
  function Page() {
    if (!ctx.browser.available) {
      return h(
        "section",
        { style: { padding: "24px" } },
        h("h1", null, title),
        h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, "打开线上作品集 ↗")
      );
    }
    return h(
      "section",
      { style: { height: "100%", minHeight: 0, display: "flex", flexDirection: "column" } },
      h(View, { url, label: title })
    );
  }
  ctx.pages.register({
    id: "portfolio",
    title,
    component: Page,
    primary: true,
    placement: "sidebar",
    layout: "workspace",
    icon
  });
}

// <stdin>
function apply2(ctx) {
  apply(ctx, "data:image/png;base64,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");
}
export {
  apply2 as apply,
  inject,
  pluginId
};

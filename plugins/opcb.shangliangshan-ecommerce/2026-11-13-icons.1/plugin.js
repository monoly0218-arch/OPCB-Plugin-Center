// src/plugin-icons/bases/opcb.shangliangshan-ecommerce/plugin.js
var inject = ["react", "pages", "browser", "relay", "conversation"];
function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const title = "上粮山电商看板";
  const column = {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0
  };
  const row = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "var(--space-2)",
    minWidth: 0
  };
  const inset = { padding: "var(--space-panel-inset)" };
  const button = (label, onClick, props = {}) => h("button", { type: "button", onClick, ...props }, label);
  function eligible(c, session, choices) {
    return c.channelType === "solo" && c.private === true && c.creator === session.viewer && !c.archived && !c.readOnly && !c.cached && !c.pending && !c.metadataPending && c.members?.length === 2 && c.members.includes(session.viewer) && choices.selectable.some(
      (a) => a.pubkey !== session.viewer && c.members.includes(a.pubkey)
    );
  }
  function Messages({ connection, channel }) {
    const session = connection.session;
    const subscribe = React.useCallback(
      (n) => session.channels.subscribeWindow(channel.id, n),
      [session, channel.id]
    );
    const snapshot = React.useCallback(
      () => session.channels.window(channel.id),
      [session, channel.id]
    );
    const messages = React.useSyncExternalStore(subscribe, snapshot, snapshot);
    const scroll = React.useRef(null), follow = React.useRef(true);
    React.useEffect(
      () => session.channels.ensure(channel.id),
      [session, channel.id]
    );
    React.useEffect(() => {
      if (follow.current && scroll.current)
        scroll.current.scrollTop = scroll.current.scrollHeight;
    }, [messages.rows]);
    return h(ctx.conversation.ui.Conversation, {
      session,
      scope: connection.scope,
      channelId: channel.id,
      channelName: channel.name,
      children: (interactions) => h(
        React.Fragment,
        null,
        h(
          "div",
          {
            ref: scroll,
            role: "region",
            "aria-label": "助手消息",
            style: { flex: 1, minHeight: 0, overflow: "auto" },
            onScroll: (e) => {
              const v = e.currentTarget;
              follow.current = v.scrollHeight - v.scrollTop - v.clientHeight < 80;
            }
          },
          messages.hasMore && button(
            messages.loadingOlder ? "正在读取…" : "读取更早消息",
            () => {
              follow.current = false;
              session.channels.loadOlder(channel.id);
            },
            {
              disabled: messages.loadingOlder || messages.status !== "ready"
            }
          ),
          messages.error && h("p", { role: "alert", style: inset }, messages.error),
          messages.status === "loading" && h("p", { role: "status", style: inset }, "正在读取对话…"),
          messages.status === "ready" && !messages.rows.length && h("p", { style: inset }, "在此讨论当前工作"),
          messages.rows.map(
            (m) => h(ctx.conversation.ui.Message, {
              key: m.id,
              row: m,
              media: session.media,
              onOpenLink: interactions.onOpenLink,
              day: false,
              retry: session.messages.retry
            })
          )
        ),
        h(ctx.conversation.ui.Composer, {
          session,
          scope: connection.scope,
          channelId: channel.id,
          channelName: channel.name,
          disabled: messages.status !== "ready"
        })
      )
    });
  }
  function Assistant({ connection, context, visible, onChannel }) {
    const session = connection.session;
    const list = React.useSyncExternalStore(
      session.channels.subscribeList,
      session.channels.list,
      session.channels.list
    );
    const choices = React.useSyncExternalStore(
      session.agentChoices.subscribe,
      session.agentChoices.snapshot,
      session.agentChoices.snapshot
    );
    const [selected, select] = React.useState("");
    React.useEffect(() => {
      session.channels.ensureList();
      session.agentChoices.ensure(true, true);
    }, [session]);
    const candidates = list.status === "ready" ? list.channels.filter((c) => eligible(c, session, choices)) : [];
    const channel = candidates.find((c) => c.id === selected);
    React.useEffect(() => {
      if (selected && list.status === "ready" && !choices.pending && !channel)
        select("");
      onChannel?.(channel?.id || "");
      return () => onChannel?.("");
    }, [selected, list.status, choices.pending, channel, onChannel]);
    return h(
      "aside",
      {
        "aria-label": "工作助手",
        style: { ...column, flex: 1, height: "100%" }
      },
      h(
        "div",
        { style: { ...column, ...inset, gap: "var(--space-2)" } },
        h(
          "label",
          null,
          "关联私人对话",
          h(
            "select",
            {
              value: channel?.id || "",
              "aria-label": "关联私人对话",
              style: { width: "100%" },
              onChange: (e) => select(e.target.value)
            },
            h("option", { value: "" }, "选择已有的 Solo"),
            candidates.map(
              (c) => h("option", { key: c.id, value: c.id }, c.name)
            )
          )
        ),
        h(
          "p",
          {
            className: "text-secondary",
            style: { margin: 0, overflowWrap: "anywhere" }
          },
          context
        ),
        !channel && h(
          "p",
          {
            role: "status",
            className: "text-secondary",
            style: { margin: 0 }
          },
          list.status === "loading" || choices.pending ? "正在读取私人对话…" : "选择本人和一个 Agent 的私人 Solo"
        )
      ),
      visible && channel && h(Messages, { key: channel.id, connection, channel })
    );
  }
  function Layout({ connection, children, context, onChannel, actions }) {
    const [chat, showChat] = React.useState(false), [compact, setCompact] = React.useState(false);
    const [width, setWidth] = React.useState(360), root = React.useRef(null);
    React.useEffect(() => {
      const observer = new ResizeObserver(
        ([entry]) => setCompact(entry.contentRect.width < 820)
      );
      if (root.current) observer.observe(root.current);
      return () => observer.disconnect();
    }, []);
    return h(
      "div",
      { ref: root, style: { ...column, height: "100%", overflow: "hidden" } },
      h(
        "header",
        {
          style: {
            ...row,
            flexShrink: 0,
            minHeight: "var(--size-panel-header)",
            padding: "0 var(--space-panel-inset)",
            borderBottom: "1px solid var(--border-standard)"
          }
        },
        h(
          "h1",
          { className: "text-label", style: { margin: 0, flex: 1 } },
          title
        ),
        button(
          h(
            "svg",
            {
              viewBox: "0 0 24 24",
              width: "1rem",
              height: "1rem",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: 2,
              "aria-hidden": true
            },
            h("path", { d: "M4 4h16v16H4zM15 4v16M8 10l2 2-2 2" })
          ),
          () => showChat(!chat),
          {
            "aria-label": chat ? compact ? "查看工作区" : "收起助手" : "打开助手",
            title: chat ? "收起助手" : "打开助手",
            "aria-expanded": chat
          }
        )
      ),
      actions,
      h(
        "div",
        { style: { display: "flex", flex: 1, minHeight: 0, minWidth: 0 } },
        h(
          "div",
          {
            hidden: compact && chat,
            style: {
              ...column,
              ...compact && chat ? { display: "none" } : {},
              flex: 1
            }
          },
          children
        ),
        h(
          "div",
          {
            hidden: !chat,
            style: {
              ...column,
              ...!chat ? { display: "none" } : {},
              width: compact ? "100%" : `min(45%, ${width}px)`,
              flexShrink: 0,
              borderLeft: compact ? void 0 : "1px solid var(--border-standard)"
            }
          },
          !compact && h(
            "label",
            {
              style: {
                ...row,
                padding: "var(--space-2) var(--space-panel-inset)"
              }
            },
            h("span", { className: "text-secondary" }, "助手宽度"),
            h("input", {
              type: "range",
              min: 280,
              max: 520,
              step: 20,
              value: width,
              "aria-label": "助手宽度",
              style: { flex: 1, minWidth: 0 },
              onChange: (e) => setWidth(Number(e.target.value))
            })
          ),
          h(Assistant, { connection, context, visible: chat, onChannel })
        )
      )
    );
  }
  function Workspace({ connection }) {
    const [opened, open] = React.useState(false), [visit, restart] = React.useState(0);
    return h(
      Layout,
      {
        connection,
        context: "保留指定原地址；若显示官网首页，请核对原站登录与路由。助手尚未接入经营数据。"
      },
      opened && ctx.browser.available ? h(
        React.Fragment,
        null,
        h(
          "div",
          {
            style: {
              ...row,
              padding: "var(--space-2) var(--space-panel-inset)",
              flexShrink: 0,
              borderBottom: "1px solid var(--border-standard)"
            }
          },
          button("重新打开原站", () => restart((v) => v + 1)),
          button("返回连接状态", () => open(false)),
          h(
            "span",
            {
              className: "text-secondary",
              style: { flex: "1 1 200px", overflowWrap: "anywhere" }
            },
            "保留指定原地址；若显示官网首页，请核对原站登录与路由。助手尚未接入经营数据。"
          )
        ),
        h(ctx.browser.View, {
          key: visit,
          url: "https://paolab.cn/shangliangshan/",
          label: title
        })
      ) : h(
        "section",
        {
          style: {
            ...inset,
            display: "grid",
            gridAutoRows: "max-content",
            alignContent: "start",
            width: "100%",
            gap: "var(--space-4)",
            overflow: "auto"
          },
          "aria-label": "打开工作区"
        },
        h(
          "h2",
          { className: "text-heading-sm", style: { margin: 0 } },
          "连接电商工作台"
        ),
        h(
          "p",
          { className: "text-secondary", style: { margin: 0 } },
          "页面已融入 Buzz 工作区，经营数据接口尚未接通。原站使用独立登录；右侧助手可讨论工作，不会自动读取网站。"
        ),
        h(
          "section",
          {
            "aria-label": "电商接入状态",
            className: "ui-card",
            style: {
              ...inset,
              borderRadius: "var(--radius-container)",
              maxWidth: "56rem"
            }
          },
          h(
            "h3",
            {
              className: "text-label",
              style: { margin: "0 0 var(--space-4)" }
            },
            "接入状态"
          ),
          h(
            "dl",
            {
              style: {
                display: "grid",
                gridTemplateColumns: "minmax(5rem, 1fr) minmax(0, 4fr)",
                gap: "var(--space-3)",
                margin: 0
              }
            },
            [
              ["原站地址", "https://paolab.cn/shangliangshan/"],
              ["经营数据", "尚未接入，当前没有可展示的经营指标"],
              [
                "页面核对",
                "2026-11-11 浏览该地址时跳转至官网首页；该结果不代表所有登录会话"
              ],
              [
                "对话助手",
                "本人选择私人 Solo 后可使用；网站选择与经营数据尚未联动"
              ]
            ].map(
              ([label, value]) => h(
                React.Fragment,
                { key: label },
                h("dt", { className: "text-secondary" }, label),
                h(
                  "dd",
                  { style: { margin: 0, overflowWrap: "anywhere" } },
                  value
                )
              )
            )
          )
        ),
        ctx.browser.available ? button("进入工作区", () => open(true), {
          style: { justifySelf: "start" }
        }) : h(
          "p",
          { role: "status" },
          "当前设备不支持内嵌网站，请在 macOS 桌面版打开"
        )
      )
    );
  }
  function Page() {
    const connection = React.useSyncExternalStore(
      ctx.relay.subscribe,
      ctx.relay.snapshot,
      ctx.relay.snapshot
    );
    const visit = React.useMemo(
      () => ({}),
      [connection.session, connection.generation, connection.scope]
    );
    const previous = React.useRef(), sequence = React.useRef(0);
    if (previous.current !== visit) {
      previous.current = visit;
      sequence.current++;
    }
    return connection.status === "ready" && !connection.cached && connection.session?.viewer ? h(Workspace, { key: sequence.current, connection }) : h(
      "p",
      { style: inset, role: "status" },
      "连接当前账号的社区后可打开工作区"
    );
  }
  ctx.pages.register({
    icon: "data:image/svg+xml;base64,PHN2ZwogIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICB3aWR0aD0iMjQiCiAgaGVpZ2h0PSIyNCIKICB2aWV3Qm94PSIwIDAgMjQgMjQiCiAgZmlsbD0ibm9uZSIKICBzdHJva2U9IiMyNjM0NDkiCiAgc3Ryb2tlLXdpZHRoPSIxLjgiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCiAgY2xhc3M9Imljb24gaWNvbi10YWJsZXIgaWNvbnMtdGFibGVyLW91dGxpbmUgaWNvbi10YWJsZXItc2hvcHBpbmctY2FydCIKPjxyZWN0IHg9IjAiIHk9IjAiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgcng9IjUiIGZpbGw9IiNmMWY0ZjgiIHN0cm9rZT0ibm9uZSIvPgogIDxwYXRoIHN0cm9rZT0ibm9uZSIgZD0iTTAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIgLz4KICA8cGF0aCBkPSJNNCAxOWEyIDIgMCAxIDAgNCAwYTIgMiAwIDEgMCAtNCAwIiAvPgogIDxwYXRoIGQ9Ik0xNSAxOWEyIDIgMCAxIDAgNCAwYTIgMiAwIDEgMCAtNCAwIiAvPgogIDxwYXRoIGQ9Ik0xNyAxN2gtMTF2LTE0aC0yIiAvPgogIDxwYXRoIGQ9Ik02IDVsMTQgMWwtMSA3aC0xMyIgLz4KPC9zdmc+",
    id: "ecommerce",
    title,
    primary: true,
    placement: "dock",
    layout: "workspace",
    component: Page
  });
}

// src/plugin-icons/context.mjs
function withPluginIcon(context, icon) {
  const services = /* @__PURE__ */ new Map();
  return new Proxy(context, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if ((key === "pages" || key === "panels") && value) {
      if (!services.has(key)) services.set(key, new Proxy(value, { get(service, name) {
        const method = Reflect.get(service, name, service);
        if (name === "register") return (contribution) => method.call(service, key === "pages" ? { ...contribution, icon } : contribution.launcher ? { ...contribution, launcher: { ...contribution.launcher, icon } } : contribution);
        return typeof method === "function" ? method.bind(service) : method;
      } }));
      return services.get(key);
    }
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

// <stdin>
function apply2(ctx) {
  return apply(withPluginIcon(ctx, "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAG1hSURBVHgB7b0L1G3ZVRY4597nnP9x761765FKQR7kQSABDA1qHA5bJGoL4uiGMGJAaVGgEZFE0NYWn327ReyBSrBDsAFt0z1A24oOlaFhCEpAQBQQNJGQ94tUJZWqulX38T/POXv2eq+55lprn/3//751X3vee/6993rvteb85lzPDTDRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE93ehDDRqehbf/Rd918/br9gic2rVtC8dEX4IiJ4PmFziQAuEcIOqtptAA/V5Vn9axv4NCL9xlaLH5mvjt977hy8+61f/aqnYaKJbhFNADCQ/sTb3veCa7T+3UfQ/K5jan6H+r3ikLBdKklfKf9O/cj80Fw1oa5e+x8cGECrrgoIYK6uW0jdvKEPLRB+fqvpfuZ8Cz/1Q294+cdhoomeI5oAoIf+xKPve8H+Ef7hgzV+zd4av+hGh82hku6l+nUUBV1LdwNW4BHjtfHSH8K5PwghbqPDIRlA2GmgW+D63TstPboL+A/f9ode+lGYaKKbSBMACLp8+XLz6c/+mt97A+Z/8sYKv+KZFcxvrAGOjdDrEEavK6FV2lzd2avGAOuOrko5EFgHF5c/o7UcovVAxn+mAGG76VY7SD9xnrq/+4qve+k7LiN2MNFEI9MEAI4uv/Ods6efePHXKKH/zqdX+AVXlh3sKcFfOrFrncD7K0Iq8OTAwT4Asw7cxUk+Nlbr6+emsUCCDgyMZeBAYU0aDAhm6ulcs37fDq6/h2aHP/L2N3z+MUw00Ug0AYASuf/5n3z0K68u4bufPIJXPXlsBX/tBHqmf2h/2qRHLdze/Hf3QdpdHOLJY35P6CwEtIDQKkTQ4wKNus5aNAChw6piqB+Zf40GAuw+qMDgL/+jr33Jo6jRYaKJzkj3NAD85X/x4c+9etR+/xNH8HsfP1jDtXWnBN8KehB825O3UqsFvkOn7VXlMeE3QAAcC/Qdq16MQwBhDIBpfjAAYAcINQgsWgsG2KBJyw40dsr66NT0wupnz7erb/vRN7z83TDRRGegexIALj/6a4uDrQv/y1MH8Jc+vrfefkppfd3H1+b8XP+UWjb9e63NOyv0tpOOwbzX4wGdutNaemWuZMx226enOBPgxgYal17oSng3DgLuZ6yC1gLB1qwxYNCqHyG4fDoFTKvjXVj9rfOP0F9722tfeggTTXQKuucA4K/9+GOfe/UQfuSjN1a/5RP7K9ADfFqjz5TULVADgDH0g+CTE3x91cJ3rH5L9XBkxLzbJ+repTzfo0J8WMntY0r0P62m9q4qCDlQIwg6je1l01wEbJ/XdfDCDpqXqAQ/X6n7V6uczuv89G/GBxOZRdAowZ+r3/bcgsHMAcFSFbCjNWzD6t2XGvi6t73hRZM1MNGJ6Z4CgO/68cdf96k9etsHri3ve+JoDUrxG4280MKvJM4Y+0roO2bqa62uhf5QCbwSuiMV4GcbWP/kFi5/Bp6FX33P5dMNyv3mH/zl+d7hpVcfEXypyuK/A2p/V9u021vYGCukdUCgrQFrESgAUCCwM28UGDRmvMBaIApSutXeheb4W37kD77kR2GiiU5A9wYAqA765Xc88Z2P762/671Xj5oraiJfC7kRfLQaWPfnlYa2pr2614Kvhf6gUyKG3a803fqHH1qs3/6Lb7w5K/f+mzd/5NKNZvX6ddd+MzXtb1WAhAs3DqGFHd0g4XwGBgR2F60ChMaAhAaBrlvROTr+7le85//+q2oqc5oynGgQ3fUAoKf38OBVP/CRa6tvft+1Y7i6ImPia02rfy01RvC1ttdXPdh2oMzrA1CST+t/vkv05l/70y//9wDP3aj753/f+37rAc7+TEft6+fYzkzXxAGB/unxAS385xcNnNtqTbdgpV5g3a1gi45+9HPp2jdenqYLJxpAdzUAPPprtHjPx5780fc/e/z6D1w/MtN72tDfdsLvtf5amfu6f3+ohGhf2wDd8b9atKu/+N43veqW9qt/01s+8sqDjr5rhe1Xa4tgS5W9bez6Ad0lWMwQzisAuKB+i1ljuwRqXGDeHb/j+d369W9+w4sOYKKJeuiuBYAf/GWaP/H0k//4PU8dve6D149hTwn6zAn/Alsj/OvOzvcfW8GHVbf80KxZven9b/rcH4fbiD7vLR/83UfQfr+yCF6lQWBh1g1Ya8CCQAP3bc1ge9HY9QPKeGnXhz8xf/D4K6cZgon6qIG7kC5fpubJK0///fc+ffy6D1xfKuG38/k7jeo3N1b4V51d068F/xqsFRYcfe/929uvvt2EX9N73vTZP/Wip+GLt/H4rx/jaqm7KMeqxCuFXkeqS3PtqINnD1dwqEY19UDmop0Bzbd/X/fM4h/qLhBMNFGF7koL4P/4yU//jV+/svrO9zx7aKb59EDajtL6esBPz6EtjfBbk/8IVp9edMuv+/U/9Tn/Bu4A+ry3fui/PV61/58aKHyBHiScN3ZqUE8VnlOWwP07MzinBgj19KEeE5itj77/H7zuM94EE01UoLsOAP72Tz3z9e9/5vBt/+XpQ9QDfno6bVcJ/5b66YE+LfzW5Cc1cLZ814X26Cv/87e+6qNwB9EX/f33fubeweKfr2imZwsUCOhVg40BgQsaBHbncEGBgLbv1uslLOjwjX/vq17wVphoIkF3VRfgLT/37G/5xPXj/+s9z1jhb5zm12a/HvvXJv+RuttDvWJv+ZOX5le+5E4Tfk2/+k2vfHz74Pprt3H1Y8fYGUBbqdHMpeoS3FDdgKsHK9hfru3Kxtkclrj15m/5F49/CUw0kaC7xgL4wZ+8cvETS/qV//jEjZc9drg2Aq+Ff7cx6+uMcBwq132ztG/1z16+Wv2hH/9TrziCO5i+9J00e+o9H3nbAc2+buYGB7UlsKUGBi9tz+CB3RnsLmZmBnO9Onzs/OzZL3rLV7ziSZhoIkd3jQXwDNL3/vqVg5d96kgvi7Hz/NuN3birB/yOFNQdmF11y381e2j/a+904df006/F1UNPfuyP7eLq0bWxBDpjCRybgcE1XFUDg8crOzA4m2294GB5YeoGTJTQXQEA3//vnv09H7u2/IaP7S+VENjNPDvNzKzv15t17FJe3SVY/ccX713/mvfcRYtkfvrya1cvXK+/fgfXP63tnmWnf2pOQwm+nh24cbxSg4FqLERbQvPt13/Ljz32lTDRRI7ueAD4Pz9AW08drL//A1ePcM+t7dfTfYumMTvzdP/40CzxX338/BZ81U/8uS/cg7uMtDWz0x2+fhvXH1iZwU37O1QgcFV1h/aP13bDUzPDrtn6O3/2X3/qHEw0EdwFAECPXf329z9z9Eq9pVf3+7eU4OufXiS/VC7a9F/j+lBpyNf/0je89FNwl5Leo3Bx1rxuu+luaEvADAoqzb+37Ex34GjZme5Q0y4+6/oxfCdMNBHc4QDwg7987aHH99Z/4eN7SzgiMOvldb+/VQCwcrv4luZ8vfV3/uc//vJfgrucfv6Pf9avXWrp22cNmTMK7MxAB9eVBRC6Aq2aEcH5n3nTOz7xQpjonqc7GgD29+HPfejqwaWriskbvb7fmf56nF9r/2PUoLD+2a/6xEveAvcI/dw3f9Y/uK/pflzvEuzIHlJypGZANAgc6kUQaoyknS92l93WX4SJ7nm6YwFAa/9PXj/+Vn2U18ppf236twoIVk74Cbvj87j8k5cv30Mn6iLSudnxG3cb2l+jPbxEDwruL/WA4NpYBKgXRTXNN/zpf/vUC2Cie5ruWAA4PIRv/si1owvXO6v9tebXy2I7zfRgLYAtXL/133/TZ/9XuMfo337j53z4Plz/zQXa48lWxgpQALD0VoDCiXaxfbC/eiNMdE/THQkA79QLYPZX3/IpNc+9JrtXXgOA3iGnp/10v7/F7srzuva74B6l5x3v/60LLX1SS7vu+6/U72DVmRWCKweaXTP7psvvpG2Y6J6lOxIAPrC7/+WfuH78Wdfd4R5a8y8auxV26U7Q3Ybu7/zr/+lFV+Aepbd/2+ffuIDr79lu7AnF5mizte0K6IVCpubaxfM+vf/E62Cie5buSAB45mD9DY/vL42p78/00yP/5oRe/e096G5cOt98P9zjdN+F/b93oYUr+hMCa4pWwMFqDV2nPzyiZ0vab4SJ7lm64wDgn/0qXXpq//grnnWf7Jk11gLQo97+eO5FS//wX7/h3tX+nt7+BmUFNPQPFsYK6KwVoMz/g2XnBgP1CcPtl77xX3z8M2Gie5LuOAB46njv9z9+Y7l92JHpx+plv/PWmv8aAPQJ3vcB/TBMZGi3Xf3w+dZ+pqBzS4X1CsHjtT0YlZp2tmoWfwAmuifpjgOAZw/XX/b00cqY+20Y/AMz+t+ZT253//Unv/5F/wkmMvT2P/Ky96nBwF/QZwb4dQF6LEBvEtLdAH3c8AqbL4eJ7km6owCAiPD68fpLr6/ssl+931+b//rqv7A7h+7tz+UJvncCqW7A23fcYGBn1gWAAQE9O6D3g6vOwJf8wUcfbWGie47uKAB4+3sOX/Ts0frFh50d/Tdf02nsBzQ0AOjBrvsaegdMlNB9s/YdF+YNoVsXYK0AOyioa7KD9qEX3vc7XwkT3XN0RwHAjX16zdMHK9TTfPqbeubjnY37pLZZ9ts9s/eZH/4vMFFCP/Q1L/jAuYYe0/UVPnHm1gbYb5g2cOMIfxtMdM/RHQUA14+6L762XBtt3xjht90A8/k+9U/ZsP/hp1/72hVMlJD+lPhOCz8/N61tuwErBwD6XlsBqwa+CCa65+iOAoD95fI37a/sl3e14Lfuazn+q7pzoF+EiYq03dIvbTf2w6Kdmy5dOgDQpKr1C2Cie47uKAA4WuPLjzrT2zcFN9/N85/UVpftBibzv0I7Lb5rt7WfKrefQbNLhNfmM+fmc8SvgInuObpjAODRR6k9Wq9frE/2RTcD0Jgv6NpzTVs1AHgO6QMwUZG26ej9GgAadwyshlEt/KS7AKZLAM+//M6PTPsC7jG6cyyAlz1z/mhFO9pkNfoK3Mcy0Rz+o/v/3cP3nfs4TFSkC+uDT6pxgGNdXwS2G6Xr0o8DKjCYXb1x4UGY6J6iOwcA5jsPHK27xiwAdkLfuB+a9QBw+ODvf+AGTFSky3/w85YzhKumC+B/xH6qDo9Wh8+Die4pumMAYEXtJX2yjVkABNb0R4cExiJo4OplvIcO/jgpqZkA1QO4EhrcmP62K6BJjwMcY3MBJrqn6I4BgKOjw/P6ZBu/xE8X3E8AGBzo6BpM1Ettg9f8GICfOjVjAO55hTCdFnyP0R0DAAddt7XsnL3qCFlXABu86477HpuU1XSI7GNQFK5mNZAaCFxNg4D3GN0xALDusLVLV8O0vyF7b0yBaQHQBkLCFYqPwRk8JbeXAufTp8TvMbpjAODG8QrN0lVG1vxHPyswbQDaQHbMPwVQ625pSeu76mOxE22mm474l3/xI48cHh//riOC/0ax3/OwaRIz0wxCBcG2bCklWYd5cn39M5ddvmHNM/J8Di//jv/4Gz+SejYilaZwX6AG4uhYEr4reWbkXyfmpr/P17jYXUgxZNfVUqTEI9QSyTrqslJmRVZ/Dq7Q54V4KL8Mi3D+UvOm7/jlx/6H4IM2XrGqQnwEauJYjH8jNUV7ZY70Mejw57Y//8H/NA3Q3p50074O/Ld/5SNfeEjNX72xpv9+bw1zPYKv9/ATy5bcHwLWH2XPxMLjMcBTn0T41LE+0LKF87MZPLi9gK2Fmv8jxVvzNTzwMISFQemb2ckvbSvkZgI5b3S7iDEWBFnB2D3FUoGdlwgpiZuyA5EtS7jHWA9pUCoUhVhYSvL08/tAsv5s+VdPInzsKsFRh7DdtnBxMYeL2y00anrgSNXh7oMr2Nb7hnU9oJ9pcWm4+6TvBZhe3b0Zl2nsas1WpTsHev8Cuu/b+eT9P3z5tTh11W4jGh0ALhM1D//6k//b3pr+/LUVza8dr2Bv1cGhGsG3i04Kg1Ak5qYBwv7+DuwUFR12sP8EwjMrfRLQzADAA9tz2DYAQHCsAODCw3ZqEBHLb+oN4IARcUxBlimJ4j1y1VsnJs0yD/vOVAgPKaCk0s3KQglYEHvu3Dt5t879tFSun1jD0zdQmfoaAGYKAGZwaWemp1DhQAlq+0AHW7uNE35XBwmgYsRKsPsKQlWjBwHbBjrNxi3V1gcStbSGnW79K/e38Ia/8opLH4KJbgsatQvwKFG794FnfuQZmH3ttdUSntWfpFpq4TdLTVONBBEMiOJItFmdBtaM9sJvDvtcgVm7npJXO/okYFT5NIZhG4oMzDKLsUJ+DfRJtDQADMeDF1IPH/V8BIQUsmJphAu60Qyu3Zn+9yAWhN6Wxtch6QE9X3fuqutPb5der33JZXnRuB+bkZQmDqxCNPN9CRC9RYLiPSGGdG3g92ugWbE5058v/+Jr3fIX/soHnvmyv/aK+38VJrrlNCoALD967Xuud/i1Tx8ewzNHS7ihNf+6M1/uMadPoRx+4laAG4l2Vx1eM65er65txiM9A2CHqqMGj7cOLBpmocoerswzsDTUiIr3Nk4QxI2EzuSX8s8m5EWmnXgO4YmDQASDMJdPuVWlD/9Y6ykS9WC+CZKUOy2/BtvO1Rw6ECXyQs+6bSjKbwK4soDvGmHoRuizG2etPsBFt+vseavV8Y/99Y/uveYvveTcJ2GiW0qjAcA/ffzgS57eX37HUwdLeOZwCXrf/oE+dsoJNHq9knQknRiSvTaO+RvyFrdneLTpUBRYH8+nYsxOQDdeVdNPIxDlotwfvixuvkfhhYbb+OwNk/DA0jGanHVJyLnZ/f2unkifkYBhUFINnwTBRqHjvQuCtwCiq08OeR0kJgEk7eo3a83coa2LRp/dCHq5thm/gWbrhcvlkf5e4+tholtKowHAckXf8/T+cfOM0v6m37/2Zj/ZwSS0G3g08/h+pCHCRBdrcfAaEJ120xaAOckmMJr3DaHMX3M+gGBreZ/q/Gz4LqGifeAZnWRI0V2IrxeFyIXy6aZY4iWMdwnQybGzWdyJPnEsQvfDvUVikaZzmer9/g3EjorpBpDt9CR1EwTXhm+Teo3vk0IvpCGE8Pu2mJtPtSNsKZmft2BObzJ4oUBh2c2++rs/uv/b/+JLdn8BJrplNAoA/MvH937zp/bXr7mqzH79Fdr9VWfMTW/2838Nt9sZMwXT1eggCn1XvUllbXerhBktad57k37u9T/zrulrLvqYAUFdywdBkFKe+FMWx8gy2fdLC8IFniXMBxyDiU0ONEJicTTCgUNj7q0wm6NTXVjTDctqDti4Bhjhb8Mei7SZMHEoPPtlmc7PHNeOVvPrnxb+1k0ndvoU53aGx8v1t6rHCQBuIY0CAArNv+La4R7u6U9QuzPn1yQNX7eHH5B3JKM2dKG8KRt9wfRhNTtr87ZBroe4oUpR+wvVLUtSpyF2QwQJ37fvT8dH89BAIUTsL4NIu5B/MBmcVQXowMCaRUSxnOb0X1+LzoJoiYOb7wAgq3/fPmkXINf7AB4yU/B0XYHG9vstmID5mV2bLlTnxoM61LMR8OV61ujytEbgltEoALDq6DUH+suza/3FGXfKjNf+TtjtPYZ7T4GBQv+XD2hZNtPLfxqOEIK0k8mPj/4n4aIpnGr+3Mwvi3oJGLLx9MR6zyEA07SIktS8b3HAkGQcJ7K+jgIQRYBpXBgdRddf69LR9TTDvFTkrKyG9e+Dlqc0bPR3mp91V9B16RySu9OH7CfbcO1mI/SzHdB93sUPXn2pupumBW8RjQIAanrueUbwO3vktN9jbikKeKYxIHixMOgYh4mfY0YLKqlO8uMEZpSaoljmgo1pXokfAIcEKvpHQhCmfCnRzJnEbVqeUAYqLFZi2j3WI6tjDzxOiIObF1ICNj8S85bAF9rNzwCEbDEFJQfu4MuAqRUAjZuKdIIe2gzdtGRnf7pc+9g8HyYAuGU0CgCodjxnRp/9NJP/afL9R6f9bfgcBHxC5iIYGxxT5voyPlkG5ozKRtcZFQ2ELLV+oj4f2pQ+cKyBFH5QJMMTY+9GbLmQv3fCT76rkYEBiTpMyxQPB4nTfxyuiccIXY40jdBL0eloIW+coKMVdofRYUDSWIfU7cJEt4zGmQXoukRYM83kwyXclJqXgUJcz0nCv8DAxPMizrYyfJocX3VXIoJ696D0zMuDPBDLi2tvb0kge4k0LorSQqw7YRUk5SYog0VSUmR3mKbj83VOYUyFWSeh7MjK5Hy4pRDKw7DI88hmqJ3oZtM4ANC4IR4h+NGOBMaRWH6GCBwYVrlxruljFwEWgzmrtDcgJZ6k7yAEAWYAVlseQDIv4tVEIiyGtGXsBAxY9yh0lciq7TDaQTxNyoTUX1Hk74Xcv1sCUgCx3bhEh+5AHIPJrDh5X3qe6DmnkSwAe/Gmd2IK+85fsnAc6lYAeUa0DykjedMfIR195gngTWGsTJCBAVYawIUnGbFAXnBiQJL+mTr18aRQM9OfdSWs8KcWEQKPJ9sEknwoTT4KvAeHMNALSVt6IAuvRqKoMMn/7UDjLQV2jewHkUJ7M+bwDOGnsKK/UBuJKUocT5Ls+E3ov7poN9W85MwMjMkTimKWeFGN7TckSKn0UBhtj0jLQYeDVEwOazkG8CYu2N4j6QrYh8TiwZhawAlK25/PQhZBYaJbQuMMAlbMPArMQ1HLodtCSwwEuKYX6WBmSkbBMj9um4aF688Bbw1UX/a1BwSm6kPWX6aiBqUoVNKThS9rf1ubRJRKsLDQ7JqiWMcct7FQ44n1JgV/otuCRjkBJpt7d1aAvUemvVBo/GgxRCZkCRt+jOZmIeeYXnJNw3DzvUan5kka8ItwxX4yTFpm323iwm+CkohfEmbnTqwdYjr+bwoF5h7TdIPA8ndN6hgZuGAarPgwwH2i55TG6QIkjC7csXxPXrtAOmqMELe2Rme3u4yln95RYq4mDMxCW+8qlIgEmOpL3ADOxL1ceKQjFYIFQRQLhHiXgE//BXXL3oEvzskoXbhjo2P5dZEbBpiM7nsDBECY/j7J/BUnDLgNaPwjwYiZepj7pQOBqYkZwng/Ygk6dwsDDAxQRCUoHghC4sqjSqCIy3MT/chgIIcLmVlJH8pwIQzJ9NIShW2/iXDzuNEdqQwCNol8glQ2U7C4PHYAxA1DHFMA0ilA0RyBB9xVzGi6fQsT3WoadwygdtUkNEW+ZDeKUtplxnJCBLlWcwkPnWPmWbMNduk8eiG8tAv608eCTcGmEqGEf/EdSb47sZyDVo05ZOsYicUjX57YXYiQ5+qNF1QKvk8vmQLMs8Ms//Qx1GMh/kTPLY1jAWBdELjJanasAUBuhmMM45/IbQsmrvE548Vn1gkoMuVGIl7O5LIp2iA/bshYYlOJRYHlhDKyC8c0OwcF75d0AQDyVLGQp6v/EBVDcpibCq7dsXwes8yW8qaZZP/W0zhWmNcc7j5eo6bhT9Y/9eMMEzWnY0CnNhLzn6kS4gOOPi3vz1UOwDDJPgnxQvf9qoQQujtVFGXg5/KywTF/ZyfElFgLLC8OpJCnm9Qppfkl1kSShyiuvCHhF/KAiW4xjTsGQAVtx5aVcgVlnDKtgClXcAbGYnZ5hpypkKfLC4mFlPr00QZ/rm2HUlHTC89SGColwGx2kjY8QWbG87SoUo8+CjckktN/RNIsHBZeZaLbk0Ybh6EeR8NnVOJdTIU/XDFjb6TU5De7Azt9FgGZDScxI5Y9twSyfDa5nca/pmGFlt8oFAjp5ilHCS7k2rdYSuI1jMlVR1+ZHXt2C3eSHy+nyCerU6HRSbxn0g4J4NjDXie6dTTuSkB3DQ28SW6gDzhSjdo2fGTeDlgZ4VcMZL4LoI+c4YtUfFCTii1UsTgYs8RKUbAUIbNrqy8yrCqENZTtE5B5UJ5/rB+uji142o+polvhZ89m0ACqz3DQ1Xeswu6ytIyBjyj2PLh0kZcBEyzS1yZ9LV6axNDQbtO3yG4tjd4FSK7cPfAl67NyE50TQjjswuvBxVyfLr+yx1rpwcIOYWmOCu/gUHHcuZkfL7Aci7wcWC5WdMSqvzSmuQ8W4pSsXxtOiCflRjwk6fFCSxWcxiBeGnPxW4JiGFuHDRwuXWgPAOp51RAc6WO73JldyEx7AA5M8e1sNWNaptBVSIWd20OQ1AlMH3S8xTTaICC7pO4lMMhYwftxExrBj/TrQuoDJrd3WsMwnVtduFYgoE+6XSpuPLc9C3lhyURNBgrlb/ArDnIrZR9WRIaDSzaklSTCyplFjFN4sesAILtLLTZwfnfujlz3INqYLsCh+m1ttfa4NYKsi1Ee4HVFpNxdVoAPQ0m3gCqIPNFzSeOtxfBILwScxE3kASl4uSAGEXUHTD5wcQvaBcKh4sh99dtT7HygtNdDl+aqB8Asiyxz74FpIUrSmr9WP0kBqP2S9CogtKk8VAYtW+XODcOfeCAr2rP5tpUVdf+lBRxjp+oPYF/V3562DlSdPnjf3GrlUIbYYIkRQuUqKJcXeggHQu9EN5NG7QJwI5f0F2aSFo6MG5zDbiDGvGxHH1hr3p5np7BKGQDwyIPbcHBMsFS/7TnCxd0FzNt0S2oyZx26HTSk8Ken08ZPtHzRo5I2PwhUpkFxLESfEOzqeUs9trsz2FXW0sHB2sTXnwa7oH4tq++Qlq9HgvRTADxbj11JXFZ0YldM3Sa69XRzxmDY0lZL8RmTG4BqdwAg2ZwyMyfNgrEEdrYVHOyg++qM0ImOU+U69STtW616BgmAKO/GbcQ5ECBGyTXHqavrTDltqfGSC/dZkx8x/1ZASC6ReDEgiPX3krgUxmar1tlEt4rG2wwEhb4tZ4LAOP4zHixMcpA/xu6EdQjKrAFmMbjPTpUM4nRVoDzGCsor1waBwoZAXGiS8gxLvhSOHx1mS0CZgKVlS4EgnMfnfW2fKu0x8BQohsstKUg2AyXZYaH8VMkDbK1MS4FvPY0CAPxQd6HDwbIsI89IgJVeP0QhZ3+TJ36seDYSjSwPMByL6FfH5cStkjI/DuPQxLqpxE/liYRvVPRC5kS8nq6CSwXZC3lsTmowqV9kuafJJoe2SG9Kkkm0v28CEu8RgpHNd/OBbBPdbBoFAMxIIu/r+WfONP450Ty8a1DSEykIJByHpfCF/ACT02i8lwwKrgzSWuCpU8Gdv5YMz9POZSg9/w9ZaNoUn9J0klv+sihARXbS4xnrQtALoMr9E4DNo4Sw/krC/E8CTHQr6aasA+gd5GHMU9Y94glLbvL8mVy8qnnLrFhUYiLMDXeqJEGVZKny0BduiDjQ0IBCLWfbowt1WqvBxLLBek5ZpPw2efY8Mi0EurV00+o/KIuNnFXWnMnHJqIjFHoJIl0SGquYevTn16oHQqLik3LCGZSZtCl6gg2mDZZRj3cUdkqshWxxFcMXklYGQHKUQ4m4lbhaw0S3kEYdA+CNngh/ybQMQWv7AQQhingsLm7g6gQ1hlIpnQKdWvh5HsLkLj8MT7IGVOUHSLtaInteNI4LHMAlyBMki4cSHBY0WQC3lkaq//zbjrniZ/39zLNkotqbKkgMFuaCcOHA8DebSGRLQ8uyARgyIcUBgbk9gsW282GgBgQia2KR5AZMPBNwTjQWjTQI6D8MwjhBk1Si5PujWHHnkZjIM0CI5AEFy4dVANSPB6eSExYXsvAog6FBSsLQOJUkcveBJdko93kAkusopBXH22pTpRCUx4NkD2uiW0ajWWB9A3/mUE/GQJbHMJHQFDNSQa93FdK4IEN4ZoaKgnWp8oEpiSMcjkrpFBRhdBBEhfA1N6ikm5SD2DOLGOqyopl9XQ6Q3yoIZVYAj1OqbBLvNQn/bUHjjAF0ddPP0GCTW47u5xxMNf0n+6v+6typ0O2o8Gn1mYf39z7ZGsD0FXOTwFcVJaV+Hgz686qBpicsJpAcAiJQq9ydyxOX47IhxwkFbjmNZwG4a7ITD6F37Kym0XO1h8E5JaEbk3glNMiDn4So9x4HgIAtYDrdCMXC5ev8vbVCxVTL2WF++JFPywh3CtZYNWd4k6b1Wu1m+UjCKhGJnbwRJhqVxv80GHsM5nzQHJiotzLzyINDuWDzJcRYF/YqR7Kw1ONdUtMygCy8f/e++PIcxCzjGKUUjqpxe6hSHwFfEHuCp/2n4pgASytpDsqFXuDvJPy3Ad3Eo9m9diupgEhU0s7AlQdl7hvpLIxFWQHivfkRFLcVD4l/q4iG+SVjIJRHrDRV0eSnHn/vdkIom+gm0M3/NgNnMKDCGX2pGRodqepHaRAomcWZcJL06KfNpnz5R1W/vlTpBHnAgPR6kit6sKcamLmrP16NCmlSJc9+wJjOBLqVND4AUPk+NeuFf5ExMdjUfSBgNQlWkwlKOzwU0si9No1rCT8/DNj3S1NN0ytti7G7Jqk3nfS9B8FBCXypHGSTFk/qzAt7LS2Kv+g5qMQT3UQaaTuwXQgUGMK3q+u3h5F4SMd90i50/+x2KY539wNaMVwaio/Y20A1QYQ4Y8CdWJ83fT8slo8KeRug4n1jn4/vX1fKU6oTKrnjMJM6KQsbuJRbf4m1XXrMNyZjAlQqkNT8xQJPXYDbgUYaBGwgU6GGaqP7CPkRM5I5C3EAXD8VkxGnVIsh1AyNYpkEFafT/Fd4SMSvaMVBaQs1229h1N28XcDTDtWa1QMmgNT7eQSxRgP5DQd0gtJ4qLhJC2y+C+ifpx7ALaWRugBxKbDUtjkzIGN6KUye48THORPmzt0yIvFjsYdTydw+uc4iOBvRAH+qxLEmN+9KCGXMIqfWm6jjUns594AJor5JXHkcWbMT3ToazwJwxLUkia6AdSOxPTVnA8536MMUuhHYOwktE8S+LAXdqSwa9Dt7BiH1BVBJ/MvvnK3k5JabSF9mUPQ3XzIm+HL4J3/623/5m74GOtfhUIhlvgrpdUoXvxHZqLugarp41a6N9xV5Nyq5jqjekOy9GpZ0VTMqz8Z4Nj5zc4vFMKwc7F4Wxp9n690be0bbPsLsCcDFf5g99MKfw8+/fAw3gUb6OjDbDMRVEmMQEia7NymJ2ZDJzl2vQZiM86WvwPufkLM+z1+OLqSHcKRF52FlcUrhS/6lsCehUlq+bPHAM15OXvIc6IKpDpVyifoOdYqQHiZC0Z8K7eXbxbdtIkmUvp921l96eBg+/hXnmydNn4CIwnHh5FeUNRDdXCam/fQBkaFw9s2Imz4g88UUxWK0pBpKVRPTxFzY2XOoj4aECuF/yR1lR6GyMETGaGiaw1paW0tXrnxy/e/+yFuaz7j0vfiKtxzBiDQKAKyePYCjJ27A/pUDuHawhhtr3bXTL9kAKjibofo1rTnbv9XwZl7OvWm4cuELtVJgahTCIeBzo+idRTRLQlSDh9uIBls8odpz/7QJUjeMEdE0r9JdLcJi1pgTm/W9EWSj23VdraGlFdwH+wAPPAvt4lmTjAWAznUB3ZVNHUgg8EQlgc/AAPNnrkHcbcpvaT6Y10pIL3IquXQwJIgCABIQAom4PAMFADhTzrPPQNj7bvj08R+mn3/TV+HveMuHYCQaxwI4XsP6aAXrgxUs91dwrAZ2lubNG3OmvxV+ZaCpa9NYd3Bn1oeNQWw3YNA47tlTqesQm6rAxLytnQmSD4ylDRtOsE3STkoGgqWSdLJ4BL27DE9CckSeTpB2CbisNVFIADNISCNjAXjd8WLotJcWfFIAQHOEdWOBoWMAMFMqQnELwMUjpfwOnJVCoXsQXtBVonlXX6HOOIAgbBCXTicAwDQ9r4jSPUD1M+eQWF0xzZwbRZX4cFhIcwgokwaAhU2g0X2k/S9Q5sDP0S9+x+/A13zfh2EEGmUQ0JuY4cHfUi4kWbyiZ6l2sJp3Kd3AS049lcohsdjkkvG7/YqO3ItY1AaQMhH69EoF9LeFeqsRCiUmz0NN0quUjz/VJl5jkTf55+4Z1d7LjQF4oVY9dbBDlebbReYZ3DP6sP7efCDO3/O4/OfciLkl9x0L5/NzebtnG8aGs+DCy0KsfJ3zS+99WukiCJ+WuMp7U6EaAOaqF7ClVPU2wFxdF90jgNf/Gf3a5QWMQKNYAMjgsAR2MRwLUdRezEgyf7CaY/qEVcMq9GO9A1MKUtiD9vcmHFfplMYBKACIc+gDfAmKchsvFuKUNEa2FZin10sbAzCALFsI1JOK9msKIUmkHs1njDGCYLlwxMvB7inNMeRCNWgqEF88AlIlFN4vAXZK3Pq0f/QUKWLNzd9r4d9Rwn9Of83FAkCjwMBYz6tXw+FT36ZCvRnOSON/HZg/J++HlSiY1UVeN5uZlmdJLG1uTaaDWqkmzeb4MY0TfDkjoBBojJYHF2xk+UcHAGFRVhGAIGUozuYBxEiky18ESkDcQ6GslZDinAUWDZh49MRnZTEDXXPgQohFZio8y3osagCIQBPuXQD+wQSErG0TZGf989LZ0ciekbkktYQ8cZZE6Vn1/aHZtQAw01el8Bv7jSxoVR+7O/x2euflt+BrL59pJcVIABBfgCp+1BsT+9VKIQZ/5mlTIXTSjlBgXNO+GJAjjAEI4eeCTSyz4O7zLFgJPh4WC1ZWCAkIUASB4IwCxXg8UQlY8Oqrcr5oqBYGC3d5Oj0e5ucBwDkSh49KacWnlUVVivC+0Us1sJmwlibl758Cg4hS5PEK05hnre233G9hAcGQPkVVdyuWnwX3X/1i9fCLcAYaCQCK23GKppH0Hyz3AL2DXqkSyPfmy7J4oU+6Bz6NClB4ASylmVgCVC57lkaJc6UFQZy97JulVYDlPAdU6pD6xwEuSVouwZIiNsUkqS709IBfSeojU/7sgnvzX46dYE0LEIR6M2tQvEJi94mGIMEMWZq2TEjSo9SYDaTABQWm5JXFQEoDoz+woVs7LaLdtfZf2uvR/m+D2wMAKkwoqMDrqUaUaQ1EBl6vPBoK/0xwhFYNcUptydJP0mT8CQDJQB2y9DITnSCONYhCZp83D2lguTDsUY51yOqM4Jd455kVXXFjs/h1G8jLlNx4DybkncuTvPA7weGfdGcNTFxQycflQmv9iIEnuLqO7YIRsJJ4PD2ehw9ny0YsTnzXwvmUiPE9OEN6qwRdYzgstFcv+J0V9rUL26wZAOh6O3wYzkijjQEERtfXkqTDBnmmGN8yckn3YObCkg/av8SkKUPGcQdp4pswVGBiFkCO7GMhE5TvFq5RE2EBueQgYZZGD/VZFxlPwsmEnxWxHpcYgIpiIPOP9UxA/Ex5LoQODIKgZQLPrwDJxgYumGENQUw7TBm6tkjjuXJz8Mn8MQkbeYhSUAkvX6/txDroWJwwS7B2daF+a40EKwsCNswWnJHGPRKMEgDuD5zVRyrMMQwy3zJxpceFVvpz5DfuAph6m6jQ4FlGm5Ymu4JU9zNQXnV9yfXSBsCQ9VSrZS685cKk7SbbgNJgTh4oFzwS91yzy9Oma1fhZvPiAiyFnarxqScfhAgi6fcP4qFt6AMFtE1rOiYE6bPPx4MArw/ZaCNM4o9rAVRdxZVfqoyVUi0Yr0Nuosq65AyOIr5MfwjYSIsiKWiFStq99F6nFno4eUI42B/LccQLVN+lJMecyb1HEH5/eIzU/EJoB4BAzBwLYak3fsmPfDziO1EFipGbDfADSp4rA8P2AUGJE0mUt4fRTkAj7QUQhamUraDwqoN6UjDyYDlDltqLWwcyHYJcoAFKAl6izdK1+R3Kbn3lqRIWAGZQRMgC9UWp1VnCw1ROp8DOED7wzhvJBEDWoF5wqVcz83vq8WPI0J9O7dlre4r5hMFJ6FzAzjgad7e7J2yb54N9SX8svmdyleX01OUf5DkpjbMQCBm6RtceAUD24/51VVLjZSrFhTJgpNZCPWzdL1oQ0tIolXGQ7BUINzwXiSrhahLbk3JflFCHwpNYen0zkrmWJ4hmPgaLIMpqkKx+4Wcyg1nmLl3AsluwEGhQ+r78EWSIjStoaFjD4TOHcPTEEpoZwu4LFjC/sHAY0EKyFiGrHIigwIGx2H5n7wM8959mYy8iuwDxI5QIuWnZP7jH72XbyWW8pfs81V7JEen3hTobjZmu75IOsl4Iil9kCu8s02HKLDCvDytlDyhNTGo+6VeYDrTXstAmQMHLQ+IFgQlaDwgEofduxIGAh7ej9s/++j4cfmxu/Jp5C4ePIVx4xTHsvnhh88ANgls172mD/8lpnL0Apg6YOGDUlBmhaIiB61j7BEEsIA3hSqXYXHUxNhXi81DDwGQY0YbSDKaamaSBtWipbUoifwrAzd0yzC7XXlRoXNi5FhCBi6lAJuWUWA2FNBK3Qj349JiMUSLoEAQ/DNB38depEfputYQbH3sG9j7YQnd0ZEbt2/k5WJx/ERw/+QJYXV1DNrDHf9k7UuW9cQgjD6JRAMBWJ9cGtnRJGWvvQnlapafUrMNM+LjQE/NJnyF7pkG550QDwhR5DMptd1YAiZn42nA/ROi3ycuEFR4LvIoFNxlWKnqgvMuUSK0ts5xloZBWoVClwpTupVsoNLGCsvy5lVETfDeNSaovTuuVAoEj2P/oIdCxnrtfqjrcgnbrfpjvXoKZuh492TJkgfK7JO+JkFgZvK5GYphxBgGlSijpXuwrcao3sOAv3Yt8AGWNs6nbYMNgNXyJcEjYCridvu2GdU2KZeiJUnJOuwB5CYrgLNLCGto6ZrYreh1QOUYnGVbGK16p7L4pHXMfux9USif07wH8xr6AGUb4LSKQ0vbUrWF5dWXn69tWvd+WPTRoeazCK0BYM7BBSvM3bgA5yElO5863yyDgTL2s6uvgojX7FGZmz4Le699Agy3M1CjovLHXpolnASTaCbkdgbEy3HN8lOBSEoJNgAJuGXCPEHHmlfcAgwSrWAgS6W3MuOBVi78BH3qzZWEsD2IKWFgI5C7JASEI4UCQmRoAa/WvtYueOvWn08LSKV5Qv1b9UO6Q2lRAfiTRpvA1IAhurpK4kPvViOAPI4lxo/CTfploBaw7YwWAEvBu6VYDmqW8qiuw6mB9pKwCOIam0wt45u5VpeADM4myyoaiyju7/I8DAPNLO7A47GB3aw4XDtcw13VhTmnTAGAPBLGnAkUA4OYpJgKP7n9ksEx3houUukKl9kom1OPfNCohy03Md2jSSdVh1WwqzVr5w0BCGNXEM/VTOgHmisNa1+Rhpa8SlrY7hnOr1igIS6weuCZOtLYPUzFj+LXkl4VDhyGyHdJuALGyWM1vwcG+iwOBzoFF584l9Kv3XPeAQP3aLn2nsG4cOPJC2OyU9EWQFcI53TYLgbCJL8AHAJ02iFcn8CUAMOHFFeTpQCHlFCQgmqWSNbx5X1qkl4teWVrGFVHPwD3MfDMITxLGtSGKd683E5cd+4gRF4J/Ahg4eEYiLSAByGW6XkKrgl5xIy7cMa1E+ANqsWz8z5z54TRxAIMGeHcyIWK/cEijBAGApE6I38i6ul2mASk9Flx4ujaLdpR9b2R+Nmbo6Yd3dfu4dJwALDEMMXMJXWgqlCKeIScaxrVtPDSE0mIjT5lv+hjOtlQuTY1Fzgg2PZt1KAua58fq3fzNVL1IkkXGIQX3wgWxv20fUZQPIRlIJp6hTJJrSJ8JFPPOyiJfIkS1bnylIu/72y6A9UvAwETussxKxSl9FyPcy3UCJBPxD7fJGICnrJxQeXnvRyAGqFEwIxOTELaAjgn/YG/5Sg61hVfe30MT19kFtkvuuZ90k4NjtToTwUI5MsaBcl6loCQCZVpepss+MV49dERk4OU58EOpssC3f6m9alyDMcHinD2Vk6HcjWSaxJIIP8d/2dSd6wJ4RRTcbHpUyTqWQQh/qD+C8n4SWeGnVxGSxvkwiAM9yWQ1gQvo6sWJReCVx8ObR6pVKIiIJTqpqYlQ0tPU81zyK8YX/BQsY5Y3JmWwPyol7JmXeBqQMDpCvXqoBESUxs+FBnqFy/BCoU2yBTXAP6YKUePy8FDIJ5Ea0a59kseAJzzL92RCHCrWX0i8Q0dxNoB3E0CWtVC+StmSOIklICsTRqFxAMB/BUEyJEPR8rbKApGoMsr940UKtVA9rEGH03joOjQ/CteYt2juQZQxqACHekRIl9C68sgwybWQBo9JFT9fTnuDhfZBKG3tLWVHAkz6hL4o/FC4BwZElK9JCNmwqy9zbz0nA5vE4vkAwrZM/D3YMbKbDOCsNE4XoIsfB91MokdMzCRmXZ5y6GgJFDzrRBuLATdX8PGM/iNQvVJjENcG0YrAMg7INqNUZmPANG0zFZgIYnyIgG4Tpd7EfNjKC3Fh49lAuYyp9pdpIgODGIH8AiEA6N3a7Cupbx1M4H13Q9yjkrCxPM4+BjD+58FLxOuHeryTisM0DvWnmwFL+GEZmIj/KpYD16j8B4Vnni7wdLGcbx9R5X4sqpXd+WX8y+MNTVveA4ixFhJyKqwB4gIIPGA930qYUIxCGCoAVWx7ivXhByWDP4nyQvocLDoLasXqJvFQe78kbcaUI0jvaABAPY5ZA2SReF8bRVys6sfQDpTzHGOf4tgEsfxKvCPvZVvJghBvJLHWPGEqkehGgIGCfx9YlcrXRyXOJKy/L8tjE0BwWZE+xQHXAYYQUV2Yk4RcW5TNctzQwDycBwFM+FnGjXM75MYnCeSXRhCoXu6wG7Lo6S4Uy6V/IywEGu3DIEkZJfO6KxXCZ349DJU2VK5ZuaXAhbtUHGD+AD38JLKX17S4WPUvyhlANrzT9/pDKAwwMlDItFxWJhS/xLPIk96N5yX9ZAQfNp1nhzTPWkK9DVP25BOu2ZqBQjQOoKH+Sn1zsulloB/ehZ9bUCuDz4jdAxdwTlh8u+wLpKegkSwANgjIqNpmBGXgLjkR5MKTha2Y2Rslq8Y4dd9yclFwSv6l7nFfsUrAUfpB4RkL6XmFJBk+WkYVpJDUVzGFdLOGq4IE92Aj8KJbQNVycMGyWpsAC0Ifn6ssQK4+hJvsznmjnn+n0F66pFy1tvb+8SqAJi8AS8Td3y5jAFiwRZKX5oUuMkHKJb6PGJo9ROWbRaiCnrIUtEGyGPPXpKoUt5RP5Vc+NB2g5jyU6BRuiWUgwpAPwMy42vhWqS5qaWcZAaRtK/LgQu8TJplOKe0AHVgO4Ec5IS9Tin1YiC54yYfL6lHmzYVaAgulV553bBDIVAi6P7fLUmDiJaEaX2MpYnpiMm8fwnTgtNB2mDyUzKSTUIEx+p7LL1lPt0ZnBIEkiwKvDMpb8HtsC6ExEcp5UC6zmVDzGyNwDlziWVqVugjHbFYS5c98pJ6b3YzR+qwcgd1pdxQDnCfhCl2mOm0w7Yt1W5Yb8+d2GQOwi6D5s/gxt2IdUWGRC3hNgkm4ehmgykCb6azgUUvzZqRboEI9Z/U/NL4hN4Jdids32CgVclhfkMguwUasSsqEIKYMqlHyepeFxSyPTVW0qWeUFSI78WfIoGMN3IY24unopo4BeEpewTFFnXmw5BhvBfKW6pEvQuodVBxVSAsDabcLDQUEr0W5U6X+qjwshApFGryH4ZfQApdtwSw0RPqIxeXXUAJMPIgDS3LdIGpZupVIxUrrA7ABPEPZze00DVizRTBpmLL2h9yT8iCZxqDoJo8EA+bGB8AIQHZx6yPBEP2z9s2e641HJ3CnHve+eCemWkZeU7H2CvXH47JryRqQbeUtAKrFFfGzMkmiTXFkOFci4t0JJvyFRq6WtahUcpDh5bZdduwvY1/L197zdjkPwJMXMH8f7b+eCME/1ejJ7jKvmbAMAj46rycESIAjr0NM+YMnSyIOlYW+NrzD3bHgl6ZT0kMQ+FJ272XaSVgs80qtPPFbFRUhQ8GfPYWX3gngcj8mUMhickXhnYkn7l+y8HZ8JL4KbPKeCi/EFEMsQ4V4OBmpWL6eweAqyXEP2mgonJRG2g6c/khwW9hSTX0CaQPy7dE+CREkITkuFdOPKZDw09SB/45LuU6p4saNxXJzYki7lI7g8X4Gg34QS+qIyjwNhTyze8ZYQm+V03FgE9pXgIUvj9FQ/jN/LA1yf8KhGiiQJMuQlUmMBVS7CEIei+MWlLYiZVq8nFYhRKqJQN6j2c7elOIEhseKcLMySYS9XWYBVtcPYHnlBhw9fQh7B2u4sdJfMEMzGOKPBNOnAs1be0JQdiiIJnZibXpMFEB+yjAm6i+pFxay3JzYp8gyd4A+xYfJcy2dWj6bwo9KeLIARYsVxXvKL4z65lR/5q36zey1ba17p/6t1Nz1ulvCbH0MDe0BPbQEWADIKToONsmVQWEVPKtUaCmK6SXWiH/sEXoejopcwgP0tbYAwAHBzM3t0gWg1Rq64zWsj1ewPlrDSgHAEvyZgASdAgBqyJwNpQGAnw7EuMaklR9djUzeU3eUNnOVTitmz5l43jrCPp2fO2ZnMvi2QRZA3yvhxzWaD2OYr90qPlgHAFiZY7LWtLJHaYEwIQAq0u3VuZgalCAhtX+Ijsk1wAg79SfJGCtpJqAhiyfiA0+3JN00QBNwFKqlczoadTOQf9+KD6T2O9ZCpS5F4R9OJ9cSLO87mjYBImZhCpZuRlTje5Yscg9hZvOgaQIDtH8QaA8Ym1tXymRwFxZFAhIUy86jx5Ak0nQ+FO+zUpDvExVo8BoW/94VADoFjfZdgPJD7sfN8mzwDUbKNPE5iSCXBeP2JCw8y/Jj5ceINqRMPX6V8EPakfq0dTUBNgIvxgJKV+rxT5UVimsaJZSNRBgv196WMAeDNpAdhqgDdWvVI2ZQstHaqRG3AM4OAuNtBhriF5jDnXcjkG+4sA4NOTy921PopcWEG9xPSVwo+opQcEjYsMIIpe82pseiCVO+UDbOO5vemSnv3jA+UWJlOItI6ePBk3dCCGdf6o+Glr8IhtDb5++ls/PsSBaAeVOzfFdTD4D3Gv5UjlIkGq1ybqXgn0SLl+KMVPZofW8Iluc3WNC4m9Gcsl/bswW5mI7XgiWtjX2FEeY/MHOUA1HabaUEiAp5qj9rNQ7mkS1+90LH7czGHZx1kLcr5dZMUrxaDZ9d+2saaQzAvoRH9Vg9JYYpN06/oOOJ/YbRcyn8KK7cvV+jPZd0EhD2fsE/PeE13ibKPepnYmJdtCKkwCa7+5xpbXhPCmmlewCFtCG+SViZCPGjIMkaA/lCSX5Kx6sBcNQfBAna3x2XT/qrQUto57KtHehsXCR082jcLsAwdVB09/grCSsmaP+4yRBheq4ETmpz6XYbEGsXrHjXOl2brQbo70ZwISoILPVmGOuRBtZntoqv9wWwkndp74qa5bihpjShtcfLYxOY1Hw7UAFAs6gnXSktpGAxqNAnonGPBMO8eIk1gMHosdSDzOGRKq9Lm0AA+gt606hkxt/+VC2t07Z9yjSk0DMGUDLU07s8X+IBKPe315K2xzwe9fMdZaDjmTmCdiwPQfLXfiEEVntK06O1AFBdsbWroMh8EuwY2h1nHfSSUBbUozVHoBEBAMNfZM9JMauanjEI5umViKq+t0LopIa/86gu4Gk7DBmBwCzd+n5+283NLYKh7J2e+VgXmlL+GSBQ+kvqJEcIl5UPTLC8trb8b/r+CgDMiT1W+2sAmO3OoWwRFkrl86uy1EgHesMIhOLB12Hm10NZIzJ3rPjlXDIEXW+WkN65wu+pJvy1gCloUBEdElbHalKQnrYDpQyya20qMbQz/9y3zJczaak8SUbxMUSjmIge5FsfL6HbBwifPdPLHxu3DlpZAM1sDe3WDKINjNALc7UKC24jLAOE0SwANghD+TCHCFaJXYpQj4R1LxiQyxkIC787j7JSJwqn/F5UjSwDgNCSULUApHRm5xBQIb1SUiRVDoV/iftGoWdu/Gs/oosRDwbRfzo4unJoPgduLYCZ0v7aAtDxVsYCmF9AiPOATvixXiYeLD7wwOPw3UiDgNEgz9srLWix2Mg6ATXOvGUkhf3WlmeICT6EaEPatbypGgd740ltSn53GCtPXFSTW4FpGKhofShYAT4cy0uAE0QrHpJuQFIAsQjJ/O/sFJ8a5T9+6hjMynoj5woA2pnZ5ERra/4vLs4g/2JqWvSMkt1/N4fvRrUA4p34trwnGqAENlgASU5DzIuNfielW6vxe6vqDBS+O1ip70TvCG0sa4SKzwzgEyuxcmgLxwtpQfS8uAeJZK4/gI6zMAak4cPbvClJIwbUD2tl4a9g+dTaaHgz+NfMbRcA9PSfAgY6hMWlLaiLG1d+HBhKcI+Qt8rpabx1AMCLQ2nDeUI8sQ6V0FLmgZshlLyib186SQn7wtYO6fLtiL0J4YB8uUTHW+IPyT1uXufBmCGxDhJ/x5uUph3chPZPriEMN/n9z478a+1/+Ok9dbttINRq/4XdAKU3PSkAaLfXMD+/DXWtX5IIrL9sCsdnovE3A0HhcAdP5DUGN6mDVyW9zW5DSnWy8M+d4OOgMNKuij5UqMtaqiXQ9G3hp+pq4JzID522huJh2qEUfDTOCz6wUwPPuOafC3zUSlQb1K+WOyozf44BGeEHWsLhY3r+f2ZG/Y32n2lzn5z2P4bthxaQ9v9LQICVF5A0Lm+OtxRYuKR3lS5BMQZ/4g0XbxHG3gvgwz53gu+pznyxDkhc62X1wizDSfNRpt2vU2QKzKoeIj22zUimxQU/Qk8UfJ52zgdJCjXhB2vyyy4GL3uGP5k1QOky4ODZmQG+w6f3oLs+szypuwCzLWf+W+2PeATbD+9CWBhUw2nsq0iq3J+dxhkEFLaXWQglw8CGNGxMGJRf9SEpBQyjWyP4MW9+3eQ+jKg3rxEoE8TctqjxuYwsv4icn/yMQRi9rJIQXJm8sR+YAINLVwJGIlYivdj/Z/n7wT8n/FrA9z98APpEEz3ij+0WNMr8N0ezKT/qjpTpT2oGYDutFansN9LN489xugCYN3EBjIvPwPQV1MJi2T4IfqcCxVsh+FITE+TluXllwk1+lXok6DFIMcROwsuHopJ2QmXllL27MNt7AT/RzkKR+HQoX4hEYd8/JmnxAUSSbg5c9NZeY/o/cQO6G2pwTw/8qV/TbtvRf6P9j4z23/3MHeOXjv4zcyghZLz+3PDmKCcCmb7PTP3mqhLm5jAYi5z6RKCmNceBtSpMq64NotskYV/W1olr/FBBDhQS5mLdCqxpTOmMuYwRpAhcO4SQCnEIsu4bNyc5wMfo7HRiw0E46PDOTVSCD4Dy6w5NC7mDvOVuJfWO0VP7N+YoMH0ikL6PgWcqozV20GqB6dzpUEGICfiGH/I79IroAUE4s/cUFnNcW4AxXWbXR+GGiHYU049ls8Kvtf/6+BD2PqS1/32Kpzsl+DvqXbdtV18JP+jBv50l7Dz/QbCOjDkkvyIvuAcBqrzQuDQKALTndmB2sVOG0Ax2znVmbKSDxgh6q3/6TEDV4HMzSMKOBANMhD8MDrJKMlWBvM8fK7Jv7IG7eTkP06pFvKiAyKj0XORxAsINzoXqDWCRCT4Lo36zRp8HCOanAUAPiq9VA6yVAHVqbrxZz2FnBXbADCAIqNTUpUHATJv7P9JPXKOZjyEwuePAJAjEsBQAw5r+a6Pdb3zwKsDROcuxSus1s12j/bVloP0BDuH8i51b4Om0LouVGwosUZbgZgDBOKcCO7nlQsv97AAJRI0PXOhZXMZV6K0IcIKOIvWiJGOleNyiyGPQhvinIqZWjRVg0AdTTb3JOgEoKotNmr+vOKXnTKhFRKw9C+FPjnNE4M2cduecG7ozJKhiAXDBNWmEz3xBriAHCz8kAp8IfwYCxMLoe236H6lpv+uw/KTW6na1X2O0vxr8w84Iv+7/z88vlfn/UDT/QwVBWoF8dDQwAObyX6rwEWi8Y8Frj/6dCDJgQxJn/TN/Jy9JOsQPsMw4Hk+l2WlAmFNRYDY2ek89gioZF8rPG7yL5K0f/ppUSKNoIRFTmgD59xpc22YWVkUQ01F1tpXH8AcXfv+FX4p1WLAGkjKWhJ67+7Bc0HmQEgjorbxO+ElN6S1v7MGN9x2qkp23XZ1m22p/ffCtEX7d9z+ACy+7YLU/BrRzFcgyzZgYy/dU9zorjbcOwFVc0Stxj43sBYOK8TDlPJFHugtM+IdwQ2pqrNrEyu/WUyIIPe2UhU8c2aWAHr1xqJ6Hk3U3gEfsHhkoUCbsJK48LwL5zhSEOy7swVAX+SIgAq/1g/Arrb4+2oPr/1WZ/qtdJ/wLNeZ1XgGAmucnO/CnLYStBwl2Hr4PjHhxLVYTYixUmkFVGcYhAW1owBPQKBZAbV8St+j822RaxrwTRo3PTALfsNlIs6uHqGgqgsbqiVvYEVAL8bAcP4mLBQcS8SlPPrNqbiVVlA9TzkVrIOBy5V2IqlWYgo8XNvbxEO9OJK0CzEGH0gwybc+BgX0Z2ANAMjMghN/cd7bP70/zWS/34eq7noH1nu73262+zeycGfgz0GUG/o6gWezDxc+xpj/6xT+98/8IKaMKM9/rEc9nSLAJwE9Co34azBBvHCbQ3jkDOwYQ4VEE5OZrEFxfD8w9rZecOyVgFGWAyu68WchljIzJkJU16dJAQQggfUVZLwXs6PUT1Vh0p9w7DVcJUOqKZd00gay+TmI/2+fvhY7t1CNvYrvMk3EAJt0SAKAs9MG95kaYAExw70jcd3bEXwl/d7wH1971FKyv7hrhb3S/3wj/rk1mfQha8yPuw32ffQ5mu9vM9IeUeXhDlRqtSJQCwYg0CgDwfgSv90zYOYMA5H1/gmgAyEDE+pkJQzJh7qnQWG9l4a+5leKWwieYB3WiAfewwZ3LWxaW6vGlwcLTSMDXBQ5+VLDafBgXUY4NUKm8DBBCXk7rohdG5h4yB8gEWrqRjMfz82EIEjBJTX5IRvttn19p/kMl/O++Aist/Hqbr/7EV3sO2tl5s+UXzIKfY9Pv336EYPcFl9xWYHceYLHvDwJxfSVCHjYJA1GpjkTjdQGIMYoUFIJMxTHjICUDAqVUWPoEdVXWR9gTV6aRqedhlb6pCEOJBvr7VxqSb02mfELJq4t6CAKGPVYEvxFCxkMSRGEMmpbsXLke6Te7AdxCHZsUbgQAfyXpTi7HIOyQAE9637nz++xCn+Or102fn/Z3VAms8LdK+Jv5BQMGql+g4inNT4cwu3AIF1/5iHUPpj/k11LlJV2ETQw6NMwwGq0LQPwmUTuUBxTaxWoQptrZfby1AcknEj4kKiU2DZtZIYl6wgEvBIKrhtJ4KF1M0tcjF7izZMmqMUmKyvkm90QxCWRKgPL6TwUQ1HTaAdDDxwDmLL0W7ABdE8J3pqvl0SRab8gBhpefVQjPK3glgk8RiDrf37dTefufeAYOPqj69etzJr1G9/m18M8uQKOE3JzzZwb9DqHZuQH3v/ohBQx2F2CYDi11AwK5RkNRwRsXueGorDXaNCDnCb61lLyaJyibm0HDYG5GYuSvknVPwSrChPkophjy81Eje+CY9QgnaZVTyypVnoUG7E17iHKBIGtFa4CDOBYy5IPUHHNTJWGkG/Cjh7D/kadh8crz0N6nB9SU8BtroIFwpBdg8u4k7hEkEBAk1kBm9hPwdf1ghN+e3bfaP1DTfMrkf0qX4byJ06jpvKZVo/3trrEE9HcNwS32aRfX4dKr74f5uR27Gag65y8ICfpHhOmE7qejccYAUBYrFbwgzEyoc01CuVASJFPDKNJnwWL4Uv4iGhXiCt4uChL3s3FwUHP0YTpVwvD8YGD4PveQHg2M1FMBQbB8XN6ozDIJGpjHIacgyMgc7DRKw157AA5/6Qo0j+zB4qXKvN7Sh2e603U9GABAcm5gci/KxK/JaD8JAPCCv4JueQwHH39W/ZQ1stLr++dgF7CpqT7V328a3Q1Q5Vi7XX5K+JvFNbj46ouwdb8bD8C44C3R/NlvCPwPROoz0jhjACQ0BUBxGskzoLlmEoeQmLQggSIuEy1ZAylR0TNqjhwgSveBx9EfCGGvXvCHNkFR5hCYBZOH8XVHTNCwgE6BuTGNS5V0oeRXq1NmDaBwk2CKxYRZftwKcDeo5G+hl4pvPQhwtID148/C3ievwOwFC1i8SE23LeZguwONFT7yOaEoQGQcKgwapiZ/5xDDLuvVgn/4+DU4+JjqihwpwSdn8puTfbat2Y/b9uwPY/bro78OoNm6Cpe+8JKa8z8fVvvZJf+YFRGyui3zZ+JUq/Dgj6NgwHjTgAnqpu6lQUseBAueydx/pQ4iQ0j/PvQcgr4im2QUE8eo99xMlv7SQ6ASUSlCIagTSA84QV6gVjDIQBtYPKyEJ4fqmPTXIGp9H8Y/WxkE3N8DbfI38/vURQng8hwsP3YVjn/jaWgfbGH+Gbswu7RjTtilYBEwCQv14Q80EUgTAIASwV9ePYCjT16HoyeUQC+3lJsWfLt/pVFaH5W5r1f5IenBPrJmP+mDP/agPafM/i+8H7YunXej/ej2tmEq+Ag5GAQLoIDaReKaUriNsIxv/EHAhAQnyWF/xjxpncTVgRkQIBbx02uZ1HzoKc9gOk2c01FFLyT+p0oUBGAUeIlEnJpFEICAg7KwSEJvgCCxMpIkSXe9SfW5V7DW/enFzO6nn+nDNLegW+3B6ol9WH7qhvK7CrMH5zC7f0uNE6if6iLYDWII8bNgzkoDjnRR8NdHK1heO4DllUNYPn0E3b6Snk6f07cFdkBZC74y+1Hv6NPmvuqGdAp01mtztJcWfsTrMH/gAC7+pufB7Nx26PPr/QBFoS+S50/cHNZXVOZIUJ5COzmNOgiYKf8wQiML6xquNOIpNRB75vXBNRJVypTeYgl7kqzThComGvXFqfhxIZHXWMA8x1r6Mv5ZqMRfkApyZn1CJXsH0JkFyAGe4nJfPfZ2tFLm/qHS7UdKu85VG80bu7V2rgSw2VUzhIdAx0poHz+E48f2VULXVDjVMTg3M1/awUXr4jTBzKFlp0x7Zd4fq+v+0n6x50Dnq3fr6WW7VtvbzVnuEE/csj9YGItEa32/71+VUoW5CjsvRrjwOY+YsjVuV6vf2GreTxgnuYAPbDCsPqTOI3waYFwLwGl53m/1Ahysv0SzA/C+fzYuwBJHLHi5zUSRMJGv3rJCTethIrcyYiK3hUy4nwyH1FeAglDVXoL6/avgNoT/auYVRHfeplgAtsTcD0kQ+2uVw1pZAIcdwjndrdYdaCWwMFuZAyVQg0G7bU7YIaWRu/WxW3Sj5t6P9AKdtZJRJdighBSWtm8fCuemEw1zbLnCNo6PGrCn9+p5fQUy2tzXJ/oYcNCCDwaZ7LSg1vo3oN29DudfdQF2nn/BLvJhx3shF3ooXH2lDNH41QbhCRKMSSOPAWDymDFzQbujeA7avhDWuNeYk92SAI+wpgBgwyugeHZ5QqbUetKoP5eaUjZryQ0K5cAe/8xQIQbQMhyWgQ4grUesFI4Yf8v2ZMGCJeD5oHO/PcWCF1dqRJ30yLsSSn2Mfqs8Wv05bbKTAa3WuKproACBmpVbqLOyg3JghdVsxeWog97mc6pZz+PbxAAN28/stdNdATQ/0gUy04KqEHioAOgqbL8Q4fwrHobZ9sKa/GaeH+O3PxHYvD+vLOgX+KFAELWddLi9xgAMsZVVljCgvV3YRYFjUiUWB3D4neco3usnwYW5YQ8xbOByYq6xXBlOuPh9Qjik1UpCKP1L931uJ4nXB0JZOMqwOwnILS/uFusrb09b5cgW3qT14UflO3U9uLANh59eKet/ZUbbUWlsM6WmftQoYdRgYK5gP7XVLNxCO+uHelCv8SP77EtAbBORnkHQKw3RrzFwAm+F3iZlC6vNfSX4zTWYP7SC859zARYXd8PS3mDyxwOtUuHfJPBDCE8Q8XbpAnT7h7C+pgZsrh7CoRrU2V8jrJx9pKdT9JFg+jSgeWM3UoRtkgFCHQSghE5gSA7AHBJhzgnLTlQLhmWp75PiEkLUVDBUwnCbGStpBUokL3EO4SvB6xQTQ1nGStkTG8+9A3pzDWPGMyWwixZhqa7mkFxjrK/NiUCrpRK0I9W339uDc6+8CrsvUnzzPjX9/qkjpfgVCHRqDEAPwvm59YasGdNoYddX93KGlXzeHuRdffrX86Z/hw6MnPAHZaWlyAl+ewNmDxzD7st2YeuhB4zVETQ+0/rpSj8qC35wYw1WAodNwLGhBc9K41gAei23Gi2lpf3pgdO1qnj9aaTWdrlUZZK5to2vNC/8jgGRC71nSg4I/MJqCnu49UR00vA3kySSDClbKZxEFBmWmK8YP2HC7rEqzYHSZsEohCauErK1EjYjn1rGlF9HGgA6WCsewZU+GmxlzOrF/TOYv0bxzI01HH/8Gix/4yo0hwoI1mqaDbbdPLvtt5t8PSBAFD7KlpxjbhJZc9TekO4+qNmHZl8NA+zD1meonF64A4tLl+zHPYLQY0Hbe7eC8CfPKd+yyj4BVQJT+HMmGn87sKGCVqm6luMCCDOd3STuNR4fTOMIfskgqIeknhTk89DyYa+bFPdSnOAqkvK8hhvNBJtLbZE1iahWwLS5b8/Vn11QU32fpwb9PreD5VNHsHr8SVg/qXwO9UIcPTWnB/TUiP3aH7PVpILGQCmO0Hbsp/v2ajCxUdp+6xDmDxIsHpnD1vMumpF9+1FPd76/FvAmCrqf4/eGByQWANfwrG2T+9PwGVbu3eMIuwJvAgBg7FcKor44g10lWxcyKJnKN5mo5IBS2E+i0cclOoE/nrCIIbh75+SZhUlUgBEwMKdGN42d17d98c4UYPH8GSwe7sx03PqGmsq7chW6Z5QVcQ3tHP5adRHUyL0ZvQe+XNiZHHqZIWoLQ2n6Ro3m76xhdp9i+EsKaC4tYH7xgsKdOdiDOzDO6TPDtCT8iZHqQcC/VIarCMk0CQeB3vrFtAJxU/jT00gAwI49ZhoAKxpGUs29xocb+VOafpAUL6LnGStVineSPx/PYMPjfP9ANf5J8xuRTtRGrCFqQxPlaGgX9zoLQH9JR3cZyE0loF8mqA/mUAI0u6i6CHqj0EvsYB8pUOgO1CzA0RHQ8b76kTmv08TVzarGHnCh0p/rZcbqt7Njj60PH+9sotCDF25Mh6XCvWs37w5c+FnleIH1oI+sVjziAfQqdV5DUbu7mpQrLEei0S2A4ll9huL6+axunD9LJEXR4DakBrBWMHaPuVuJe7HwzACdkJWrFsc7UryEbKhQ9FrvIMkvhsPCq2RlgX7wKBZZSLR5lFJeSB+llyt0gr9OYMwq2satpNOQ4Afp/OCdUaAEwHcWaTlQg4F6663lI8p4KJxCDa4fD+lyXevFlu8ClIUf8vuQTbinQgAQz4UG2URYC0+V+9PRKAAQFmEwqu2Uk69E7GajfCegcYLKrOYu0t7kllgWTrNnUg29efQJYtWDKleAZNFVlgYPxzPGYdluJAEIabIY84U0ayPuXtBaJ4SNDWyCdy6kO2nGy348FyCWOOlmhytCoq0TQIiylQk5j1O459eYmRR6XhKIqFkBzlTRDQGKWkKno3G+DFQoB2uiMlOKSKUFPlgDwOp7n71CNtPZGuDsmH3KhIttkAbBUhys+A3IjvNA5HN/FLztAjRupD2O2iOklpY4EIR1i8PoJAjhB0i65slzHwAAFLV90QLgVKqckw6kJAkJM+8m0kgWQFySxOsot3ArSMEbnKWS8imy/CAD1c00PjjcjCbalOaoeYq672NZ2XXL/IuAjd5qj89g+cAOAFrpatyBEmGPf8fKZX6pGYFe8AmTVHlXI2ps514CAOeAzjRLxvO4loeC8CdX8fLSXKgBR0LSRmIFSPr/rLFGoJHGAHwXAHN5ln3khDYLJVZccWDIcSnN42YI6ljCPTh/rlFr/tgfP7eCcWOh/MIvu5vWdOyjwDeQgpPo+iS7Pin9bFwmn8jc0XEoyuccDCCJLxMVV665B41T9ZEXcIr3tYoYgcbpAojnmgFD1Rg+AKZeBMXB+lwT4QlKN5TO1pDjNdHp0j0V+JySf6PuSi035ygIwX8bMowDNMDMOsf84itBYfxHdEvk4HgZAPizsxcwChc6horgQAkYFNmsdt/n1ksSRRHOyoND6CYtBLJUKn6yTMRZB9iTQl9X6rQMeyfQaS2I01LvLJPsInirLjFbU+JaOTYUpv5m8A+DkkMv7N5i5Mm7Z/T5emsAU+s4anZRFqxbBYErvUUAHiCAhSm+nLg/DTPKluYMT5BWxPg0zhhA9pDZSOCFuVxHmMbHzfkFdqJCUoFxsByxl24PRJG8fzOoKMK1OkraDpOAxeBcgzc2fGoBRu2LyNxkofwYQHDX6wQcWjheQ9aP6RP8klsAosSPFQJZQWqCnzwLJscB4UuUzBELLhiRIUZcCOTpBALkeWSTJk+OqO1fXpSNlxTTY1FDfwVLycXwKK6yCLK9eLza/UCw602rVk6A4WnLImXpFxKSn3CDCiBnqcR6DlNs/lRZrMTnBXP5BhAAymVLdBP41dyn7MT8vSVAaXnlPoOqMJc8B1DvQIMtV3J/iixqNOJ5AJiVMzEGinFK/jhIMGqEhbssT3lPWPYvxaMeP/mMlfw2pVch/lk4fl8tiwQCWa+Fek4tgQK4FsJTFdAiQvBZPnvB+BdlH6NWvFSz8sFADDGcXx6jIPCpO7KXwJKgcWsAahn0PBfdaoxOySU6IyQHZ5yRRhwDSE0UGqJ+epkRy3GA8+YYlTBORRbpBMLNSeJGKbkTJX3aiK5NsMe/z3AqRqEgXsz8xiKylI4wLwECis5FvI81OQQIYsbexwMKbxGGdmdmHWRJEvSjCUF2zNIINCIAcCQua+KaORuEueie9zZRplEpy9Ay32ri7FUT/pOmM5hKXZeCf/F7DiIYFuOyBmVTdmacjy3DTQb//EwA1hOPMuo1dsiQcQnT5jyevMea6MmXPqvwI3tP2qDwREuOdAiopBEOFSor8kTYw3fekDEFwsY3cnGR+vwhBec+d3lfeh6LSnmXnqG/eJs9NgfJQbkSJlEwArgpvwd2n7YRSm/GwLE0hgO8G4qCJKtyoLhqzz7HHXx2fT/GAmHFOkBgcWrCLx8YCmHmOVA4qZAmv1biyDAIA+INo3EsgHYOuFhAs9XBrFM/vTNLNzC2agC4MScC+VOBmsJ5SikTRGAIf0O9Y2oNFNqANrC5DQMs/RzfAUqKETf4Ryr5lTR8KZ4sBxSeYYNfLXwt34Sw7hbKJiUmNB2Gw55nqpnnLcJsZjf9aFXT6X9ml5/ihTVCq8/aN6f+OOsAIXxfwO/sS5Quq0wUFZQKLrMIkLde/opYedeyIwnh461ZIyyE3WTuOzdiV/7C1BfvZDQOAMxnDgD0MW1rAwBuwye0qoFbtMeBzTQANPlpihEAEjUAmAh5WmE4rOXgZJV09gq9Iwg3e5dOcpf3vtkS7e1++kgw/2vcbnF79J4+xFPxQqcAYLWyB4JA2jVIzWR/df4FFC4NTFp/NBEwERhiBR+qQV2mtakq3BSXBRyM7lLj05BIJ6aRVgL6DzlCakYiZAOWJOu/BJA+bGgv5JmFdDLHSnJS05docJWKhIds0z51c52ER0svXMt8Q1/BRKGetH13AGFY94yFIaYEvZb21kPQeIVyIZXLkihkyEELk8jcPqRSNmXauMBnQEPlX7+BrHGSx5q7exjKFxtotEHApIoy5sFkADMDQdf42btXwvfknBhZkcViUKqgQjJURLHNSZig4YRbSpUf+Xgin6ypewCPRzBBuvS9UCbIn7uCH6TPG4GI0vy9gBVBDkW68n0IINnKzzE8uCNk5zuKRkCSAgMpILDySDCQAQQ3wCax3lxZMjDlQYozCPJeJFEUJioEOjsKjPZlIH7muz8UBOXBjOJT4SnT+E98Y671XVTwaW4iWcf8SpXySyfu4ISLGMNnYYRbVgSKGjMBC4D8ewjMPQyMQ9TMUiZCNVIZH3xwWRVSsecvAxuPnSPWniGdUl0zPiAuirwSk/rEVFtLfs8xgYV1cUm8TPaWsraYM1WiZHEBcrPW3dc0mowPkDcYl5uAtJQy0Ag08ncBIJ7oApCdYOPLz4IHqlk4mGexGbmpcs+fBbNVNavPUJ55UuEd71Ysgnfn1oUIRILRM9ABUR5k/ICCNzAXdMizBBGlWsfFNhGBzSPfzsssE/Lv09mHZFcfy3lT+2LvMxZuMW4h9s+CEYoWzmBCKJpJ2copqf1OSLIhu1OkIWg0CyBo+IBeEeXJP/swdhK4nFYftzJG4kGxHCz1K6Up0689b5KeAZQIDw0IOCSxvnv2HJw9//XwjbQ6JCCH+FTn4dDmDvSz8RrGK+RtE6q1ZOqGVQbZQEFDs+R9HmGJ8SnSTTLYAKNS8AtBqiTrMHc8FY23GYhSJmGXNEBHzB5FxpQO/UMd2mdyCYQ1BGw9uPeLvCN1ATENiCAMElaNlDUfANdHxO5P1m5pecalejmoGsFXYZKG5FP/xV0UgCWQNRvXEvLLu4UhGa54E38U75W/GSZjBKxMlDv1Ern2DFuPud+gBMqBYj91Y9AhydX9CWBIV3gAjTML0MGhWZBhzLrYSOj+aZOPGnR17REfs3leAMYLlOsD8H6Q+lumThkoFfD+a/99TKkWZiidJs7p0uzXEELeCmMZFIRNWg/yPhh0Hgzcz5/Ev4ao8K3lr9JWSmDW2cRnuEytDahbbVwl5JJfQILay/vBRSr4eWRzt2XaJHyiLLwrUNJAfWUtPwx+3U00DgA0+PTMfHqRgQD4vfxot4P6j7d6kEQHBnzun1VIMipf3C0FiXaXbv7eaP4hvBLcBiBrRRhO1CinacChcfi7FF+nxn0U4mQhSk3geZpfXZOunQWgrxoF7Cf5LCzMlMdC/Zqug13YixFdGYqzDsFNWnkQEWgIIb8R2kcGIqrErZE3jaDKs7UoIVx4ea4RRRoEowi/ppE+Ddb9561582Vb+vt/qmQtkbH0jRjrdT+dW6LpbUq9YixhTnT/I2fF90vDyeava3MUz1Bo6wHC3kccaW4ybcoqwSHswTcQ4Mr8JWCUeC975rIbjTsD+PrDu9b6s+f7k/nIhhJ849jBRdyH+/BJllEUyH4FyQQtPG+gojWR8htuquWScw0lSTiVXqgm/CVFVHzXM/IvjAQASvP/xLl5++e3Zy0sFMrrtV2rzjGZN/X9+U+cyfh676wRoIiiJJ5THE/7+WU6e6XdCqIT+NeURum+6IYSMCA9k6MCAGFs1wMBgf2+R2NBQJuEM7CTxHNlFnzu4n3Kaenyp9gnh1orEZRfckPtDAJoaQ0MSBegIo+MA6VJWmNQ6UabWqzPfTiNAgAf/pLtn37ox/fef2Hefs5Os4brqtWXihM6pvHDC3Jt4W+KjIo9MyW5dqcsfrm++8HhLqcTvHh2RALmICGvXPg9AHRa85sbMACASkHMcQ27dAy/bfHvTKLWYsYEXfzAbFImwGzTUVQaorWF+b653QsKaJNFAFkBXbSC9q6BQIhD9fTI+zOH22kQ8LJq1b/7L6//rxcX7T86N2tgSxXw2H2ynQ8MJdoDmU7HQgMCJaY8lhaBF2HU32Hiwn3SqsbkLgNiuNMBQ3KaoL6Xw9Izpn78KgFAC73pBpD5om+rv/mHut+/hC9U2v8ls3cnjBxblZKS97+Xu08WmZW3hNXbVmjsEskq7Ku3UrhNWp9bNLyeqVA2f82/x3NiGm0h0J/4A+f/8d989OobLs7b1z3bqGkBPdUSFqu4vk0QdnCAwJgTa0a8Z4ZSC1D+xLaM1etbsgFEUC2Aaz6+hINQ4UzTykBBkQV+6GPOTWnBgMJgn7tvp0L4AgiQ/1ykE/5GXY3mb5bwGc2z8FXnfsQghNX+IASk/rJJMLJ/ghuVFEPlvYmnh+X0uaIhAaQlVtyEOnwpKPa8FAFjQiyE8Q5np/H2AigV/dZH6evva6/820tt85pDvfVTNXpYCBY+kcRgrGDjU3YnIBQ5akf/UrxSFZEIXWo1rOeepLKJxmmiIemcMScc4ufyKH+LK//5htf9fqUQZkr4zzfH8AhdhW+4+MPwYPsY8GWPXBvzk6PD+pwME/qQiDw2JOMKQ6msKDZE4FcZNSIUFAzdOvD5lygeBjKwbBto1KXA3/YGvHH5rZ/+PQ+28P8cNfTVekHJUad3gaMx4dFzRegX8KaWVwAoan1InlGIPrJ4NVD2IBKne1HEL+V0u1IPc/dppmJ4KWlS+rAud/zeaf9Gj/grk3+hxoXONUfwsuYJ+GOXfhheOH+vGRfgaw3iRivXdj4rssu56mtrXNsl+oWVV1QPQT4HQoVXzwGfv2ABBCX1WQgl4Zfr5mU6xByMhXAyUKvR6N8FuPxtD99QpXv9t/+NK6/f6db/+9UjeOW+BgHTuvwz4pJr8msZhWs1PkiNDfPxHFkjbh4UG7PnvpBYhSWhxEWlZIMLplYwuhVvaV/EfUJb5IhDq1UAAMrm1GXo9Bd/dJ+/g+1mBQ811+FLdn8WXnvxx2C7ve4CYZoek1d0L2LvpYUQg2fFo5ISQF81AfVDHlJ5ZGCRplXklgRw0rrJEuJ85TP08VFEJkiF/06wACIh/Z2/AG+/fJn+6dWdZ3/n/qr7vauu+aI14YOov9xOHt/1/BDfx2rimu6EIuSCYRsQrebg4QOHyJ67O+0MzTA0hmup4oIfywt82yCh80vknrmfhPJ4pSSw4ofFkMlqRbLr7bTddf/iqc+ewd6Fbn2s3FeqVbp4GJOLEY/aikBk65pc+mmVxfC58Fs3NCP9O+0+PDR/El628354xe67YGd2Ix78wrRsfIfwBuFOvm4iBwlgQKIhI4fEAlorIgpqGGJmiWbpgwSBUAuQSnXBIqBScExNFQkIeSkYCBB7abp9LQBOly+bpV8/434TPcf07rf9lZ+aLz/92vX+49Atn1H98iMHu63iu7n6zcCc3MTkrSTgRXeM7uHXILvXV5W2OQXKp1IgLgdOGxLE48Ckpk+eC0ASgVDm6NLNsy/uUJUKPMnTA1kGYZALvnTzFUelJDAWJrEAiMWRyHc2uqkAMNGtpVmr7PBVyeKBwMThUE2w2tt2EaLtZf39vbcIKMQLIND4GzJX49+4FaCcyP4JZriQHW8lREuvrOlK/F/qJuQgAEagIljQZqFP3EhsY5ahK5oZAfKv/YiSehDwTqVuAEG0Im6nacCJbkNqnFBzIWTqLqzQhCjM4R6ZPkV2gq/zQ8DEGohdAGdRIBOGRAop7+dLEHCRosZ2+zqxT/PL+DyM6DaWrAECdgSdjM/dsGdswL+vF2L2zDcYJThA0L8/G3JMkV9ZOQNNAHBXExN+I5SeCSkVZkwP5fQWbpBj4NofWPfAa3sQPwzAkUlZuFAiGBwIEpFC1p8nSEDBBy4LfXztfjdn9XiHgUAQn1NgqWt6ARYBCCSIOPKLqAjy7gKxQp6RJgC4m8lb4IkQU6KxIfOHVOODAAUODCEcpmn59JPCUGR4B0R2KlB0cWNo4NOzXItLBZq5pbmCFNP0dIdC0XrSzIGApZUIv3+jgnBnVPH3W5aD2c8KOyTZATQBwF1MGDZgee0adZ5XcXFWwPf1cYMVAMERg0UBCTiAT98/MemqzenLa4hGEZSosFGIuAbn8QCSsKkbuu4HMherVYmF7ktTWgCxrL6y+PsTQGksRL4wJz85xq0AH3gCgImGkOqPW9FrfB9as2eXCSuyP3zIQAo/hC4AZ//ap1iY8BeksMS//DgygBIQWIkhlkcqsi6WsywSd5LFQPaXWCrRnQt9Vh6ArPseS4fu68W8TBBfLjVz0nsp9G4TVcyE7PLqzmy5l0U8MU0AcBdT2zbXcLaAdTMz03GwttxlP9qimh5bc+9Fi5vEfPQepcgkpzlJSWMUbHt0OwUxLE7S6QehY4ATjAWoad20XOSlhcsIlM87qLtJaGgizCRHObOIADlSZTl564upe4m6KNx8dL+X2pymoi6N/trO2j2rXzeHrqXrcEaaAOCuJvxgqwCgbRaKj+fqcel4TDe7Fv7WXKOGAijxKoDgW3nP4vArx4dgEDDrAdjio1SIBrwZANPaDXBR7pNVgJqDdYzxG5CGflndlkwcCyDILQBzYWMFPrw0xQIIkBV0/dPC36wsALgjl0kDQLP4MJyRJgC4i0mZiD+DuPVnm3ZHscyWYqaVFTe9CAjUj9xCIOAsLvUn78cCM2UpF3qA0jdAY5AoB2k0lHqTKtq/n7gJHuGhZA/kSt0TufxjiielHEEDRPDuQtgcBwIAWL2amYDOCr8BgM4htBJ+OtetF7s/C2ekCQDuYlrS8U/Mutlj2Oy+AHFb8ZQ+fUdrFa31G/bzFNR05FjDp1ylQ5DasAUfBTawpEDc8z7+IPlCK9R+4C4qW8oSiC5UL0AWFtIBNqDN4Ys+JMAG2Sa+aF7FOorWQDqYitEC0ALv5/z1NwDMdzWVdUHbsMJL/2b3y37gN+CMdBqIm+gOove+7bu/tV1d+YHOLAd+VvHgymj9Bmfm5xf12P+WLeMgIDmz1ZnXwR163BlTceuWg4AMF8z3qDlLjFl0q5ryAak2pmHC0/DwWMwvDVCEH6SsPsJ6DKB0KlVrfm3yNwq0ceXGAHTABazggfVy9sjv3P3qt/4CnJEmC+Aup3ft/uoPfcFTn/dVSOd/H9Gh3Q9gmK9JP0nmtFIqNwjJdFayZ1aYuMJAwIqfdPP5WLPfA0FuRZRM9rLIRn0MfeEJstx7wxfdqBguq0IGlME+wPwaF2eBOUjXnqaE9hPqXauMgZkax70IR80j33t+BOH3ZZ3oLqdfffObLy3oyXfQ6pO/vemuK82/sme0gtgLEBg1zm5LbZ1pchAWgAhf9GeCA5lf+Tlzo1I4OlkaHIKKlkQtDdocNjH/e6wjZHWMHAiUe2MH/ch8fHtuhL9rnv//7mw99o34hrevYQSaAOAeod/43u/dudpd+1u4fupbsLvaNmZGYJ0OQjNhLAlnLwgwh8j4mAh9KV7tOXcT3QQeriK8fekk7lSLw22aWnqVcpbeVQIA2vCZFWD2cJB9Md3nb7aU4N+/t549dPnCH/2uv414tsPm6mWf6K6n937f9726W159I64PvgLg4DPVzABmAg7xJtHkQqi5hjPPgpuwch+euSO59Fl/IaQv5HAT02YCSYV8K0KfzgL0pQt5OUvhEhClHFSZ2W+eG+dnQGDewWz7gzDb/afL3Yd/4MH/8U99AkamCQDuUdIHrvz69/3QI7Pl6vntYj7vDazGoPhoUX/gOul4y4r7+LQcMeVaWsx9tRyljmzEJaxWeLDbXvrkfW/8o0/DRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNdE/R/w+HxT8ExYSjFAAAAABJRU5ErkJggg=="));
}
export {
  apply2 as apply,
  inject
};

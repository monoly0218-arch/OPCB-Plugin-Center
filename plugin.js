export const inject = ["react", "pages", "relay", "host"];
const ORIGIN = "https://shangliangshan.paolab.cn";
const BASE = `${ORIGIN}/opcb-plugins/knowledge/api/desktop/`;
const names = {
  recordings: "OPCB录音卡",
  business: "上粮山经营数据",
  research: "产品调研",
  content: "内容资产",
  haowangshui: "好望水飞书备份",
};

// Personal proof stays in this page lifetime, never storage, URLs or agent tools.
export function createKnowledgeWorkspace(ctx) {
  let connection,
    token = "",
    epoch = 0,
    disposed = false;
  let state = {
    ready: false,
    authenticated: false,
    pending: false,
    error: "",
    catalog: [],
    source: "",
    results: null,
    detail: null,
  };
  const listeners = new Set();
  const publish = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const viewer = (value) => value?.session?.viewer ?? value?.viewer;
  const same = (a, b) =>
    a &&
    b &&
    a.session === b.session &&
    viewer(a) === viewer(b) &&
    a.generation === b.generation &&
    a.scope === b.scope &&
    b.status === "ready" &&
    !b.cached;
  async function post(action, body, proof = token, owner = viewer(connection)) {
    const response = await ctx.host.request({
      url: BASE + action,
      method: "POST",
      timeoutMs: 15000,
      headers: {
        Origin: "tauri://localhost",
        "X-OPCB-Desktop": "1",
        "Content-Type": "application/json",
        ...(proof ? { Authorization: `Bearer ${proof}` } : {}),
      },
      body: JSON.stringify({ viewer: owner, ...body }),
    });
    let value;
    try {
      value = JSON.parse(response.body);
    } catch {
      throw new Error("知识库未返回有效数据，请重试");
    }
    return { status: response.status, value };
  }
  function revoke(proof, owner) {
    if (proof) void post("logout", {}, proof, owner).catch(() => {});
  }
  function clear(next = connection) {
    const old = token,
      owner = viewer(connection);
    token = "";
    epoch++;
    connection = next;
    publish({
      ready:
        next?.status === "ready" &&
        !next.cached &&
        /^[a-f0-9]{64}$/.test(viewer(next) || ""),
      authenticated: false,
      pending: false,
      error: "",
      catalog: [],
      source: "",
      results: null,
      detail: null,
    });
    revoke(old, owner);
  }
  const valid = (version) =>
    !disposed && version === epoch && same(connection, ctx.relay.snapshot());
  async function run(action) {
    if (state.pending || !state.ready || disposed) return;
    const version = epoch;
    publish({ pending: true, error: "" });
    try {
      await action(version);
    } catch (error) {
      if (valid(version))
        publish({ error: error.message || "读取失败，请重试" });
    } finally {
      if (valid(version)) publish({ pending: false });
    }
  }
  async function request(request, version) {
    if (!valid(version) || !token) throw new Error("请重新连接知识库");
    const result = await post("query", { request });
    if (!valid(version)) throw new Error("账号或社区已变化");
    if (result.status === 401) {
      clear();
      publish({ error: "会话已失效，请重新连接知识库" });
      throw new Error("会话已失效");
    }
    if (result.status !== 200)
      throw new Error(
        result.status === 403
          ? "当前知识源不可读，请刷新目录核对同步状态与权限"
          : "读取未完成，请稍后重试",
      );
    return result.value;
  }
  async function catalog(version) {
    const value = await request({ op: "catalog" }, version);
    if (
      !Array.isArray(value.sources) ||
      value.sources.some((entry) => !Object.hasOwn(names, entry.source_id))
    )
      throw new Error("知识源目录格式不正确");
    publish({
      catalog: value.sources,
      source: value.sources.some((entry) => entry.source_id === state.source)
        ? state.source
        : value.sources[0]?.source_id || "",
      results: null,
      detail: null,
    });
  }
  return {
    snapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    bind(next) {
      disposed = false;
      if (same(connection, next)) return false;
      clear(next);
      return true;
    },
    login(password) {
      return run(async (version) => {
        const owner = viewer(connection);
        const result = await post("login", { password }, "", owner);
        if (!valid(version)) {
          revoke(result.value?.token, owner);
          return;
        }
        if (
          result.status !== 200 ||
          result.value.owner !== owner ||
          !/^[A-Za-z0-9_-]{43}$/.test(result.value.token || "")
        )
          throw new Error("密码不正确或连接未完成，请重试");
        token = result.value.token;
        publish({ authenticated: true });
        await catalog(version);
      });
    },
    refresh() {
      return run(catalog);
    },
    select(source) {
      if (
        !state.pending &&
        state.catalog.some((entry) => entry.source_id === source)
      )
        publish({ source, results: null, detail: null, error: "" });
    },
    search(query) {
      return run(async (version) => {
        publish({ results: null, detail: null });
        const value = await request(
          {
            op: "search",
            source: state.source,
            query: query.trim(),
            limit: 20,
          },
          version,
        );
        if (!Array.isArray(value.results))
          throw new Error("搜索结果格式不正确");
        publish({ results: value.results });
      });
    },
    open(id) {
      return run(async (version) => {
        publish({ detail: null });
        const value = await request(
          { op: "get", source: state.source, id },
          version,
        );
        if (!value.note || typeof value.note.content !== "string")
          throw new Error("资料正文格式不正确");
        publish({ detail: value.note });
      });
    },
    close() {
      publish({ detail: null });
    },
    logout() {
      clear();
    },
    dispose() {
      clear();
      disposed = true;
      listeners.clear();
    },
  };
}

export function apply(ctx) {
  const React = ctx.react,
    h = React.createElement;
  const column = {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
  };
  const row = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
    flexWrap: "wrap",
  };
  const inset = { padding: "var(--space-panel-inset)" };
  const secondary = (text) =>
    h(
      "p",
      { className: "text-secondary", style: { margin: 0, flexShrink: 0 } },
      text,
    );
  const button = (text, onClick, props = {}) =>
    h("button", { type: "button", onClick, ...props }, text);
  function sourceLink(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password)
        return null;
      return h(
        "a",
        { href: url.href, target: "_blank", rel: "noopener noreferrer" },
        "查看原始来源 ↗",
      );
    } catch {
      return null;
    }
  }
  function Workspace() {
    const [workspace] = React.useState(() => createKnowledgeWorkspace(ctx));
    const state = React.useSyncExternalStore(
      workspace.subscribe,
      workspace.snapshot,
    );
    const [code, setCode] = React.useState(""),
      [query, setQuery] = React.useState("");
    const [narrow, setNarrow] = React.useState(false);
    const root = React.useRef(null),
      detail = React.useRef(null),
      selected = React.useRef(null);
    React.useEffect(() => {
      const changed = () => {
        if (workspace.bind(ctx.relay.snapshot())) {
          setCode("");
          setQuery("");
        }
      };
      const unsubscribe = ctx.relay.subscribe(changed);
      changed();
      return () => {
        unsubscribe();
        workspace.dispose();
      };
    }, [workspace]);
    React.useEffect(() => {
      const observer = new ResizeObserver(([entry]) =>
        setNarrow(entry.contentRect.width < 780),
      );
      if (root.current) observer.observe(root.current);
      return () => observer.disconnect();
    }, []);
    React.useEffect(() => {
      if (state.detail) detail.current?.focus();
    }, [state.detail]);
    const entry = state.catalog.find((item) => item.source_id === state.source);
    const close = () => {
      workspace.close();
      requestAnimationFrame(() => selected.current?.focus());
    };
    return h(
      "div",
      { ref: root, style: { ...column, height: "100%", overflow: "hidden" } },
      h(
        "header",
        {
          style: {
            ...row,
            ...inset,
            flexShrink: 0,
            minHeight: "var(--size-panel-header)",
            borderBottom: "1px solid var(--border-standard)",
          },
        },
        h("h1", { className: "text-label", style: { margin: 0 } }, "知识库"),
        secondary("个人只读访问"),
      ),
      !state.ready
        ? h(
            "div",
            { style: inset },
            secondary("连接当前账号的社区后可使用知识库"),
          )
        : !state.authenticated
          ? h(
              "div",
              { style: { ...inset, overflow: "auto" } },
              h(
                "form",
                {
                  onSubmit: (event) => {
                    event.preventDefault();
                    const value = code;
                    setCode("");
                    void workspace.login(value);
                  },
                  style: {
                    ...column,
                    gap: "var(--space-4)",
                    maxWidth: "36rem",
                  },
                },
                h("h2", { style: { margin: 0 } }, "连接知识库"),
                secondary(
                  "输入知识库共享密码即可访问，无需登记账号或申请激活码。",
                ),
                h(
                  "label",
                  null,
                  "共享密码",
                  h("input", {
                    type: "password",
                    className: "buzz-input",
                    value: code,
                    autoComplete: "off",
                    required: true,
                    minLength: 1,
                    maxLength: 256,
                    disabled: state.pending,
                    onChange: (event) => setCode(event.target.value),
                  }),
                ),
                h(
                  "div",
                  null,
                  h(
                    "button",
                    { type: "submit", disabled: state.pending },
                    state.pending ? "正在连接…" : "连接知识库",
                  ),
                ),
              ),
            )
          : h(
              React.Fragment,
              null,
              h(
                "div",
                {
                  style: {
                    ...column,
                    ...inset,
                    gap: "var(--space-3)",
                    flexShrink: 0,
                  },
                },
                h(
                  "div",
                  { style: row },
                  h(
                    "label",
                    null,
                    "知识源 ",
                    h(
                      "select",
                      {
                        value: state.source,
                        className: "buzz-input",
                        disabled: state.pending,
                        onChange: (event) =>
                          workspace.select(event.target.value),
                        style: { maxWidth: "100%" },
                      },
                      state.catalog.map((item) =>
                        h(
                          "option",
                          { key: item.source_id, value: item.source_id },
                          names[item.source_id],
                        ),
                      ),
                    ),
                  ),
                  button("刷新目录", () => void workspace.refresh(), {
                    disabled: state.pending,
                  }),
                  button("退出登录", () => {
                    workspace.logout();
                    setQuery("");
                    setCode("");
                  }),
                ),
                secondary(
                  entry
                    ? `${entry.documents}份资料 · ${entry.state === "ready" ? "可读取" : "同步已过期，暂不可检索"} · 同步于 ${entry.synced_at || "未知"}`
                    : "没有可用知识源",
                ),
                h(
                  "form",
                  {
                    style: row,
                    onSubmit: (event) => {
                      event.preventDefault();
                      void workspace.search(query);
                    },
                  },
                  h(
                    "label",
                    { style: { flex: "1 1 14rem", minWidth: 0 } },
                    "关键词",
                    h("input", {
                      type: "search",
                      className: "buzz-input",
                      value: query,
                      maxLength: 100,
                      required: true,
                      disabled: state.pending,
                      placeholder: "搜索标题与正文",
                      onChange: (event) => setQuery(event.target.value),
                    }),
                  ),
                  h(
                    "button",
                    {
                      type: "submit",
                      disabled:
                        state.pending ||
                        entry?.state !== "ready" ||
                        !query.trim(),
                    },
                    "搜索",
                  ),
                ),
              ),
              h(
                "div",
                {
                  style: {
                    display: "flex",
                    flex: 1,
                    minHeight: 0,
                    minWidth: 0,
                  },
                },
                h(
                  "section",
                  {
                    "aria-label": "搜索结果",
                    "aria-busy": state.pending,
                    style: {
                      ...column,
                      ...inset,
                      flex: state.detail && !narrow ? "0 0 38%" : 1,
                      display: narrow && state.detail ? "none" : "flex",
                      overflow: "auto",
                      gap: "var(--space-3)",
                    },
                  },
                  state.results === null
                    ? secondary(
                        state.pending ? "正在读取…" : "输入关键词检索原资料",
                      )
                    : state.results.length === 0
                      ? secondary("没有找到相关资料，请更换关键词")
                      : h(
                          React.Fragment,
                          null,
                          secondary(
                            `${state.results.length}条结果（最多20条）`,
                          ),
                          ...state.results.map((item) =>
                            button(
                              h(
                                React.Fragment,
                                null,
                                h("strong", null, item.title || "未命名资料"),
                                h(
                                  "span",
                                  { className: "text-secondary" },
                                  item.excerpt || "没有摘要",
                                ),
                                h(
                                  "span",
                                  { className: "text-secondary" },
                                  item.updated_at || "时间未知",
                                ),
                              ),
                              (event) => {
                                selected.current = event.currentTarget;
                                void workspace.open(item.id);
                              },
                              {
                                key: item.id,
                                disabled: state.pending,
                                "aria-pressed": state.detail?.id === item.id,
                                className: "ui-card",
                                style: {
                                  ...column,
                                  ...inset,
                                  flexShrink: 0,
                                  height: "auto",
                                  textAlign: "left",
                                  gap: "var(--space-2)",
                                  overflowWrap: "anywhere",
                                },
                              },
                            ),
                          ),
                        ),
                ),
                state.detail &&
                  h(
                    "article",
                    {
                      ref: detail,
                      tabIndex: -1,
                      "aria-label": "资料正文",
                      style: {
                        ...column,
                        ...inset,
                        flex: 1,
                        overflow: "auto",
                        gap: "var(--space-4)",
                        borderLeft: narrow
                          ? undefined
                          : "1px solid var(--border-standard)",
                      },
                    },
                    h(
                      "div",
                      { style: { ...row, flexShrink: 0 } },
                      button("返回结果", close),
                      sourceLink(state.detail.url),
                    ),
                    h(
                      "h2",
                      {
                        style: {
                          margin: 0,
                          flexShrink: 0,
                          overflowWrap: "anywhere",
                        },
                      },
                      state.detail.title || "未命名资料",
                    ),
                    secondary(
                      `${names[state.source]} · ${state.detail.updated_at || "资料时间未知"}`,
                    ),
                    secondary("来源原文 · 可选中复制"),
                    h(
                      "div",
                      {
                        style: {
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                          flexShrink: 0,
                          userSelect: "text",
                        },
                      },
                      state.detail.content,
                    ),
                  ),
              ),
            ),
      state.error &&
        h(
          "p",
          { role: "alert", style: { ...inset, flexShrink: 0, margin: 0 } },
          state.error,
        ),
    );
  }
  ctx.pages.register({
    id: "knowledge",
    title: "知识库",
    primary: true,
    placement: "dock",
    layout: "workspace",
    component: Workspace,
  });
}

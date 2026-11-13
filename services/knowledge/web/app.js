(() => {
  const node = (id) => document.getElementById(id);
  const viewer =
    new URL(location.href).searchParams.get("viewer") || "0".repeat(64);
  const names = {
    recordings: "OPCB录音卡",
    business: "上粮山经营数据",
    research: "产品调研",
    content: "内容资产",
    haowangshui: "好望水飞书备份",
  };
  const lifetime = new AbortController();
  let catalog = [];
  let busy = false;
  window.addEventListener("pagehide", () => lifetime.abort(), { once: true });

  function feedback(text = "", error = false) {
    node("feedback").textContent = text;
    node("feedback").dataset.error = String(error);
  }
  function clearDocuments() {
    node("results").replaceChildren();
    node("document").hidden = true;
    node("document-title").textContent = "";
    node("document-content").textContent = "";
  }
  function authentication(value) {
    node("login").hidden = value;
    node("workspace").hidden = !value;
    node("logout").hidden = !value;
    if (!value) {
      catalog = [];
      node("source").replaceChildren();
      node("source-status").textContent = "";
      node("query").value = "";
      clearDocuments();
    }
  }
  async function request(path, body, anonymous = false) {
    const controller = new AbortController();
    const stop = () => controller.abort();
    lifetime.signal.addEventListener("abort", stop, { once: true });
    if (lifetime.signal.aborted) controller.abort();
    const timeout = setTimeout(stop, 15000);
    try {
      const response = await fetch(path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        redirect: "error",
        headers:
          body === undefined
            ? {}
            : { "Content-Type": "application/json", "X-OPCB-Web": "1" },
        ...(body === undefined
          ? {}
          : { body: JSON.stringify({ viewer, ...body }) }),
        signal: controller.signal,
      });
      const value = await response.json();
      if (response.status === 401) authentication(false);
      if (anonymous && response.status === 401) return null;
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "密码不正确或会话已失效，请重新输入共享密码。"
            : response.status === 403
              ? "当前资料不可读取，请核对权限和知识源状态。"
              : "请求未完成，请稍后手动重试。",
        );
      return value;
    } finally {
      clearTimeout(timeout);
      lifetime.signal.removeEventListener("abort", stop);
    }
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    document.querySelectorAll("button,input,select").forEach((element) => {
      element.disabled = true;
    });
    feedback("正在读取…");
    try {
      await action();
      if (!lifetime.signal.aborted) feedback();
    } catch (error) {
      if (!lifetime.signal.aborted)
        feedback(error.message || "请求未完成。", true);
    } finally {
      busy = false;
      document.querySelectorAll("button,input,select").forEach((element) => {
        element.disabled = false;
      });
    }
  }
  function sourceStatus() {
    clearDocuments();
    const entry = catalog.find(
      (value) => value.source_id === node("source").value,
    );
    node("source-status").textContent = entry
      ? `${entry.documents} 份资料 · ${entry.state === "ready" ? "可读取" : "同步已过期"}`
      : "没有可用知识源。";
  }
  async function refresh() {
    clearDocuments();
    const result = await request("api/query", { request: { op: "catalog" } });
    if (
      !Array.isArray(result.sources) ||
      result.sources.some((entry) => !names[entry.source_id])
    )
      throw new Error("知识源目录格式不正确。");
    catalog = result.sources;
    const previous = node("source").value;
    node("source").replaceChildren(
      ...catalog.map((entry) => {
        const option = document.createElement("option");
        option.value = entry.source_id;
        option.textContent = names[entry.source_id];
        return option;
      }),
    );
    if (catalog.some((entry) => entry.source_id === previous))
      node("source").value = previous;
    sourceStatus();
  }
  node("login").addEventListener("submit", (event) => {
    event.preventDefault();
    void run(async () => {
      await request("api/login", { password: node("code").value });
      node("code").value = "";
      authentication(true);
      await refresh();
    });
  });
  node("logout").addEventListener(
    "click",
    () =>
      void run(async () => {
        await request("api/logout", {});
        authentication(false);
        node("code").focus();
      }),
  );
  node("refresh").addEventListener("click", () => void run(refresh));
  node("source").addEventListener("change", sourceStatus);
  node("search").addEventListener("submit", (event) => {
    event.preventDefault();
    void run(async () => {
      clearDocuments();
      const source = node("source").value;
      const result = await request("api/query", {
        request: {
          op: "search",
          source,
          query: node("query").value.trim(),
          limit: 10,
        },
      });
      if (!Array.isArray(result.results))
        throw new Error("搜索结果格式不正确。");
      if (!result.results.length) {
        node("results").textContent = "没有找到相关资料。";
        return;
      }
      for (const entry of result.results) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.textContent = entry.title || "未命名资料";
        button.addEventListener(
          "click",
          () =>
            void run(async () => {
              const detail = await request("api/query", {
                request: { op: "get", source, id: entry.id },
              });
              if (!detail.note || typeof detail.note.content !== "string")
                throw new Error("原资料格式不正确。");
              node("document-title").textContent =
                detail.note.title || "未命名资料";
              node("document-content").textContent = detail.note.content;
              node("document").hidden = false;
              node("document").focus();
            }),
        );
        item.append(button);
        node("results").append(item);
      }
    });
  });
  authentication(false);
  if (!/^[a-f0-9]{64}$/.test(viewer || "")) {
    node("login").hidden = true;
    feedback("请从当前 Buzz 账号的知识库插件打开此工作台。", true);
    return;
  }
  void run(async () => {
    const session = await request(
      `api/session?viewer=${encodeURIComponent(viewer)}`,
      undefined,
      true,
    );
    if (session === null) return;
    if (session.owner !== viewer)
      throw new Error("登录身份与当前 Buzz 账号不一致。");
    authentication(true);
    await refresh();
  });
})();

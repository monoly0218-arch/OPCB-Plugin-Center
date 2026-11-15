// src/plugin-icons/macbook-bases/opcb.chat-artifacts/plugin.js
var inject = [
  "react",
  "panels",
  "relay",
  "conversation",
  "navigation"
];
function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : void 0;
  } catch {
    return void 0;
  }
}
function categoryOf(file) {
  if (file.kind === "image" || file.kind === "video") return file.kind;
  return /\.(md|txt|pdf|docx?|xlsx?|csv|pptx?|json|[cm]?[jt]sx?|py|rs|html?|css|ya?ml|sh|go|java|sql)$/i.test(
    file.name ?? ""
  ) || /^(text\/|application\/(pdf|json))/.test(file.mime ?? "") ? "document" : "other";
}
function linksIn(text) {
  if (typeof text !== "string" || text.length > 65536) return [];
  let fence;
  const lines = [];
  for (const line of text.split("\n")) {
    const mark = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (mark) {
      if (!fence) fence = mark;
      else if (mark[0] === fence[0] && mark.length >= fence.length)
        fence = void 0;
      continue;
    }
    if (!fence) lines.push(line);
  }
  let body = lines.join("\n").replace(/(`+)[\s\S]*?\1/g, "").replace(/<(https?:\/\/[^<>\s]+)>/g, "$1").replace(/<[^>]*>/g, "");
  const result = [];
  body = body.replace(
    /!?\[([^\]\n]*)\]\((https?:\/\/[^\s]+?)(?:\s+"[^"]*")?\)/g,
    (_all, name, url) => {
      result.push({ url, name });
      return "";
    }
  );
  for (const match of body.matchAll(/https?:\/\/[^\s<>"'`]+/g)) {
    result.push({ url: match[0].replace(/[.,;!?，。；！）)\]}]+$/, "") });
  }
  return result;
}
function artifactsFrom(rows, profiles = /* @__PURE__ */ new Map()) {
  const entries = [];
  for (const row of rows) {
    const seen = /* @__PURE__ */ new Set();
    const add = (raw, name, attachment) => {
      const url = safeUrl(raw);
      if (!url || seen.has(url)) return;
      seen.add(url);
      const parsed = new URL(url);
      let filename = parsed.pathname.split("/").at(-1);
      try {
        filename = decodeURIComponent(filename);
      } catch {
      }
      entries.push({
        id: `${row.id}:${url}`,
        url,
        name: name?.trim() || filename || parsed.hostname,
        category: attachment ? categoryOf(attachment) : parsed.pathname === "/" || /\.html?$/i.test(parsed.pathname) ? "website" : "link",
        attachment,
        message: row,
        agent: !!row.agentEnvelope || !!profiles.get(row.authorId)?.isAgent
      });
    };
    for (const attachment of row.attachments ?? [])
      add(attachment.url, attachment.name, attachment);
    for (const link of linksIn(row.content)) add(link.url, link.name);
  }
  return entries;
}
function canRead(connection, channelId) {
  if (connection?.status !== "ready" || connection.cached || !connection.session)
    return false;
  const { session } = connection;
  const channel = session.channels.get?.(channelId) ?? session.channels.list().channels.find((c) => c.id === channelId);
  return !!channel && !channel.cached && !channel.metadataCached && !channel.pending && !channel.metadataPending && (channel.visibility === "public" || !!channel.members?.includes(session.viewer));
}
function createReader(relay, connection, channelId, pageSize = 12) {
  const { session } = connection;
  let disposed = false, epoch = 0, controller, readers = [], stops = [];
  let pageCursors = [void 0], page = 0, nextCursor, retryIndex = 0, retryHead = false;
  let state = {
    rows: [],
    pending: false,
    more: false,
    error: "",
    page: 1,
    scanned: 0,
    changed: false
  };
  const listeners = /* @__PURE__ */ new Set();
  const current = () => {
    const now = relay.snapshot();
    return !disposed && now.session === session && now.scope === connection.scope && now.generation === connection.generation && canRead(now, channelId);
  };
  const publish = (patch) => {
    if (disposed) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const retire = () => {
    controller?.abort();
    controller = void 0;
    for (const stop of stops) stop();
    stops = [];
    for (const view of readers) view.dispose();
    readers = [];
  };
  const revoke = () => {
    epoch++;
    retire();
    publish({
      rows: [],
      pending: false,
      more: false,
      error: "连接或阅读权限已变化，请重新打开产物面板"
    });
  };
  const update = () => {
    if (!current()) return revoke();
    const snapshots = readers.map((view) => view.snapshot());
    const rows = snapshots.filter(
      (s) => s.targetStatus === "ready" && s.target?.channelId === channelId
    ).map((s) => s.target);
    publish({
      rows: rows.sort(
        (a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)
      )
    });
  };
  async function load(index = page, head = false) {
    if (disposed || state.pending) return;
    if (!current()) return revoke();
    retryIndex = index;
    retryHead = head;
    const ownedEpoch = ++epoch;
    retire();
    const owned = new AbortController();
    controller = owned;
    const cursor = head ? void 0 : pageCursors[index];
    publish({ rows: [], pending: true, error: "", changed: false });
    try {
      const result = await session.readRemote(
        [
          {
            kinds: [9, 40002],
            "#h": [channelId],
            limit: pageSize,
            ...cursor ?? {}
          }
        ],
        { signal: owned.signal, fresh: true }
      );
      if (ownedEpoch !== epoch || !current() || owned.signal.aborted) return;
      const events = [
        ...new Map(
          result.filter(
            (e) => [9, 40002].includes(e.kind) && /^[0-9a-f]{64}$/.test(e.id) && e.tags.some(([k, v]) => k === "h" && v === channelId)
          ).map((e) => [e.id, e])
        ).values()
      ].sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
      if (events.length > pageSize || cursor && events.some(
        (e) => e.created_at > cursor.until || e.created_at === cursor.until && e.id <= cursor.before_id
      ))
        throw new Error("历史分页游标不兼容");
      if (head) {
        pageCursors = [void 0];
        index = 0;
      }
      page = index;
      const last = events.at(-1);
      nextCursor = last ? { until: last.created_at, before_id: last.id } : void 0;
      publish({
        page: page + 1,
        scanned: events.length,
        more: events.length === pageSize
      });
      for (const event of events) {
        const view = session.thread(channelId, event.id, { exact: true });
        readers.push(view);
        stops.push(view.subscribe(update));
      }
      const queue = [...readers];
      await Promise.all(
        Array.from({ length: Math.min(3, queue.length) }, async () => {
          while (queue.length && ownedEpoch === epoch && current())
            await queue.shift().refresh();
        })
      );
      if (ownedEpoch !== epoch || !current() || owned.signal.aborted) return;
      update();
      const failures = readers.filter(
        (v) => v.snapshot().targetStatus === "error"
      ).length;
      publish({
        pending: false,
        error: failures ? `${failures} 条消息读取失败，请重试本页` : ""
      });
    } catch {
      if (ownedEpoch === epoch && !owned.signal.aborted && current())
        publish({ pending: false, error: "产物读取失败，请重试本页" });
    } finally {
      if (controller === owned) controller = void 0;
    }
  }
  const offChannel = session.channels.subscribeList(() => {
    if (!current()) revoke();
  });
  const offRelay = relay.subscribe(() => {
    if (!current()) revoke();
  });
  const offLive = session.subscribeLive(({ events }) => {
    if (current() && events.some(
      (e) => [9, 40002].includes(e.kind) && e.tags.some(([k, v]) => k === "h" && v === channelId)
    ))
      publish({ changed: true });
  });
  return {
    snapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: () => load(0, true),
    retry: () => load(retryIndex, retryHead),
    refresh: () => load(0, true),
    next() {
      if (!state.pending && state.more && nextCursor) {
        pageCursors[page + 1] = nextCursor;
        return load(page + 1);
      }
    },
    previous() {
      if (!state.pending && page > 0) return load(page - 1);
    },
    dispose() {
      disposed = true;
      epoch++;
      retire();
      offChannel();
      offRelay();
      offLive();
      listeners.clear();
    }
  };
}
async function readText(source, signal, request = fetch) {
  const url = new URL(source, globalThis.location?.href);
  const native = (url.protocol === "buzz-media:" && url.hostname === "localhost" || url.origin === "http://buzz-media.localhost") && !url.port && !url.username && !url.password && !url.search && !url.hash;
  let validNative = false;
  if (native) {
    try {
      const encoded = url.pathname.slice(1), target = decodeURIComponent(encoded), media = new URL(target);
      validNative = !!encoded && encodeURIComponent(target) === encoded && media.href === target && media.protocol === "https:" && !media.username && !media.password && !media.search && !media.hash && /^\/media\/[0-9a-f]{64}(?:\.(?:[a-z0-9]{1,8}|thumb\.jpg))?$/.test(
        media.pathname
      );
    } catch {
    }
  }
  const proxy = globalThis.location && url.origin === location.origin && url.pathname.startsWith("/api/relay") && url.pathname.endsWith("/media");
  if (!validNative && !proxy) throw new Error("此文件请通过原消息打开");
  const response = await request(source, {
    signal,
    credentials: "same-origin"
  });
  if (!response.ok || !response.body) throw new Error("文档读取失败");
  const reader = response.body.getReader();
  const chunks = [], max = 65536;
  let bytes = 0, truncated = false;
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      const part = value.subarray(0, max - bytes);
      chunks.push(part);
      bytes += part.length;
      if (bytes >= max) {
        truncated = true;
        break;
      }
    }
  } finally {
    await reader.cancel();
  }
  const data = new Uint8Array(bytes);
  let at = 0;
  for (const part of chunks) {
    data.set(part, at);
    at += part.length;
  }
  return { text: new TextDecoder().decode(data), truncated };
}
function bookmarkKey(scope, viewer, channelId) {
  return `opcb.chat-artifacts:stars:v1:${JSON.stringify([scope, viewer, channelId])}`;
}
function readBookmarks(storage, key) {
  try {
    const raw = storage?.getItem(key);
    if (!raw || raw.length > 262144) return [];
    const values = JSON.parse(raw);
    return Array.isArray(values) ? [
      ...new Set(
        values.filter((id) => typeof id === "string" && id.length <= 4096)
      )
    ].slice(0, 1e3) : [];
  } catch {
    return [];
  }
}
function saveBookmarks(storage, key, ids) {
  try {
    if (!storage || ids.length > 1e3) return false;
    const raw = JSON.stringify(ids);
    if (raw.length > 262144) return false;
    storage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}
function apply(ctx) {
  const R = ctx.react, h = R.createElement;
  const prefix = "opcb:chat-artifacts:";
  const labels = {
    all: "全部",
    website: "网站",
    link: "链接",
    document: "文档",
    image: "图片",
    video: "视频",
    other: "其他"
  };
  const gap = "var(--space-2)";
  const rowStyle = {
    display: "flex",
    gap,
    flexWrap: "wrap",
    alignItems: "center"
  };
  const note = (text) => h("p", { role: "status", style: { color: "var(--text-subtle)" } }, text);
  const button = (text, onClick, props = {}) => h("button", { type: "button", onClick, ...props }, text);
  const selectedStyle = (active) => ({
    background: active ? "var(--surface-inset)" : "transparent",
    color: active ? "var(--text-standard)" : "var(--text-subtle)",
    border: "1px solid transparent",
    borderRadius: "var(--radius-control, 8px)",
    minHeight: 32,
    padding: "4px 8px"
  });
  function Icon({ type, size = 20 }) {
    const paths = {
      grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
      list: "M8 5h13 M8 12h13 M8 19h13 M3 5h.01 M3 12h.01 M3 19h.01",
      star: "m12 2 3 6.4 7 .9-5.1 5 1.3 7L12 18l-6.2 3.3 1.3-7L2 9.3l7-.9Z",
      more: "M4 12h.01 M12 12h.01 M20 12h.01",
      external: "M14 3h7v7 M21 3l-12 12 M10 3H3v18h18v-7",
      image: "M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M7 7h.01",
      video: "M3 5h12v14H3z M15 10l6-4v12l-6-4",
      document: "M5 2h9l5 5v15H5z M14 2v6h5 M8 12h8 M8 16h8",
      website: "M2 12h20 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M12 2c6 6 6 14 0 20-6-6-6-14 0-20",
      link: "m10 14 4-4 M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0 M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0",
      other: "M5 2h9l5 5v15H5z M14 2v6h5"
    };
    return h(
      "svg",
      {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.5,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": true,
        style: { flexShrink: 0 }
      },
      h("path", { d: paths[type] || paths.other })
    );
  }
  function useWidth() {
    const ref = R.useRef(null), [width, setWidth] = R.useState(0);
    R.useEffect(() => {
      const node = ref.current;
      if (!node) return;
      const measure = () => setWidth(node.getBoundingClientRect().width);
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      return () => observer.disconnect();
    }, []);
    return [ref, width];
  }
  function Preview({ entry, session }) {
    const ref = R.useRef(null), [visible, setVisible] = R.useState(false);
    const [failedSource, setFailedSource] = R.useState("");
    R.useEffect(() => {
      const observer = new IntersectionObserver(
        ([item]) => {
          if (item?.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        },
        { rootMargin: "120px" }
      );
      if (ref.current) observer.observe(ref.current);
      return () => observer.disconnect();
    }, []);
    const thumbnail = entry.category === "image" ? session.media(entry.attachment?.previewUrl || entry.url, "small") : entry.attachment?.previewUrl ? session.media(entry.attachment.previewUrl) : void 0;
    const textual = entry.attachment && /\.(md|markdown|txt|json|[cm]?[jt]sx?|py|rs|html?|css|ya?ml|sh|go|java|sql|csv)$/i.test(
      entry.name
    );
    return h(
      "div",
      {
        ref,
        style: {
          height: "14rem",
          width: "100%",
          position: "relative",
          overflow: "hidden",
          textAlign: "start",
          background: "var(--surface-inset)",
          borderTop: "1px solid var(--border-primary)",
          borderRadius: "0 0 var(--radius-control, 8px) var(--radius-control, 8px)",
          pointerEvents: "none"
        }
      },
      visible && thumbnail && thumbnail !== failedSource ? h("img", {
        src: thumbnail,
        alt: "",
        loading: "lazy",
        decoding: "async",
        onError: () => setFailedSource(thumbnail),
        style: {
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "top",
          display: "block"
        }
      }) : visible && textual ? h(
        "div",
        {
          style: {
            padding: "var(--space-4, 16px)",
            overflowWrap: "anywhere"
          }
        },
        h(TextPreview, {
          source: session.media(entry.url),
          name: entry.name,
          compact: true
        })
      ) : h(
        "div",
        {
          style: {
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            gap: 12,
            textAlign: "center",
            color: "var(--text-subtle)",
            overflowWrap: "anywhere"
          }
        },
        h(Icon, { type: entry.category, size: 32 }),
        h("span", null, entry.name),
        !entry.attachment && h(
          "span",
          { style: { fontSize: "0.875em" } },
          new URL(entry.url).hostname
        )
      ),
      entry.category === "video" && h(
        "span",
        {
          style: {
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            padding: "8px 16px",
            borderRadius: "var(--radius-pill, 24px)",
            background: "var(--surface-inverse)",
            color: "var(--text-inverse)"
          }
        },
        "播放"
      )
    );
  }
  function ItemActions({ item, starred, star, openMessage }) {
    return h(
      "details",
      {
        style: { position: "relative", flexShrink: 0 },
        onBlur: (event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            event.currentTarget.open = false;
        },
        onKeyDown: (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary").focus();
          }
        }
      },
      h(
        "summary",
        {
          "aria-label": `${item.name} 操作`,
          title: `${item.name} 操作`,
          style: {
            ...selectedStyle(false),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            listStyle: "none"
          }
        },
        h(Icon, { type: "more" })
      ),
      h(
        "div",
        {
          style: {
            position: "absolute",
            right: 0,
            top: "100%",
            zIndex: 3,
            background: "var(--surface-panel)",
            border: "1px solid var(--border-primary)",
            borderRadius: "var(--radius-control, 8px)",
            padding: 4,
            minWidth: "10rem",
            display: "flex",
            flexDirection: "column"
          }
        },
        button(
          starred ? "取消收藏" : "收藏",
          (event) => {
            star(item);
            event.currentTarget.closest("details").open = false;
          },
          { style: { ...selectedStyle(false), textAlign: "start" } }
        ),
        button(
          "回到原消息",
          (event) => {
            openMessage(item);
            event.currentTarget.closest("details").open = false;
          },
          { style: { ...selectedStyle(false), textAlign: "start" } }
        )
      )
    );
  }
  function Launcher({ context, available, pressed, toggle }) {
    return button(
      h(R.Fragment, null, h("img", { src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAEqgSURBVHgB7X0JnCZVde+5X6/T07MxKwoqDMiiDuIawFHiArJJFBmfIYYtoo5C4pJn4kLmJcFnTJ7xqSTBuKE+VFBkJ4ADI8qAmFGJYRCQxRm22deeXr/vvK++Wu45555bVV/31zPd0/ffv6+r7rnnLnXrnuUuVQUQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAwBWAgYH+BOe+887pOOOGEeUcdddSi9vb2AxBxTldX1wHt7Z0z29srPbVarRuN6a7zdkANOxCwYqBSZ8MaGhw2aAaNMQOVCgwMV6u7B/v7d1arsMWY2radO3duXrNmzYYf/vCH2+vHYQjYLxAUwCTCRRdd1HHSSSe9aMGBB754ek/P4XUhf1Fne/uhCHBQe1v7QR0dHXMqlUq7qUuwif6iu2viW9z4b5TbjRgfSBgzAj+vKxCoVquDwyPDz9WD60eqI+vq/I8PDg4+1jc09Oj999zz8Mc+9rEtNLuAiY2gACYoPvOZz8xdunTpsT09Pa9o6+hY0l7peFlXV8eL2zs6uiuVSLjrQm6M/aUCD3E4A1UAHsTyjWoMVQCWDbM0mP7qwVqtikNDQxur1dqDdSXxX0MDA7/esGHDLy+99NLfBq9hYiIogAmAFStWVF7xilcctXDhwqV1l/34upD/QXf3tMVtlQYgsugVEwt9dMeswCfCnQm8cY18UwrAgDTeDdFGNwXXF3E45rXnDcVQ9xqGhod2DQ+N/HJkZGj1nj177qkrg9XLly/fBgH7HEEB7CN86+qrD3nxC17wlq6uaW/u7Ox8Q1d314K2trZY0Cuxda8QKx8hPlJLT48pjOrpW+F2hZyCW3xFISieAqW551Qh1OoKAWGkjoHBgQeGh4ZW7tix446VK1f+rK4EByBgryMogL2EE088sf2v//qvj58zd+7buju7Tp02bdqRdYE3kYVvWPlU2CvEujuuPT265+zMjOLWYubcuxHugZ3JtLpSwGwIUUu8gyhuaGhwd33ocGf/0NANv3v44ZuXLVv2HATsFQQFMI6IJu3e9a53nThr1qxlXd3dZ3R3dy9sq9StfP0XCXpFjuMzoQeP1QegiiD7PwphN4l1x8YZ5vsEjuCLUMaS7y1k8wdCITQ8g2QuoT7JWO3v7189ODjwg7Vr1/7g3e9+9zMQMG4ICqD1MDfccMOrFh544HumdXcvq4/lF8aufWTpTTKerzjC7rr3Jh7vgxzna0JPlYGoDUL5u2yXAvwKARljjjeg0ZmPkM0jOEOFWjxciJTBnj19P9mzZ+Db99zz02svueSSnRDQUgQF0CJ8/etfn3/4EUe8p7dn+gX1mfuXNISeCr6w9kAm8nQX3xCBdpUAj28xkJ+UVQY8hA4RSwwZ6NH+ajA4PLS7v2/PD7Zu3fLV17/+9ashbyIjoDSCAhgbzHU33XTcgQsWLJ8+vfes+mRed1s6pieW3nHzEyH3Teo1/ufM7JvYNWi2qmBlxncuwBRBOmQo4pNnJOToBI9CQLLMCMiUQd0pgP7Bgd/07dr1r7/61a++c+GFF+6CgFEjKIBR4Oyzz+6sL2OdPXPmrL+oW/tXtbe3J9beeAUfHGuvCzwXbmnl86x+0a2kYwE5LihSAJJchl+dFcg5lRON1CNIhguJQqglk4eDQ4Pb9/T1f23duie/dNppp/0eAppGUABN4PLLL+895phj/qxn+owP90zrfoF183XB1918IfAeF9+18obqAXnSAmApUhqBpTwHG8A8JuQ5U3qRVxApg/qq4nBf3+6r161b97lTTjnlvyCgNIICKIEvfvE7M4899oUXz5gx48/rk3rzG4LfmM1PxvYVK/gV1cU3bOIufwOPLuicpt82at9HB2KFc+Q7ZslRAegnIEB+uYxi6e58QaoE4lWEWvSrVmu7du++ceuWLX+3dOnSNRBQiKAAchBZ/CVLlnyod+bMj3V3dc+NlvAi4fct4eW5+8lZ1uK6tU/5wA1bZnmiokB+FSRSr0zs5adCNxsPZymKmp3uFbiKIJ4wrHsEuHv37huee+7ZS9/0pjcFjyAHQQEoiMb4H/zgBy+cNWv2p+tr9wdqFr+iCnyOq0+EnAq4V9jlsp9CbymUCb+mkinC6+c2SQj9fE0oAjsssEqgVouGByPVXbt2fbc+NPh0fWjwJAQ4CAqAw9x6661nzJs//x96eqYf2d6WWHyT7tZzl/O0Sb2mhD9mtBXQwuKsZXetCWudzxVJXrMDkIJhgccT0RSOrghq2RzB8PDwwM6du7708MMPXbZs2bIdEJAhKIAE11133dGLFi36Qu+MGW9pb2tPXP227CGc2PqbRJiJAogSGyn0+lq+FPjsfzosIP91eRe3q9m7V8q4Fy8PonPiJZSqVLEeKlAEjYN4jNmZLKzC4ODghq1bt37y5ptv/saKFStqEBAUwNe+9rUZhx9+xKWzZs+8pKOjs7O94e5XhNUXP6IEIuRa/CLhTw6OkGtKwYe86NHIZJbQVQKIzfGXKaXcaoKfaD0AEkqHCEQRRN5A9Ovr23PvM888dfEb3/jGKT9ROKUVwK233v62+QvmfWnatGmNJb02R/ArHuEHj/Bbi2/sbB8kJMiz9qqgS+WxL4C5IiqZoRm4Q4hmtRXNAQWJLhsmE4aREsBaunQ4smPnji8//Nvffro+LNgNUxRTUgFcddVVC1/0okO+WHf3l3Vkm3hiwa+kb9Op5Lj7KT0LAxF0wwVaCrwm7MYj5lnavXib5Li62YRFXBg3FZa07s2Wmakr7/wA31U4ODjw5IYNW95/wgmvvQ2mIKacArjjjjuXzZ0758tdXV3z2yLhN3TrLrf02WYeavk14aeCrVh819q7ll71AFLqeN4lVE+hiFqYYToigEToobnFxabLU6moDgtSbwATj6CuCHDHju1fe+ihhz421SYJp4wC+OpXv3rAUUcf/eUZM2a+O9q6Gz+Wq43zK87knm7x439eReATeNXamxwhN9phbCgU+vwYP5uV+mYGDm6GhpynKKNCUAkh8NEBnRegqwVVGBgYePLZZ589f+nSpatgiqANpgDqS3snHrp48W29vTNOiFz+trbI7ZdjffJSjoaUVhTLH+UmFAKNz4J5Ai+FnUz/OdLtirvxR/lRSuC1kow3H0mmSm/0wm/z4KsRZf0HA7Te9v5YxSzvZ+rpGahA3TDMnjlz5nvOO++87vqK0E9XrVpVhf0cLTEoExXRW3guXbHi0gNmz/lEZ2dnGx3rF07yOVZfdpxGBCTR4Lf4NET5KUhuNC8PqIjYlPmz8KMSR/QvCebnl1+XUVQEmke+N6BNEmIyQRj99uzp+/mTTz757pNPPvkJ2I+x3yqAb3/72wcedtjhV9Un+k5slzv5TDzeB3VpzyP8jVNdyNlz+tQzsCQAlcabnzsGxbdG2sqYllrhJoWm1N6AEqxluainX5pxbIrAyr5YPUCyZEhWCoaGhrZt2rTxgte+9rXXwX6K/XIIcPPNN7/+kEMOuaNneu/Lok09lUq6tp94AD7hBwD6ph7rrhvh5vN1fWrhpXvvs+p2SAEuXQwhykFzlY2eQRNyZF8aVsgoAp6ym4XxDQlKZwDUT0qVurNqQyZv0z5RXxqe1tPT865zzz9/+oGLFt1VHxLsd5uHWnCHJhbuuOOOi+fNn/9/Oju7OuKXc7RB9obdim92P6VHOehC731yr0Dg7TiU19NHJ7loCXKImklNXd7mLKi6uDa6MQSMD5JrNTRcJo1CcbwBOSSIJwj7+navfPTRR//HGWecsRn2I+w3CuDiiy/uOvvsd10+e86sC7nVT5b35Lo+VQSZsAOoLj9VCsDdd1XgjWLtLQuoIm74Sf6Nafa2YXkO9MUYaHZ5LhZTU3o4Uu6qpKLDUfRiMSyw/9iQgL6SLBoS9PfveXzdunVv35+eMNwvFMBVV10175DFi3/YO3366xsz/NnLOfzCb88BuMvvCr2Rgpsj8Jpll6sCfiGX6URchtIDaPBNyJE+30Q+ZTkiCSrhdRgofSkmG4zIEkejDDRvgC4X5s4L7Hz66ef+ZOnS426E/QCTXgFce+21Lz7ooBfc1NMz7fD0sV0m+JEiiBgbCgHAGe9T6+6M/QEc69/4RwVeE1qTL+hG0v0uP+dBP7+DWDgy8W9+N47IS80+59kAT7pmYPz5Gm24ow11CpsK7X+PJ5DtG6glbyCqDlc3bNjwkde85jVfhEmOST0JeOONNx73ghe88I7uadMObkvd/uz12/Habuzmpx/LpC6/dPWt0BspwEyYPdY99RagyNob7QC5PdWkQhxfg89opsIYy3kJC+yDOh4wJM9mMmkmTQkYxeoDuQ/O9Rr1VPJmt4pNDso+kawSmUqlPjl4ynnnnTtz0aJFP65PDo5R0+07TFoFcNttt52+6MADb+jq6prdRsf7meC7797nbj0VfmBxlJ5v8flqgE1t44F2II+lN4VC4kmbi5Kz5ugjpbP/afqyfVxOPHqQZkmPpSAYDb0+zJSfyau3oSf2Z0Se1Bs0lB4rAeju7j5u8eLDDl+wYMFNk3XTULO9akLg9pUr/2TB3Hlf7+jo7KCf1kqf3bez/ADaLH+mFIilp4LunEs+J16jCVVgXFoSw/ujEh9jNON+GoZcGcbC/Moyp0OP0RvF/PbIKdeZfC1RByPyADk/ktDS148B2MnB6HPp9RWCnTt3/ceaNb9455/+6Z/2wSTDpFMAK1eufP+8efMvb2/vqKTCX6HbeBN1LZf4rKV13brGucfKuy6+5SJsQBKA8Qm6cWnFFOAdO08PYCGBGd1SwKZUQy51LPDqT1+DkKGCyfjyMpfZsteQJv/5vEAt+dhppAT29PX9dPW9q992/vnnb4dJhEmlAOrC/xfz5y/4fFt7u0kFXxV+MMTl5wLOrD4V+qYtPlUA0trLZtW8BTedm0LylPUCMCdUJkKWh+XZxyL8JXujvSdae4i5B2Np7l1APWOM85afQI//SyWQfcYs2j58/wMPPHDKsmXLtsIkwaRRAHXh/+j8BQv/sb2tzRhV+AGcCT42/o9A5gAAAByloMVZuibwmrCTrMBRDsqZ/y7YHpmWa7s8gj4ph05aJ6oQNg9sKn3rLb+/beKWKNCjGZ/Lg/4RF3H/NVXq2ysQKYG+vt2/XLt27UnveMc7tsAkwKRQAA3Lv2Dh52Phj9/TZ4UfwI7xifADcfXppI4i9NbNN1zApcAbJt5OPq54G0mmqQrAeiKAuiWWktJlvhwLVwD0n5RNmYUMjFYdyCU+adF1L8hVBHlDA5pOUZROjdDhiZscVU+gv3/PmkceeeQtp59++jaY4JjwCqAu/B+ou/2Xx25/G3kff+QBABd+8Ln8HqGn3gCLs2HeGeU4noi5MwHlnsleWq7xtQ7qE/LiziyR/46/EukTazg6aJOVVKESK5+FQeUBGwPahCCDvCWlhF+JwZQjVgLkBSPRnMDPH3v8sZNOPfXUCf1F4wm9DFif7X/PwvkLvlIX/goXfvIjwp8/u2/dRWrxExJYgbcUTeCtDBtJBeBk8Nt5zp9ay7EpBAO+2fpR+gFujDrJmJbdLOgVK16NjKeKm/GA6h0pTpkLY9MYD7Mhf06cMCaGpGjvaD9o+vTe45csednVN9100zBMUExYBRC9sHPRwoX/rz7b384f5XUF3/cEH7XMrpsfU6XQ8zG9HGO63gLLm4KtKrAIKIK386YvziT9PV2tpyI0aoOsaIziWf6cEhV9ZJVdOp9hnxmgAqnnnd5DBLd1pTIQqYyvgoYbCNCVMVUTtFxiciw56Z8dHe0vWrhw4ZKRkZEfrFmzZkI+SVjcG/cBbrnllhMOPPB5t3d2dvXQdX6v8AOMepzP1+epxadcNE9ClXkDTyuSqnETAqhNdXmZkyPTQizWrxI0l1/kJWBym8tAOqYXd4soE3kffXmhmxw0PwXVtNlwIHvdWPIkYXUEtm3f8c0lS156AYxFN48TKjDBcOONNx65aNGB16vCD3Z2nwm/VzNzWinhU2+R0c8jXqTbTQxoZSTvoIwtOIL9jTdoOej7oUPy54fJNRh7UciLACgj/LIkf8lZMSoLZkl5NNq6yhJ8+TQOyf2BeAckCq8ghnaP+YRzbKCSlaq2dpg9e9Z5v/rVA38HExATSgF861vfWlC3/Dd1dXXPZcIPwuqzm2AyH08fcxvXOjAhVpQDgsuLShSJQ3/vgrTTJNNFvJyin+SXxzJpMwHBrA42rMCjKGw0OsX4ZMpKsLH5NHPNslretjGQPbTTiOb3TV4az0P0JxJH2QzjdBWBXX1K+mvyEdloq/rcAw74xP333/9emGCYMApgxYoV3UcedfS13dOmLdYE33X5AVThNtT6G6cDmBzhZnQU+ap8IlpaeZYQnVChEEEOE3IWtxSZlHZjpYd7BMsqjdQqehpBvSBaJkBeA7KkhXUSyoDm7aRBNR90TpQaEaXn812ActDhJRmqVuKvSpv58+Zffu+9974ZJhBK+MR7BWb16nu/MXPmrHMjbWnf0V9ha/tyac82Nh/jZzxASXKcr4/xRUrv+J3OL8h4f6MmabLH9vZG8xPBMJAngzIFuEqjXHrKiGULzYEpJCRkNtAnwmuUeQej3CtTrhKuGuSahe4bkC8VGRgc2PbIIw8fd8oppzwMEwATwgNYtWrVh2fMnHku/UBH9Agv5Lr89Jy77859lG6+1+ILGlAjwIcQzFKJeL+VAG4VNUvn+0FefGKtVLpI76sWgOKnePLJzUO64egvqMw1a2RPXZAxcDoCpRt2eawgH0jeLhvpn8YxIXbyut63uzq75ixevPi6b3zjG7NhAmCfLwPecccdb5o3b8GV7claP/tAB1DXHyBrWt+6fmqB5VIeURhM74ubZb0J4PmBbu3lCFA7pSQkOY4OpAOXouXnohMKpJxwueKNZZOPDiaHZBS6xm+MJ4My3gB602YEpFG23xiy/NzW3jFv3ry5L1mwYMH39/W7BPapB3DdddcdXBf+qzrqC6Zskw9Q4WdiCKm2lULqHgnQ0mVfd0Z56Obrs/aWZNzyxM8aYUPSeafhQM+QWBqfGXRFErwW1MmCBoy3FqkTg5q30VLkeA+SQ/ManOszbjUJj7cpSHr2kzzpW5eosSL9GNIdrHVPYMaMmWecfvrbPgX7GPtMAdQn/Tqf//yDv9fZ2blALvNlO/tAWl/jUdM+F5/QvTeUHhOg3vmzOKezlRBkR1gwmzS0S110zGhpwJOx0my29HNXwJfOVIFHpYK0XZDnL9MXS4sKmRxRy1LzapSMhHJldJqToKVptEtwmij30ozoD1RBA/BhK5kUbKwMtMP8+fMuve+e+06CfYh9pgDe/OaTLuvpmXZ8RZnwi0D/23mA9JxAPPzi9wyA3CRyzHq3TWc7TU4HzHhsvoX9JUtUhm5z42Nb23vRK9zN1sEKO2SKCPxLbrl5kdqnQiUUEjuCpLlKLFOKvtIyxUiqS5gZTbShW2nnNOf6lUxEvzHUkIGdD4j6fVtbe9v8hQu+feONNz4f9hH2yRzAbbfddsr8BQu+VKnEz/UzD8CYzOrbTT+2Aa0T4PEQgKgI5oqBmh5oCkPz4HnGp25K0PgIO0KuHdsHSDq/MZl3Mep8Mpgs27FBs/waLaYb3yqKUVLIsb5Iq2Zl9GE+D/jurusJ2LdQR//inlFpM9N7e3uP3bhx43fWrl079iZsEnu9b0abfV665JgHuju7FsUf64jG+xWx1h9XjSmCrBEBuGcAfgXgEXj/M/xGdBSXT+1cQMfl+U0qOb0pxnpnkB04MSt5tPlSZ30MefFME5gCuqsQDBEoBqMrAaNG+pUAOTh0jnzvLvVhrFdTyx4h3rhp06de+cpjL4O9jL09BDBHHHHUV7o6uhZlX+MlbhF3mIgQE6BY0rP9UePXbogRnpu4k8INZOlIvP/JuHzQolHQ2E+4zZrbT11p5wdcTEcl/KIs+/grzbFkXrmFAKkbgDJ7p/BaWjZsUNg1V14bJqTFOveVjBgcugNrqPxIzFk27I2/XnXAnDl/s3LlytfAXsZeVQArV646b/r06Wfacb+c8LP/ITnPcciVNEosunR0TlJLRpmIgvHcVGTSCmOXBQ+4wIGqRFxu8HBgfgFU4MFVJKO+RASPlpPlJmrFx+tkyoOFAtwIp/c2fZZfJPHoHucWe++5rgjoZrVYCUAmA9ELbg8+6OArr7jiih7Yi9hrCuC73/3uwXPnHvD5dK2/sdEHuMsPzOXXoAk6scygqwp9M08SJh3CAZMALGRJ+6mvcysS1WIUCLunLqhEg1eRGH+xJa7XssqHkOz+Or0+Cc2rEOj9RlURsLzYsw2gKwFPc6p6SCXSulnfFsivseidLA1Om9Zz5HGvPW6vPjS0txSAOfTQxf/S2dE5uyL3+AN1/fkZP4IaRkpHTbaSHJ2b5Lr+6C0D/V6pArt3Pg3zI9D6FAlNrjSAayHZ03o2HjE/O63dnHE3K8efAYJfJ6St4yK/cX156oGEz9NeyK5HDCU918GIvjjJ5IBNMEE2yW3sMwOz5sz+87vvvvsE2EvYK6sAd975k2UHzDngk5W2tuwxSQBlxp95A8l/wxWBPsPPBdY4aQQPS8vjeJkcqmfizDKhJzLHgvqyKw3M/hsYwzv5sTSxZHJ5zaOsVyHsVdvuI/uEk4T3C37QuotbqvHXBwy19LKuAHr9GvJQ6erq/IO58+Z+fdWqVSMwzhh3DyDa8zxnzpwvNGb7jZ3cM5kGlIKlnRs3ztuXTHE/Q195mlWxfF6L4FhhUCyTLyGnua6xtH76I700vhAISt1phGT011xtKpbW5LdNMz8VsdKl9dH4tR2AjE1ev/QElPJzV1Fzb4PVNnTjW3SI3nxVHwocfeaZZ34c9gLGXQEc+eKj/ldnZ9eBsetfcSb+LAzTqIaO7fldyjjioE8NkzEheOYM1E5vnI4iIQUgH7Tj5wkDERintPTMI6CjESRVk/HSAPLlUM2CXavxtvGoUFK58ncBoJs+CxuuMdD4uxuAOgykqy7e+jqeAL/XjVixKjB71py/uv322w+Hcca4KoCbb775Zb0zZ34g0mrABJ94ArRxxBtcIOEA59znCZB45WZJYFqmR8htwKgSgJ6jrYsmsOiriaIcfOciPAakYh5nZbKQk3VZxeIpwcLAmCvtqxcjkxl+qQOY8hBLiKku4CxumVCCJuuYQS5zW5mIPYIKtLd3dB/0/Bd8AcYZ46kAzIIFB/6ftra2DgN0so9qw7KuP3ga2OTEaelMAZ/xJ6UUpfNTJZB0K3bftXP0lOKWPjqBQeWISvnpMwm6ooHRFg95wl8mW8lTWI30Oghn3puBZOaoFIZ5YZkn+uqYdhLuCdiX05BBMJkQ7O2dfurq1atPh3HEuE0C3nnnnafOmT3n0/GafxukM550HiCdCMzOk6MdIilKwbiTd3ziTk7VaTwiT84loyCdZMpVIKOBsQcUZRWVRuPlOTspbXBbbJkdIdTzp9QyNZD8hczuneW3WYkQT5P704owYzP0vlDBR5aZvmvVHts72l85b97cr4zX14fHxQM4++yz22bNmvO/022+kAq/sP7a4l8DmSZ3QbUmyDQ5wHRY4IWSn9DyrRQPWoZd2zZgnxIEfYcf4fedlzebTWsJNbXrYSC4OxkRNDeI1tnd/APOfUClDphXQVT46D31WHJQePWwZwjprRT3AmRMZhSTpwandfccccYZZ47buwTHRQF86EMfeld397Ql2TP+JM7Vx75zUOjkST0t3rkZSn5U2MqCbCzJ7XBjxvjl7OZfQkugdZU1pWTp6ApvBs89GA1EGViooIn7LyVSpFP3DKSn6TWLOMz+G70/yXRa3dg5934j2YlekTdr1qxPXX311b0wDmi5Aois/4wZddef7PRzrT8AuzkOkskor6BSQfd1sBKKRXYCKIDofFhktSYUko6anlNF6LkuJKxpDjqMKEfSx7kxpELSGFI+EIIsFQi65zIbmtbJL6d4F5pptDKTDpm7OrsWHX74ERfDOKDlCmD58j9/Z1dX15HG8J1+zEqDyfEE8i2G8dBpjHrzGMlwIhYND/Lhk33NvXXc9FbKRp4ySl48Qq1S/EOn3mOrQAqf8DfheRVCzyu+Pk/5qFA9F646Dh6lkO1vHNWQQKemKwKRMZ3R2/uRL37xizOhxWi1AjAzZ874y8ZLPdOxv8OhpMIi19/yuA/t5KRDgGJXn1tFbI0kMPlGhdY4IjlK5VAyzNxxUaaqlFQhbTXyLH8LGrcwL6NLr0jGlQDta8gjC5UA2nLVzEm2uVn7vIAKdHZ2z3vd617f8rmAlq4C3H777W84YM68T2TbfclLPmKkz+/rXgDf5gvg8xToSz4zLtaX3ZWC9NQ4nZ7cNBFnvCcI4yc8ewv0upsAkqSsOUgbyuaRaeiRVqdlsJk3ztT7bllZH8s+Ncb7otsXQFlBQNLHDM3cW7aTKfB5AOJbQKWtctTcuQdc3soVgZZ6ALNnz/2AST7iGUEXJ5PrcmUnwqrRPNT5nMzaG4efMjbjimXVaKQzmjmdBNDsjfGzFv2AtGFGQ6VtkLd3usvO13YlymXnXnDNklUPy9wsdA24J9w4za6PWn7jehba16fSvOQ1ZmVQoxnvEOzq7D74tLee9g5oIVqmAK688sq59SWLPzJZlkQLOm1viMASmuSJ4BNa8h03ToccWAVSqj/IIsl/p1OW/Y0XvGUaDx2bqhsqIXSKNx65NZ4cJF9ONdzCPHXXcvD1Q/BIts6DajzNl/RZp1p5rgDJx+nTJnluBhpe9fQZM98PLUTLFMBhhx1xVltbW1ccUoTZEXirnenP7QS2UfNvIB9/ofPRTi2tgZx1Gj0JuB0doIkscJx+LUJe9vacPuqMGY3n4uYrzzEnRdOXlPYvLGBR4ukSbwyT9UWWGEgbEEGN9z3o1h21OnrHBa7cZMOTZFK9p6dn6Y9+dMtiaBFapgC6OrrfQXYzQ9yIilutvdKLMcTpXDefKAJwG9bthCDvllsXIOmakuh8a6aFWyijULZemoj56ja2OuZ16CLL5wKVo7wSVMvSOofWB0GnoeD3KAEexvyKodK+CCUmm+UAOm7LSn0i4JAXHnQ2tAgtUQAf/vCHp3V0dr1edbUyYbYX5Mxme6yHXDJDkqd7c4pUvyQaFu3wy3RNSgfm0IqywoKjn8/kKiBqtb0Fu8z+zKjVddJShS1vYFkLCMwq6/JlANX8/MrHAPhvApYII1GnaRsA+O2N6MNso3eaH2lP31Jx/E0BA51d3WdCi9ASBfDWt57+6o729mnMqgsB9Qpzypv9jKNUsxOU6fhYSdPi9s08BtQeVAbZjcAcQSj4yawKWPOOXj6nfU1xYUod1cqWRtK5ZSXT+6K8rYgpkqZKMnmRxfk5PPpOU/S0jezD7FQrn14r6PdSS8KVmYHuru5Xfvazn50FLUBLFMD0ab3HAHP7yTnrlGmHTCw4ysbl7pe69i8FKgtjFl1487OWTzor5MvBaNxYf5nj+POVxa6jBdeSi9Hkn6ZBpd76UNItB/U45aY691iLV5SAtgnI1zdZt/QoEN9j5my1i+1PiO9f9ITt61534iugBWiJAmhvb1/MXH+nIeyFakKvbnAB3oAoNKyjOES8Vg8VrDCeTL03aXkTDjiKuIlwHSWtuLxPXqE2/rz8QfBOUEs2FGWg0kcURYBq31fqqPZ34yiIaV1dR0ML0A4tQFulfWGjgiYW5sZ0jAHy5F4SJmlSPhofIaORBkw3XGRpjOBJ06blJe1lROayDqJE94ZPRDn3YqJXdiyegaBRJSBun3HJLoMe1BMqtEY/pB2R9EMnP9DTe8H6tskywfQ9Bwm9vb37edACtEQBGFPpSi15NFERaSyTLMNluwDRjsWzayQNY4jA23wTGhF8pLyGTOgYRZBtZEbnu8IKOqXwCrLbkSg3JPlPfF1BOqtW2bQNld6ZK1iGNzcZVRFejyAX1bUMRIfx6AbOnwkvury8uzhdKGNDcF8vgaQtDKfbOkJO5cDpcyycegb1X62G06EFaIkCqNVqQ1mDCOFM+5O09lnDprSEgynWEoIfnyOk4zGmB5KGllpZ6ouySBVYdqMzLS0URALnXlMGpulBNJCSSd55IWTv5bRUhWXem5I9iqMTQU+p9wa8DVIFrAoQNHENWrwQrGIl4HEmfEqgUQxpNxT3lhZB2sXQstDt+7JqMsR3TyaGFU1L3hjcEgWAVXzGcdlTgQRLByq4JL30ppyhgyb4rBzhLQhharylXxDT/Qi0bB3leyl6wk4nymPOyxRL8BewuHojpkgBb803//LbgN3r4htRvkBN32Vk2tFyrlFTAkogM1y8EJ4VulnnXiqyQ1wOkm8K1hpuwA5oAVqiAIaHq49Hx1T4qGakwslcpOyfIvRJXDPC7pyT/G0h4ECW3Yo+qEFaQ9ntmKJU4rCJcFE9yl/kWEryla17CoCgDi9GXZDh2aAWqVh1Xz5WIWJjeBt3UJ5rI6uyfQnzomzDZG2G/Ne3p/8JaAFasgowsHtgDZKlveyYgI5d5E2HjF+8iTa92CRAZ1Dp0h/SPLX8QSlP3BmUAYSx9HMvHAFQis1LVzbcPIznfPyByjlqkaPJGLUsTEFYySfjMWoZGkn2b9bXRceUws3qzuJi61+r1mD71q0PQAvQEgVwxbfuWDM8NLwzrrBhgpqtZWKsRW3DmHi/PoobThsB3DAqAi6FPWXSlABmFeOR7MZpRJVhkkJKnWhv9VrRuGnHEbJPjLrctP9B3P/8PDlFiPKtABvIq6O3+6TCjMqeTESmCFK+jF5XAIODQ1v+8QuXPQQtQEsUwDXXrBgaGh6+XQq/07CJ4FHLnh7QaWTwWnRM8wFRBm1QmU7mBZDbsXSycsOb/cnMVWFrIp+x1EFeJIrrzPio8BtL07YBA3jbtAzQc84ITeYfsZvCp/FAyVez+AZ4VXKkvqgsKiOpsKfRiMxO1RLhr8UK4Met+mxYyx4GGtwz+L1MaqlQApALJAkaYeMIZt5QQTt3xksI3MCjuBcsQCYW0GVpQX92wQSw2KUszGfc4Rv3I4lXyC1WCJiXf4Z8ITcl6mE3+njc/qxs+xSkN1v0/yQp5deGuqlyqDUUQA329PddCy1CyxTANTd846b6ZOAGAMOWLZwZUHbVSE9dgaWWHtBVKrIMdo6iYbmE24aX1g5ylcH4Yixj8fEcu5smaAacNm0cjS60ZYSS5ehROL544Ba7VHlYxOR6gmwom5c3iLpkP9f6QzpMSMb+0XFwcHj7j+/6z5ugRWhpr7n3Jw/+fW9v7yfJl06TUviXT9KijVMTl8Ze7mXoecYA9IOjvDzjvLZJvk4san2jfjAEaSWcmLE3nC2/XJiWLs/LhMcbWqsUXQuhOZ2B1z2m0N6gXFvu7hulCF9dEppx+FoBVEJIAolRzIxfLXH9a1CtVmH7th3/9urXHf0BaBFa+kqwJ3/3u3+pjdQGMtcFwFrplCklygmQlIauS5QFkbtHKHjYvAO6aTKerMAI7rsHHCj5KlEFME3SJU8ZK2w8xzzeVqHM9eVcQ6MRk3kFhRdBqgWZrxE3wfVGnP7mq4vkK765owKS/LORM+trkeWPj7X6r1qt1TZsXH85tBAt12+rV629fEZv73JmvcXnvJyXenpUszEyrMdlHofJSgBbdHF6VnL2Dym1NEyaOdMUxu5YtFxjQCIOjUMqGjSOloHA5xpovOjZxpPFuCOnQLHDhntgnnQ59da8Tr0+BnyxY2sXFEYE7f/UKKZL4sit/86du2571fFHvhVaiJZ/F2Djs+s/W9dU/arVT4NKGDXrmqnINGwzZXEI7Igg+NCTXrHmo9P4xsnDVskQTyWxcNRtGNXPkAKMEmd4uES9M4VCr10rG8Sx6bYqqoeA8gotw848VttTAsq8CzwB9RK1NvGBWnhEtY9Tj5ku96XWP/pVR2qweevmf4AWY1x0/L13PfhPvTNmfjTVpF7LnZlpYFUyGs3o8am1Nzbz7NyledL76hDVv9SGdWlNaXczKjfkcowP0rL4MX0/jSsivroV1nm8Lki7VSX4PUFOKZFpmXJp2/KWcq0NSuMGVuDTX2T9a3Xrv2vX7p++8vgj3gAtUrkpxuXbgA8+9uBnhkeqW+z4jrhqxDplCpRpUlRowHf/kfjU2nNanABJ2cj/sQMl21qIuhU2uxFHec7zzjtqvL7zvLRlyoon1gwLW9jXbWEW9ttjVqj0GFrRben9LctP5gJ4OqPmnZd52fuDrAzZkUGZ57LCTzNJl/7qsgSbt29fAa1pRYZxMz533/HgxbNnz/xiam31+QBgFpadSW1PLTm1+iJPYycCiHdgeLbqqgTk0zSYQo5RwbXS5Y5l8hwdiAIX4ThfbK4VWtBk5Z8kNMLQuyrMl4yfNNt6pBzkXpUNYOYpZMt+YJf8qunYf8fOH79m6VFvgXHAuHgAEb5zzf/9t6HB4f9qBByNx8OqZkc3nQ2jiKNrqKScrDxUaMAtPIiyRPU40htrWP09zE0DmziWFeyxVSu1ojRM60DDktdTmTG2lTuHo5Wb3idadEnN0cjfkLTGf5+1PpC9+1D59mLSJzG5ECv8wDb9YF0BjAyP1Gf+N30cxgmtN18Et11//+sPPPB5dxmDlcx2G6aOwSgDNe31GoYP3IHvD7BxfH8AgLonwPEKZJ1IWYJuOzzCmJuv2L2AfCmh4l9WFYwn4gGFbRlZH1lH2u5l6u62ieH/SiUvf9d8nOXaGSkvkX6mCBKrhKn1x1jwIwUwMjICO7bv/NYfnHj0uTBOGDcPIMLJZ77m7t27dl9JP5rg7MiTbZk2hqAzjY8gZvcFn+BJVwycuPRclg8KEIQFboHuVK0GcMvD4jweh5Pex1+UXvwAmtQpJqeNjOeYJjC83FxPwsZhmrYM0v5QitmMMo5chmjLWMTT68RszM+FP9nyW61Fu/52rXvysU/AOGJcFUCER5966i9HqtXnQAop1YjOjZd89mark4HAlQZVMnaCxeaJtNyEyBQOVRDA6fZmjhUed5XSs2uXgmTAK0hjDoMoH/IVBOQnl98qyC+TDK0KeW0cE7YSMEgV1GgVOR8GZT/WPsh40mEBAu+raTjb9BNZ//rYf8eOHZctO++Mp2EcMe4K4Nxz37xlx+YtF6vv+9fCROAtHZNOgQ4vVwrg7gpkNCK9Ik6eyzwsrKXC0p1OE2LtOFqUEfIy5TcpEKUVAxHUQqRKAFSjoPEbWacCRCwmfRSdekaOctXTskDBtSPqRivut1bwoTHxV8usf3/fwNq7Vl/3zzDOGGvPK41773r06unTe87ORojZeCw7IZViAS8to9MsstUCOg+QUNgxSSP2Dlg6L8i3W9ENpcyocKAvxQSErGs58VWh37pR51EqWr1f/J7Qu+RNL42UA1TDrgcpPE4Az5p/DYbrE3/PrFv/hyefdcLdMM4Ydw8gxfonHv3gyEj1ORQaPmsn5DRJR0CXF8DxBii/Q0vcBcc7oHxA6CDCPi0vjkCtipxJnhTCHyHPqxiDpwCjVCVFltbH79TbHqnwO1mLvojeCrkkOZykNET+sE/qwkYTf9H4vxq97Wf7zq/uDeGPsNcUwLILTt20bcu2i0DZCq3ePNDdLd9NyvLyLPkxxizOsMKQ5NmY0BL3OFviKqMEIM5D1r/wN6Fgxhh2gfKejRbee2AK+ExhVsVCjyyIVMCJgcPEENmZ/iSKTv5Flh+jN2tDQ/gH+gfX/+6/fzFuy34Se90crV75yL/29va+vzEUMKIahjndfhpQ196esO3CmbJvfpNQkgOtAgCLE8gqY21KaxrWN3RQwtmpAecNq3v9LlPRMSrNbkEGcR9HoRqEu29K8zYJ1FWCS0Byajf7ZAYs3R+A8VN+2NjwE7n+VXz26adOO/ntx90Kewl7zQNI8ZvfPfzRocHhtahZUgTPsiDo3pakNYhxJ6KTL9L9AhEnaYDcG0BWqOemZ2ULEjQDk0M3+WFaPltSM1BuOVCjwSgvRNYPwHW/yRiclWE8eRl/Gdm1myzohXZN6IljP1SzoIRsRh9ADC2txc82B6X8ybJf9LBPfdb/3/em8EfY6wrgfe87Y8+mjc++O3piEGnnJNDG26yjaLwZH3JBZMuAJrkRCWeaKRFqJMsI9AZnvCysQK5no0+G8gWkeVNlSoa1/PNoBE0rhvw6uc8hAFdGhfmltESVkDrlVotXgh+9IMuZyvXTV9PZqtiKZEN+OuGXPupbF/49ewYfffaRtR+FvYy97hymWHXrgxcdMGfOFa6bzUKO+62zGUFzw/YtRTZdtgJA0zB+ec6HBrQyzTr9hn4sIc1kwiCqk6wfAFib7ccYLsOI0uMjQhMb/538GnmMIjmz7kYSBB/6aagcGzv9kvX+hus/NDy0fv3TS89Ydvz9sJexT3vdfXc9/q2eadPek45ZmdgzoSOxBXQj0jMl0DgYhcYF2wh+PR9wYAp7Gu/iRie75/scUkk1oRSauAYr9LxEtSlG2TaNd7VAnKm8XR4Zd4DMxSBDA0LLvMwkIg3XanzJr74yBlu3bP74iace+znYB9jrQwCKNWv/c/nQ0PBv5KuWswDxqkC4WI6bp7leyF227GZkNL4xg7prWRa0DuSmuvMS7mfO/RDXS/m1cy3PwjJaidTNHkW4dJvwy/bRnDZrqh3ib1Fk/Q35LzcvMnEneewqQNL70n6S9jGEbIdf9oLPxPrv3tF366r7r/8n2EfY5zbm5u/99MXPO/jQn7e1VWanLata0hw3W+fnFpZ6BnkvEaXegNdTyOiux0GKJGeKuRG86KTLQxlL3DrL3Bya8BbGWIfc5MZ3/TRVGY2EOhcKwwRg549APuFHN/sk1r8+7u/vH1j36G/XvvKP33fGZthH2OcKIMKPb/j16fPnL7y+fs+YR2IUv88KJad7+Y0eb+jbiY2gSSXgPQddMRmnxi5yWl5G2Wfs9Nj826ilyxNSpTJShgvhy79keSlLqbJ8bwr2CbrWfi7QR2EOACph4vYDEX7i+keWv74SNrhu/fo3/NG7l/4c9iEmhAKIcPctD31i9pw5l2mPhbqv8iYhRSM4Lx3lRDHRx5WD9hJR5xFjTeEY49FLNEUOjAxonRahVTsMXAlrQkglRl2lPOWU0n1WHLkWZjHxtXFdYvcd0CvHMtUjgew/FXwkcUg3/hDLj9btHxkegU2btlz0ljOP/XfYx5gwCqAO8/M7n/zOtGndf6wqAWZ2BT0+EVTudjuue46gU8WirQa47zSgGatqCjzVJzw+YdC9i/G4cfbNPpp4+IRRoCUVK+O1ULrx5OGjN1MTpAFOReUcEwoR/uwR3+gFH3XXf9u2Hf964qkvWQ4TAPt0ElAAf333be+tu0Y/194EmwypnImaLMjo9LlrS8kSAID2hmA+bktS0bJIWjLcK7dHIKErc0gJ0msu8LdZXXkY5TlNQuMIjR7TgUa2mSUp316qgUIJx4JfKWjlmBzeVtAtqOvO2hhEOwOSdrWTfVE4/pZfvMWXCn/frr47L//GNX8BEwTjYUjGhKuvvn/RYYuef297R9uLYgoyV5qfAfjf32dcqyu38op3AxqHZj0P96nD+J/vbcV+Go1DVq8JCW/VMFFXVmnt86vwOgyphksVGpZURtS62xPk/4hBQKYI2IafSPj7Bx5e//ijxy/7s7duhQmCCdnzbvreL176/IMO+mlbm5ntRBp2YGdc4I1yoO64EWkMOydzhFD83AAoysUp1VEOKlliVHfICqUebgHUeqGI9Ps6Y6nN6NI3kQLlzH8q6AoPO4otvtHz/dXk7T4DQ5seefLRE845/6RHYQJhwpqeW3/0wJuet2DhzaYCXSqDIe/uV8bJQvQ8Y3VDswMQgu4sE2oeg8xLKhxOBlGgitI3JZUEtuSljZEpvcWKwKnTXi6PFsGaIZJEk8MsKehl5fMAdIs4f7TXebY/fbXXwPCe5555+s1nnHPCvTDBMGEVQIS7bvztOXPnzvkWNJYHtY5kPHIkBNjLbzxLg0AmBl0l4a4KgEchEOWkKgLjq7pDsjlJwZJ+b5lbWkIoW9oztHrtDUWBypmXRedHQcN0lgTIPIBVAHKn39DQyMimDRvPOmXZq2+ACYgJrQAi3H3zwx+ePXv25xs1zb6D53Z+KdjOmbEhIyIMIaqz/tSSy6VBVrZxlyAVJcQURymkCdKpulZgFAIndFrr6mAUWskcsEiFlMtPThIzZYCCK50gBHDG/Om3/Brv9Ruq1jZv3nzhSWcd+02YoJjwCiDCz/7jsctmzpzxieymZMKQBfgZl3BBEvy+cbyw9pqS8H54lOSlV8dXZx9Gd5vK2VZk3gkq6ccXVqPYO4piWnGs3gHmnOquP58FQLYCZI+J8KdWH9O3+kSP91Zx46bNH3nrWcd+ASYwJoUCqMOsvv2Jf+ntnf5+dsM8tZfjbx/dDXvceqYE9CcKufV3lUCWviFw/mZ3VUM+f2uQ544bKPfOfn8OowPmBsumzU2GmJsCxUw/pWUz/2hf6lFL1vuHh6uwZdPmT538zmMvyyl9QqANJgkOXjzn1hctWnJoR2fHMeptFRZWN7juE3hFqwHZufqyUWOzcs7dsmJartZSiCVc/mb0g+rCG6dMf3g8QSuXXy76kiJAcX1RTy99gmzCT3vARy73xRN+I8M12Lp129+efNbL/xYmASaNAli1ahVWpvXd9NIXn3BUR0f70V5GYp7dfq4rBr8SMIQnTU95c7wHmVahubKoCR94PJlWw4hayUKNwt9CEMG1Ytis8lG1m7Ixy7AUGpPdK8CF37r+GG/0Ia/yjjb6bN287W9POmvJ38AkwaRRABHWrFlTO+jQWdfXPYEldU/gSC+jb3OQphwMVwDW1U9JxuHx0rJzloHNs7AzkxWGZjq+cU+ZQQQAzyJKAZHWI1V+pigDFaMbEhh+xKL8TQ4TdeEVOgBrrGzGH60yQOCWv5Y81hut9deH/Lhl89ZPn/zOYyaF5U8xqRRAhLonUF0y+5AfLVx82DEdHR1HuBykE6iKQFhqR2B96/vaI8GefQGNoC5I6qpAjsCbQoJbRgnmJiH9Fa7c1HJGJ/FKmUXjeBByb5xoNY0Szz8cQ9b4AYTbb8f78RZfrG3euPljb1328n3yUo+xYNIpgAi33n9rdcmsQ65dcOhhkSeQKAHpwiY02ldTOEMB/6Ye7Vyf/Xett1wSlCj0CgrkVzfgSfl0Xk+ZTytUDarmoZmOXrlkMluoJIrLcFREgcRrLj+SMDtnS338F1n96PPdw0O1kc0btlx06rtf/q8wCTEpFUCESAkctPi4a1+46MCX1D2Bo8ARNuIMM4EXHkBG4poi3823Lr2+7i/cZl1SoaiDlxNSno8hZefogFFC1nkcPA7ui3OyF8ZlNnwWn8UpW33ZWr8c8yN5pDcR/sjyDw9W92zeuOVdp51z7PdgkmLSKoAIq1ZdU61MO/JHL33xiw6rK4GX2X6Q4wVQAfeEDTlRFQCz9sIjYAJvcm3/aFF+GFGsZEYPzCm3fA46mhlSCGFGelQsfza5R7wHJPnQMX+2vz+d8LPP9NeFf/NzG5879W1/8qofwyTGpFYAEdasuam2Y+Cp6171sjc+v7Oz8xXuoFBYfCmcTA+YTEtoykJ39zmdFyEts0dYmjXPXn5eb0rHZsvwF5HUIWljk563QtEkwhgb3Xg7fxIurlCWg9eLoELOw3SCMBF4AL67L3X767+B/qFH1q1f/+Z3XnD8r2GSY7zMw75A5d7bnvjn6TN6L7GTgLYTuBYfQN+tx4Xa9QBcV98QxcHSMBjnrGiCygvjy41cHHWC0mh+0iLQgQYN+zlL51kw+5dbEoLj5mdn6J6zI5nxz2b6kx1+/bv2rHriqSffee6H3rwF9gPsTwoggvnZrY99ZuasmX8VWyeqAIALPLty8QwAYfArAGndlTS2ZD+wQHCkfLEAgn4NvkxyPenySBUM0zJjVSxYnAN6A/oVSkvfOEXG62zwAWH5yZd7dm7fdcXPrv7eJSuuWTEE+wn2NwXQwM9uefR/zZw9+1IwtUZY28PCHwUmrn0Sb8OGDwu04YDNlFFymxeVeCTj0hKw9UFCUDwCXmhrgXyqsTmV0Hx90OsdKCrA2errG+/TTT52rB8/0Rdt7a0Nbt+y45JTznnJV2A/w36pACLc8x+PfXbmrBkfd/axG3eMnivYLOy6/5TOFQXlSYD+8b9u3EoKiLEiR6+F52EVRevVADaZaawmytcGvSR/HsjmPejOvsZ/BD7Zl0741ejWXoye5V+34dln33XWe//gPtgPsd8qgDrMfSufuHL69J738MeIk1dxGeLON/5J99244/w866+kyaBZ+4zO+iWPKlQEBsw4Wn8+wPBx2DIxLwNoKpJw5fA18TBPZu2TCE0B1KjbXwXo69tz6xPrHz73gktO3QT7KSbSS0FbDVz9wC/eNzQ8/EASjK2/waTPNkZ7VA/wkTsJGHriSIIyvkj7YPYVGkUhYHbgw1YEMvNNNIT29V6wL+9kz6SjYWvYMh2W/Llp6G44SMqhT8bJ+snLJstqMLo6sPqL9mJpa2AFPas7JAIOXNiTCb7GLP8IwshgbWjr5m0f/8kD3z59fxb+CPuzB9DA7df/8lXPW/S8++pX2gbUHRbjetcLEC6+4JfncXLSnKgohgadsDgWChiPZtV09z71b4hHwHjRf6fRTzbeaNKORRmx3BRe1HLOyytWJI26oZsJ8n+ApGGzN/0CZFt6o2Mt+1QXwlD/8CObN294z9v/7NV7/UOd+wL7vQKIcP9PHv9+T8+0ZZzqE3ox2Re7DTo9cx1oPAjh14YDySlaGgoiCl4ncZa3RiO8RqH5UBDNBb+QWXAU84NPoH35oKIwUJvxp4/xAtglPrA7+6qIu3b3XfHIg7/8yw+uWLYbpgjaYQpg245NV/T0HBwrAObuW7uZwjg8kh+cST/O6xN+I/qpMPOZlRLCitLOA4l3LbHzqnGmSYoFV1c8INI3owik9bdUlRfzcpLugm9LL9qs0G724cOYZCgQzfIPjqzbtG3ze99+3stvhymGSb8TsAx6Hqk89cpTTvhgpa0yTZ3US6x8w4U3nnjqITQOMh6grPDH53Z+IBN6xsOdeVcwaJ2o0Nt6ubyuwiiEWi6PzvcvmlMSWOj1WMF2wsgVmP4wD2STfLUhrO3asfuK3zyz9h3nvW/pWpiCaKInTG785z2P3tbdPe0k6eZz15/H2fG/FXBdMQA4ygABaPOitPTpP9Jp2XiVJWJJc4C0Bjk8QOqMhVw8eyxTEadOiv0WPCSU74YIy4+MH6nwI9nYk7r7tfh8oH/ov7ds2/KBd1z48p/BFMaUGAJEqFarD9YPJyV2BqTuY0NlSgMp/DbE4zivzMWBMt5lgkIUCGJZibNX5y+Q2utmJDlpM+RKQ70Mp07ozdOraNSgUJCAQoECE3pIXP5aw+zHn+kaGartquPvv3b9VV+4Zj/a0TdaTBkFgFh9Ou1wTFyNPtZ3Lb3lMJryyBN+f/8HOzxANVwsYGVBBd+IMD/TRVamz7fQaZJ83eXmgzQ9oXKnIOfxXSDWv2a/0YcjUOvbs+eq9U8/9lfnfeRNT0NAA1NGAQwMDm7sneFafuoNZCJsLJnbfCI4aJSxv9/ys66OvPTGMbGsSAyz4wlw86cVUwKu4EtgviYA1QNwyiDaC305oJ43KjFCGabp01n91Nqns/2x4NfDVVN39wd/umXTxv951vJX7pe7+caCqeMB1Ko7o2M6tcYtPTgPB7EXgAI4PoAlJOnRKgF0UqSVAA8tFWwrcUjMp1QELLNRewZSESjWGDXFVaxAvOKtaUBGRjcHdHOUQk+FPxvvR+P8gZEH+3Zu++RpF7zkBhhDS+3PmDIKoA0rAw5RkVE5mtcnCoGE7bnMI9d4oqBldGo9DVcQ7FRRBqMC3ZPvccl9FK8OyhkioD9P7vlT5Scf3omP2Q7AWjLubwi+iT7E+eiOXbv+7tu3fOqqa665pgoBXkwZBQDtZqTRW5RnZtWpPCMFn6egFj8bKwgrHZM0H51IDlpOpgRyNgTpAueP9SKVeZmH12VP+fzCnWaKPgZNl1EOcsFsq0Rq7RO63f6LVvAHhx7q37X7f1/75X/83lfWfGUYAgoxdYYAlTb0T9cZAOctvjJEPYBU4I2SmxB41eILgU2UALN2YMjsv7HWrxBSGRQoB3TTY6HGoUMVmZ+uIHzeEAqNgEz4MWse19WPo2v1Mf7QwOC9u/p2/9OVt3zy+mDxm8OUUQAm6ilGCgSAfArQCEHX9glkfMZwq2/kq7cMs5eGbVMVugHTnz6BliqFDHnT64o3EufBByeYm4HOUbwiKdQH8hMUNCLnQAXeHomrn/7q1r42AsN1wf/R9m2b/+8fLX/ZaggYFaaMAhjGWpvt/NaKO5N7IGx5Ktso+azQZ8KGHrc/E2IDjgZInvJD4fLHx6TGXGpo7UgRttQ8Ic0UCYqLKkyTE4/l4+QDPGzjjgw32sVkSgBrlbrUDz892N//9XUbn/j3Cz76hvUQMCZMGQXQDphcqzvrz1/ppXsCbE4A89x+YvUzK8ylgC718QiShm5tBc6vy5scdxeJLYD2OjIUeQoXJDlV8kYlhlp2FgZm4cmBuPfJEAhjaz84MHhr3+7dX7/+F5+75StfCeP7VmEqeQCd0dF9yUcMozwVCB73v6EPUutM6Sm0R4ERhRARy5Z1eAA7422YgDQv4MVjf2S86M3H3X9A5gAQxJADndl8GpZj+0zQIbX2SVNVAYeGRu7vH+i/at36R77/3k++aQMEtBxTZxmwzXRxCh3Lgz0H450PoHEyPaKlUaAQmsz6Z4LPzzF1e4EIvuYGOGX5FQI6ykAIPKt7zlQj0wMkjxovnSmATNDtMZvgTK87ei9NdD4CtcHhoV/Ux/bXbtj89A/O+chrHoeAccXUUQCmbVp6Tux+8p8KeEpJhwqxyy+3A0O2CgBJPDjuLz3XBd84s9qpFWQWn64GqMAsDoGKsv3P6s6OhItYcZ67oQyCLtODsPgmI9KnHjF5W1J1pLpraHjwruHB4ZufePzhW9674g+fgoC9hinkAbT3ANAxfgL5Mg8w2TCB7RLMhCNv/A/AxtVE6GOKdaezXWvRsQbW+tM8mPeQEqSA2um/tJ5xVRG4ZQeRRuYN4A43EJxhC+HLPIFE+qkXROc50iFOFFcbwaGRkaH/HBqu3TXQt+vH37/nyvu++c0V7iatgL2CKaMAOtojBZAiEXrDXXq/J2CS2X4i9KgdY6CYwEuG9jG9BnzLamr9a8YKkDKHwN+hi+xSsjg6IEdNsOO0qA0f0IicYxoLp647EEueJTI8nHgyQ8PDG6vV6i9q1ep99Um81ff/6ub7V/zLB6fMG3cmOqbOTkBjur1RVPAT688tPPUabBgJ1XZ8mysQK9+gE4FP96un69qNYUStUp/4Gt5Qp62tVoeeqQvO7kqlYtoqbb3t7R1zEaoLjWk7uKOjfQ6Y+GUuyHSBVA9WBSEJOsoEjTuup8KPNA+qWJKhT8RbxaHBocEn6uG1dbf+v/oH+x94+tnf/+r8vz5uXXzlARMRU+hxYNOYAyie5ZebgJI0zhAAuKuO5BSF8NfseeM9dLVkPBw9rjrSeFptTX3i6zvPbXj25nf++dG/A2biHZjlyy+ffsoxpx40e/aMg+r64eCuzp6DarWhRe0dXYsqUJlfg+q8utqYVx/2zKgY01nPrGLoKAK4H5A+9JMGssIb9YzeoYFD1erw9mqttqkCbZtqteFnqjV4qjY89PTwSO2xbTufe+KmH37+yW+u+mZw5ScZDEwR3Pez//7nGdNn/UXFVOoXXf+Z6I3obfF5+mtISRoWCoFu+0WwE2PE7WX70zNLj8TiY8PaR+fVERgZ7B/44YbNGz9/xp8dOi5voD377LPbune8sHvJkuOnL1y4ePrCA+ZMb+vqmdbd3tFWN9kdCB1t7XUTMDJSv+rKSH0GHqsVGBzaNVgd2r5jQ9+63z+867cPPb17YNb9A2GL7f6JKbQVGHqZC4+xu0+d+5jGXX8jx+R0zC+EP1vHR+reJ8fGN+WjWW+o9vcNfHfD1qf+/swLj3wYxhGJ0PbB7fVfQICCKaMAKm1t08Hr/gNwxSAn++i5sZYegFl+oBN7icWvJWP9WtVgf9/gj57b8Mylb7vo8AchIGACYCpNAvYKQjKxLecAANyn/PKFn87uZ2P8TPAB9vQN3Llt86ZPnHzBIT+HgIAJhKmzD6DS1p1aePsgQIWEtUeBrPCzMX86kSZn9TNXH+JXUQ0M/nLHtu2feOM5z7sNAgImIPbnbwNymIrdCoxiGJDN4lM6iLE9MIufvmY6tfaNd82PRN+WAxjcM/L4hg3PnXPj/Z97dRD+gImMKfROwFoXs/5INvg09GDFVQxssg/5TH8tefFkFTNXf3iotqmvr++y79757X/70pcuGYSAgAmOKbQPADr4uD+NAGLw+aO88SYXENbfuvy1RPjrgt9fH+d/4aHH13zu/A//4XYICJgkmDqTgDVj3weAqdU3ZIuv2BKRTu6BcXfv1eIlvdoI1Hbv3vP/fv/M+k8te99L1kFAwCTDVFoFqDmCnpl7kzgCBthbe9CQvfqQfVYq2r3X3z941+YNm/7y5PNeuAYCAiYppo4CABhiD/M0hD9WCFb4E/VAX86RufsQv3m2f+jhTdu2fvwt/+P54V3zAZMeU2YVoIJtOxsPrWRW3R6twAPZshuP8aNZ/cbM/kBt85Yt2y657qv/sKQu/NdDEP6A/QBT55Vgw8O/74pfCgZA9vanL99JRwNslr8aCT8O7N7V9+XHnvrNZ85ZvnQbBATsR5gyCmCkVvt53dpfGIfsUMAkj71mj9Wm23dHTK2vb8/3n33m2U++7b1HPgEBAfshpswQ4Pe/e+RHtRHcZWfyDZnVT8b5jY08Bvp2Dt7x1Lp1r331abP+OAh/wP4MA1MId9/yu/ceMGvuFdEbAtNHgOM311QihYAD/YMrt2zd/vcn/fHBP4GAgCmAKaUAItx13ePvnDlj7t90tXUdHV3+8ODw70eGqzc99cxTX3/7RS/5NQQEBOz/WL788t7ly1f0QkBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQMB+iv8PDIsJ2E/1C5QAAAAASUVORK5CYII=", alt: "", "aria-hidden": true, width: 18, height: 18 }), "产物"),
      () => {
        if (available()) toggle(prefix + context.channelId);
      },
      { "aria-label": "聊天产物", "aria-expanded": pressed, title: "聊天产物" }
    );
  }
  function Markdown({ text }) {
    const inline = (value) => value.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map(
      (part, i) => part.startsWith("**") ? h("strong", { key: i }, part.slice(2, -2)) : part.startsWith("`") ? h(
        "code",
        {
          key: i,
          style: {
            background: "var(--surface-inset)",
            padding: "0 4px"
          }
        },
        part.slice(1, -1)
      ) : part
    );
    const nodes = [], lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i], heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (/^\s*```/.test(line)) {
        const code = [];
        while (++i < lines.length && !/^\s*```/.test(lines[i]))
          code.push(lines[i]);
        nodes.push(
          h(
            "pre",
            {
              key: i,
              style: {
                margin: "12px 0",
                padding: 16,
                background: "var(--surface-inset)",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                fontSize: "0.875em"
              }
            },
            code.join("\n")
          )
        );
      } else if (heading) {
        nodes.push(
          h(
            `h${heading[1].length}`,
            {
              key: i,
              style: {
                margin: "20px 0 12px",
                fontSize: heading[1].length === 1 ? "1.5em" : heading[1].length === 2 ? "1.25em" : "1em",
                fontWeight: 600,
                paddingBottom: 8,
                borderBottom: heading[1].length <= 2 ? "1px solid var(--border-primary)" : void 0
              }
            },
            inline(heading[2])
          )
        );
      } else if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
        const ordered = /^\s*\d+\./.test(line), items = [], pattern = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*+]\s+/;
        do {
          items.push(
            h(
              "li",
              { key: i, style: { margin: "4px 0" } },
              inline(lines[i].replace(pattern, ""))
            )
          );
          i++;
        } while (i < lines.length && pattern.test(lines[i]));
        i--;
        nodes.push(
          h(
            ordered ? "ol" : "ul",
            {
              key: `list-${i}`,
              style: { margin: "12px 0", paddingInlineStart: 24 }
            },
            ...items
          )
        );
      } else if (line.trim())
        nodes.push(
          h("p", { key: i, style: { margin: "12px 0" } }, inline(line))
        );
    }
    return h(
      "div",
      {
        style: {
          maxWidth: "52rem",
          marginInline: "auto",
          lineHeight: 1.6,
          overflowWrap: "anywhere"
        }
      },
      ...nodes
    );
  }
  function TextPreview({ source, name = "", compact = false }) {
    const [data, setData] = R.useState({ pending: true });
    const [retry, setRetry] = R.useState(0);
    R.useEffect(() => {
      const controller = new AbortController();
      setData({ pending: true });
      readText(source, controller.signal).then((result) => {
        if (!controller.signal.aborted) setData(result);
      }).catch(() => {
        if (!controller.signal.aborted) setData({ error: true });
      });
      return () => controller.abort();
    }, [source, retry]);
    if (data.pending) return note("正在读取文档…");
    if (data.error && compact) return note("打开查看文档或来源消息");
    if (data.error)
      return h(
        "div",
        null,
        note("此文件暂不能在面板读取，可打开来源消息"),
        button("重试文档", () => setRetry((n) => n + 1))
      );
    return h(
      "div",
      null,
      !compact && data.truncated && note("显示前 64 KiB，完整文件请从来源消息打开"),
      /\.(md|markdown)$/i.test(name) ? h(Markdown, { text: data.text }) : h(
        "pre",
        {
          style: {
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            font: "inherit",
            margin: 0
          }
        },
        data.text
      )
    );
  }
  function Detail({ entry, connection, channelContext, context }) {
    const session = connection.session;
    const channelId = channelContext.channelId;
    const source = entry.attachment ? session.media(entry.url) : void 0;
    const textual = entry.attachment && /\.(md|markdown|txt|json|[cm]?[jt]sx?|py|rs|html?|css|ya?ml|sh|go|java|sql|csv)$/i.test(
      entry.name
    );
    const openMessage = () => {
      if (!canRead(ctx.relay.snapshot(), channelId) || ctx.relay.snapshot().session !== session)
        return;
      const separator = connection.scope.lastIndexOf(":");
      void ctx.navigation.open({
        version: 1,
        kind: "conversation",
        scope: {
          communityOrigin: connection.scope.slice(0, separator),
          viewer: session.viewer
        },
        channelId,
        messageId: entry.message.id
      });
    };
    return h(
      "section",
      {
        "aria-label": "产物详情",
        style: { minWidth: 0, overflowWrap: "anywhere" }
      },
      h("h3", null, entry.name),
      h(
        "div",
        { style: rowStyle },
        button("回到来源消息", openMessage),
        button("打开链接", () => {
          if (context?.canOpen(entry.url)) context.open(entry.url);
          else openMessage();
        })
      ),
      textual && source && h(TextPreview, { key: entry.id, source, name: entry.name }),
      h("h4", null, "来源内容"),
      h(
        ctx.conversation.ui.Conversation,
        {
          session,
          scope: connection.scope,
          channelId,
          channelName: channelContext.channelName,
          threadId: entry.message.threadRootId
        },
        (interactions) => h(ctx.conversation.ui.Message, {
          row: entry.message,
          session,
          scope: connection.scope,
          profile: session.profiles.snapshot().get(entry.message.authorId),
          media: session.media,
          day: false,
          retry: void 0,
          startsThreads: false,
          ...interactions
        })
      )
    );
  }
  function Board({ connection, channelContext, context }) {
    const [store, setStore] = R.useState();
    R.useEffect(() => {
      const reader = createReader(
        ctx.relay,
        connection,
        channelContext.channelId
      );
      setStore(reader);
      void reader.start();
      return () => reader.dispose();
    }, [
      connection.session,
      connection.scope,
      connection.generation,
      channelContext.channelId
    ]);
    return store ? h(BoardView, { connection, channelContext, context, store }) : note("正在准备产物面板…");
  }
  function BoardView({ connection, channelContext, context, store }) {
    const { session } = connection;
    const data = R.useSyncExternalStore(store.subscribe, store.snapshot);
    const profiles = R.useSyncExternalStore(
      session.profiles.subscribe,
      session.profiles.snapshot
    );
    const [category, setCategory] = R.useState("all"), [scope, setScope] = R.useState("agent"), [query, setQuery] = R.useState(""), [layout, setLayout] = R.useState("grid"), [starredOnly, setStarredOnly] = R.useState(false), [selected, setSelected] = R.useState("");
    const [root, width] = useWidth();
    const scroller = R.useRef(null), lastScroll = R.useRef(0), lastTrigger = R.useRef(null);
    const inspect = (item, event) => {
      lastScroll.current = scroller.current?.scrollTop || 0;
      lastTrigger.current = event.currentTarget;
      setSelected(item.id);
    };
    R.useLayoutEffect(() => {
      if (scroller.current)
        scroller.current.scrollTop = selected ? 0 : lastScroll.current;
      if (!selected && lastTrigger.current?.isConnected)
        lastTrigger.current.focus({ preventScroll: true });
    }, [selected]);
    const storageKey = bookmarkKey(
      connection.scope,
      session.viewer,
      channelContext.channelId
    );
    const storage = () => {
      try {
        return globalThis.localStorage;
      } catch {
        return void 0;
      }
    };
    const [stars, setStars] = R.useState(
      () => readBookmarks(storage(), storageKey)
    );
    const [saveError, setSaveError] = R.useState(false);
    const entries = R.useMemo(
      () => artifactsFrom(data.rows, profiles),
      [data.rows, profiles]
    );
    const shown = entries.filter(
      (e) => (category === "all" || category === e.category) && (scope !== "agent" || e.agent) && (scope !== "files" || e.attachment) && (!starredOnly || stars.includes(e.id)) && e.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    );
    const entry = entries.find((e) => e.id === selected);
    const reset = () => {
      setCategory("all");
      setStarredOnly(false);
      setQuery("");
    };
    const star = (item) => {
      const next = stars.includes(item.id) ? stars.filter((id) => id !== item.id) : [...stars, item.id];
      setStars(next);
      setSaveError(!saveBookmarks(storage(), storageKey, next));
    };
    const openMessage = (item) => {
      const current = ctx.relay.snapshot();
      if (!canRead(current, channelContext.channelId) || current.session !== session)
        return;
      const separator = connection.scope.lastIndexOf(":");
      void ctx.navigation.open({
        version: 1,
        kind: "conversation",
        scope: {
          communityOrigin: connection.scope.slice(0, separator),
          viewer: session.viewer
        },
        channelId: channelContext.channelId,
        messageId: item.message.id
      });
    };
    const pageAction = (method) => {
      setSelected("");
      void store[method]();
    };
    const fieldStyle = {
      ...rowStyle,
      border: 0,
      margin: 0,
      padding: 0,
      gap: "var(--space-1, 4px)"
    };
    const collectionId = R.useId();
    const collections = [
      ["agent", "Agent 产物"],
      ["files", "已分享文件"],
      ["all", "全部文件"]
    ];
    const scopeTabs = collections.map(
      ([value, label], index) => button(
        label,
        () => {
          setScope(value);
          setSelected("");
        },
        {
          key: value,
          id: `${collectionId}-${value}`,
          role: "tab",
          "aria-selected": scope === value,
          "aria-controls": `${collectionId}-content`,
          tabIndex: scope === value ? 0 : -1,
          onKeyDown: (event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const next = event.key === "Home" ? 0 : event.key === "End" ? collections.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + collections.length) % collections.length;
            setScope(collections[next][0]);
            setSelected("");
            event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus();
          },
          style: {
            ...selectedStyle(scope === value),
            whiteSpace: "nowrap",
            borderRadius: 0,
            borderBottom: scope === value ? "2px solid var(--text-standard)" : "2px solid transparent",
            padding: "12px 8px",
            background: "transparent"
          }
        }
      )
    );
    const controls = h(
      "div",
      {
        style: {
          ...rowStyle,
          justifyContent: "space-between",
          gap: 12,
          padding: width <= 576 ? "16px 12px" : "16px 20px"
        }
      },
      h(
        "fieldset",
        { "aria-label": "产物类型", style: fieldStyle },
        ...Object.entries(labels).map(
          ([value, label]) => button(label, () => setCategory(value), {
            key: value,
            "aria-pressed": category === value,
            style: selectedStyle(category === value)
          })
        )
      ),
      h(
        "div",
        {
          style: {
            ...rowStyle,
            gap: 12,
            width: width <= 1040 ? "100%" : void 0
          }
        },
        h("input", {
          type: "search",
          "aria-label": "搜索文件名（本页）",
          placeholder: "搜索文件名",
          value: query,
          onChange: (e) => setQuery(e.target.value),
          style: {
            width: "15rem",
            maxWidth: "100%",
            minWidth: "min(100%, 8rem)",
            flex: width <= 1040 ? "1 1 8rem" : void 0
          }
        }),
        button(h(Icon, { type: "star" }), () => setStarredOnly(!starredOnly), {
          "aria-label": "仅看收藏",
          title: "仅看收藏",
          "aria-pressed": starredOnly,
          style: {
            ...selectedStyle(starredOnly),
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }
        }),
        h(
          "fieldset",
          {
            "aria-label": "显示方式",
            style: {
              ...fieldStyle,
              background: "var(--surface-inset)",
              borderRadius: "var(--radius-control, 8px)",
              flexWrap: "nowrap"
            }
          },
          ...[
            ["grid", "卡片视图"],
            ["list", "列表视图"]
          ].map(
            ([value, label]) => button(h(Icon, { type: value }), () => setLayout(value), {
              key: value,
              "aria-label": label,
              title: label,
              "aria-pressed": layout === value,
              style: {
                ...selectedStyle(layout === value),
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }
            })
          )
        ),
        button("刷新", () => pageAction("refresh"), {
          disabled: data.pending,
          style: selectedStyle(false)
        })
      )
    );
    return h(
      "section",
      {
        ref: root,
        "aria-label": "产物看板",
        style: {
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          minHeight: 0,
          height: "100%",
          color: "var(--text-standard)",
          boxSizing: "border-box"
        }
      },
      h(
        "div",
        {
          role: "tablist",
          "aria-label": "产物范围",
          style: {
            ...rowStyle,
            flexWrap: "nowrap",
            padding: "0 12px",
            borderBottom: "1px solid var(--border-primary)",
            overflowX: "auto",
            flexShrink: 0
          }
        },
        ...scopeTabs
      ),
      h(
        "div",
        {
          id: `${collectionId}-content`,
          role: "tabpanel",
          "aria-labelledby": `${collectionId}-${scope}`,
          style: {
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            flex: 1
          }
        },
        controls,
        h(
          "div",
          {
            style: {
              ...rowStyle,
              justifyContent: "space-between",
              padding: "0 20px 12px",
              color: "var(--text-subtle)",
              fontSize: "0.875em"
            }
          },
          h(
            "span",
            { role: "status" },
            `第 ${data.page} 页 · ${data.scanned} 条消息 · ${shown.length} 项产物`
          ),
          data.changed && button("有新消息，回到最新", () => pageAction("refresh"), {
            disabled: data.pending
          })
        ),
        data.error && h(
          "div",
          { role: "alert", style: { padding: "8px 20px" } },
          data.error,
          " ",
          button("重试本页", () => pageAction("retry"), {
            disabled: data.pending
          })
        ),
        saveError && h(
          "p",
          { role: "alert", style: { paddingInline: 20 } },
          "收藏未能保存到本机"
        ),
        h(
          "div",
          {
            ref: scroller,
            "aria-busy": data.pending,
            style: {
              overflowY: "auto",
              minHeight: 0,
              flex: "1 1 auto",
              padding: width <= 576 ? "0 12px 20px" : "0 20px 20px"
            }
          },
          data.pending && note("正在读取当前聊天的产物…"),
          entry && h(
            "div",
            null,
            button("返回产物列表", () => setSelected("")),
            h(Detail, {
              key: entry.id,
              entry,
              connection,
              channelContext,
              context
            })
          ),
          h(
            "ul",
            {
              "aria-label": "产物列表",
              hidden: !!entry,
              style: {
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: entry ? "none" : "grid",
                gap: 16,
                gridTemplateColumns: layout === "list" ? "minmax(0, 1fr)" : `repeat(${width > 1040 ? 3 : width > 576 ? 2 : 1}, minmax(0, 1fr))`
              }
            },
            ...shown.map(
              (item) => h(
                "li",
                {
                  key: item.id,
                  style: {
                    minWidth: 0,
                    border: "1px solid var(--border-primary)",
                    borderRadius: "var(--radius-control, 8px)",
                    background: "var(--surface-panel)"
                  }
                },
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: 12,
                      minWidth: 0
                    }
                  },
                  h(Icon, { type: item.category }),
                  button(
                    h(
                      "span",
                      {
                        style: {
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }
                      },
                      item.name
                    ),
                    (event) => inspect(item, event),
                    {
                      title: item.name,
                      style: {
                        ...selectedStyle(false),
                        color: "var(--text-standard)",
                        textAlign: "start",
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        padding: 0
                      }
                    }
                  ),
                  h(ItemActions, {
                    item,
                    starred: stars.includes(item.id),
                    star,
                    openMessage
                  })
                ),
                layout === "grid" && button(
                  h(Preview, { entry: item, session }),
                  (event) => inspect(item, event),
                  {
                    "aria-label": `查看 ${item.name}`,
                    style: {
                      display: "block",
                      width: "100%",
                      border: 0,
                      padding: 0,
                      borderRadius: "0 0 var(--radius-control, 8px) var(--radius-control, 8px)",
                      background: "transparent",
                      textAlign: "start"
                    }
                  }
                )
              )
            ),
            !data.pending && !data.error && shown.length === 0 && h(
              "li",
              {
                style: {
                  gridColumn: "1 / -1",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "14rem",
                  gap: 12,
                  color: "var(--text-subtle)"
                }
              },
              h(Icon, { type: "grid", size: 24 }),
              note(entries.length ? "没有匹配的产物" : "本页暂无产物"),
              (query || category !== "all" || starredOnly) && button("清除筛选", reset)
            )
          ),
          h(
            "div",
            {
              style: {
                ...rowStyle,
                justifyContent: "center",
                padding: "16px 0"
              }
            },
            button("上一页", () => pageAction("previous"), {
              disabled: data.pending || data.page === 1
            }),
            button("加载更早产物", () => pageAction("next"), {
              disabled: data.pending || !data.more
            })
          ),
          h(
            "p",
            {
              style: {
                margin: "0",
                color: "var(--text-subtle)",
                fontSize: "0.875em",
                textAlign: "center"
              }
            },
            "包含线程回复 · 搜索与筛选作用于本页"
          )
        )
      )
    );
  }
  function Panel({ target, channelContext, context }) {
    const connection = R.useSyncExternalStore(
      ctx.relay.subscribe,
      ctx.relay.snapshot
    );
    const channelId = channelContext?.channelId;
    if (!channelId || target !== prefix + channelId || connection.scope !== channelContext.scope || connection.session?.viewer !== channelContext.viewer || !canRead(connection, channelId))
      return note("连接并确认当前聊天权限后查看产物");
    return h(Board, {
      key: `${connection.scope}:${connection.generation}:${channelId}`,
      connection,
      channelContext,
      context
    });
  }
  ctx.panels.register({
    id: "artifacts",
    title: "聊天产物",
    channelPlacement: "tab",
    matches: (target) => target.startsWith(prefix),
    channelLauncher: Launcher,
    component: Panel
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
  return apply(withPluginIcon(ctx, "data:image/png;base64,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"));
}
export {
  apply2 as apply,
  artifactsFrom,
  bookmarkKey,
  canRead,
  categoryOf,
  createReader,
  inject,
  linksIn,
  readBookmarks,
  readText,
  safeUrl,
  saveBookmarks
};

// src/knowledge/presentation.mjs
var palette = {
  text: "var(--text-standard, #25282b)",
  muted: "var(--text-subtle, #6b7077)",
  surface: "var(--surface-panel, #fff)",
  inset: "var(--surface-inset, #f4f5f6)",
  border: "1px solid var(--border-standard, #dfe2e6)"
};
var quiet = { fontSize: 14, lineHeight: 1.6, color: palette.muted };
var button = { minHeight: 40, border: palette.border, borderRadius: 8, padding: "8px 14px", font: "inherit", fontSize: 14, lineHeight: 1.5, color: palette.text, background: palette.surface, cursor: "pointer", whiteSpace: "nowrap" };
var input = { ...button, width: "100%", minWidth: 0, boxSizing: "border-box", cursor: "text" };
var shortKey = (key) => `${key.slice(0, 8)}…${key.slice(-6)}`;
function icon(h, kind, size = 18) {
  const paths = {
    search: ["m21 21-4.4-4.4", "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15"],
    book: ["M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4z", "M13 7a3 3 0 0 1 3-3h5v14h-4a4 4 0 0 0-4 3"],
    document: ["M14 3H5v18h14V8z", "M14 3v5h5", "M8 12h8", "M8 16h6"],
    arrow: ["m14 6-6 6 6 6"],
    people: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M20 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
    check: ["m5 12 4 4L19 6"]
  };
  return h("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { flexShrink: 0 } }, ...(paths[kind] || paths.document).map((d, i) => h("path", { key: i, d })));
}

// src/knowledge/collection-visuals.mjs
var themes = {
  recordings: { paper: "#dce7e3", ink: "#28473e", accent: "#345b4e", label: "工作与协作", description: "会议纪要、工作计划与团队讨论，保留每次决策的来路。" },
  research: { paper: "#e4e1ed", ink: "#514266", accent: "#74618d", label: "产品与研究", description: "产品快照与研究资料，为新的判断补足背景。" },
  business: { paper: "#ede1d2", ink: "#64452f", accent: "#91623e", label: "经营与业务", description: "经营报表与数据明细，沿用原始口径和时间范围。" },
  content: { paper: "#e7e6d6", ink: "#4e5638", accent: "#707a4d", label: "内容与创作", description: "素材、评论、审核与成品关系，让内容工作有据可查。" },
  haowangshui: { paper: "#e0e6ee", ink: "#384d65", accent: "#5b7895", label: "项目与档案", description: "历史项目的文档与备份，按来源范围查阅。" }
};
var collectionTheme = (source) => themes[source] || themes.recordings;
function collectionCover(h, { source, title, compact = false, narrow = false }) {
  const theme = collectionTheme(source);
  return h(
    "div",
    { "aria-hidden": true, style: { position: "relative", width: "100%", flexShrink: 0, height: compact ? 112 : void 0, aspectRatio: compact ? void 0 : "0.82", background: theme.paper, color: theme.ink, borderRadius: "6px 14px 14px 6px", boxShadow: "inset 8px 0 12px #00000008, 0 8px 18px #0000000a", overflow: "hidden", textAlign: "left" } },
    h("div", { style: { position: "absolute", left: 12, top: 0, bottom: 0, width: 1, background: theme.ink, opacity: 0.16 } }),
    h(
      "div",
      { style: { padding: compact ? "18px 24px" : "24px 24px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" } },
      h("span", { style: { fontSize: 11, opacity: 0.75 } }, theme.label),
      h("span", { style: { fontSize: compact || narrow ? 20 : 26, fontWeight: 500, lineHeight: 1.4, maxWidth: compact ? 220 : void 0, overflowWrap: "anywhere" } }, title),
      !compact ? h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", opacity: 0.65 } }, icon(h, "book", 19), h("span", { style: { fontSize: 11 } }, "知识集合")) : null
    ),
    h("div", { style: { position: "absolute", right: 20, top: 0, width: 12, height: 34, background: theme.accent, opacity: 0.6, borderRadius: "0 0 2px 2px" } })
  );
}

// src/knowledge/identity-client.mjs
var API = "https://shangliangshan.paolab.cn/opcb-plugins/knowledge/api/v2";
var SOURCES = { recordings: "会议纪要与工作资料", business: "上粮山 · 经营数据", research: "上粮山 · 产品与市场研究", content: "上粮山 · 内容资产", haowangshui: "项目档案 · 好望水" };
var HEX = /^[a-f0-9]{64}$/;
var bytes = (value) => new TextEncoder().encode(value);
var hex = (value) => [...new Uint8Array(value)].map((b) => b.toString(16).padStart(2, "0")).join("");
var digest = async (text) => hex(await crypto.subtle.digest("SHA-256", bytes(text)));
function identity(owner, community) {
  if (!HEX.test(owner || "") || !HEX.test(community || "")) throw Error("当前 Buzz 身份或社区尚未就绪");
  return { owner, community, partition: JSON.stringify([API, owner, community]) };
}
function pageIdentity(c) {
  return identity(c?.session?.viewer ?? c?.viewer, c?.session?.relayAuthor);
}
function publicKey(k) {
  return { kty: "EC", crv: "P-256", x: k.x, y: k.y };
}
function libraryRows(libraries = []) {
  const rows = [], seen = /* @__PURE__ */ new Set();
  const visit = (parent, depth) => {
    for (const lib of libraries.filter((l) => l.parent === parent)) {
      if (seen.has(lib.id)) continue;
      seen.add(lib.id);
      rows.push({ ...lib, depth });
      visit(lib.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}
function database() {
  let opening;
  async function open() {
    if (!globalThis.indexedDB || !crypto?.subtle) throw Error("本机不支持加密身份绑定与缓存");
    return opening ??= new Promise((ok, no) => {
      const r = indexedDB.open("opcb.knowledge.identity-v2", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("private");
      r.onsuccess = () => {
        r.result.onversionchange = () => {
          r.result.close();
          opening = null;
        };
        ok(r.result);
      };
      r.onerror = r.onblocked = () => {
        opening = null;
        no(Error("本机知识库存储不可用"));
      };
    });
  }
  async function run(mode, fn) {
    const db = await open();
    return new Promise((ok, no) => {
      const tx = db.transaction("private", mode), r = fn(tx.objectStore("private"));
      tx.oncomplete = () => ok(r.result);
      tx.onerror = tx.onabort = () => no(Error("本机缓存读写未完成"));
    });
  }
  return { get: (k) => run("readonly", (s) => s.get(k)), put: (k, v) => run("readwrite", (s) => s.put(v, k)), remove: (k) => run("readwrite", (s) => s.delete(k)) };
}
function validateRequest(r) {
  const fields = { catalog: ["op"], list: ["op", "source", "limit", "offset"], search: ["op", "source", "query", "limit"], get: ["op", "source", "id"] };
  if (!r || !Object.hasOwn(fields, r.op) || Object.keys(r).some((k) => !fields[r.op].includes(k))) throw Error("知识库只支持目录、分页、检索和正文");
  if (r.op !== "catalog" && !Object.hasOwn(SOURCES, r.source)) throw Error("知识源无效");
  if (r.op === "search" && (typeof r.query !== "string" || !r.query.trim() || r.query.length > 100)) throw Error("搜索词应为 1–100 个字符");
  if (r.limit !== void 0 && (!Number.isInteger(r.limit) || r.limit < 1 || r.limit > 20)) throw Error("每页最多20项");
  if (r.offset !== void 0 && (!Number.isInteger(r.offset) || r.offset < 0 || r.offset > 1e6)) throw Error("页码无效");
  if (r.op === "get" && (typeof r.id !== "string" || !(r.source === "recordings" ? /^[0-9]{1,30}$/ : new RegExp(`^${r.source}:[a-f0-9]{24}$`)).test(r.id))) throw Error("资料编号无效");
  return { ...r, ...r.op === "search" ? { query: r.query.trim() } : {} };
}
function createIdentityClient(host, { role = "read", storage = database(), now = Date.now } = {}) {
  const memory = /* @__PURE__ */ new Map();
  let retired = false, version = 0, queue = Promise.resolve();
  const serialize = (fn) => {
    const task = queue.then(fn);
    queue = task.catch(() => {
    });
    return task;
  };
  const key = (id) => `${id.partition}:${role}`;
  const check = (v, signal) => {
    signal?.throwIfAborted();
    if (retired || v !== version) throw Error("身份已切换或插件已停用");
  };
  async function post(action, value) {
    const r = await host.request({ url: `${API}/${action}`, method: "POST", timeoutMs: 15e3, headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
    let result;
    try {
      result = JSON.parse(r.body);
    } catch {
      result = {};
    }
    if (r.status !== 200) throw Object.assign(Error(r.status === 403 ? "当前身份没有此知识库权限或身份绑定已撤销" : r.status === 409 ? "权限已被其他管理员修改，请刷新后重试" : "知识服务连接未完成"), { status: r.status, denied: r.status === 403 });
    return result;
  }
  async function load(id) {
    const k = key(id);
    if (!memory.has(k)) memory.set(k, storage.get(k));
    return memory.get(k);
  }
  async function call(id, action, value, { signal } = {}) {
    const v = version;
    check(v, signal);
    const record = await load(id);
    check(v, signal);
    if (!record?.binding || record.binding.owner !== id.owner) throw Object.assign(Error("本机尚未绑定当前 Buzz 身份"), { unbound: true });
    const body = JSON.stringify(value), nonce = hex(crypto.getRandomValues(new Uint8Array(32))), timestamp = Math.floor(now() / 1e3);
    const message = JSON.stringify(["opcb.knowledge.request.v1", `${API}/${action}`, body, nonce, timestamp]);
    const signed = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, record.keys.privateKey, bytes(message)));
    const signature = btoa(String.fromCharCode(...signed)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    check(v, signal);
    const result = await post(action, { body, proof: { device: record.binding.device, nonce, timestamp, signature } });
    check(v, signal);
    return result;
  }
  async function cache(id, request, value) {
    return serialize(async () => {
      const v = version, record = await load(id);
      check(v);
      if (!record) return;
      let records = {};
      if (record.cache) try {
        records = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: record.iv, additionalData: bytes(key(id)) }, record.cacheKey, record.cache)));
      } catch {
      }
      records = Object.fromEntries(Object.entries(records).filter(([, r]) => r.at > now() - 30 * 864e5));
      if (value !== void 0) {
        records[JSON.stringify(request)] = { at: now(), value };
        let size = 0;
        records = Object.fromEntries(Object.entries(records).sort((a, b) => b[1].at - a[1].at).filter(([, r]) => {
          const n = bytes(JSON.stringify(r)).length;
          size += n;
          return size < 8 * 1024 * 1024 && r.at > now() - 30 * 864e5;
        }).slice(0, 100));
        const iv = crypto.getRandomValues(new Uint8Array(12)), data = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: bytes(key(id)) }, record.cacheKey, bytes(JSON.stringify(records)));
        check(v);
        const next = { ...record, iv, cache: data };
        await storage.put(key(id), next);
        memory.set(key(id), Promise.resolve(next));
      }
      return records;
    });
  }
  return {
    async status(id) {
      const record = await load(id);
      return { connected: !!record?.binding, remembered: !!record?.binding, agentAccess: role === "read", cachedDocuments: Object.keys(await cache(id) || {}).filter((k) => JSON.parse(k).op === "get").length };
    },
    async bind(id, publish, { signal } = {}) {
      const v = version;
      check(v, signal);
      const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
      const deviceKey = publicKey(await crypto.subtle.exportKey("jwk", keys.publicKey)), fingerprint = await digest(JSON.stringify(deviceKey));
      const challenge = await post("challenge", { fingerprint });
      check(v);
      if (challenge.community !== id.community) throw Error("知识服务与当前 Buzz 社区不匹配");
      const content = JSON.stringify({ version: 1, purpose: "opcb.knowledge.device-binding", audience: API, community: id.community, deviceKey, nonce: challenge.nonce, role });
      const event = await publish(content);
      check(v, signal);
      const binding = await post("bind", { event });
      check(v, signal);
      if (binding.owner !== id.owner || binding.device !== fingerprint) throw Error("知识服务返回了不匹配的身份");
      const cacheKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      await serialize(async () => {
        check(v);
        const record = { keys, deviceKey, binding, cacheKey };
        await storage.put(key(id), record);
        memory.set(key(id), Promise.resolve(record));
      });
      return binding;
    },
    permissions: (id, options) => call(id, "permissions", {}, options),
    policy: (id, value, options) => call(id, "policy", value, options),
    async read(id, input2, { signal, cacheOnly = false } = {}) {
      const request = validateRequest(input2), v = version;
      check(v, signal);
      try {
        if (cacheOnly && request.op !== "catalog") {
          const permission = await call(id, "permissions", {}, { signal });
          check(v, signal);
          if (request.op !== "catalog" && !permission.sources.includes(request.source)) throw Object.assign(Error("当前权限不允许读取这份缓存"), { denied: true });
          const records = await cache(id), saved2 = records?.[JSON.stringify(request)];
          check(v, signal);
          if (!saved2) throw Error("这份资料尚未缓存");
          return { ...saved2.value, cache: { cached: true, savedAt: saved2.at } };
        }
        const result = await call(id, "read", { request }, { signal });
        check(v, signal);
        if (request.op === "catalog" ? !Array.isArray(result.sources) : request.op === "get" ? !result.note || result.note.id !== request.id || typeof result.note.content !== "string" : !Array.isArray(result.results)) throw Error("知识库数据格式不正确");
        let saved = false;
        try {
          await cache(id, request, result);
          saved = true;
        } catch {
        }
        check(v, signal);
        return { ...result, cache: { cached: false, saved, savedAt: saved ? now() : null } };
      } catch (e) {
        if (e.denied) {
          await this.clearCache(id);
          check(v, signal);
        }
        throw e;
      }
    },
    async clearCache(id) {
      await serialize(async () => {
        const record = await load(id);
        if (record) {
          const next = { ...record };
          delete next.cache;
          delete next.iv;
          await storage.put(key(id), next);
          memory.set(key(id), Promise.resolve(next));
        }
      });
    },
    async forget(id) {
      version++;
      await serialize(async () => {
        await storage.remove(key(id));
        memory.delete(key(id));
      });
    },
    dispose() {
      retired = true;
      version++;
      memory.clear();
    }
  };
}
async function publishPersonalBinding(session, channel, content, { signal } = {}) {
  const outbox = session?.outbox;
  if (!outbox?.supports?.(45010)) throw Error("当前官方客户端未提供所需原生产物写入能力");
  const target = session.channels.get?.(channel);
  if (!target || target.visibility !== "private" && !target.private || target.readOnly || target.cached || target.archived) throw Error("请选择你有写入权限的私人对话保存身份绑定记录");
  signal?.throwIfAborted();
  await outbox.ready();
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let id, off = () => {
    }, timer, reading = false, settled = false;
    const done = (error, event) => {
      if (settled) return;
      settled = true;
      off();
      clearInterval(timer);
      signal?.removeEventListener("abort", abort);
      error ? reject(error) : resolve(event);
    };
    const abort = () => done(Error("身份绑定已取消，请核对原绑定记录后重试"));
    const started = Date.now();
    const inspect = () => {
      if (settled || !id) return;
      const item = outbox.snapshot().find((r) => r.event.id === id);
      if (item?.delivery === "failed") return done(Error("原生身份绑定记录被拒绝，请核对后重试"));
      if (item?.signed && ["accepted", "seen"].includes(item.delivery)) return done(null, item.signed);
      if (!item && !reading && session.read) {
        reading = true;
        void session.read([{ ids: [id], kinds: [45010], "#h": [channel], limit: 1 }], { signal }).then((events) => {
          const event = events.find((e) => e.id === id && e.content === content && typeof e.sig === "string");
          if (event && !signal?.aborted) done(null, event);
        }).catch(() => {
        }).finally(() => {
          reading = false;
        });
      }
      if (Date.now() - started >= 2e4) done(Error("原生身份绑定确认超时，请核对记录后重试"));
    };
    off = outbox.subscribe(inspect);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) return abort();
    try {
      id = outbox.send({ kind: 45010, content, tags: [["ar", "1"], ["d", crypto.randomUUID()], ["h", channel], ["type", "opcb.knowledge.identity"], ["title", "知识库身份绑定"], ["op", "create"]] }, void 0, () => !signal?.aborted);
    } catch (e) {
      return done(e);
    }
    timer = setInterval(inspect, 1e3);
    inspect();
  });
}

// src/knowledge/admin.mjs
var inject = ["react", "pages", "relay", "host"];
function effectiveAccess(policy, owner, library) {
  if (policy.disabled.includes(owner)) return false;
  let granted = false;
  const seen = /* @__PURE__ */ new Set();
  while (library !== null) {
    if (seen.has(library)) return false;
    seen.add(library);
    const lib = policy.libraries.find((l) => l.id === library);
    if (!lib) return false;
    const rule = policy.grants.find((g) => g.owner === owner && g.library === library);
    if (rule) {
      if (!rule.allow) return false;
      granted = true;
    }
    library = lib.parent;
  }
  return granted;
}
function apply(ctx) {
  const React = ctx.react, h = React.createElement, service = createIdentityClient(ctx.host, { role: "manage" });
  ctx.effect(() => () => service.dispose());
  const border = palette.border, muted = quiet;
  const action = (label, fn, disabled = false, style = {}) => h("button", { type: "button", onClick: fn, disabled, style: { ...button, ...style } }, label);
  function Page() {
    const [connection, setConnection] = React.useState(() => ctx.relay.snapshot()), [policy, setPolicy] = React.useState(null), [bound, setBound] = React.useState(false), [pending, setPending] = React.useState(false), [error, setError] = React.useState(""), [notice, setNotice] = React.useState("");
    const [channel, setChannel] = React.useState(""), [owner, setOwner] = React.useState(""), [people, setPeople] = React.useState([]), [loadedNames, setLoadedNames] = React.useState({}), [query, setQuery] = React.useState(""), [manual, setManual] = React.useState(""), [library, setLibrary] = React.useState("company"), [libraryName, setLibraryName] = React.useState(""), [newId, setNewId] = React.useState(""), [newName, setNewName] = React.useState(""), [parent, setParent] = React.useState("company"), [tab, setTab] = React.useState("people"), [detailMode, setDetailMode] = React.useState(""), [onlyConfigured, setOnlyConfigured] = React.useState(true), [width, setWidth] = React.useState(1200), [, renderNames] = React.useReducer((x) => x + 1, 0);
    const scroller = React.useRef(null), positions = React.useRef({}), root = React.useRef(null), epoch = React.useRef(0), controller = React.useRef(new AbortController()), busy = React.useRef(false);
    let id;
    try {
      id = pageIdentity(connection);
    } catch {
      id = null;
    }
    const online = connection.status === "ready" && !connection.cached, compact = width < 820;
    const privateChannels = (connection.session?.channels?.list?.().channels || []).filter((c) => (c.visibility === "private" || c.private) && !c.readOnly && !c.cached && !c.archived);
    const profiles = connection.session?.profiles?.snapshot?.();
    const name = (key) => profiles?.get(key)?.name || loadedNames[key] || shortKey(key);
    const alive = (v) => epoch.current === v && !controller.current.signal.aborted;
    async function refresh(v) {
      const value = await service.policy(id, { op: "snapshot" }, { signal: controller.current.signal });
      if (alive(v)) setPolicy(value);
    }
    async function loadPeople(v) {
      const events = await connection.session.read([{ kinds: [0], limit: 200 }], { signal: controller.current.signal });
      if (!alive(v)) return;
      const visible = events.filter((e) => /^[a-f0-9]{64}$/.test(e.pubkey) && !e.tags.some((t) => t[0] === "auth")), names = {};
      for (const event of visible) {
        try {
          const value = JSON.parse(event.content);
          const label = value.display_name || value.name;
          if (typeof label === "string" && label.trim()) names[event.pubkey] = label.trim().slice(0, 80);
        } catch {
        }
      }
      setPeople([...new Set(visible.map((e) => e.pubkey))]);
      setLoadedNames(names);
    }
    React.useEffect(() => ctx.relay.subscribe(() => setConnection(ctx.relay.snapshot())), []);
    React.useEffect(() => connection.session?.profiles?.subscribe?.(() => renderNames()), [connection.session]);
    React.useEffect(() => {
      const o = new ResizeObserver((e) => setWidth(e[0].contentRect.width));
      if (root.current) o.observe(root.current);
      return () => o.disconnect();
    }, []);
    React.useEffect(() => {
      controller.current.abort();
      controller.current = new AbortController();
      const v = ++epoch.current;
      setPolicy(null);
      setBound(false);
      setError("");
      setNotice("");
      setPeople([]);
      setLoadedNames({});
      setQuery("");
      setOwner(id?.owner || "");
      setDetailMode("");
      setTab("people");
      busy.current = false;
      setPending(!!id);
      if (id) void service.status(id).then(async (status) => {
        if (!alive(v)) return;
        setBound(status.connected);
        if (status.connected) {
          await refresh(v);
          if (online) await loadPeople(v).catch(() => {
          });
        }
      }).catch((e) => {
        if (alive(v)) setError(e.message);
      }).finally(() => {
        if (alive(v)) setPending(false);
      });
      return () => {
        controller.current.abort();
        epoch.current++;
      };
    }, [id?.partition, connection.generation, online]);
    const viewKey = `${tab}:${detailMode}:${detailMode === "person" ? owner : detailMode === "library" ? library : ""}`;
    React.useLayoutEffect(() => {
      const element = scroller.current;
      if (!element) return;
      element.scrollTop = positions.current[viewKey] || 0;
      return () => {
        positions.current[viewKey] = element.scrollTop;
      };
    }, [viewKey]);
    async function run(fn) {
      if (!id || busy.current) return;
      busy.current = true;
      setPending(true);
      setError("");
      setNotice("");
      const v = ++epoch.current;
      try {
        await fn(v);
      } catch (e) {
        if (alive(v)) {
          setError(e.message);
          if (e.denied) setPolicy(null);
        }
      } finally {
        if (alive(v)) {
          busy.current = false;
          setPending(false);
        }
      }
    }
    async function change(v, kind, payload) {
      if (!policy) throw Error("请先载入当前权限");
      await service.policy(id, { op: "change", expected_revision: policy.revision, action: kind, payload }, { signal: controller.current.signal });
      if (alive(v)) {
        await refresh(v);
        setNotice("权限已保存，后续访问按新权限检查");
      }
    }
    const validOwner = /^[a-f0-9]{64}$/.test(owner), configured = /* @__PURE__ */ new Set([...(policy?.grants || []).map((g) => g.owner), ...policy?.disabled || []]);
    const owners = [.../* @__PURE__ */ new Set([...configured, ...people])].sort((a, b) => Number(configured.has(b)) - Number(configured.has(a)) || name(a).localeCompare(name(b), "zh-CN") || a.localeCompare(b));
    const matches = owners.filter((key) => `${name(key)} ${key}`.toLowerCase().includes(query.toLowerCase()));
    const active = policy && validOwner ? policy.libraries.filter((lib) => effectiveAccess(policy, owner, lib.id)).length : 0, disabled = policy?.disabled.includes(owner);
    const heading = (title, description) => h("div", { style: { marginBottom: 24 } }, h("h2", { style: { fontSize: 24, fontWeight: 500, lineHeight: 1.4, margin: "0 0 8px" } }, title), h("p", { style: { ...muted, margin: 0 } }, description));
    const libraries = policy ? libraryRows(policy.libraries) : [];
    const person = h(
      "section",
      { "aria-label": "个人知识库权限", style: { minWidth: 0, overflowY: "auto", padding: compact ? 20 : 32 } },
      validOwner && policy ? h(
        React.Fragment,
        null,
        h(
          "div",
          { style: { display: "flex", alignItems: "start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 } },
          h("div", null, h("h2", { style: { fontSize: 26, fontWeight: 500, margin: "0 0 8px" } }, name(owner)), h("p", { style: { ...muted, margin: 0 } }, disabled ? "此人的知识库访问已停用" : `${active} / ${policy.libraries.length} 个目录可读取 · Agent 自动继承`)),
          h("details", null, h("summary", { style: { ...muted, cursor: "pointer", padding: 8 } }, "个人操作"), h("p", { style: { ...muted, fontSize: 13, maxWidth: 300 } }, disabled ? "恢复后按下方各库权限访问。" : "停用会关闭本人及其 Agent 的后续知识库访问。"), action(disabled ? "恢复此人的知识库访问" : "停用此人的全部知识库访问", () => run((v) => change(v, "disable", { owner, disabled: !disabled })), pending))
        ),
        h("details", { style: { marginBottom: 24 } }, h("summary", { style: { ...muted, fontSize: 12, cursor: "pointer" } }, `身份 ${shortKey(owner)}`), h("code", { style: { display: "block", fontSize: 12, overflowWrap: "anywhere", marginTop: 8 } }, owner)),
        h("div", { style: { border, borderRadius: 12, overflow: "hidden" } }, ...libraries.map((lib, i) => {
          const rule = policy.grants.find((g) => g.owner === owner && g.library === lib.id), allowed = effectiveAccess(policy, owner, lib.id);
          return h(
            "div",
            { key: lib.id, style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, padding: 20, borderTop: i ? border : void 0 } },
            h("div", { style: { minWidth: 0, flex: "1 1 220px", paddingLeft: Math.max(0, lib.depth - 1) * 16 } }, h("p", { style: { fontSize: 16, fontWeight: 500, lineHeight: 1.5, margin: "0 0 4px" } }, lib.name), h("p", { style: { ...muted, fontSize: 13, margin: 0 } }, `${allowed ? "可读取" : "已关闭"} · ${lib.parent ? `上级：${policy.libraries.find((p) => p.id === lib.parent)?.name || lib.parent}` : "顶层知识库"}`)),
            h("select", { "aria-label": `${lib.name}权限设置`, value: rule ? rule.allow ? "allow" : "deny" : "inherit", disabled: pending || !online, style: { ...input, width: 148, flexShrink: 0 }, onChange: (e) => {
              const value = e.target.value;
              void run((v) => value === "inherit" ? change(v, "inherit", { owner, library: lib.id }) : change(v, "grant", { owner, library: lib.id, allow: value === "allow" }));
            } }, h("option", { value: "allow" }, "允许读取"), h("option", { value: "deny" }, "关闭读取"), h("option", { value: "inherit" }, "继承上级"))
          );
        })),
        h("p", { style: { ...muted, fontSize: 13, marginTop: 20 } }, "关闭父库会同时关闭子库访问。这里管理的是资料读取权限，个人的 Agent 无需重复配置。")
      ) : heading("选择一个人", "先从人员列表选择身份，再调整知识库权限。")
    );
    const structure = h(
      "section",
      { style: { overflowY: "auto", padding: compact ? 20 : 32, minHeight: 0 } },
      heading("知识库名称与层级", "名称会同步到阅读页；不会改动原数据源或自动导入资料。"),
      h("div", { style: { maxWidth: 720, border, borderRadius: 12, padding: 24 } }, h("label", { style: { ...muted, display: "block" } }, "现有知识库", h("select", { "aria-label": "待重命名知识库", value: library, onChange: (e) => {
        setLibrary(e.target.value);
        setLibraryName("");
      }, style: { ...input, display: "block", margin: "8px 0 20px" } }, ...libraries.map((lib) => h("option", { key: lib.id, value: lib.id }, `${"　".repeat(lib.depth)}${lib.name}`)))), h("label", { style: { ...muted, display: "block" } }, "新名称", h("input", { "aria-label": "知识库新名称", placeholder: "输入清楚的业务名称", value: libraryName, maxLength: 80, onChange: (e) => setLibraryName(e.target.value), style: { ...input, marginTop: 8 } })), action("保存名称", () => run((v) => change(v, "library", { id: library, name: libraryName.trim(), parent: policy.libraries.find((l) => l.id === library)?.parent ?? null })), pending || !libraryName.trim(), { marginTop: 20 })),
      h("details", { style: { maxWidth: 720, borderTop: border, paddingTop: 24, marginTop: 32 } }, h("summary", { style: { fontSize: 18, cursor: "pointer" } }, "新增子知识库"), h("p", { style: muted }, "新增目录后仍需接入知识源，才会出现资料。"), h("input", { "aria-label": "新子库标识", placeholder: "英文标识，例如 project-plans", value: newId, onChange: (e) => setNewId(e.target.value), style: input }), h("input", { "aria-label": "新子库名称", placeholder: "子知识库名称", value: newName, maxLength: 80, onChange: (e) => setNewName(e.target.value), style: { ...input, marginTop: 12 } }), h("select", { "aria-label": "新子库上级", value: parent, onChange: (e) => setParent(e.target.value), style: { ...input, margin: "12px 0" } }, ...libraries.map((lib) => h("option", { key: lib.id, value: lib.id }, lib.name))), action("创建子库", () => run((v) => change(v, "library", { id: newId, name: newName.trim(), parent })), pending || !newId || !newName.trim()))
    );
    const audit = h("section", { style: { overflowY: "auto", padding: compact ? 20 : 32 } }, heading("权限变更记录", "来自服务器审计；每次保存都核对当前权限版本。"), ...(policy?.audit || []).map((row) => h("div", { key: row.revision, style: { padding: "20px 0", borderBottom: border, maxWidth: 900 } }, h("p", { style: { margin: "0 0 8px", fontWeight: 500 } }, { grant: "调整读取权限", inherit: "恢复继承权限", disable: "调整个人访问", library: "修改知识库目录" }[row.action] || row.action), h("p", { style: { ...muted, margin: 0 } }, `版本 ${row.revision} · ${new Date(row.at * 1e3).toLocaleString("zh-CN")}`))), !policy?.audit?.length ? h("p", { style: muted }, "尚无变更记录") : null);
    const shown = matches.filter((key) => !onlyConfigured || configured.has(key));
    const personOverview = h(
      "section",
      { "data-admin-view": "people-overview" },
      h("div", { style: { margin: "8px 0 36px" } }, h("p", { style: { ...muted, fontSize: 13, margin: "0 0 16px" } }, "人员与知识的连接"), h("h1", { style: { fontSize: compact ? 32 : 44, fontWeight: 500, lineHeight: 1.25, margin: "0 0 18px", letterSpacing: "-.02em" } }, "把知识交给合适的人。"), h("p", { style: { ...muted, fontSize: 16, margin: 0 } }, `${configured.size} 个已配置身份 · ${policy?.libraries.length || 0} 个知识目录 · Agent 随个人继承读取`)),
      h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 28 } }, h("input", { type: "search", "aria-label": "搜索人员", placeholder: "找到一个人，查看他的知识范围", value: query, onChange: (e) => setQuery(e.target.value), style: { ...input, maxWidth: 480, padding: "12px 16px", minHeight: 48, borderRadius: 12 } }), h("label", { style: { ...muted, fontSize: 13, display: "flex", alignItems: "center", gap: 8 } }, h("input", { type: "checkbox", checked: onlyConfigured, onChange: (e) => setOnlyConfigured(e.target.checked) }), "仅显示已配置人员")),
      h("div", { "aria-label": "人员总览", style: { display: "grid", gridTemplateColumns: compact ? "1fr" : `repeat(${width < 1150 ? 2 : 3},minmax(0,1fr))`, gap: 20 } }, ...shown.map((key) => {
        const allowed = policy.libraries.filter((lib) => effectiveAccess(policy, key, lib.id)).length, stopped = policy.disabled.includes(key);
        return h(
          "button",
          { key, type: "button", "aria-label": `管理 ${name(key)}`, disabled: pending, onClick: () => {
            setOwner(key);
            setDetailMode("person");
          }, style: { ...button, padding: 24, borderRadius: 18, whiteSpace: "normal", textAlign: "left", minHeight: 220, display: "flex", flexDirection: "column", background: palette.surface } },
          h("span", { style: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start", width: "100%" } }, h("span", { style: { width: 48, height: 48, borderRadius: 16, display: "grid", placeItems: "center", background: palette.inset, fontSize: 22, fontWeight: 500 } }, name(key).slice(0, 1)), h("span", { style: { ...muted, fontSize: 12 } }, stopped ? "已停用" : allowed === policy.libraries.length ? "全部已开通" : allowed ? "部分已开通" : "等待开通")),
          h("strong", { style: { display: "block", fontSize: 21, fontWeight: 500, lineHeight: 1.5, margin: "20px 0 6px", overflowWrap: "anywhere" } }, name(key)),
          h("span", { style: { ...muted, fontSize: 12 } }, shortKey(key)),
          h("span", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, width: "100%", marginTop: 24, paddingTop: 16, borderTop: border, fontSize: 13, color: palette.muted } }, h("span", null, `${allowed} 个目录可读取`), h("span", null, "查看权限 →"))
        );
      })),
      !shown.length ? h("p", { style: { ...muted, padding: "32px 0" } }, "没有匹配人员。可以关闭筛选，查看其他可见身份。") : null,
      h("div", { style: { display: "flex", gap: 16, alignItems: "start", flexWrap: "wrap", marginTop: 32, paddingTop: 24, borderTop: border } }, action("刷新可见身份", () => run(async (v) => {
        await loadPeople(v);
        if (alive(v)) setNotice("已刷新可见身份，未更改任何权限");
      }), pending || !online), h("details", { style: { maxWidth: 600 } }, h("summary", { style: { ...muted, cursor: "pointer", padding: "8px 0" } }, "通过公钥添加查找"), h("p", { style: muted }, "使用完整个人公钥，姓名不作为授权凭据。"), h("input", { "aria-label": "个人公钥", placeholder: "完整个人公钥", value: manual, onChange: (e) => setManual(e.target.value.trim()), style: input }), action("查看此身份", () => {
        setOwner(manual);
        setPeople((p) => [.../* @__PURE__ */ new Set([...p, manual])]);
        setOnlyConfigured(false);
        setManual("");
        setDetailMode("person");
      }, !/^[a-f0-9]{64}$/.test(manual), { marginTop: 12 }))),
      h("p", { style: { ...muted, fontSize: 12, marginTop: 24 } }, "已配置身份始终保留。其他社区可见身份最多载入 200 项；查看身份不会自动开通权限。")
    );
    const libraryOverview = h(
      "section",
      { "data-admin-view": "library-overview" },
      h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "start", gap: 20, flexWrap: "wrap", marginBottom: 36 } }, h("div", null, h("p", { style: { ...muted, fontSize: 13, margin: "0 0 16px" } }, "从知识库出发管理访问"), h("h1", { style: { fontSize: compact ? 32 : 44, fontWeight: 500, lineHeight: 1.25, margin: "0 0 16px" } }, "每一份知识，谁能看见。"), h("p", { style: { ...muted, fontSize: 16, margin: 0 } }, "选择一个知识库，直接查看人员与授权范围。")), action("名称与层级", () => setTab("structure"), pending)),
      h("div", { "aria-label": "知识库总览", style: { display: "grid", gridTemplateColumns: compact ? "1fr" : `repeat(${width < 1150 ? 2 : 3},minmax(0,1fr))`, gap: 28 } }, ...libraries.map((lib) => {
        const source = policy.sources?.find((s) => s.library === lib.id)?.id || { shangliangshan: "business", company: "recordings" }[lib.id] || "research";
        const count = [...configured].filter((key) => effectiveAccess(policy, key, lib.id)).length;
        return h("button", { key: lib.id, type: "button", "aria-label": `管理知识库 ${lib.name}`, disabled: pending, onClick: () => {
          setLibrary(lib.id);
          setDetailMode("library");
        }, style: { ...button, padding: 0, border: 0, borderRadius: 14, textAlign: "left", whiteSpace: "normal", background: "transparent" } }, collectionCover(h, { source, title: lib.name, compact: true }), h("span", { style: { display: "block", padding: "18px 4px" } }, h("strong", { style: { display: "block", fontSize: 18, fontWeight: 500, marginBottom: 6 } }, lib.name), h("span", { style: { ...muted, fontSize: 13 } }, `${count} / ${configured.size} 个已配置身份可读 · ${lib.parent ? "子知识库" : "顶层知识库"}`)));
      }))
    );
    const selectedLibrary = policy?.libraries.find((lib) => lib.id === library);
    const libraryDetail = h(
      "section",
      { "data-admin-view": "library-detail" },
      h("div", { style: { display: "grid", gridTemplateColumns: compact ? "1fr" : "minmax(0,1fr) 280px", gap: 40, alignItems: "center", marginBottom: 36, borderBottom: border, paddingBottom: 32 } }, h("div", null, h("p", { style: { ...muted, fontSize: 13, margin: "0 0 14px" } }, "知识库访问"), h("h1", { style: { fontSize: compact ? 30 : 40, fontWeight: 500, margin: "0 0 16px" } }, selectedLibrary?.name), h("p", { style: { ...muted, fontSize: 16 } }, "从人员名单直接调整此库权限；关闭父库仍会覆盖子库设置。")), !compact ? collectionCover(h, { source: policy?.sources?.find((s) => s.library === library)?.id, title: selectedLibrary?.name || "", compact: true }) : null),
      h("div", { style: { border, borderRadius: 16, overflow: "hidden" } }, ...owners.map((key, i) => {
        const rule = policy.grants.find((g) => g.owner === key && g.library === library), allowed = effectiveAccess(policy, key, library);
        return h("div", { key, style: { padding: "20px 24px", borderTop: i ? border : void 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" } }, h("div", { style: { minWidth: 0 } }, h("p", { style: { fontSize: 17, fontWeight: 500, margin: "0 0 6px" } }, name(key)), h("p", { style: { ...muted, fontSize: 12, margin: 0 } }, `${shortKey(key)} · ${allowed ? "可读取" : "已关闭"}`)), h("select", { "aria-label": `${name(key)}的读取权限`, value: rule ? rule.allow ? "allow" : "deny" : "inherit", disabled: pending || !online, style: { ...input, width: 148 }, onChange: (e) => {
          const value = e.target.value;
          void run((v) => value === "inherit" ? change(v, "inherit", { owner: key, library }) : change(v, "grant", { owner: key, library, allow: value === "allow" }));
        } }, h("option", { value: "allow" }, "允许读取"), h("option", { value: "deny" }, "关闭读取"), h("option", { value: "inherit" }, "继承上级")));
      }))
    );
    return h(
      "main",
      { ref: root, "data-knowledge-admin": true, style: { width: "100%", height: "100%", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", color: palette.text, fontFamily: "inherit", fontSize: 16, background: palette.surface } },
      h(
        "header",
        { style: { padding: compact ? "16px 20px" : "18px 40px", borderBottom: border, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" } },
        h("span", { style: { display: "flex", alignItems: "center", gap: 10, fontSize: 16, fontWeight: 500 } }, icon(h, "people", 21), "知识库管理"),
        bound ? h("span", { style: { ...muted, fontSize: 12 } }, `个人管理员 · 权限版本 ${policy?.revision ?? "…"}`) : null
      ),
      h(
        "div",
        { ref: scroller, style: { overflowY: "auto", flex: 1, minHeight: 0 } },
        !bound ? h("section", { style: { maxWidth: 840, padding: compact ? 24 : 48, margin: "24px auto" } }, heading("连接管理员身份", "连接当前 Buzz 个人身份，管理人员与知识库的访问。"), h("label", { style: muted }, "保存连接记录的私人对话", h("select", { "aria-label": "管理员绑定私人对话", style: { ...input, display: "block", margin: "8px 0 20px" }, value: channel || privateChannels[0]?.id || "", onChange: (e) => setChannel(e.target.value) }, ...privateChannels.map((c) => h("option", { key: c.id, value: c.id }, c.name || "私人对话")))), action("绑定当前个人身份", () => run(async (v) => {
          if (!online) throw Error("请先连接 Buzz 社区");
          const selected = channel || privateChannels[0]?.id;
          if (!selected) throw Error("请选择可写的私人对话");
          await service.bind(id, (content) => publishPersonalBinding(connection.session, selected, content, { signal: controller.current.signal }), { signal: controller.current.signal });
          if (alive(v)) {
            setBound(true);
            await refresh(v);
            await loadPeople(v).catch(() => {
            });
          }
        }), pending || !id || !online || !privateChannels.length), h("p", { style: { ...muted, fontSize: 13 } }, "管理资格由服务器配置决定。Agent 继承读取，不继承管理。")) : null,
        error ? h("p", { role: "alert", style: { borderLeft: "3px solid var(--text-danger, #a33)", margin: "20px 32px", padding: "16px 20px", background: palette.inset } }, error) : null,
        notice ? h("p", { role: "status", style: { ...muted, margin: "16px 32px" } }, notice) : null,
        policy ? h(
          "div",
          { style: { maxWidth: 1440, margin: "0 auto", padding: compact ? "24px 20px 48px" : "32px 48px 64px" } },
          h(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 36 } },
            detailMode || tab === "structure" ? action("← 返回总览", () => {
              setDetailMode("");
              if (tab === "structure") setTab("libraries");
            }, pending, { border: 0, background: "transparent", padding: "8px 0" }) : h("div", { style: { display: "flex", alignItems: "center", gap: 4, padding: 4, borderRadius: 24, background: palette.inset } }, ...[["people", "按人员"], ["libraries", "按知识库"], ["audit", "变更记录"]].map(([key, label]) => h("button", { key, type: "button", "aria-pressed": tab === key, onClick: () => setTab(key), style: { ...button, border: 0, borderRadius: 20, background: tab === key ? palette.surface : "transparent", fontWeight: tab === key ? 500 : 400, padding: "8px 18px" } }, label))),
            action("刷新权限", () => run(refresh), pending || !online, { border: 0, background: palette.inset, borderRadius: 20, padding: "8px 18px" })
          ),
          detailMode === "person" ? person : detailMode === "library" ? libraryDetail : tab === "people" ? personOverview : tab === "libraries" ? libraryOverview : tab === "structure" ? structure : audit
        ) : bound && pending ? h("p", { role: "status", style: { ...muted, padding: 32 } }, "正在读取权限…") : null
      )
    );
  }
  ctx.pages.register({ id: "admin", title: "知识库管理", primary: true, placement: "dock", layout: "workspace", component: Page });
}
export {
  apply,
  effectiveAccess,
  inject
};

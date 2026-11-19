// src/pantao-collections/reports.mjs
var NAME = "\u6F58\u6D9B\u7684\u6536\u85CF";
var REPORT_LIMIT = 32 * 1024 * 1024;
var filename = /^COLLECTIONS_(\d{8})_REPORT\.html$/i;
var dataBlock = /<script\s+type=["']application\/json["']\s+id=["']data["']\s*>([\s\S]*?)<\/script\s*>/i;
var text = (value, limit = 1e3) => typeof value === "string" ? value.trim().slice(0, limit) : "";
var array = (value) => Array.isArray(value) ? value : [];
var number = (value) => /^\d{1,6}$/.test(String(value)) ? String(Number(value)) : "";
var tag = (event, key, value) => event.tags?.some((t) => t[0] === key && t[1] === value);
var imageData = /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[a-z0-9+/]+=*$/i;
function https(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}
function communityFile(value, origin) {
  const safe = https(value);
  try {
    const url = new URL(safe);
    const community = new URL(origin);
    return url.host === community.host && /^\/media\/[a-f0-9]{64}(?:\.[a-z0-9]+)?$/i.test(url.pathname) ? url.href : "";
  } catch {
    return "";
  }
}
function sourceChannel(session) {
  const roster = session.channels.list();
  if (roster.status !== "ready" || !session.viewer) return void 0;
  const matches = roster.channels.filter((c) => c.name === NAME && c.private === true && c.channelType === "stream" && !c.archived && !c.cached && !c.pending && !c.metadataCached && !c.metadataPending && c.members?.includes(session.viewer));
  return matches.length === 1 ? matches[0] : void 0;
}
function reportRefs(rows, { channel, origin, publishers }) {
  return rows.flatMap((row) => {
    if (!publishers.has(row.signerId || row.authorId) || row.channelId !== channel || row.delivery) return [];
    return array(row.attachments).flatMap((file) => {
      const match = filename.exec(file.name || "");
      const url = communityFile(file.url, origin);
      return match && url && file.kind === "file" ? [{ date: match[1], url, id: row.id, at: row.createdAt }] : [];
    });
  });
}
function eventRefs(events, options) {
  return reportRefs(events.filter((e) => e.kind === 9 && tag(e, "h", options.channel)).map((e) => ({
    id: e.id,
    channelId: options.channel,
    authorId: e.pubkey,
    createdAt: e.created_at,
    attachments: e.tags.filter((t) => t[0] === "imeta").map((t) => {
      const value = (key) => t.find((field) => field.startsWith(key + " "))?.slice(key.length + 1);
      return { name: value("filename"), url: value("url"), kind: "file" };
    })
  })), options);
}
function mergeReports(...groups) {
  const dates = /* @__PURE__ */ new Map();
  for (const report of groups.flat().sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))) {
    dates.set(report.date, report);
  }
  return [...dates.values()].sort((a, b) => b.date.localeCompare(a.date));
}
function plain(value) {
  return value.replace(/\[([^\]]+)\]\(<?https?:\/\/[^)]+\)/g, "$1").replace(/\*\*|^>\s*/gm, "").trim();
}
function actionProse(value) {
  return value.split("\n").map((line) => plain(line).replace(/^[-→]\s*/, "")).map((line) => line.replace(/^(目标|边界|输入|验收)[:：\s]+/, (_, label) => ({ \u76EE\u6807: "", \u8FB9\u754C: "\u6267\u884C\u65F6\uFF0C", \u8F93\u5165: "\u53EF\u53C2\u8003", \u9A8C\u6536: "\u6700\u540E\u4EA4\u4ED8" })[label])).filter(Boolean).map((line) => /[。！？.!?；]$/.test(line) ? line : line + "\u3002").join("\n");
}
function parseReport(html, date, origin) {
  let data;
  try {
    data = JSON.parse(dataBlock.exec(html)?.[1] || "null");
  } catch {
    throw Error("\u672C\u671F\u6C47\u62A5\u7684\u7ED3\u6784\u5316\u6570\u636E\u65E0\u6CD5\u8BFB\u53D6");
  }
  if (!data || data.publication !== date || !Array.isArray(data.rows) || !Array.isArray(data.candidates) || !Array.isArray(data.actions)) {
    throw Error("\u672C\u671F\u9644\u4EF6\u7F3A\u5C11\u5BF9\u5E94\u7684\u6C47\u62A5\u6570\u636E");
  }
  const rows = /* @__PURE__ */ new Map();
  for (const row of data.rows.slice(0, 3e3)) {
    if (!row || !number(row.id) || !text(row.title) || rows.has(number(row.id))) continue;
    rows.set(number(row.id), {
      id: number(row.id),
      title: text(row.title),
      platform: text(row.platform),
      status: text(row.status),
      url: https(row.url),
      images: array(row.images).slice(0, 64).filter((item) => typeof item?.src === "string" && imageData.test(item.src)).map((item) => ({ src: item.src, alt: text(item.alt) || text(row.title) })),
      videos: array(row.videos).slice(0, 16).flatMap((item) => {
        const url = communityFile(item?.url || item?.src, origin);
        return url ? [{ url, title: text(item.title) || text(row.title) }] : [];
      })
    });
  }
  const candidates = data.candidates.slice(0, 3e3).flatMap((c) => c && rows.has(number(c.id)) && text(c.title) ? [{ id: number(c.id), title: text(c.title), body: text(c.body, 12e3) }] : []);
  const actions = data.actions.slice(0, 3e3).flatMap((a) => {
    if (!a || !number(a.id) || !text(a.title)) return [];
    const sourceIds = [...new Set(array(a.sourceIds).length ? a.sourceIds.map(number).filter(Boolean) : [number(a.id)])];
    return [{
      id: number(a.id),
      title: text(a.title),
      sourceIds,
      project: text(a.project, 100) || (a.title.includes("\u5185\u5BB9\u5DE5\u5382") ? "\u5185\u5BB9\u5DE5\u5382" : a.title.includes("\u4E2D\u6D77\u4E49\u4E4C\u5B89\u6F9C") ? "\u4E2D\u6D77\u4E49\u4E4C\u5B89\u6F9C" : ""),
      recommendation: text(a.recommendation, 12e3) || actionProse(text(a.body, 12e3))
    }];
  });
  return {
    date,
    heading: plain(text(data.heading)).replace(/\s*·\s*\d+月\d+日发稿.*$/, ""),
    summary: plain(text(array(data.sources)[0]?.split?.("\n\n")[1])),
    rows: [...rows.values()],
    candidates,
    actions,
    method: text(data.method, 2e4),
    work: text(data.work, 3e4)
  };
}
async function loadReport(report, session, origin, signal) {
  const url = session.media(report.url);
  if (!url) throw Error("Buzz \u672A\u63D0\u4F9B\u672C\u671F\u9644\u4EF6\u7684\u8BBF\u95EE\u5730\u5740");
  const response = await fetch(url, { signal });
  if (!response.ok) throw Error("\u672C\u671F\u9644\u4EF6\u4E0B\u8F7D\u5931\u8D25");
  const size = Number(response.headers.get("content-length"));
  if (size > REPORT_LIMIT) throw Error("\u672C\u671F\u9644\u4EF6\u8D85\u8FC7 32 MB");
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > REPORT_LIMIT) throw Error("\u672C\u671F\u9644\u4EF6\u8D85\u8FC7 32 MB");
    return parseReport(new TextDecoder().decode(bytes), report.date, origin);
  }
  const decoder = new TextDecoder();
  const chunks = [];
  let total = 0;
  for (; ; ) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > REPORT_LIMIT) {
      await reader.cancel().catch(() => {
      });
      throw Error("\u672C\u671F\u9644\u4EF6\u8D85\u8FC7 32 MB");
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }
  return parseReport(chunks.join("") + decoder.decode(), report.date, origin);
}

// src/media-workspace/execution.mjs
function canExecuteInChannel(channel, viewer) {
  return Boolean(viewer && channel && !channel.archived && !channel.readOnly && !channel.cached && !channel.pending && !channel.metadataPending && !channel.metadataCached && channel.members?.includes(viewer) && ["solo", "stream", "forum"].includes(channel.channelType));
}
async function waitActive(promise, signal) {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(Error("\u6267\u884C\u680F\u5DF2\u5173\u95ED\uFF0C\u4FDD\u7559\u539F\u4F1A\u8BDD\u7F16\u53F7"));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
async function openExecutionSolo({ session, check, record, save, title, signal }) {
  const active = () => {
    signal?.throwIfAborted();
    check();
    if (!session.channelWrites?.available) throw Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u80FD\u5EFA\u7ACB Solo");
  };
  const bound = (id) => {
    const roster = session.channels.list(), c = roster.channels.find((c2) => c2.id === id);
    return roster.status === "ready" && canExecuteInChannel(c, session.viewer) && c.channelType === "solo" && c.private === true && c.creator === session.viewer ? c : null;
  };
  active();
  let route = record.solo ? record : { ...record, solo: crypto.randomUUID(), phase: "reserved", operation: "" };
  const fresh = !record.solo;
  if (fresh) save(route);
  if (bound(route.solo)) {
    save({ ...route, channel: route.solo, phase: "ready" });
    return route.solo;
  }
  if (!fresh) {
    await waitActive(session.channelWrites.refresh(route.solo, { member: session.viewer }), signal);
    active();
    if (bound(route.solo)) {
      save({ ...route, channel: route.solo, phase: "ready" });
      return route.solo;
    }
    const starting = session.channelWrites.starting?.(route.solo);
    if (starting) {
      await waitActive(starting, signal);
      active();
    }
    if (!bound(route.solo)) throw Error("\u539F Solo \u5C1A\u672A\u786E\u8BA4\u6216\u4E0D\u53EF\u8BBF\u95EE\uFF1B\u4FDD\u7559\u539F\u7F16\u53F7\uFF0C\u4E0D\u91CD\u590D\u521B\u5EFA");
  } else {
    active();
    const created = session.channelWrites.start(route.solo, Array.from(title).slice(0, 120).join(""), [], void 0, true, void 0, { active: () => {
      try {
        active();
        return true;
      } catch {
        return false;
      }
    } });
    Promise.resolve(created.ready).catch(() => {
    });
    route = { ...route, phase: "submitted", operation: created.create };
    save(route);
    await waitActive(created.ready, signal);
    active();
    if (!bound(route.solo)) {
      await waitActive(session.channelWrites.refresh(route.solo, { member: session.viewer }), signal);
      active();
    }
    if (!bound(route.solo)) throw Error("Solo \u521B\u5EFA\u5C1A\u672A\u786E\u8BA4\uFF1B\u4FDD\u7559\u539F\u7F16\u53F7\uFF0C\u8BF7\u7A0D\u540E\u7EED\u63A5");
  }
  active();
  save({ ...route, channel: route.solo, phase: "ready" });
  return route.solo;
}

// src/pantao-collections/dispatch.mjs
var instructionLimit = 1800;
var idPattern = /^[a-f0-9]{64}$/;
var maxBytes = 20 * 1024;
var availableAgents = (session) => session.agentChoices?.snapshot().selectable || [];
var emptyInbox = () => ({ items: [], pending: null, history: [] });
function readInbox(storage, key) {
  const stored = storage.getItem(key);
  if (stored === null) return emptyInbox();
  const value = JSON.parse(stored);
  if (!Array.isArray(value?.items) || !value.items.every((item) => item && typeof item.key === "string" && typeof item.instruction === "string") || !Array.isArray(value.history)) {
    throw Error("\u672C\u673A Inbox \u8BB0\u5F55\u65E0\u6CD5\u8BFB\u53D6");
  }
  return value;
}
function createBatch(items, agent, sourceChannel2, uuid = crypto.randomUUID()) {
  const prepared = items.filter((item) => item.instruction.trim());
  if (!prepared.length) throw Error("\u8BF7\u5148\u586B\u5199\u81F3\u5C11\u4E00\u6761\u6267\u884C\u6307\u4EE4");
  if (!agent || !idPattern.test(agent.pubkey)) throw Error("\u8BF7\u9009\u62E9\u4E00\u4E2A\u6267\u884C Agent");
  const lines = prepared.map((item, index) => [
    `${index + 1}. ${item.title}`,
    `\u6536\u85CF\u7F16\u53F7 ${item.date} / ${item.id}`,
    `\u6765\u6E90\u6C47\u62A5 buzz://message?channel=${sourceChannel2}&id=${item.reportId}`,
    item.url,
    "\u6267\u884C\u6307\u4EE4",
    item.instruction.trim()
  ].filter(Boolean).join("\n"));
  const text2 = [
    `@${agent.name} \u8BF7\u6309\u4E0B\u9762\u6BCF\u6761\u300C\u6267\u884C\u6307\u4EE4\u300D\u5F00\u59CB\u5904\u7406\uFF0C\u5E76\u5728\u672C Solo \u56DE\u62A5\u6267\u884C\u7ED3\u679C\u3002`,
    "\u6765\u6E90\u6C47\u62A5\u4E0E\u539F\u5E16\u4EC5\u4F9B\u53C2\u8003\u3002",
    `\u6536\u85CF\u6279\u6B21 ${uuid}`,
    "",
    lines.join("\n\n")
  ].join("\n");
  if (new TextEncoder().encode(text2).byteLength > maxBytes) throw Error("\u672C\u6B21\u6307\u4EE4\u592A\u957F\uFF0C\u8BF7\u5206\u6279\u6267\u884C");
  return {
    id: uuid,
    agent: agent.pubkey,
    name: agent.name,
    items: prepared.map((item) => item.key),
    title: prepared.length === 1 ? `\u6536\u85CF \xB7 ${prepared[0].title}` : `\u6536\u85CF \xB7 ${prepared.length} \u6761\u6267\u884C\u6307\u4EE4`,
    text: text2
  };
}
async function dispatchBatch({ session, batch, save, check, signal }) {
  const { outbox, channelWrites } = session;
  if (!outbox?.recovery || !channelWrites?.available || !channelWrites.addAgents || !session.messages?.send) {
    throw Error("\u5F53\u524D Buzz \u8FDE\u63A5\u65E0\u6CD5\u65B0\u5EFA Solo \u5E76\u53D1\u9001\u6307\u4EE4");
  }
  const active = () => {
    signal.throwIfAborted();
    check();
    if (!availableAgents(session).some((a) => a.pubkey === batch.agent)) throw Error("\u6240\u9009 Agent \u5F53\u524D\u4E0D\u53EF\u7528");
  };
  const isActive = () => {
    try {
      active();
      return true;
    } catch {
      return false;
    }
  };
  const keep = (patch) => {
    batch = { ...batch, ...patch };
    save(batch);
  };
  const solo = await openExecutionSolo({
    session,
    check: active,
    record: batch.route || {},
    save: (route) => keep({ route }),
    title: batch.title,
    signal
  });
  const verified = (requireAgent) => {
    active();
    const channel = session.channels.list().channels.find((c) => c.id === solo);
    if (!canExecuteInChannel(channel, session.viewer) || channel.channelType !== "solo" || channel.private !== true || channel.creator !== session.viewer || channel.members.some((id) => id !== session.viewer && id !== batch.agent) || requireAgent && !channel.members.includes(batch.agent)) {
      throw Error("\u6267\u884C Solo \u7684\u8BBF\u95EE\u6743\u9650\u6216\u6210\u5458\u5DF2\u53D8\u5316");
    }
    return channel;
  };
  if (!verified(false).members.includes(batch.agent)) {
    await channelWrites.addAgents(solo, [batch.agent], () => {
      try {
        verified(false);
        return true;
      } catch {
        return false;
      }
    });
  }
  verified(true);
  await outbox.ready();
  const key = "opcb.collections.dispatch:" + batch.id;
  const existing = outbox.snapshot().find((item) => item.recovery?.key === key) || !batch.messageId && await outbox.recovery(key);
  let messageId = batch.messageId || existing?.event?.id;
  if (!messageId && batch.sending) {
    const events = await session.readRemote([{
      kinds: [9],
      "#h": [solo],
      authors: [session.viewer],
      limit: 30,
      consistency: "strong"
    }], { signal });
    messageId = events.find((e) => e.content === batch.text && e.tags.some((t) => t[0] === "p" && t[1] === batch.agent))?.id;
    if (!messageId) throw Error("\u539F\u6307\u4EE4\u6295\u9012\u5F85\u6838\u5BF9\uFF0C\u8BF7\u6253\u5F00 Solo \u67E5\u770B");
  }
  verified(true);
  if (!messageId) {
    keep({ sending: true });
    try {
      messageId = session.messages.send(solo, batch.text, [batch.agent], [], { key, value: batch.id });
    } catch (error) {
      keep({ sending: false });
      throw error;
    }
  }
  if (!idPattern.test(messageId || "")) throw Error("Buzz \u5C1A\u672A\u8FD4\u56DE\u539F\u6307\u4EE4\u7F16\u53F7\uFF0C\u8BF7\u6253\u5F00 Solo \u6838\u5BF9");
  if (batch.messageId !== messageId) keep({ messageId });
  await channelWrites.delivered(messageId, isActive);
  verified(true);
  return { id: batch.id, channel: solo, messageId, title: batch.title, count: batch.items.length };
}

// plugins/opcb.pantao-collections/0.1.0-rc.1/icon.png
var icon_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAYKADAAQAAAABAAAAYAAAAACpM19OAAAF0UlEQVR4Ae2dy2sbVxTGLT8aPyHF9iaLQHb9A1psaroq2ZWsAknaPLxKMXZBtgx1uujGpUlBsgW2MSkUTBuSkHV2IauAIYkXCe2iXRWy6MpuA0K2wA/1O2JGkZTRzJnHmTtjH8EgzZ0z5977++6cc0czGnV06EsJKAEloASUgBJQAkpACSgBJaAElIASUAJK4KQQyETV0enp6eG+vr7Pq9Xq6ah8JtFPJpN5u7e393RtbW0nivZFIsDc3NwXXV1d99GgoSgalQIfpcPDwy+XlpYeh21raAFo5Pf39/99guDbzEu7u7vnwh4Jnba3oO8Udk4gfMI1ZPU9KLrafqEFOO4x341uFH0PLYBbA3WbNwEVwJuRqEW3pHccovewPJOsQ9o3pp2fYbkqVY+0AM8KhcLPUo2Pw28ul+uQFEBDUBwqutShArjAiWOTChAHZZc6VAAXOHFsUgHioOxShwrgAieOTSpAHJRd6hA9D3Cp971NcV1PiPr7/Pc64rMgEQI0Xk8AIJ9d8G+Or89LqDOS7/P91968h/EQRCPfwMWcIaqT6m7GEf+acQEMXk+I5Pv8sJIZFyBsB9K+v3EB6AI3IJYMgCxZdRuo+l2VxgWga6p0gTtmEWoX1cNez32HMfinRMyC6O4CJMRzcdzWotPQNoPFGo2P2mw+tsXGQ9CxJcvsmArABCVlpgJIkWX6VQGYoKTMVAApsky/KgATlJSZCiBFlulXBWCCkjJTAaTIMv2qAExQUmYqgBRZpl8VgAlKykwFkCLL9KsCMEFJmakAUmSZflUAJigpMxVAiizTrwrABCVlpgJIkWX6VQGYoKTMVAApsky/KgATlJSZCiBFluk3ETdmMdvaZJbNZk/39PScp8L9/f0nxWLxbZNBSlZSJ8Dk5GTvyMhIDnxvYRkgzt3d3eX5+fnb29vbhY2NjQqVpeWVqhCEH1VcGh0d/Qu3F/6ApQafQNNnKqNtZJMW+NTOVBwBs7OzH+MHFUVAnvCAexZ2D3E0fIMbfrPLy8tbHvbGNydagJmZmTO9vb0/gtJ1wGf/domEghAvIMSvlUrlu9XV1X+Mk27TgEQKQHF+eHh4HiAXsNRDTZs+OBZjPxLsBgS8iAdu3NnZ2cknMT8kLgfYcb6zs3MxKPxGRcgH+UpqfkjMEYBR+glgLWPxivN1vngWUZVWsA8nPNXzA3abxWN0XtYdGfxgXICgcR4QN7FkLXaUoD/lcLQEfp6U/GBMAMxs+hAacgDiN86/OTo6WsAIftAAfAJH0BX4u4Oysw3ljh9RZ1N+gL8CZkx7jsbChUZyAMV5nDz96SfOY7SXsXx/cHDwUQv8GiIqo21kQ7YcbtChlh+oLabOH2I9AkLE+XuYTi54TSetUbyIsPYLZj90NFy1RruXHsbyQywCWHH+NihcYwKpAcNIrsV5vwnTEuo6BF+BoyD54TcIfstLcC9VOds5swdXP+jkTYSSu05GiK2UJIcA3XecB/xv8/n8Qye/fsuQcC+jDT9hP8/8YPumMIaFjqIS+le0yxvf0b+vMThCPZRQNAeg4fmgcT4q+ASMfAXND9SHRuhRf5YOQSz/GGk0nxc97Fvyg59wyOpDUGFEnXMaBfaB4jzHt5ONFddvIHSuYjs7Pzj5iqLMpABvAD+yOO8XhpXYJ4LkB791udmL5gCnigG9Pp+PMs471cUpC5IfOH65NrEdAQAvHue5nW61C5EfWl35Xo9CgH+9agX7WOO8V3vabQ+QHzz73q4uuzy0APgbj6eDg4P0vB+n/48xGuftTvp9Z+YH+gsTetZRqFdXqL2x89bWVmV8fPw15ssXsHqK/FlxfhGXBb/Co2heUVkaX5ubm3+MjY3RSSZd6B/DydwHVj/oeUOXV1ZWfg/br9BnwnYDpqamPhwYGDiPRlbTfJuI3Z/Wd/s2GAyuTLlcfrK+vv5fq42uKwEloASUgBJQAkpACSgBJaAElIASUAJKQAkoATcC/wOtoC8jpqDEyQAAAABJRU5ErkJggg==";

// src/pantao-collections/workspace.css
var workspace_default = '.pcl-workspace {\n  --pcl-bg: var(--workspace, #f7f8fa);\n  --pcl-card: var(--surface, #fff);\n  --pcl-text: var(--text, #1d232c);\n  --pcl-muted: var(--text-muted, #596471);\n  --pcl-border: var(--border, #dce1e7);\n  --pcl-soft: var(--surface-control, #f1f4f7);\n  --pcl-accent: #234b70;\n  --pcl-accent-text: #fff;\n  --pcl-active: #eaf1f7;\n  box-sizing: border-box;\n  color: var(--pcl-text);\n  background: var(--pcl-bg);\n  font: 15px/1.55 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;\n  height: 100%;\n  min-width: 0;\n  overflow: auto;\n  padding: 16px clamp(14px, 2.5cqw, 30px) 24px;\n  container-type: inline-size;\n}\n:root[data-color-mode="dark"] .pcl-workspace {\n    --pcl-bg: var(--workspace, #191d23);\n    --pcl-card: var(--surface, #22272f);\n    --pcl-text: var(--text, #eef1f4);\n    --pcl-muted: var(--text-muted, #aab4c1);\n    --pcl-border: var(--border, #3b4654);\n    --pcl-soft: #2a313b;\n    --pcl-accent: #a7c9eb;\n    --pcl-accent-text: #182638;\n    --pcl-active: #263e54;\n}\n@media (prefers-color-scheme: dark) {\n  :root:not([data-color-mode]) .pcl-workspace {\n    --pcl-bg: var(--workspace, #191d23);\n    --pcl-card: var(--surface, #22272f);\n    --pcl-text: var(--text, #eef1f4);\n    --pcl-muted: var(--text-muted, #aab4c1);\n    --pcl-border: var(--border, #3b4654);\n    --pcl-soft: #2a313b;\n    --pcl-accent: #a7c9eb;\n    --pcl-accent-text: #182638;\n    --pcl-active: #263e54;\n  }\n}\n.pcl-workspace * { box-sizing: border-box; }\n.pcl-workspace :is(h1,h2,h3,p,dl,dd,figure,ul) { margin: 0; }\n.pcl-workspace h1 { font-size: clamp(22px, 3cqw, 30px); line-height: 1.25; font-weight: 730; letter-spacing: -.025em; }\n.pcl-workspace h2 { font-size: 17px; line-height: 1.35; font-weight: 720; }\n.pcl-workspace h3 { font-size: 19px; line-height: 1.4; font-weight: 650; overflow-wrap: anywhere; }\n.pcl-workspace a { color: var(--pcl-accent); text-underline-offset: 3px; }\n.pcl-workspace :is(button, input, select, textarea) { font: inherit; color: inherit; min-width: 0; }\n.pcl-workspace :is(button, input, select, textarea):focus-visible,\n.pcl-workspace :is(a, summary):focus-visible { outline: 2px solid var(--pcl-accent); outline-offset: 3px; }\n.pcl-workspace button {\n  cursor: pointer; border: 1px solid var(--pcl-border); background: var(--pcl-card);\n  border-radius: 8px; padding: 7px 12px; line-height: 1.35; font-weight: 600;\n}\n.pcl-workspace button:not(:disabled):hover { background: var(--pcl-soft); }\n.pcl-workspace button:disabled { opacity: .55; cursor: default; }\n.pcl-workspace :is(input, select, textarea) {\n  border: 1px solid var(--pcl-border); border-radius: 8px; background: var(--pcl-bg); padding: 8px 10px;\n}\n.pcl-workspace :is(input, textarea)::placeholder { color: var(--pcl-muted); }\n.pcl-workspace small, .pcl-workspace .pcl-muted { color: var(--pcl-muted); font-size: 13px; overflow-wrap: anywhere; }\n.pcl-workspace :is(details, .pcl-list-item) { border-top: 1px solid var(--pcl-border); }\n.pcl-workspace details { padding: 10px 0; }\n.pcl-workspace summary { cursor: pointer; color: var(--pcl-muted); font-weight: 600; }\n\n.pcl-workspace .pcl-header { max-width: 1440px; margin: 0 auto 16px; }\n.pcl-workspace .pcl-topline { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px 16px; }\n.pcl-workspace .pcl-issues { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }\n.pcl-workspace .pcl-issues label { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--pcl-muted); }\n.pcl-workspace .pcl-issues select { color:var(--pcl-text); }\n.pcl-workspace .pcl-nav { display:flex; gap:20px; margin-top:10px; border-bottom:1px solid var(--pcl-border); }\n.pcl-workspace .pcl-nav button { border:0; border-radius:0; background:none; padding:10px 6px; color:var(--pcl-muted); }\n.pcl-workspace .pcl-nav button[aria-current="page"] { color:var(--pcl-accent); box-shadow:inset 0 -2px var(--pcl-accent); }\n.pcl-workspace .pcl-quiet { border-color:transparent; background:transparent; color:var(--pcl-accent); font-size:13px; }\n.pcl-workspace .pcl-columns {\n  display:grid; grid-template-columns:minmax(0, .9fr) minmax(0, 1.1fr); gap:14px;\n  align-items:start; margin:0 auto; max-width:1440px;\n}\n.pcl-workspace .pcl-library { grid-template-columns:repeat(2,minmax(0,1fr)); }\n.pcl-workspace .pcl-actions { grid-template-columns:minmax(0,.75fr) minmax(0,1.25fr); }\n.pcl-workspace .pcl-pane {\n  min-width:0; display:flex; flex-direction:column; gap:14px; padding:16px;\n  border-radius:12px; border:1px solid var(--pcl-border); background:var(--pcl-card);\n}\n.pcl-workspace .pcl-pane-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:32px; }\n.pcl-workspace .pcl-count { color:var(--pcl-muted); font-size:13px; font-variant-numeric:tabular-nums; }\n.pcl-workspace .pcl-report-title { font-size:clamp(20px,2.3cqw,28px); line-height:1.35; }\n.pcl-workspace .pcl-counts { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); }\n.pcl-workspace .pcl-counts div { padding:4px 0 4px 12px; border-left:1px solid var(--pcl-border); }\n.pcl-workspace .pcl-counts dt { color:var(--pcl-muted); font-size:13px; }\n.pcl-workspace .pcl-counts dd { font-size:24px; font-weight:700; font-variant-numeric:tabular-nums; }\n.pcl-workspace .pcl-first { display:grid; gap:7px; padding-top:14px; border-top:1px solid var(--pcl-border); }\n.pcl-workspace .pcl-other { display:grid; gap:7px; margin-top:8px; }\n.pcl-workspace .pcl-first h2 { margin-bottom:4px; }\n.pcl-workspace .pcl-choice { width:100%; display:flex; align-items:center; gap:10px; text-align:left; padding:10px; min-height:42px; }\n.pcl-workspace .pcl-choice[aria-pressed="true"] { background:var(--pcl-active); border-color:var(--pcl-accent); }\n.pcl-workspace .pcl-choice span:last-child { min-width:0; overflow-wrap:anywhere; }\n.pcl-workspace .pcl-index { color:var(--pcl-muted); font-size:13px; font-weight:600; font-variant-numeric:tabular-nums; }\n.pcl-workspace .pcl-meta { color:var(--pcl-muted); font-size:13px; }\n.pcl-workspace .pcl-detail { display:grid; gap:10px; min-width:0; }\n.pcl-workspace .pcl-prose { display:grid; gap:8px; font-size:16px; line-height:1.65; overflow-wrap:anywhere; }\n.pcl-workspace details .pcl-prose { margin-top:8px; }\n.pcl-workspace .pcl-gallery { display:grid; gap:8px; grid-template-columns:repeat(2,minmax(0,1fr)); }\n.pcl-workspace .pcl-gallery:empty { display:none; }\n.pcl-workspace .pcl-gallery :is(img,video) {\n  display:block; max-height:60vh; width:100%; object-fit:contain;\n  background:var(--pcl-soft); border-radius:8px; border:1px solid var(--pcl-border);\n}\n.pcl-workspace .pcl-gallery > :only-child { grid-column:1/-1; }\n\n.pcl-workspace .pcl-filters { display:flex; gap:8px; }\n.pcl-workspace .pcl-filters input { flex:1; width:100%; }\n.pcl-workspace .pcl-list { display:grid; }\n.pcl-workspace .pcl-actions .pcl-list { gap:7px; }\n.pcl-workspace .pcl-list-line { display:flex; align-items:center; gap:8px; padding:8px 0; }\n.pcl-workspace .pcl-row-control {\n  display:flex; align-items:center; gap:10px; flex:1; min-width:0;\n  padding:4px; text-align:left; border:0; background:none;\n}\n.pcl-workspace .pcl-row-control span:last-child { overflow-wrap:anywhere; }\n.pcl-workspace .pcl-row-control strong, .pcl-workspace .pcl-row-control small { display:block; }\n.pcl-workspace .pcl-row-control img, .pcl-workspace .pcl-empty-thumb {\n  display:grid; place-items:center; flex:none; width:44px; height:40px; object-fit:cover;\n  background:var(--pcl-soft); color:var(--pcl-muted); border-radius:6px; font-size:13px;\n}\n.pcl-workspace .pcl-add { flex:none; font-size:13px; color:var(--pcl-accent); }\n.pcl-workspace .pcl-row-expanded { padding:4px 0 12px; display:grid; gap:6px; }\n.pcl-workspace .pcl-inbox-items { display:grid; gap:12px; }\n.pcl-workspace .pcl-inbox-item { display:grid; gap:10px; padding:11px; border:1px solid var(--pcl-border); border-radius:8px; }\n.pcl-workspace .pcl-inbox-title { display:flex; justify-content:space-between; align-items:start; gap:8px; }\n.pcl-workspace .pcl-inbox-title h3 { font-size:15px; }\n.pcl-workspace .pcl-inbox-title button { flex:none; }\n.pcl-workspace .pcl-inbox-item label, .pcl-workspace .pcl-execute label { display:grid; gap:5px; font-size:13px; color:var(--pcl-muted); }\n.pcl-workspace .pcl-inbox-item textarea { width:100%; resize:vertical; color:var(--pcl-text); font-size:15px; }\n.pcl-workspace .pcl-execute { display:grid; gap:8px; padding-top:12px; border-top:1px solid var(--pcl-border); }\n.pcl-workspace .pcl-execute select { color:var(--pcl-text); }\n.pcl-workspace button.pcl-primary {\n  display:block; width:100%; min-height:45px; background:var(--pcl-accent); color:var(--pcl-accent-text);\n  border-color:var(--pcl-accent); font-size:16px; font-weight:720;\n}\n.pcl-workspace button.pcl-primary:hover:not(:disabled) { background:var(--pcl-accent); filter:brightness(.92); }\n.pcl-workspace .pcl-history { padding-left:18px; }\n.pcl-workspace .pcl-history button { text-align:left; }\n\n.pcl-workspace .pcl-evidence { display:grid; gap:10px; min-width:0; }\n.pcl-workspace .pcl-evidence h3 { font-size:15px; }\n.pcl-workspace .pcl-evidence-grid {\n  display:grid; grid-template-columns:repeat(var(--pcl-evidence-count),minmax(0,1fr)); gap:8px;\n}\n.pcl-workspace .pcl-evidence-grid figure {\n  min-width:0; border:1px solid var(--pcl-border); border-radius:8px; overflow:hidden;\n}\n.pcl-workspace .pcl-evidence-grid a { display:block; text-decoration:none; }\n.pcl-workspace .pcl-evidence-grid a:hover { text-decoration:underline; }\n.pcl-workspace .pcl-evidence-grid img, .pcl-workspace .pcl-evidence-empty {\n  width:100%; display:grid; aspect-ratio:4/3; object-fit:cover; place-items:center;\n  color:var(--pcl-muted); background:var(--pcl-soft); font-size:12px; text-align:center;\n}\n.pcl-workspace .pcl-evidence-grid span:not(.pcl-evidence-empty) {\n  display:block; padding:6px; color:var(--pcl-text); font-size:12px; overflow-wrap:anywhere;\n}\n.pcl-workspace .pcl-recommendation { border-top:1px solid var(--pcl-border); padding-top:14px; }\n.pcl-workspace .pcl-project { font-weight:800; color:var(--pcl-accent); }\n.pcl-workspace .pcl-state { max-width:1440px; margin:auto; padding:20px 0; }\n@container (max-width: 640px) {\n  .pcl-workspace .pcl-columns { grid-template-columns:minmax(0,1fr); }\n  .pcl-workspace .pcl-pane { padding:12px; }\n  .pcl-workspace .pcl-evidence-grid { gap:5px; }\n  .pcl-workspace .pcl-evidence-grid span:not(.pcl-evidence-empty) { padding:4px; }\n}\n\n@container (min-width: 641px) {\n  .pcl-workspace :is(.pcl-overview, .pcl-library) > .pcl-pane:last-child {\n    position: sticky;\n    top: 0;\n    max-height: 76vh;\n    overflow: auto;\n  }\n}\n';

// src/pantao-collections/plugin.mjs
var inject = ["pages", "relay", "navigation"];
var pluginId = "opcb.pantao-collections";
var EMPTY = Object.freeze({ rows: [], status: "loading" });
var NO_AGENTS = Object.freeze({ identities: [], selectable: [] });
var noop = () => {
};
var noopSubscribe = () => noop;
var issueLabel = (date) => `${Number(date.slice(4, 6))} \u6708 ${Number(date.slice(6))} \u65E5`;
var rowLabel = (id) => id.padStart(2, "0");
var candidateTitle = (title) => title.split(/\s·\s/)[0];
var ISSUE_PAGE_SIZE = 100;
function apply(ctx) {
  const R = ctx.react;
  const h = R.createElement;
  const text2 = (label, children) => h("p", { className: "pcl-muted", role: label }, children);
  const button = (label, onClick, props = {}) => h("button", { type: "button", onClick, ...props }, label);
  const external = (url, label) => h("a", { href: url, target: "_blank", rel: "noreferrer noopener" }, label);
  const detail = (label, children) => h("details", null, h("summary", null, label), children);
  const field = (label, content) => h("div", { className: "pcl-pane-heading" }, h("h2", null, label), content);
  const pane = (label, children, headingExtra) => h("section", { className: "pcl-pane", "aria-label": label }, field(label, headingExtra), children);
  const rawInline = (value, key) => {
    const pieces = value.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(<?https:\/\/[^)]+\))/g);
    return h("p", { key }, pieces.map((piece, index) => {
      if (piece.startsWith("**") && piece.endsWith("**")) return h("strong", { key: index }, piece.slice(2, -2));
      const link = /^\[([^\]]+)\]\(<?([^>]+)>?\)$/.exec(piece);
      if (link && https(link[2])) return h("a", { key: index, href: https(link[2]), target: "_blank", rel: "noreferrer noopener" }, link[1]);
      return piece;
    }));
  };
  const prose = (value) => value.split(/\n+/).filter(Boolean).map(rawInline);
  function titleWithProject(title, project) {
    const index = project && title.indexOf(project);
    return project ? index >= 0 ? [
      title.slice(0, index),
      h("strong", { className: "pcl-project", key: "project" }, project),
      title.slice(index + project.length)
    ] : [h("strong", { className: "pcl-project", key: "project" }, project), " \xB7 ", title] : title;
  }
  function Gallery({ row, session }) {
    return h(
      "div",
      { className: "pcl-gallery" },
      row.images.map((image, index) => h("img", {
        key: index,
        src: image.src,
        alt: image.alt,
        loading: "lazy",
        decoding: "async"
      })),
      row.videos.map((video) => {
        const src = session.media(video.url);
        return src ? h("video", { key: video.url, src, controls: true, preload: "none", "aria-label": video.title }) : null;
      })
    );
  }
  function ReportView({ report, selected, select, session, openSource }) {
    const candidate = report.candidates.find((c) => c.id === selected);
    const row = report.rows.find((r) => r.id === candidate?.id) || report.rows[0];
    const priority = report.candidates.filter((c) => c.title.includes("\u4F18\u5148\u8BD5"));
    const counts = [[report.rows.length, "\u6536\u85CF"], [report.candidates.length, "\u7CBE\u9009"], [report.actions.length, "\u884C\u52A8\u5EFA\u8BAE"]];
    const other = priority.length ? report.candidates.filter((c) => !priority.includes(c)) : [];
    const choice = (c) => h("button", {
      key: c.id,
      type: "button",
      className: "pcl-choice",
      "aria-pressed": c.id === selected,
      onClick: () => select(c.id)
    }, h("span", { className: "pcl-index" }, rowLabel(c.id)), h("span", null, candidateTitle(c.title)));
    return h(
      "div",
      { className: "pcl-columns pcl-overview" },
      pane("\u6536\u85CF\u6C47\u62A5", h(
        R.Fragment,
        null,
        h("h3", { className: "pcl-report-title" }, report.heading || issueLabel(report.date)),
        h("dl", { className: "pcl-counts" }, counts.map(([count, label]) => h("div", { key: label }, h("dt", null, label), h("dd", null, count)))),
        report.summary && text2(null, report.summary),
        h(
          "section",
          { className: "pcl-first" },
          h("h2", null, "\u8FD9\u4E00\u671F\u5148\u770B"),
          (priority.length ? priority : report.candidates).map(choice),
          other.length > 0 && detail(`\u5176\u4F59\u7CBE\u9009 \xB7 ${other.length} \u6761`, h("div", { className: "pcl-other" }, other.map(choice))),
          !report.candidates.length && text2(null, "\u672C\u671F\u6CA1\u6709\u7CBE\u9009\u6536\u85CF\u3002")
        )
      )),
      pane(
        "\u672C\u671F\u5185\u5BB9\u9884\u89C8",
        h(
          R.Fragment,
          null,
          row && h(
            "article",
            { className: "pcl-detail" },
            h("div", { className: "pcl-meta" }, `${rowLabel(row.id)} \xB7 ${row.platform}`),
            h("h3", null, row.title),
            h(Gallery, { key: row.id, row, session }),
            !row.images.length && !row.videos.length && text2(null, row.status || "\u672C\u6761\u6682\u65E0\u914D\u56FE\u6216\u89C6\u9891\u3002"),
            candidate && h("div", { className: "pcl-prose" }, prose(candidate.body.replace(/^→\s*/, ""))),
            row.url && external(row.url, "\u6253\u5F00\u539F\u5E16 \u2197")
          ),
          report.work && detail("\u8FD1\u671F\u5DE5\u4F5C\u5173\u8054", h("div", { className: "pcl-prose" }, prose(report.work))),
          report.method && detail("\u6765\u6E90\u4E0E\u91C7\u96C6\u53E3\u5F84", h("div", { className: "pcl-prose" }, prose(report.method)))
        ),
        button("\u539F\u7B80\u62A5 \u2197", openSource, { className: "pcl-quiet" })
      )
    );
  }
  function CollectionsView({
    report,
    inbox,
    change,
    active,
    session,
    executor,
    setExecutor,
    agents,
    busy,
    execute,
    canExecute,
    openSolo,
    message
  }) {
    const [query, search] = R.useState("");
    const [expanded, expand] = R.useState("");
    const [platform, setPlatform] = R.useState("");
    const platforms = [...new Set(report.rows.map((r) => r.platform).filter(Boolean))];
    const list = report.rows.filter((r) => (!platform || r.platform === platform) && [r.id, rowLabel(r.id), r.title, r.status].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
    const keys = new Set(inbox.items.map((item) => item.key));
    const ready = inbox.items.filter((item) => item.instruction.trim()).length;
    const disabled = busy || !!inbox.pending;
    return h(
      "div",
      { className: "pcl-columns pcl-library" },
      pane("\u5B8C\u6574\u6E05\u5355", h(
        R.Fragment,
        null,
        h(
          "div",
          { className: "pcl-filters" },
          h("input", { type: "search", value: query, onChange: (e) => search(e.target.value), placeholder: "\u641C\u7D22\u6536\u85CF", "aria-label": "\u641C\u7D22\u6536\u85CF" }),
          platforms.length > 1 && h(
            "select",
            { value: platform, onChange: (e) => setPlatform(e.target.value), "aria-label": "\u5E73\u53F0" },
            h("option", { value: "" }, "\u5168\u90E8\u5E73\u53F0"),
            platforms.map((item) => h("option", { key: item }, item))
          )
        ),
        h("div", { className: "pcl-list" }, list.map((row) => {
          const key = `${report.date}:${row.id}`;
          const added = keys.has(key);
          return h(
            "article",
            { key, className: "pcl-list-item" },
            h(
              "div",
              { className: "pcl-list-line" },
              h(
                "button",
                {
                  type: "button",
                  className: "pcl-row-control",
                  "aria-expanded": expanded === key,
                  onClick: () => expand(expanded === key ? "" : key)
                },
                row.images[0] ? h("img", { src: row.images[0].src, alt: "", loading: "lazy", decoding: "async" }) : h("span", { className: "pcl-empty-thumb", "aria-hidden": true }, rowLabel(row.id)),
                h("span", null, h("strong", null, row.title), h("small", null, `${rowLabel(row.id)} \xB7 ${row.platform}`))
              ),
              button(added ? "\u5DF2\u52A0\u5165" : "+ Inbox", () => change((state) => state.items.some((item) => item.key === key) ? state : { ...state, items: [...state.items, {
                key,
                id: row.id,
                title: row.title,
                date: report.date,
                reportId: active.id,
                url: row.url,
                instruction: ""
              }] }), {
                className: "pcl-add",
                disabled: disabled || added,
                "aria-label": `\u52A0\u5165 Inbox\uFF1A${row.title}`
              })
            ),
            expanded === key && h(
              "div",
              { className: "pcl-row-expanded" },
              row.status && text2(null, row.status),
              h(Gallery, { row, session }),
              row.url && external(row.url, "\u6253\u5F00\u539F\u5E16 \u2197")
            )
          );
        }), !list.length && text2("status", "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u6536\u85CF\u3002"))
      ), h("span", { className: "pcl-count" }, `${list.length} \u6761`)),
      pane(
        "Inbox",
        h(
          R.Fragment,
          null,
          h("div", { className: "pcl-inbox-items" }, inbox.items.length ? inbox.items.map((item) => h(
            "article",
            {
              key: item.key,
              className: "pcl-inbox-item"
            },
            h(
              "div",
              { className: "pcl-inbox-title" },
              h(
                "div",
                null,
                h("h3", null, item.title),
                h("small", null, `${issueLabel(item.date)}\u520A \xB7 ${rowLabel(item.id)}`)
              ),
              button(
                "\u79FB\u9664",
                () => change((state) => ({ ...state, items: state.items.filter((row) => row.key !== item.key) })),
                { className: "pcl-quiet", disabled, "aria-label": `\u4ECE Inbox \u79FB\u9664\uFF1A${item.title}` }
              )
            ),
            h(
              "label",
              null,
              h("span", null, "\u6267\u884C\u6307\u4EE4"),
              h("textarea", {
                value: item.instruction,
                disabled,
                rows: 2,
                maxLength: instructionLimit,
                placeholder: "\u5199\u4E0B\u8981\u505A\u4EC0\u4E48",
                "aria-label": `\u6267\u884C\u6307\u4EE4\uFF1A${item.title}`,
                onChange: (e) => {
                  const instruction = e.target.value;
                  change((state) => ({
                    ...state,
                    items: state.items.map((row) => row.key === item.key ? { ...row, instruction } : row)
                  }));
                }
              })
            )
          )) : text2(null, "\u4ECE\u5DE6\u4FA7\u628A\u6536\u85CF\u52A0\u5165 Inbox\uFF0C\u518D\u4E3A\u6BCF\u6761\u586B\u5199\u6267\u884C\u6307\u4EE4\u3002")),
          inbox.history.length > 0 && detail(`\u5DF2\u53D1\u5F80 Solo \xB7 ${inbox.history.length} \u6279`, h(
            "ul",
            { className: "pcl-history" },
            inbox.history.map((record) => h("li", { key: record.id }, button(record.title + " \u2197", () => openSolo(record.channel, record.messageId), { className: "pcl-quiet" })))
          )),
          h(
            "div",
            { className: "pcl-execute" },
            h(
              "label",
              null,
              h("span", null, "\u6267\u884C Agent"),
              h(
                "select",
                { value: inbox.pending?.agent || executor, disabled, onChange: (e) => setExecutor(e.target.value) },
                h("option", { value: "" }, agents.length ? "\u8BF7\u9009\u62E9" : "\u6682\u65E0\u53EF\u7528 Agent"),
                agents.map((agent) => h("option", { value: agent.pubkey, key: agent.pubkey }, agent.name))
              )
            ),
            message && text2("status", message),
            inbox.pending?.route?.channel && button("\u6253\u5F00\u539F Solo \u2197", () => openSolo(inbox.pending.route.channel, inbox.pending.messageId), { className: "pcl-quiet" }),
            button(busy ? "\u6B63\u5728\u63D0\u4EA4\u7ED9 Buzz\u2026" : inbox.pending ? "\u6838\u5BF9\u539F\u53D1\u9001" : "\u6267\u884C", execute, {
              className: "pcl-primary",
              disabled: busy || !canExecute || !inbox.pending && (!ready || !executor)
            }),
            !canExecute ? text2("status", "\u5F53\u524D\u8FDE\u63A5\u65E0\u6CD5\u521B\u5EFA Solo \u6216\u53D1\u9001\u6307\u4EE4\u3002") : !inbox.pending && text2(null, ready ? `${ready} \u6761\u6307\u4EE4\u5C06\u53D1\u5F80\u4E00\u4E2A\u65B0\u7684\u79C1\u4EBA Solo\u3002` : "\u586B\u597D\u6307\u4EE4\u540E\u53EF\u6267\u884C\u3002")
          )
        ),
        h("span", { className: "pcl-count" }, `${inbox.items.length} \u6761`)
      )
    );
  }
  function ActionsView({ report, selected, select }) {
    const action = report.actions.find((a) => a.id === selected);
    const rowById = new Map(report.rows.map((r) => [r.id, r]));
    return h(
      "div",
      { className: "pcl-columns pcl-actions" },
      pane("\u6267\u884C\u5EFA\u8BAE", report.actions.length ? h("div", { className: "pcl-list" }, report.actions.map((a) => h("button", {
        key: a.id,
        type: "button",
        className: "pcl-choice",
        "aria-pressed": a.id === selected,
        onClick: () => select(a.id)
      }, h("span", { className: "pcl-index" }, rowLabel(a.id)), h("span", null, a.title)))) : text2("status", "\u672C\u671F\u6CA1\u6709\u6267\u884C\u5EFA\u8BAE\u3002")),
      pane("\u5EFA\u8BAE\u8BE6\u60C5", action ? h(
        R.Fragment,
        null,
        h(
          "section",
          { className: "pcl-evidence" },
          h("h3", null, "\u4F9D\u636E\u7684\u6536\u85CF"),
          action.sourceIds.length ? h(
            "div",
            { className: "pcl-evidence-grid", style: { "--pcl-evidence-count": Math.min(4, action.sourceIds.length) } },
            action.sourceIds.map((id) => {
              const row = rowById.get(id);
              const cover = row?.images[0];
              const content = [
                cover ? h("img", { key: "image", src: cover.src, alt: cover.alt, loading: "lazy", decoding: "async" }) : h("span", { key: "image", className: "pcl-evidence-empty" }, row ? "\u6682\u65E0\u914D\u56FE" : "\u6765\u6E90\u672A\u6536\u5F55"),
                h("span", { key: "title" }, row ? `${rowLabel(id)} \xB7 ${row.title}` : `\u6536\u85CF ${rowLabel(id)}`)
              ];
              return h("figure", { key: id }, row?.url ? external(row.url, content) : content);
            })
          ) : text2(null, "\u672C\u6761\u5EFA\u8BAE\u6682\u65E0\u53EF\u6838\u5BF9\u7684\u6536\u85CF\u7F16\u53F7\u3002")
        ),
        h(
          "section",
          { className: "pcl-detail pcl-recommendation" },
          h("h3", null, titleWithProject(action.title, action.project)),
          h("div", { className: "pcl-prose" }, prose(action.recommendation))
        )
      ) : text2(null, "\u672C\u671F\u6CA1\u6709\u53EF\u67E5\u770B\u7684\u5EFA\u8BAE\u3002"))
    );
  }
  function Book({ connection, channel }) {
    const session = connection.session;
    const origin = connection.origin;
    const lifetime = R.useRef(new AbortController());
    R.useEffect(() => {
      if (lifetime.current.signal.aborted) lifetime.current = new AbortController();
      const controller = lifetime.current;
      return () => controller.abort();
    }, []);
    const snapshot = R.useCallback(() => session.channels.window(channel.id) || EMPTY, [session, channel.id]);
    const subscribe = R.useCallback((fn) => session.channels.subscribeWindow(channel.id, fn), [session, channel.id]);
    const window = R.useSyncExternalStore(subscribe, snapshot, snapshot);
    const choices = R.useSyncExternalStore(
      session.agentChoices?.subscribe || noopSubscribe,
      session.agentChoices?.snapshot || (() => NO_AGENTS)
    );
    const publishers = [session.viewer, ...choices.identities.map((a) => a.pubkey)].sort().join(",");
    const options = R.useMemo(
      () => ({ channel: channel.id, origin, publishers: new Set(publishers.split(",")) }),
      [channel.id, origin, publishers]
    );
    const [events, setEvents] = R.useState([]);
    const [cursor, setCursor] = R.useState(null);
    const [readingHistory, setReadingHistory] = R.useState(false);
    const [historyError, setHistoryError] = R.useState("");
    const [revision, refresh] = R.useState(0);
    const historyFlight = R.useRef(false);
    const [date, setDate] = R.useState("");
    const [tab, setTab] = R.useState("overview");
    const [loaded, setLoaded] = R.useState(null);
    const [preview, setPreview] = R.useState("");
    const [action, setAction] = R.useState("");
    const [executor, setExecutor] = R.useState("");
    const [main, setMain] = R.useState("");
    const storeKey = `opcb.pantao-collections.v1:${connection.scope}:${channel.id}`;
    const [inbox, setInbox] = R.useState(emptyInbox);
    const [storageReady, setStorageReady] = R.useState(false);
    const [busy, setBusy] = R.useState(false);
    const [notice, setNotice] = R.useState("");
    const flight = R.useRef(false);
    const agents = availableAgents(session);
    const picked = agents.find((a) => a.pubkey === executor) || agents.find((a) => a.pubkey === main) || agents.find((a) => a.name === "\u6F58\u6D9B Studio") || (agents.length === 1 ? agents[0] : void 0);
    const check = () => {
      lifetime.current.signal.throwIfAborted();
      const current = ctx.relay.snapshot();
      if (current.status !== "ready" || current.cached || current.session !== session || current.scope !== connection.scope || current.generation !== connection.generation || sourceChannel(session)?.id !== channel.id) {
        throw Error("\u6536\u85CF\u9891\u9053\u6743\u9650\u6216\u8FDE\u63A5\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00");
      }
    };
    async function readHistory(before, signal) {
      if (historyFlight.current) return;
      historyFlight.current = true;
      setReadingHistory(true);
      setHistoryError("");
      try {
        const page = await session.readRemote([{
          kinds: [9],
          "#h": [channel.id],
          limit: ISSUE_PAGE_SIZE,
          ...before ? { until: before.created_at, before_id: before.id } : {}
        }], { signal, priority: "background" });
        signal.throwIfAborted();
        check();
        const ordered = [...page].sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
        const end = ordered.at(-1);
        setEvents((existing) => before ? [...new Map([...existing, ...ordered].map((e) => [e.id, e])).values()] : ordered);
        setCursor(page.length === ISSUE_PAGE_SIZE && end?.id !== before?.id ? end : null);
      } catch (error) {
        if (!signal.aborted) setHistoryError(error.message || "\u65E0\u6CD5\u8BFB\u53D6\u539F\u9891\u9053\u7684\u5386\u53F2\u7B80\u62A5");
      } finally {
        historyFlight.current = false;
        if (!signal.aborted) setReadingHistory(false);
      }
    }
    R.useEffect(() => {
      session.channels.ensure(channel.id);
      session.agentChoices?.ensure?.(true);
      if (session.readRemote) void readHistory(null, lifetime.current.signal);
    }, [session, channel.id, revision]);
    R.useEffect(() => {
      let current = true;
      session.mainAgent?.read().then((id) => {
        if (current) setMain(id || "");
      }, noop);
      try {
        setInbox(readInbox(localStorage, storeKey));
        setStorageReady(true);
      } catch (error) {
        setNotice(error.message);
      }
      const sync = (event) => {
        if (event.key !== storeKey) return;
        try {
          setInbox(readInbox(localStorage, storeKey));
          setStorageReady(true);
        } catch (error) {
          setNotice(error.message);
          setStorageReady(false);
        }
      };
      globalThis.addEventListener("storage", sync);
      return () => {
        current = false;
        globalThis.removeEventListener("storage", sync);
      };
    }, [session, storeKey]);
    const refs = R.useMemo(
      () => mergeReports(eventRefs(events, options), reportRefs(window.rows, options)),
      [events, options, window.rows]
    );
    const active = refs.find((row) => row.date === date) || refs[0];
    const currentAttachment = active && loaded?.id === active.id && loaded.url === active.url;
    const report = currentAttachment ? loaded.report : null;
    const reportError = currentAttachment ? loaded.error : "";
    R.useEffect(() => {
      if (!active) return;
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, lifetime.current.signal]);
      setPreview("");
      setAction("");
      loadReport(active, session, origin, signal).then((content) => {
        if (!signal.aborted) setLoaded({ id: active.id, url: active.url, report: content });
      }, (error) => {
        if (!signal.aborted) setLoaded({ id: active.id, url: active.url, error: error.message });
      });
      return () => controller.abort();
    }, [active?.id, active?.url, session, origin, revision]);
    const openConversation = (channelId, messageId) => {
      try {
        check();
      } catch (error) {
        setNotice(error.message);
        return;
      }
      void ctx.navigation.open({
        version: 1,
        kind: "conversation",
        scope: { viewer: session.viewer, communityOrigin: origin },
        channelId,
        ...messageId ? { messageId } : {}
      }).then((result) => {
        if (result.status === "failed" && !lifetime.current.signal.aborted) setNotice("\u65E0\u6CD5\u6253\u5F00\u539F\u4F1A\u8BDD\uFF0C\u8BF7\u68C0\u67E5 Buzz \u8FDE\u63A5\u3002");
      }, () => setNotice("\u65E0\u6CD5\u6253\u5F00\u539F\u4F1A\u8BDD\uFF0C\u8BF7\u68C0\u67E5 Buzz \u8FDE\u63A5\u3002"));
    };
    const persist = (next) => {
      check();
      localStorage.setItem(storeKey, JSON.stringify(next));
      setInbox(next);
    };
    const change = (update) => {
      try {
        if (!storageReady) throw Error("\u672C\u673A Inbox \u65E0\u6CD5\u4FDD\u5B58");
        const state = readInbox(localStorage, storeKey);
        if (state.pending) throw Error("\u539F\u6279\u6B21\u63D0\u4EA4\u786E\u8BA4\u540E\u5C31\u53EF\u4EE5\u4FEE\u6539 Inbox");
        persist(update(state));
      } catch (error) {
        setNotice(error.message);
      }
    };
    const canExecute = storageReady && Boolean(session.channelWrites?.available && session.channelWrites.addAgents && session.messages?.send && session.outbox?.recovery);
    const execute = async () => {
      if (flight.current || !canExecute) return;
      flight.current = true;
      setBusy(true);
      setNotice("");
      const run = async () => {
        check();
        let state = readInbox(localStorage, storeKey);
        const batch = state.pending || createBatch(state.items, picked, channel.id);
        state = { ...state, pending: batch };
        persist(state);
        const signal = AbortSignal.any([lifetime.current.signal, AbortSignal.timeout(35e3)]);
        const receipt = await dispatchBatch({
          session,
          batch,
          check,
          signal,
          save: (pending) => {
            state = { ...state, pending };
            persist(state);
          }
        });
        const submitted = new Set(batch.items);
        persist({
          ...state,
          pending: null,
          items: state.items.filter((item) => !submitted.has(item.key)),
          history: [receipt, ...state.history]
        });
        setNotice("Buzz \u5DF2\u786E\u8BA4\u6536\u5230\u6307\u4EE4\u3002\u6267\u884C\u8FDB\u5EA6\u53EF\u5728 Solo \u4E2D\u67E5\u770B\u3002");
      };
      try {
        if (globalThis.navigator?.locks) await navigator.locks.request(storeKey, { ifAvailable: true }, (lock) => {
          if (!lock) throw Error("\u53E6\u4E00\u7A97\u53E3\u6B63\u5728\u63D0\u4EA4\u8FD9\u6279\u6307\u4EE4");
          return run();
        });
        else await run();
      } catch (error) {
        if (!lifetime.current.signal.aborted) setNotice(error.name === "TimeoutError" ? "\u672C\u6B21\u786E\u8BA4\u8D85\u65F6\uFF0C\u70B9\u51FB\u300C\u6838\u5BF9\u539F\u53D1\u9001\u300D\u7EE7\u7EED\u539F\u6279\u6B21\u3002" : error.message || "\u8BF7\u6253\u5F00\u539F Solo \u6838\u5BF9\u53D1\u9001\u7ED3\u679C");
      } finally {
        flight.current = false;
        if (!lifetime.current.signal.aborted) setBusy(false);
      }
    };
    const currentPreview = preview || report?.candidates.find((c) => c.title.includes("\u4F18\u5148\u8BD5"))?.id || report?.candidates[0]?.id;
    const currentAction = action || report?.actions[0]?.id;
    return h(
      "div",
      { className: "pcl-workspace" },
      h("style", null, workspace_default),
      h(
        "header",
        { className: "pcl-header" },
        h(
          "div",
          { className: "pcl-topline" },
          h("h1", null, NAME),
          h(
            "div",
            { className: "pcl-issues" },
            active && h(
              "label",
              null,
              h("span", null, "\u671F\u6B21"),
              h("select", { value: active.date, onChange: (e) => setDate(e.target.value) }, refs.map((entry) => h("option", { value: entry.date, key: entry.date }, `${issueLabel(entry.date)}\u53D1\u7A3F`)))
            ),
            cursor && button(
              readingHistory ? "\u8BFB\u53D6\u4E2D\u2026" : "\u66F4\u65E9\u671F\u6B21",
              () => readHistory(cursor, lifetime.current.signal),
              { className: "pcl-quiet", disabled: readingHistory }
            ),
            button("\u5237\u65B0", () => refresh((n) => n + 1), { className: "pcl-quiet", disabled: readingHistory })
          )
        ),
        h(
          "nav",
          { className: "pcl-nav", "aria-label": "\u6536\u85CF\u6A21\u5757" },
          [["overview", "\u6C47\u62A5"], ["collections", "\u6536\u85CF"], ["actions", "\u884C\u52A8"]].map(([id, label]) => button(
            label,
            () => setTab(id),
            { key: id, "aria-current": tab === id ? "page" : void 0 }
          ))
        )
      ),
      historyError && text2("status", historyError),
      !report && h(
        "section",
        { className: "pcl-state" },
        text2(reportError ? "alert" : "status", reportError || (active || readingHistory || ["loading", "idle"].includes(window.status) ? "\u6B63\u5728\u8BFB\u53D6\u6536\u85CF\u6C47\u62A5\u2026" : "\u539F\u9891\u9053\u8FD8\u6CA1\u6709\u53EF\u4EE5\u9884\u89C8\u7684\u6536\u85CF\u6C47\u62A5\u9644\u4EF6\u3002")),
        reportError && button("\u6253\u5F00\u6765\u6E90\u6D88\u606F \u2197", () => openConversation(channel.id, active.id), { className: "pcl-quiet" })
      ),
      report && tab === "overview" && h(ReportView, {
        report,
        selected: currentPreview,
        select: setPreview,
        session,
        openSource: () => openConversation(channel.id, active.id)
      }),
      report && tab === "collections" && h(CollectionsView, {
        key: report.date,
        report,
        inbox,
        change,
        active,
        session,
        executor: picked?.pubkey || "",
        setExecutor,
        agents,
        busy,
        execute,
        canExecute,
        openSolo: openConversation,
        message: notice
      }),
      report && tab === "actions" && h(ActionsView, { report, selected: currentAction, select: setAction })
    );
  }
  function Page() {
    const connection = R.useSyncExternalStore(ctx.relay.subscribe, ctx.relay.snapshot);
    const session = connection.session;
    const roster = R.useSyncExternalStore(session.channels.subscribeList, session.channels.list);
    R.useEffect(() => {
      if (connection.status === "ready") session.channels.ensureList();
    }, [connection.status, session]);
    const channel = connection.status === "ready" && !connection.cached ? sourceChannel(session) : null;
    return channel ? h(Book, { key: `${connection.scope}:${connection.generation}:${channel.id}`, connection, channel }) : h(
      "section",
      { className: "pcl-workspace pcl-state" },
      h("style", null, workspace_default),
      h("h1", null, NAME),
      text2("status", connection.status === "connecting" || roster.status === "loading" ? "\u6B63\u5728\u8BFB\u53D6\u6536\u85CF\u9891\u9053\u2026" : "\u5207\u6362\u5230\u62E5\u6709\u300C\u6F58\u6D9B\u7684\u6536\u85CF\u300D\u79C1\u5BC6\u9891\u9053\u8BBF\u95EE\u6743\u9650\u7684 Buzz \u793E\u533A\u540E\u5373\u53EF\u67E5\u770B\u3002")
    );
  }
  ctx.pages.register({ id: "collections", title: NAME, component: Page, primary: true, placement: "sidebar", icon: icon_default });
}
export {
  apply,
  inject,
  pluginId
};

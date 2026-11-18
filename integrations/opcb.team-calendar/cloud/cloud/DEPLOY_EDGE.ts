// server/state.mjs
import { createHash } from "node:crypto";

// src/meetings.mjs
function meetingUrl(value) {
  if (typeof value !== "string" || value.length > 2e3) return false;
  try {
    const url2 = new URL(value);
    return url2.protocol === "https:" && !url2.username && !url2.password;
  } catch {
    return false;
  }
}

// server/state.mjs
var CalendarError = class extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
};
var fail = (message, status) => {
  throw new CalendarError(message, status);
};
var hash = (value) => createHash("sha256").update(value).digest("hex");
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
var text = (v, label, max = 200) => typeof v === "string" && v.trim() && v.length <= max ? v.trim() : fail(`${label}\u683C\u5F0F\u4E0D\u6B63\u786E`);
var id = (v) => /^[a-zA-Z0-9_.:-]{1,160}$/.test(v || "") ? v : fail("\u8BB0\u5F55 ID \u683C\u5F0F\u4E0D\u6B63\u786E");
var date = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "") && Number.isFinite(Date.parse(v + "T00:00:00Z")) && (/* @__PURE__ */ new Date(v + "T00:00:00Z")).toISOString().slice(0, 10) === v ? v : fail("\u65E5\u671F\u683C\u5F0F\u4E0D\u6B63\u786E");
var statuses = ["todo", "doing", "review", "done", "blocked"];
function applyMutation(current, principal, request) {
  if (!principal || !["owner", "editor"].includes(principal.role)) fail("\u6CA1\u6709\u7F16\u8F91\u6743\u9650", 403);
  if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) fail("\u9700\u8981\u8BFB\u53D6\u5F53\u524D\u7248\u672C\u540E\u518D\u4FDD\u5B58");
  if (current.revision !== request.expectedRevision) fail("\u5B89\u6392\u5DF2\u88AB\u66F4\u65B0\uFF0C\u5F53\u524D\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF1B\u8BF7\u8F7D\u5165\u6700\u65B0\u7248\u672C\u540E\u518D\u63D0\u4EA4", 409);
  const state = structuredClone(current);
  delete state.role;
  delete state.revision;
  delete state.currentUserPubkey;
  delete state.currentMemberId;
  const byTask = (taskId) => state.tasks.find((t) => t.id === taskId) || fail("\u4EFB\u52A1\u4E0D\u5B58\u5728", 404);
  const validateTask = (input, old = {}) => {
    const task = { ...old, ...input };
    task.id = id(task.id);
    task.title = text(task.title, "\u4EFB\u52A1\u6807\u9898");
    if (!state.projects.some((p) => p.id === task.projectId)) fail("\u6240\u5C5E\u9879\u76EE\u4E0D\u5B58\u5728");
    if (!state.members.some((m) => m.id === task.assigneeId)) fail("\u8D1F\u8D23\u4EBA\u4E0D\u5B58\u5728");
    if (!statuses.includes(task.status)) fail("\u4EFB\u52A1\u72B6\u6001\u4E0D\u6B63\u786E");
    if (task.dueDate) date(task.dueDate);
    if (task.parentId && task.parentId === task.id) fail("\u4EFB\u52A1\u4E0D\u80FD\u5173\u8054\u81EA\u8EAB\u4E3A\u7236\u4EFB\u52A1");
    task.description = String(task.description || "").slice(0, 4e3);
    task.deliverable = String(task.deliverable || "").slice(0, 2e3);
    if (task.sourceUrl && !/^https:\/\/|^buzz:\/\//.test(task.sourceUrl)) fail("\u6765\u6E90\u94FE\u63A5\u5FC5\u987B\u662F HTTPS \u6216 Buzz \u5730\u5740");
    task.kind = task.kind || "task";
    if (!["task", "meeting"].includes(task.kind)) fail("\u5B89\u6392\u7C7B\u578B\u4E0D\u6B63\u786E");
    if (task.kind === "meeting") {
      const m = task.meeting;
      if (!m || !["tencent", "other", "offline"].includes(m.provider)) fail("\u8BF7\u9009\u62E9\u4F1A\u8BAE\u65B9\u5F0F");
      if (m.url && !meetingUrl(m.url)) fail("\u4F1A\u8BAE\u94FE\u63A5\u5FC5\u987B\u662F\u6709\u6548\u7684 HTTPS \u5730\u5740");
      if (!Array.isArray(m.participantIds) || m.participantIds.length > 100 || m.participantIds.some((id2) => !state.members.some((member) => member.id === id2))) fail("\u53C2\u4F1A\u6210\u5458\u4E0D\u5B58\u5728");
      if (![0, 5, 10, 15].includes(m.joinBeforeMinutes) || ![0, 5, 10, 15, 30].includes(m.reminderMinutes)) fail("\u4F1A\u8BAE\u63D0\u9192\u65F6\u95F4\u4E0D\u6B63\u786E");
      if (m.provider === "offline" && !String(m.location || "").trim()) fail("\u8BF7\u586B\u5199\u7EBF\u4E0B\u4F1A\u8BAE\u5730\u70B9");
      task.meeting = { provider: m.provider, url: m.provider === "offline" ? "" : m.url || "", location: String(m.location || "").trim().slice(0, 300), participantIds: [...new Set(m.participantIds)], joinBeforeMinutes: m.joinBeforeMinutes, reminderMinutes: m.reminderMinutes };
    } else task.meeting = null;
    return task;
  };
  const validateAllocation = (input) => {
    const a = { id: id(input.id), taskId: id(input.taskId), date: date(input.date) };
    byTask(a.taskId);
    if (input.start || input.end) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.start || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.end || "") || input.start >= input.end) fail("\u8BF7\u8F93\u5165\u6709\u6548\u7684\u540C\u65E5\u5F00\u59CB\u548C\u7ED3\u675F\u65F6\u95F4");
      a.start = input.start;
      a.end = input.end;
    }
    return a;
  };
  if (request.action === "upsert") {
    if (!Array.isArray(request.tasks) || !request.tasks.length || request.tasks.length > 100) fail("\u4E00\u6B21\u53EF\u5199\u5165 1\u2013100 \u4E2A\u4EFB\u52A1");
    const imported = [], seenSources = /* @__PURE__ */ new Set();
    const sourceKey = text(request.sourceKey || "manual", "\u6765\u6E90\u6807\u8BC6", 80);
    const taskIds = /* @__PURE__ */ new Map();
    for (const input of request.tasks) {
      const sourceId = text(input.sourceId || input.id, "\u6765\u6E90\u4EFB\u52A1\u6807\u8BC6", 160);
      if (seenSources.has(sourceId)) fail("\u540C\u4E00\u6279\u6B21\u7684\u6765\u6E90\u4EFB\u52A1\u6807\u8BC6\u4E0D\u80FD\u91CD\u590D");
      seenSources.add(sourceId);
      const found = state.tasks.find((t) => t.sourceKey === sourceKey && t.sourceId === sourceId);
      const taskId = found?.id || "task-" + hash(sourceKey + ":" + sourceId).slice(0, 24);
      const task = validateTask({ ...input, id: taskId, sourceKey, sourceId, status: input.status || found?.status || "todo" }, found);
      delete task.dates;
      if (found) state.tasks[state.tasks.indexOf(found)] = task;
      else state.tasks.push(task);
      taskIds.set(sourceId, taskId);
      imported.push(taskId);
      if (input.dates !== void 0) {
        if (!Array.isArray(input.dates) || input.dates.length > 90) fail("\u4EFB\u52A1\u65E5\u671F\u5217\u8868\u4E0D\u6B63\u786E");
        state.allocations = state.allocations.filter((a) => a.taskId !== taskId);
        for (const item of input.dates) {
          const d = typeof item === "string" ? { date: item } : item;
          const aid = "slot-" + hash(taskId + ":" + d.date + ":" + (d.start || "day")).slice(0, 24);
          const a = validateAllocation({ ...d, id: aid, taskId });
          if (!state.allocations.some((s) => s.id === aid)) state.allocations.push(a);
        }
      }
    }
    if (request.plan) {
      const planId = "plan-" + hash(sourceKey + ":" + text(request.plan.sourceId, "\u5468\u8BA1\u5212\u6807\u8BC6")).slice(0, 24);
      const plan = { id: planId, title: text(request.plan.title, "\u5468\u8BA1\u5212\u6807\u9898"), weekStart: date(request.plan.weekStart), taskIds: imported };
      state.plans = state.plans.filter((p) => p.id !== planId).concat(plan);
    }
  } else if (request.action === "update") {
    const old = byTask(id(request.taskId));
    const changes = request.changes || {};
    const allowed = Object.fromEntries(Object.entries(changes).filter(([k]) => ["title", "projectId", "assigneeId", "dueDate", "status", "description", "deliverable", "sourceUrl", "kind", "meeting"].includes(k)));
    state.tasks[state.tasks.indexOf(old)] = validateTask(allowed, old);
    if (request.allocations !== void 0) {
      if (!Array.isArray(request.allocations) || request.allocations.length > 90) fail("\u65E5\u671F\u5217\u8868\u4E0D\u6B63\u786E");
      const next = request.allocations.map((a) => validateAllocation({ ...a, taskId: old.id }));
      if (new Set(next.map((a) => a.id)).size !== next.length || next.some((a) => state.allocations.some((x) => x.id === a.id && x.taskId !== old.id))) fail("\u65E5\u7A0B ID \u91CD\u590D");
      state.allocations = state.allocations.filter((a) => a.taskId !== old.id).concat(next);
    }
  } else if (request.action === "configure") {
    if (principal.role !== "owner") fail("\u53EA\u6709\u5DE5\u4F5C\u533A\u7BA1\u7406\u5458\u53EF\u4FEE\u6539\u9879\u76EE\u4E0E\u6210\u5458", 403);
    if (!Array.isArray(request.members) || !request.members.length || request.members.length > 100 || !Array.isArray(request.projects) || !request.projects.length || request.projects.length > 100) fail("\u81F3\u5C11\u4FDD\u7559\u4E00\u4E2A\u9879\u76EE\u548C\u6210\u5458\uFF0C\u6700\u591A\u5404 100 \u4E2A");
    const nextMembers = request.members.map((m) => {
      const pubkey = String(m.buzzPubkey || "").trim().toLowerCase();
      if (pubkey && !/^[0-9a-f]{64}$/.test(pubkey)) fail("\u6210\u5458\u7684 Buzz \u7528\u6237\u516C\u94A5\u683C\u5F0F\u4E0D\u6B63\u786E");
      return { id: id(m.id), name: text(m.name, "\u6210\u5458\u59D3\u540D", 40), initial: text(m.name, "\u6210\u5458\u59D3\u540D", 40).slice(0, 1), role: String(m.role || "\u56E2\u961F\u6210\u5458").slice(0, 60), ...pubkey ? { buzzPubkey: pubkey } : {} };
    });
    const bound = nextMembers.filter((m) => m.buzzPubkey).map((m) => m.buzzPubkey);
    if (new Set(bound).size !== bound.length) fail("\u4E00\u4E2A Buzz \u7528\u6237\u53EA\u80FD\u5173\u8054\u4E00\u4F4D\u6210\u5458");
    const nextProjects = request.projects.map((p) => ({ id: id(p.id), name: text(p.name, "\u9879\u76EE\u540D\u79F0", 60), color: ["blue", "purple", "amber"].includes(p.color) ? p.color : "blue" }));
    if (new Set(nextMembers.map((m) => m.id)).size !== nextMembers.length || new Set(nextProjects.map((p) => p.id)).size !== nextProjects.length) fail("\u9879\u76EE\u6216\u6210\u5458 ID \u91CD\u590D");
    if (state.tasks.some((t) => !nextMembers.some((m) => m.id === t.assigneeId) || !nextProjects.some((p) => p.id === t.projectId) || t.meeting?.participantIds.some((id2) => !nextMembers.some((m) => m.id === id2)))) fail("\u6709\u4EFB\u52A1\u6216\u4F1A\u8BAE\u5173\u8054\u7684\u9879\u76EE\u6216\u6210\u5458\u4E0D\u80FD\u79FB\u9664");
    state.members = nextMembers;
    state.projects = nextProjects;
  } else fail("\u4E0D\u652F\u6301\u7684\u64CD\u4F5C");
  for (const task of state.tasks.filter((t) => t.kind === "meeting")) {
    const slots = state.allocations.filter((a) => a.taskId === task.id);
    if (!slots.length || slots.some((a) => !a.start || !a.end)) fail("\u4F1A\u8BAE\u9700\u8981\u660E\u786E\u7684\u65E5\u671F\u3001\u5F00\u59CB\u548C\u7ED3\u675F\u65F6\u95F4");
  }
  if (state.tasks.length > 5e3 || state.allocations.length > 2e4 || new TextEncoder().encode(JSON.stringify(state)).length > 512e3) fail("\u5DF2\u8D85\u51FA\u9996\u7248\u65E5\u5386\u5BB9\u91CF");
  return { state, revision: current.revision + 1 };
}

// cloud/handler.mjs
function createHandler({ url: url2, serviceKey: serviceKey2, fetchImpl = fetch }) {
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  async function rpc(args, name = "opcb_calendar_gateway") {
    const response = await fetchImpl(url2 + "/rest/v1/rpc/" + name, { method: "POST", headers: { apikey: serviceKey2, authorization: "Bearer " + serviceKey2, "content-type": "application/json" }, body: JSON.stringify(args), signal: AbortSignal.timeout(1e4), redirect: "error" });
    if (!response.ok) throw new CalendarError("\u65E5\u5386\u6570\u636E\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528\uFF1B\u4FDD\u5B58\u540E\u8BF7\u5148\u67E5\u8BE2\u64CD\u4F5C\u56DE\u6267", 503);
    const data = await response.json();
    if (data.error) throw new CalendarError(data.error, data.status || 500);
    return data;
  }
  return async (request) => {
    try {
      const u = new URL(request.url), path = u.pathname.replace(/^(?:\/functions\/v1)?\/opcb-team-calendar(?=\/|$)/, "");
      if (request.method === "GET" && path === "/health") return json(200, { ok: true, backend: "supabase", version: "1.0.7-prep" });
      const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
      if (!token) throw new CalendarError("\u672A\u6388\u6743\u8BBF\u95EE\u6B64\u65E5\u5386", 401);
      const viewer = request.headers.get("x-calendar-viewer");
      if (viewer && !/^[a-f0-9]{64}$/.test(viewer)) throw new CalendarError("\u7528\u6237\u8EAB\u4EFD\u683C\u5F0F\u4E0D\u6B63\u786E", 403);
      if (request.headers.has("origin") && request.headers.get("origin") !== u.origin) throw new CalendarError("\u4E0D\u5141\u8BB8\u8DE8\u7AD9\u8BF7\u6C42", 403);
      const identity = { p_token_hash: hash(token), p_viewer: viewer };
      if (request.method === "POST" && path === "/api/bind") {
        const length = Number(request.headers.get("content-length") || 0);
        if (length > 2048) throw new CalendarError("\u7ED1\u5B9A\u8BF7\u6C42\u8FC7\u5927", 413);
        const reader = request.body?.getReader();
        if (!reader) throw new CalendarError("\u7ED1\u5B9A\u8BF7\u6C42\u4E3A\u7A7A");
        let raw = "", bytes = 0;
        for (; ; ) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 2048) {
            await reader.cancel();
            throw new CalendarError("\u7ED1\u5B9A\u8BF7\u6C42\u8FC7\u5927", 413);
          }
          raw += new TextDecoder().decode(value);
        }
        let payload;
        try {
          payload = JSON.parse(raw);
        } catch {
          throw new CalendarError("JSON \u683C\u5F0F\u4E0D\u6B63\u786E");
        }
        if (!/^[a-f0-9]{64}$/.test(payload?.pubkey || "") || !/^[a-f0-9]{64}$/.test(payload?.deviceHash || "")) throw new CalendarError("\u7ED1\u5B9A\u4FE1\u606F\u4E0D\u6B63\u786E");
        return json(200, await rpc({ p_invite_hash: hash(token), p_pubkey: payload.pubkey, p_token_hash: payload.deviceHash }, "opcb_calendar_redeem_invite"));
      }
      if (request.method === "GET" && path === "/api/state") {
        const data = await rpc({ ...identity, p_action: "read" });
        delete data.actor;
        return json(200, data);
      }
      if (request.method === "GET" && path === "/api/revision") return json(200, await rpc({ ...identity, p_action: "revision" }));
      if (request.method === "GET" && path.startsWith("/api/operations/")) return json(200, (await rpc({ ...identity, p_action: "operation", p_request_id: decodeURIComponent(path.slice("/api/operations/".length)) })).receipt);
      if (request.method === "POST" && path === "/api/mutate") {
        const reader = request.body?.getReader();
        if (!reader) throw new CalendarError("\u8BF7\u6C42\u5185\u5BB9\u4E3A\u7A7A");
        const chunks = [];
        let size = 0;
        for (; ; ) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 256e3) {
            await reader.cancel();
            throw new CalendarError("\u8BF7\u6C42\u5185\u5BB9\u8FC7\u5927", 413);
          }
          chunks.push(value);
        }
        const raw = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          raw.set(chunk, offset);
          offset += chunk.length;
        }
        let payload;
        try {
          payload = JSON.parse(new TextDecoder().decode(raw));
        } catch {
          throw new CalendarError("JSON \u683C\u5F0F\u4E0D\u6B63\u786E");
        }
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new CalendarError("\u8BF7\u6C42\u683C\u5F0F\u4E0D\u6B63\u786E");
        id(payload.requestId);
        if (!Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0) throw new CalendarError("\u9700\u8981\u8BFB\u53D6\u5F53\u524D\u7248\u672C\u540E\u518D\u4FDD\u5B58");
        const args = { ...identity, p_request_id: payload.requestId, p_fingerprint: hash(canonical(payload)), p_expected_revision: payload.expectedRevision };
        const prepared = await rpc({ ...args, p_action: "prepare" });
        if (prepared.receipt) return json(200, prepared.receipt);
        const { state } = applyMutation(prepared.state, prepared.principal, payload);
        return json(200, (await rpc({ ...args, p_action: "commit", p_state: state })).receipt);
      }
      throw new CalendarError("\u63A5\u53E3\u4E0D\u5B58\u5728", 404);
    } catch (error) {
      return json(error instanceof CalendarError ? error.status : 500, { error: error instanceof CalendarError ? error.message : "\u65E5\u5386\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528\uFF1B\u82E5\u6B63\u5728\u4FDD\u5B58\u8BF7\u5148\u67E5\u8BE2\u64CD\u4F5C\u56DE\u6267" });
    }
  };
}

// cloud/index.ts
var url = Deno.env.get("SUPABASE_URL");
var serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serviceKey) throw new Error("Supabase service environment is required");
Deno.serve(createHandler({ url, serviceKey }));

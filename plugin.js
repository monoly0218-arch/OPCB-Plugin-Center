// src/tasks/source.mjs
var TASK_SOURCE = "7dc199bc-755b-47bb-8f71-fe311b1f1ab1";
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T12:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

// src/tasks/lifecycle.mjs
var FLOW_BEGIN = "<!-- opcb-task-lifecycle-v1:begin -->";
var FLOW_END = "<!-- opcb-task-lifecycle-v1:end -->";
var actions = /* @__PURE__ */ new Set(["create", "start", "revise", "deliver", "blocked", "reschedule", "accept", "complete", "reopen", "remove", "restore"]);
var isKey = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
var text = (value, max = 2e3) => typeof value === "string" && value.length <= max && !value.includes("<!-- opcb-task");
function flowRecords(content) {
  const a = content.split(FLOW_BEGIN), b = content.split(FLOW_END);
  if (a.length === 1 && b.length === 1) return [];
  if (a.length !== 2 || b.length !== 2 || content.indexOf(FLOW_END) < content.indexOf(FLOW_BEGIN)) throw Error("任务事件区不完整");
  const match = a[1].split(FLOW_END)[0].trim().match(/^## 任务事件\s*\n```json\n([\s\S]+)\n```$/);
  if (!match) throw Error("任务事件区格式无效");
  let rows;
  try {
    rows = JSON.parse(match[1]);
  } catch {
    throw Error("任务事件无法解析");
  }
  if (!Array.isArray(rows) || rows.length > 1e3) throw Error("任务事件数量无效");
  const ids = /* @__PURE__ */ new Set();
  for (const r of rows) {
    if (!r || Object.keys(r).sort().join() !== "action,actor,at,event_id,payload,revision,task_id" || !text(r.event_id, 600) || !r.event_id || ids.has(r.event_id) || !text(r.task_id, 240) || !r.task_id || !isKey(r.actor) || !actions.has(r.action) || !Number.isInteger(r.revision) || r.revision < 0 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.at) || !Number.isFinite(Date.parse(r.at)) || !r.payload || typeof r.payload !== "object" || Array.isArray(r.payload) || !text(JSON.stringify(r.payload), 12e3)) throw Error("任务事件格式无效或事件重复");
    ids.add(r.event_id);
  }
  return rows;
}
function validDelivery(value) {
  if (!text(value) || !value) throw Error("缺少可回读的交付链接");
  let u;
  try {
    u = new URL(value);
  } catch {
    throw Error("交付链接无效");
  }
  if (!["https:", "buzz:"].includes(u.protocol) || u.username || u.password || [...u.searchParams.keys()].some((k) => /^(token|signature|password|expires|accesskeyid|ossaccesskeyid|x-amz-.+|x-oss-.+)$/i.test(k))) throw Error("交付链接含临时凭据或不支持的格式");
  return value;
}
function reduceFlow(tasks, event) {
  const { task_id: id, action, revision, actor, payload: p } = event;
  let task = tasks.find((t) => t.id === id);
  if (action === "create") {
    if (task) throw Error("任务已存在，请更新原任务");
    if (revision !== 0 || !text(p.title, 240) || !p.title.trim() || !text(p.description) || !text(p.assignee, 240) || !text(p.team, 240) || !text(p.project, 240) || !text(p.goal) || !isKey(p.reviewer) || !["agent", "human"].includes(p.executionKind) || p.executor && !isKey(p.executor) || p.date !== null && !validDate(p.date)) throw Error("新任务字段无效");
    task = { id, title: p.title, description: p.description, assignee: p.assignee, team: p.team, project: p.project, completionDefinition: p.goal, acceptance: "", boundary: "", kind: "task", date: p.date, status: "todo", progress: null, steps: [], revision: 0, executionKind: p.executionKind, executor: p.executor || "", reviewer: p.reviewer, completed: false, origin: p.source, executionChannel: p.channel };
  } else {
    if (!task) throw Error("任务不在当前来源中");
    if ((task.revision || 0) !== revision) throw Error("任务轮次已变化，请读取最新任务");
    task = { ...task };
    if (task.removed && !["restore"].includes(action)) throw Error("任务已移除，旧结果只可留在对话中");
    if (task.status === "done" && !["revise", "reopen", "remove", "restore", "reschedule"].includes(action)) throw Error("任务已经完成，需明确修改或重新打开");
  }
  if (action === "start") {
    if (task.executor && task.executor !== actor) throw Error("仅指定执行Agent可报告开工");
    if (!["todo", "planning", "blocked"].includes(task.status) && !(task.status === "doing" && task.blockReason)) throw Error("当前状态不能再次开工");
    if (!text(p.summary) || !p.summary.trim()) throw Error("请说明已经开始的实际工作");
    Object.assign(task, { status: "doing", completed: false, executionKind: "agent", executor: actor, blockReason: "", work: p.summary });
  } else if (action === "revise") {
    if (!text(p.summary) || !p.summary.trim()) throw Error("修改需有具体要求");
    Object.assign(task, { revision: revision + 1, status: "todo", completed: false, blockReason: "", work: p.summary, delivery: null, lastRevisionAt: event.at });
  } else if (action === "deliver") {
    if (task.executor && task.executor !== actor) throw Error("仅指定执行Agent可交付");
    if (!text(p.version, 120) || p.version.trim().length < 2 || !text(p.summary) || !p.summary || !text(p.evidence)) throw Error("交付需包含版本、结果和来源");
    validDelivery(p.url);
    validDelivery(p.evidence);
    Object.assign(task, { status: "review", completed: false, executionKind: "agent", executor: actor, blockReason: "", delivery: { url: p.url, version: p.version, summary: p.summary, evidence: p.evidence, revision, actor, at: event.at, messageAt: p.messageAt } });
  } else if (action === "blocked") {
    if (task.executor && task.executor !== actor) throw Error("仅执行Agent可报告受阻");
    if (!text(p.summary) || !p.summary.trim()) throw Error("需说明卡点");
    task.blockReason = p.summary;
  } else if (action === "reschedule") {
    if (p.date !== null && !validDate(p.date)) throw Error("日期无效");
    if (p.times !== void 0 && (!Array.isArray(p.times) || p.times.length > 12 || p.times.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))) throw Error("计划钟点无效");
    task.date = p.date;
    if (p.times !== void 0) task.times = [...new Set(p.times)];
  } else if (action === "accept") {
    if (task.reviewer && task.reviewer !== actor) throw Error("仅指定验收人可确认");
    if (task.status !== "review" || !task.delivery) throw Error("尚无当前版本交付，请先让Agent找交付");
    if (p.version !== task.delivery.version || p.delivery !== task.delivery.url) throw Error("交付版本已变化，请查看当前结果");
    Object.assign(task, { status: "done", completed: true, accepted: { actor, at: event.at, version: p.version, delivery: p.delivery, source: p.source } });
  } else if (action === "complete") {
    if (task.executor || task.executionKind === "agent") throw Error("Agent任务需先提交当前版本，再由本人验收");
    Object.assign(task, { status: "done", completed: true, accepted: { actor, at: event.at, source: p.source } });
  } else if (action === "reopen") {
    Object.assign(task, { status: "todo", completed: false, revision: revision + 1, delivery: null, blockReason: "" });
  } else if (action === "remove") {
    Object.assign(task, { removed: true, removedFrom: task.status, revision: revision + 1, completed: false, stopRequested: task.status === "doing" });
  } else if (action === "restore") {
    if (!task.removed) throw Error("任务尚未移除");
    Object.assign(task, { removed: false, status: task.removedFrom === "done" ? "done" : "todo", completed: task.removedFrom === "done", revision: revision + 1, stopRequested: false, ...task.removedFrom !== "done" ? { delivery: null } : {} });
  }
  task.lastEvent = event;
  if (p.channel && !task.executionChannel) task.executionChannel = p.channel;
  return [...tasks.filter((t) => t.id !== id), task];
}
function projectFlow(tasks, content) {
  let result = tasks.map((t) => ({ ...t, revision: 0, ...t.completed && t.status !== "done" ? { status: "review", completed: false } : {}, ...t.status === "review" && t.execution?.delivery ? { delivery: { url: t.execution.delivery, evidence: t.execution.delivery, version: "已登记交付", summary: t.execution.acceptance || "待本人验收", revision: 0 } } : {} }));
  for (const event of flowRecords(content)) result = reduceFlow(result, event);
  return result;
}

// src/tasks/task-binding.mjs
var BEGIN = "<!-- opcb-task-bindings-v1:begin -->";
var END = "<!-- opcb-task-bindings-v1:end -->";
function bindingRecords(content) {
  const a = content.split(BEGIN), b = content.split(END);
  if (a.length === 1 && b.length === 1) return [];
  if (a.length !== 2 || b.length !== 2 || content.indexOf(BEGIN) > content.indexOf(END)) throw Error("任务会话绑定区不完整");
  const match = a[1].split(END)[0].trim().match(/^## 最近绑定的执行会话\s*\n```json\n([\s\S]+)\n```$/);
  let rows;
  try {
    rows = JSON.parse(match?.[1]);
  } catch {
    throw Error("任务会话绑定区无法解析");
  }
  if (!Array.isArray(rows) || rows.length > 1e3) throw Error("任务会话绑定数量无效");
  const seen = /* @__PURE__ */ new Set();
  for (const row of rows) {
    if (!row || Object.keys(row).sort().join() !== "actor,at,channel_id,task_id" || typeof row.task_id !== "string" || !row.task_id || row.task_id.length > 240 || row.task_id.includes("<!--") || seen.has(row.task_id) || !isKey(row.actor) || typeof row.channel_id !== "string" || row.channel_id.length > 240 || !/^[\w-]*$/.test(row.channel_id) || typeof row.at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.at) || !Number.isFinite(Date.parse(row.at))) throw Error("任务会话绑定记录无效");
    seen.add(row.task_id);
  }
  return rows;
}
function projectTaskBindings(tasks, content) {
  const routes = new Map(bindingRecords(content).map((row) => [row.task_id, row]));
  return tasks.map((task) => routes.has(task.id) ? { ...task, executionBinding: routes.get(task.id), executionChannel: routes.get(task.id).channel_id } : task);
}

// src/tasks/task-solo.mjs
var BEGIN2 = "<!-- opcb-task-solos-v1:begin -->";
var END2 = "<!-- opcb-task-solos-v1:end -->";
var uuid = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
function soloRecords(content) {
  const a = content.split(BEGIN2), b = content.split(END2);
  if (a.length === 1 && b.length === 1) return [];
  if (a.length !== 2 || b.length !== 2 || content.indexOf(BEGIN2) > content.indexOf(END2)) throw Error("任务Solo绑定区不完整");
  const match = a[1].split(END2)[0].trim().match(/^## 任务执行会话\s*\n```json\n([\s\S]+)\n```$/);
  let rows;
  try {
    rows = JSON.parse(match?.[1]);
  } catch {
    throw Error("任务Solo绑定区无法解析");
  }
  if (!Array.isArray(rows) || rows.length > 1e3) throw Error("任务Solo绑定数量无效");
  const seen = /* @__PURE__ */ new Set(), latest = /* @__PURE__ */ new Map(), owners = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (!row || Object.keys(row).sort().join() !== "actor,at,event_id,from,operation,phase,revision,solo_id,task_id" || typeof row.task_id !== "string" || !row.task_id || row.task_id.length > 240 || row.task_id.includes("<!--") || !uuid(row.solo_id) || !isKey(row.actor) || !uuid(row.event_id) || seen.has(row.event_id) || !["reserved", "submitted", "ready"].includes(row.phase) || !Number.isInteger(row.revision) || row.revision < 0 || typeof row.from !== "string" || row.from.length > 240 || typeof row.at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.at) || !Number.isFinite(Date.parse(row.at)) || row.operation !== "" && !isKey(row.operation)) throw Error("任务Solo绑定记录无效");
    if (owners.has(row.solo_id) && owners.get(row.solo_id) !== row.task_id) throw Error("一个任务Solo不能绑定不同任务");
    owners.set(row.solo_id, row.task_id);
    const prior = latest.get(row.task_id);
    if (prior && (prior.solo_id !== row.solo_id || prior.actor !== row.actor || prior.from !== row.from || prior.phase === "ready" || row.phase === "reserved")) throw Error("任务Solo绑定冲突");
    if (!prior && row.phase !== "reserved" || row.phase === "submitted" && !row.operation) throw Error("任务Solo绑定顺序无效");
    seen.add(row.event_id);
    latest.set(row.task_id, row);
  }
  return rows;
}
function projectTaskSolos(tasks, content) {
  const routes = /* @__PURE__ */ new Map();
  for (const row of soloRecords(content)) routes.set(row.task_id, row);
  return tasks.map((task) => {
    const route = routes.get(task.id);
    return route ? { ...task, executionSolo: route, ...route.phase === "ready" ? { executionChannel: route.solo_id } : {} } : task;
  });
}

// src/tasks/execution.mjs
var BEGIN3 = "<!-- opcb-task-execution-v1:begin -->";
var END3 = "<!-- opcb-task-execution-v1:end -->";
var statuses = /* @__PURE__ */ new Set(["planning", "todo", "doing", "blocked", "review", "done"]);
var keys = ["id", "status", "date", "delivery", "acceptance", "actor", "at"];
function validateRecord(record) {
  if (!record || typeof record !== "object" || Object.keys(record).sort().join() !== [...keys].sort().join() || typeof record.id !== "string" || record.id.length > 240 || !statuses.has(record.status) || record.date !== null && !validDate(record.date) || typeof record.delivery !== "string" || record.delivery.length > 2e3 || typeof record.acceptance !== "string" || record.acceptance.length > 2e3 || !record.acceptance.trim() && record.status === "done" || !/^[a-f0-9]{64}$/.test(record.actor) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.at) || !Number.isFinite(Date.parse(record.at))) throw Error("执行记录格式无效");
  if ([record.delivery, record.acceptance].some((text2) => text2.includes(BEGIN3) || text2.includes(END3))) throw Error("执行说明包含保留标记");
  if (record.delivery) {
    let url;
    try {
      url = new URL(record.delivery);
    } catch {
      throw Error("交付需填写完整链接");
    }
    if (!["https:", "buzz:"].includes(url.protocol) || url.username || url.password || [...url.searchParams.keys()].some((key3) => /^(?:token|signature|password|expires|accesskeyid|ossaccesskeyid|x-amz-.+|x-oss-.+)$/i.test(key3))) throw Error("交付链接不支持此格式或临时凭据");
  }
  if (["review", "done"].includes(record.status) && !record.delivery) throw Error("交付或验收前请填写交付链接");
  return record;
}
function executionRecords(content) {
  const begins = content.split(BEGIN3), ends = content.split(END3);
  if (begins.length === 1 && ends.length === 1) return [];
  if (begins.length !== 2 || ends.length !== 2 || content.indexOf(END3) < content.indexOf(BEGIN3)) throw Error("执行记录区重复或不完整，请先核对来源");
  const body = begins[1].split(END3)[0].trim();
  const match = body.match(/^## 任务执行记录\s*\n```json\n([\s\S]+)\n```$/);
  if (!match) throw Error("执行记录区格式无效");
  let records;
  try {
    records = JSON.parse(match[1]);
  } catch {
    throw Error("执行记录无法解析");
  }
  if (!Array.isArray(records) || records.length > 1e3) throw Error("执行记录数量无效");
  records.forEach(validateRecord);
  return records;
}
function projectExecution(tasks, records) {
  const latest = new Map(records.map((record) => [record.id, record]));
  return tasks.map((task) => {
    const record = latest.get(task.id);
    return record ? { ...task, status: record.status, date: record.date, execution: record } : task;
  });
}

// src/tasks/task-details.mjs
var CHECK_BEGIN = "<!-- opcb-task-checks-v1:begin -->";
var CHECK_END = "<!-- opcb-task-checks-v1:end -->";
var cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((s) => s.replace(/\*\*/g, "").trim());
function plannedTimes(text2) {
  const segments = String(text2 || "").split("；"), kept = [];
  for (const [index, segment] of segments.entries()) {
    if (index && /^\s*\d{1,2}(?:日|[—–-]\d{1,2}日)/.test(segment)) break;
    kept.push(segment);
  }
  return [...new Set([...kept.join("；").matchAll(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g)].map((m) => m[1].padStart(2, "0") + ":" + m[2]))];
}
function checkRecords(content) {
  const a = content.split(CHECK_BEGIN), b = content.split(CHECK_END);
  if (a.length === 1 && b.length === 1) return [];
  if (a.length !== 2 || b.length !== 2 || content.indexOf(CHECK_BEGIN) > content.indexOf(CHECK_END)) throw Error("任务勾选记录区不完整");
  const body = a[1].split(CHECK_END)[0].trim().match(/^## 任务勾选记录\s*\n```json\n([\s\S]+)\n```$/);
  if (!body) throw Error("任务勾选记录格式无效");
  let rows;
  try {
    rows = JSON.parse(body[1]);
  } catch {
    throw Error("任务勾选记录无法解析");
  }
  if (!Array.isArray(rows) || rows.length > 1e3) throw Error("任务勾选记录数量无效");
  for (const r of rows) if (!r || Object.keys(r).sort().join() !== "actor,at,completed,id" || typeof r.id !== "string" || r.id.length > 240 || typeof r.completed !== "boolean" || !/^[a-f0-9]{64}$/.test(r.actor) || typeof r.at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.at) || !Number.isFinite(Date.parse(r.at))) throw Error("任务勾选记录无效");
  return rows;
}
function projectTaskDetails(tasks, content) {
  const section = content.split("## 全部任务时间表（目标节点）")[1]?.split(/\n## /)[0];
  const lines = (section || "").split("\n").filter((line) => /^\s*\|/.test(line)).map(cells), head = lines.shift() || [];
  const key3 = head.indexOf("编号/人员"), date = head.indexOf("日期"), time = head.indexOf("时间/持续安排"), team = head.indexOf("团队");
  const schedule = /* @__PURE__ */ new Map();
  if (key3 >= 0 && date >= 0 && time >= 0) for (const row of lines.filter((row2) => !row2.every((cell) => /^[-: ]*$/.test(cell)))) {
    if (!validDate(row[date])) throw Error("目标排期日期无效");
    if (schedule.has(row[key3])) throw Error("目标排期有重复编号或人员");
    schedule.set(row[key3], { date: row[date], times: plannedTimes(row[time]), scheduleNote: row[time], team: team >= 0 ? row[team] : "" });
  }
  const checks = new Map(checkRecords(content).map((r) => [r.id, r]));
  return tasks.map((task) => {
    const row = schedule.get(task.code || task.assignee), check = checks.get(task.id);
    return { ...task, ...row ? { team: row.team || task.team, times: row.date === task.date ? row.times : [], scheduleNote: row.scheduleNote, scheduleDate: row.date } : {}, ...check ? { completed: check.completed, check } : {}, ...task.status === "done" ? { completed: true } : {} };
  });
}

// src/tasks/live-model.mjs
var plain = (text2) => text2.replace(/\*\*/g, "").trim();
function taskParticipants(task, people) {
  const parts = task.assignee.split(/\s*(?:＋|\+|、|；|;|→|，|,|／|\/)\s*/);
  return people.filter((person) => {
    const aliases = [person, ...person.split(/[／/（）()]/).map((s) => s.trim()).filter(Boolean)];
    return aliases.some((alias) => parts.some((part) => part === alias || part.startsWith(alias) && /^(?:接入|决策|核账|负责|执行|协作|验收|审核|保障|批准投放|定价|数据|账单)$/.test(part.slice(alias.length).trim())));
  });
}
function parseTaskCanvas(event) {
  if (!event || !/^[a-f0-9]{64}$/.test(event.id) || typeof event.content !== "string" || !Number.isFinite(event.created_at)) throw new Error("指定频道没有有效的工作基线");
  if (event.content.length > 256e3) throw new Error("工作基线过大，请先核对来源");
  const title = event.content.match(/^#\s+(.+)$/m)?.[1] || "工作分配";
  const section = event.content.split("## 人员分工")[1]?.split(/\n## /)[0];
  if (!section) throw new Error("当前 Canvas 缺少人员分工，未恢复历史任务");
  const rows = section.split("\n").filter((line) => /^\s*\|/.test(line)).map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map(plain));
  const head = rows.shift() || [];
  const column = (...names) => names.map((name) => head.indexOf(name)).find((index) => index >= 0) ?? -1;
  const owner = column("负责人", "人员"), work = column("主要工作", "主要负责"), delivery = column("可检查的交付", "交付"), boundary = column("边界");
  if (owner < 0 || work < 0) throw new Error("人员分工表结构不受支持，请核对来源");
  const day = column("计划日期", "截止日期", "日期"), status = column("状态"), project = column("项目");
  const statuses2 = /* @__PURE__ */ new Map([["待开始", "todo"], ["待办", "todo"], ["进行中", "doing"], ["受阻", "blocked"], ["已阻塞", "blocked"], ["待验收", "review"], ["验收中", "review"], ["已验收", "done"]]);
  const seen = /* @__PURE__ */ new Set();
  const tasks = rows.filter((row) => !row.every((cell) => /^[-: ]*$/.test(cell))).map((row) => {
    const assignee = row[owner]?.trim(), assignment = row[work]?.trim();
    if (!assignee || !assignment) throw new Error("人员分工缺少姓名或工作内容");
    const id = `baseline-${encodeURIComponent(assignee)}`;
    if (seen.has(id)) throw new Error("人员分工有重复姓名，请补充唯一标识");
    seen.add(id);
    if (day >= 0 && row[day] && !validDate(row[day])) throw new Error("分工表日期无效；未猜测日期");
    return { id, title: assignment.split(/[。；]/)[0], assignee, team: row[project] || title.split("｜")[0].trim(), project: row[project] || "人员分工", description: assignment, completionDefinition: delivery >= 0 ? row[delivery] || "未登记" : "未登记", boundary: boundary >= 0 ? row[boundary] || "" : "", date: day >= 0 ? row[day] || null : null, status: status >= 0 ? statuses2.get(row[status]) || "planning" : "planning", progress: null, steps: assignment.split(/[。；]/).filter(Boolean).map((name) => ({ name, status: "planning" })), kind: "assignment" };
  });
  const planSection = event.content.split("## 每日执行与验收")[1]?.split(/\n## /)[0] || "";
  const lines = planSection.split("\n");
  let phase = "执行计划";
  const plans = /* @__PURE__ */ new Map();
  for (let i = 0; i < lines.length; i++) {
    if (/^###\s/.test(lines[i])) phase = plain(lines[i].replace(/^###\s+/, ""));
    const match = lines[i].match(/^-\s+\*\*([A-Z]\d{2})\s+(.+?)｜(.+?)\*\*[（(](.+)[）)]\s*$/);
    if (!match) continue;
    const [, code, slot, name, assignee] = match;
    let deliver = "", acceptance = "";
    for (let n = i + 1; n < lines.length && !/^(?:-\s+\*\*|###\s)/.test(lines[n]); n++) {
      const text2 = plain(lines[n]);
      if (text2.startsWith("交付：")) deliver = text2.slice(3);
      if (text2.startsWith("验收：")) acceptance = text2.slice(3);
    }
    const entry = { id: `plan-${code}`, code, title: plain(name), assignee: plain(assignee), team: "执行计划", project: phase, phases: [phase], slot: plain(slot), date: null, status: "planning", progress: null, description: plain(name), completionDefinition: deliver || "未登记", acceptance, boundary: "建议排期；不代表执行、验收或预算已批准", steps: [], kind: "plan" };
    const previous = plans.get(code);
    if (previous) {
      if (previous.title !== entry.title || previous.assignee !== entry.assignee || previous.completionDefinition !== entry.completionDefinition || previous.acceptance !== entry.acceptance || previous.slot !== entry.slot) throw new Error(`计划 ${code} 有不同内容，请先核对来源`);
      previous.phases.push(phase);
      previous.project = previous.phases.join("／");
    } else plans.set(code, entry);
  }
  tasks.push(...plans.values());
  if (!tasks.length) throw new Error("当前基线没有分工或任务");
  return { tasks: projectTaskBindings(projectTaskSolos(projectFlow(projectTaskDetails(projectExecution(tasks, executionRecords(event.content)), event.content), event.content), event.content), event.content), source: `buzz://channel/${TASK_SOURCE}`, baselineRevision: event.id, syncedAt: new Date(event.created_at * 1e3).toISOString(), projection: "channel_baseline", title, content: event.content, companyMilestones: [] };
}

// src/tasks/lifecycle-agent.mjs
async function exactFlowMessage(session, client, channel, id, check) {
  if (!isKey(id) || typeof client.effectiveEdit !== "function" || typeof session.thread !== "function") throw Error("需有效原消息及原生消息核对能力");
  check();
  await client.effectiveEdit(id, channel);
  check();
  const view = session.thread(channel, id, { exact: true });
  try {
    await view.refresh();
    check();
    const state = view.snapshot(), row = state.target;
    if (state.targetStatus !== "ready" || !row || row.id !== id || row.channelId !== channel || row.edited || row.delivery && !["accepted", "seen"].includes(row.delivery)) throw Error("原消息已变化、删除或不可读，请核对");
    return row;
  } finally {
    view.dispose();
  }
}

// src/calendar/model.mjs
var TYPES = Object.freeze({ leave: "请假", trip: "出差", online: "线上会议", offline: "线下会议", milestone: "里程碑" });
var BEGIN4 = "<!-- opcb-calendar-v1:begin -->";
var END4 = "<!-- opcb-calendar-v1:end -->";
var key = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
var plain2 = (v, max, label) => {
  if (typeof v !== "string" || !v.trim() || [...v].length > max || /[\r\n]/.test(v) || v.includes("<!--")) throw Error(label + "无效");
  return v.trim();
};
function validateEvent(raw) {
  if (!raw || !key(raw.id) || !key(raw.createdBy) || !key(raw.updatedBy) || !Number.isFinite(raw.updatedAt)) throw Error("日程身份无效");
  if (!Object.hasOwn(TYPES, raw.type)) throw Error("只支持请假、出差、线上会议、线下会议和里程碑");
  if (!validDate(raw.date) || !validDate(raw.endDate) || raw.endDate < raw.date) throw Error("请填写有效的开始和结束日期");
  if (Date.parse(raw.endDate) - Date.parse(raw.date) > 366 * 864e5) throw Error("单项日程最长一年");
  if (typeof raw.allDay !== "boolean") throw Error("请确认全天或具体时间");
  const time = (v) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  if (!raw.allDay && (!time(raw.time) || !time(raw.endTime) || raw.date === raw.endDate && raw.endTime <= raw.time)) throw Error("结束时间需晚于开始时间");
  if (!Array.isArray(raw.participants) || raw.participants.length > 50 || raw.participants.some((p) => typeof p !== "string" || !p.trim() || [...p].length > 80) || new Set(raw.participants).size !== raw.participants.length) throw Error("参与人员无效");
  return { id: raw.id, type: raw.type, title: plain2(raw.title, 60, "日程名称"), date: raw.date, endDate: raw.endDate, allDay: raw.allDay, time: raw.allDay ? "" : raw.time, endTime: raw.allDay ? "" : raw.endTime, participants: raw.participants.map((p) => p.trim()), location: typeof raw.location === "string" ? raw.location.trim().slice(0, 300) : "", note: typeof raw.note === "string" ? raw.note.trim().slice(0, 1e3) : "", createdBy: raw.createdBy, updatedBy: raw.updatedBy, updatedAt: raw.updatedAt };
}
function readEvents(content) {
  const start = content.indexOf(BEGIN4);
  if (start < 0) {
    if (content.includes(END4)) throw Error("日程区格式冲突");
    return [];
  }
  const end = content.indexOf(END4, start);
  if (end < 0 || content.indexOf(BEGIN4, start + BEGIN4.length) >= 0 || content.indexOf(END4, end + END4.length) >= 0) throw Error("日程区格式冲突");
  const block = content.slice(start + BEGIN4.length, end).match(/```json\s*([\s\S]*?)\s*```/);
  if (!block) throw Error("日程区无法读取");
  const data = JSON.parse(block[1]);
  if (data.version !== 1 || !Array.isArray(data.events) || data.events.length > 1e3) throw Error("日程格式或数量无效");
  const events = data.events.map(validateEvent);
  if (new Set(events.map((e) => e.id)).size !== events.length) throw Error("日程编号重复");
  return events;
}
function canEditEvent(event, viewer, creator) {
  return !!viewer && (viewer === creator || event?.createdBy === viewer);
}
function mutateEvents(content, { action, event, id, actor, creator, now = Date.now() / 1e3 }) {
  if (!key(actor)) throw Error("日程操作者无效");
  const events = readEvents(content), index = events.findIndex((e) => e.id === (id || event?.id));
  if (!["add", "update", "remove"].includes(action)) throw Error("操作无效");
  if (action !== "add" && (index < 0 || !canEditEvent(events[index], actor, creator))) throw Error("仅登记人或来源管理员可修改此日程");
  if (action === "add") {
    if (events.length >= 1e3) throw Error("日程已满，请先整理来源");
    if (index >= 0) throw Error("日程已存在，请刷新核对");
    events.push(validateEvent({ ...event, createdBy: actor, updatedBy: actor, updatedAt: now }));
  } else if (action === "update") events[index] = validateEvent({ ...event, id: events[index].id, createdBy: events[index].createdBy, updatedBy: actor, updatedAt: now });
  else events.splice(index, 1);
  const block = BEGIN4 + "\n## 共享日历\n```json\n" + JSON.stringify({ version: 1, events }, null, 2) + "\n```\n" + END4;
  const start = content.indexOf(BEGIN4), next = start < 0 ? content.trimEnd() + "\n\n" + block + "\n" : content.slice(0, start) + block + content.slice(content.indexOf(END4, start) + END4.length);
  if (new TextEncoder().encode(next).length > 256e3) throw Error("来源已超过容量");
  readEvents(next);
  return next;
}
function eventsOn(events, day) {
  return events.filter((e) => e.date <= day && e.endDate >= day).sort((a, b) => (a.allDay ? "00:00" : a.time).localeCompare(b.allDay ? "00:00" : b.time) || a.title.localeCompare(b.title));
}
function sourceAccess(connection, write = false) {
  const s = connection?.session, list = s?.channels.list(), c = list?.channels.find((c2) => c2.id === TASK_SOURCE);
  if (connection?.status !== "ready" || connection.cached || !s?.viewer || list?.status !== "ready" || !c || c.archived || c.cached || c.pending || c.metadataCached || c.metadataPending || !c.members?.includes(s.viewer) || write && (c.readOnly || !s.canvas?.available || typeof s.canvas.save !== "function")) throw Error("当前账号无权" + (write ? "修改" : "读取") + "共享日历来源");
  return c;
}
async function saveEvents({ connection, check, expected, operation }) {
  const s = connection.session;
  check();
  sourceAccess(connection, true);
  const head = await s.canvas.read(TASK_SOURCE);
  check();
  const c = sourceAccess(connection, true);
  if (head?.id !== expected) throw Error("日历已变化，草稿保留；请刷新核对后再保存");
  const content = mutateEvents(head.content, { ...operation, actor: s.viewer, creator: c.creator });
  const saved = await s.canvas.save(TASK_SOURCE, content, head.id, { preserveApproval: true });
  check();
  sourceAccess(connection, true);
  if (!saved?.id || saved.content !== content) throw Error("保存结果未确认，请刷新核对后再操作");
  return saved;
}

// src/calendar/agent.mjs
function registerCalendarAgent(ctx) {
  ctx.agents.addTool({ name: "opcb_calendar", description: "读取或登记五类共享日程。写入需本人原指令、最新来源版本；仅登记人或来源管理员可改删，不改普通任务与请假审批。", inputSchema: { type: "object", additionalProperties: false, properties: { action: { type: "string", enum: ["read", "add", "update", "remove"] }, request_id: { type: "string" }, expected_revision: { type: "string" }, id: { type: "string" }, event: { type: "object", additionalProperties: false, properties: { type: { type: "string", enum: ["leave", "trip", "online", "offline", "milestone"] }, title: { type: "string" }, date: { type: "string" }, endDate: { type: "string" }, allDay: { type: "boolean" }, time: { type: "string" }, endTime: { type: "string" }, participants: { type: "array", items: { type: "string" } }, location: { type: "string" }, note: { type: "string" } } } } }, async call(client, context, args) {
    const relay = ctx.agents.relay(client.key), connection = relay?.snapshot(), owner = ctx.relay.snapshot();
    const check = () => {
      client.signal?.throwIfAborted();
      const live = relay?.snapshot(), current = ctx.relay.snapshot();
      if (!client.signal || connection?.status !== "ready" || connection.cached || live?.session !== connection.session || live?.scope !== connection.scope || live?.generation !== connection.generation || current.status !== "ready" || current.cached || current.session !== owner.session || current.scope !== connection.scope || current.generation !== owner.generation || current.session?.viewer !== client.owner || connection.session?.viewer !== client.owner) throw Error("本人或Agent身份已变化");
      for (const conn of [connection, current]) {
        const source = sourceAccess(conn), list = conn.session.channels.list(), route = list.channels.find((c) => c.id === context.channel);
        if (!source.members?.includes(client.pubkey) || !route || route.archived || route.cached || route.pending || route.metadataCached || route.metadataPending || !route.members?.includes(client.owner) || !route.members?.includes(client.pubkey)) throw Error("日程来源或原会话权限不足");
      }
    };
    check();
    const session = connection.session, head = await session.canvas.read(TASK_SOURCE);
    check();
    const events = readEvents(head.content);
    if (!args.action || args.action === "read") return JSON.stringify({ baselineRevision: head.id, source: "buzz://channel/" + TASK_SOURCE, events });
    if (!["add", "update", "remove"].includes(args.action) || args.expected_revision !== head.id) throw Error("请先读取当前日历版本");
    const request = await exactFlowMessage(session, client, context.channel, args.request_id, check);
    if (request.authorId !== client.owner) throw Error("需本人原始日程指令");
    const id = args.action === "add" ? request.id : args.id;
    if (args.action === "add" && events.some((e) => e.id === id)) return JSON.stringify({ baselineRevision: head.id, duplicate: true });
    const event = { ...args.event, id, participants: args.event?.participants || [], endDate: args.event?.endDate || args.event?.date, allDay: args.event?.allDay ?? true };
    const saved = await saveEvents({ connection, check, expected: head.id, operation: { action: args.action, event, id } });
    return JSON.stringify({ baselineRevision: saved.id, events: readEvents(saved.content) });
  } });
}

// src/tasks/company-people.mjs
var aliasNames = (name) => [name, ...String(name || "").split(/[／/（）()]/).map((s) => s.trim()).filter(Boolean)];
function companyPeople(names, members, profiles, statuses2, now = Date.now() / 1e3) {
  const result = {};
  for (const name of names) {
    const aliases = aliasNames(name), eligible = members.filter((id2) => {
      const p = profiles?.get(id2);
      return p && !p.nameIsFallback;
    });
    const exact = eligible.filter((id2) => [profiles.get(id2).name, profiles.get(id2).username].includes(name));
    const unique = aliases.slice(1).map((alias) => eligible.filter((id2) => [profiles.get(id2).name, profiles.get(id2).username].includes(alias))).filter((ids) => ids.length === 1).flat();
    const matches = exact.length ? exact : [...new Set(unique)];
    if (matches.length !== 1) {
      result[name] = { name, presence: null };
      continue;
    }
    const id = matches[0], profile = profiles.get(id), status = statuses2?.get(id);
    const valid = status && status.userId === id && typeof status.text === "string" && status.text.trim() && Number.isFinite(status.updatedAt) && status.updatedAt <= now + 300 && (status.expiresAt === void 0 || status.expiresAt > now);
    result[name] = { name, displayName: profile.name, pubkey: id, picture: typeof profile.picture === "string" ? profile.picture : "", isAgent: !!profile.isAgent, presence: valid ? { text: status.text.trim(), updatedAt: status.updatedAt } : null };
  }
  return result;
}
function personToday(tasks, day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date())) {
  const work = tasks.filter((t) => t.kind !== "assignment" && !t.removed && t.date === day), known = /* @__PURE__ */ new Set(["todo", "doing", "blocked", "review", "done"]);
  const done = work.filter((t) => t.status === "done").length;
  return { day, total: work.length, done, percent: !work.length || work.some((t) => !known.has(t.status)) ? null : Math.round(done / work.length * 100) };
}
function personWork(tasks) {
  const work = tasks.filter((t) => t.kind !== "assignment" && !t.removed), current = tasks.filter((t) => !t.removed && (t.kind !== "assignment" || !!t.execution) && (t.status === "doing" || t.status === "blocked"));
  return { total: work.length, done: work.filter((t) => t.status === "done").length, unknown: work.filter((t) => t.status === "planning").length, current, review: work.filter((t) => t.status === "review").length, blocked: work.filter((t) => t.status === "blocked" || t.status === "doing" && t.blockReason).length };
}

// src/tasks/company-model.mjs
var isBlocked = (t) => t.status === "blocked" || t.status === "doing" && !!t.blockReason;
function companySummary(tasks) {
  const active = tasks.filter((t) => !t.removed);
  return { total: active.length, doing: active.filter((t) => t.status === "doing" && !isBlocked(t)).length, blocked: active.filter(isBlocked).length, review: active.filter((t) => t.status === "review").length, done: active.filter((t) => t.status === "done").length, unregistered: active.filter((t) => t.status === "planning").length };
}
function sourceProjectName(title) {
  return ["OPCB平台商业化计划与报告", "OPCB平台商业化"].includes(String(title || "").replace(/\s/g, "")) ? "OPCB 平台商业化" : "";
}
function companyTasks(data) {
  const sourceProject = sourceProjectName(data?.title);
  const phaseNames = new Set((data?.tasks || []).filter((t) => t.kind === "plan").flatMap((t) => t.phases || [t.project]));
  return (data?.tasks || []).filter((t) => !t.removed).map((t) => {
    const legacy = t.kind === "plan" || t.kind === "assignment" || phaseNames.has(t.project);
    const businessProject = t.businessProject || (legacy ? sourceProject : t.project) || "未归属项目";
    const stages = t.kind === "assignment" ? ["人员分工"] : legacy ? [...t.phases || [t.project]].filter(Boolean) : [];
    return { ...t, businessProject, stages };
  });
}
function companyParticipants(task, owners) {
  const found = new Set(taskParticipants(task, owners));
  for (const segment of task.assignee.split(/\s*(?:＋|\+|、|；|;|→|，|,)\s*/)) {
    if (!/[／/]/.test(segment) || taskParticipants({ ...task, assignee: segment }, owners).length) continue;
    for (const part of segment.split(/[／/]/)) for (const name of taskParticipants({ ...task, assignee: part.trim() }, owners)) found.add(name);
  }
  return owners.filter((name) => found.has(name));
}
function companyGroups(tasks, mode = "project") {
  const active = tasks.filter((t) => !t.removed), groups = /* @__PURE__ */ new Map();
  const owners = [...new Set(active.filter((t) => t.kind === "assignment" || t.kind === "task").map((t) => t.assignee).filter(Boolean))];
  for (const task of active) {
    const people = companyParticipants(task, owners), names = mode === "people" ? people.length ? people : [task.assignee || "未分配"] : [(task.businessProject ?? task.project) || "未分组"];
    for (const name of names) {
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(task);
    }
  }
  return [...groups].map(([name, tasks2]) => ({ name, tasks: tasks2, summary: companySummary(tasks2) }));
}

// src/tasks/company-reports.mjs
var BEGIN5 = "<!-- opcb-company-people-v1:begin -->";
var END5 = "<!-- opcb-company-people-v1:end -->";
var key2 = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
function companyReports(content) {
  const start = content.indexOf(BEGIN5);
  if (start < 0) return [];
  const end = content.indexOf(END5, start), block = content.slice(start + BEGIN5.length, end);
  if (end < 0 || content.indexOf(BEGIN5, start + BEGIN5.length) >= 0) throw Error("人员同步记录格式冲突");
  const match = block.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) throw Error("人员同步记录无法读取");
  const data = JSON.parse(match[1]);
  if (data.version !== 1 || !Array.isArray(data.records) || data.records.length > 1e3) throw Error("人员同步记录版本或数量无效");
  for (const r of data.records) {
    if (typeof r.id !== "string" || !r.id || r.id.length > 220 || !key2(r.person) || !key2(r.setBy) || !key2(r.recordedBy) || !Number.isFinite(r.at) || r.at < 0 || typeof r.source !== "string" || !/^buzz:\/\/message\?channel=[a-z0-9-]+&id=[a-f0-9]{64}$/.test(r.source) || !r.fields || typeof r.fields !== "object") throw Error("人员同步记录身份或来源无效");
    for (const [field, value] of Object.entries(r.fields)) if (!["status", "current"].includes(field) || value !== null && (typeof value !== "string" || !value.trim() || value.length > (field === "status" ? 80 : 180) || value.includes(BEGIN5) || value.includes(END5))) throw Error("人员同步内容无效");
  }
  return data.records;
}
function reportedPerson(identity, records, now = Date.now() / 1e3) {
  if (!identity?.pubkey) return identity;
  const latest = {};
  for (const r of records) if (r.person === identity.pubkey && r.at <= now + 300) {
    for (const [field, value] of Object.entries(r.fields)) if (!latest[field] || r.at >= latest[field].at) latest[field] = { value, at: r.at, setBy: r.setBy, source: r.source };
  }
  const status = latest.status, activeStatus = status?.value && (!identity.presence || status.at >= identity.presence.updatedAt) ? { text: status.value, updatedAt: status.at, source: status.source, setBy: status.setBy, reported: true } : identity.presence;
  const current = latest.current;
  const day = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t * 1e3));
  return { ...identity, presence: activeStatus, currentReport: current?.value && day(current.at) === day(now) ? { text: current.value, updatedAt: current.at, source: current.source, setBy: current.setBy } : null };
}

// src/tasks/calendar.mjs
function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function monthCells(month) {
  const [year, m] = month.split("-").map(Number), count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(year, m - 1, 1)).getUTCDay() + 6) % 7;
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => {
    const d = new Date(Date.UTC(year, m - 1, i - offset + 1));
    return { date: dateKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), day: d.getUTCDate(), current: d.getUTCMonth() === m - 1 };
  });
}
function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number), d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return dateKey(d.getUTCFullYear(), d.getUTCMonth(), 1).slice(0, 7);
}
function dateLabel(date) {
  if (!date) return "待排期";
  const [y, m, d] = date.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

// src/tasks/schedule.mjs
function addDays(date, delta) {
  if (!validDate(date) || !Number.isInteger(delta)) throw new Error("无效日期");
  const d = /* @__PURE__ */ new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// src/tasks/company-person-card.mjs
function createPersonCard(React) {
  const h = React.createElement;
  function Photo({ src, name, cover = false }) {
    const [failed, setFailed] = React.useState(false);
    React.useEffect(() => setFailed(false), [src]);
    return h("span", { className: cover ? "cb-photo-cover" : "cb-avatar", "aria-hidden": true }, src && !failed ? h("img", { src, alt: "", loading: "lazy", onError: () => setFailed(true) }) : h("span", { className: "cb-photo-fallback" }, name.slice(0, 1)));
  }
  return function PersonCard({ group, identity, media, onOpen }) {
    const work = personWork(group.tasks), today2 = personToday(group.tasks), presence = identity?.presence, name = identity?.displayName || group.name;
    const latestTaskAt = Math.max(0, ...work.current.map((t) => Date.parse(t.execution?.at || t.lastRevisionAt || "") / 1e3 || 0));
    const report = identity?.currentReport, reported = report && report.updatedAt >= latestTaskAt;
    const current = reported ? report.text : work.current.length ? work.current.slice(0, 2).map((t) => (t.blockReason || t.status === "blocked" ? "受阻：" : "") + t.title).join("；") : "当前事情未同步";
    const picture = identity?.picture;
    let src = "";
    try {
      src = picture && (typeof media === "function" ? media(picture) : picture) || "";
    } catch {
    }
    const percent = today2.percent ?? 0;
    return h(
      "button",
      { className: "cb-person-card", type: "button", "data-person": group.name, onClick: onOpen, "aria-label": `查看${name}的工作` },
      h(Photo, { src, name, cover: true }),
      h(
        "span",
        { className: "cb-person-content" },
        h("span", { className: "cb-person-head" }, h(Photo, { src, name }), h("span", { className: "cb-person-meta" }, h("strong", null, name), h("span", { className: "cb-presence", "data-known": String(!!presence), title: presence ? `${presence.reported ? "由看板设置人同步" : "Buzz 本人设置"} · ${new Date(presence.updatedAt * 1e3).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) + "（北京时间）"}` : "尚无可对应的有效本人状态" }, presence?.text || "状态未同步"))),
        h("span", { className: "cb-person-current" }, h("span", { className: "cb-person-label" }, "当前事情"), h("span", { className: "cb-current-task", title: current + (reported ? "（看板同步记录）" : "") }, current)),
        h(
          "span",
          { className: "cb-person-progress" },
          h("span", { className: "cb-person-progress-heading" }, h("span", { className: "cb-person-label" }, "今日工作进度"), h("strong", { className: "cb-person-value" }, percent, h("span", null, "%"))),
          h("span", { className: "cb-person-track", role: "progressbar", "aria-label": `${name}今日工作进度`, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": percent, "aria-valuetext": today2.percent !== null ? `今日已验收 ${today2.done} / ${today2.total} 项` : "今日暂无进度记录，按0%显示" }, h("span", { style: { width: percent + "%" } }))
        )
      )
    );
  };
}

// src/calendar/grid.mjs
var weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
var shortDate = (date) => dateLabel(date).replace(/^\d+年/, "");
var minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
function weekDates(day) {
  const offset = ((/* @__PURE__ */ new Date(day + "T12:00:00Z")).getUTCDay() + 6) % 7;
  return weekdays.map((weekday, index) => ({ date: addDays(day, index - offset), weekday }));
}
function timeOn(event, day) {
  if (event.allDay) return "全天";
  return (day === event.date ? event.time : "00:00") + "–" + (day === event.endDate ? event.endTime : "24:00");
}
function timedBlocks(events, date) {
  const blocks = events.filter((event) => !event.allDay).map((event) => ({
    event,
    start: date === event.date ? minutes(event.time) : 0,
    end: date === event.endDate ? minutes(event.endTime) : 1440
  })).filter((block) => block.end > block.start).sort((a, b) => a.start - b.start || b.end - a.end);
  let group = [], lanes = [], groupEnd = 0;
  const finishGroup = () => group.forEach((block) => {
    block.lanes = lanes.length;
  });
  for (const block of blocks) {
    const displayEnd = Math.max(block.end, Math.min(1440, block.start + 26));
    if (block.start >= groupEnd) {
      finishGroup();
      group = [];
      lanes = [];
    }
    const free = lanes.findIndex((end) => end <= block.start);
    block.lane = free < 0 ? lanes.length : free;
    lanes[block.lane] = displayEnd;
    group.push(block);
    groupEnd = Math.max(groupEnd, displayEnd);
  }
  finishGroup();
  return blocks;
}
function createCalendarGrid(h) {
  const dateButton = (date, today2, selected, onSelect, label, count) => h("button", {
    type: "button",
    className: "cal-date",
    "aria-label": dateLabel(date),
    "aria-description": count > 0 ? count + " 项安排" : void 0,
    "aria-pressed": date === selected,
    "aria-current": date === today2 ? "date" : void 0,
    onClick: (click) => onSelect(date, false, click.currentTarget)
  }, label, count > 0 && h("span", { className: "cal-date-count", "aria-hidden": true }, count > 99 ? "99+" : count));
  const eventButton = (event, date, picked, onOpen, showTime, style) => h(
    "button",
    {
      key: event.id,
      type: "button",
      className: "cal-event",
      style,
      "data-type": event.type,
      "aria-pressed": picked === event.id,
      "aria-label": TYPES[event.type] + "：" + event.title,
      title: event.title + " · " + timeOn(event, date),
      onClick: (click) => onOpen(event, date, click.currentTarget)
    },
    showTime && h("span", { className: "cal-event-time" }, showTime),
    h("span", { className: "cal-event-title" }, event.title)
  );
  function Month({ day, today: today2, events, picked, onSelect, onOpen, monthEventLimit = 2 }) {
    return h(
      "div",
      { className: "cal-month", "aria-label": "月历" },
      ...weekdays.map((weekday) => h("span", { className: "cal-weekday", key: weekday }, weekday)),
      ...monthCells(day.slice(0, 7)).map((cell) => {
        const items = eventsOn(events, cell.date);
        return h(
          "section",
          {
            className: "cal-day",
            key: cell.date,
            "data-outside": !cell.current,
            "data-selected": cell.date === day
          },
          h(
            "div",
            { className: "cal-day-header" },
            dateButton(cell.date, today2, day, onSelect, cell.day, items.length),
            items.length > monthEventLimit && h("button", {
              type: "button",
              className: "cal-more",
              "aria-label": dateLabel(cell.date) + "全部" + items.length + "项安排",
              onClick: (click) => onSelect(cell.date, true, click.currentTarget)
            }, "+" + (items.length - monthEventLimit))
          ),
          h(
            "div",
            { className: "cal-month-events" },
            ...items.slice(0, monthEventLimit).map((event) => eventButton(
              event,
              cell.date,
              picked,
              onOpen,
              !event.allDay && (event.date === cell.date ? event.time : "续")
            ))
          )
        );
      })
    );
  }
  function Week({ day, today: today2, events, picked, onSelect, onOpen }) {
    const columns = weekDates(day).map((cell) => {
      const items = eventsOn(events, cell.date);
      return { ...cell, allDay: items.filter((event) => event.allDay), blocks: timedBlocks(items, cell.date) };
    });
    const blocks = columns.flatMap((cell) => cell.blocks);
    const firstHour = Math.min(8, ...blocks.map((block) => Math.floor(block.start / 60)));
    const lastHour = Math.max(19, ...blocks.map((block) => Math.ceil(block.end / 60)));
    const hours = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index);
    const percent = (value) => value / (hours.length * 60) * 100 + "%";
    return h(
      "div",
      { className: "cal-week-scroll", tabIndex: 0, role: "region", "aria-label": "周历时间轴" },
      h(
        "div",
        { className: "cal-week" },
        h(
          "div",
          { className: "cal-week-head" },
          h("span", { className: "cal-week-gutter" }, "UTC+8"),
          ...columns.map((cell) => h(
            "div",
            { className: "cal-week-date", key: cell.date, "data-selected": cell.date === day },
            h("span", null, cell.weekday),
            dateButton(cell.date, today2, day, onSelect, Number(cell.date.slice(8)))
          )),
          h("span", { className: "cal-week-gutter" }, "全天"),
          ...columns.map((cell) => h(
            "div",
            { className: "cal-week-all-day", key: cell.date, "data-selected": cell.date === day },
            ...cell.allDay.slice(0, 2).map((event) => eventButton(event, cell.date, picked, onOpen)),
            cell.allDay.length > 2 && h("button", {
              type: "button",
              className: "cal-more",
              "aria-label": dateLabel(cell.date) + "全部安排",
              onClick: (click) => onSelect(cell.date, true, click.currentTarget)
            }, "+" + (cell.allDay.length - 2) + " 项")
          ))
        ),
        h(
          "div",
          { className: "cal-week-body", style: { "--hour-count": hours.length } },
          h(
            "div",
            { className: "cal-hour-labels" },
            ...hours.map((hour) => h("span", { key: hour }, String(hour).padStart(2, "0") + ":00"))
          ),
          ...columns.map((cell) => h(
            "div",
            { className: "cal-time-column", key: cell.date, "data-selected": cell.date === day },
            ...cell.blocks.map(({ event, start, end, lane, lanes }) => eventButton(
              event,
              cell.date,
              picked,
              onOpen,
              end - start >= 45 && (start === 0 ? "00:00" : event.time),
              {
                top: percent(start - firstHour * 60),
                height: percent(end - start),
                left: lane / lanes * 100 + "%",
                width: 100 / lanes + "%"
              }
            ))
          ))
        )
      )
    );
  }
  return { Month, Week };
}
function rangeTitle(day, mode) {
  if (mode === "month") return Number(day.slice(5, 7)) + "月";
  const [{ date: start }, , , , , , { date: end }] = weekDates(day);
  return shortDate(start) + "–" + (start.slice(0, 7) === end.slice(0, 7) ? Number(end.slice(8)) + "日" : shortDate(end));
}

// src/calendar/view.mjs
var SINGLE_PANE_WIDTH = 800;
var EXPANDED_MONTH_WIDTH = 1440;
var EXPANDED_MONTH_HEIGHT = 840;
var today = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(/* @__PURE__ */ new Date());
function createCalendarView(React) {
  const h = React.createElement;
  const PersonCard = createPersonCard(React);
  const { Month, Week } = createCalendarGrid(h);
  const button = (label, onClick, props = {}) => h("button", { type: "button", onClick, ...props }, label);
  const typeOptions = () => Object.entries(TYPES).map(([id, label]) => h("option", { key: id, value: id }, label));
  return function CalendarView({ state, people = {}, media, reload, onSave, viewer, creator }) {
    const [page, setPage] = React.useState("calendar");
    const [mode, setMode] = React.useState("month");
    const [day, setDay] = React.useState(today);
    const [type, setType] = React.useState("");
    const [person, setPerson] = React.useState("");
    const [query, setQuery] = React.useState("");
    const [peopleQuery, setPeopleQuery] = React.useState("");
    const [draft, setDraft] = React.useState(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState("");
    const [notice, setNotice] = React.useState("");
    const [picked, setPicked] = React.useState(null);
    const [confirmRemove, setConfirmRemove] = React.useState(false);
    const [layout, setLayout] = React.useState("split");
    const singlePane = layout === "single";
    const expandedMonth = layout === "expanded";
    const [agendaOpen, setAgendaOpen] = React.useState(false);
    const root = React.useRef(null);
    const agendaTrigger = React.useRef(null);
    const agendaButton = React.useRef(null);
    const sideId = React.useId();
    const lock = React.useRef(false);
    const panelHeading = React.useRef(null);
    const draftTrigger = React.useRef(null);
    React.useLayoutEffect(() => {
      const observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        if (width <= SINGLE_PANE_WIDTH) setLayout("single");
        else if (width >= EXPANDED_MONTH_WIDTH && height >= EXPANDED_MONTH_HEIGHT) setLayout("expanded");
        else setLayout("split");
      });
      observer.observe(root.current);
      return () => observer.disconnect();
    }, []);
    const currentDate = today();
    const data = state.error ? null : state.data;
    const events = data?.events || [];
    const groups = companyGroups(companyTasks(data), "people");
    const needle = query.trim().toLowerCase();
    const filtered = events.filter((event) => (!type || event.type === type) && (!person || event.participants.includes(person)) && (!needle || [event.title, event.location, ...event.participants].join(" ").toLowerCase().includes(needle)));
    const selected = events.find((event) => event.id === picked);
    const agenda = eventsOn(filtered, day);
    const names = [.../* @__PURE__ */ new Set([...groups.map((group) => group.name), ...events.flatMap((event) => event.participants)])];
    const focusPanel = () => requestAnimationFrame(() => panelHeading.current?.focus());
    const selectDate = (date) => {
      setDay(date);
      setPicked(null);
    };
    const openAgenda = (date, reveal, trigger) => {
      if (draft) return;
      selectDate(date);
      setAgendaOpen(true);
      if (trigger) agendaTrigger.current = trigger;
      if (singlePane || reveal) focusPanel();
    };
    const backToCalendar = () => {
      setAgendaOpen(false);
      requestAnimationFrame(() => {
        const trigger = agendaTrigger.current;
        if (trigger?.isConnected) trigger.focus();
        else agendaButton.current?.focus();
      });
    };
    const openEvent = (event, date, trigger) => {
      if (draft) return;
      setDay(date);
      setPicked(event.id);
      setAgendaOpen(true);
      if (trigger?.closest(".cal-board")) agendaTrigger.current = trigger;
      focusPanel();
    };
    const choosePage = (next) => {
      if (next === page) return;
      setPage(next);
      setPicked(null);
      if (!draft) setAgendaOpen(false);
    };
    const move = (step) => selectDate(mode === "month" ? shiftMonth(day.slice(0, 7), step) + "-01" : addDays(day, step * 7));
    const openDraft = (value, trigger) => {
      draftTrigger.current = trigger;
      setDraft(value);
      setAgendaOpen(true);
      setError("");
      setNotice("");
      setConfirmRemove(false);
      focusPanel();
    };
    const closeDraft = () => {
      setDraft(null);
      setError("");
      setConfirmRemove(false);
      requestAnimationFrame(() => {
        const trigger = draftTrigger.current;
        if (trigger?.isConnected && (!singlePane || trigger.closest(".cal-side"))) trigger.focus();
        else panelHeading.current?.focus();
      });
    };
    const add = (event) => openDraft({
      id: globalThis.crypto.randomUUID().replaceAll("-", "") + globalThis.crypto.randomUUID().replaceAll("-", ""),
      type: "online",
      title: "",
      date: day,
      endDate: day,
      allDay: true,
      time: "09:30",
      endTime: "10:30",
      participants: [],
      location: "",
      note: ""
    }, event.currentTarget);
    const change = (field, value) => setDraft((previous) => ({
      ...previous,
      [field]: value,
      ...field === "date" && (!previous.endDate || previous.endDate < value) ? { endDate: value } : {}
    }));
    const editing = !!draft?.createdBy;
    const save = async (action) => {
      if (lock.current || !onSave) return;
      lock.current = true;
      setBusy(true);
      setError("");
      try {
        await onSave({ action, event: draft, id: draft.id });
        if (action !== "remove") setDay(draft.date);
        setPicked(action === "remove" ? null : draft.id);
        closeDraft();
        setNotice(action === "remove" ? "日程已删除" : "日程已保存");
      } catch (failure) {
        setError(failure.message);
      } finally {
        lock.current = false;
        setBusy(false);
      }
    };
    const editor = draft && h(
      "section",
      { className: "cal-editor", "aria-label": "编辑日程" },
      h("h2", { tabIndex: -1, ref: panelHeading }, editing ? "编辑日程" : "新增日程"),
      h(
        "form",
        { onSubmit: (event) => {
          event.preventDefault();
          void save(editing ? "update" : "add");
        } },
        h(
          "div",
          { className: "cal-fields" },
          h(
            "label",
            null,
            "日程名称",
            h("input", { required: true, maxLength: 60, value: draft.title, onChange: (e) => change("title", e.target.value) })
          ),
          h(
            "label",
            null,
            "类型",
            h("select", { value: draft.type, onChange: (e) => change("type", e.target.value) }, ...typeOptions())
          ),
          h(
            "div",
            { className: "cal-field-pair" },
            h(
              "label",
              null,
              "开始日期",
              h("input", { type: "date", required: true, value: draft.date, onChange: (e) => change("date", e.target.value) })
            ),
            h(
              "label",
              null,
              "结束日期",
              h("input", { type: "date", required: true, min: draft.date, value: draft.endDate, onChange: (e) => change("endDate", e.target.value) })
            )
          ),
          h(
            "label",
            { className: "cal-checkbox" },
            h("input", { type: "checkbox", checked: draft.allDay, onChange: (e) => change("allDay", e.target.checked) }),
            "全天"
          ),
          !draft.allDay && h(
            "div",
            { className: "cal-field-pair" },
            h(
              "label",
              null,
              "开始时间",
              h("input", { type: "time", required: true, value: draft.time, onChange: (e) => change("time", e.target.value) })
            ),
            h(
              "label",
              null,
              "结束时间",
              h("input", { type: "time", required: true, value: draft.endTime, onChange: (e) => change("endTime", e.target.value) })
            )
          ),
          h(
            "label",
            null,
            "地点或会议链接",
            h("input", { maxLength: 300, value: draft.location, onChange: (e) => change("location", e.target.value) })
          )
        ),
        names.length > 0 && h(
          "fieldset",
          null,
          h("legend", null, "参与人员"),
          ...names.map((name) => h(
            "label",
            { key: name, className: "cal-checkbox" },
            h("input", {
              type: "checkbox",
              checked: draft.participants.includes(name),
              onChange: (e) => change("participants", e.target.checked ? [...draft.participants, name] : draft.participants.filter((value) => value !== name))
            }),
            name
          ))
        ),
        h(
          "label",
          { className: "cal-note" },
          "备注",
          h("textarea", { value: draft.note, maxLength: 1e3, onChange: (e) => change("note", e.target.value) })
        ),
        draft.type === "leave" && h("p", null, "请假审批仍按公司流程"),
        error && h("p", { role: "alert" }, error),
        h(
          "div",
          { className: "cal-actions" },
          h("button", { type: "submit", disabled: busy || !onSave, className: "cal-primary" }, busy ? "正在保存…" : "保存日程"),
          button("取消", closeDraft, { disabled: busy }),
          editing && button(
            confirmRemove ? "确认删除" : "删除日程",
            () => confirmRemove ? void save("remove") : setConfirmRemove(true),
            { disabled: busy || !onSave, className: "cal-delete" }
          )
        )
      )
    );
    const detail = selected && h(
      "section",
      { className: "cal-detail", "aria-label": "日程详情" },
      button("‹ 当天安排", () => {
        setPicked(null);
        focusPanel();
      }, { className: "cal-back" }),
      h("span", { className: "cal-type", "data-type": selected.type }, TYPES[selected.type]),
      h("h2", { tabIndex: -1, ref: panelHeading }, selected.title),
      h(
        "dl",
        null,
        h("dt", null, "日期"),
        h("dd", null, dateLabel(selected.date) + (selected.endDate === selected.date ? "" : " 至 " + dateLabel(selected.endDate))),
        h("dt", null, "时间"),
        h("dd", null, selected.allDay ? "全天" : selected.time + "–" + selected.endTime + (selected.endDate === selected.date ? "" : "（跨天）")),
        h("dt", null, "人员"),
        h("dd", null, selected.participants.join("、") || "未登记"),
        selected.location && h(React.Fragment, null, h("dt", null, "地点"), h("dd", null, selected.location)),
        selected.note && h(React.Fragment, null, h("dt", null, "备注"), h("dd", { className: "cal-detail-note" }, selected.note))
      ),
      selected.type === "leave" && h("p", null, "请假审批仍按公司流程"),
      canEditEvent(selected, viewer, creator) && button(
        "编辑日程",
        (event) => openDraft({ ...selected }, event.currentTarget),
        { disabled: !onSave }
      )
    );
    const agendaPanel = h(
      "section",
      { className: "cal-agenda", "aria-label": "当日日程" },
      h(
        "header",
        null,
        h("h2", { tabIndex: -1, ref: panelHeading }, dateLabel(day).replace(/^\d+年/, "")),
        h("span", null, day === currentDate ? "今天 · " + agenda.length + " 项安排" : agenda.length + " 项安排")
      ),
      agenda.length > 0 ? h("ul", null, ...agenda.map((event) => h(
        "li",
        { key: event.id },
        h(
          "button",
          {
            type: "button",
            className: "cal-agenda-event",
            "data-type": event.type,
            onClick: (click) => openEvent(event, day, click.currentTarget),
            "aria-label": TYPES[event.type] + "：" + event.title
          },
          h("span", { className: "cal-agenda-meta" }, h("span", { className: "cal-type" }, TYPES[event.type]), timeOn(event, day)),
          h("strong", null, event.title),
          event.participants.length > 0 && h("span", { className: "cal-agenda-people" }, event.participants.join("、"))
        )
      ))) : h("p", { className: "cal-agenda-empty" }, type || person || needle ? "没有符合筛选的安排" : "当天暂无安排")
    );
    const showSide = agendaOpen || !!draft;
    return h(
      "section",
      {
        className: "opcb-calendar company-workbench",
        ref: root,
        onKeyDown: (event) => {
          if (event.key !== "Escape" || page !== "calendar") return;
          if (draft && !lock.current) {
            event.stopPropagation();
            closeDraft();
          } else if (!draft && picked) {
            event.stopPropagation();
            setPicked(null);
            focusPanel();
          } else if (!draft && singlePane && showSide) {
            event.stopPropagation();
            backToCalendar();
          }
        }
      },
      h("style", null, ".opcb-calendar {\n  --cal-bg: var(--surface-inset, #f3f4f0);\n  --cal-card: var(--surface-panel, #fff);\n  --cal-text: var(--text-standard, #232920);\n  --cal-muted: var(--text-subtle, #596353);\n  --cal-line: var(--border-standard, #dce2d6);\n  --cal-accent: #50663b;\n  --cal-focus: #769252;\n  --cal-selected: color-mix(in srgb, var(--cal-focus) 11%, var(--cal-card));\n  --v3-content: system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;\n  --v2-accent: #80965c;\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  height: 100%;\n  min-height: 0;\n  overflow: auto;\n  padding: 10px 12px 12px;\n  color: var(--cal-text);\n  background: var(--cal-bg);\n  font: 13px/1.4 var(--v3-content);\n  container-type: inline-size;\n}\n\n.opcb-calendar *, .opcb-calendar *::before { box-sizing: border-box; }\n.opcb-calendar :is(h1, h2, p, dl, dd, ul) { margin: 0; }\n.opcb-calendar :is(button, input, select, textarea) { font: inherit; color: inherit; }\n.opcb-calendar button {\n  cursor: pointer;\n  border: 1px solid var(--cal-line);\n  border-radius: 8px;\n  padding: 4px 8px;\n  min-height: 28px;\n  background: var(--cal-card);\n}\n.opcb-calendar button:enabled:hover { border-color: var(--cal-focus); }\n.opcb-calendar button:disabled { cursor: default; opacity: .55; }\n.opcb-calendar :focus-visible { outline: 2px solid var(--cal-focus); outline-offset: 2px; z-index: 1; }\n.opcb-calendar :is(input:not([type=checkbox]), select, textarea) {\n  min-width: 0;\n  max-width: 100%;\n  min-height: 28px;\n  padding: 4px 8px;\n  border: 1px solid var(--cal-line);\n  border-radius: 8px;\n  background: var(--cal-card);\n}\n.opcb-calendar .cal-primary {\n  color: #fff;\n  background: var(--cal-accent);\n  border-color: var(--cal-accent);\n  font-weight: 600;\n}\n.opcb-calendar .cal-feedback { overflow-wrap: anywhere; padding: 4px 8px; color: var(--cal-muted); }\n.opcb-calendar [role=alert] { color: var(--cal-danger, #a13337); }\n.cal-header, .cal-header nav, .cal-actions, .cal-arrows, .cal-segment {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 6px;\n}\n.cal-header { justify-content: space-between; }\n.cal-header nav button { background: transparent; border-color: transparent; }\n.cal-header nav [aria-current=page], .cal-segment [aria-pressed=true] {\n  background: var(--cal-selected);\n  color: var(--cal-text);\n  border-color: var(--cal-line);\n  font-weight: 650;\n}\n.cal-workspace {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) clamp(216px, 23cqw, 268px);\n  gap: 8px;\n  flex: 1;\n  min-height: 0;\n}\n.cal-board, .cal-side {\n  min-width: 0;\n  min-height: 0;\n  overflow: auto;\n  border: 1px solid var(--cal-line);\n  border-radius: 12px;\n  background: var(--cal-card);\n}\n.cal-board { display: flex; flex-direction: column; }\n.cal-workspace > [hidden] { display: none; }\n.cal-workspace[data-layout=single] { grid-template-columns: minmax(0, 1fr); }\n.cal-workspace[data-layout=single] .cal-board[data-mode=month] { align-self: stretch; }\n.cal-open-agenda { flex: none; align-self: start; margin: 8px; }\n.opcb-calendar .cal-back-to-calendar { margin-bottom: 8px; }\n.cal-board[data-mode=month] { align-self: start; max-height: 100%; }\n.cal-board-header {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 6px;\n  padding: 8px 10px 6px;\n}\n.cal-period { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; }\n.cal-year { color: var(--cal-muted); font-size: 12px; font-variant-numeric: tabular-nums; }\n.cal-board h1 { font-size: clamp(22px, 2.2cqw, 28px); line-height: 1.15; font-weight: 680; }\n.cal-segment { gap: 2px; padding: 2px; background: var(--cal-bg); border-radius: 10px; }\n.cal-segment button { min-height: 24px; padding-block: 2px; background: transparent; border-color: transparent; }\n.cal-arrows { gap: 4px; }\n.cal-arrows button { padding: 0; width: 28px; font-size: 20px; line-height: 1; }\n.cal-filters {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) minmax(84px, 108px) minmax(84px, 120px);\n  gap: 6px;\n  padding: 0 10px 8px;\n}\n.cal-filters select { text-overflow: ellipsis; }\n\n.cal-month {\n  display: grid;\n  flex: none;\n  grid-template-columns: repeat(7, minmax(0, 1fr));\n  grid-template-rows: auto;\n  grid-auto-rows: minmax(72px, auto);\n}\n.cal-weekday {\n  padding: 4px 6px;\n  border-top: 1px solid var(--cal-line);\n  color: var(--cal-muted);\n  background: var(--cal-bg);\n  font-size: 12px;\n}\n.cal-day {\n  min-width: 0;\n  padding: 3px;\n  border-top: 1px solid var(--cal-line);\n  border-right: 1px solid var(--cal-line);\n}\n.cal-day:nth-child(7n) { border-right: 0; }\n.cal-day-header { display: flex; align-items: center; justify-content: space-between; gap: 2px; }\n.cal-day[data-outside=true] { background: var(--cal-bg); color: var(--cal-muted); }\n.cal-day[data-selected=true], .cal-week-date[data-selected=true],\n.cal-week-all-day[data-selected=true], .cal-time-column[data-selected=true] { background-color: var(--cal-selected); }\n.opcb-calendar .cal-date {\n  display: inline-flex;\n  gap: 3px;\n  align-items: center;\n  justify-content: center;\n  padding: 0 4px;\n  min-width: 24px;\n  min-height: 24px;\n  border-color: transparent;\n  border-radius: 7px;\n  background: transparent;\n  font-variant-numeric: tabular-nums;\n  line-height: 1;\n}\n.cal-date[aria-current=date] { background: var(--cal-accent); color: white; }\n.cal-date[aria-pressed=true]:not([aria-current=date]) { border-color: var(--cal-focus); font-weight: 650; }\n.cal-date-count { display: none; }\n.cal-month-events, .cal-week-all-day { display: grid; align-content: start; gap: 2px; }\n\n.opcb-calendar [data-type=leave] { --event-color: #8a5c20; --event-bg: #f8eedf; }\n.opcb-calendar [data-type=trip] { --event-color: #23695d; --event-bg: #e1f0ea; }\n.opcb-calendar [data-type=online] { --event-color: #315f8b; --event-bg: #e5eff8; }\n.opcb-calendar [data-type=offline] { --event-color: #6e5087; --event-bg: #efe7f5; }\n.opcb-calendar [data-type=milestone] { --event-color: #913e46; --event-bg: #f8e8eb; }\n.opcb-calendar .cal-event {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  min-width: 0;\n  width: 100%;\n  min-height: 18px;\n  padding: 1px 3px;\n  border: 1px solid transparent;\n  border-radius: 5px;\n  background: var(--event-bg);\n  color: var(--event-color);\n  text-align: left;\n  font-size: 11px;\n  line-height: 1.2;\n}\n.opcb-calendar .cal-event:is(:hover, [aria-pressed=true]) { border-color: var(--event-color); }\n.cal-event-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 650; }\n.cal-event-time { white-space: nowrap; font-variant-numeric: tabular-nums; }\n.opcb-calendar .cal-more {\n  justify-self: start;\n  background: transparent;\n  border-color: transparent;\n  color: var(--cal-muted);\n  padding: 0 4px;\n  min-height: 18px;\n  font-size: 11px;\n  line-height: 1.3;\n}\n.opcb-calendar .cal-day-header .cal-more { min-height: 22px; padding-inline: 2px; white-space: nowrap; }\n\n.cal-week-scroll { flex: 1; min-height: 0; overflow: auto; }\n.cal-week { --hour-height: 40px; min-width: 576px; }\n.cal-week-head, .cal-week-body {\n  display: grid;\n  grid-template-columns: 44px repeat(7, minmax(0, 1fr));\n}\n.cal-week-head { position: sticky; top: 0; z-index: 2; background: var(--cal-card); border-top: 1px solid var(--cal-line); }\n.cal-week-date, .cal-week-gutter, .cal-week-all-day {\n  min-width: 0;\n  padding: 4px;\n  border-bottom: 1px solid var(--cal-line);\n  border-right: 1px solid var(--cal-line);\n}\n.cal-week-head > :nth-child(8n), .cal-week-body > :last-child { border-right: 0; }\n.cal-week-date { display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 12px; }\n.cal-week-gutter { color: var(--cal-muted); font-size: 10px; display: grid; place-items: center; }\n.cal-week-all-day { min-height: 28px; }\n.cal-hour-labels {\n  display: grid;\n  grid-template-rows: repeat(var(--hour-count), var(--hour-height));\n  text-align: center;\n  border-right: 1px solid var(--cal-line);\n  color: var(--cal-muted);\n  font-size: 11px;\n  font-variant-numeric: tabular-nums;\n}\n.cal-hour-labels span { padding-top: 4px; }\n.cal-time-column {\n  position: relative;\n  border-right: 1px solid var(--cal-line);\n  border-bottom: 1px solid var(--cal-line);\n  background-image: repeating-linear-gradient(to bottom, transparent 0 calc(var(--hour-height) - 1px), var(--cal-line) calc(var(--hour-height) - 1px) var(--hour-height));\n}\n.opcb-calendar .cal-time-column .cal-event {\n  position: absolute;\n  align-items: flex-start;\n  flex-direction: column;\n  justify-content: center;\n  gap: 1px;\n  min-height: 17px;\n  padding-block: 0;\n  overflow: hidden;\n  max-height: 100%;\n  border-inline-width: 2px;\n  border-inline-color: var(--cal-card);\n}\n.cal-time-column .cal-event-title { max-width: 100%; }\n\n.cal-side { padding: 10px; }\n.cal-side :is(h2, p, dd, strong) { overflow-wrap: anywhere; }\n.cal-side h2 { font-size: 18px; line-height: 1.25; font-weight: 680; }\n.cal-side p { color: var(--cal-muted); }\n.cal-agenda header { display: grid; gap: 3px; margin-bottom: 8px; }\n.cal-agenda header > span, .cal-agenda-people { color: var(--cal-muted); font-size: 12px; }\n.cal-agenda ul { display: grid; gap: 6px; padding: 0; list-style: none; }\n.opcb-calendar .cal-agenda-event {\n  display: grid;\n  justify-items: start;\n  gap: 2px;\n  width: 100%;\n  padding: 6px 8px;\n  text-align: left;\n}\n.cal-agenda-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; color: var(--cal-muted); font-variant-numeric: tabular-nums; }\n.cal-type {\n  display: inline-block;\n  justify-self: start;\n  width: fit-content;\n  padding: 2px 6px;\n  border-radius: 5px;\n  color: var(--event-color);\n  background: var(--event-bg);\n  font-size: 11px;\n  font-weight: 650;\n}\n.cal-agenda-empty { padding: 12px 0; border-top: 1px solid var(--cal-line); }\n.cal-detail { display: grid; gap: 8px; justify-items: start; }\n.opcb-calendar .cal-back { border-color: transparent; color: var(--cal-muted); padding: 0 4px; min-height: 28px; }\n.cal-detail dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 12px; width: 100%; }\n.cal-detail dt { color: var(--cal-muted); }\n.cal-detail-note { white-space: pre-wrap; }\n.cal-editor form, .cal-fields { display: grid; gap: 8px; margin-top: 8px; }\n.cal-fields { margin-top: 0; }\n.cal-fields label, .cal-note { display: grid; gap: 4px; min-width: 0; }\n.cal-field-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }\n.cal-editor .cal-checkbox { display: inline-flex; align-items: center; gap: 6px; margin-right: 8px; }\n.cal-editor fieldset { border: 1px solid var(--cal-line); border-radius: 8px; margin: 0; min-width: 0; }\n.cal-editor textarea { width: 100%; min-height: 60px; resize: vertical; }\n.opcb-calendar .cal-delete { color: var(--cal-danger, #a13337); }\n.cal-people { display: grid; gap: 10px; }\n.cal-people > input { justify-self: start; }\n\n@media (prefers-color-scheme: dark) {\n  .opcb-calendar {\n    --cal-bg: var(--surface-inset, #181c17);\n    --cal-card: var(--surface-panel, #222720);\n    --cal-text: var(--text-standard, #f0f2e8);\n    --cal-muted: var(--text-subtle, #b4bdad);\n    --cal-line: var(--border-standard, #424a3e);\n    --cal-focus: #a5be81;\n    --cal-danger: #ffabad;\n  }\n  .opcb-calendar [data-type=leave] { --event-color: #f1cd95; --event-bg: #42341f; }\n  .opcb-calendar [data-type=trip] { --event-color: #a6dfca; --event-bg: #233c32; }\n  .opcb-calendar [data-type=online] { --event-color: #acd3f7; --event-bg: #253d51; }\n  .opcb-calendar [data-type=offline] { --event-color: #ddc1f3; --event-bg: #3c2e49; }\n  .opcb-calendar [data-type=milestone] { --event-color: #f4b7c1; --event-bg: #4b2933; }\n}\n@container (max-width: 1010px) {\n  .cal-month .cal-event-time { display: none; }\n}\n@container (min-width: 1440px) {\n  .cal-workspace[data-layout=split] {\n    grid-template-columns: minmax(0, 1fr) clamp(328px, 21cqw, 480px);\n    gap: 12px;\n  }\n  .cal-side { padding: 16px; font-size: 14px; }\n  .cal-side h2 { font-size: 20px; }\n  .cal-agenda ul { gap: 8px; }\n  .opcb-calendar .cal-agenda-event { padding: 8px 10px; }\n}\n.cal-board[data-mode=month][data-expanded=true] { align-self: stretch; }\n.cal-board[data-expanded=true] .cal-month {\n  flex: 1 0 auto;\n  grid-template-rows: min-content;\n  grid-auto-rows: minmax(112px, 1fr);\n}\n.cal-board[data-expanded=true] .cal-day { padding: 6px; }\n.cal-board[data-expanded=true] .cal-weekday { padding: 6px 8px; }\n.opcb-calendar .cal-board[data-expanded=true] .cal-month .cal-event {\n  min-height: 22px;\n  padding-inline: 6px;\n  font-size: 13px;\n}\n@container (max-width: 520px) {\n  .cal-board-header { padding: 8px; }\n  .cal-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; padding: 0 8px 8px; }\n  .cal-filters input { grid-column: 1 / -1; }\n  .cal-field-pair { grid-template-columns: minmax(0, 1fr); }\n  .cal-month { grid-auto-rows: minmax(48px, auto); }\n  .cal-day { padding: 4px 1px; }\n  .opcb-calendar .cal-date { gap: 1px; padding-inline: 1px; }\n  .cal-weekday { padding: 6px 2px; text-align: center; }\n  .cal-month-events, .opcb-calendar .cal-day-header .cal-more { display: none; }\n  .cal-date-count {\n    display: inline-grid;\n    place-items: center;\n    min-width: 14px;\n    height: 14px;\n    padding-inline: 1px;\n    border-radius: 4px;\n    background: var(--cal-selected);\n    font-size: 9px;\n  }\n  .cal-date[aria-current=date] .cal-date-count { background: #ffffff30; }\n}\n@media (max-width: 600px) { .opcb-calendar { padding: 8px; } }\n/* Owner-approved photo cards. The progress bar is the only full-width capsule. */\n.opcb-calendar.company-workbench .cb-people-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,228px),1fr));gap:12px;align-items:start}\n.opcb-calendar.company-workbench .cb-person-card{display:flex;flex-direction:column;position:relative;isolation:isolate;overflow:hidden;padding:0;gap:0;border:1px solid #ffffff14;border-radius:20px;background:#0c0d0c;color:#f6f5ef;text-align:left;min-width:0;cursor:pointer}\n.opcb-calendar.company-workbench .cb-photo-cover{display:block;position:relative;width:100%;aspect-ratio:4/3;overflow:hidden;background:#20231e}.opcb-calendar.company-workbench .cb-photo-cover img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 63%}.opcb-calendar.company-workbench .cb-photo-cover:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent 38%,#0c0d0c18 54%,#0c0d0cb0 80%,#0c0d0c 96%)}\n.opcb-calendar.company-workbench .cb-photo-fallback{display:grid;place-items:center;width:100%;height:100%;background:#252a23;color:#c9cfbe;font-size:60px;font-weight:700}\n.opcb-calendar.company-workbench .cb-person-content{display:flex;flex-direction:column;position:relative;margin-top:-18px;padding:0 14px 16px;width:100%;flex:1;min-width:0}.opcb-calendar.company-workbench .cb-person-head{display:flex;align-items:center;gap:8px;min-height:44px}.opcb-calendar.company-workbench .cb-avatar{display:block;width:44px;height:44px;flex:none;overflow:hidden;border-radius:50%;border:3px solid #0c0d0c;box-shadow:0 0 0 1px #ffffff1f;background:#252a23}.opcb-calendar.company-workbench .cb-avatar img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 60%}.opcb-calendar.company-workbench .cb-avatar .cb-photo-fallback{font-size:18px}\n.opcb-calendar.company-workbench .cb-person-meta{min-width:0;flex:1}.opcb-calendar.company-workbench .cb-person-head strong{display:block;font-size:18px;font-weight:800;line-height:1.4;overflow-wrap:anywhere}.opcb-calendar.company-workbench .cb-presence{display:flex;align-items:center;gap:5px;font-size:12px;color:#a8afa0;line-height:16px;margin-top:2px;overflow-wrap:anywhere}.opcb-calendar.company-workbench .cb-presence:before{content:'';width:6px;height:6px;flex:none;border-radius:50%;background:#73786e}.opcb-calendar.company-workbench .cb-presence[data-known=true]{color:#c5cdbb}.opcb-calendar.company-workbench .cb-presence[data-known=true]:before{background:#b5c59b}\n.opcb-calendar.company-workbench .cb-person-current{display:flex;flex-direction:column;margin-top:12px}.opcb-calendar.company-workbench .cb-person-label{display:block;font-size:12px;color:#a5a89f;line-height:18px;font-weight:500}.opcb-calendar.company-workbench .cb-current-task{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:16px;font-weight:600;line-height:1.5;min-height:48px;overflow-wrap:anywhere;margin-top:4px}\n.opcb-calendar.company-workbench .cb-person-progress{display:block;margin-top:12px}.opcb-calendar.company-workbench .cb-person-progress-heading{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px}.opcb-calendar.company-workbench .opcb-calendar.company-workbench .cb-person-value{font:700 32px/36px var(--v3-content);font-variant-numeric:tabular-nums;letter-spacing:-.5px;color:#e4e8d1;white-space:nowrap}.opcb-calendar.company-workbench .cb-person-value>span{font-size:14px;letter-spacing:0;margin-left:3px;color:#bfc5b1}.opcb-calendar.company-workbench .cb-person-track{display:block;height:10px;border-radius:999px;overflow:hidden;background:#292d25;box-shadow:inset 0 1px 3px #0007}.opcb-calendar.company-workbench .cb-person-track>span{display:block;height:100%;border-radius:inherit;background:linear-gradient(180deg,#e1e5cb,#cbd3af);box-shadow:inset 0 1px 0 #ffffff4d}\n.opcb-calendar.company-workbench .cb-person-card:focus-visible{outline:3px solid var(--v2-accent);outline-offset:4px}\n"),
      h(
        "header",
        { className: "cal-header" },
        h(
          "nav",
          { "aria-label": "视图" },
          button("日历", () => choosePage("calendar"), { "aria-current": page === "calendar" ? "page" : void 0 }),
          button("人员卡片", () => choosePage("people"), { "aria-current": page === "people" ? "page" : void 0 })
        ),
        h(
          "div",
          { className: "cal-actions" },
          button("刷新", reload, { disabled: state.loading || busy }),
          page === "calendar" && button("＋ 新增日程", add, {
            "aria-label": "新增日程",
            disabled: !onSave || !!draft,
            className: "cal-primary"
          })
        )
      ),
      state.loading && h("p", { role: "status", className: "cal-feedback" }, "正在核对共享来源…"),
      state.error && h("p", { role: "alert", className: "cal-feedback" }, state.error),
      notice && h("p", { role: "status", className: "cal-feedback" }, notice),
      page === "people" ? h(
        "main",
        { className: "cal-people" },
        h("input", { "aria-label": "搜索人员", placeholder: "搜索人员", value: peopleQuery, onChange: (e) => setPeopleQuery(e.target.value) }),
        h("div", { className: "cb-people-grid" }, ...groups.filter((group) => group.name.toLowerCase().includes(peopleQuery.trim().toLowerCase())).map((group) => h(PersonCard, {
          key: group.name,
          group,
          identity: people[group.name],
          media,
          onOpen: () => {
            setPerson(group.name);
            setQuery("");
            choosePage("calendar");
          }
        }))),
        !groups.length && h("p", null, "当前来源暂无人员分工")
      ) : h(
        "main",
        { className: "cal-workspace", "data-layout": singlePane ? "single" : "split" },
        h(
          "section",
          {
            className: "cal-board",
            "data-mode": mode,
            "data-expanded": expandedMonth,
            "aria-label": "共享日历",
            hidden: singlePane && showSide,
            onFocus: () => {
              if (!singlePane && !draft) setAgendaOpen(false);
            }
          },
          h(
            "header",
            { className: "cal-board-header" },
            h(
              "div",
              { className: "cal-period" },
              h("span", { className: "cal-year" }, day.slice(0, 4) + "年"),
              h("h1", { "aria-live": "polite" }, rangeTitle(day, mode))
            ),
            h(
              "div",
              { className: "cal-actions" },
              h(
                "div",
                { className: "cal-segment", role: "group", "aria-label": "日历范围" },
                button("月", () => setMode("month"), { "aria-pressed": mode === "month" }),
                button("周", () => setMode("week"), { "aria-pressed": mode === "week" })
              ),
              button("今天", () => selectDate(currentDate)),
              h(
                "div",
                { className: "cal-arrows" },
                button("‹", () => move(-1), { "aria-label": mode === "month" ? "上个月" : "上一周" }),
                button("›", () => move(1), { "aria-label": mode === "month" ? "下个月" : "下一周" })
              )
            )
          ),
          h(
            "div",
            { className: "cal-filters" },
            h("input", { "aria-label": "搜索日程", placeholder: "搜索日程", value: query, onChange: (e) => {
              setQuery(e.target.value);
              setPicked(null);
            } }),
            h(
              "select",
              { "aria-label": "日程类型", value: type, onChange: (e) => {
                setType(e.target.value);
                setPicked(null);
              } },
              h("option", { value: "" }, "全部类型"),
              ...typeOptions()
            ),
            h(
              "select",
              { "aria-label": "参与人员", value: person, onChange: (e) => {
                setPerson(e.target.value);
                setPicked(null);
              } },
              h("option", { value: "" }, "全部人员"),
              ...names.map((name) => h("option", { key: name, value: name }, name))
            )
          ),
          h(mode === "month" ? Month : Week, {
            day,
            today: currentDate,
            events: filtered,
            picked,
            monthEventLimit: expandedMonth ? 3 : 2,
            onSelect: openAgenda,
            onOpen: openEvent
          }),
          singlePane && button(
            "查看当天安排",
            (event) => openAgenda(day, true, event.currentTarget),
            { className: "cal-open-agenda", "aria-controls": sideId, ref: agendaButton, disabled: !!draft }
          )
        ),
        h(
          "aside",
          {
            className: "cal-side",
            id: sideId,
            "aria-label": "日程面板",
            hidden: singlePane && !showSide,
            onFocus: () => {
              if (!singlePane) setAgendaOpen(true);
            }
          },
          singlePane && !draft && button("‹ 返回日历", backToCalendar, { className: "cal-back cal-back-to-calendar" }),
          editor || detail || agendaPanel
        )
      )
    );
  };
}

// src/calendar/plugin.mjs
var EMPTY = /* @__PURE__ */ new Map();
var empty = () => EMPTY;
var subscribe = () => () => {
};
var inject = ["react", "pages", "relay", "agents"];
function apply(ctx) {
  registerCalendarAgent(ctx);
  const React = ctx.react, h = React.createElement, View = createCalendarView(React);
  function Workspace({ connection }) {
    const session = connection.session, list = React.useSyncExternalStore(session.channels.subscribeList, session.channels.list, session.channels.list);
    const profiles = React.useSyncExternalStore(session.profiles?.subscribe || subscribe, session.profiles?.snapshot || empty, empty);
    const statuses2 = React.useSyncExternalStore(session.statuses?.subscribe || subscribe, session.statuses?.snapshot || empty, empty);
    const [state, setState] = React.useState({ loading: true }), [refresh, setRefresh] = React.useState(0);
    const epoch = React.useRef(0);
    const c = list.channels.find((c2) => c2.id === TASK_SOURCE);
    let allowed = false;
    try {
      sourceAccess(connection);
      allowed = true;
    } catch {
    }
    const check = () => {
      const live = ctx.relay.snapshot();
      if (live.status !== "ready" || live.cached || live.session !== session || live.scope !== connection.scope || live.generation !== connection.generation) throw Error("账号或社区已变化");
      sourceAccess(connection);
    };
    const memberKey = allowed ? c.members.join("|") : "";
    React.useEffect(() => {
      session.channels.ensureList();
    }, [session]);
    React.useEffect(() => {
      if (memberKey) void Promise.resolve(session.profiles?.ensure?.(memberKey.split("|"), "background")).catch(() => {
      });
    }, [session, memberKey]);
    React.useEffect(() => memberKey ? session.statuses?.watch?.(memberKey.split("|")) : void 0, [session, memberKey]);
    React.useEffect(() => {
      if (!allowed) {
        setState({ loading: false, error: "当前账号无权读取日历来源" });
        return;
      }
      let disposed = false, pending = false, again = false;
      const read = async () => {
        if (disposed) return;
        if (pending) {
          again = true;
          return;
        }
        pending = true;
        const started = epoch.current;
        try {
          check();
          const event = await session.canvas.read(TASK_SOURCE);
          check();
          const data = { ...parseTaskCanvas(event), events: readEvents(event.content) };
          if (!disposed && started === epoch.current) setState({ data, loading: false });
        } catch (e) {
          if (!disposed && started === epoch.current) setState({ error: e.message, loading: false });
        } finally {
          pending = false;
          if (again) {
            again = false;
            void read();
          }
        }
      };
      void read();
      const timer = setInterval(() => {
        if (globalThis.document?.visibilityState !== "hidden") void read();
      }, 3e4);
      const off = session.subscribeLive?.((batch) => {
        if (batch.channelId === TASK_SOURCE || batch.events?.some((e) => e.tags?.some((t) => t[0] === "h" && t[1] === TASK_SOURCE))) void read();
      });
      return () => {
        disposed = true;
        clearInterval(timer);
        off?.();
      };
    }, [session, connection.scope, connection.generation, allowed, refresh]);
    const safe = allowed ? state : { loading: false, error: "当前账号无权读取日历来源" };
    const groups = companyGroups(companyTasks(safe.data), "people"), native = companyPeople(groups.map((g) => g.name), allowed ? c.members : [], profiles, statuses2);
    let reports = [];
    try {
      reports = companyReports(safe.data?.content || "");
    } catch {
    }
    const people = Object.fromEntries(Object.entries(native).map(([name, p]) => [name, reportedPerson(p, reports)]));
    const onSave = async (operation) => {
      epoch.current++;
      const event = await saveEvents({ connection, check, expected: state.data?.baselineRevision, operation });
      check();
      setState({ data: { ...parseTaskCanvas(event), events: readEvents(event.content) }, loading: false });
    };
    return h(View, { key: allowed && !state.error ? "ready" : "unavailable", state: safe, people, media: session.media, reload: () => setRefresh((v) => v + 1), viewer: session.viewer, creator: c?.creator, onSave: allowed && !c.readOnly && !c.pending && session.canvas?.available && state.data && !state.error ? onSave : void 0 });
  }
  function Page() {
    const connection = React.useSyncExternalStore(ctx.relay.subscribe, ctx.relay.snapshot, ctx.relay.snapshot);
    const key3 = React.useMemo(() => ({}), [connection.session, connection.scope, connection.generation]);
    const prev = React.useRef(null), seq = React.useRef(0);
    if (prev.current !== key3) {
      prev.current = key3;
      seq.current++;
    }
    return connection.status === "ready" && !connection.cached && connection.session?.viewer ? h(Workspace, { connection, key: seq.current }) : h("p", { role: "status" }, "连接当前社区后查看日历");
  }
  ctx.pages.register({ id: "main", title: "日历", icon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQAAAH0CAYAAADL1t+KAAEAAElEQVR4nOz9ebwlR3YWin4rIoc9nqnqVJWkUmlqDS71oO52y8YYl+Th0bhtX9tQwsaYti9gG7D7cfFlsH8PSudhA/c+wIDNAz+ugd97Hi46+JrJgB+YVvGA6wkP3S3ZPUpqqVRVZx72lEPEen9ERGZk7tynpHa31VblJ53ae2dGRkZGZq5vrRUrVgAtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFixYtWrRo0aJFi9sO9EY3oEWLFi1+N4GZaXNzU6yvr9P29jY/99xzvLGxwWYX09NPP00ABAA8+uijfPnyZU1E/Ma2usXtgOCNbkCLFi1afL7Dkfhzzz3HRKQBqKZylrgZgPa3X7lyRTz//PP0zDPPtOTe4nOGltBbtGjRYgEckRORgiXxH/mRHznX7Xa/EMA7hBAXtdbnmHmY5Xmo8nyaZdkoy7KXWPHHCPRr3TvP/tr3vP/9uwBARLh8+bK8ePEib2xs6JPO3aLF60Xrcm/RokWLBjzzzDPyqaeeUgBw5cqVlXPnzn19HMd/OIrjL15eWlrpdDoQQkAphTRNMZvNMJ1OMRqNMJlMMJ1OMR6NMUtm2wB+EcDm/fev/+z3fM/37wLA5cuX5ebmpoax6Fu0+G2jJfQWLVq08ODGwTc2NvT/dOV/Wju/cuG7lwaDP3H23Lm7V1ZWEEcRwjDUYRRqMJBmGc1mMxwfHdHe3h7v7+9jd3eX9/b2MBqNRJqkQnNhjF8PwvDHT62t/f2/9bf+1ktAQeyNLvwWLV4PWkJv0aJFCwufXK9cufJtS8vLG/fec8+F9fV1rK6uqsFgiCgKhQwCIgBKKSRpitHxMXZ3d3Hj+g28ev1VbG1tYWdnF0dHh5hMJjybzXSW5RCCZKfTQSCDg0G/9yMPPfLI/2NjY+OotdZbfDbQEnqLFi1aoHSxf+ADHzg7GA5+5K477/pD99xzD86fP5+vra3Jfr9PYRhCCAEAYGYopTCbzbC/f4BXX72GF154AS+//DJu3LiB3d1djI5HmE4nSLMMKs+Ra82slBJSBoPBAHEcf7Tf7//Zn/mZn/n3AOjKlSvUjq23+EzREnqLFi1ue1y6dCm4evVq/h3f8R3vWl5efua+++974C0PvCW/7777xNramojjGEEQACAQGTJnZuRKYTIeY2trC5/4xCfw0Y9+FJ/+9KextbWFg8NDTCcTJEmCLMuglILWhqvZQMVxHAwGAywNBj/0F/7SX/oLTz75ZN664Ft8pmgJvUWLFrc1HJl/2x//tq8adAf//IEHHlh661vfmj/40EPB2uoqoigCEYGoFJcFoec5Dg4P8cKnPoXnnnsOH/vYx3Dt2jXY8XPMZjNkWYY8z6GVgmYGmMGwwpdICyIsLS2J/mDwwbvvvvubfvzHf3yrJfUWnwnEG92AFi1atHijcPnyZXn16tX8qaf+yJMC8l+ePXtu6ZFHHlEPPfRQcPrUKURRBCFESea1T6UURsfHuH79Oq5du4btrS0cHh5iPB5hOpkiSRKkaVqQuspzZHmOPMuQ5RnyLBNZlond3d18d2fnyU984hP/+eu//uu/YHNzU126dKmdVtzidaEl9BYtWtyWcFbwN/3Bb3qnEPpfrK2sdh986C36wQcflKdOnYIbL3fWORGVLk1maK0xnU5w8+ZNO25+E/sHBxgdH2M6nSHL0oLEVa6glPnT1vWucoU8z00ZpYKj46N8b2/v4VdeeeU/fc3v/5p3Xb16Nb98+bJ8I/uoxe8utITeokWL2xFic3NTf+u3fuupaT7954PBcOmee+9RDz34sFhfX0cYhnNudqAagp7nOfb3D/Dyyy/j+vXr2N/fw/HxMaazmbXKLZkrBa0NiRd/qvxdEr0OJpOJ2t/bO3d9+9V//5Vf+ZVv29zcVC2pt3itaAm9RYsWtx0uX75MAHh7e/sfx3F8//r66fzBBx+Ud911J+I4biZzO/4NGFf7eDwuXe3b2zg6OsJsOkWaWstc5UUgHLMGa/fHxRg8s9nniF1rJaezmdrb31/f2d7+t1/zNV9zYXNzU125cqWV1S1uiXaMpkWLFrcVnKv993/VV32nEOLrer1efuHCheDChQsYDAaGyGvhwsylba61RpZl2N3bNdb5jes4dBHtBZmXRG4+bTCc/bO1zk06Z8UgIpnMZvkh83kQ/cvLly8/sbGxcQzTqnaeeouFaLW+Fi1a3E4Qm5ub+qu/+qvPzdL0rwsh9KlTp+Tdd9+N06dPQ0pprHNungDk5p6PRiNcv34D165dw+7OroloT5KSzAuXurXqrYWOGrGzZoDhWezslIBgOpvlR0dHj3384x///wghNIy8bmcmtViIltBbtGhx28C52g8PD/+aEGK11+/z2bNn6Y477kC32y3c7L7t7CxqtoFwaZpiZ3cH1155BVtbW9bVbqanKTs9jZ2bnZ11XtZFAMhuI7Ox/APbrwwwB5PxOBsdH3/tO9/5zv87AHX58uVWZrdYiPbhaNGixW0Bl171q77qqx5TSr0fBD0cDOTp06exurpqE8eU8N3jjmTzPMPR0TG2bm7h+o0b2N/fx2QyQZqlXgCcLo+t/RHc6qoAgQtzm+DIvXZ+cDAajfKjw8O//EVf9EVf1QbJtTgJ7Rh6ixYtbgtsbm4CAB8dHX0/EYk4itXS0hJOnTqFXq+38Dg/icx0OsPu7g6uX7+O3Z0dHB8fIylc7dWxcmj7ZxdmIUfkbDwAVlUAFXtgR8mN6a4BQIMYLEbjMZMQP/a+973vHZubm4dox9NbNKC10Fu0aHE7QABQX/llX/ZgmqZfB4A7nY4YDAYYLi3NWecOjsyVUkizDEfHx9ja2sLNmzdwcHCA6XTqpXX1Xe2lC50ACLYD4PZTEkESQdiGCTBMLB7ZpDUEKula5HmuppPJ3Z/61Cd+CIBuXe8tmtA+FC1atHjT49KlSwIA9kaj7yKiWEqp4jimXq+Hjp2mVg1M48o88SzLMBmPsbe7i53tbezumjnnaZoUaV39Ywsyt+PkggBBhICAQBCEJXNJBGGD6gtyt7+L8Xw7nj6bzdRkMnv/Y4899tU2LWzrem9RQUvoLVq0eLODrl69mn/d133dMM+yb9ZaIwgCEYYhOp0OgiAo5oZXkr94ZD6dTnFwcICdnR1s7+zg8PAQM2uda3+uuRsrZ7bWOEMCCAgIBSEQAoLMWGdABEmGwCURzH8lmbvZcy5wjplpOp3y0eHhD1++fHkAlCnhW7QAWkJv0aLFmxyXLl2SAHDt2rXfD8IdAJSUUoRhYMicgVzlyPNqNrc8z5FlGWazGY6Pj7G/v4/t7W3s7e1hMhnbBDKLg+AEGJIIoSCEQiAWAlHxSQiJIGE+A2u9CwIEyM5P81LNmi9C5bmeJcn9H/6N3/hLAPTly60Mb1GifRhatGjxpsbVq1cZAPI0/YNaMwshWAgBKc24eZ5nNlVrWpB4mqZI0xSz6RSj0QiHh4fY29vD3t4ejo6OMJ3OjKvdJ/NizrkJgJMAQgJiIdEJAnSCAJEUhuDJWO0BARJsPslY7cYlb6x7VJLcMACIZDbTk+n0z33xF7/zLZubcPPTW7Roo9xbtGjxpgYBUF/3JV8y/Pj+/pMAiIikEAIgglIKs9kM0+kUUkooZVYs1VojyzPMpjMcj0bY29vDjnW1j8fGOlduvrl2S6K6IDgTCBcQEAuBTigRSgGlDXlrBWgb2y6JoBhgApgNkSsY3cCNqwMExca7ztAEhk6SpLu9ffRXAXwzPouEzkUwfkMAvVmcpo2s/zxGS+gtWrR40+Ly5ctic3NTvXx8/DiYz4JICwOAGVmaYTKZYDQagYgQhAEIhujTNMF4PMHh4SF2d3dxcHCA49EIyWyGPMuMa57rY+dlRHssCL0wQC8MIQhIoJBr2zByLMwQANiu5JbDTGkTYDNtzfKnIDJrqZvZaiJNUz2dTp967LHH/vav//qv/zJMgNyJ66cbsmZz9s1NenZ9nQDgie1txuXnGLTB5MLyTxiaZ2bC5qaAPR7b24znnmNs2ONbvGFoCb1FixZvWmxtbREA5Fp/JQMQRJoECcBY4WmWYjQa4fj4GMyMMAwBmJXUkiTBaDTCwcGBIfOjY0wnE2R5DqWrGeBcEBxZCz0SQC+QWI4jdMMASa6R5Mai1zZoTnpkrmEs+plNB+umuJmxeIKnB7gEczpLU7m3t/c0gPehRqTMTMDT9OzTEHgCeOKJpzURabuO+0LSZb4iPv7v1sLl7tvDCQ4CnWessoSHktW5//bJhDY2ciJiLFAe+Jln5LPr6/TEs89q2tjQTWVafO7QRki2aNHizQwCwI88/Mh/0ax/bxiGajAYyNXVVZw9exYX7rkHd58/jzNnz2A4GBbz0bMsxyyZYjwa4+DgEPv7e9jd3cXe3h4ODw8xOj7GZDLBdDpFMpsiS1LkWQpSOQKt0ROE1TjC6X4PJAX2JjMczxKkuQKzhmBGCIa0Q+QagNKMGQNTzcgAZGy3A8YtD4bWDF1Oj9OdbpfWV1a+5EN/+A//0gd+8RfDb/yiL1JPPP20sqRbAT9zWb6Ir14XkTgvAnlBk7ybmS+A6A5iXmPQKRAGBI4ZFBNRABTjCAokJgQag+iYguBVMF4WRJ8G1EfTNPnYvcf/x8v01GZB9MxMzz77rHziiSca29Pis4+W0Fu0aPFmBQHgL/3SL13funnz48y8HHc6PBwOaXl5BafXT+POc3fg7LlzWFtbw2DQRxAGAAO5UphNpxiPxzg+Psbh4SEODg9xfHSE4+NjjMdjTCcTs8LabIYsTaDTDKRzdJixEkrcMehhZWkJu9MEe+MJRrMEKs8B1ghsIFxEBMGGpBUzJlpjphkJEzIAOQi5tdCNwc7Fp2bOScpABMG/3L5x4+v9C3/hZ35oJZLL92csLhLzW7XiRzWrB8F8R0BY6oTSBN2pHDrPoZVZ7pW18yKUPgEiAkkJISVkEEIEIWTUgQwjUBgjY8Is1zMRRi+RoF+RJP4j9OS/nH3yqU+49jA/I4HLuiX2zy1al3uLFi3elHDj5+Px+AsALIOIBQlyc7xZa8ysW11KgTRLEQYu8t243KeW1KfTKbI0hdaqXFQFKL/YgPQQwEAS1jshTg962JnMsDuZQgmJqNtFOp1CZ6lZhY0IQgIBzAprxIwO2FjkdpEWbSPftXXLp7nGNMuQpBm0UkEvCnBh/fT7/tpf+FPf+LVf+sWdyWz2JQDeoWb5gwlPzvYCAdIZ8nSGbDZFlswwThOMtVKAZmhls80yEQAm80kkysskghDEIDMET0IyCcEQAiQCIIxEEPU6cX/wcGdp7WER975lrIPkxtV//d+EkD9+cP3j/5roqW3AEDvRU04/afFZRkvoLVq0eFOiGD9PkrcBAAGKBAVCiCIzXJalGI/HIEFI09TOS+cioYwj9TRNbRCcqcgoBeVMcTNNjdElYC0KcH5pgGujCT62cwgIggxDdLtddPt9JMcKbFPFaphEMy46XsMoBTkYGQOZ0piqHLlmSCmw3I3xBXes48Hzd+DivXfjCy7cibvPnAqW+t2f5skRenmKdDZBMhlhOptimmcKnDMzE1jbljMBLOvryjGMUlLJKw+zkV3aOvPdTqeTJpgvkUjpgLNDweOboUbQoaA7iAenzj4ZLq09uXzmvq2tZ//1Px6Pdv4u0VM3QAD/lSuiHWP/7KMl9BYtWrw5cfUqACBX6qJmhhQSQgiYOejSEnqG2WwKAEiSGQIZAuBKYpkyV7uZbCaEAAlRZnGDzc8OoC8I9yz10e9EeO7F65ikGYQgBEmCPEkw7HYRCAGAobQyUfKBMMFxmpHmGpNMYao1SErcPeziwukVPHz+LB657wIeuOcCzp45YxaTURmSyQiz8QHG+6/wKMs0dM5gTcxaEBvitguuw326RWGYqmOuxkI337nkbwBUbCeY7Ddsc85TQfCCmIggpICYIpsd88HxjkbYRby6fmbl7N1/CcP1b7/+8//87/zDr/hDf5M2NnJ+5hlJTz11YmR+i9eHltBbtGjxpsRVt2AZq4fADBJEQggEgckQJ6SAUgpJkkAphSAJIaWx3jVzkdLV/RlFwCgDgggkRDH9jAiICFgLJR46ewovHBxj63iEThiAlNmf5Rlm6QzdIIDSGlmukWiNSUroSoGlkPDASgfnVge45+wKLqyv4K7Ty1heXkbY6UAHMTJOMLv5EsZag7UG6RzQuZnErpVk1t666tazXZlXzpXhgiJ3rLXbPT97uZ/cP64qqhI9CZt3viB3QAhCLiVlU8zSMd/cu6k6a2fPrt5131//0x/8F1/9bTd+6zvpqad+84MfvBI8+eRG/rl9Em4ftITeokWLNyMIgOYrV8RDP/7j55kBIQRJKREEAcIwRCADEBGyLEOe5xAihXPHz1VGxjIPZIBAyoLUhXO6M9AD4+6lPu47dwq/+OlXofIcQhCUZkzZRLAnBCQixTCUWA8F7h50cWG1h3vOLOP8mVWsri6jN+hDBKEhfaUwmkzAkwmIBCgIIERQeAhYa4CVzVTnCFzb6ea60hkobHN3TSh/O2vdTkQnZ66TXc2VvIrY5p6xFjqIPTe97T9NYBKAygGVE/IkmN6ccnK0r1bvfsvvG9zxyP/54v/+d/74vU/+2Z/+4Ac/GDz55JMtqX8W0BJ6ixYt3rT4wn/zb9YYfNYEdhlCD8MIcRwjjmOTEc4miTGkT8X4uBASUhqLXkoJKUwqGJmb32SXRSObg30oCfetr2LQjfGJ3UMcpBqac8TQOBVK3NUP8NBShLcsd3DXMMb6MMZw0EHU6YDiDnTUBQMYzVKQUCCyS6q69G2CgZzBQhkrGM5i1uUa7IVrvTo8zXZ5Vn85F2e4O2u7WtqAKqqA+20PYkbpt6diLXcuXPHatEMrQGUglROrLNj75FR1z9273Fs/v/niT/zNb733ySd/orXUPztoCb1FixZvRhjmSZLT0FgmaSxss8JajF6vh263hySZ2XHyHForQ+QkIKRAEDCkjArL3JF9nmWW4GW5DCqA03GAO9eWMU0TdFWKr72jh7eudnDfMMJdgxBrnQBRKMBCQBMhJ4GMGXmWQ3ACqQERaxBriDCygWfkkbZN2y4IELJYN90QubaWuSV0oPgsAvEtg1MR/cbGmrbb2V8Mxh1XMc9dJVbLgONz4Z3TbHSBc0zankOCWQE6hwDL6fVPap1nGJy958c/+Y++jx94cuMnbQR8O6b+20BL6C1atHgzwvAR0brNDMdCCAqCAN1uF0tLS+h2uxiNCNPpFErlyHNjIEohELC1wokgZYAwMi56IQWyPDNj8NY9LwiICVjvhuh3I4QqwcY7T2O5F4OkycOea0auNSbauMZN/BhBEBsCBwM6B+cSBDNNjWy++eJiiABSJljdkbKzlFGz0AHH4NY6p2I7Oz4mM5/dC2YvCZy98XNXZVHQs8wZYGjX2SgiBW2WO7Jt1KRBLMxMOQCktUi2X9IkpO7f8ZZ/8tzGH/wk0VO/yM9cln5ymhavD+0qPS1atHjT4fLlywAAlWWnLfFqIQSiKEK328Xy8gqWl5fR6/UhpSyi2vM8R64UlDYuayEFoihEp9tBp2P+4ig2bnghIOwSqD1BWO9FCAOBQGWIOgHGzBjnGjOlkWszz1zArKJWZmA1BM9aFa5prXJAZYBSZgxaK5vwRZl1261SYNzZ1jLXNhjO/3PR7ZZcK5+olQPml4Ctl3EL0PjHV8q4NmjPY2A+qdiuwHkGzhMgnYrZzRcZGtHSw7/nmY99+1vWxR/+acVXrrS89BmitdBbtGjxpoObg87EqzbIjc34eYjBYIC1tTX0el0opbC3FwNAsRQqAASBCZgLZYg4jtHrdCGDAEEqkSYpwjCAkHYaHBH6AljphJAEIE8BrSGlG+curWNnNZMjQa3NeLhWYC0ApUCUm9KSzb5i3jeBiAEhLPG6fWW9JdGi/G13kz/27VBEwtl2FVY6qia6s9Cdec/eNbl6/NMW29hevzDXbL6ClWmbIMjRq5/MT93/1gvZ27/8J/4Zf+IP4NFHi5a+5hveAkBL6C0+z8DM9NRTT4mLFy/OhxpbPProo/zcc8/xxsaGP2DYosU8SK4IUmAiSCkRRRGGwyHW1lbR7/eRJAniODJT1dz0NOvmFkIgjEJ0Oh10ez0EQYBUSsxmCaIwQmAj3SUBg0BgEEmz7qnKDXnWSLZYzMWRZvGnDTlrDZAGK1WOWwsuI8fdnG8GbDYaO+pN8OeXw5J3OSpu2+GTtT9azuX+YsicqVYeHpmjGEOvEjw8d7zns7fXWMTPeXnidJaAaBTsXX85P/3AO77q0e9+59+lp576br5yKcDG1TZI7nWiJfQWbziuGBebAGBWhLrFMpC1Y4Pnn3+eNzc323SSLQCYodunnzojnr5yJfjzP/3TQ+sMhpAScRxbQl9Dr9fDZDJGp9OFsFavy5VORAiCwFjnvR76/T7CMMRUSkxnM4RhaKauCYGACAMp0AlsoJlWJYGbFpXj0LWGomKpaxtEZlzp7C6GGCyclS6MlQ5py1M1aM1znwMoidftsoQ7H/Ve1599Qna7fYUEnvVOYOKiyLy1TtXzWkZnDZDKgWwGfXgjOBg8kq9/wRf9mV/7lmsfpo2rP/rBS5eCJ6+2pP560BJ6izcMly9flhcvXuQNkwJSA8CVK1fWtNYPhJ3wQcHirkAEKxo6ZqKcmA8B3FBKvRCG4Se+7/u+75WNjXKqS62+FrcBGCBcuUJ49FF69rnn6AlAE21oYDPdAPDQ/W9Br9cFwAjsGPpwOMRwaQn9Xg/jsbHUpZSmPkuELgFNFEfo9XoYDAYFiU+nU0RRZMfRJYQg9AJCKBxh2XFu4qr72pygbLxlQPZJXZgod7Y51kEACwa0s9IBFsaaJ7FoqNlXJPzpZLbDyFruXgCcs6gr1rlflyVqmrPsS2uc3f6KF4C9djAAUe621wmVg/IE+f51mZ56WA3P3fPDv/Fda7/xjn949Rf4CgRtoH2fXyNaQm/xO47Lly/Lzc1Nvblpolm/93u/96KU8qvjTuf3dzqdxzqdzunhcIgoioqc20oppGmGJJm5ZSvH3//93/8xrfXVIAj+vw8++OB//mN/7I+NXf0tsb85wcy0+dRTYv3iRXri0eeZntpUMEMvBX7zf/tfhtP9/UfOLw8f+8F/ffV9/+mF6wjDUDiXe6/Xw6DfR6/Xw9LSEnq9XkHoDsUUt9i42x2hCyEwHo0RdzqW0E00elcKSEGGlHXpYidriXpXAH8ieDG2zXaBFm2s9NLlDkDbxWRsyliyAWisUZC68ypU3PxA6fqe78divJx9ovas+IoiUuxmUJkHFnWr3Tfcy0JeJaztVDwBcoFzKgcoBU/2KR2sUXT2wTB94dd+6mPf89jjwP+we+XKhthoSf01oSX0Fr+TILcCFgB815/8rq/r9Dt/stPp/F/uuOOOaHV11c4P7nIcx1oIycwaaZpiNjNEfnwsSGtNeZ73tdbvVEq98/j4+M/+wi/8wgsf+MAHnllaWvonP/ADP/BRoFQc0Lrif1fCWd/P2tk4T2xsuHW1/TW3xcf/3v/tPs757bni9zDnX5hv3Xw0UOpORoa74gAUhIgCKcha6C5avdPpoN/vo2ct9HL9ETPeHoYhup0OBr0+Bv0+gjAEEaHX76HT6Xhud0IsTcAas0u5inJcu26Ve259Y5mzcVlbK53JzIcvhqqFMPFvdhp6SeTuXB6p1/uwEuxGVe+816T5g8tQPjdaX5+DXrK3X5DB1hVQT2RTegSM1c4aIFZmEr/OwekMGO2KfO2+fHnvhXv3E/wwbWx80wevXAo2cLUl9NeAltBb/I7Akqva3NxUf/SP/tEvj+L4rwxXhpfO33UX1s+cwdmz5/LV1RXqdrsiiiISQkg3lWg2m2E0GiEMQyilMJtNoLXm6XTK4/FYTyYTobW+TwjxF/f39j7w7d/+7T81HA7/xt/7e3/v4/653+g+aHEi6MqVK/T0o8/Ts89dpCcATRsb2lrfhTD/2N/9vvUsFV9AOn93rvXjH/7BP/cOnecP9ARFHZ0jm00xm02RzGbYFlployMaDAZC6hyySCzTQWhd5p1OB71eD6El6zJLnJ3iZsfPe3YMXUqJ8XiMbrdr3O52HD2WwuNDKsew3Vg60RxxFnPAizF0e5xmgMxCMCxMQBlp+10zSGgwEwgarAVI6LJSW4fxeFsyL9rl0zNXCblpzLziOeeS+euruhTVFz5773Seh8CRue9JIHN9Jso/h5ocIly7Kxihm/ej7A//+rc98E8e27j6c+389NeGltBbfM5x6dKlYHNzM3//+9+/MpvN/kYURt9515134p577tEPPPAAnzlzRiwvLwdxHBfThZjNildpavJrp2kGZsYsSTAeTzEajej4+JjG47GYzWZIkkTnea611t04jv/Hg4ODy3/kj/yRH/6SL/mSv/7d3/3do0uXLgVX2wCbzxswgzafulxxnW9sbPCGV+bTz/yt7uTFnQe10o8plT+uWb9rvHv8SAReDaEh0gTJdIIsmWFfZQqamVkTbGw4B0LGkrA0GECls8KNbvK4y8IK78SxJXQBwBC6DIJiznq31y0InIjQ6/aK39LORw8lWZLUpTvID4yrR5ezHccmlNHvmu3UMm2Sx9i2QMO44QGQALiIiBfmSj0+97KqV93lBUnXx/DLfeXceLPTTTjzhwjmSL3B+2AH24vLdpqBH59X7tcgDTC0CSZMp9BZArF6h8iuf5Q7y2v/6Be/+uhxemrzxpUraF3vt0BL6C0+p3BE+rVf+w1ffHh4+E9PnTr18N13360fffRRfstb3iLPnDlTRBALL8jHrHaVmyUriZAkMxwdHeFgfx+7uzvY293F0fExppMJZkmCLMuEVkpozXx4eKilkMP+oP/9P/dzP/f1Tz311Hc/88wzHwSKHJWtC/53EGXgmrG+ny0D1yoW1yf/zl+8MJvot3KevYe1fs/+R154K6v8np4Agiw1aVpnMxylCUNpZadmCZjs4dVlQgFoCPSIsTQYYDJm5KzhFmcRdinVwBK3sb4FVG7GzwtrPo7NtDVL4EII9AfGYu90OgiDACTNXHSCi5InS+aokCrbgDRnCbskLUUgmRt3twF1zBrQAAkJy+rV/UJbA1i4UxT/+kZ0MX2twSdPbmONiOHG2O1337Ve1O1vr99xL/K9MuxQnwfvWsd2up7IoSdHCFbOi/GnP6xWTp27Oz2z/ZP8zBNfhU3gaWy289NPQEvoLT5ncGT+3ve+95uUSv7J8vJa58I9F/LH3vFY8PDDD2N9fR2dTmdu/NKtHKVBUEphPB5je3sbr756Ha+++iq2t7ZxeHiA8XiCJJkhzTKoPIfSGsyawJAA8Xg8UlEcX+z1ev/xa77ma6787M/+7A8wM65cuSLagLnPHfzAte3nn2fanA9ce+GHrqxMx0ePAHgX5/wepbN3Ht88eLAjqSdVhiyZITeeF0xVrqCZAU3azMAmMAcACiuSC7IqSUQT0AXj1PISwGbVMiEEZGDyspu10WVB6MKmWvXH0GNvvN2VGfQH6Pd6iOPYjKuLcuEWMIOFtGqjx+h+kFklaMxa1ZU56Sa4zqoIADQgRDnGLtz4u3Pbc6kwAB5plhHoRa5XVD8LJWNuLLyJr33FoErKgEezXrAc+0pCo/dAeEMOdrpeOgG665BhLA+nWX761OqTH/r5D/2v79j86Pc+c/myRDt8thAtobf4nMCR+Zd/+Zf/mTzPf2RlZQUX7r6g3/H2dwSPPvoo1tfXEUVxseBFE5RSGI1GuHH9Bj796U/j5Zc/jZs3b+Jgfx/j8Riz2QxpmiJXqly7utT+SRAFSZrqyXhMaZL+1a/4iq941/333//tGxsbh+24+mcHzvp+FhDAs3hy4+p84NqP/mj4Wzc/cT8J9fY8zx+HVu8+2rlxUSp9tiMYOk2gZzPkswQHeaahtbauc7vQGMtijBdcRIa7aVjsjfFax7cpJ4AuNE4NBsjBGE8mNvd6+cwJQeX66DY3e7FUql1mtRMbMncu926vi/5ggG63izAMwVKU3iUTsea52lGJOuPiq7XOHbdWEs141rr/201VcxHxkEWf1KPRK+PXTYRadabPkXR1mZayf+fM/Mp898XWesH37OeVJxMvIFw5uzJbnoK1hlxaR757XR51+2rQFX/uw3/8of/jbT+2+V+fuQz51OZrz1VxO6El9BafdTgyv3Tp0p/USv1Ip9NR58+fF29921vFxYsXcebMmcJ9CaAQruwJJq01JpMJbty4gRdfehGf/vSncePGDezt7WJ0PCrJPM+hlAJbMneC1LkZSZAQJHh7ZzsfzgbfkCbJhW/4hm/4+s3NzVdaUn/deE2Bax+58j+fCzC7mGl8IbR6z4df+JV3sFL39SQFocqRJokJXktTHmutAIbW2uYxZWEGibkYfy3GYd2HG3cGqsFbQGUMWWtGVwDLvQ6SMMD169fNIR6hO2vcEbqwWdmk746P7Li7je/odrvo9/voWis9k27lM1gLWqKwfv3eq7id3XW4a5gndLLWOmtj6ZOokryZQqbBEDYC3p7TmtauasfDVCH7Ov3WrGdq+O4XKBQIz7J3N4K9A/wxd9eIQs/g4v654Dh2+eyTCeTSOeD6J4mHpyGQQ/SXfuQjF/FFj168kjM2Wtd7A1pCb/FZhSXJ/Pf+3t/7DUma/r+6nY46e/asePDBB6lO5nXLnEDQbNJvJkmC7e0dvPCpF/Diiy/ixvUb2N3ZxWh8jOlkWpJ5rqC1KsicC2GHIl0mEZEgCg4ODvIkTd+dZtnPf+3Xfu17Nzc3X2hJfTEqgWvWdV4PXPvIlSsDknsP6iR/FxjvYVbv0uPdhyCw3GMNlaZIkgRpmmA/z5ThZ+3WKSECAkdSBRnb8WdfwWsK9vKfnpJ3SutPMyMCo8dsFmFxc7aLqVxV97qU0gaHmbnlbnsQhMWa6ERUTnfr9RBFMVQQGtcxzGIkLIJiHL3iXvfGpN3AQDXozLqptVty1LrUHdkxQG4cndm4qNlOXyNL5EBp9hee8NqyqOTc7Vx9BxcZ2e64pv3+NRYU62tYnmZAXp+4oDt3f11kP7GJeM9mEJ0lgHMAkOPpLD+1fvaxG++668/QxsYP8WVItFb6HFpCb/FZgx2bVl/2ZV/2tslk8v8OglAvLy/T+fPn6aGHHsKdd96JTieuBL/5cIJWKYXDw0O89NKLeOHFF/Dqq68ay3x0jOl0aiy8PC/Hze2iGsxsXO6O0AFD6CAoM2YajEajPM/zh5TK/uP73ve+r9rc3PxUS+q+6/xZO+f7qjJG3qY35/uK+PDTh/dKnb6NtX6PyvL36PHLj5LO7+pKAeQZ0mSGWZIgyTINZs2siZnJBke4dGyFtWq8zSVZ+x4WV8DbWyEdJqqQjHPFO6tQMxALIEomiIdLkEJUFmABUKR4LV3upddIWFIPArsIi1VCwzBEv9fHYDBA1ImRBCHAEgDbxDABWJjEKWzdzVS/liIVqj98QIVL2gy/26A3232la77oOEOK/mIphfFfkniTgV0dA28qUyXlClfPkXql4uq2ihbA1eKVczntw9wfylMgXoaMutDJBASIcaI4Wjn15//Du6/9Y2ziiD0VooVBS+gtPlugjY0NvP/97+986CMf+gkBMeh2u+r06dPy3nvvxT333IN+v18RmD4KQrau9mvXruFTL3wK165dw96uIXPjZk+QZ1ll3JxZQ1u3JLvoYlgZp2FIXQParIwVTCbjXGl1v1b8777hG77hic3Nzeu3W6DclStXxNPPP0/PzgeuFX3wW1f+3Glg9ohK+d1aZ49/+M+/9JhW+oGOQBxojSxNkCQJkixFonVuvSPEJv2JXSm0JG/AErYzIIugMW/c27GG/fClNdc2VmLLnHQnsta+IUUpCMF0jJCMC10Vz0xppbux8kAGxcIsACCIIIQscrY7iz4MQ28cvYdJEIBzN2KgoGUHEAEoT00vuOv2aJPr37jUSkwkuxuLN5Y3awbJ0uVuysBMW3P9WHQIlR1k63RWsY+FhD8Hp17Vybpu1FPDubzxcv9m2mGGapY644kw2eMysGbI/jKSwyOESyticrir1s/ccUf24LU/Qf9992998BICXEU7FdVDS+gtPitwGeA+9KEP/Q2t9duCOMiHw0Fw9uxZ3HPPPVhbWyuj2RvI3H2maYrt7W288MILePnTL2NnZwfHx0eYTqZIkgRZZizzMghOG3edc7kDVuaXpkSR5lIxNBEEi2A2mebQ/NCLL774L77jO77jyY2NjRlsos3fyX77nQADtHn5sli/aJYUfXLjar6xsaF91zn/3e+JP76XPqBSekxl2ePM6t3p4c4jAfTpDgE6S5EmKfI0wZHKlelqTWCzdAiAoCRbLu+B/Wk+akRdscbZ533vMC7L18Z1y8Qs7ncZF+6mhwWCEE0noDRBGATGq6NUI6FLKUGifGZAVARt+uPuUkp0Oh0MhkP0+n0cxjGUlmDKzbg3EZgCAGmpaFR6wDGhZ6WzyxZXHV8vguJcXng40gOYpN3sW+nwrO95qp7fYo+recabijkrurgKtlRMXoO9+2E7sqFNXJYpPrkoTi7RjMpB3WXw1qug8E7w9FWa0b0se0t/9iOXxY8+urk9bq30KlpCb/HbhnNZP/74479vMp3+XwlQ3U5XLi0t4c4778S5s+cQd+LSKnfWClXJXCmFo6NjvPzyy3jppZewvbWFo8NDTKdTJGlqhHGemzFz62p30b+OECok4I2luzFZIoJiBgsRTCaTHESP/9Iv/dI/JaKnvuzLviy4evWqMxt/V4Kt6xzPP0/PXtyiZ/GECVyrDSl89Pu/8y6l+VHO1Xu01u/5yCcP3qa1urcvSURaIUsSJGmKSZbxhLVZvZrZZF4Biqhz9vUffxzcb1ONqblSvmEPL7gBDNRZnysZ2Nirwo5RC0I0G0NMJojiGHmeI8uyktCFgAykTRJTTp8s4jGAOUIXQiCOY5MPvt9DEMfgRAIuPzkAJUPIzBKg4+HiMpw1XSNS94xyaYkXw0eO1yuKjDuIir6v5FF3fUPzRN5I7Av2VItwUaRIPOMrIP70OPPylccW4w5UtpvcrAXyot3Z5sTPIaI+oFNbRonJeKJW1k6f3x4ffR0BP9la6VW0hN7itwva3NzkZ555Rm5s/NUf0qzQNfN2aXV1Fevr61haXoIU1cUvKgFP1tU+m82wtXUTn37p07hx/ToODg7smHlaWlZKQSs7X5WrC2Esqt/89j6ZoZghBAXj0Sgn4PI73vGO77969epf+92WUa6c871F28+faZjzfRW/8he/YznO+SHW+l3E+eOs1TtnR8cPdgiDgDVUniFNU6g0w4HKFWCsb2aygWscVC3q8rvfyU3kzJWfVQKvBr3Vj6yUmi/neIXt0qKoD9cymASIgChPEM6miIOgIHStTXo1AhAGZkqalGWWQtY8N94OlOQeBiEGgwH6gyHCuAMtzLg5lDJDQEGEMmDM+iBqbvc6iRqipoKny2JOx6ywuve7RpKuSlcWtbqaBsFLHXtR8xq3+8pZ8UFe+/3z1Yx0116jBPgaD4NhFm2hsAMiQKcpRBhDHe+A1k+xCKP/EcBPPvEENK6ihUVL6C1+W3Cu9h/8wR/8Fq3zdwNQYRjKbreL5eVlrKysII7jhcc7SyjLMhwcHOCVV17BK9euYXdvD+PxGMlshjzLoPPckLm1zLWzzuHJG3ZWYykNizmvvsyDcWVqJghBcjQa5yD6gfe85z2/ePXq1Z//fA2Sc9b3s3hW4FngiasNc74/eCV4/t/euI+z9B1aqccB9W4+Or5I0Od6gsB5jjRLkaQpjpUqAtesWCWApeGC0lHBxSdKkqq3zWfdeqvnvjba3w2HNdj7hQu3nJZVboMJQoPlEG0s1lDniJIEvTjCTCkkSQKljN5C3nzzMAyKGA/N2s6gsClXPRJ0qWF7/T6GwyGibg9KhmDYcXStoGUMx3gFmVsSY6CI7SgulowLuzTauTiG3FizZ/wW/VPst+76plD0gqzn9y2cPj53LxrKlbeicp/8xdqaFQtn0pcfLhjQzBQgkw1PZSARQsgAOp1CxgPkR4dirO5AFHe+7Fe/5dxF2rjxfLvEaomW0Fv8dkCbm5v60qVLnRs3bvwVZuY4jigMQ3S7XSwtLaHf7xdR7b4L03e153mOyWSCra0tXHvlGnZ2tjE6PjZknudQNgWsVspk0GIz58l3PToZ50b4nIDR1mTwXYPuKzRDMRMRi/FoBCL6p+9973vftbm5uYs3fjzdzPm2rvMnnOu8Frj2oe/7wFmajS4iy76QtX7Ph/7Zx94Bnd/XkyKUWiOz5D3Lc54xK+uadVPGTOCaI4+6VV3/VlichKoI9+ARfqUELzzCszrnjqrpA/M1FGTgBdb5s6OYCBIKnSzBcHkNs+kU0+kUeW6cMAQgCALENp+7EAStNZTKkeUmA6H/3NovkFKYcfSlJXT6PXAQQdsxbdIKOojAJMpLctevSyMaPs8VJFg+yeUVlkNVbry8nHJmDywsdmfxOvgrrJH370k8voDl3cXMxcBUK3Sel2IWQnmw/VpzBbgqffPeDaUFAhSE0OkE1B8A2YRUmufLS0vhdDr9RgDPP/vsG/6uft6gJfQWnzEuXbokr169mu/v7D/FzA8xs5IykI7Q3SpWQEnm/neTr10hTVMcHBzg1Vev4+bNGzh0rnY7bq6VTTjhXKBs8lmTpxQ4q5KB0oqB55b1LSy/rLHoRZZlajqZnH/ppZf+nwAuWyv9c9p/Phhl4NoT1nVenfN9Fb/+vd/b7+q9t2RZ9k6t+HGwfhfv3Hg4JF6JCNB5hiTNkGYZDrVSVrISu3SpQFC6uReMX6NOJ75ZiFKoOzgu8Y9vYO65s3FZL3sH+eRQ1uMzhmtHlUVKC9UrYrcF0IjyFIM4xu50itl0asfRDUkHdgW2yAbGaaWgcoUsy8z0yPpUN5gI+DiKMRwM0R0MoKIYWgWAFiCdQwddaBmaSHcum1t1u7tAQCrd3R75O0+0NfELIi3GqisBc34FpfXraQpeX/r75+9UeXIfXuGiLbVKqnqE9Rx4yjTgud+dEseFtwXFddkfWoFZgIIIejoFBssAaajpMeX9AQS23wfgB5642s5Hd2gJvcVnjKtXr6orV66In/qpn/qAUopdpHAYhoiKFayomCrkBxe5cfMsyzAajbC9vY2bN29gd28X4/EYaZKU4+Zag5VxsQtriZB1XbL2AoRgZIFmoywwUExD0p7wqVAU22A6gpzOZrmQ8g899ra3ffPm5uZPfa5c7+xc58/aOd9XryoC2A9cIyJ85E99+z2asrdBqfdA6y/UBy+/dcbqQl8KQCtkaYokyzBWSo+t69w4I4gIXAQtFHHJxYU3MG4xMlH2Y6XFpRmFKiedYK37x3PtN046zi9PjdvL3ezTY+G29k8jiBFMJ+hLE/zmlEVmDSKBQJplVMPY5EhgAEqZZ9MplXMgQhiFGAwH6A2GOI47ULPALKSicjAJaBlDpgnMFDpPYXHuA+uVKALJFhjmxdW7QDkXHU/l7SzGoZ0Vbve5qt2TX+i1DWTeMGW8pghUb0XlS0NofPF+Wd97WZVP5rUqnDLBDNgZAxR0gHwMQICEhJqOxKy7hiCS7/rVb77rQfqpax9v3e4GLaG3+IzgyO5nfuZnfq9S6t3MrIUQ0qXRDG2iDqUU8jwvXJy++z3Pc0ynU+zv72Nraws729s4PjJpXfMsg1YKrM0fWEOwhhsnN6xI5fppMALdpYZWAJQVGDYJbCFzFJdWIdu2WCEjppMJSyH+9qVLl/7D5ubmHj4LrvdizvfWFm2fOdM45/ulP/WnVg/F6BHk+btZ8eOs1WPZ5OAtXSG6ATTyPEOa5UiyDPtaGwUATEwQhevcuYb94LU6gc9ZvbaM9spX4KQ8Ff21sJ6545pLFK27Fa/7pf1LqARaFbHWlh89Sx1GsRMEhCpDj4Bet4vZ1KyX7tzWQSDR6XTRiWOTLQ5AlmdIksQ8i3leBMj5SZGCIEB/MMBguIRx1IVKQ0BKiCxDzow86EDwgXG9e89oOXBctcr9vq+oMYwinWvRddYCLiPoqHZPFlXmeQNeC2pWdyPmxsfL81TqaFImPU8Cu3faXhfb6XkURACbqYYkJHQ2JaUoX+51o51k9JUAPt663Q1aQm/xGcG5o2ez2bdawaiFkMLPi621CXZL0gRRFAEoCd2ldz0+Psbe3i62t7dtVPsEWWqClrRSgDKR7GTd6gRAFlOI2AZBOWI2ljjbMpklc+VKcLnG85xcMRtEnuf5dDY7d+3atR8A8F0AquH5t4BvfT9xpnCdV+Z8f+x7vidO8oP7dZY9xsyPQ6t37U1uXAyA011BYJUjTTMkeY4jpTQB2mRbK+w6OZ9JrRSk7LPFAuKtGGB+HXVyLUxAd3GopOpe2AuuOqpzNvuzyxaQueeWrRUpyLwSaFUqecY09ZUFM7ouVIouM4b9ASbTKcaTSRHwJmWAbreDbqeLIDAiUSuFNEkLa96V9dOlCiHQ63YxWFrCbq8HNY3gkuEJVlBhx1jnZlZluXCQJeDG+d4LWLO4HHfZnquavEPNO1K19okBiJp/yt/fdKKTGlH8cF99E5tOKF8LZJwPIKgeWljpws5LVyApwbMEOktBUQeE0e8D8A+2z9zSTXRboCX0Fp8JCID6ki/5kuH169e/hpkRRpGQUhRZtQAgzzPMZjNMJ1OEQVhYOGUgnLHOd3Z2sbe3h9FohCRJKguumCA4DTvLF1IAAQljVLKGsi53JsP9TiYoZkiQJXgjwJT3zjvhVrhAUZC6TJKZkkL8ibe+9a3/20c+8pFfgSH1Ode7I29Y6/vZJ65q2sBc4Nqvfecfuytg9Wiepe+B5veMD155G2t9b18KIdi6dvMMM6V4xlBGwLGwBC4YEBX5eaLsKo2UmlHXeBOLlcqqHVO5SPfpGVN+DxREeqt86349i1CQf23MurLN+yzaZJW3cj/5TYNUCYLpBMNTp3G0NcZoNEKe58W6Ap1OF91etzJMlKQJptMpZrOZmSpZbysR4k4Hw+UlRP0h9FEH4NCsiKZSqCCGhgRYVVISz5N5s7ua6r9qrF4Y5/YZLgPqjNLxWoiaqGEXVw9w+RtOqqd6HKoPXnFb7A93wxraVuR39610u8SqWW0uAPQEKklE2o8AwY9/5PLF6K2bz6dcXs5ti5bQW3wmEADU7u7ukwDuBKClEEI4Qrdj5EmSYjKZYDweF2k3pZRwGeGOj46xt7eHvb09HB0dmWClNC2i2V1Eu2TzoIaCEIkAoTXQMibk0OWyqdY408wufBu+4HAWUuWNr5CDEf+sGUmayqOjo/+ViL6crSRiAJuXL4v1ede5wVXgY9/zPUuz8fZDSql3gfXjrNU79fHBQ0LQoA9A58Ztnqkch1orArG1voWVwUG1XbbuJtd0g6uhKF41cqsVkdcP9Tr93zXBPd8EqvSfN0Owob7FctZcRmlxVlz7tXb6bfA/yyld7i66prH16miI40MMoggEYHQ8MoFxMJZ2t9tBr9dDHJkESEprpEmCyXhsouJVXrHOAZikNVGE4XAJ8XAIvdsBqwhCSlCioKMAKoghZqNCqZzr25pRO4fiumrlqmxeTLer7q/3Mub4tGIoo16eyyP98zc9h/UdTdpk4Q4iE6rJVu2qXBfK62K2Uw+tYqGUIXQwOE1E2u2yFPK+WXj0MIAP4woIGy2ht2jxGSHLsq9lZhZCaMPnxtUOZ+EkM4xGIxwfH0MIgSzLTBSxdbcfHh7i4OAAhwcHmIzHZn5wnpsAOEvmxIwAQEQCPSnRkQJgINcaWgOK3AsvIMBgqEI+SABghk1zBoChYdz1ugjW8S1AZ/2SzLNMqSB48u0PP/y+X//N3/y3X0gUEJD5gWv8zDPyV39u875Qy7dlWfY4WH3haOvFi0S4syuMyyDLM6R5jpFznYOd8USou84Lg9cIQ/LJ2iPKClm7Y2pCuRK4VqfHk6ysSiXuhK5OX/rPy82mWDtTck4NmCfsQjmguTK+i76i59Q8toVSUZQrLXVJDDEdo0eEMAhweLCP2WyGpaUlCEEm89tggLgTQwqBPM+RpinGkwlGo1Hhdi+W/LX/BkGAwXCI7tIyVNwDZxFIhiCkYGLkcR/h9Lg6y8L3kRdE698Qqn31rVkvcryob/HNJK8//d8VzFnRps45/aNQljzLHUDlRarUy/Ptd/Vx7Zmt3Gx3wz1iB4ySD+udy1Iw9/SwG8q9w/QxAB9ux9FbQm/x+kEA1OXLl6Nf/uVfflJrTUEQCLcqlcvXrpTCbDrD8fExut0eQIQ0TSFlAK0VptOpIfTDA4zG41ognEvrqhGC0RGEYRCgFwQQzMg1I1E5kjxDpnRheZshPCvAmI273QUOFURmxt3JY0E37c1YOSaLXKo1ZuMJH+bqaSL6WQDZx77929enavwFucq/kFi/57//9I8/xlrdL4WIQtZQSiHNMiRKIQVysAaDnOUtmKzT4ASrtSAqz51clPIJrH5MxZ3pCnmmXaMVhSpXoEn0uvPZvb5WUQ7ovn6zyDsZsV+D5z2onLuKwqqHvwynT0KO3M2wiiCAZhNEWYZep4Pj42NMJhOwZggpEEURBoMBet0uZBAUEe6T8RijY7MwUH1RF9ghpG6vh/7yMsb9AZB0QXbddKFyqHgAyaatDK4s/uJuS0GyRCjC0+0e08X1G1UqVnVDf97gP1l7Kx4pNr1XKrflfH4AxqKunN+025B6/dmonb6mdbq6ikGRiheiXIHO8Hk5FZW1KobpOc/AilkGIUCzty+8wNsMLaG3eL0gAPzcc89dZOb7ALAw4e2VNaPzPEeSJJhMJjg+PgIRkCaJdb3nmExnODo8xOh4hOlkgixNyylqbFabCpkREGElDLEaxwhhpqTtzKYYZTnGaYacDaETgJBEIejcUqqO0LUVUGTdfX4ktAKQ5ApJbnJ8dwKJU52uvDDo49HTa1/4jb/v8Z9ej4L1/dHuWyPo1S5MUF+aZUgL1zkb2UYkbOWBE3mFD1iXbtBCzDbJWk/AlVZM+aNCcHXrzAtg8/JvVjUAX0s4oarq7pqULqSsf76Ga0Ep+OeaUuPpuSZWNBmeK19aca453srfXL1EQQxKJhDjEbqdDvaOjnF8fAylFIQUCEObyrXfRxgEmLIJ6JxMJzg+PsZ4PIZSqsir4GDG302CmVl/CXrcBaYRSAaASsFRD1pGQJYarcJdj5ekxpFjo/XsLoDgufw9Mq9Y66XG54+hu6fG6ZN+Z7PXZ3Ulkao8PNftROxNdauw8oJr8Ii/fj117dUNgXGZbwJagwKr6GgFrRRpI2/eDgBPtGlgW0Jv8bohAOh0NvtiAEIIkUspgzJ9Zgjncp/OphiNRgiCEKzZujMllDbpN0ejESaTCdI0LaYGAQBpDQGGBDCQEucGA5yKI300meGl8VhcH40xznPkWkMxQ7OGACEjYwEFTv7bXO8leRoLPFEaqVLItEYoJJaiEPetreKB02t4+NQaHlxewvlujBUwIq2Ys/wb8yQBZxlGKucJQ5l0qbCz4aiMhGebCoxMrvDSaKkRGnkyDkWhElwrvNDI8iwc7xwnwrekfPlbF6pz8nmBVuAE/yJZXmtPxetQO11T+TmrHQt8AjWCJ787CBAqgTg6xPDuFWzt7ODw4ABZniGMQsggsLnZB4jiqFBKJ5Mpjo4N+adJanO+y4qlHkUR+oMhDgZD4HgAmnQh5DEoS0FSQHcGEOkOnLh1Vnk58uIRvHHm1H573yt9TP7XuYxwVdRuZuWeNz8wvOiH05m4fqYqYS+GVU4rimf5VDgbnVxQHOyVsi49BlqDc0W5mWb40Me+5y0xbXwisb6LW70Bb1q0hN7i9YIBINf6cWaGlLJMJhNFZhlKO/88SRKMx2MrADXiJC6EYWLdmWZJ1Kwgc9gc7ZIZHRBOd2Lcs7aGOM/Ff712HZ88PmYBkNK6FOAMEDQEESQATYSACBrAVCvkIGgpoTUjAuNcFOGepQEeOrWGh9fXce/pUzizvISeDEzClukUyWSM8WyG4ywjoZUircGAILAb1i97g7gqFwuzhj2PQc0it22vjIfOuc19qVj/XiPvJiFaZ8raob7Yq+sE1Xp8M75+RNWG5/nNCyqt7W88zm+yb+fz3OVXztTQNSZIUoH3d9C/935Aa+zv7WE2m6Hb7UIKgV6vh6WlZXQ6XQghkCuF2XSKw4NDHB4eYjqbotfvFWujO4RBgN5ggHi4BDocgkY9UBCBkAAqh+otQxzvmqhHl3SXzGcxTFT59Gxwn8+ByrPhjFvyHhlrv8KroVkf9O/9LYxr1G6/r7j5/e3OUwyBzHmPavU7Xq8olVRZc0HALpIDFPPu3bQ9neeURxJEOHuwNTkD4OWnb/PAuJbQW7xeaCKC1vrtgDHRwzBEHMfodDqIOx0Is9+MQU6mxVS1NE0RBAEYQJ5lxRQ1t9CKIRSGYA3JwDCQuLC2qu9bWxMvX7v2oecODyMJPKK11sxmja1ifroda7NTfiEAhCAsxREurCzj/qUh3jIc4t7lJdy5NMRyt1MGP+U5ZtvbmNh1sl0wHunczReThUCxbSxRSsPCeekH3HnjzGVx3+LymZ5qVXomUHHcCebPrQTyAsJ0u+YOY3+v336vgHcgz31xR9emtM2d2+7n2qGu72osvVDnOOH6zDg6IzvcRTybIhIS+3t7GI9GWFlZARGh2+tiZWUZvV4PUgbIsimSWYLj4yMcHBxgNBpheXnZLLPqXbiQEt1uF53BEDxYBkZDUBhDyAlUlgDdARB1QDoDwSgDxXKs5H4LS/DOLV630MvfjvudnV+5CU5RQEM1DXeZQF6yvwWd23SPGzsZ8DP3NVn15Zz12nvjvydOO2aANQNc5gDwT6bznBQ6HAWyq3J9F4CXH33+ZN/Amx0tobd4PSAA/PDDD58aj8f3ERGklBQEJnXmYDBAp9MpMsNlWYbZbGqDa8yYpFkAQ0BrbclcFS+qIDPKJwHEYJzpdHDvHed4QAJnBH7w6Pj4v54aDH9VaX1Gaa0Vs8jYBLGBgR4Bp4MA93U7eGTQx8NLQ9y7uoIzq6vo9fsQcQwlJTJmHGcZdDoFZ5kRGDZwrlAOmMvt7JKhFDnJADhXPnlBddWOqn8rfhdCzXxUpw6dYHkzV8ssIu9FIu0Ewi84n2o7mk60YPMt8VotQK8tc4oAnZCYpr6RvJSrMEPYPDlGcHiAfhjiaH8fB4cHOHfuHIIwRBzFWF5exnAwQBiGmM2mSLMUo9EIB/v7ODw4xKlTp8xcdVlbH73TQXcwxKw/hOgvA50uxPgYyBIgJnBvGXS8DUhhrWph/wypg8jMXy/IHbWbQeXvQiEoN5dj5ouUPV9xLH9XLOxF8E3yYhzcflL1nlU4txbTcNLz6ji8Mesd6+KcToFhDUApANAdKeSMcA+AX1jfagm9RYvXCgLAaZreB2CNiFhKSVEUodfrYTgcIo5jTCaTIuVrkiTGjiC3ipWZi04gm2zDVCqFQCAEpCCEDPSFwJ2rK7w+XJLTmzdH1ybJfwHw6m6a/D4AH5Ra3zEk4gthQPdFEe7rxLiv08Fd3Q5OdWJ0oggiCqHDCGmaIaMpKFcQUkKEgR2nN+55rRjQZd4Y4zLkwlpHQeZGqNRlU3UurU/2RYXlLn/PnAXeLFmrhP8a4Fur9eNOIGPjFODyehjeFKUTzlMvMMf/PN+Woh1OLfJWSyt2NzCOWx610eavbStmOJQZAoXKQPs7GCyfxv5ohL3dPSRpiiAMEQSBt+RvhNGIkGUZxuMx9vf3sbe/h3Pjs+h1e5UUsESEKI7R6fehBksQwxVwdwgRHkAkCVSeQg9Wgck+SFgyFgIkCBACJIVnoRcMXf4uupWK87l3qtLVVLPlKxzsPXNz92CuI9F8x/37SJVNi56nykn8B7n2PBSPq0/wsBH0bjiOUYypg+1qbAyWUkCI7ELTVdxuaAm9xeuBAKC11g8AABFpKaWM4xjD4RCrq6smAI65GBtP09QKsPLtjaIIUghrhBCEIAghIIWAtKJ9JQpxbnVFD6SU01z9l41f+7VX/+addz50Tyd84JeT7JNdIe68M470WhxTh0xCcyaCJkIGQp4rSBhfeUAEktK0wbnDmYu11Z3gLwKdgMLqdoKlStRVYecLIrgaaq7F+bnCPus63jK/60XrekC1Cicoa2WaLPym0/vn8L6ZKslvXaW9TfUUexeRd9PvygHlDtfbVOtt5+1ZqGDMfbX1OoOSM/DhPpaWToHSFDvbWxiPx9bNLjEYDLC6uoZet4t9ImR2vYHDw0Ps7u7g4OAAg6UlSDtF0yGQEnG3i7TfBw2Xgf4SVNQByQmQpeD+MrjTh8xnICGNUS4kIAgkAmOduwucc/eU1nlB4m5ThfSdYmlpvaIIMuaWLa13VuUZqt/rxkLldsfqtftekr1nrc+d348lce22T54LjPMVO/ehlXHJm8CEs82V315oCb3F6wYzP2Dd7RzapSeXlpZw6tQpSCmR51kxJQhwpG2yyAVBYFZIkwJSkk0Va+awCyEgwQhBON2NsdIfiGSWgHe2H/mJey58SIbBI50gCJ/s9qCJkBOJHMDUTnMTRJAkIIkhYVyzxAxWCpxn0MJO3LECxAgEM9/detw9cvTJm1CuXlKibglVd3qk3giqfZbbuZjna/vb7Wkk9aqQa8QJ1nNTq3xdoBoQt+AkC4w5n+h993f1PA1KQsM+qjcFVT2mQuY1JcHvP4KGHh+hl0zRZ8bBzi4ODw+xtraGIAjQ6/WwtraKwXCIIAiQpinSJMHx0RH2dvewt7+P1VNriKOoHAcHIKU0Kwx2e8DSCvTSGkTnOuT4GCqbgZWCHp4CHV4vlEsiAqQESUvoQpTXbB/I0rj2LHZ3rEeRZTwdlWRfuw8FqQPNz0FFCfSUrLk6ah2+oP5C30Tz/koQqKuzohQDxNpa6E5JcePpsOPrroPoDAA8cZvndG8JvcXrBjNfAABBAoFd+3x1dRXr6+sAUKR6ZQaUMqusuUh41gwhCEEYAMwIgsCuzhYilBIBgJ4ATnW66IQhJZMJBml2b7cTIxUCObNKlHKRRCAis1gLDFkbY8Cu3MQM1gxWGjpXECKHBswkM0foyq2zXrr14Fnq1S++ldFMQoWALSXx/M5FBxWnMwlFygQctlmuXlSF5Vy1DRuL1hZzf72NVC/pb/AJYN6SboTfYLvBzTnmRiXH2WalI71O4H69zmonYq+Mt0Rs8eFRiZX9ggA1GyOcjrAadLBzdISdrW3cddddCIIAURRhdXUNy8vLdqnVSeF239vbw/bWFk6fPl243d2sDSJCGEUIuz1wNoReOYV8sAxxfACaJeB0BtUdArNDECtz84Qw5B7YZVftGHrpTtY2WMwZ6eSNu5O3zbnq6/1VptItk9fYe9h47z3Ul8U9qXyjoonKo1IY/U3um7lQd3+3Nqst1ttRetVIm+fqDADg4u1N6OLWRVq0KGDkg9Z3AYCQgkJr1ThCXzu1hqWlJQQ2AYcbN1c2ghwESDtn3U1zC4MAURgiDCRCIgwDiZVux7jRkxSc55yAtDa+VikYRNYq91diA3zu5UIwmkVelLXUFVjl4Dwv3O3MbBdR936XJrtnSYiazCHvDxX555e7hVE8Z+wUZMTlh1+UG44rb07zvrK1VJBbcZx3mVwpWy9Uv875KyM0G/JN7tZGDprruDKSe17BWnRktQHOYi+CGvMEODrECgFRnmNn6yZGoxG01pBSYml5CWtra+h2uyASdj76BIcHB9jZ3sbuzg7GI5MLvniuAQRhiDCOITtdhMtrCJbXIOIuRBAAeQoGYRotQQhrlTvrXAZAEJqUsUEIuG3SkbwNoLPj7pVgOu/JL6xzd9GeRsSVvmhA8fD4fwvKNe1qeigbnrPCe1Kpo65+ee10yo1Xtnw9zXurQQDzCgDczlPWgJbQW7w+aABg4BRgonvDMES/38fq6ipWV1exsryK4dKSXeTCELpL5wqUlnocx4jjDqIoKoldBogEYSkI0I0i89KmKaTW1tFopZcj4EI4sCeHSmHBPqkrXeSIL0jdpfK0JF4QuVdv+bMkdj9bVymc6hm7yjKFDDxJ1CywLCs/a8KUMU+eJ8lad7hrWV1RMF8WqR9uSp75ftIFLbxMd2ytYLNaUL0237VcP2ZO+fDqLwS/pxwJVtDTY3TTBEtCYHRwgP29PeR5DiLCoN/HqVOn0R8MjAWuNbI09Zb63cL+wYFZtCXPzfMNgITxWAVxB8FwCcHyaYjeACKMjLWdJRgHPfzSC7tglhBhBJISENJ8BgEgSjI3Vru0RF5a5igsc1Qt80qn1JSvSjBc7SHySfa3S4dzioH5PV9tndQbDgOMda412H/f4F5Hhtaa2MQG9ICK7+G2REvoLV4rCAA/c/myBGMFAKSUFIYRev0+lldWsLy8jKWlIZaGQ3Q6ceFi1W48mszCGJ1Ox8zb7XYQxzHCMEQnjswfCQykQCztkol5XlqHTjgDcNK6mDPuvfIF+XokzZbYy1zxbNda1xUiL6er2UtmBul5YVgIV9QFqk985e85r3YTKtfnd7t3TIMrvW5ZF8VPMrS4JMxFXtS5Ov1KT/C8LyTYYt98kOA8QTvi8rdTpaxN09eMJs6Ca7oGz8YIZmOssIZIU+zc3MJ0OgUzI4pjnDp1CstLS4jscqpZlmE6HuNw/wA7W9vY2d7C0eEhktmsIHVBBBkEkFGMoDdAsHIKwdIaZNyBkBLZbIK1YQ+/mYf48f/+KURRDyxDs4KYCExwnJSANL8rZO7/+c+e1y9zF1xTunzFrmrB18pUubjZqq936twJ3HdGOTOhfizXG1UcVlwdm6EHuHtdeIqcAlIoC71f+Y53h7aWWzrF3qxoCb3FLcEAXbl0SX7w0qXgz29thQzuu0C3MAzR63WxNByi1+uh3+8X09fIDvI6l6QUEmEUodPpoN/ro9/rmWQ0UYRut4tuHKMnBfo2JzxrDVKqGEcs2sPly+xb5uwJqeK7JWznejfWuvI+uUrqNitVYbEDNVZpsAEYNaopGoo564Rr9c2B0Cgs/Z8nCNj67joHF02oVVXRSRokIs19q5JKU5tOIvY5a72h7C1mVleOqvhEah1A1Z/m2vMEmByhM5uiT4TDvT0c7h9A5Sa3+9LSkp2+FptESUqZJX+Pj7G3u4vtm1vY39vDaDQqEiQxM4SQEIFE0OkiXF5FsLoO0e2DghCkNfLpGF968S34mWv7+NmPXkd/sAQOQmOVCwmQ+TPELWxEvCh/uzFz+Eqlu3AqyLPRCvdiQ0pOrd64ip7GZX+d/NwtuEO1inzuXqjT1ocJWHsud/Le/VIOmNeMup39T8cLqr1t0BJ6i4VgXBEfvHQpIIA3rl7Nn7x6Nf/yw8NhQNQHEaQUFIYBet0eev2+mYvbsetKxybNq5OmRAQZSMRxjF6vh17f/HW7XXNc3EEchuhIgW4gIWBfWKW8l9ZsKx3ZKCwNrkiJ8kUvyNmurw5H5EqVBK49Sx0ox+Q95WBOZHkCcjGaCMkj7IWHU1luEZ3d6tQNRZxw9oU2ee0gr4zfRva3+9dQaW+t7Q2ojFTQwt6pH1XZXs7F9s5W1Ou5o72rLojEU/hIZ9DJFMF0jIHWoMxMYZvOpmDNNtp9DX07nQ1sshtO7Vj67s4Odra3cbC/j/F4jNQuLgQiCBlAhBGCwRDh2rqx0qMYJASm0ynuHsR4533n8WPPvYAZQsgoBoKwDIqz4+N1q5wEFfup/umpa5XHxn9Oi3eo3Ffoxd7r1PRssat77pn338P5zdV3snps1UHgPYT+YVqhWB/BHuSNfoG5CB2NdditrpxzG6KNcm9RAQOEy5cFNjc1YUPjKvTH3vve+Obx5MuE1l93qNR7f4lo7ZAZggS5aWudTgdhEEDb1aeiKCrXjnbWvHW393o9DAYDMDPSJEUcR4AQyMIQLCViLUorwsvi5mXyrjCPTzbMZMbXBZdkpRkgF1xDIOfOd0MBvlCyHy7nNlWEDZVSiADwvMuXaoIJbnW3OZu47PDFJqg9nz/XfO7Ymu/bM7l9gi4+a+fzipeX5b5T0fXV+czuavyDK+1YoG3UT1acgyoFqF6UysQwjq3cb3cEOVOcq9dc9GGtHQQNnU4RTI4RHh+CT53C6OAQhwcHWFldhZQCyysrGAyGiMIdqNysN5AmCcajYxzs7WK730cnjiGlAA+GCIQEwIaAAwnZ6SJYWkWwcgpydws0nQJpiiyZ4SvuuxP/6YVr+JVrO7j00N0YTcZeF5bPCRHZFcBLxUUUJO76qOEBqj9X9eeoIMiyXDmkQsVzUvHc2F6t7mvyf5zQltozUFEgPRRTTotMkp6K5nvmAJhFDlkcZOltz2e3fQe0MLgCiKcvXyba3FTY3FQA8P/7oi99twY/9ere4f8gQA+HRKBcQTEXJO3SvkY2pSsRFauuCSHgxkKFEKW7vd9Hr9cDMyOZzRDHHZDMkEUhSEqESpQLMThvm8+FpcmFKju4nc6Gt5q9C6IjBkjb0L4SxRHkONKuQ21Jwk2TKtxZVJdOfl1V67A6VlwXfrUGNMpD31JvMp1qCkT9WF/h4eYW1E/tc3epWFnj0POPlITvGH+uBsAjXt9Y84uVehLB5XWtX209H7zJQc7lNL6iEluSqMjvT1bHc+curjVPwbMRxMEuuuoepCrH/s6OmV7JjF7XZD/sxDGyNAVgl82dJRgdHuGwt4t+t4NQSggGOu47ESAkZBghGC4jWD0NubQKORpBZRnSJMFdnRB3D/r40Kvb+IqH74bWDEmOrMx0NSKykaCi6EFyypP9rDxf3nNkZoJVNLH5cieC4RZKmdfEzPLDTr2uBIk2KG2L6kZDG8uny16nVt7NA8oxeS6UcguxIru3vce5JfTbHFcA8ejly/TU5qba2NzEf3j3Vy4HNP5GBv+xNM8u9YSkmdIY61wnID0DCwaES1/p5u46Amc2c8vDMISwa6MTCFJIRJGZs97v99Hv96G1RmJXu9IJmcj4QEJmVAheBy6EflXYO+Itp8165oY9iJyF74jdmO0VYWgEoGeSNAoaK0fdd6ruq6Bo7AJrtW6yLCpWKd5kontfa2zNdQZ3R3iHFdfQIOTdJp+Q60bfa8P8lLLifnmkbur0SKNyRJXE2fs9d5n+s+IbpbVninQOnSYIjw9BB3vonj6NxLrUY2t5Dwd99LpdJLOZWTudAK0UktkUo8NDHHY76IQRQikgeBmy24MMA0AIiCBE0O0hXD2NcOUUsv1dUDKFznN0iHDfsIudgyNk06kZ8iG2SVTYSxRTXFJtKKHWN3WlsOA9Lq15/5n2PT5zGeT8Smr1FiVqJEvlPalUMddQ90+zVlGezr63noXuguLYDbG5AxhgkMyQy8Zz30ZoCf02hU/k2NzE1ccfv08r+W3MR++PIO7JWWOiNBLOcyIIMsmmhT/nWxAV09CkJW+GWX0qCAKT3tVmtRJSIAjCIsK92+0CbFLEdjoxUpUjDgNQEEAKQpERClZ4NFhtsCXMak3l78KlWIyv2+Pd4BsznPHuuw7LxVeA0t0OT1rWpcR8i/zji/Z8NjBn+fiSdlEZzAm3plYVNdUMOr+auiHo9hdC3BFIwznn2uosfWv9VUjW4xu/HVVSR2l9W6vecIr7Xk0Y23wHTBmVzcDpDLSzheDuC0C3i2Q8hs5zsFLodbsY9PqYTSZmtUBpnmtWCtl0gsnhIcZxjG4YIJYSURAgkDatsRB2LH3JWOk7W5CTMfJ8DAnGqTjELMuQzybFMLHLX07Cd6mjGFr3W+93bSOHNZFxhdRdZb6mQ/a3T/j+seWzUjaBUM4y8Z6OhY0q6ys8WsVNdu2ztRVJZco2s65VY/aKnJUEgKefXiAqbgO0hH6bgQHavHxZOCL/9+9+9yORlh/IU/6WjuClidI41LnL2SqJzDPCbKxgs660BZUpXY273cgCN30nkEERlesi4ospa50OAKCfpOh0utCzGcIgAMLQjBmyTd0qaO7VrFiZnqAqDHSbecokUbHCyk1FM8a5ydJV1GcFkjsWVeFZXK7fgEJQLpYdVDnqM7DUm6yM12x9eO1ir6m1vUVwkat2Qf0Vgm0iffLOONdR7jvKkxXkXnemu80eJTMX3VzUaE3vinJh/ynG0+FWwnM2X9mUQkXTGVQyhdjfBW9vI1pdBTMjSxKwUujEMQb9HiYjs9yulCawMwhMpkM1myE5OsI0DJDEMbKuiSUxAaEEEQSllb56GunhATCbASpHSIQ4IHCWGpIKTBApWYWlSuILNC2vmwuubriHFWWtrrlVynvkvkBBnLtXKJ+PchKIW8xo/viSwd1H00NnX1atKtpD8T7XGsZg6qKL2x0tod9GeObyZenGyP/d277w4UiI/1nn+ltCge5Ia0zzPCciQUTFqhNFLA1srBnMOuOFQLRkXeSWJhQkL21+dgJBCD+hTFxMa0t7KbrdLpLjIyMkw6BYRAUEsJAN5iFXvhZjpm6jFWqaGUV4HVNJ6M4CAVBaJFYE0byMKWKI/W32u0/aFQtlTkZ5puecEFtA9gXxNAhgr8qm4xpJufa7avnOH+9Xc0sdotIfrl7/qLpUr7agqSeKbY6l6rqTHScHqHAvl9aeN8bu3Ucww/l+GABpBZWY4Dh94xpw550IT68j1xqSCN04xvLSELPRCFMpIaMIcRwjCiQ6UkKSAKcp8tEx0qMu8n4PKjJT3QAY13sUIxguI1xbh9zdAsYjqMwQ1SCU5v4qBSKGcNY9zVvoc91d/lNsYCYQ2eedKgXNccX7UYvvOElRXPS8FY8lN2w74cC5di9oBLNJAFXVEs1UU7g7aF4SYmIdLBzfum3QEvptgGdwWT6FTfXU5qb6Nxffc64T4nuZ+btCwmCUayS5UjBEbqxxoPLC+1acBCGmculTwAof8paTFIRAysIN71ZUC6x73o25E5Gx2Hs9jIIAighwSgCzGVeUYp7uilOXtgCcJUZWi7cu80LQe+5255KtUGpBDqgQAM2dmBYLvuJgLvsNFVHk8bqzJE+orFAuGiydwtJ122uUWCgOHgt6p1usE5Sm8ElNW3RYxfCqodS1PLKplWy01os9zgIt7139vpln1yhpggm6KF+95wzXRQzkCVQygdjbhrrxKqKlZURxBxyGGPR6WFtegUpSHB8fgYIQcbeLOIoQCUIHZFzsSiMfHSM5OkTc7ULaJVEJBJKBiXhfXjXpYA/2kU+mmGUKX7Das2PEDJgkpiiD4MwzXHEC1R+/GmHP93ZZpoxP8IrUb8HrJHY/4t1dxVxbFyoEVmlnz+1uy5PbpmwEq3P/eePn/pRLBrGWs5bQ3+gGtPjcgVG615/BZXnq7S/+ac38/RHEuZFWmCmlyGSrkLa8PdBfOrSsjIkREqFLZYSrfzanAAgq3fAuUM5Z7Y7MgyCAEAJxHKPb6yIMI2REkEFoVp5S1nILQ1TIy52VfcFvF/4oiIiqljCX5OrI3RfspZyhUnhaIqgw4AlcXuVOKo+HsyRqwq3cUmtJ7UIJi09aqcM/oPknvEtaTLgN559TFlC/4LLZlXNW4xLcIV7XFIpDeda5GdWVKy26l9FwD6v9xzDDPxqAgMn5Ta7mgmQIgnNkyQzB+Aj5q68gWz2F6NwdiIIAg24X2dISOMsQBQE0gKjfR9zpIBQCITMiMAICOFfIjg6Q9vqQMkAQReYUgsxYen+IcPU05PYWxtt7SLMU9506Bw0TzS7IJYzxF1OZv41myVCyfdlwv2/B746FixncTlOq38NF5D7XIKfnLlhcpwxGaXzMq5V66q9bmEWb9rn3lrVXn/tGYJ22FnpL6G9SPIPLkmDc6z//tvd8GeNTfyOA+D0T1phmeW7d6pJ9S469d55gXiDP9ccMSCIMhIBmE32qtTbrinvntkurIpASggS0dXK6YLlABgXhR1GEXq+PMAohpQAim986z8z5g8C2wV9Zqyp7qidHyVrsGy9cCrKKa9Z9QUVIUV1iOWHjyLASccz+gZ6pUt1Yb6Y71EWj19dZr5z6JLBXcM588xtltxZFPSUI5WPQfP4mWXlryU+1czvUrf+mUkXgXG2s3JFRyRPWep8bROZSr7NXK2D5wWoFRQR8NkM+m0Ac7CC/cQ1Brwc5XEInCjHs98BZhjAIkDEj7PUQdTsIZICAGZI1Aq0g0gT5ZIr0YA9BFIJoUHiuSEqIuINguAzqdHHjeIpQCtx1agWKueLNqmTIs56nIpeBrwm5VcoqXiOrQrH3PFUi2+c1RPf4VO6JpwDPu2rsOcsbUij8/iZXTakw2PvSoCjXrfjifmqbJ9+pYoVyXlWGGQBL04CnnwZvbOC2REvob0KwHSt/5uLFwaro/lXF+s8KAIcqU0DpWi8PQP39qOyrDMcBWCJhcqIzQysNpUxudHeYGy831jaBVFm1EALCs96DIECn20Xc6WAahKDQWujMIK2AwCSbEXluXlrr6i/nn5InBExjnVu2sBC98XNDBJ6wd2TgSRRfIJEtM0dXXp+5FLdO2JZd2ExmQF1+ldaH39FUL+x2VXZU7F9UXe2YF7xw1IZCULqUPYsCqioRz66yQlLX2lIvV7/+yoVX91OtSLmjpl4VJIdqn1vSKD00VXIvid1Y7Mo9BwCEypBOJwjGx1DbN5EPl4wCGsfoRRF0t4sgCJATgaIIYadjYkQACKVBKjfeqNER0oN9BHEHQgaQYVhcEQUBEEbINeOVnT289fwZrA56mM4mkNJY6dVYCbZdzQ33wT3DhtSp/pK6riFUPfJNZDr/w+/8hl3eMzUfDbdIR/bOc8Lp/LMUaV+pvJfsW+hlfxBDq7RBo7jN0BL6mwhXbAA6bW6qf/fou58IwD8ckXjrocqZwSxAkqlBYKL6vgOl4g9LiD4vrEgJ5EmxNGquMjDrwnIVgop1zoUQ0MrmUweK8XQXSOeihju9PmQYgu3UNSaY8bMgAAcBkGWFJeZnjCucusUYuhNyqAYHuSOsACymupGpYz7wjUEunt+NyRf7T5YYc/17gvCqZL/zv3CzYKxWs7DSeW2g6Ae3bri70e7D81zM2Vheu05SJhrLNVh3J5G+IyDvDM0qkSPxklfc8+dFfnkVliPTgJ3oYAPkNOw66XmCbDw2Vvr20Ix7r6wiAKEbRRBBACWlmYkRBmYZVAAQCoDJEMeskY3HSPYCiCBANByChFkzHUJCpyl2b27haDzFH3j8UWjOjYJLKJ7FRrBv7QKNxLxg39xy4/VjbWey/5x7O81568qa/4DyvALlKxb2nFRsrj0TTUNbRMY619WFkkoL3apo7C6ZlQzivLnzbh+0hP4mgQt8A4Cfu/juv0zABoPoMM9yEAU29hVAValGsa2e1cyWqf1mAKtCghhQWiNXOfI0L9aFdiRtxsoNoTthoe0iC+48LkI+iiJ0ej0EndiQdxiad1jloE4EHYbAZGItsLIdTljNCzDnnqRCtrh9BcmDq8K/TpwVAVb2QtF2fw/75RoEMvlH1MxtU+n8vhrmeHIhfIZbYHF50naelhvIvPEpaLLcbtFIWrSzod+o3i6/u7yxWrY07c2ldkM0Jdn4jMbWQkcx7ks2UFJohXQ2QTAZQezvIu8PTV6EXg+BILAIoMIA7BZSAcyxSoGzDDybmb/pBKlSZnlUISDjGKw1VJJg8uor+K2Pfhxvue9u3HNqiNnBLoSUMIkRqs9Gke3N64w5UjcdgmJGdwOpN/H4wqlrNoDQaUvke2H89tUVxiZ4+rR7XyvepeIdqz9z9jq0WWmNAQhBALRpgmajgcHVxyCQimimcJujJfQ3Aa5cuhQ8dXUz/7m3v/0MsuAfdYT4uiOdMzNrIgr8V64+Dl15lfzIdo8XnEuPYZZCXRUSIWCs8yxDkprVphxMmtewSDjj6nbj7QCK8UIAZn56t4uo20cexsYCEhJKmWxuHEdwbmHXBmMg1C1wg4JkqxcHZyKUhF8tUxm79Ooiv6ATSo2kdbJwm29k/WwnHFeTeUWLmg73NbfGQg2CvLEtCxSUhcc3l+Ta73ozzQ6qXWtzX5bqiLXYikxx5BGg3z+OxO3zay11m4qgSAOsLNEzK2STMeTxAfL9HYhOFyIwsSCCARYEzbAr9SmjyCYz8HQKjI6Ao0PoZAqejc24eRAgGBgrffTKS/j4r/53HIyn+KYnvgh6ugcRBGZoqTJU5Dqo9N8UT6brpoIcq5ZtBY4bFz0HTaQOwLnnqLDC7baGuufq82+ULVd3kjU9LxVFxR7PzkI3JrvpD+3HRdg7a5qpOhS1hP5GN6DFbw8fvHQpePLq1fxnHnnbuymT/yyU4oFDlecAJIhEhczrBztjFQ1aPFffPXesYmBFCHQYyJRCluWV5SMLqzuMEEaRCfaBWX4yz3MoW87BWfSdbhdhrwsRRyYQTpi88YIIWbdrhKjnciuXNuXKhTWOd9f6oLymcuyx+LS9UY0En5/A9prBC340Gr8L6a5REM4JwQoaBP0iYVqX68XwhaunqtAs6grfEnMbTvIs1PUt1Pq82Oes8dqewhInX19zWcuqsx5cOwRMoKcjchK2DzWgYKaYTScTBJ1j0OE+VLcPEUcQ3R5ErqBmU2giKGboPIfOUujpFJiMQdMRMBmBsgRaCGNJSolYKSSjY7z8K7+E3/jw8/iiL3kPTgcakyy3lqfXB/ZiyuQ45T4qQvtr5rrHmAufCe+9rnbiXMcXlXCtWFNs3MmKbfWZKYpXGXnuGorDi5XWXF1OkS91Pip6hNS1NKqt0nD7oSX038VwZP5vHnnH+yISPwkSS0d5nguioJ4reyHsy1O+Ty45Rbnbr0KxxpIQWCLCsVLIshSz2QxpmlYJPYoQRxECGQAEKKWRZRmyPC+sdAc3fS3u9THp9KBCs0gLpTlIK3C3C00E2MA7LiwXr4EVgdPEfKgKNSotcneIsbzr1F2ldd+adf1VsUMrP5vM8gaiLnbXTJQGK/Ukgpy73YsKNeyrnrl+4C0eIk9gF0e8LuWjgSwqZy+eTK89pdVqJDoX9bD1JjnlzhG7/1ALeyuL+RmCwJoRSIlXbm5DSolht4f8cA+i0wFIQAgCTcbQkynyLIPKUqgkASczIJmB0hkoS0yAHBE4z8BCYHqwj+0XXsCv/Lf/E/c/9Ba8+65VTPa2TPIZbV3t7nlhRuVZcpfr9XPTOwvYrIjuGfXLusv2LPXqvaj1j3euikFwK1JvsgCKc8/rIfUHwlewzQZlM0BTMTpmuocBiOJS7T3OYxy1Fvob3YAWnxkcmf+rh972JyKSP5oDImetBImgPn93nhaq2+ffQfb+dZaDEQYKQI8E1oTEnlLIsxzT6RSz2cxMX2Mux8VtJDAAaK2QpRnSNIFW1bF0IYRZE304RNDrQ0exmX8+nYHyHNTpQAcBKE1RiDsb0EQETwh45OuT+7ycKr9YYnfk4JOa216rGlVzo6FDF3X44h3V3XOsPJ8XoPhe1Unm62siSk/mz5tPi47n+oENVt2CdjRUU93KtZJc/em+sh8yVld4qnW5lMHFrAbPunWZBQ05mDF0M47O6MQhMgj86idexBPLy8gO9yE6XTMM1O1BgCCSGfhgD2o8hkpm0FkKyjOQyu10Sw0hJXSeIZnOsHd0jF/+jeewsrKML/+C80i2X7UBdAywNm9ajcidQlLpnuIhqN+A6v2rWsI0fzzcanQn3pyF93nu2ePq/mp95f2pB8TXF5TxFUkCg5UXV1C43P1qnRYOgClbwrAl9De6AS1ePwoyf/jt39UX4T+YsdYK0EQknVgoMis2vKPNtl+1jBMG9fdTA4gE4ayU+KjKkWYpJpMJJpMptDZj3mQt7k6nU2SEU0ohSRPMpjNkeWbd56UVFQQB4l4fwaCPPI4NgRNZQu9CdzoQsxk0iYqFXhglhbbuW7g+aH6TLeXGIqn4XWdJMpmrmsizZonPKUlNVs3CO1CXyGWN/mkqS1nXBewJVrDfyFImNmk7TWggF+9r0Zbiwu3WW9VXb0NjGXeTvTXRyao5Nnq6uITiPvHcCnr1qdBFzxbkJoB0hocv3IV/9HPPYuXUKbzzwRDJ4T44jBCAzFCQFCCVg8fH0OORycWuMkCpoj0cSMxmCa6PJvjIC6/gzpU+/sDb7wXv3SxS2ZJ1J1dSmFL5vUjKY/+pBpKTvV5zDeSzJMOew6nltf52BzZGydcfAtdRVOgNWFS0CUVbq4Vv+agywDq3FyiL+87eUqq1Nz179OLzbZT7G92AFq8PBZk/+I7v7IngH8xYK2WWMyUnoCqKc8MbU6cSRxYVrduTfn7GSIbJj36nDCGyKdI0s4Q+LsbRBRGiKEK320UUmZztSmukSYKp554v4I+jD4ZIuj1QFIOEAOU5hJDI+31gbx8sS7e7r9WTx+rkS/DSxq7BFwduzLzU+CtJPqjhuIKTfXKmSv8XTYCTn00mzQJwrYzPpw3GMrztqG9Dw/ZFx8xpJAuObbAIecH2+ZbWBLt3TBMNzaWn8cs6YnO73FtQWaTFlq4Eh9mpilTeGxKAzhOsrqzhPffchZ/4lQ9jKQxwNwh53AEHASjuAEJCRLHNsZCCZxPoPAXZZ5+FwO40xYv7R3hlexcXz63iyx85Dz0+gLJDUtAeYXvXVE4ddH3oeRiKvvLS3RbPJ9crQtU6t9pW7V0uerx+EyvCwNW/QJjc6pmrTZF0hzQkVq4+LzapjNtkAmu5+dUgpLQB7YrON/T2QEvov4tQBMA98PZv7Un5DxPWKjczOqieS8t9qyZIPRnFu2xfnmKrex/tm6I041wQIE6BJE0xnUxwfHyMLM2AvhGOJgNcD3FsAuPy3ATPTSYTzOza0kFQPn5CCESdDuKlZcwGA+jYzPulWQqhNXg4tCuillHuTubUp5L5wqgiz+E50e1xRqh72+ATrzu02FHr4bJX2ftZkgt545Z2t29R1oShVZ+8izjhjlWsYU9WLyLwk4jdM9ZeMwpSLdtJtZ2vZSx+UbN8PilVr3J6VjV5b/Xcxl1dbjW3oHiwbbFSIypIHYaQ06N9PPHYRfzajW387V/4DfyJ0Qj3jqdYulchPLVu1jnv9RD2B8D4GFrOwJqQ5xr7swwvH0/x8v4RVkLC1zx8J+49PUQ2nYCkTYUMbUgZNBeUWtCsd/vLYQNXxCNrdxlc68O5rp7TsqoPbVPQQ4XYuapkeorUvOv+ZFD9ea0oEp5ComxAHNmpic5C9+Ncyo7KvFa0hN7i8xvP4LJ88upm/q/e8tZLkRA/lpgsxySIGsm8CATyUX+R58jkZLj3WYFxSkgsA5hkKaaTKY6OjjBLZrZaQhCE6Pf76Ha7CGSALM2QJAlGoxGmkwmUdU+6F1gQIY4ixIMhguEy8m4PFIQAUlCWggYDqDAEkrRcfaukZ0PCBblTKYioJJY64VOx3+XRJsz1QiOJe324UH54lgSXQteaGpU+9WVmebKa5D3JEvJ+zhlWrxFzj0ST4K8ZbNVz1ZnJVlBqNw0NrRVvOMfc7agpC9zQ/24WuqvEkbs/LdMcxUXZ0vtMoGwGLQW+60vfhb/5X34df//XP4rf88oWLn7qRZy7604srZ9BFEVQkwmmsxRHoxn2j46xdTzG8SzFckj4vXcM8QXnViClwCxJIIUAaTZtZQFI30L33OmeWlc8wo41mxYGKoaffGZvIO+666To60Xb4f3gcr9rFJfGgpvPP3e/FvwulIDKeeYLs1b21CXJs9cUEIEKnYjTplpuN7SE/rsADAjCpvrn9z/2YCh4k4UIc7AmuGlpPpHfQu67l4rhvfzVN5kbX+yyghzAkATOComPZRkm0wkODw4xHo+htTZ53IMA/V4fvV4PQRiAp4w0yzAejXA8GiFNU3S7nYqmHQQB4n4f4fIy0l4fFEUQYgLKM4j+EHm/b+b7yqBonllbxhfy5XcXtV5KxlIgkj2ncNuLZpRWuxvfp0YB2UDjFV9glWj8PY3mQ8XCcse+BkOjQZ9oHrf3Tt60b9GDc5KAJi+hSWlONmgV3kP3ul0BJ6Ouc9S3F880qomTKlMWUdjF5n5LATUdo0OEv/z4g/j5l27iQ7tj/OdPvIjOpz6NfmjWIiApIcCQRBhGEuu9CF96fh13LnURSEKSKSitzdQ0S0aktclqo8nrEirb6kjWSwThEir5Q9GVRFA+UZYXiHI51ZriONdTXG1HRZlrVlb9wyu55ernqcsSX89zw2b+M+MsdTaEXhC38WuANc9fAgBmSgHg6SsgbLQWeovPU5hH/gr+2/mf6+6KyT8PZLg+0VoRQTaU9T5LMbWggP1evoFW30bh2vS1Y6pqx5EA7pYBfstGuR8eHuL4+BhKKUvoAr1+D/1+H1EYgQBkaYbxeGys+dkMw+HQJPeAESZSSsTdLqLlFcyWliC6HYgjCcoyM8VnZRW8tQ1ImGhjEiV9EwEeAbvfcCTvCU0zXloSvk/gpU5QKgf1Tq4a5wtkR23csKm/UfR4+avMceZLYe++1cfh/XvqKysnmSonKmxz1S3c4UigpMLS6q2Cam1HSVC3wmsyuao2eaGwepXM84tHnrWDGGYcS2UZdJ7hvedX8FXn17CtCMccIBESmQzQj2N0pMBSAAyFRsAKSuVIsxxZplDRJwFLzuZNY3YKBRWdYba5g9h7MGqKdyXfbdMzarfXSL2iKBR9O690vi6Vi+vKUpN2UT/AKVKLzkQAKzOlr/ht+oNd/gBfeTcNN4QOYOP1tP9NBnHrIi3eSDx76ZIkbOib0ejvDsLw7ROt7Epp8y9D05ZFxpjZbV8KpxUXBFMKNnb/cVmCrUC6KwgRa4XpbIajo0McHh4iy8xQlhAS3W4Xw+EQcccEuOV5jvF4bKz50bhIF+sgpEQUx4gGA4QrqxD9ASgIQEqDshRybRUchkXwkeFsqvzB5ogvidq7zoLYCQRRWPdFeZ/c3WGvT7x5Xe9ZO3Vju+jvBfemKO+f21cwFoherp3q9dopvKDmxnrK6ytb1UTmzahw6S3P9Voq9O4x13vGV+gWnNP2d+G5YrbPh8BxmmOazLCKHPdFOS72gHcOBB7sMO6OGQOhkSmFSa6RKAD2OPcM+sqbWdKbi3PAzvZw09YY3vZ6f5zUN47wTthdVOJrOw31n/B4LtxuZp5U5cdc3f4YVGN9/nZd5HEvslcybJS7U+PNvyaREGYAsPn8Z/rCvjnQEvrnMcy4+dX8p+9767cMw+hPHmudE4nSq/IaHt2m948advoyxu2q/xX0ziYw7qyQOAXCbDbD0dER9vf2MJvNCndgp9PB0tISer0epJRQKsdkMsH+wT4Ojw7not2JCGEUIR4OETlCj2MT9ZckkIM+aGkJ5KbHkQkyEvZ7xTIvLHTh/TavPwlhLXTftT5P6nAKwevpXH9bY6BR1Uptkn2upwHnFfGIvEL2DQ2Yr2gx6orGLY/3FEDPmi331pSYE9p2stJR8468FpL3Kmw8fWN7fBLk8lksKnCJkszSplmeYzZLMRmNMDo8xOTwANPDA6SjEThJQLmZumbSlbJv/BZ9VpJ5tQ0Vjbl4KKovaLmrJPzKbBG3y7/e4l6x+zih71AoQ1XF8oTyC7Yv4mm/XRX/Ifv3nLw87vZdZDMH3Z8R4b9fDEoWtOq2Qkvon6e4AojL2NT/6v6LF2Ip/n5qE0m+3noqUdwWt5KPxYvvEw5XBYIGY4kE7iSJNEkwOj7Gzs4uRuMxtJ0rGsURlpaWMBwOEYYhmBmz2QyHBwfY29vDdDqtZI0jO44edXuIVlYQLi9DdDqGgNMMUgjIM+tw2ehEQcjC+xSWsIVJ1i1KogYZIhe2vCBL7jVSd39lv9X/Fvd2pYNPYpUTb0JJls71PrdsbIUA5g/3OWNhuUVnX1jW7SgtJOf5LZ6PzwYqQRy3UBJee6VVkuIa8de++LfQDCv4SpWZQ05agfMMyFNwnkJnGVhlYJWbt7X2EhVXw/DupSNbLl88v2EV11jNap/79BSSuYeAij4ovRCV7vHa4s7l1zfXnbcke6f8L0Sd9YvGwZC5ZncDiuupKzBklooHkbHQL59wutsBLaF/nuJRXCYCOIf44W4QLmdgJj+qp2agnfje8MklmsJMKuLIs8aM7cHQDARgXAgCyCzD8WiEnd0dHOzvQ2kFAiEMwoLQ4zgGAKRpiqOjI+zu7uL4+Bi5TQXrziGkRBjHiJeWEJ4+DTkYQIQhhFKgNEWwvg7qdECMktTdcqzFn7TkbUidhLSforTOhbCuUZ/wPWJfOFhxC1ape8Xn3OYLqp2rxPzVz9g4DHBCk+Zb/Bl6JHnxsaXrs+mY+W2Ly/lWecF688RTUzYrm+v7XBULCYhLosSCclZZNAU0oI07WOdmnJeVAuc5WOVgpUyCmSKla/lXuqW9vzq5sqVd33vgN6quyC14t8squb7h9QyK3FopbNpe3AinRDQpD+6r3y4uPGlFHnfXDqcwan+4xhOHTDMAeHardbm3+DyDWwp18/6L3zwMwq8ba63MuPliLBy7fE2PN1e+1X9VZKQnaFgz7pIhVjRjMplgb3cXOzs7SJMEDJMCdjAYYGVlBd1OF0IIZJkJjNvd3cXu7m7honcQQiAMQ4S9PuJTpxGsrZkkHgTwdArR7UKur0OwWX9a2D9H1kIKM9/XRiFTEADSErsUxn3qylsSF+SRe+F6X9xHc53lE8ZcsSYp+FqIvUFIe9/KU9Gi4vPtWUT8De1uDm5mbwdh4SU3N/oWdTcUfg1tr5D1QnNwQV/OEZFHogCsf8sbvqFyp7YkrTVYmT8oXWSLK4K6NExq2YJYvbbq0vNSPkTzDWX/OLi7v+BaKuSPapvnyjcoB/7J/GoqBzdg4fMypxp47axuds8zMUyEuy3jXO5a167cU24ZbObM4tKCBt4eaAn98wwM0HPY5GfOX1wLSf7tjIi5nou05kJ3Rza+a8ULVVp983TSZKF7RF4IzSq5m6VUBe4iiWQ6xcH+Pra2tjAej+Fyuvd6PaytrmEwGCAIAiilMBmPsb+3h52d7cJK919eGYYIOx3EyysIT52G6PUMQaepGT8/dxYiDCCJQEIaUpfSknhgAunCECKKzZrUYWis/CA0+2RQKgBk3PLOap+Lji/6o/xd9EmFWIvunvs+T3o8v7E0aGr3hMvvpeexOajsBIYtNlVIo0mx8K6ZfVHc8Mxx7RNl+xrbhflyc0MDJ6AeyzVf/LV5LqpWOC0gd7fbkbpR+gCCS1tcHf92QVxctc7dsm7VF2lBw/wLK8tWBsscSRcX4jbPMaP92kykXHxd8LBwtfzC/fXtTZttm+cufdF3wCpGAIqZAKjlca+fuh1DB1pC/7zDJi6LDUBTQN+/FETnMmZFbmmhOsgXuCdY6fMHNm4tx0K5InDdG+wTGZihwYg0474gRJikODg8xI3r17G/v28Sx8CMo6+urWJ5eQlRFAHMmM5mODg4wPbWdhFIp5UqxtOFEAiiCNFwiGhtDXJ5GTKKILQGJmOIlRVgdRWCYdaqDgJD7G5ucBBCRBEojiDi2Fj4QQgRBOZPSmOpS1kdQ6dSeCzqsUXyuByhbJB3nqA2fUqLy819OpYnwFuchNk1dUFj/C9OoBbnmRsXqB9YfDcpVMm7sprF57WVyxKvS+BX9Js6yddP06QwLGCY8qkti8yRmHdi/1mvwD0fNh6jLM9g1g1Wdu3T/pF3zmosBHuk3NAB9XFjePv9z4ZjyNZbeW7Z1QOv3Y1d6LW3eXvjjap3n93hX3/ty1wFzkI3QXHmeriISyD7P5X31Ua53+5oCf3zCGwD4Z659+GHYyn/zJhZg6hcmWCBReUbdotIfRHVO0HNtZI+NRV8xLUpbAyw1rhDBjilGePRCFs3t3Dz5k2kaQoACGSA5eVlrK2todvtgqzb/fj4GNvb27i5tWXSxnpWuhACMggQdruI19YQrq1BdI3LHrOZEWh33WWsbRIgGUAGgSHt0JC5iGOIOAZ1YshOB7LTMRZ7ZFPKSt/17k0zKsbQ4fWA31cn9CPX/6pBQU08SIzFcq34rBJtMcbPtFjQFl+ocmRxR7nhiSikfpXwC49Aver6yUvhWvxu5N4FqLTI47XGQyo7SpKtnKaxggUNKPqj7qL2PROe+72JwD2LmfxP1Mr4L9DcNfkPjCN6VJQGXng984qAa+Y8mdarqN+8clNj3ZXja/sqniZPViw4vORoQrGoT2UddCdryt+F5W47mrgldKAl9M8rbNpAOIHwr/WCsKONLef5WxehyQV/K1Dl36aja9w0ZwyY7RoDBu4REmoywe7ONl599VUcj0aF230wGOD06XUMBgMzfS3PMRmbMfebN25gd2cH0+m0CJADCEJKyChCvLKK+Ow5yKVlBGEIkStgMgXWVpGdPoUwcC72ACIMQVHk/VkC78QIuo7UI2O9h8ZSRxENb92pMLKilGVUkdtNfXiidXML+H25sESFrPz5vnaLT2x+xU3VVMrRPK8wzZ3PnWPegq1J7vlTVqduLWqba98iBeCkvm3Y33ivirqr92x+7nSNmQjFDAm4z/p9Z64c75ZDrZNotUn+xZqKFvjN5km2/t250bmhTFHE7xQuyL5SRf0Fh7/TPnmN96KBwWv1UKWBTddAJX8zTHAh17L76drx3vx0Ak2bWna7oSX0zxO4QLhnzl98vBPIbxiz1mUCmVuPDVZfqfkx4GbUXKwnGG1c2+iWMGUGAq1xQUZYSjMc7B/g1Vdewe72DvLcrGbY6XSwdmoNyysriKIIDCBJZjg8PMT21ha2trZweGjmpRtXvQl4k0GAsN9HdPo0wlOnTEAcAD2dQhIwPrWG544OEcYRKIxAUViMl5P3Zyz2DkQcFePoQrrxdGmj4mvWOdX6prH/uXH3a0OpUBGsa/QkE4ab2uPO72qpM5vfWI8xHQHNEZ9fb9PzQ/PPQuNDU1MHXiup32r7nPbhdnG1TEN9TW32byN526rPenlEMRNCGHLnuToaesPrCJpTiGrX5v2em55Vu4hGxcf/UiP7elsaKznpOfbq50bNq6lR5fZ68xo72b/HWhkVh0ShIGmf0Mn1N7m+bS10tIT+eQcRiL8cC3my6VOR7dS4uemAwkO1qOyCM/o2zNzwHgHQCmuCcJ4J6egYN67fwLVrr2A6NUpzEARYXVvD6dOn0O12IYiQ5zlGx8fY3dkprPTxaIwsy6DsWDrZsfTO2hqi9XUzhS0IQGmCbDTGqTNn8EvE+LevvIzecAC2rnaKY2OhhyFEGBk3vLXgi+A4S+TlOLoV0vVo5qbOcnenYso3CNImgmno27qlVJV5Hk34467z9l7zqU44Pxdn8BUC7xzM3vYFddYvoKHMAh5e3OiTFBvfOq5XVXk2G5StopB/jfPVVW+3r+D5iYtEqfxxTf8DPMuygTXddVe61rPyK+1FM+Y0bS43N51vEWx3FK2t39t6e/zWungbd55FJ6qPpTTvKDYRbIChfzbGAgvdyiXhCP1qcxtuE7SE/nmAZwBjnd/5yO+JpXzfxI2dA81k4qMQutUiJXHT3NaFxE+1L/4L7MmP+h80I9IaF2SI7jTB7tYWXnrxJezv7UEpBSLC0nBo3O5943bXShVJZrZu3sTNGzewv2+SzeRZZgQFEUQYIuwPEJ85g2B1zYyNM6BGY+g8x5c/9k78xMufxkdmU/SXl4FOx8xTt2PlIgwgpP2zv8kGxxXWuRDOBCuvnao9VXYF1QRbrc+K7m6w6rnxxzxqQrZ6pgY3v8dm5eaa+73Y0aCwwBzPXDsO/jE1BaLism1gxYbfiz0QDWhUFGrPpc/iTUqGP1xyy/NxrY9Qkm7dW+PnLXAkD1TetPKz9m6eQJjUdF+aivp6XfHbWqqLhl3c5VUUAe8OFv1062fzxPt6guJWqIxcvQD2C4HMs+infXVN1tVlcWFsd7LrTrQWOlpC/7zAZVwxz3Qovq8jA0KxJGCzO3P+pWl+AeescUf+Fe6pCqtG62TRWbhMbylyhdMiwF2aMTnYx7WXP41r164hSRIwM+I4xunTp7GyulIkmcmzHOPRCHu7u9i6eRM729s4PjpCkiRFlLwQAmEnRry2hujsGYTDoQmAS1NMjo5xz+oa3nXf/dj81CfROX0aFHc86zy0ZF4GwEFIkBTF3HSfzEu+o6KfChr1ZhSYv+pYdsEthazyCK8i8BoIaAFMfQ1EPq/VFWXcfw32Xllp7bBSlFJlWxVUlCp+F2VP8NV6FdXdxnPlTtznJ2ZprH5+wwlMPq+8eMpbk0vZzyDoSN09U15WwfpMibob3ilb86oiNd6b4ntFwTnhuqpaHSrenIoCsLgadg+zf+5G1L0Q9hlpVMaqpeZ2VBQpbaf+AW4t9DIToXe0V5wJCQA8cea1vFlvXrSE/gaDAUHY4P/9/CNvjaX8A1PWGrBj5ydY575IKATMIgKes7xPou1btdfXqu27SARSCqFWuCAC9CYzbF2/jhdf+FQxhY2IsLKyglOnjNtdSgmtFWZJgqPDQ+xub2N3awsHe3uYjsfIswzaKiAiDBENh8ZKX1uDjGMIZqjxGLNkhkv3349P7uzihlborCxbQg9AgZyLZheeVWWmIWHemq73DZcEjTrBNvXRiQZOg+W8oGRpPZWzC07WBOpu0EWlfeKoEzXgpqo1egOAStlCk5lv9sIrmuufW1l4hbpRPuO3ltp1KsVCZarer0UyGfj9UKYYhqBKiuEy5fD8LIlqE5pUnwUekwZUpp/NkXNJwCcrOfXPE55HdmfFfKWN973p5PVjGtpkUbTEZuJzveXIvPrc2H7WIG0OaS10tIT+hmMTl41ElfSBXhAGGtDNXOEsA/OrtFSsnd1kVPjfSxnVUGahP6ARzRHfDJllWBMS5zUj3d/HS596Aa98+mUzz1xrdLtdrJ1aQ7/XRxiGICLoPMdsMsHR/j52d3awv7tjrPTZDCrPwTABckG3i2htDeGZdQSDgYlQTxMkoxHu6PWwGoW4dniIqNMFC5MRTtikM8Xqabad5UcprOuids4oAhqueYF7099X4xBqspzrJ6tbLK6dhfeRy228gAwWcizV6nYNXLCoSaXORU/IfIraijXZYLGd6Aa3ZUv+dXeOi+3OYm9s9Enh3k3tXIQmXvYVQs9Kr+cxaE5Q5M/nr5/feQC8tQiK/QuIss609Qd1kWJVOW6OKb3DzXmptr2xTtSHYE7WUJreKfdUc7EKC4qUu6xhsvPVnSpkk/YJY6FvnnjWNz9aQn8DcQUQT2FT/eTdD98ZiuCbZsxMRLJZbJZTRsoxu6pNXhiac+6/eeKZC+KpVVLaJtVPv3D5LtoEEHkOqTXOk8TSZIada6/ikx//OHa2t4t56UvDJSwtLyGOY0ghwczI8xxTS+qHu3s4PjjAdDIxVrrWABFkECBaWkK8fgbhqVMIu10IBvLxGDGA01GMmzs7oCLRB5uUm94f3GIPdn9lGctCnNSEjS+Xmm6MT1wNzlX/p+8wbuC46jnKm+kOBubvRFlDo8Av7z0VRVz5envdtsXVNTDn4mbUH5YFtS0Kwi4VILfNtHeOEFE7qLg8rt7ak/kFc1ayxx3k/iHb+xXL3GYZdOmDC+u+4ZyeouYiuOGIWytwmoInI/DoCDw+NvnMSXjPbPNlNxG5OZV3TI202fXRfOOK4o13btE1ccM2X5mDX5/NnVFXSBy0Kq/XusgaXe5GPSatGdRa6ACA4NZFWnyu8AQuiQ1c1ZLkty4F4XAMzgnk3ZMmgigJ19KokUVsrHRYa3ShF89JdiY0lfDsNo8FqOoCqJBTmWhGMIPSFIOwj/MauLZ/gGsvvoAX77zDjHsTIYoiDIdDdLtd5GlqXGuakaUpZuMxxkdHGB0eohvHkEKA4tikeJUSQaeD+PQpJGfOIN3bg5xOkaUZSEgshSF4OkM+HpulLGUt9b3WRlDYhTOYuUjRyaWmBGaat1j87veocd4SXECu9WL13eTd6XrZhdzNzmgv2zTH0eU9c+dguPQy7joWKCGuukp91Nwu//DKA7TgOurX4x0313X1fn8NbiRG87NdVY7q5+PGouY7lacmBpgqzgry3w/vOty9MdnOhDM/wVluV2UzcSIUhKD+AHL1LIIz5xCsrQNZivy3fg3q+ADU6YF16bhjcu86arfQo0xmO2PD7xiuKhtE1XqqVXh86o6zWxp0Qf8Aj4fLhjKKPjPLKztarx3PMEvQ2oeCyJjgrKtFCcawIbbLUFoL/XZHS+hvHOgJXFU/CoQEvD8DQMWSTpg3oT3RXW4pX05H4nWPVFVMObJ39g5Vgq4KdzCREQiFoOLK8Uzu7ZzPhCazFDqPsR50kCQpRq9ex0uf+AT6/T6GS0tgZvS6PfQsoWulEJAAmJFbUp8eHWHS6SCUgVkvNgxBgMnxPhwiPrOOZGsb8ngEcXgIlaYIiSCmU+RHRyDNQBiiHGewb70dmzPfuUrmhRW0gJTdNTJXb40vCOuW0mcNdcnttbFiyaNsf/3x8QTqYgXAKTNUqa4xxGCe7RvO09yURkLwu6yulNRZpo5Fymv9FCf6+etvi3/O2nayhImqYl3EZMC9GxqcZUCeg3VuSkcxaLgCuX4W0Z0XENx1L8I7LyA8cyfkyhqo2wcFEgCBb17D0Y/9L8he+E2gNwSzJfWKBli/SK8/3M2rPzqEph+Nmyqk7guYW+mElXLzisDC54pgXe5WMXOPql3IphLbYTvbzGbTKQBcvvhZf/l+V6El9DcIz+CyIGyqn7r7kSd7YfgFKVgTSDQ95A0KeHOhhvezfK+qKWLL/Vb4+JXMyfrySPaPqXMfkVk8JUsRRhHOamD7eIz9l1/BteVlrN95J/I8RxQE6Pd6xkJnhiRCHASQJMC5QjqeYHZ0hEhKBASIwaBYJS3odBCtriI6s45wfx/JZIJZkiDVGn1mqOMRIKWxxF0mONdWrYs/1m41LEfsqAnuEs1WI88VKnupzH7+WrHI6KlyjF+qvG/kFW6ux7/z7P1bq7IoW2tCRUi7Ee0THsYmnvCNvEoDFhxf7DvpoS/R9GyffAu8J97eT/Ph3oG6KlyrjgSc+k3MYKWgsxTIMkPeJIC4C7myhuDMnQjP34Pw7vsR3nkBwZk7ECyvgOKuUQK0BlQOznMgnYETc35avwOrf/oKDv/O92F2/WVQp7v4ohaSdn2bz6reb5/kqxfqeXfKWS1zisIJzVlE6maf98PdDOs5I4hCmahb6O5iCCDFzGkaps0tub3QEvobDEHi2yMhOQdrgMQJ78jiF6hmpDWBar/IkZyVVL7AMoLX2euepkBc8bwTwbioayQhkwQq7qCnQpzKNcYHhzi49irCIEQQhRAE9Dod6MEQTEAoJUIhEAsJQQSdZUiOjjFlIGBACoGo0zH9JQMEdl76bHcXwdERZtMpoDXORjF0khoLhxmQEmynFRXWN/uWulsVa37tagDlOGKhucyT+PzP8ibN365G2ik2sXejCgHq39xGixqewEW9gN3qTkD2kJIxjZBusPjmzlW3jrxLWUDKc0PJTeUX1sElud6C0+cmHjQoZvNbqkppUcgbVy5uOxHM+khW+VM5OMug88yQsBBApwe5dhbB2TsQnr8P0YX7EN11D4L1s5DDZYi4Y5pniZtVDh4fF/ecitSy5o+IwJMRxNo6Vr7le7D9w1egGWYZYO8a6hxduZYFSv4cp889A/NWO2OBRb3g/jXdzmZnQIPpoJXtl7KRLktc9fE3cowYeb/butyBltDfEBhZt6l+7Nxb1oWg9ybmlZaAe2BL4V0YKSdaG76QrZtClfNWj2lItO053qvvN1dLmPFmFKXL3QShNVSSgMIQgyyHTDLw4RFm+/voLC1BMtDv9kAMUCARxzFCGSAEENv1zdV0iiTLIJVCIM36NDIwbnQZRQiXlhCdOYNwdw8HN28gJsLpTgesFCQRQKroC3bWREFsXFrr7rcNBHAkzh6pN3TeCffDIwp3G0/U0hrqLUh90UFNAtc2iKwa4F9vhUAbtvlaAeply+0nu98bNleu5cSiC3Zw5QM01yTvNtQtywV1LSheIW93kVqBcwXtyFtpsJSgbg/yzBlE5+5CcP4exBfuQ3TH3QhOn4EcDCHCyJwgt1Z3noGzxC6k6gWrCgmgmq+8bI9RSPVsguj8fQjvug/JtU/ZqO/yOTa3rWZxe/VVNi1SnnzyB06wprH4Rtbqnn9W5q+x+b1gm8e9rJLB81niiioJzMgTrTMAeHq+1G2FltDfADyLSxK4mvdC+b5hEK3MwIpIyIK9a0Kwajr7aNBu/eCVSrkmIWjKUo2cXZCPs75LZ70XiAfrei3G203Nph6yVnqMIE3RS1Lo6QxyMkXQ76MThtC9HgIpIIIQnX4PURhCghCwRsiASBJk4zFmaYqAyFjpgz4IBJICstNBtLICORjg5miMB1ZWMYg7SLLM2JHaLJ7sUrlWXOB+lLuTHOxtbzS966bcop8897Uq61wf1upuyCznrKLSkkHDs+Cdz3oiyqqoWlEjvIl0XCcXjyhcYp3a6SrXegLZV7iAPUXVP7TedVRVMD0JX+xvPLfVT8r65rUxMz5rng1zCzRY5fPk3etDrN+B+Nx56za/F+G58whPrUP2TSpiQBurO8uBNIFO7DohbgU/GPKud08161l9H9l4DQLnuVl3IAiLize3mmu6WK0jGu9JvdPtT8vANVXAK1euG1959OrReV691fs890DPX7Or1gatFtN02VnoBN9n5VQZIs6UHUN/egO80dShtwlaQn8D8Cye0MBVEIlvBpVmckXIFy8R116yBoHr7XXbq+K+QfjXtjploCTnKgH5ZOFe1ELoOLHrAuUACKWgZjPoKEQwnYHHE4STKSLN6PS7CIMA3W4XLAXibhdhFEGSgABDKA3MZtBJgvTgEBOtIQPzqAZxDGaGCAPIOMZoOsXe6Bhf+pYHzXi8teZNFLu5uopsbyD2cvv/n70/D7os2/LCsN/a5w7fmJnfkF/OWcOb+lU+EIQA425L3ZhBIgSIwNQLhETYDmH+aEmAAhtsMK5Kg2UjgUIhWbZEyEJ/yBL2E9iYMI6QHKjL0YSYGtS0upueh/de96scvnm69569l//Y09rDOfd+VZlZWZ13VeV37z1nz8P6rbX23mtnwAH5vtbQQl1MerEeh0McEbTG1AVgpcKXyDOoQOJ5dQ8AxXcyvBdmRP7UxWy7ZIFKHfvCFyKRbz4BSkn2THYD5iJ5VrquEHa8UGJMWPPmtrW/mwFoYxPq1j2M79zH8P7bFsBv38NgawfN2jqoUXapxpvNL89hvIhL5CcFnLEtA8iMBGD3ESkFnk3A0ylIDUCmhZ9jRMJgnUhM8rsQ2Gv6QMgIcYzk/dglrCUvOkDd/QnCS0X4Cu0Bgl3+Mr7yIGa7zSU3uXs/ADbB2TrWlmvoWAL6K6cPAPUYj82/f/cLD5Rq/gfW3G79AQgch9DJBHVI84mUXsJJhJgI0RDPLJhHFPFsgklsgBKTXRHDsA2nABgCFBOMS4NhhYNmMkE7HaGZjKBOz0EnJ1CXl1i5tonx6ipmbGCI0AxHGAyHaJQTKNoWDECvrWH2fB+Tp8/sETalsHLjOpRS9v3FBX7yp38Kt7e38eD6FiaHh2iaJmIzG1cPFGBXaOy+QSTAl4pd2bIFiNYAqHyWAhcqaOajub4K4CAEhg4NLCYn1725EiEXElycYqOSjGLDkhgSWfYldQICkmaOn6JBctDJ40rgDmV1v/0Zb63B7dRq38YAHrxv38fgzgOrdd9/iMHtexjc2IZaXQWpxm6cbGfgVoMvzsAJeFNw/pIWyxZivgzUD+a2GgwiBZ5MYKaTKJBk7RYEP3a9nwlmqfyZMYu85F1ChkyPEfUQuQbS0c+UxBGFojKc3QDn3b5mY70SzW5roPZ0NG3LnN88WgL6KyZ/9vy6an7b5mC4NhHm9mQtLAx+96xj7vfuis+e9es6fm0cYBagnjMni/5QjqFbME8//cYiMvbu8nY4wuj8HHx4BH1wAFy7htHKCgajsXWL1yjn0U3Z3ekctShmRnt8ggutrbZiNIbrGzCTCX7px34c3/r4O/gdv/bXgU/OQIOBq6SV8K31AFXQTXHCLxX4pk+3A9YajjimMp95d4haXPleoGQcE5EPS63c/0xBm4O9M8ujeBbz8wJArqCl4SmRY2Rxk2FbxOtLNDJ9aTHoTCP5ycmDcDRNKZiLC3DbQm1sQt25g/G9Bxg8fBfDB29hePsu1PVtNGtrtgJaW0GynYHPz2C8MOQrVwXvrrrUAbMo/AKJkVIwlxdAOxPjIp3N8+Z1vd/LZ5y/yvuMUQ49Ej+ARPAvBIos79TMLwaUEYIT7LWpxl/MwrZAljN66YSnT47OloCOJaC/cvo+Z25v0PwuP2AlI+yc550SLdDHP+TU79PULR/15vUYqc7go0bkd8cq5rD5zLjJyqSgJhO0FxdohkPQ8Qlmz/bR3riBwcoKSCmoQQM2BkZru27ZzsCTKczZGfTJCfTFBYz7Rw5J9PY2zr/9bfzdv/WDePf+Q9xVDc5mMzRKIZ7VRdA401rnjSo1Hg7CiHxesE+OKZZ2lB7NMmvIvF8CWHfZR4UJOtW8JaP3CcdSe3CX4yVNWoJ6/jp74pKVIJ5vVOuoWLUNZBGS7DomAue/QlP77xYM2qMjDL/8VVz7zb8d43e/gmbnJtTamnU4pLUdZ20Lc3YaMw+b1VQt6x4Su0wWAekFAoX0lII+O4Fxe0OSl54EhiaNlgMwQRw7K997YaqG3xFwKeVT1X6ax8wqxBQFK44aetgnYOIgC+Z78jyMpperWy3wywtm9iuXloD+CsnOu8fmP7xzZ5eU+qenADh6bQaQjv/6xMqeFxpNKa/neNJP0lWGiBHWy12mjosrt3mOCTDMUI6zMBjGc9vJBJPJBHR2hvbgAJOnTzFYW8OAAG4UZtpAz2bWd/t0Cr64AJ+cgo+PoY+OwRcXUNrgUmto3YJ++Tv4Rz/099Eag++5fRcXz56BFMH7gLZAbIE8LsGWPtRTs7tsQokq6fG+lMS7EK8MQ3KHVgWsqv1S5ZjxezSNek6eCwFOAIDUgmQyFSEg0dTdu9w8y8lHoKpm3jfgkvBZAycSVVdSUhizfWvc5/T0GBu/7Xfh5h/4n0GtroKnE6t9n58h2F5cXUkpIfj1k98zIn9LAWUudoV5s0A+MVmYizNrueqdyLLv5ODiANQe1JGHQXxvN8Pa3xQf9QpXvb4MAg77ustxWjl2F/y4xzVyh+khbMWSM/3R936szXJ+I2kJ6K+QvoH3FfANvUrr//2NweDGjNlQWIiTWlCqLZWD1EmnjIwxohI6ZZYpT7DPJVZJTYMFWMT5k0re3uhlGNYMH9K3PzQBMAbPjw9xezAAHZ9g8vQZBm6HMI2GwHSK2ckppicn1kx6cQlcnAMXF+DzC+DyEsQMPZlgcnmJn336BD/5Cz+P3/NP/FqoZ8/RGnYTP17j4csdGUEdEkoNpON3phHNQZtKTtlX2YbwooMnwW4DR/W/Bagn5c81IgHYfgmBKH2VFKrC4PteV6j3WFst3/CcBPB0R8+fsANi7+fbEGFydIjV3/TP4NYf+sPg8zPo46NwxSlU/eqKNP1UcittMJlEdkUESTaydVBiiiYCnxyh4lmlGsd+L2W7QiYsTOP1UqXjUAh/yIJXBVsKzSU3N5KXLJwyEMz2gPMR4YVfN3a9Z0fld7XH5F2PTh4/hm+g+RLTr2BaAvorpJt4QgCgaPBbh6rBDGxAlQtyxIROlKlEi5FAXZ+IXPlWBvC6mNzdHtfOnawcvjH8WpYL5ZYNlGN8hgEFhr2owkrbg2aA58eHONUaj1ZWMNs/wOXqGpqVMUZbNzAA0DDDnJ5i+vQZzMUFcDkBTafg6QSYtSACzGCAn/zOL+Hb3/kO/tm338X2+SWmWkORkqUr6isvqQhQ6JmFC06QmqlPIucN2W+qBKlQJwN3L7zf6hRDvXVB9rHMzJc/7Z3geatDo5K8swB/AbBFmfMH2e9c7imy7xyqvswe1GM9y+Cx/lI+8wcapucX0Lu3sfcv/UHg8gKsdenTv0LeyhWVWXIyYRw0Ho/6jpr1ZhD2c3QIPWmEhAfos9Nokelt6Irg2Cs5AOkmOXbli0fUkjQ6zxt25clJ2GJZgCtf2UCGsgdRantaCOR25jFjWmTxhtIS0F8h/SZ81L4PNKpRv6m1E8M7j0w1rZyhiS+JA1cHrDUKo9pPQI5vavCA7FkoEUWXmP4UKLvnHg0JBON4AgEwDt4J7o5obXB3fQN//Rd/DuPVVXxBESbPnkGtjIFBg8HaGoajIUYrK5gB0GdnMGfn4OkUyhgQGMfM+LGPfxnHh0f45++/hQeDIS4nEwxUA3sjMhy4RU0m5Tcs/sI6gBYcIuGT7NtahE80fE4++smLCvFXQlx9ilg4TvG8smEuMb+HdCVyUJrOAiXuKkofqPtnfliSDMa1OJWHfsmE0vEoGzAeSuDA8A0Ik7MzXP9tvwMrO7tojw6t698rUN608lzBVTG8TLtb0KoWwmOn0TCnx+5ZZWFAtmcpF4pwnKRdbLBM2teJh5EFBBZSmNczGbIUBGO+SV9mzUGes2ltN8WJc4wR410o0VF21NMEAD78AITHbzagL69PfUX0gWvr33r3nS8MQF+ZOSE02+MJ/zRM6IQo/VyEQXtGLNIIqSSTn5J3MjQBAjDCDlOEO6HJmhnsM6Ah64W5IcJAKZAxuDMY4uF4BX/5J/8xfvrJx5gd2ONok2fP0Z6dg4gw2ljH+Po1DFZW0CgbfwrGT5+d4m998xcwPj3Hv/DgLdxZXcPlrIWCk97ZOYNhk1aVPXPi2A7hJ3vxv3gnm84+S73h5dAe8shf5v1Q644eYicWSa2kM91iSaHsSRsui8tpiAJr8++1/DvarTOJLKxbMAEgzNuua4q0pQArhDFjDDSAlYdv23GQCzivnDxc9pxFr8RJSu02iZnzU/tbjuU5FJot6QTOwnDRvmnZ06gkf2SZJZwpvHa1KSZOrENeojCH/QZF5uD2NQ0f3zOs29cP82q8gbTU0F8Zfa8CPjKrNPwN64PhcArWZH0/yhlcYHYkqWvWNrWUVGjhUsvzwgAhTlD3Po8XtXWfPwmNNb7zR9mZ2F2r4J1nKJjpDL9pawc/80u/iP/op34Cv/vsFF84P8f2bIprbYvV7W2Mmga4dg3t4RGOjw7xzZMjfOtgH81shu++toVftbMLEGHGBo1q0vby9eFSG2YHylHTiuBWmj8lpyk5p2eCAV8DoIo8c62pQovIYjKBep87i0m+6S2NupjQJ/huYNC1QqYDY266crglRWJbepkGz2248oKhYJI1BhiOMLp5C6yNEzRL7Hm5JMs+32lMPa5oI6Wsz/jzc8ALPbVrj2U/V9q8lkcYt5RvoovB+tfixUuqDDWGUOdlougeNwywNmFy2emcun3149KvzLjPCQB848c+UwnutaAloL8i+j4AjwEoUv9UoxQYXFxXDD9h5dgPMzNqMDnA5lRliXWFLf4Mk1JI52HHq48izqWT9z4V3b1K25zcP6OI0GrGhhrgf3rrAf7j59/Bf/rzP4evPn2C+z//s9i6dh3rm5tA02ByeYGjoyNMJ1Ncaxr8kzd28F03tjEeNJgZgwaA8i0gTQxe08gZkPgSeIxoGXa/qeD+FaZZoAkK8jlVHZxl/K3KBJE/7ONR6VqnZ+TzKF8KTcrmP7yGFNboOTDY9CQBnFxFZfuL/ACgUK7DF9EwPZ7hpAtY392+AEYbqJVVjLZ3rEOYRDJ+BaiebDC7ilZeT4LhAP3i3O5yJwKZRfbiW2IxxpKyVPoowV4RJsj6PQCcNG9N+KtdnSqD5j+MdsJ3lE6qftxdAcnymsuOEr5xtAT0V0S/CR+1HwAKRL/RshtKvcPB6VvFpPAhapzSfVYm6KJhgQwEcoDMw3oQgfcZHlVzv8LuXU0ifGcMlELLBtujMf4X997GD52f4qcmFzg+u8DkcgI8f45r6+vYvXED/8TDt/H29g62mwaq1ZhOp2hnMwyY7fWsxmlAwtVs2NTHsgpyk5sHn3j0SIKa3yFveRBXcIB7caHE+uicJ3nD2WeX4iKZKroYYHzAyJ/LICIxmb1/7MHbvWFj7DWgugWMsbiuGhijQaMxMBqVx6hq34typHWuvqwKNR1BGKEvTduiubGDZvNaWrYXTjUBwXtb/OTZEpU2GKUU+PIC7H3D58JkFUDL0hYDqHArKSRwkZDsruLoZoifSu9+HHZ2cZxkRYMR26UTMTvthscqoAMUGc8lALxfDfVm0RLQXwF9AKjHgLl54+0HCurLM6AixFdPhkaSR1n8y7ni+tW0kyS01DQcwKWW+Rg60dz9d8fh4rUtgCKFlhnEjO/euI7vub6FqVLg4RBqdQXj9XUMV1dAqsFMG0xn1vmTgmVuxN5vvLGXr/gyFmt6ETVL/pOHlV9jWf3yQY1vRcbElWRE3o6b9jL5kq/FAnPUartxMkXpsGu/CBzQO2rdzHaNtp1Z/+TG2EtEVlfR7N7E4OYehvfuY3jvHpqtbZiDA5z/l38Ds299E1hbs7vIqVb4Mtv+Zx3jNNPqqjZ099MC+g00q2tOQ88TqQhX8/LvDJd+Jvvd+gSazlS9pSUbZKRgLs5hJt7tqyhj11G/TLiKG9b8w54B1THgg4WlNgdqaVXfuS952Iyh1dy+suakBqH+Pgunof/Ak+8l4CO8ybQE9FdAj9yw3RwPftXaYLCiwYayQ7FBW0yYWOkQRJ4wiXwon02179njgqH6HLNYQqPMBfQQukcB7cr2VGuQse5cSWuY6RTt6RkwGIAGDdRwCDUcQDUNmFTKSLIzS7mLV88ccx5YK1ngHdlrDlVLK+dz6LYMi0x7NdI5lDVk55HhxH7OsUKJ1g2AjfVJ7u/wZgaGA6j1DTS3b6O5exejBw8xfPAQwzt30ezsotnYAA1Hlg8bAxoMsPbd34P9f/N/h8uf+McW1LkYpSXmVevnBYzFmiMIIOF7bBwGYLTG+MY21Hhk15ydw5jFqCdgECLyCpH7v5DLr0gU53TSX4BqFGZnJ+B2lpYyn+LVuZw+mXcRTPX9VYSTLGwK/lwO3NptPMyI5+0pzPXEegYvkEanNMS0NLk7WgL6K6CbsJIjDZpfP1INLuyxWSWl5S7NSq5Zx2eWSlDpY0woGUHyrn99Ln/HyV8uw3D9uZ/HoTZ+Q5MrB7Vsj+poDZo14KYBNwOwUnbncvBew+Ez3BDHUhsWjRqzitgn3iQb2mLhF2qDSq+U8US/Vnlkh/KSpwEIPsjRImI/COEUpDH2CtDZzN7JDYBGI6jNTQxuvoXBvXsYvfUWhg8eYnD7Dgbb284t6sABv7tNbDoFTyahDMYYqM1ruPUn/jS+8/hP4fLb34Iaj10JctWwpzKy4tIRQK1ZMtlI9CbYWYCYAaMNhju7rg5xA2TECr9Jrirloa6lE6TwuJCP9k9AXbIPkYI5O7ECWGdMpA2VSP1IZLxiiCaZZpOiGqYC1D1hq2UNQYUgGIpuncowE6ixBQ4YXzRO/ODlGnqgJaC/AvoBfGQAQIF+gzuvnV07nUrm5aSozxI7UVOm040IPe8gWFmFr3EyYzOAzhhuAYb+vQgYTNEsVpk9qBsGK7a+4ZmtpxptAKXAjXImXiUqJL3B+adR0KiWvCo9LaLOcfktEcb6NCD72bdprRDQqmEJrOJhRzbGgvZ0Zs/wEgHjMZpr1zC4dQvDBw8wfPgWRg8eYnD7FgY3tkArqyBF1itXuJDkHNHbmJe6KCkwKWsCVru7uP47fzcu/+L/2fZFleOKRuoC69zmI/YusIhXkT1jf7rvDGC4e7OqnyaCWza+5X6PcFw0Ea4omV6x7C+AiKLDmqLUlvTZCWBM6oYxI4vnHsTrgXx7dVpTINoHbix2XDBR9F2HxFpq6TJMWg5b9PTqVLCxF7PkJ2r84IigvgR0R0tAf/lEjwHzF+7fXyWiR251j9IjIXHAllpfh+TsQyTmKIhAc1RMKQckE6QE7SqQgUswF7+lvp9YyN2fyDRjOmSMBSvhxJEVW+1cKZCxnyATwKa8Fc4flUP23CXphYm8YFltk2amLKzkZbIBWFTMh6skHtLPNR8XILBdD6q+s9hY4G5n9hILItDKCpqtLQxu38HwwQOMHj7E8OFDDPduobl+HWo8hj/P7DVvfyFJ2AxH1OkWNSd/lEpduw61uQmazazQlQ6mskFl28ECQgQG2YZVebB8x/G3F0SGO7sRELIspYU3/YJkOTofy/59nt6nIwpDyo4ff7NbmgkBMCfHwhqDavNCvusxBYW9LjX//MIUQrU05JgOk7hWgFo5OsqU/3bjiNk7SHENZLjshFAYgGlpcve0BPSXTB9YQOe1Vr2jRupuywAUqYp8Wnz1lIz7ykRNWKmcnCLJgg/knNJ9zOMX4XsekFMQ9yDUxZzZl9P5dCZnPiUDkLJmdBgGkQMLY697IWYLPg6IPJxHBS/7DqTntGsVrGiC/ok9c9/TELmwk0kvuWAQxaVM85HgysbePDdtrdlca1vnlRU0u7sY3rmN4cOHGL/9Nob372OwdwvNtWtQo5FNy5vMdQtzOguCBpNzBLQgeHcREUGfnwOkrGtVNokFBhn/LoasDCN4dXWMdsimITwD0AwMhhhu71iLRc9aMIm/ybSjTJPP3n96ihUJAkSod5oRs7vkyBjnJY4RdreJtPy6d2cxM0BmOSArfCSmnRSmA0xraYje9sOBCu3FhmS2VgcRl1nHceQayZrg0+hWzrV5OD/+S0B3tAT0l0yP8D4B38AKVh+tNYNGgzVATaqdcSIVlztTq0pON2UTrc4PEzTpDNUP8ZkwkT9zyTJKYPfGAPZgTn4Hu5NH2PlIMwzAWJHdEPzhfXnUiv3vUJWMYcsNWH7HvigPVfyfxytHe9y2zmmbNITXjLyQ4cvsAHw6g5lN7R3wiqBW19Ds7mJw9x5Gbz/E6K23Mbp3H4Nbe2g2N0HDoU2nbe0Rs+nU7oYOlfKadyz1i8En51/81JmCnR/9FLq5GBdVzdf9SYScPFD+leV3O7K00VDjFQxvbMVlh6LUIp0OjJLleaFYHkqcAnFQdPPMPEhrbds5WGhiWrHNO7KpEoU2q2+Ac/NJTJci0VwWDdUqpKY6yfghTzd2jEkzZyDcpCqTICSN1oAuenJ8o2gJ6C+ZwoUsin/tQCm0BPb6kR2oFTBNZguQDOdM++mkHk20/NG9Ia6mNVU3wdXCc0fKzKh5N8t1EJuaA0J764slw/b2prD7PbahvPZVmq69h7ekWUNGnsuU/cAinF9rTbS8vOBVddR/Y7cdUtnjYhcXNr2VFTS7OxjcvYPh229bzfvBAwz3bqLZuAYa2o1e3LZW+55M7P3wQYih+O8lk8+hPTwKwpH1VsdJM1rA6hF4OPZYXH9ZDEqjtz43SrQGbV7HYGPTgkKaTWkyn5PFC2/FwqYvRlAtM2ZQ04DbKfjizGmjzqG5GJMBR0U6Ccgm3yvjNWcvQtLJ72ypjfGyt7pVh3DqpKiwT4XAxrgVk+DZ3a6fJ8lSIrDbZXez1NAdLQH9JZPfEEdK/Rq/9zadCHYS1VhZcSd5heaywA4h/mokANNLziK12lK0vyEp17AKzUII5EFDd88TL3mCGcbWMgG0g5bOXH4PXL2iDnkcmsfFC6VROqLpCitEH19kpWDOz0Dr61j/Lb8Zq+99FcO33sbwzh0MrjnN24E3ty14cglzYc3IEsAXuUXspRARuNXQR0eQVUs0Z1AKNPMGqZSaukChJw3TaqiNa2jW1qzbV1ncnixfvviDCOYo8Lw/mvMSp8+cH/eoCod0cuG52OMZfuctkjrZTQUAdmBt5948ZzlyepZCRPxu53RMLMxi/57g/AcwwgEgI92+xlJYBT3yUqOWJndPS0B/uUSPAfMBMCLQV/yGuCJULvFmeOff5IJ1/kmV73KeyodSp+3nbrl2kRU9AboyUMF4RH1ktvFmK6G9ZEsR/kuMl9Y43wAXE4p1iGeZU04V1+4EQCe+qENiSS2SohVvfNqu1KTQnpxg/NWv4vYf/lex8sUv2rVErcGzWaJ5BwtGB3i/MkDK6qEUgdsZ9Mmx58JJmapSnPxMCp297JE088McdtzaHje6xXhrC2q8Ap5cLiCddYDZp6XaHBGFZiE5hmw78ifvJe7yAoE5VJJPssqTCsNXjG0icI7SHUpziFpIrlX1vLstc8GgKiiwM7nHIjHXvcQF8YitBq+09eX+fXt7fc3zRtDytrWXSB+4Mbt988EDRep+W5HPWfxNHuaMUc7oDiSphEZhsQrvxeSUkgJnyUuGVMt0ESqiiCYQpveuzw6pwIKwbyfmpLLJMTmutB243jjsgznLQ/JvHjuVn7EcDAaTwvT0FOorX8GDP/u/xco7b8McH8OcnsJcXMC4tV9qGkD543mUpL7I6cSXS+yA5hLm9DQCUlH1ntIlzVNDhHqUpOmzaWS0wWBrGzQYoPAEOI9eZEMWVxk7ByjkPytju5o/W1e756cw00lAt3l167ZvxBDyMIKcCkW/cI7PDoVrTCYpgQ9bMqfuLbKw9TPGRRO56lI49IKuiwYmuM0j38gL9MbREtBfInkPcRvN8MurTTNiu4IajE6BMsZd/0EJtuRJ9JKUsvO0Haj5eRTwUQTKGSoXX2JIrsxlUGXuuyJ581lgeu5pML4HwUYAsMvEa/EcniGGy8vH6fP4U/4oWhhFySV4FWCWpm8cEzYMzKZTzFZWcO+P/mEM1tdgTs8CeEOF62Y6ybZTvSivkkgp6PNz6LMzW6qwkUkWjItmLACZ6+HmUSKP+WSMwXDnZumT4ZVSamECEPd7Ael0n5cUA6QI5vzMOZWh9KX46Ihe/1ERXuelwEW4vkHIabjaVArzxc9tYYEz4gw67Jz1Grqw20m5gQwDpAZLk7ujJaC/RLIe4gBF6leN7E2ppjadc8k7nQeSK1yR+3WRP8bE4p7vHIjdZEsfZTL2VQSKQBSMAgV8U/wH/xvIwE6Cpv9ekTa8RiCAnEPY2I51oEmy6cTt0CK5oBALYOMSYXJ6io3v+R5sfOlL0KdnoMGnX+36LLR01TTQJyfWtI3YB2kXC8brGi/1uZCOY4/t4TfXQsXA6Zi1ZvfRzk4t9CsgBzVu3Hr4sUo1F3VbOFVS0CdH9oIckWpyY3pNaKpMhdokJxEnCdcxqoLwmyQc48ksat0gter62+jHnfx+F0Z601qiA9kDqsZusLXXp3ak/ibREtBfIj2FXdMhUr9auEyyfzkd91VzWhZHgjs77W9hZpHMWqrnlweuqdpJUl0zt8bgHTSTY3deK/e7akXdgjaazOWMGVDlWbIRzzKvuDkv43QVACkoQ/Lw1ZvRq0HtN79ubtw6n2bGxntfBbhyTtpX+rUnu6dBHx+Bp7P8VcnMu4Sl7HWytspZ+PAu6yEPloaBpsFwe6fHAcnLJDGf7dSC7fkoil61SD68OT2xXhJD21XGckeRihChEJk5nfKhVw54Ua3ePMu8steJ5SzjMa4Bg7jB3tqXbw1ONXvDgDLtUkN3tAT0l0hfxzcMAFLUfNUakyj6b88mUt1tqDxvms2moM7mMUremT6bt2/e59c9f92SHjxIJ5OtL1UHwkQEFTR1CuvFAew70kkAPIB2FqhibpdMg4uwInyhXXAazr/3nDANFUrJ2QujNWg0wsq9u2BtAb1Dkflk9MIS6idiAEpBHx2CddvN5LMmTYIRJWCHWpg8rS75ErCXxozG9gx6cg/6K6JgUhKFDL4SPnGiIFgvcaWFqRJ8njAFvxRRgW7OBNoa85CP8/0oWZ6hjNU1uqxM8hsLDV0JpaXqx93xCwZpA0wZUwB4/71XNRNeX1oC+ksidrj3723e3QbhnRYMpgoXq/+0zwKOVE70ZvOlCyDqI3z+uM9zlKAtBOQyrci53Yetsgobg0jIItL8niSaSOF2gxqnzMSrPsp5K/NMVCnHv9L1/Kj55aCO0NCc/hTcKVvykHea5kxUbsxz/4zWUOvrGN28addEKRNb5nTH3N56hRhGzGgPDjN3r2VBsmtywmcY0wtbl6IUVWsvozVoZQWDa9fdda5Xqs7VKQhz7h87QcdZn4IGWVklWjgLIsCY6FTGJVJuH51Dibybmc56BYAynfR3T+B8/hdRO+JKP+5eQzdZeBnV+ZjSzDwIm+KWtDy29vKIAPDq+so7Q9VsaaSnMIt5XwrQ4kUZxPpkBuLCHRea45yEe3Lqft4N9KIM8cPdK25/xbUxYVqH13AyCloPOcMGOa9n9jm3Gsad1SZm0GAANRzCtDPQcAgaj632JtokKE+9bR0vPqkyZ/+ugxkKuSH8MrMZBnt7GF63oJPklqVfy+4V65xVYlihjI2BPjoEUPHl775dBb8Cv+6sZNR+peLn5SajNdTWJpqNjcKpzMsg7w/d/iB30x+FIVwVKK7YgUQEtC30yVGwdactmwm2krrGazBVd5MwLqAY+5w/TtG1nmAWn+LsSskKMBbACckaesWyYGNY0FfgdgCroS9pCegvjT7E9yrgIwPQV1ebBjO7w70BUkYeh2t6ipqKL4CPm3xnL7l7s1pErQhPtZlZ+1XSfOYszI0SzQF4P+2B/2UVqjM/ir7a4Sb0bAaetdYtKgFqPEJz7RqGezcxfnAP44cPsHL/HoY3d9A+e47n/9k3cPkzP4dmcwPsbHZE0t2lu6Ix16IS5hlrL5yg9TLnvGXZyS6mbTG+eRNqbQ24TM9JzzsS/DqRv5ilPThA0KLEDrZyrETG3A/Y6A7nN3CKDKLSRjCtxuDadTSrq51uX69Ockx3hXBHwChugOu7bW9hYnc0cDaFuThzzeLrTii043nyuhf6OyivaQrqPRkIN8bBnO+NAC6RPrmC8rw4npbweG6kH/ekGEEVAIPaSTucAcCHnbV8c2gJ6C+Jvg/AYwBKDb7WkMIs5xCJVlZ6hAsQmQjCclRTETY+8BMjAnvUkxdhV33vU8FgkbQikCfIDiaypngP3sZYByttG5hzs7aKwdYWRnfvYOXth1h5522svP0Q4zu3MdzeQrO66i4IYWtyHQ2x8et+Lb79p/8sTn/kR6E2N9zZllKVYfYWAlGlGu+SrythcgEgBTcLOqPbt6CGA+gLDjebvc7gXZAHmskE+vTUtqfXiDlbFOqWHwX58ZCp+UX4+p4PH9PoFoOtLajhCGZ2tvCtcWU58tTrYcMVs9mQ8tewflpMZwCkGvDFOcz5mbVKVZyrzCdh2ciFDdE/uYUkLX5FyBKCb6+wwOwwP0043PYWosa5H9V4W+cgLIZwYs0yZjvTq1ZD//Ax+HFXc7whtAT0l0Tf5+9AZ/UowlgcjHGeeNCt+zbP5htKZtPNOXNrlf89H8zrIbjyw8N64qgmX6cG7CT1ewId+PJ0Bj2b2c1MSqFZW8Nwbxcr9+5i5Z23sfaFd7D69ltYuXMLgxs30KyMbfpGW429be15aM9IiYDTMzTXruGdf+ND/NQf/eOYfOvbwHjsLnyRTSbtIhmzi6/rbeB5OidJhQASm+wdcYzRndup1zuKOc9Tsl4XItVAn59Bn51aEVSso1MAOxd4oQXyuaifhZVCg9PcjcFgawfUqE/fjnOkU4vjrs+kZcVZYvzq16ftS1IK5vIC5vISAEUjV+f6c60OjHzu9wobuRAmteFFJZVsftlb1nImRGna/q9wKuPVG6PL+kq+6S5ibDEzsyLgG0pLQH85RGRdvg6Uwpc0+Ue1edPNQTj7LoZ/FkLOpCxWkKKl7Wpefmm4YhmLS7O0LKS/phMEsGEY04KnLcxsZj2iNQpqfQ3Du7cxfnAPa+++jbUvvIu1tx9i5fYtDMNVoOzcotprRNuJXSojt5ZOqnIV6HAAfXaB0fYWtv6Z34Jf/k/+U6imccd/ehjiFZlx7QROkSZb7YhVg/GdO0LTEsfraPE8P2uiRsGcnIAvL7utFF3Dq/Y8Yew9zDtT4v13Zju+Rju7UcJamDILAbri23DkBkgigFEMIr5+OmIGNQr67ATsvcTlQdyfeO69I9+KQF89CSvCO0xFcbtExrjm+Xj3YzwIy6Izo0VSpCBvWnOFjZ4gM3LCO8GAgClftktAd7QE9JdAH8Degb63dfcOFB4UPtwL5KBEc65OlEIVzH9nLEVK6oEjphwpFy4icfJM7rvLbyJh6QmGGaZ1wD2bwRgDNA3UxjqGt29h7eE9rL3zDta++A7WHj7A+NYehpubaEZDq+3p1oL3ZIL24jJo3eFYW0OYu07JFvB51oKHQzTr6yDD1oWk1B5FPdhzKNmMudYzl9I288+MMcBohNHezbjGK9R7jyEdFtGOB58BOZN7e3wCns4cbxZ1TsCwC1j7BMryXRdIxZ3yBqwUhjs7tnxXsncvaBXw1906sPEnRX2XdCq2ld+LkiKF2dmp3fApAdF95kDeW5Mg0Pe973geTV/V97kiPzfNSlByEdjfkyrZpLFLOQpxicqOOwKRkykYM7O5OwN+ujvDN4iWgP4SyLt8HY1WvzCmwapmsJJH1oCra4UMd2e4j5NOi9J07NU/Chp1wN0MPGR5kudSM3Lg6mcSswFrDePM5sZo0HAAtbmJ4f27WHl4D6vvvoO1d9/B2sP7GN/cxWBzE2owsOtlDvj54hKz83NxFn0OePc2mFcbbAB9cOg0eCHIBM2hlnDQxdIwvZJWjfwROIJpWzTr6xhtb4NbHbixXXONaJ7nF/YcdfDTV022+xX0wQF4NrNWkgTEJbSkMBPrlkGPGHxhfDI6PBCm2prV0BloBhhubV9hh3sXBHJYB0963xVMyKw2lUoZ+8TtRYkIgLLOe6A1WJXpsLvy0Mvniam/Nrj7tOsOMI9Xpwq1vjIP6ouFsqyMsEEuES4ynuVN7uTOEbDdFEd5uJB/uLxoOtqatZ0FeMNoCegvgX4U30vAR1BEXx2rBlNAgzCoScv5NYJAnS36CREE9XS3nJivHJ8QIM9xSpAWUQP4l2dE3VRSdr2UZxOY6RSt1uDBAOraBkb372LjrQdY++K7WHv3baw+uI/R7g6GGxt2s5rRMDOreZvzc3u/sUsTAKAIhKYA77q2Vb9mVpY3gGXbYnZ0FI/ACLWGBDOscEt4wSBhJEIgiByUy6gQyxFkd7g3Wzcw2Nx0bjx99JiPTzqxiEgNyIMcp8PnVSnudtjakdoeHsTC+Zddcdz3eZqsnwUBLIWwG9ILwiWHH8YY0GiE4Y0bV9jh3q+Z+3Xy0M1OuugC8hff/lby1yfH7tilin4Rwkc2p3MqGjgVqSjvDOThkQbI19BrnVlNx/4oNpKKsLZuHDfFidMtVkOvt7F4Nv3rf/GHdLUKbyAtAf0lElPzq5SKw8zBJuS51QQ0alqyjJtMQjmL8nOqZAE/V3Xqignya0/DTWMuentyAlpZwejeHYzffQurX3wXq194F6sP72O8u4vBxhpINVbKduZ2u1nNT1BnquzcgbzoVFzMrEpEMJcTzA4Obdpil3Dhp4JF7qJPCk4iUdpHdP1Q3VHgdvnqWYvV3V0MVlftJidXfgIVG6vSXdNeC42aa1X4eCHHtPrJGwnYGHdkDaEhWf7xQCzfBU0vb8I47ksxEqkMlk2EMOq1hlpbw2DzmgOET1q7ipbrfoXnBBTy7ksg29cG5vjQCU4OzZMpms7XKpgGhlEOHNm+afj0tx2fHeOrirQhUiI55EKEbOcg2BsTVBEAQUOXFYvvvaDAYGD62B4Jli3xxtIS0F8KuR3uRNbla7AO1SdHYHwVYTgPR51DNgX4khN25Cu++b/+/DQbg9nlJXZ/12/HrX/+n8PKg7sYerO59uDdQp9G8A6+2Rc8PlS2STdALbpGandjH0MfnwQGWRytErl1aQFg7xUvjZcqN7Vb4BE0bmM0xrf2QMMhcHEBOFO7vxnMC3eE2PfxfcysxptfyLnnBYiZrVOZWYv26Mg+zI9S9Qy5iuEHfpkhPuiOV+s3hnUq02xeQ7O+Diysoee95UCHfU7R45vUyrP9WlFQecFEIKDV9r55n9knhank1AGSwV7F+vA7V0IqYZN8RLwivayxEgYXG9SemPCWOw7PYnIRyAGAlGJXronLSm4teGNpCegvnugxYP4C7q8qwhfkhrjoOiZlFrAvoyaAjrkTNCDAbgKSYeeP5STdwNciu/SauQUig+lsirf/xB/Bg9/7u8HTKfRkCnN2Dp2Ad2WneWfLyGJSp+ZZX5/MxfuuSjJUozA9PoE+P4fqMN2nQkxXsixeekaDubfMWcXK9jYzY3zbHllzOp/og9QTsC9qEIpyZvxq8LtK9gz6JfTxsS2YX/P0/9LQSNqu9rrzYU3oio5lotBgz/cPr11HM14Bz6YLALocgLX8BJAJ3MnHxsta9mBmUNOA25kDdErfJYGLIncsC2SFFWHr5RaTUmw0XAjPi3JR/FokEB+Qd/vqNRvmcIKhnARFOZZuXwUtfbm/YPrAjbe13dF9InXHArrXwTKqKKe5NlMoN2LCSDDKdQ6ZgXwfeDA7AJfPGTBgGALOT05w51/+A3jr9/1etAeH0BeX7moj6zudvDe3og5lPeWNatKfe9kG3dtrhBxQJ5EvNQ1m+wfgy4kT9vPW6RB++mSiwC3LcFIgkk/skTWF0e1bgDEJhHgG7du9O1/Eq6M7ivgq1BJqGpjzM5izU5dpmmvfr4Jq3cHd/WKfUhHFaI3B1jZoOJjTiDKml5oQNPHwVwpNFOdHprQm9KJlLFIKfHlhncoQQr0SgdYDX/K7pHktkjR7GGCpiJsYCGqMxisF3GFH4SSYKJj0zR/Xy+E0dC5OmYqWpqTP7E1rH3yW4u7rQ0tAf8Hkd7hjgC+tNc3AyPuCGMjk7FRPFAO+Z552cpESuLtcxKTJeICx/xEuz84wfvQVvP3738ds/wBoGgvkKmrlIQ2BzETeCS057VOY4L2k3zft+rTQ3umaGtuICNPnz4G29erynAZFKFtvsJpk1BOMjQZGI4z39sSmrSgYSI1KrtGWGxnjqKktubwKTuaPrOmLy3SHPlCOshwkapQgRV2LzBPl7D0bg9H2ttVqF6tGkn9RB1fmsHu8R8B8GURwgtPFuXX7mlm+4g78SuNyGo7TSJ1hq9ShIXD2uzddGZgzDV4IKraIcY768/7FZUxIuI7lLwzAWA39Gz+2BHRgCegvnOwOd2CI5r2hagBY7wdSqM6HXgT1Pg1FfC+k6lqgbuLwXxqeGTAETCYT7H7Pb8Rwfd3dYJUfkpNAXmF8XnFfwCghn3bPyHmMNTYAuYrMnj1PnFUsxPC7eeTcOOESCdEXpnW3rG1vJ5eyBInNfxUdIb2tRQYukvVZcJLaSyViewZdHx+Dp+IeDBaF7wLxTnCv9Chnn8k7qaFHjXCws7tABWoTj7IgFILmJvVXSUo10EeH0BcXkOM+9nemmfeAq9SAq/1SfhUU7EfhV9Xk79/6sZrzoVwYCDKt6BOjEZDe7y0x5W18pWzCoOVNawktAf0lERF9rYA6ybCqoN4NPDX8zjWW8J3QP9llFPYAb4MbNqBBg80vfsF6V6PKEPFWy7DoW9bnKjQXzq+QNikF1i2mz/YtfzEm2XUtNw7XgQOBL3lFYm4zCqSVfaTbFsMb1zG8fi11KpPU1ZUt60d2eySIqCpQJRq+j/aC0KeWDBGhPTy0R+9qjHoeVZYq0hzLCZG2fSo82I2bhOHWFrwFo3a9KAWwsRGjmd3NuIAhXB1nr1pDV43CbP8ZzHTqrM++EYTUzVkkT3MBsJ5nEl9K+RL0i/4QYWW/dOUQwqb8kIDgt52BYP0xYaJKa2BMkhBOcl4CwPt4f35l3wBaAvoLpg/xkTsTSd9lyI/ZYHEPn+nAd0y+Z3IuQgXAd3Kj+guG1yrXsPbgHkzbujWtl0GUfO0C7ejsY8FU/ZG1/X2bhRGMMIWH2mPIAPmyeU12StJyHM3bPkzbYrCzE28CKzLkZD+BB2+bpxszQhiZ1xOLCD6LNGVtGBKAdn8fVHWhm8aothN3fBbxK/ECUERTPxsDNEMMt3fCkad8D0MojQPxuDHR/U4E6LQM0vjwqmhABNYa5z/2j9A0KgqUyeCragIL/ObqIM6s2iVlLzL3F9nLzHogEpD2lVwYZDaAcT3ik6heSFNZCGG6BIAfePJkaXLHEtBfKLET9v8PW1vXSdE7DtlVcPaSHiQvYufWy4WJKuGFabYuSHhm5jVEy/hM22K0vY2Vm7vO9eTLocBU56BQcsqlN0EbSKkG+uwc+uQEBBU4Ys5WgKxdehh410bFQkRIlCiC0RrjW7eghsOOxCnkbVNIBY5Sa08L9UlMw5+kP4nsJSjt4UE4YZGUJ1kPTctTNRYtIp30EMM5lVkZY3jtelgWykodrSFeCHBlZ/GKRHCZfp+Q+ULJj1vdolnfwMnf+29w+eM/gmY4skKgRPNFOzmP4isk339CKvox+11tslzOCoY9B81BIEMoe7g6tZZe6FcAflPckgAsAf2F0odu/K3wjbcGpHa1m0nRgUY6olP2nT4BFtMQAuP3Y5yQMtDM4hXjeTinMN+ZCHo2w8qd2xhubr7A+6VdUUhonojH7jpCJx8LkTv2Mzs6gj49t2ASHFZgToPOaexEU6xR2scedEa3bwXnGX7LYJ6nVSAzkMxGh9w4lzhuSXKP7xasVUk1Jk0Ens2gj45iISogwxkHriiEKeN2cWK4fF50Fc1qsmpl1Xngq41TTjMi+51C+UuBKalz/v5FkLDAgN2Ng7MpSBuo1TWc/sO/h6P/x3+Ohg3MdBJ8mcumrgr7i5SzNli64hcdx0kzFu3G1aDJl3qZA3ojSO4uA9ZS6uvYnsgMdhr6kiwtz6G/UPpeBXxkxsPmyyvNQLWAJlAjh2bulzidZxXTo4vci2tdNtIKsU9UrEcFICFA6xarD++hGY0wu7gENZ8U0L1PdJsweU7gQL2/mFT5Noccl6GG7JG1yQSBqdcYVpHwgjl1FDzfkctsAKWwcvsWooVAJhB/Rs90EWxSZLTMLlorpDmeooXGSWbzrBrV6nsqXjBINTCXl2iPjqxwok1Si0QLLEC0pwzVYKUVK9kA6JrKaA21sYFmbbUDeb1tQD4Jaxtp2RGbXm6Ku5Ism+CPqIOV7MBs3EYvuz7MzGBtQLMp6OIcsx/++zj9wb8JzKYAa+sox8WXTRqyy3lC3qmu+p1+LfKHjGR5u6vqEqzrN67ZF/GdZzBIu1aO4+DlLwp08linYB0uWCI1LgFd0BLQXwI1jXo0UAptMQ0Fkyn4dn4JQTrjcpZVnaCdL6sliOAufjOA9bceVpxTLKIGpOGkJ2aLV1cD6qt6QiMARArTp8/BM9/6WXvHwolCiHJ6kJmXdRcqei3a3bI23tsDt1q2QlYYrn5NMxHLMR6sPXi7YIH5BQWQ42a6rKxXFdGoaWDOzqDPzpyJ1AtKtTFRCixdGYdxWKt3ietJQKM1hpvXoMYr4LZ2N0elHEHeKGcaIHF4jkQkKQFvd0rBGBi3GdNeGW/Arb1FkM9OYA4PYJ5+DPPkOzBPfhn6yXfQnhwBzRAKBgbOM18AwmTGxuy84JFXOWEz4rKhfPhVQF3yo4iiVLznPHxlPsQ8KXuYtaExTvjwkyc8SopTfLVxloAuaAnoL5AeYY8BQBE9ypmEHZzyLwQX9l9zERsyMmSURB7IMCHxm8z5fMoBxDIOq0gY0HCI9Qf3LCAVnEKWrXxGssKyDovIAgkJ7ntV9GHG9NkzW/Fs/1ZaDAb1XOoseVlvMdi1qedFLhOtNWhtFaPdncwknCNczhVRnPMu37nfYnDlYC4FlL6yz21fthq6PjmBubgIG8t8edJiZoixUL/niFL7GXP0cgRrg+baNajBAGY26wDgXMDM5hlFwUeWPO6MT+9dEA1swdsYsDFR42aG0QbczsAX5/bu+IPnMM+ewjz9DsyzJzAHz2FOT2AmF/a2QuZwBbGiGdSwAVQjhGEWVcjmXdc0yYaU95HKoPKilDzdKqgn3CbGyodvVpIgxLrBWc2aEZfF/Ika17aJMJHkHyvHWGrokpaA/gLp6/iGZoD+EujLzi+YCoCaDU7OHnmWxYHl1MGmzuYrep/PgMRz+azCc422O9xX79wGz9rMaQwCyNjvQQqZK4AvDsqx7vPcq1Zjk7tl7dlzJ+hULuwQzDEXfmIASoM6pijb2AtSQUDK+Kzd4b6N4bVrc/Yi+IQjA2cGYm5dqGg7kYjiVauI/ZorWKVgF7POKW8SpQjt0aG9Bz2oZunfkGkfXUVAS6rt6iqeGKMxuLFlb/RLJ1keOT7n6HzZtzOBIJcu7Kz1+dlP1uxM5ibsYTDMYN3CTCbg8zPw0SHM82dW8372BGb/GczRAcz5GXg6hdEa3nETu/722jwANIMGajhABHE/uXx1csksA/tqu4q05NHHXIbMvRUxwlXNUWLIxrkcX53pijKEZ1lB/T0LjGBRMuyvThUJsc+WQhpW1uAloAtaAvoLIsdS+N/d+OLupsJbrR+9PQwsZbIpY+xRHrvyl9HDRS/+d/gMk4pjTDfnTdtidPMWxjs79sia28TDUjoAQ2qA+fwshPaFKZYpQBuX6fem0DTQl5eY7R8IRm1TlJuLirZO8skZjvvDlJg4qzDL0WGPaTXG29sYrK2BqxqkZHQ5EOUtSDGGF6ocY0sEN/b6JZW8M8/eD1j/iXKYhGiK0O4fWNO2Uv1yRtDIul+XZerKPQ3r9+IxAMOMwfp6ovlFg4UXdmD7rSoGx0tYQusb61PcGA5aY9S6p+DLS/DJCfTBc/Czpxa4nz2F2X8Oc3oMc3EB084s+AfgdkKfXYdJqq6InBtlgmqUWCIRk18IoLGZyg6oyqVSCPAyQh6uGjm2o2jdMkAS1Vc2CkfsBAFKA0aSgo2XMFn4cU/qnEb0c4GXu9wTWgL6iyMCwKN1/c5QjW8YZPtCAOQb4uwzOOaaMTLPF6NwurhyU+dfAi9S3cqb9/RshvXbtzDcXIe5nIYM8+N289a2rw7mspDi40oSDUMphfbkFO3xiY3s7liO7VECBbuMFhIeqh2RCiL+mWlbjG7tQY1HaKfTSptx5XtMK8peTjBxA8HfwibHUgGBmfKWPws75nuq6QUq/2C2v2/b02tHeRWSvGrqW09GPWJgn9xgfHsYuwGx2OGfCJ5hEtoPo8U6tzOXG2N3nk8m4LMzmONDC9ZPPoZ5/tRq4EeHMGen4OkkxPc9Zj3YGZ8ByG8CdQ1Oqom+BsgJFO63datcNIyobsk78vboVgJSwZHJLTdBZJMLWmE++HbLJghncaVZXgSLa+hlnbwFJAg6RMnmwbSAIp4V4ogBNKwuqlV+Q2kJ6C+IPnQ73GHUd62oBjPAgKjJNcCEh3nqFGFLtn8lsMwnq5ibefpM1uS++sDucNcXl1DWdW3cYPVSD+ZSQBEqtOYFU2gazA6PoM/P0cBJ+VLprWp/AuX6yiY+St1Iykr2nLMxBuPbt+wlNp15Z7mQ04ryYnvNBZYJJvdUB+SN1hRvvizGS1CixIa5MhkRxx3z0trdg05ux3alHg7hfWv0YFMZr5gQRZGdsmlBTxmD4eoqjv7u38bk9/+LGK6uwkymoCY7hcsMZg02XAfv6RR8cWG16/0DmOdPwc+eQD99Aj7Yt/sGLi/smrhrfybfF05Q5HjpjsNnB85W44aK84bcsaywnObb2oO6bPmwvFUZN1JAp/R5GGr+I8z9guHMJS9Ixr6sgLpPrlKWdBDIQso02OE5hbr6MZxShTcy0Lrb1r5vb69/cr0htAT0F0xNox4pUoDYOxQF1Kjd5PtMxIpVfM5IJ4bbQLMwzvm4yfwpGQSLf2sP7wNI83hV92575iY+rhZfKatJTqK/8YVnuWurbr2gC5nEbmTYfmTXTyu3b4tonepseOc1ysRfgdRUiEtBhz3IiBQpHUvR9BnNzJDvRP1y3kxKgadTtAeHdm05eN5D+lmp4UJCWfV9OkYJto7kzOiKCCtr6zj7hV/AT/1bfw5f+J//cQxHI5jpNIJ1MN1qmLYFX17CnIm17mdPYJ4+hdl/Bn18ZDXy2dRq6C4/hu8TRtjx6OvkykFKpRq3b/8gMKU3CyaCWNezzmYqJL06sRcOfTw3jsKAEEt6cwWu6JI1Cr/VLJ02ngJ2fJ5rNI6MuDpVCJzMwkllbnoQa+1MeunLXdAS0F8QfYiPzGMAIHpkgYEC7/RSs9SZopaVIHY0rLH/JRKR5k5Bkv3lcy1NvRbbvTMMNI3Y4f4yQTwtUdQs6YrZxpqTS2fy9Bm41ZEBC+IsZpqG3DAVwyfh8sYkr8VAaGzOXDgcYHRrL7uUpUapmpPWqB40MUcW2pHYsV1jvp7fOqZfCJtZHFLKHlk7ObYjM9xbzSFeah5NRxmLH9W+7ZSgSlAHERRgNWA22Ny6geP/3w/gp87OcOtf+P0Y7+yC2IDPL2BOjsEHVus2z57CPH8Oc3gIc3YCM7mEmbXwfc6wAhh7868rNMFrqHZcUiPB2wuelJTPWxskiMtwCcx2jXXRB9IacpW5Ue7PSeecHwdVUM/HQPJNRkxSdD+o6Esp06av43gK4iSzWyljsFJpUmEcEdgwGQYG7tjaN/CNntZ4c2gJ6C+GiADzATBooL6oQULwTvSd5COFEBeOIg4lO907JnPK9ipgn2mefn0zMFw3mYzWaPwO97btzvCFUeTknQA2h0i0FQAwG0yfPgtgHsAkAfbqLoY0XXSKWXUNJdNSjfNiNt7ZqbglzXssT0pCIYnwEty8Fi+0IScAetVM+gDwIOOZPCG+T6A4DMEonKimwezkBObsDJQ1uG3fPvHSfg01KDTHovICYWR68Vm4opcaKGNwY2cHkx/+Bzj61i9i5Z13oADw6Sn47Aw8ubSb1MKxKKF1O8Er8eZOEOvZKgB32Dwn5mLSp8nyRQpoZT2pfFFD6qz7wjDO8bIupVYyjgJYlTpB3fvH6KGuuPngyvImQFyeFCtmqn7c05hMRM4SttTQBS0B/QXQBwA9Bnh7+95tUvRAe6GdkZjIC35F6di370pgB2qMIabZR5x/sdwwAXWQ3cQ1uLWLld0d68P9U+F5H2jJ2kpm2snmO4n9ejvshjiezjB9+jwwChdK/EXWF1kZvfDjlRjykJqtR3veWFgALNMyukWzvYXRjetOQ8+5XbU2mAf2HlRitrEt5fo73HcJpjmoRgHFPuCglZKN65gwNQr66AjmcpKC2LyBN6fGRW8nckxtHAhBzBdPKTAbDNc3wCfHuPxHPwwaDoBmYJchfIIBDcW98kSpydxn69eyw/e0oIlzpAqAF4CbdWmaXin81KYA5z/6mIGsdujnnOE44Sjx6NaRHuL4sGUXgq2oC4X88pnWRa5ciZc4x5ecAKbyusY1DRA7k7teXp8qaQnoL4AeuWE3UMMvjFSzpplZdSw8C8FXPKuI2ZXJiTLUYhQ4uoOxHMcI0O0MG7duYrC5AZ52Oeq4Sob97+x09kDkn3ySnFxspWAuLtAeHtmyiw1xsjTJfeNFrqKhM74Foadz+C3CiEx022K4tYVmY8OdQfdv5gF2h2YaULyuCtnXAaljTu45xUZ2bSCjU8wClGjRAECkMHv+HGY6RUP5ZTdFUTBvdzvXqojsWRdoVZ4RKXtXu9vASQyQW+aIO8rtWXqQMJm79wGAKQpLAjcQpYeYf3JtMGLYotghfk1lLSsVsDZZb+Y0ZPiT9QCVzyxgV7RrIbDmfKZSrLR8nQ/jLQ1BcJBFra2hh2UOhD5hBozmKDQXpQiFJc0MDauhv//eVUTMX7m0vJzlBdCP4nsJABo1+OpYNSBAe4ETkAw/k8YLBdGfYuY0zDypfRFiQM5cydMZBNNqrN6/h2Y87ri68JNSyrzktAfm8v+F06amwcwdWYs7y7PdsiHT2DmenxSUP0yEg5IxeyWQYc+gj27uohmPhKWglmiRDEruKsHYr1ezCMpx3ZvhdmP7wkYBLgg+JNOOn3KtNqkdM6ZPngLMULVGkeNYCAiLDtAiaF8TdaTbNA2GwyEGgwGapkHTNBgMBsk/1dh3SjVQStlz30pBOYGA3E63cP+8M7mHHXAU38UCiUkexnb+L0JdsH7kWJylFCvqB6eYM0yIHS7bjZNoNrw7nsYy9XTsBjm/kyj91hE2bAytbLoN+RbDjt1Na1Lg4Yz/VKU4JgDO38+0DPDm0lJDf4FEir4Wjwt1uDrsTwEA1+NdPbGu5JMkfcKGGWsP7kNVJP15iUqtNcksvCABJASpGryQvXfONDw7OIA5P0fDzrNXDcxlI0TPH3WnG0l1agyRi3AMd2Rtbw+qGUD3c8syH1QLjaLz4Bm7DJqXJ9cE/cZDsZEtT0NobQoAtzNcfvvb1jzNDNNVvPzZAv3auws+S8fLCjkpIhil7Lh10qE3mSemdJ8YiaJJ87ksMyH/kqaRTcbOcyeVOVsLGVfZ4nhMChQ31cRUirRrarboUs7rgGTc105PJEl2vUt+F7c3VGqbxmPj7kJXUcA2xnPQMjzYvWGAmNvBipoAwIf9Ob0xtAT0F0IfWTWM1FeNE/SBdEjW1tIZEK5HU0YRGFgPg8znfcFgs+cltjh7ADMwUG6Hex+XrVF0V1u+ioVnyT2Swn0ainkqpTB9Ji5lqRVH5uoBsBBguriV/0wbNRdknI6B8e1bn6xKndQH7izeUKLEUcU8Hj3KuRHgZS9p/tQazXgFZz/7s5j8zM9gMBrDXJzHMELhKiEOc17KssR3c0dElqcEaDsPSPRnKiwWK2AyzzzjpExUKVjIfb7oG8C6h5JBmYN6mlOy8JNIObXJz8mvMnwq0PQJWAUrqvRpyK0iHce0ZZ4shJUoWcSTI3kJ3Qd5dQktWp4BAB7Xy/2m0dLk/umJHgPmA7y1oghf8Kt3gIdLT9HpRvwrMU6EzedoD9fwuBQULvnPPS/xLQVWozVodRVrd2+DddutcRRp5OGEyTKApWUF5I6k+ZaJ3z89efY6ffLMXjsZzHh5O8dFDRul5Ejpvmf5ohY2fnogZ2Zw02B8ay/xrPZiqXtABDej7rPs9yjERB9nTgr1QudsZs/0X5zj2X/xV9BM3flswyKXVIipPeP48pPXTAzeughjyx/HHZKd6b5eMTAl2JBCnvtH4ntPHXrklP46dQYg8dkhwQOQ3umqiWdjTvIEESj5ViZDyZjnMoFK+EwGkZlXeAWA5AQCnFUt+nHPQguLi/s9087k/uGVR9qvTFoC+qekD9zYunZT31dEd70Tw+RD0JwDIGlY6pgLRZoVCdp/KeJmTJcAo1sMr1/DeHfXarjV/Kj4HjcPRacliQAhJf4+benKlFaMiMBaY/LkmauYmNvy+Jpn8KF8fcCIyDQLVaSGMM6Hu9ag0Rjjm7tgk+9wfwGUH/3Jzca95DVXAd4AWGvo2QyzyQSz6RTcNJgdHuKX/oP/ELOf+mmAYS8hMUJClEmK3HO+3y1IZo9c0ldvLQpaW7LmHcSUjjgJ2FPyqjJks+hUvu+Bk2o6RfgFax6kCCF45kwiIHg2Vmr55t0ZfncgeDa/k4ghFhdRqwAtNQ4vnDCC4Jjp8uI7ufHCLUbrs7KQby4tTe6fkvwO9yGPvrSiBkMDGBInLhg9SlqmAHi9ieQAJzF5qHvaS74awksVItP6pZaqZy3Wbt7E6PomTMfNYJ6FJVpYvmveAXi4kpJ9/V+0lpq2GBHBTKeYPd+3+RrtGE9eWU5+MhDbOnC7Uu/ysQjlCYGc/I11o60bMK1+8Qp6flROyi5FYGF2dqZMNhpmxjDsrv00BkYbmNkU5tR5Uvvmt3D6gz+I9tkzNIMh9Pl58Ojlz3CnhZBZctGE4bIUH5A64vr61MThQlpdgDqRtMMG1aeQF8Ni/vns4C9AzOMoCsh2cgCVz++qhN5ROM9ocqmoHM71Z1m5E0bRV8nEO40vYxk3LBX4chIioIPcGrq7GMfNyXhUTpQbNr4112PKl7QEdEFLQP+UZHe4f4SRoq8OlcLEAXoSKJuYxcTOgjmYTCNlyfXytS4ViR1z9RDlmIhuW6zev4NmZQXtyandJV5NUsrJ4pk8+iQkmOQ4VV7ujJ9djXzuTpJvGuiTU7RHR5Zp5O5Jyx/iqXAaU0HfKJjV7ihP+4xhly8Gm5sYbGxY8/9LMblXSiA0bn+W17iLLgxzBO/WXvlpTs+gDw5gnj2D/vhjtN/5GPrZM7QHB9BnZ4DbFW4mM+uCs1eQSRC9AuodAsBVm6ZbZS7yyddr8/iheB1l6Z9f5ZxNz+izw+g4kyn51tGYQllNgT0ThLzEXjN/zalzNVTeBjmDqbyPp9A4vYK42MAnckzSJXefvG0lFbVupJ4H4zcrBxAUwt2HM7OploAuaAnoL4hYqa8RWSCMG+C8Wt0FFLUJnoFfhRfKGEXKeVKcP09TYNhd2WsP79vLWDp4TQBrqT7JuSsxUWgkSRrZj08OdVItZahGYXJ0ZIURoK5FVph+khovfgd9+jw5aAjTthhv3UCztgaeTl8CoNe0bnfxiDERvLWGmc3slZ4nJ9AHB9BPnkE/+Rj66TPoZ89hjo+hLy/Bs5nVjAjBIUujp/aq1KZJL4PJBND0LAd3j59iwPSQl8dq3dErDIjBN4fysZikDYh+W2Ac+Ynas+kz+ANYpJyc39lQEwK8Nj6nrpX2CnwljxrmLYu7JhI1O37lCLIlVU741Mrq7kKX1gV/05qitI3S6RzaZvotHM/zrfxG0RLQPyV9iI/0YwCK6Lv8Dvdc0JUsML+IwU50/z4O4r5pWqbbIfVXFaMsLDPQKKzdvx9mqTeXJ4nkZ8A4VraYvLKKXjv3Zvg87AsgUg2m+wcwlxMMXF5JaRNmWqMIzYljD/Gul4RBwGiN0fYW1GAAM5l8OkCX69zuzK68NSx81zpq3UdH0M+fQz95Av3xU+hnz6wmfnYGM3Gb25hhnBTmN9HZu8Dtk0YpNI296tMz3Jpjo2TY5o0hvwZt1f1cdBB0aYq9VIJPZ3rIf8uZK5Ewzzi+i91bAfgEkvOKlA0Qc4riTwLqBTiTOPImIswB40o1CkoUii65w/2pnsbxAN6RLwFAuCY1jibjmr4mzMWg5NKg6Y9+4/0WePzCecrnlZaA/inID9kPtrevgejdFgBAKmKCB7DKzBHKTITw+ITTqVzLW8SV5z+lJuSl+DSiZ1f+mk8aj5Id7swyB5FPNkEpLUQv5TeAvUgipazzk9lMNExZfquF9xeCAXePdYdW1IUqrg0MM5pr1+wtZbxgfXNzuTePG3ue3mrdBqydyfz8HPrkFHr/APrpU+inT9E+eQrzfB/66Bjmwl75abQJ/SzbwN8T7/k9wbtBtZvElNs0l2pVqSYubwcMV30CZYVr0SGG5QIKZhFkjoJ7tTFWR7l0xroMA8rUcqDq97rQU5/Ryc0OC7aPDBIcyYREKqiIOdM1kwEAOR/S9/1FS3kdasJ8uAjHCUam5lTGZ0bJYwJggOljPE59PL/htAT0T0Efupm+xWsPB6RumuQtFX/7KD1ClGkICzA9GzROOg9Mfk4ngrAAbK1bDK5dw8reTXsDlZishQXACyHhVjTrqOSzIVsmDyiTJ/5SFsTKVtbzmIQgUi26ZFx9jFv2T5TOVNPg/Bd+wV7Koii1DpDQ1DxwS5O5N5uHte6pvens0GrdxgG3fvoc7cEBzOmp233urgsl1yLsjpD5XemunfxJBFseBesMzTtN8Ee+EHbBe00otBnJetvvc7loESDdWNmnJfr3nZvF+mjRYZmfg/bgwgCTnIci71wwybG8phin8lA5jCoo6X03FMMw08DDdM5BszNeVo0caecJ6H56pcVYLG4gcuAdGzBcfVtLwgE/QCAGu73uE8QUloCOJaB/KvI73NVg9OWVZqA0oAloZJg45Sj8BronXbJJy2sLGbZ3LZ1xhtp+ooe5kJWLYXe4r+xuY3zjerLDPYgXAX8SXcWVZ1Fx5UVTLAWRArczTJ8+s7hq4gn01NAQG1Gc4q2Qt3bUuGHaL5J3ExGIDcYbGzj5b38EP/9X/5949/e9j/boBH43LxuGZpNuUvNr3efn0Mcn0Pv70E+foX36DPrJU5j9A7THx+CLSxuOTShBNEZwsFWSs0JEF6bWjam3GHnQln0rLQTJ7WK5OJqYHEr+Kdu7XEbyjcVJ+IXGjhjDBbBnACrL0bfaEaP4RMUc9XVIJZlYHXT+LJqlWt4+qgpOHQkEaT2+LlaLOvKL3UNREO6I65WDrgZN25sCg8oNPHJIEMEJoqI0bP24e+GzqKcnRYABgOVNazktAf1TkN/hrgiPBkpB90iJ/XO5ENez50gmVyFhFzmJOH2agbKbuFbu3MZgddUeT6qYmnNlVW5itgLGvDXqF0lp+VSjoC8uMXu+bwtp5B4ZzoPDm90ZAp9qwhHy5svVMBuK3F8iRuMON6ytruLn/u1/D5PjY9z7Xb/Dgjkb8KyFvri0mvXREdpnz6GfPIV+9hztM3tftz47B0+nMFrbO7pFeew6txUOyO93gN0hHIDbHVCgDKRR/R7rkm6YThlooc35cD2DuhRha4nl7fsJlSwZlcRHGLiFGJ3m1SEtsBBqatHCPKy1g5dhfLLe4kEWrIIDoHxvSogkRh270iwwx4qidJQtGNaYu7owxC1d0op0pQCXCWyd+fsySJM7otdKrkRLx3IIbwH9AxAeLzV0YAnon4oeYY8BQCnllfUw6cKAdAJrYuftFOup41eK4OX8ENzVIixk1CQnjtodAzBGY/3BPajBAG11J24qLXupO5lsL2mzWz8RwMZ6NDs5QXt07M6gRw02/RKpf+aLumJenRyDdjvkLZNUWBmMQCsGz/+j/wTtj/wYNr76FdBsBrN/AL1/AHN0DH16Zs3lbQvj+ss7EvK79AkI10sSrN9y/x+UcA5DqeYth1jqJS3TfEKcGCDBdUE1SOxtqFzpq2FpBm5ZUVCM6yIzrnZmzLMCCXJi9hIJoQAozWJSZLEIKS0e0W7vllS0BrUtwMKkvLICGgztmKWsjeW0J6Rr41elRTR1Hy5/yHBLDwB5SYCy8EUWlJa/COPaxl9clJjcpYWyu6zEADEu67V6c2kJ6J+Cvo5vaACkoL7idrgr6Ws53k+dbnnzdwd7KodvHNT+itFOiufJUjCvKTzZMwbARFh7cB9e27TBvNMMtwYsCpkwuSzpV4PqnHyqQYPZ/iH0+TkaeDBEWfcu6tvRnvGv7iQ8WLADXcZwMIRaIUz+3j/A7B/+I9BoaDfKBWbvcvNamgBxJc3e7srPiNVxPMRjdtZCkLDUDEnzOlAaCEmgHPByRp+PrQKJuRqsLEe2nl4EEn3t5lEnuxeaeGiJYn3cJ9eh7Wb1lEKhdYrCMZ+gcXspzG5a5LYF6xZwFhYaDqHW1qB29zDY2cVg7xaarW3g/BSTv/930D79GFhdd14Fy0aipCAVyvsmNtVClEavILX/2ScElZJYiBc192x4AdHkrsjLPgvc9EiCn/IEAL7xY+8T8I058d4MWgL6JyQ3VvnPb9zZAdHbLfzIlEw2hi4MW2ImSVlffgtxOdW0Ckk+lV0hti9nacT4Vjs3oNEIa/fuhnu7/U1cYf20xhnEJC2eo+PdSyJSCpOPn8BMpvbIGhB2Xcd2qkELsjBSjLoCyboSuctQKFgteDSCcc/Ja9tso8i1bILbZS7HTQbkEHESASvUspQ+urqvJpHF4UKlICPGTm5VrQxIpN9KIdYG4EJuKHfXi7duj0i8UEYMxAK8OY0rau3vfa80F6LWnwK39C3B2gB65sDbAfFwCFpbg9q9ieHeLQzu3MXwzj0M7tzBYPcmmms3QGuroMHA9RPB/M7fg6N//9/GxQ//Q2Bj0/n+F22W1+AK84oRi98dQJAUomqaeixFOb9deLvlIM3UBq0JTxz6jKQ1g/OClcUl30NOQ3+/GuPNpCWgf0L6uvUGpwfjlXeGjbphcl8QyHlMBba7JNvK9xqP87AVQDicT6pyqnQOk723u1lfw+qtm+C2FfnW4ydF62MsrwrMYcH74pe+A9IGRCoylxAqvW25KGIwd3eAeZ+WHvlQ0TeKCIOmgfFmRbYDhsgDN0IkD+hps1MC+Em2Uu2RdcnBoPKiFlYKDMW7SqXLQ5Wi0TvidgJSrhV7Jp9scJA9mPZstwiWSwoyu1jeYEtwwmzYhAC2x6hmM7Buwa09v0+DAWh1BWpnD8O9PQzu3MXg7j0M797DYG8PgxtbUKtroOHASc3axtUtMJmALy+DZYauXcf2H/tTOPhzj3H+j38cWF0F2CTFzmrS3cY1kK2Abm//FLApBC4h52TsLKOaiFTpJ7eR084d5cDcborrrAMQJxozjNsU9wNPnrwijvP60xLQPyG95zfENfjKihpgRjBEdod7orSF3+mYy3WGPF6gTBOr8sRudSMFcbaTy7JFgmlbDG/fxHhrC6aNO9xf2f62T0NEgDFoLy9x/ovfxKBp7MUyoYZIKl8Fc0kMMOWMJ2ok8+5L5yxLAkGpBoqU6EMHzsnpAGlCR9L4udCXauBUvBdPkY+URKDJ08ippoiFH24pxoN6cCBS16xKKaMrXFkEq4hzUt68jCJ0kk0UAXw53VNhKg/r94YBrWFap3UbBhoFGo+hrt/A4OZNDG7fwfDefQzv3cNg7zYG29tQ6xtQw6HNSBsH/C14cgm+FGWS5nmxR8VcXKDZ3MTOH/x+TB7/Sejp1LldTpcE8lvsyj7JmiEbAtWmkpsFRfvWPWDUrR21/JmcYiGiUh7cbnGPwpsri3UclxU60X4otxgu19AzWgL6p6QG6lFDCm0Hp+o0OWUzTLqGSXa0SuWHsjGe55VMkDmskwA9m2H91h6GG2swlxME17UVjTOtz2dMROBZi8HKCIc/9hOY/vTPYTAYoL2c2A1mjB6A6QJ3i9qpNt4FIPOKZwMqV1afVGTl8Uf1trSs8avAHUBUCgcZ0xTkx091UMzTrOUPIGySCtpt2GfhMqiijvBZUJM9u8oQ6pkNyjAROK2cW/IA+c8oUDHD+tfXGtzO7Jo3ATQaQ21uoNl5gMHtOxjcu4fRvXv2+84ums1N0Hhs54fTuKFb8HQCM7mMha8CdxcxqGlgLi4wvn0X43e/hPMf/++su123ca7SGKBoViibrNK/3NWucj+Aa78yTyfJSouQfySCFDJbLSvx0gpYJs5R18fen0IcIHlqQmJhgIguKtm90bQE9E9Ij/CRtUAp9cg59KgbbXMJuUIS9AOTFPH9i06I8htzfBr5AVBfDpEGE0EbjdV7d9CMRjAXl+FKmT5e9JmBuW9dBvRkAtUMcHFwiI//8l9B0xqYmWXQaTuJq2gqQkrKDBNoL9+Ld9U2ICQyRG3vAWVf5HjpBPMu83olbKLMhNDyOp6OOIv2d7E+HVO22MpekcrecxqP43BNaldrXDGuU+0wl3QteDvRwWrZrVjnZgYGA9D6GpqbexjeuoXB3XsYPbiP4Z27GNzcQ3P9OtTqqtWSmS1wu01ufDqLQncQ0hYB7n4ipWz5hgPQaAzAL51Joamkar/JZqZK+HoJsl95H6cC2nwxxf6lyjpVwh+Nd6zk+56DHyRnpEi6PY5+kQbzUkPPaAnon4zo64B+H2gI6kvG7koWPInEhJOTMzWTRrZYMqyqBypBVdDJESN8T9mCv9KRGVi/fy9I574CQaeqaVJXpD5tv4vkrnFmf2GDgXbnsGnQYPLkCb79l/6v0L/wLTSqgZ5Mg+c16Ymnz5dZApN9mkYPcyw13/iDKO9XNzoSFKubvcs0O7pX/CzTsZmkSxAVTbdGQSGLZ4QDYCcIXERBkG6K3XP1PKpJhjnCaXjZtsppldoBr3N3C6VAKytQN7YwvLlr17jvP8Do/j0Mbt3CYGsbzfo6aODWubUOu9P57CwKxBK41UsQZd1ue55OYS4nQNOAvHMnV1cpkMr+EI860hYvo3IdqBCg5BChCk9yfW/HQU/GVSAP1Q3jg4OG7to5mNsrlZDDNTBaBoOWgJ7REtA/AX0A0GOAf+P2/duk8KCFMJJLARIQk4/Cs5q2aKnUnsqnkv0JRjsHenP/FQYMNArr9+4A2iRg0Q0QV6cC05KXkXF4IGZjoE28r9sYA93OYC4n0McnaPcPMPv5X8ThD/5t8OERhmoAfXHmLh0RZrwsw/4lhLJwSdsXnDCDMs5+l63g/nqQ8JwtA3PKnizYAaGsyVq2lAi61tvjeOwW3jgtyjyMdtplARgLlL+rzTOxBKSUdbxzegFqFGhjA83eLQzuunXuhw8xvHsHw92bwlxO6Tr35aU18cK2G5Nbn61cHfziScxdpazp/uIC0t1u0gQcw9vnbn8/izbpbOcoHPufSdBk565lTF2CYSIYSB5WdJxbi3fm+rguLwaE8ZpDPORr/DMhvACUncEXKbFZAnpGS0D/BOS9yBg1+MJYDdYNwCqK8y6U5ZJW4k0nST5hCr5X0Qjj4xxd3MziOEHyVL3UHZaXCWBjQCsrWLl1M3H5+tJICck6aN7RDaphA6Ot6VxfXFjwfr6P2cdPMfvljzH7+Almz/bRHh+jPb+AGg4xVA10e26XUb1AAAfQgesgAFZsw5R6FY78XUXKKjGOsoDyKpP4KYWozkQLAbFOEQRj2qkT4dIMGsC8Wm6E8RT1wS7hUhIn3/r95tflg/IZW0+fDEAp6LNzYHMD137rb8Xq175mN6rt7qBZ81o3W9BuW6u5z2Yw/uy53ZVoP5vmhQqvi5NocaXAk4m9are3FPKddE8s0L/KWLxOL0NXJFT/neMwouJ9Jflq8aRmnfems1CZ9OYLMMJlQjLJYu6FAc0gNEtAz2gJ6J+AvMvXkWq+a6QUZoAGYZCqJX5AJ6dlAdS1oWQgz2GCeYy4GU6+72cOWrcYbG5gZWfHHqn5BIAuNzhLDTB4jgvmcq9x2xvEDBuYVkNPp9Duys/Z0+donzzF7JefYPbsGdr9Q+jTU5jLidXGmGHC7nBCM52CYR215Ka65HhzZplIZJ7kFTvZaIF2yDu0M5D/1qn+FmGLPGqhOvPOhLjkSX8ZOo9/JY0ZHQ7FxGtqGif5A+g20/aMddmvzAxWCu3JCYZf/Qru/pE/itV33rGWmdY6cjEXF3FQwpbNg/irBezFiGABXZ+dwUxzt+ReEkVlLPg25jIssvHNcJsYfZ9x5xzIc3DRO0G1uJRFZF4fqzGlaF2IxwTZ8AJjnHw1wLRcQ89pCeifggj0NSVMdAHgSt2oGNPRC3hJfbwvrmjKeULw5zgl344+1iPqei1dtxrjG9cx3Niwm8kWJcFDlBLXw3rwrmnd7Qz64hKtM5m3T59bjfvjp1brPjyGOT+HmU3tGijZlrGWRrfByfl9VgAapUBKgaxqjhr69WnWaTvVtMzOKkdaECGkoFNG7yn3XHW8LONc/a4nUHYhapm4yDcIP6ExgbjoX2/LYDDpKmTPRjDD1snD9PQE6t138eDDxxhtbEAfHSE5hqZUp3xQO9Y+VyZ72eTmpz4/c34gMoAGRQ1b3OjXOai6nrrGt4qEFBQk0KeRhVrSXfzqe88RhHMqMbLCODTGzmt/IscguEC2gfOUo5DGvuS0XEPPaQnon4g+MgDQKHrPAGAqDx8lmhFqoMBZOBGjZxZ1bvIS66dRWM4SEkyN3T3oajQAtzoeWQPcSaDUrzt5cCUA/q5uY2Agrv1sNfRkAn12jvboGLNnz9F+/BTTj59YEN8/gD62V36atrVSujDphg1tmuHN5kSExjWN92WuQGEnsHUI0w0iRVO6NLOWEt8rTYsIVZ8EAKLSmIKWfdSRYu2x2CwYw2QaUTUeYvWKSqTrsdXiiCNhZfquH5gXMvLIJf40OGdFi5d1GGa0bYvLpsEXv//7Mb52DbOTE2tetyookv4T4zfZlJl9fqZgDgQhxJyegNvWgV0uTFU2dlYGohT0ezJMwpS2QxHSY34NV6tRxNj0/hyC4CScXvlg3muim7/MsGvoPvmOyUa+bNaxzCUAfN/e3ryKvzG0BPSrEz0GzL8GjEH0BUOeN2UcKoznq8NAj5+YkJZjoylo954/ooAsxIzByhinP/+LOPnFb2LnK1/G9OgENBwE4UKBete69dSudbcnbqPa0+eYfecJZk+s1q2PjqHPz2GmM3vHscs7zDw2bu6bIGgoWCZjFS4V+a/wrBa8rQXJBL278ZPWD7jkrBWQplgPTGVTSm7Rx2w6888ANKRfYUM1AcQDd3DJKzZOVePU0ggB84yFbl5V1qKgGBMJIpioj49RD1v7mRdPfg/7PRgwRLg4PcXqd383rj96hPb0FNQMRAQ30/y8Ec1jh/2rvA3wKmT7U5+eWgE735DXB1Oikyh/vND4pHJwcvoKqPCiTDBkLhWHcMonxCHBD0XCPn8ngHk/7iSCpCd9KEwcwwCZ5aa4nJaAfkX6wAI6P7j24L4iutvaUSp0pX6qHePywziPX2r18SnnjxbI3J9pJgCDwRCT01P8gz/7b+HX/+8fY+PWHtrzC9jdpg7AtYZuW5jJBO3pGdrDI8yePcfsyTPMPn6K9ukzzA6O4lp3qxE90YniGQMYE6Rr31h2SxLFoyiuFchVx5sIi0ldcId+CkE7kbnS0j3pXwXUSfwtEuktr+fWKUBabQfJIEoZZZpdzmrL8qXm0eAHP4BFrh3KAczZY5l5Pgrm/hTP3SBhO5oMA7N2ht0vf1mAHqeyggehgBOy5PmEq0zCz4C8hqyPj1Og5Lxt5BgtB17ejsn4mTdR5rx23VDX1uX0EX3Pve3rpAChoXtB2mrocQOf5ApBurNWF7Jlsq5fl9eyRFoC+hXJ73AfNs0XV9RgxARDRIlonbM1iN9RM0x9wy2GTpVUO6JSx3eAoAgYMGN9YwOnP/Lj+G/+lT+GL3//v4z1tx6CpzOrdR8cWjP5k6fWdL5/iPboBObiAnrWgp3rRiYxicW/cAEJvOYNp1lHbTC9cESW0Er0Kn2SagrwuiUFLd03TX3TW9oHgXGGNFN1py5MdaiYPdTVs33+4UlonXme8zfYyUwr+y3Er7hhjBG8esg0gN7TAfGpHwMxIiV/OtTyqlYv8nZFMmzApLBy5zaq1gIP3mKXJvsGrklf9EnsZi+eiMguX52ehGce0lyArL5AVegU/R1V55BJZ3y5Vz6hKzWO3wBLstOz/NJ8KJx0cQIlI/ia6M+XQip2cy25nYRLSPe0BPQrkt/hTsPBe0PVYAoYshZqAII11URawWBqsNClaZXAH5lkJ2D459m6q5d8/Zr4+uZ1tN/+GD//Z/4C1t9+COWOBZnLiXPUoQOLZnIm6Qy8FaJWTf4/gTuplh3DInuWYmoCs8n3LlCvtmONEmaXbSYUSJ7wyiRi1AYXwdfeMiArbH7fdO1qs8rdu0WdfVy5POEBwph4aYi3nKyu2DPYleNElHZWh4Z7RaEjpNPxKnxyuBVwvLfnbjdLwTmkFQsQBDaruaeZvCYKuhUsWg3tAZ3FVll2FZAA3TvRQ6KVYJU0ZNv3TJhEsE1+uEaWjVlLJ2ts6yvBWAEScMdZnXLgn4nluWipEvyMQQZAA8qPBrzxtAT0T0gEfkTOe5R3dxzglvx86dPBS6ciQWOsTIxCCE/Rr1K+SsQsigKgjIEaj2AM4+Rnfg5qOAQ1TfSMxQDY2DJxcPUgANtDOKLW7cpY9VOOCBAFWF9VbQp8arGLT1M9QTCjmkczgZu9xWIkV2umRP3AUXkXNxB1WQIohgOiAOAZIMX2Z2OA2cxuQAzuTxuo1RU0169jsLWF4e42MJvh8kd/3HorWxm7q3SjQJV4OKwJqlll6ppfKoYlXzNZIU0HMFqD1tYwvLEVrvmNG/XSHDjMjbhunpf25YF5X79VQisFzOzRTVH4NI3Khr+rzxHKfiO2n388Rzjtz1bMQGE16HNW5JfmlDihk24erRQAoS6kDaMZqgkAvP/eFRr9VzgtAf2K9CE+0o8BKFJf9atA+QCMg7/UpCTSFjAkACRoRslMokxKzvOTz2peyLJCguzOcc8XG2VBgKNneiKvcedr3cgYJiVCTZIflXAr4QIiXKU5sh91c2kOIt0KjWP0qSklNklZjN707MvaDnHyr7p3ClceyBZO1su91kJeoIqXjgTXpa2/5tO6P1Vrq2i2b2C4u4vRvTsY3ruL0b17GN3eQ7O9hcHGBmg0AhFh8hM/iY///L+Dy29+C2p93WruUvsVm5eCwJG8j3X2DdZtrq+DVMGV2Y5j02o029sYXtuMwkYi4br4CShJwacLVq6GjfPpKrjCdof7+TnMxTlCBfyCdSXlsPM8L7gMTwvUq9AOxLyRfMcH6SUpyKWCeWR1YqwQgTW7JR4CEE3u+SSiJKrrVbLGfc3M7SVN55XuTaMloF+BPFv74ObNDaXoXW3Ho1g/j4jc6TwmY/BVhYfq75Jdxb0lpRIrZX4+CFsJeagaROc0OXh7bZxCHMFDw3tPSjCJPO/0N8WCVFCvqF+uyaFsN8rCdvGkUNcuRl/Bp0oRRMZSQ6f8VSWDmI8NIzSlhBsqLzm5lwbcaqtxt601jysFWhlDXdvE8OYuRnduY3T/LkYP7mN05w6Gu9toNjehxmN7TtsYd+GItv8uLmAAjL/6XXjwbzzGt/7Xj3HxzW+DVsdJIwfFTvZbZyVzcU1uvJO9UmqIPi/p1tToFsMbN9Csrbnz2gjolu9ol+nJfRo1erFgfjVihgX0ywvw+YWrSHbLGicfAMoxXibsPuQcrU0EwQjkslXfvIuAnY4BzxNyOSQBY2l8MAZxZNiAxm2A7Le0uRFoLYXtYDSbAMCHPTHeNFoC+hXoQ8eFVtuVt9RQ7cl9mvZrGr465yrjdf4xtT5klj99WCtR5MuxSL7bsET2XLc3O3uNXGo6kn8nZvQCUCl88+9rS5uhFM5KMPdIUUhoUYQtqarVd7R5H9Psy3Ixw3+NCHKtm9meCuC2hZm1YOO00tEQzcYGhrs7GN65hdH9exg/vI/R3Tv2EpLr16FWxiDVWODWTmNvNczsVBzrCp1pBQIA+vgY47t3ce9f/9fws3/yAxeWwpiq6p5z2t9vkmNXv1DXSjLpFx/O5mtajeH2NprhEHo6dWW24zvxEiiEj1pZXot1c0GkFPTFBczMKprJ/rdiMxxQ8IKFtWgRvhPUBa+otVUSNwlt+1cIEnXRPAp53sQOtykTbPdJ5B1X558hvfaiHc8AAI+7Kvzm0RLQr0BhhzupL680A2UYmghNGMTsZMxeTVLuPO5FcvgX1blE5cSLJ4pT6mNm5MCcnDYo4Nr+dTykWBHtBHN0husScKpgK5+Fc+NZuKJdI8uLO8Uh1rgRQ1ClbfvKmb1PiuCth/B9EGNLYc2OBQHeDHvGf1Ze86nWVtHcuYXRbQHc9+9itLeHwdYNqLVVqKaxaXhzu9Ywp/G2sKBNEwHiXH+NqBlAn51h9NZbGH/hHVz8zM9BqcZpU9keATEG+6kEJRs1T6DCyeHWVQnQxmB08yaoacIYZyngZZKjFEDTh68DOUGaGUo1mJ2cwEwmtoWluZ2834GUpDUiWHh6BvFczBcBOrs1kyE8r4vtH9PoFnY5jEcO4C3mic7HSneHuf5vRyM1BYAPAV5iuqUloF+B/A73gRq8NyTChHIEpQx4UvaF8MyFFdp0OflEClSfmd1rvQFdkg3ROYVz6awQN4aJ3N2friWBtB6LUVK+jB/UC4kw+fuBN7Z1+EX5W59mmlKX9i5f9p47L9xyImgf0VrOgG7tWf12Zpla04BWxmi2bmB0ew/je3cccN/D6M5tDHe20WysQw2Hti/DWrkGn52jDcAd8/Ma91WJwe6ikKkt12gECq45OaBHEJpYjJHOtinbOcuxM5oHKzdDMNrdjS/l3g2muBGOk48F6vxZ4LxHYTs+9emp27nvRzgnwRKlPUPWZOb1gHpvF/XF7wwjcu6S2BPpOkva7dMJ99ezc++bpRGFi5TpuVk+wwSzOSV+42gJ6FegR3AuBht6VL0fuQA6R1UxOfWenb6R0CS+VZLM4ycskioBaoUWKk2q3dQ37dVyrSZZy6sD/LutCB2JRZllYaZcE6/iuwxeRJ8R0Gme90zIgyopZSvTtlHzBpy5fB2Dm7sY3b2D8Vv3MX7wAON7dzDc28XgmlvnJorr3LMWfDlBe24dYhHhUwN3H5EimMklzGQKNRgAs1msfNYwJH6GNugrkGj2cCyrcnwzGlbsWPG+Dka7uwHlk1HkEMGb4Dtlrt6avwrKx77tR31yZJ0uKYWuuRF2us9hKV1zKBnxcyZM1MBlOIHSDDD1LC71Cnc2VgDvMCAYJtfQ2QvlaRmCJQOY8ZCWgJ7REtCvQF/HNwwAENFXtJ2QYUNcdRx3ThyaH0RSzySk7FcyCRImGsP3zukU0ZOwC0n61TKnEnaNby2ys7zM2zH9MpdOcGEg3h+fCShF+q7CLD87iBWBtEF7cgo1HmGwvYWVO7cwengf47cfYuXhA4zu7GG4tYVmbdUeDWR2a9wWvPV0Frmy0LypeflwRIBd0z09g7m4BClKGjEcp8RV7DEdlCBPnZH7kwOsDTAaYbyzA9Ya0g9/BAWK3TlPsBD0akE+raeXzfTxSYdpPbP6sJ833cBeAnEM0OdnJwlbmwDhhZ8IMVx0R1xJgoUgLF94Xwdu3cDvcq+dhRE+DAEoe9CDmcA0HQx0W6nFG01LQF+QHJ/gf2Pz7g6B3rFGsor6KM1+YrbFrxLcEJeiKowo1yhr0nP8GuGWRb61ydvPyErIDOVhOIZaX6tPIlCFPwC5ZT+rg0xkDmxkzC1rof5NUF6oqBQw0aF6iuBBxfIZBXN5CYzH2PkXfy+u/8Zfj/Hd2xjcuB61bq2txt1qmLPz6jr3Z+lvnGEBvT05hZn6Nd34PvbIAn3Tl4lPg8WDHuHLGA01HmN443q40CNIrRxFOmZ3bFLICa/bJriEiABtoI+PXEUjgBf74TibNDUJFrlGm6eRhe+RzCOfkf3jv1NSwKobG9H2BZgzwMbETXHuqJ5h4dBIhI+pe1YbNulOcXdpcs9pCegL0oeOd4zGg7cHTbNlcgsfdWh4yc9sRskUqsBSmSxIJ22cJx5kU4jvR95Ub+8FFC9NF/XIkkzKn5bQ/u06k57zmKsBR61cHXwPix7/C/ELRhvgHEwEfXEOurmLL/xv/gSu/5pfBZ5OLXjPWujJDB5dQvu+BHP5pyViu4beHh2BZzNnfIrSZqlfD3KYSgAA8CJJREFUVvqmq8EXJC6+M3Sr0WzdwODatXAGvTj04IQD7+41H/ev5Q53IrBuoc/O3BOxhlyGti/kXg0fNlMpuo5cVpOu9ZdQSMpk/AsSwdOb1cLbPkXCbf7z8yGcQ4cccbUqEILlijH9J//iD7UdVX1jSc0PsiRL3+vuF22+a1U1YMCdWhMThYWGUDBBp0lAzLgKMNd+9UnS/l/5JsybyhtXukQy6LqEVMTs4IqiynPIbRLrlQfIF6eaX3cWovxZHoVwFDgnp8eeOihtY3eUihkajNlsiunqCr7wZ/4UbvzqR/aK2PMLe16aCNQoUNPYNVK//v1akrUWzA4PrZk7DJ7akbU6u+0ej915JtaSODjDe6NbDK5dw2B11ZYryTD2X+IhLyvA69bk3hrCsynMyXG66VUGqkXsSRPI5mJH+IX6hxdLq7bvJJE5OA3tNXLLf1ToQ5M5n0mSlIYCnwYwpcqIedNpCehXJNXQI2U1rPQC6MDj0mc1vJBmdhmdk19R385Bp1vz9KBW2KuSGGk+viz1OVFbN67Ob8pfUjrZF5KjqfYxJ/8Uvbn4ktc6K9MVub0TA2BgJbrzs1Pc/pe+jq1H72F6cAg1GETw/hyRxRRGe3CYPK8PiznWE74CsDMSQSdwaJeG0RqDrS00KysA2yN0dXHCjQTRpR1O1z57YoZyJwrMxSX8SYJPNGI8jxFgytn75DtX2q5DmOiTdee1rQTiQI7PJEIY+yuaM2bYQQSws5hNXNDP10R7ybQE9AXpET5iAFCk3nParLAOS+02mo481sRJlgHPokOxCg4CyDwXI/GqSnKmuDN3Fak4zcWH6S6swPCkWDWmzpUXBSvLBKGu+d35PHuRKoB1fbMvvZiG26jFFsxnsyloewt73/dPoT07Aw0+vytYRAS0GrP9AyvnBAYrOhNeX18AJrsApho2tZSEfiKC0Qaj3R135t6lxsLS5ZYyyvjplKgU7TMjgtXQzYV3+xoUV0s5CC9KUj6XmVWCpcl267oJ70oKibrCUpRXit4yDSHEVepetfoFaY0BxtLta4WWgL4Y0dcB/T7QkFJf1gAoP+Qcg0aA6pyMXdCSAX8PjsbrDfIApXrbzxNSUXtR/kG9P3pt6lVhpgB1wWMoCZfxO8/cM6oJDsWjShvVPn1vRcHA/jebTDC+ewfjrS1w236mm9o+LVkT8Az65AQEJVyv5qy/Y9jXaBFJKX8ttEPDdmljtLMDKFXsDfOdHO5wRwSGPu0y6aXPAN0ZiH7cJ5MIUkBdkl1QhpLUPRKpfxKUZr/ESVNJXAV1oe0kyYeb1tivhTO0cwWbzvMOvgZXHkX2LOcHSw1d0hLQFyA/Xt9b3blFwAMNP2bTddtiyBegxalNEPVpwumMWLyAlTy78/FMsEONcdrPYnykG8QTbcEzkqKtXH0VAY2y685KJZvI8rLEds9N+5UCFI+E6aRCvTjkj1MRQc9arN67g8HqykJr8a8rsdsQpy8u0B4dB9MoSe8uCfVbbNLEvTm/j4S5nbzoBADWt/no5k2AjZs6hGQdSExA8tMLwuye1LMo2mdisLUaegN9fAyezewYLgA2n5eu3tWGTNsjGb/FmpmwZNSAupJ+kW2mwFBHvCQ825BsoioCIsCwuwvdJ9fNc/y8JQBs+LInxzeWloC+AH3DtdPqytq7I9VshB3ufSbumrbmTYMda+LJM86YUTUcoaaf1ieEMJ33mNC75eKuPDxku/OkJVSn4f0Za6UsUCtlY89aCyjHJ5geHmF2bF1iGmPQHp+AZ21ov06NvFKZXL+UQthVIDgHBobVHlfv3Y3OZD7HRI09g67Pz4MJW7D+5FtVsOpMOFpLooUj/ZcQx7DGMNAMMN7etowfdnxJlh+YfDakkxNXPmw2Hj471Y5BynqJM7PWPclCMGfKerRClA2Xmi4oGeNcAfUYti60pmGqgkRdExHlr4SzSOxNFIGBGnFkD+yvaM7KykWWEwD4xo+9v9TQBX1+F/1eIXmXr6ppvjpWDVpAg8i2XQLcDtyyDT75etDCl3gwCq4T03QSfId7rCJvIB5pqaRbZkmYEzTq+JnEHoVtB97eyqetBzSj7ZEuYwxIEdTKCprrmxjv7GB89xZW7t/Fyv27GO/dxGBjHec/8dP49l/6zzB7fgC1vmpNdpS6nKiWTxSeQ8lse3FfxXrqG/kOg5XC6r27V5MMXlMi1UCfnMBcCr/iQViL9w94sr/se9mURbPm6D/HgiTzMcaAxiOMtreDUxnP2CkIs963O+IxqFr6Qnv/zIkBENkz6MYg6lU1MRlh4haCbEdjcyHNcJz74blnRlI7SSQIeCcW2Zt6dYofHbG0vITF9WC2llLjXXDWGVKK3Ty+BID3e8r1JtIS0K9ATdM8UkoVXCGO4QQ2MkoHeD5oa4O4vhcuU3nc5MnzjKAsRWXnFCZLOI/b9btaL3ICSrJhhcHa2Gs+3W1hTIAaj9FsbmB0cwfju7ex+vC+/XfvDkZ7uxhev45mZQVq4K5z1RpsDK796ke49mu+hp/8k38GF9/8JTRrq4Ep5m1WI050lq6K9MWv1NkY0GiI1du3wLpFYuMtv77WRG7X9ezg0J5Bz9Srbmaeql8dd7ItVgakI5Vhb1lTa6vxHnTRmixHZQL0Ak9kKV+jjiCyV4DqkxNkanj4lPyA/Zx3QJzMxwVMDhGWfUSJ7hxAvUhCgHowteSMAbVXng+k4W3W4siaS6Nw+5qlnfx234lwCQA/8OTJa9Sznz0tAX0h+sgAgALeY7fDPQc4P/Zr1wfGZ4LTy3ghaKo6ViXVcF6zfxwH7TmB4j6BA0KCKLfbsX9PIpwDbtYzC9xa23jDIdTGGkZ39hxw38PqwwdYfXAX41t7GG1dR7O6av2FGwZrd02o1jBnZ/Dz259Fb0/PsfaFd/Den/sQP/yv/gmY8/Nw01ioX43RpJVDhIrIgaSmXmsT344F2GiNZn0d45s7MK1Owvt0Plechgjt4RFM29pb1rwC14vRtk3zehbjNu5M7pRyWEZEbGO1sYHBxob1EtcFWH68VNJOTM61gn4GnUREgDF2DZ0qwiakBcJHEi/FI85fS+3Y/ba/pAOYXHuWEkSWKrM7J0ahLefu/ez0bkPuYhZY18LhDHpX32YPKVo2mWkypxRvJC0BfT7RY8B8AIyI1BetnlAO6dqm9wDLOcp3aficXb/aqe3VOVH51GtNmYm/IjnHgnNUc7zWzQj3c2t/4Qgz0DRo1tcw2NnF+M4trD64h9W3HmDtwT2M79zCeHsbg401qMEQAAf3p0Zb96faoSlJQaHiRU0NB5gdHmH9nbex/X3fjSf/7/8Kg2YAuFuqgtji1t88UJd9kmn0WTvkyg5nv+IeMYJuWwxu38RIeDADMJ/ZXZVeBeg4Rjnd3xcIzmmDyPJAlqmumac3h3EWB93ALpIyusXwxg00q6vWUU8oLsWTT/BH1uIcy5PO8SvBvc+C3BFBfXpqi2A4VJyrI9W3YxRe/awutpAlWnWpJccwfpLk+WRAn6TpfnLdq+QiQzVugPNzFtFLnNNVSPDLqi8Lq+UvN8VVaAnoc+gDC+g8uH7rHhHdMxT1wZQ/pSvjqXbSTbVwnD0q2CW7iU8FVFeA333LJooPF0zlQoFlY8CzKXTb2nVvRVArYwyvX8PqrZtYuX8Xa28/wNrD+1i5ewfjm7sYXtuAGo1sMtqEO7rN+QU0X8T6+Pyu6P6UlIJpWzTra/YucLhbyRyI50sJFBjQHDbTpzFWnjIDUIBuW6ze3MVgfQ1mMp27jPGJ6SWDDoOhyPqab/cPIO/l7lXOKylJYMju03IUQSYJ7Th52PjlAEdrjbWtLTTDIbTbDR7eh3Ss9CmbP4UAKh5W5OVXSkopmOkE5uRECPMIQBdgXQKuXGeurKnX60QC/P2n+8UyrcANhDxQExT8F3S86yPf93FTnK2iv2mtoq5QmnS4mMeOj4t5Ob6JtAT0OfTIjadhM/riSjMYMWBA9toff8Qik6PdYIzOLih/JygKyxkgVcoSdG2Kk7K2Jy7XNMO0iDPDmrwMw7QtzHQG3bYAGDQc2nXuu7ewee8OVt+6j/W3H2L1/l2s3N7D6IZd5yalAGOsqbxtwZMp2otJyJQ+IXCntRcMy4HO7PDImuq1E+e9cAPZF+UTJG+F/MRIOchcGLOim9Ya41t7UMOR9fbVNEUNPivAuBKxBRiezTA7PAreu7rC+o+oBHLWmASpXybaO3M8aMECryrtzmx3P49u7oKaRsyPymgX4nW1WOjoizzQKyBmtvW5uLAnCkAW5JCO3dAc/kfSROX8KPmL1OrRf+WpHK2Bp1S4WiJgYM7gpmScBFnAnZ6IXuLsaZGUOhL3/c8McpvilpTSEtDnkN/hPlDD90aqwRQwysJhRpmGJj1cdJrj/bPSiN8lAISnYsyXAF6mEyZS04AnE+jLCZqVFQy2rmPlzh5W33qA9XffwtrD+1i9exvjnW0MNtYteDJbbdutc7cnp7Fefl2LXuQ1nyWgkFLQkylmRydQSllzO3lk6IrZobd4BaXg5116efz0/wwzVu/cDlpDreavPZg7sl7LLu0mLXc2uCCusNlEy5NgW28RCRIJXiVfon7PzPbIWkdAEkJYvL0uZJZqd7V6v2IwD/l6pzKXl9b3gk5qlWrjUoqSFIJUWjVpfgnUUcGolCoLa+NSEUMITpm8TJSV1w8JJkC5XQFh+cUDeu0+BUrTqJSyYV5q6BVaAvqCRA2+RhSBt6771SJSXftO1rC6KU87mPY74vXql0phenyMtbcf4MHv/Gdx7dFXsHbvjl2nXFmx4GTcOnfbJuvcUusm9ardFzjHJ2cnmB2fwN4EJs/v5hpeqq2VwhZcfeYrGizjODLMgCKs3rkNsCk0n6rS+hoTNQrt2Rna01PXKKYTP4Cu1i5D5n3DXiqoUCI0sQN1Rc6pjNTCOc4dCCuYW1f3FqvXuclJ2fbmySRKiJ6u4s+A0i2vCdUeBqVdautCukUaxy7RZT0t2jtPP+5hEbMuID/s+rlbQyc/zhgpoFfLTTFPmxE0lpviarQE9Dn0IT7SjwEQ1HcZt8O9jqdxJFqTEsLvmmmesom7EN93EnAhHXdS9D1OjcLk5Bi7v+WfxqM//kewsrsDns5gZjNwq9Een8Azy9fumk+2loXZ0Qn06WmixBDIah49QFGtg2D+ZeAcsjg8YsAdWRth5dae3WNAWRI1pfV1JWcCbo+OYS4myP2iA4ky2IE3FBl3Z4PnbVo+km+NMcBgYN3qGhO6xW6C80XP7DEUBQLB+1Gfr58RsRNOT5yXOPtwjiReITEeAQ4b+aVu3x21y57kpQsKadcvOxY8KMss8Laa9cOit41CzmucMXZTXJe1JBlPUlBfmtxrtAT0HvK6wPfj5gYRvaud+FkMcgnei5LX3NP80iSz53KiyINlXWl4wZsbhYuTE9z4nl+PX/Nn/hRIG8z2D60ZzGvdzevtNFA1CpP9A+jLCQYCdBbhg51MLpgWo2WQRIyYdmRiILshTm2sY2V3G6Ztq8zoM7LmfiJSSqE9PISZzdB4RAQKnEmc8VSAODo74kziXNCcxDFPYwzUeAXDrRtxeYXTnsklaz89JLh1nRjpKdVLJSKroevjYxithYBSE/B7Rnet7ZzAT8mzkHN4GH0GsRB2nPQp+i5o2J4TIk0rJF80qHsvovmjej5zexbfbfBH6lqn4GphGBHYGLKn3Ja73Gv0enPxz5g+dEPp3vbqQ6XULQMA3u2yt1Q5MPeyLcK7HnZBDh46ghRz0BHXQ4W8UzC3AKQJmE2n4BubePRHvx+KgXYyAQ2a1/Caz+6ykFKYPH9uL0GJeLNQXEl5P8nn8n1NMLIfBNNqDK9fi0fWekoxT+C4ioX1ZRABgCLMDg4AfzQsNEClcHnjiIRiu+amiTxS2kosnoWd7lpDra9huLkpjgWm6Uh3qB4UJVal6RfF7X75UskCpT46cl7icjT0O7kXvtcuNUdEpuSehT9pPsFykfdV/B3zp7IgtTnYW9ho3olzja0lZt4kcHUKngCZYZyG/n17e5/xDHq9aAnoPfQo8Dv1pVXVNAzEA8edejHqg13+FohSBf4aogsOxPDOHupjOWF0RLg4O8Pu9/xG3HjnbbTnF9Ypy2tJ9fr4qk+f7dvz8J5xJRrIAuDp0/sEpvAA9GQdnox3dzBYWwMbnZglA7PitOxd9FnLU15Tmu0fSmREHEWLpOE+8xcBTKSm7oE5DxqPujEBWmsMNjcxWF+3xxNDRpkwEEDM5eM6Sp7E9Aa0ap+84vYnWE21PT62DyRT4PhJ7j8wgqU6VDUnr50L6130eF8BY/e4bnqv9U3Hq44B0ql4+LkrBBA2QnDhrjL5PrR/DTOIzFJDr9AS0HvI7nAHBoreGzQN5ByJdEV0CBOvO07Eq0yLpygAlJJ1KlFb3myndguD7fe+AvRYBV5vInCrcfnkWTTd+bqwrHekKq8RisyiVNNAdNti5dYe1HAYLg1JggmelSf2OqkTYawYjdn+fvZOjK85DcauA8K4ldqxd4aS5dpRmFAm3WoMblxHszKOgF4li9zJQpjAsESvF8/zcr4qIkWA1jDHx6mpvaITVG/w6yqzUBLiZSw9k10ICUUiWR51EWxODlKy9fPBGMCZOf0SijEmSXyRLrF+eJS9nGWB8G8SLQG9hx5hz/EB9bXSLIVoOhePI7ik5iVPtQFb1bUldyrQYTFzOwPQxkCNRth8+2Hi0ezzREoRzHSC6f6B3eHuQbTCjLrtFumL6MTjaqZ6BmDYYOXubXuHOFKLJ+RvGd+piqk5+DOGd7a3fvHUnkGPu95EK3YPzJIc5w/HAsPQra0GU9lXQigwWmO0vW2FJnkEtGNGyZMLXRKe7G3Cq58Kfnc3z2Zoj49tWQSq9o5dT31l5loY1zASYLNc4niUQhy6h0A1rixD/tCm6xUML3x5XwPdlJaHSIV9l2bp+rVKS0Dvoa/jGxoASNFXjJ39yo/EOG6zGVbB3xw7eidt4DTpWla3Nt5FloNp3WJ4/RrW79yyVzV+poD+CfJm2F3YZxfW8QkgNDbp67pusZiTtChXj8XEhySnNSmF1du34B2CyGQoxEk/idLvMd/PllSjoC8u7T3oztlQbJf+bwX1KOLpXcMWdbtqb7VTg9HODohUT45SkuKIVVl3EvA6NDUAe6LATCbutEZ5oiC96rRSaF7QupCAdM8z+apL2+j7XSXJ6MSk8Nq4EBxNstOybw7CWSiZNDOagXKAvtTRJS0BvYOcQI9//dr9bSJ6WxPA/vBlNv7KMd8HEHXNHUC8VWkxWb0ndSf4E8HMWqzc3MV4awumbT8zZxpp6a4WRzUNZkfH9py0UvBcbS6jR9aSRbeIdduOuP4LO8AwxgDDEVb39uyVnqBkbTM3Y0qAT7zRvkj6FOlRM4A+PYU+O4N0+5pYMxC9hi8yMj2PzsOm1Rd3ducnFphhGBjv7MiSopxTJXr7q7tJJPiim/vTkPJOZc7PkR7z7pqXdVAH4lgr6sfp1/Q91Rukdz5lyebjozeuuF45mLCUVYoYYMPRqiI6LJ1HXhwkgEGGAY12AgDvv/dade9nTktA76AP3UzaIfX2QDXbhoDoVkZOMi4fobKuGkJ2TFzPgSg1T3rmVEzM3H6Yl8hp+rptrfOYtdU5a5GvL1HTYLJ/YM9JIz/ms4haIR4HNbkWugSttC/Y3gC2vorx7ja41YVFxhtYcvhJtMQXLVN9ivSUUpgdH0NfXpZn0KWgkok8c7loIRTEzzK+FKKc1tY0GO3uAOFoZ9l58dgah08CovNAMVtz1+SyTK+KCIBqGmjX3rlGIO1xi6bXa1sS6S6S6rx0+gJTOlGKwMRwm+IAf6892O1yB4LHxaTjymSYwNDMzJqmfXV5U2kJ6N2kAEAN6SsrTUPMEOeTOBV0E6G3MsXmmVgFt8+1l/gsm5gZ6oSflL7WRmP94f3gwvXzSKQIk6fPrIXBi++LxwYQ26PUxFMwqZHjPVZA0hrDa9cwun4dprInIZE1amldsQsW0Yg/KZFzctIeHAHTVphC6/mSaMtFQcKHB6SxXbzLtGjb1gwMGoxu3LCeC+eka3/MWXKpTL2r1OFFEfkz/9Mp8tMR9fVooItvhDHdN0hYWCyqkbPHcxqbs9/Jz97G5OhS2DvI4riGvti8IMd6uR0OLKB/+HiReG8OLQG9k74XANBQ86hRKm4wzy1WlD+IP0oek9xwnAmj+bSrr3PJDUcJiEvbrvs0zGAibD64//kFcwBg4OLJU/hjLu6RDNHBSyosu2jvnKt1txPD7nAf7e5g6I5TCWNg0M592Jop8qorHr0a2IsgIswO9u2GyXm72fOxi77WqsVHkYJsDw8KRmvQygqGN24A2mTLRKJP5VcS8ghBaPZp2nl58mnzMknBAvrkycdWOPU3QvQNil60FsG6XtBi72WYzixZvPe/RVekiYhP10/s9x4VftwJaW/Uxj2JzXTUslFLDb1CS0DvoEf4iAFAAY/Yu3z1FCZgvJcZiNp1nQuLOOJp3G0dU0D1lw2WbPitCBhB8CbAGA0aj7Hx4J4zD79UaHgp5G9Zmzx9bgerYXH22FLgHc7SEflMTTchu1ehIKFH1rRGh9ZGa6zs7aIZDe0mn4wh2r0LmYn9NSUPlLPnB+4q2t7QddmoIrQkVNMExbNChiCCMQbN2hqGmxvWClJCsxjLXsPzt3iJOSXSr/VHv/j84mXgQdNAn5/j9B/9CNRgAAptEAuaHzJIJXdf0rK01FXeefJA5X3vsC36q/aYswCuU8IRNvvb+Lm8SL4AQASy/dzqmQX0D1+NLPa5oSWg14m+DugPAEVN8yVj/Zv3sIPsWQY23eBSBO/PQYC4XB+sMTwGwWiDweYG1vZ2O12Uvu5kb1mbYHpwAJAq9gFw1tilrp2pcBK4w2dmqhXYJRmO92y1ejseWfM5JPw2gEivv8DPlIKmpDVmz/cDkwXSOicxMrlTyqKduJE3QGh+CuPRbzgMR9baFoNrmxisrRVCU0ynIkm4R9LVw6cZ8i9kurh2VVpDra1h/2/+TUx/9mcxGI6sS1sxaOvtDqR8pR6mm7uIMDUBqjfCvABe2MjnUMqPwtgKQlcUtpgjD6vJfKls4EIyZhhghiUVtAT0Cn3gxthsbfcWER66xfPkjtPkKJP/AsHkaup150/p5lECSEUwz9Ll4i+FMujZDCs3d7By48ZrsMP96uTvjm5Pz+yRNXesyvLAjhXvYPf2/SG5etm2tX/1srisFWH1zq0kcCJjsc/OstjgdOUq9b5C2E9MzPYe9OlUnEE3c7Q8Kp/PzWeB7xl5L3HNeJyBXCbNikTiTVx1rAdevMadEDmTsHdwwwzWGmY6tTu5V1ex/1//1zj4a38NzWAAnk7Bob05Exyz8ufyer7xQL7uHMCLV2WeUl9PtDIfk9fSvO40dDbRDJ+FT0SEIK14v9uY8ZCWgF6h5eUsFfIuX8fjtXdHTbNpAFaBX6ceqSK5UUeR93XCZzANcyVcCfxRii1fZyphnNBEaNsW63fvYLC2ivbs/DO49vTTk1IK08MjtCdnUESJ6NMpPcVGqGhZfeb2HiKA2d4AtnLrJthoQJHbtZtlK/Lxpt7XUZQipaDPz9GenFgHM633LR7bNA4nfw0wUuNGRpz1R5eCbn+wCOVdGgOsDYbb21DDAfRk4o4qFrFlTQIgkp9X7jy3vFEvX69fqE84zmufCIl3zPHGMMMGxhj7qY0VoqdTNBcXOPzbfxunP/iD9tha21q/+fL8fNJA7PhIdMDiW6m3qAvWTY7ZGiU92JFYKKYXXmU4ztudkiUdr7Gz4Z7CikFGzhEuEQOGCJgOBrrtqeIbS0tAr5B1+foRBk3zXSM1gCZoEA2ArolgmUjXO8DLr/I+9RpKczm+F5SspXzvIc9ojY0H9z63O9wJcEfW9mEmUzTsQDVhOQLcK5w71e+6uFiuAtln0uMes21PtbqK1Z1dcKsDWIdUhGW01CG7Lcc54Pcy4znvr0KqaTA7PUN7egaQgvPLmZXEg4sor39TFVQyrZnjmOaYXNp7QktjEAwbDG9cByl550DV7IWwjFIorewAsWyxcO6dAGIXggoUcv1LKXCzgTF26cWYCNxmOrHny4+PYQ4OwE+fwTx7CvPkKfSzp9DnF6Dh0O5rMYJXZMcEQ0P5+lCsRbWZpUzkv3qc7BkoBaiLdArBoDbouiw5XREMJ5kypJe4Domh1G1AzDDA9OdXL5aAXqEloPdQQ/SoIYKuvqVsUngNpjbyCWF7ejZQe4VTHz2J5rUZ+U0Ed1q6AcCKsPHg/sJCwetIpAiTJ8/AugXUQPLuLOD8tBYDwwyK/dlscqbgG1sYbV2PbnTZAUcG5n5szNMKr7IKkgsKnw7YGdQozA6PYC4nUGGdM82vVljPkkmCbKVAxX3l/k+1AznE0QyMtrZCUBLvy2g1kcnGtFXKZ40PQSGocmYHBocLRNgDtvuutYaZzWCmU+sU5vgE5vAA+vlz8LPnMM+fg4+OYE5OwBcX4LYN5mRuGisgzGZoGmW93xGV9aq1DcNdxIQkdKELZBTWrXveM7I9HqKDkr5NOyKNEPJwtXFWnOT2XFA4gy7NWcaYigxAQcOPFgCfvjW5E2P6o++93wKPX5hw+yuFloBepY8MACil3mNFYLEjzunZ9YlSnEmm8nHO9AChRfhJgai1JYCQJpRBeTCDAQAbA7UyxuaDuxYMPxfr5ylH87dNXTx56s6wln7dJIDCMxKfVIUWBcLcdOyvTR1vb2G4sS6uTU37LAf4T5b7/JidPPYKCZJSmO0fgKdToGmEsOS/ZGDtnoUmDgxYct4SeGuKoKyF1P695Wq4udmREqe/5KPgUUYk6PuCCOQDM9v1a23B2wjwNh64Ly+Fxn0I8/w5zLPnVvs+PIQ5PQVfXgJta9Mh2CUYV5ywd8JokNYgpaCUStrVe3kN7ZPLJpkWnob3dUExCGTXUeW9fc2J4JlEJMHnEgm6Sxorn2d4HuavtQQBfpd7Z/hamf2xNcL08ePHRkRdkqMloJdEjwHzPjAiwpe0h2/KRtlC3DRDF8qjeYYmNZ++dCPwd00thp34um3RrK9jbe8mzGt5ZK1DHZEhCDDtDJOnz90arqmGTGL1KyZF+Fo4roSzGnqLlb2bGIzHaE/P7dpuhfGGdBy3jOCb5+bNwj58dzdV5cd60IXIYhxh+nzfrm+qBqkYk2mO/lnQ/KJAOW+zJRdf8gepMGBCQzAqC8zpL3bxvQCsKMZhBvx6tjeT+3Vu3cJMZzCXE5izU5gjayo3+/vQz56D9w9gjo7AZ2fgyQQ8mwlTPYW5HLVJBmY6WHP8jCYCFCm3YU6JseAiFjwhr6oYYAmwi5ETgLhnMGZtDIg9EaiVocKXiolVSiDFGGe/D8BvALRHzwx3XMzCQLBmynFFAJFfIMFE1HgJ6IKWgJ7RBxbQ+b3rt+4SqXvajaxEW5a4Hna1ut/IJ0Zump8jCxTh6vpNudruJrN7pGctVu7fiTvcXzvj1Px5SKqBvrC3rCnVxI1EXUoCSj7waUtl9QrL3OyRtT1Q08DvmZDjwpsUKXzP8F4MhMDwIeJW8v5EVZkTkWHNzGwY0+f7SQESkJStEZ5BMFwHTWGpSQL0Inw2rg5HURVomgbP/v4P4a3f87vFZjwhBieTyWnbAbCdidxr3W0LPZ2CLy5hTk+hDw/BB4fQz62Z3Bwego+OwWfn4OkErLXdrEUeuIXPeQBweYGjvcxt2LLfFIXy2eg2DUU1q00K6rFVwo6bejsW/VsCaxknA2NORl89OWHuiqJnR14sNHtRPs84OVx5rFzw6PYVMbhr43gjW3wY+Sy5m9Y+XHygvTG0BPSM/A73QTP+4lg1YwaMIjsKPT+O4zUy79SsTsnDbt6azsyqMJA8ywFcpiQ2cLkd7lt3bmG4vob2/OJzt8OdmaEahenhKaZHx/bIWgE6QG1OyzabB4rzIci2qwHDgLF661YS2W6sEgOAOTi4AVNazEpZPAOsCSEFk10A3ZkLvarIzzNMtBqz/YNY7j7WWJUrI9dOASjvgY60gnbNILZA2DBjbXMTBz/4t/BT//n/DV/8fV+3a9Z+ycWBNTNH0Nbabkyb2I1p+uQU5vDQatzP92Ge79v17eMTmLNzYDqNa+UOdNnvlfDFMiZKWRyqCcCCsz+mZoW2DMB9NQWwhw0VflMYi7BZE3nHR3UQjY2Y+9evbYdnh7KU7JQTfSSfJWPM8zCIfGp6vFQV8jEnOtrYyUJOkLTFjbH9+JFjt8iNwhkG61TmA+Dx40rTvMG0BPSM/A531aivjpoGLZGBP68vwNzpJo4nZQOZ06FY48UJA6RFwtYGeBZIfDVaY+P+PXef9MXcer+O5C9l0WfnGIAi4PRgBcSreEfYfKpp5oDg6YZBgwFWb90E67h8Zxdkcj0zHRJSAPRp+vdV2K0NgkVV9TnmCYIFDGoa6MklZgeHtpW6Lu6RfH+O9OMZfzqaO0sR5QF37ZiCXcJYAYFW1/Hz/8f/Ey6fP8edf+63oxkOLQi33kx+DnNyAnN4BLO/D7NvzeXm8Disb/NsZoHZ1TkCJQJeJcAtZqU4KgVbrLRfSXRgYv3yv0X/1pYkAgDX+isoDouIojJ/31mpNh6VjhyM/RfZbxLwRaAgpFbKLCdLZj2xN6vBWlFg7w4gMNikJvdchEmJUuGH+bIIsiQAS0DvJAX6mvJrpIg8NkjdEEyOnKbmBnxtU5RfnZSx2aeXMfD4s/bNURbefzo9BoYgdrh//qxSBHtX9+T5Psx0inDlYhYux5hUxvl0ntpkuxo2oJUVrNzctdem+p3RQsvwlhkSx5+8mT1Yd3J+WDMnSMXN/6EaoytpofqydSqjj0/QHh8DSoHcjuMsmE1T8HbKy9ybeymaBo0stIM/8kmu6gqkGGo4QrNxDSd/+b+A+eEfwcaXvwRlDMzxCfjkBHx6Cj6/AE+mYLcU44XrsMbtnzFnwB3ztkqzQsRgit9Fm8s1N0ofVudlrrUmgFRO+aRRg7zE2RiWXzoPp0tQF3wmDsjwPM3TClXVDShUTzuU00qJlWKIPANfJMA7lPF5sUijqI8M4Ha5K7oEgG/82Pu0vA89pSWgZ/QhPtKPAZBSXzVWSqbclAYIiMzNZlILQKmthCnkgFyO+zx9SgZzBsvuscSC8JcZajTE5v278XjV541cw1w8eQpoAzQK6fo52eM8OdhUkkHHu76sZWszANNqNJtrGG/diG2aMKPYIVHhE2u/AvNleRMeljF6En/6RLKQlqyn+FFV+JsGs8MjaO9wSNc3HMrfNaGplngn3sv2SUzT/p2/eZ2gwKBmgMHGBuhnfh7nP/cLoMHAanhKdaxvO+D2loLQJa6RSQWzOKVFgt/0GuQpEYAqW8UpTyDv62R+iqWzGvpnUl5NBu9uUw/ZArSTAgrekWC1TC0646HAlMpysqwJRwyPMkCtnWyHszxzbtzyoBCwinHvvwlrJylyIo7V0N/vaI83mZaALsgrUX8Mt9YV0bvuYJIqTOJuZuYTzDuBWCyzOInrk1VuRAmPCoSS897L3FprDDbWsX5rz2ovn0NAJwJgGJdPntqqmtRFZM3xaz/Ty5lZR/zsldf6dNtitHUDo83NeGSN0zAhgYD15YZIWQL5mZTMD8RK3LyOnMWt/UiAmC3QqabB7Nlz6MsJBqpJtNcukuAp8awrbFXAqr5IW4OcSYCUAoyBGQ7FejWcth1LFGKHNWu3QuZN5R7UXeAI4NkKcIa4se2VEzayCifCGKX16myg2BsSuKk6UHw4Dn1XphsBOOEXHR3AcIKO53ZC+02Yi7QAiInH1MfhKMvXF4xDeqQIrN0Z9DwP10/lXEVsGzvZLgHgB548+fwxtpdMS0AX9KEbWhs76oFS6rYBEMylCgVHK6RuRmE1EvJlN8etUgcSVKJ6IAcA9uBz6yZWtrde0x3u84mUgp75I2uqkOa7KJV3UnSO77pTkPugZLtq3WJjZxvNygrM5WWK/BKlkqTT3dkJH12ALKhHc7RkdJlc13vkLQkHthtCCLj45e+AjYZSTYd4000S/+eB+9Upgq1Syu6G9tYZhz3yGFiA6wSsM8E74DnFYVEDpwD08jfKOVRM5wKCihoBMd9q2ABwpbjH/idHgccyoVzM6BNrbUgbwkuMtXcyxR5Twbys/PtgWaMQwbhNmOEK2RAlOcgZ4oRTBGAYtsfWllTSEtAF+R3uQwy+tNIMGibSCmiitmQHWjGm5yg388b9omGALFBup3Ll0LMW12/dxGhjHeZysjiCvEbk/YxPDw7tpG+tVpzfrtYRu+d36hhFLuOVcThkY7TGyq0961/8IjevUkgrzSq9XtcDy9y+lkpgZanHamspguem/Py7TE+BoS8vcfTf/SiGg6E7F2y1qCg41VulKKezltQ2fi08pjsSJwIapQqriQVzX4Au4A4v4nMhkFMRuKYVZuCWonJHqesPOi0WoeR9be0TEdJmthGDy9JfbaDlZSqktFQw7s0jsySwcArlx643wXcWzxciLwcDClhuiuugz9dZppdMdoc7wEo9Gih3Ui0R/R1lozAKn11TkxLU5+xTPq896wrrwcE/YFiBXWuN9Xt33c7gOUz5dSRmqEGD6dEJZscnds00u687tRDXwYSL1ykI+pvYivvRxU/bplZzWb21lwGX7wCOwO2PPsmd01kX+DHiNXbxYaNLK0Gl+yyv6wYBi80233iblRNGp1M062t48tEP4vInfxaD8djdOZ6PNU6e1TPy9aHiWUFROZsb1Ia3c46IoMh6WQv/yLpPJSIoReG7/GfnojsI5bQ7nx7lv/OikYhTon1a40q96pUXn1mn1uZ9VyqxPhln8GbtLgZSKU1JYqQwsoKJinaMyWqZiQATncr4skqTez1umVcQBpaA3klLDV3QI+wxADRoHpHyO1+jGSoyUkfxYXgkp1npbANFuJhWHOz5OlWfdO8/k3/E2Hx4v6o1fR6IASjVYHJwAH1xiWHgVaInpKYrmUVIwYaz53C9Gc8zZ4oMsJY/I+FlzAxWCqu3btbj+PVzicr+mSiSHCoU8og6WlI0nw4o0ZrTLi1vGfPHrML9gAbWL7m2F4s0q6t49nf+Hj7+y38Vw+EQZhLPZAfZo4ILZdumTyK4d4Tm2sP62Ba1Fep1fCO17/x3Ejyj3GwuWl0+LOsR5nkl0a7nyfu8Nbs04/7FsZSTdIWsXUeT5ixLU7pKjiMy6bv0S7o6UGNxLqgHYb9u6ZOxR9b8nMwGRK16FN3qGreGvqSSloAu6H18wy6bK/ouu+eXSgtGcLZAucJXITEB0DPvEyGhPqm7GGwhkDMDgwE279+F0WYB7eH1I3s0ReHy6TPwdAY08ra49Cb0hDn5PxJhXCeF42WcBey0u0ftwRgDGg3dkTUjBCWhHclNcYVmU37N8/NFzgE7DefWHb12GbQ1F1ncAia9pem2BbSGmkxx+nd/CM//xn+JASlwa+/r9jdhddwwn1FlQBVt94KIgLDzGhBt7F5SekSwr3g5UlenRddcySZvEaw6uec0ShFH8In6YAhpslviyZWJRaiYL0X6eW4Fli+UR7SWi4tZlK9j9BInN8alom2aYDjey4wG+Hw61ngFtAR0R54l/y+vX98iorfdhrjMtpZ+JxG7uCed5ZduUK8dvewSUvtLb3FFa4NmbQ3rt2/ZHe6fQ0T31s7Lj58F6V7AMwpmSQhhoiaeq4FxV3HRG2I9PN18x4H50HiMlRtb2aUsGdAkqm1MsyqgBRu9L6MTINwFIsGxVwLaLqhhsNbWP3m4zlND6xZ6OoO+vIQ+PYM+PIJ+tg/95Cn0k2eY/fJ3MHv2HGo8hjEcroBlFpvORCvXflVHk9TW/O9CMMnUfjHI8/QzcSkTeOXPtHE7Hbj4L2JDwzwttnzg+qULqB3oxAWOtFZ97ZYLC4vsVg+vOkwcyUUuizCULJ16lL5faRokh3cA7Xj0tOrHva9MfjmTlxp6Hy0B3dGHbuiNsf7WoGl2NAnZPwyqTMFLXpbSbC5xLqgAzH0u39tPd/UjEUw7w3hvF6s723aH++cPzy34ao3LJ09sp2ROQQqSIBwFfpEeYmNWAMS/TIWGWBajNQbXrmF4bVOc68/V62rBUozPco0avi1YslHLCTImAW6rdeu2hZnNoC8uoc9OoQ+PofcP0D57Dv10H3r/APrwCObsDHw5ARttk2sU0DTgi0sAzoVpfwVqNZo7jsuTHhwEqSJ+BUhiOHL9FcW4SEmoaqFKYM7mYp8A0lHTTnesXmCEMFZTHrejXJnsGcYidxnhhZZepJGWu+BXuZxbSb1KlYC5QCF/+54hRlgv9zva2W/CrCbYXwBraVt6iuuiJaBHUgAMqeYrK6ohDWgCmj7xuLj+EEEZDE/lGC2AZBG0Ddun8+coeArI+nDf2NvFeHPTur78HCK6Ugr6coLLp8+c05OceSJHXRSMjKjUXpLfJBhRoubBHY2xFj4A2mgMN9YxWF0JLlKJvCtarndwDSSpFO/s2rU0kTM0W//kWluTuL64QHtqgbvdP4R+9tz+2z+EOT6BPnU3gvmTAOTHpl93dO3TtmhaDdU0CJdkZK04j3rDCBzrOkO/SIK5YFXuKEkjz8UB7gjUK8e4iPkmyBBtznnsLH3pSK0qP1RTyAcWpYETDbaed1Vmq1hHKrJAKXh1lLWgXEDxO9pJWX8SjG5XwwW5lrDLZnZK81JD76IloAf6XgAfYTgYPGpUA2OvQY/jOJ8wFTCvPxAgnyl10plElSkl+advE7eJ/oPs8aq1O7fRjEeYTaag5nMG6Mwg1WB2dITp4bHd4T6b+VcuTC1iiR65F7Za8G6eHjlh2D9H4gIPKWRVBK7C/Ou1bfYXjFitW2sN3c6gJxa49YnXuPfRPt2Hfv4c7f4hzPGpvaRkMrU3gvmxQ2QBHO5SmHAbmBtfriZE9hpP5Xxrgzg5ipm3RZ8W7t/n8lGwRsxR+FOtsSoN9ZSjRJx5x0Y752R4T5kEMn9UJCl1HS3sSWNemITv1DQHxLbuHONOkw/p9JSnyBilpSW8rxsNysHghR4Wez/Y30Evjzr2b+STFbCnNtTyHHoHLQHd0SN8ZDGR8Mhu3oiTKBrR8hFufwde4DSBqjelQpuWL1KmWrAHSnfawxUUAJg4HE1iWIcN1x7cg/qc3a7miQF3y9oh2tPT4ATACyxlQ6CuyHQ/WoCsu09yoDhcGePsm9/C/k/8JO79hl+Hy/1D0KAJYyNm5vrCa9n+7m1jwbydzWAmE+izc7THJ9BHx2if71tT+fMD6IND6BPro9zMZvYSmAK4ETUrYwAur6BUkEe3nDtVQnq0K7RjxfqBbr4t27ULCCS497f7fADtjMbx6+IFzQdO/s5HCR7ni0qUdcrV3P6yUC2tvoZaIO2gMBRE4W/V8ZDL98rZZxp4KVA5gVLBzQk3RhU5Db00uc+dn27MGgCkzCUAfN/e3hUHzq98WgK6o68D+gNAEZov++EX5r/DRr9+JidAMlF6uItnxJQ8ixMuhEnSSe1knMWOZMMad7xq4/69z+f5c1jmQE2Dy6fPYSZTNNQUYbzkJcHIKzIv0h7hzzEPVYMhAz/85/9dDP/Mn8b2u2+jPTuHv9PZuE8t7t/Wl5cWuI+O0B4cQT8/sOD9fB/m6ATm9BTmcgL2wO363J95h6sPnEZPWV39p980R/K5PMLl/3ogD4kEyOrQgmvjp+u5eOUT7OwIG9Bql15L+wTAPif9bj04nXP96X2yAdVXtML5kKceVA2gSfWwQSjoKEA34Me0qtnPl8g6gd6/ZWZrcnd+Aby2zrkgmWct+CoBfsMhsWEQlL2cpb9obyQtAR1BcObp+t7N1QZvGafO+IkQB5ccralWbZ9kmnY2GWqspMZY2M3gOSEzuAeM0WhWV7Bx97bz4V6t7mtPpAgXHz+xu7AHKtaTPYZX7RiLKEhzwwTBwEkHDVl/4murazj75i/h7/yx/xW+9Af/x9j88hcBZphLq3Hro2O0B4donx9AHxxAHxxBHx3DnJ2Dp1PwrI3meqFxe4uONUU64Pbapyusv7vXMzYJ3AVc5Ru/XEIeNue6ARYqVw9GJO/ru84rKnstDb8skErFIXxnn4UXMu08DaFGViqRaJc5QHZQH1gvNN0yOaOoRq2Mc5JcKAz36BsC1EOQSrgkHxe4T4gOF7Owd7xkfxs/xkVGqQXBj9IodPoCGgYMzNLk3kFLQAfwdcsz9cpo9d2hGmxqgFVhX88BxN+FXXnmg2fMosZXAvAX/K5yOUsSL2o67LiSnmmMrm9ibXcX5nN8KQsbxsXHdoe7PyMNyCbqapNu5mLfkeiXFHCs/G8ZDoEco7LnnEkpKGOgNjYxPTzFt/6d/wAbX3gXg5WxvcLz/ALm8hI8ndkzt6Iy4Q5un6/TuAEOYOKFReVKEjSTTNOWGos/Kpfu7Yg7sPM1/JASoX9cpHiaAU8XKEvWm4OqCFdNowbIXQXzyBPD14TpJIrPuFKWuVn6gDWpO7H5Z8+60unIL2rgIo0a6OdlzsJ0JJ/m0/O+LyJ3lSUPytnwCk5l/HiOXuLcRrdSMM0SEUc3STPDhDX0pY6e0xLQAbyH7yXgI/AA3zVuGmiCBii2TceEnju43fyUbLkaDtkkCBO7G7gS5sH2KlHTtljb3cb42iZMuLP780MMu8PdTCa4+M4Tu8OdTYq/JAGknoYLVhJBMAsBDOQEpMKsTVHzUgqN0RiOxiAwJj/9s5iqBhg0oKaJyRE5V5dREMkhzq9xeyAnSseI1JA8eJeiJXkUEMOFKmOtrkLF0UXBtE/pi6Lxqke2xB4HStrX5dPXWaEkCIw9raUf6bJeHPKMISsIN4dkG9dKRJUHcVZKJPVjiEswWyhx+bgE8+S9fJ6FmSNOxHQy609O4TGLFEWeNdZUiHHSdKO1++1EPlO/LyAI3Gkpwnen7ZNhhhpYQH//vYWq/EbREtAFKUNfU0pBew6bz/o42sOPdGxTGq5vgmfaQxzQXKTvg6ejNzqxsMeUCK1usX77Fgarq2jPziwgfo6IAJBSmJ6c4vLZPpqmAWZahOAeMK+xtFrfydcOGAKTSwPFFO036zPcngtHY6cOGQMyBoEduaGj3ACyQ4lCdoD4LTKq+SvIl3nyKiTm9R4gSdlkHpDTMSgzl85m4i46kUYUWpId4tK+WywBiBE9p3s6Oi3LD0LQ6GiPrrbJJ9e8uQrhtS5EcGMDZDd9+XoLgS4XwavOYPIku4ormrZWlQT4O/KpCm6u86uOcQSuF8pHD7hb4ZbDiQz/3IiLWfKFRWkNSN4QMZhJM5j1bAoAeFzW7U2nJaADAD4yAKAa9Z7nopLZSgoDVuCHlC7TAR0BoXMOFBOunIEhKzlJE+xigOw1kxv37qJpGrRzNp28lmQYNFQ4+da3MTs4xEozgL6chnVz3wZRY+9eEa5p6pYZZTGc6RpU53Hx0zJzRaoAorCLPAHubBOaf54LDx4DqkyzDsH54Ow79FMCPTtBU8J8HCvFJk+RdPoz09IRL6jpdIaC7F1AqPnHlpL3tc7Nw3dok9U0ezTfAM6hTXz/xxnPhgGtrdMh5wSJhkPQaBTOW8vZ2FvXOXULVeoJl/Conmz62rvCZKLS3iETlnuGKOxwD8DtNpB6tSUvTJRpilHv27s1zeq0t+hvMC0BHaDHgPlDwJCU+qIJnDQTlQUTLSdMKlJWJ0vfxBPp1oJLpxQ5s/EeuBkAk8LG/btByv68EbczmNEAv/T//QEM3c5va57j8qi3Yy5lW0vOXGdbNZ49j5J1bmH58OJfAd5JXAHMBdNzfym+Sj4lX+0Ey3KcdlcpFTzzsxPxXdngwSJUSz+RfmpqZLQ/VeN63OwBsq4HlNdfpldPrpwhoY391M960/kRQKvBug3eC6lpQOMR1PoamuvXMbhxHc3KKtpvfxuzb34LWFuLhUFPBZG1TUBILsJ0VqYmjXbwnXoBhFRZCzWPrWTCH4Cw/BTuPecut69U+SZfE8guC7Wj1mroH84pzptIbzygf2ABnW/euH1XEd3XAECU3flQA/GUhLIRfif6VcU0FWkBRMk5oZjrDMBoAxoNsHn3jjsGtUCanyFJTdkf9RpsbuAX/sZ/hZO//99iZbyK2ckp5OUNXQwl8mJKGTM7wErMs/GzrkdmclqSJ0ER3OY5WRcZJ+l18Z3k64RKXQTpYOsB6bpg4te705elS9YaUFKmuua5RHEjmLqltEUAuK5x17uvIsnMo5qcnWfSKVUHE4n49NIhWwDSGka31vMeM6AUaDQEbaxjcP06mt0dDPf2MLy9h+GtWxjs7mCwdQPNxgbUyhhQDfjiAsd/7a/j6C//38HjMRIe0lWmIGJJsatOIUbHQF7AiFHhKYv1WE3wSgWR+NA7OYJSIGYYAIZTL3FRgMw3x1XKxpjpofKAzo87qvam0hsP6I/c8Bs0oy+Mm2aFAUPxpBDkZ9UyJ3Yb51qkPLVen2Ad3F2asCoRWXzzeqg2GoO1Nazd3HVH1l4PQE9M3JnjFa0NtHFr5Frjm3/l/4WP/9r/ByvDMWbn5zDeI1qyHplnIJJHWm3bNVdvBy6+iLy49B1ewV4E5tQHPj4UAcJefXXKBA8S4yIIEz2CKJWFd8ll/sKFaMJJhHSgclcdxNhOsovmApFkOqEK7dUl0GXVikG9kx3/gADjzOOtvdAG3g/AYAC1ugK1tY3hzg6Gt/YwuL2H0e3bGO7tYbCzjebaJprVVdBwgLBGrHUwufN0BvAUaBps/U/+AEbXruHpX/y/gMejSl3Tjitl1oqwVKMOUM97qxotZ2pZPl2C7yISgzS5w+1oh/MSJxMP5eTkI62J09ABzDDArDvXN5veeED/UbfDHYz3Rs0ArSIDktemdo/YsPvWM5aM+SU8qhAKUhm8YFaIaUqQyK8OtWEIRrcY3dzGyo0b1jT4iqkPuIPTFWPQOm28PT/H7PgE7f4hZk+e4fRH/zHOfvJnMFpdgb64ALetO79aM/1xxqT9HyqYUR91MquuOmZpJsJDBmr96VZQvqLZL1SaROiUY0q4LZrDoNPjkSlEFuGZw1G8ojzZ4wKnO7ApAEsSdl7vpXlbRTsdg1bbbmFmrbslz2nb4xHU+jqarRtY2buJ4e09jO7esdr2zV1rNl9fhxqPEG4IMxrcOtCeTMCXl/Holczf/zMG7f4Btr7+P4L++GM8/at/DbSxAevZL2+rlBf4Z8yiD6vSpatq4bPCB5FMpxvYRaP5BMNdAF3rFvm4KMaJA3A2/gSEsp7eWN6F3p1uPmbCmXZQe0ymnVORN5beeED31DTNo8Rdqp8Lfu7l6lblZ/6Ca3E6Q9cfUgLi2YQUWoxuW2zu7GC0vgaezV7ikTWhtQXgNtDeWxqz809ugXt2cYH25BSzwyPMnu9j9uQ5ps+eo90/QHt4DH1+YT2mEaEZj9CeXUCxgxKO+eRUPeYUmqNuZneh0nQ6nnfXPY8hwbAC1Fn8mGs3Q6tFL0KT/FJj1Ffr/2SneF/UbFxx/XHxvgYA3WXpqL80k/sA3kTu7nxn445JDQdQq6totqyJfHRrD8M7tzG6fcsC984WBteuQa2sgAaODQrQhrvRLoK2AxXxr9LrosA2jD6/wLXf/D/E/t/8AZhZ6zTNomY9LeeCFGYPKTzWx4C/ojcISB3A7C2MSXmCkBx/1krQdX1r2FMSnMjYyem9KpbpcHSZnVhq4EelFTMYs62DpYbeRW88oH+Ij/RjAIroq9bdR6krSbPkwlpdj1YUNSgHQmWU8CSaNqXsGrVzBsBE0Npg9eYOmtEQs+n0UwN6iM/RTad3COG1bW00dKvRTiZoPXAfHGL6fB/TZ/uYPdvHbP8A+ugE+vzCajbB8Urqm5zYQF1O3POYd9Jq4WA/hddhCTQ2WbUlKzVE6Nmkc7qgpmTfNoUUxCmLUy9JPsLylGvllI98/F5ISUkMwrpJsz/q3FzmTIx5JUw0MrJj2rurhXMfym0LblsL3v4olNuQNrhxC8NbNzG8fQuju3cscO/tYnDjBpqNddBwBGqUEwAM4NbI+eLCXQbGGVCT9y61UPnrlbZlp9EQzeYmzNGxMxt3COgipzjLST7OwrktsR6rCZV+4LRt02xksPil2BAI1G7AIRGlKsv6fgOgiNw1viwsD2l21TYODIJABmBguvLuRYsfqgVe0psO6EQA/yFgDYq+oC0Dof4R5gVOOfEy3esqiJ9MBsm8uxKpS+OGGYOVFRApsGFQ7Qh6sZsl17YBDrchWR/l2mi71t220JNLzM4uMDs+sRr3s31Mn+9bzfvgEPrYA/cURkfxKLAwivc8MxvAGBDsRjMFBaXIMg7Oa9h1B3U3jswXvDq0D7l2K7lkhfcWXReeCWGQMl7YW6gOLiuPdVWtFeWYK3h71eQqRm1QpHLRMxVsu6owb9Qu0gTsxgsRgaczmOnUVk4RMB6j2dzAcGcbw1t7GN27YzXuO7cw3NnB4Po1qLVVqMHA5mCMFQC0tm53J7NYH0I0lStVttWcci5MzPa2QFcPGgxAurVW94WWFEgAdk3oyvqUy0fJAKXufLt72gv0JW9L4mQCY9iUGuaSAtgDek/e3iTq5XdfDLf0QYTJN957vwUef/r++RVIbzSgfwC7w31v8+6DRqnbRgroAKJ0nOkzc0ZSp3lKpgkUDhTizmQqYqUUdUNyovdgNMSzn/wpzC4v0QwH1lOcPF7lTYXeTO7++fVtbUy4Eay9nGB2dob2+BjTgyNMnz3H7PkBZs8P0B4eoT0+gbm4hPGuTr05z53R9Vuy2K9jOo5AiGAX3JzCOmFRssppM8EyNqS72D8hpcl7Jpk52c07uOY1q1pWmUYJ9pVQWdkiR04cpUjAriwldC5ph+FD+at6BQoB6Yosk+eUKcm1gj6kwLMpzGyG8f17WHnnIUYP7mN0/14E7mub1kzeNHYsa203gWoNvriELhzduI5QKtnAn9l+FpEAPxEREfTFpT3mRnFzrC1EXTjPUljofVXBFh7ZGNaNcT1+Zg+oSKohl3lSXRhKBLA92sfk5UmrJBQurZ2kUO0CYYIjBsA0ffz4sRExlyTojQZ0v8MdzeBLK81gwIAhodvKAdb1PaGM2ZZhalK2eBcgvbLJhbJtV+zX1u3uz9HqKg5/4qfw9/7if4z/3r/yh6BmcQ0wMZOz+f+39+fRmmVZfhD22+fe7/veezHPkZFZmTV1Tdmtbqkly22znI0ZBGKQoDuqLSHZINvSAoMlYxAsvERWLi+WsVlCgDEYLZvBILOoEIIFYiHQVNkIWqZpqaeq6qG6a4gcIzMj4sV77xvuveds/3GmfYb7vReRQ2VE3J354rvDme85+7f3PvucA90PGLoOw3qN4fAI3f4D9O/dQ3f3rgXuu/fR378PfXAEs95YpyLprRp+2Y4y5/wC1q5ssSkIlB0uIq7dlZ0SlW1X38M+WN8qz7fzl4q0kANzAWay7WViIsUCqNM0U4FNim1j3cA7WWbMbrRFagzQxeFafSTzz6weOX/FSdp1pDAsrAZVpJEQ4rQ4paBXK9C5M3jmD/0BnP+x34n29Gl7TC2zNY87jdscLVPh13cs/xeKE8eIkFlKMMd2AeT9ECllT9Zzfi3sJS0WvyfAJS90jJdTfDUWbVIvFWpmnfSbVzp3tZiZQOCTJbLCvnOA88K4cTvHhXXpEOXMOhb5QQnAnpXFYOaNaIoJ0DN6qgHde7g3Db7UNg0GIoO4a+c4FRxtG1AjdD3f4eth5QtKB5Do7zJLcFxf1zLj9KnT+JX/4D/C0Vt38MV/6CbavT2YvsewWqE/PLJm8nv71kx+9x76e1bb1odHMJvOOgOxcUzHA3fM12vcXvInUR/lCuhnLKKAn2/KGcHbhyM/4PPWSJbsbBeWtoGPPbmOksqMaaKjCshJOf6xBTsmnfx1TXLYRr5+x+GE7JMiXrWvAQUAVIwTZVE81+UsAEcAYFhnqGG1Ai5fxOf+z38CZz77GQyHhzDLpfCT8IhMgCLUxBt/2IcfHOyewecjFuJTVqXSyfL9E7n89dHSrmlvyqOAP2hMigtlUXxcB60jJY3KRI3iNxSCFHPVwz58AuMkS+ETY/y6dK/s0zaemJXSmdwB4CtbRIynmZ5qQH8RVxkAFNGLJBmGgKBCM3cMNrdKjYEM4IApOHLlXtHZlpi5bLBFUPZlVsyYkQKxwbkz53D3r/41/MKvfAtnPvUCeOihD5cwy6U1/fVD8ATmwCjlDtUUd3dylSA3KCUwkwDvUEyVsgsp6dfdErZoEJIhB0/ZGKKms3KWQmgsd3hNPg+ZKd1FWtXSuTSPFypcwIfBiBOFzRDJ3wRtzwepqXNCW/UMVbZJhT3GNjqmcLla734jvoYMQzaGGQYMrQesifGFf/qP4sxnPoX+3j3ree7mt48lXx9pDXC/zH6cUKHSpVXK+lKq2D8auQEz7O+njmDJB6htArSFxiXO8EOM6rcsoifTE5S/rWZGWWOX493Fcxq6YJoAuNhUJsSoddeQsBXgnMndA/q0lXuFnmpAv4lbBgCobb/gz0CPbysjeoz7u7AnEjS3OB3l2tFYB0/XDDsnIjBaKLDRaE7tob97D/feuwc1ay1zlPN3jolAZ9p2gGDLYDw79cvypRiCrLli/Fgn2VxU/IviumwXyZDLVhhrb0oyHuWAIafxt1silMU56cP0lSzACTUVD5Dlvugyfr3NkrA+KqffKqdtxQpJUZaG/BUaetw+1v5niHD04AAXf8/vxuXf9iPo7+/HZWSjJMFHXkqBJQqhQYimImZMMR/57wvJfSmtBKEPDt33Gsl79E1Jx5VNCjXlGfM+BdldytGYLGFkhlShOcTikF/pkOksKP5gFtX4mbl029dKvBpFQZwBsib3WzdvEm5Nx6fm9NQCuuuH/Edx7rwi9SlDBCY3s0NWU83ndnMQGR1cibBbBigYJJ2El1eNjAWHIrJL2NA0USPROlgJvCzuATiCuCyufBPTzWUcH5Oy+qblpDTtTKkUmQLI2iGYS5FYOSQlSUh0KVPbSrnFJVgwuHwOeR8KcYJ8RPwqiBYZlYw4RIbof5WOuA2Aa60YZtRHNKVan0363WjaRemtXwcYhoGBNTYKuPQ7fwcw6EdG0mhuj5YKX5/kxlt8ZN/K03qkEtTLBGMwHBxYQxGLj1+PgZMA+1ZtVqQ1Lqg9zMZHVa6ThklWhcTLsN6cYrhkDXpofLHWP0/I3xL5BTCbrUV/yumpBfSvuNGzc/70C42iyxqAKno6Zbwy19rtAJRbvMrn20edQIsRTph38GQv7iI7+1KBwN67nT1wcwDoBKiFwGLHjHsjN6SgmEUMX75PmsU9SPOp4A5Vh28duAtBoYgEP+Jt1esm+W1pCP6SPRDIHdpDci8OgUeBL5WCRJiYdk1bkve2TqJf+XL6OWXH+Ir1+yY9ViW0TcAP17+OwZLw1Strkjn7TWomGLpvKQPAgDHoAbS3i73r12D0SbcszvOnrOyxnvF9NGtTlIIKkamW+8nFwqxUiuwGNYeHLiFOGiqtRewg5cE4lTL5brClcFVe4b91uOOMsYg4SSLHUyJAEMH64wB+yZnV0E2S6AgHyJ4RiBSDGYppBQA3T16sp4qeWkD3Hu4L1Xxup2nJEDSAZnsPruk2qY7LANx6SRGmNl44giBtCzdSoopaQWzZQSulXYqDJgFtkYR8by/zYZaCc3lgcSrQnIwpVqRw0YYPz1i9sBXPXx4LNVKCkigPFa/H6pODeZ5EOl0if8WqhWpZnOOgm09ksPV1cDul8SCO7iQCNQ1Ya5DbnxxaO+YaTb/HnZtdI7v8qfoibQqX5hg0eWzT/YD20gUsLpwHD/rhgZOQSiJBSGEnf6We7v5VbeZrLO9HAXPrZNeC+x7D4VEmaIVC1uOeMM8AoFvS8bnFCHn/q2fK4iLvwzEo16JGMoywj4C3KmVSIzOVgonvO6ECbmwxwKA1AHztzp1H+SxPPD21gO493InoxUYpy6ak5F50l3FmXtXKsi5e7/TH9UlbnlyzzQdq7PcRDJTMMwP1mHrkYqV8UANcn0/6sICyStulrVcRXLis48OAumVuLpEtAtKJKSmLXOJVE1qOgwKuAJxNL0nNOyf5Ojhm6tdaG38AiDEW3OczNLs7aC5dxOzSBcyvXsbi2lXML19Ee+4czOER7v6XfxGHX/9VNGdOW8CvtUvCUY/XDrdSDRRq964tBq0xv3Aes1Onwlrth6JtmXhQyPuDFB7HZb/3TdQQzNEK+ujI+qEUJhDR3q4cpdb+Pr8HpPCWC6ech3rIlEvhIOnPYh93v/+Fn0M/NjcZIDQMA8TrhyzkU0VPLaC/iFetwtLQi1AEJqmXphruSTTnGH68m4YxVWMyIowvRTQh5zIximtPgVex3W4xPJNhKK1UAfKovZNa+MhwrNapFBVyqln8ynQq5BuTx8MXWsq29CnXenIhbkvdi7Kl8YKXvS83eYHKZsrGAIPTtt0fAKBtoHZ20Fw4h8WlC5hfvYL5M9ew88w1zB14z86dtYeJzGdhLhLGgJoGF/7nfwte/1f+Lbz7F/4y6OwZAFk5RIF97Y6r4Wiblvy9qvnFLk0wWmNx6SKa+RzDcplshvT+yNVHroli509OiJaMDwnMAYBUA71aw2y6kGcxHRKLm2jFAfZGxkaSwjEWhmokxyiS9fzbBkuRxPheEX4JK7NxggpFQOf6YA23FYYoeRoDE6BvoacW0L8MaACklPqcIQWquFJvZ2wVNDwu7kkFblmUyIuyQVsTAxBN6nnx8jnoggFQUb4oDsSRHoGtLEUeeixM+fIYIaj2LIz+k2V0MuEAsCb7sm3yGletMixaSiyVCikwADZ26eAwwAxu3b9SUPMZmtOnMLtwDvPLl7F45ioWN65jcf0aFlcvY3bhPNozp9HMF3ZPcgCs7WliPGhw30NvNqlgaRiYtfj0/+mfBBmDt//S19CcPePWB480Q6hfbSlV+nVPxP9l/xXkgd1ojZ0rV8IGMg9Paf+UqbPfokyYusPtmCPmB0UMu6nM0RHMeg0gn+cvw7siZmU+pp1llY/r/9X8x452riVQxit5BKKQykJD1+L0xIzVJvsBiLIUgqf9cBOgb6GnEtC9det/f+rqVSL6ZPDFtL2oAjKUaZFZ1x8ZEVVfE8od6CpjJQyEEtiLTHM7ndTKg1dvbbBmaXOl2uGmAmI5cguJf6TACfOpseBRhpLLLiT2uCYkhdqWjlBMolY/Itgcx+SloJRsdOIZmT9q0/8CoLaB2t1Be/E8ZpcvYH7tKnaeuY6dG9exuHYFs8uXMD931p633bbOr4gDaENr6OXStR8HoSEUxq3b9h7f1CrwMED3PZ79R34/7v7NX4TebKBUHTzLb0Liy4vGy+dB/asT4jGHX/vfztUrJ4u4NbWyABZXOLtPwSMp9weK6nYf9+HoCNyPHQ4mOiLBafDZwKqWTXZgWGG9jtZZicarSMjao2BxbuvYnCVJSYHFm2CN8LvEsZtSF4KK+xbbxmtMj1zz0OTlvoWeSkD/srUK6R01+9Ssac8aIlbhgO3U3A7xW7EGFfcheBUYgyFtRNp+BI4iQLtUl4N6WIuIcI7zaJg0Kc6ZS6WOhY9urWhB6CgFm1pRolXASx1RmBnV4IsKiKg+QOBDQggaS8ciZQRRZyb3J4D5uW0QgWZe2z6P+ZVLWDxzDTvPXsfOM9exuHIZs4vn0Z4+jWYxt4d3MAPaHwOq7XGyvAoZE0F8S3J1kV4SsuX8GfIuvFIwXY/Z2TNY3LiO5Xe+Z83azhxaBXaC21pYVh5AGTRpKxDSXb+E0JQG9FkzWDXYuXwpRdr3TU4MqVgFJKiHbvyBAnksgVIKev+BnT4JO0rnknAea4SCVcF3YPmOhaIwnrLs+rXkt2UdiiBlDTmmvGDNCAAeTF1OsGK/7WvNIxE+blFpsSqBwTzNoW+jpxLQv+R60HymvjBXLQzBAGhi71Sjo71g8qg9iAHTARQjFMJARVLdClY5F8ol54LKp3VGJgE21dHCuDomTriXzVHl1yfkpIx0DjqUKF4ln4BrbRe2wojgHtQSdnnEMgVMciAegHsYLGNSBLWzQHv2NGYXL2B+7Qp2nn0Gu95MfuUSZufPod3z2jY5E3mcI9eHR6J4GWBXj8vLiBBRK7tOYF4pmPUGYAM1n9kXuvIxEyFHtK0HwSL/0IAusDuIwwsWWXCGVEDdfOqsxeLSJXuk6SNRXo+AKiOInr5KnL4/aGAnQB8cgLUBtT5TzspVa9xMIkoqMEKh7UdeZ9fHVrWQFbNvXUvUXxA58IZTGmwdNZuED6RNXzP9izEBKxQo0AoTjdJTCejASwBehWrVi02jHP/3wFWaxFOiok9X1zs/NHM4QQQBVtti5KVP1hyPREp2qwphC4mkQM6o3UoxXUZz/47LH+Plp/Qmle5HODGnl1R7AcmnIvjIkttlhQrc9zCbDrML57B7/RNY3LiOnWefwc4nbmDn+jXML13E7NwZNDs7UOEEsHh0p1lvwGYNgMOys9CH3pcDGMtl916ttr+OufuXSin0qxX0egNqGtBghPCSaveVphpZ7VQBIootuK2Tek3RaA3a2cH8/DmnxT4Koo6AXmJqT9058z4iih6evV9s9ytOhvv7YDYgbpC2t8ioJnwQkJs2pIUsF1Y9Y0gEsNGxnuWf5JK9T16UufqrxOeCCDBuGaXnIc7DnUdSGCcKY56ZYSanuK30lAL6qwYAFNSXQAQmynAihYEITKWEnG4wguMHiQhbaOmVcMk4ygbVGOOxVfBMQoz+rKjyLggmImzWFCj9Wqn4N8TjMpeiXj5IRfFI3gtJvaZ5J+Er6QAI4DcW138PyxQZ1CgMyyXaixfwyd//E7jwoz+C+cULaHZ3oRq3DEdrmGEADwbmaAktMgjgTQRqvKCTV3QEULeSF84cc5QTwklSrjDMoKaxB/CsN1aIIL+5x8mhS1rx617ylar5cmXVZydAGW3QnjmDxdkzYPMIa9CPI0LU/FgKn0jbaKTo7ytrsnuZDw8OUu21llENzIt7AfqMbCuIUljdBuYMjDjIifgysCiTbDF2/5J45o0jwfHST1MxwuY+hdBAecr2TskEDdvNInlyittGTyOg0yuA+VFgRkr9gKF0NXYYO8g7bglw/l22+kdccBIOedhcskVlMJEA0ofiNELbzmgsmXwpSsnupJ6TpVIwoXrMVEDImqsoTz7EbcBt4D1et7HvJ7QGv5OZc2aaf+oT+KGX/1mc/eTz0MsVzDBAHx1F4CaxQ9uxB4nUOGiuAp2QJAAkoOS5LkGq70op9PsPoLsOSjXbva3lvMpIg24DjDK9WMyktkTQw2CnJU7tWZP7Bz2ZzXFXvADmNNIXKxrto2rqzAAaAg8aw/4DlBq4a2MnPGZFqRgdpFRkA8izeErK+Ur8pj7pBEfTqCnYHkP5RkleZGJj4moCN5+u3aFPys0NxLrLupUjPhHa3Rz6j1+9+hAD5umhD2rR52NDL7ve8bfvPPMMkXpOA2B55qfUgIXaTtm7esdD8uy4Hhf1BSFuU9QU5chixAFwHIVQIwwyZSFi2I8yVAJGBl18nLfHycvKOb8r8o4ZJdpALT0az9m/86zOL6vx5TAADAF912E4dxo/+Cf+OM48dwPd3XswzlOZlAI1yv5uc9F9ZErrC2z7LjK8q5nn0sLmTkqhu79vPeXHoocb0XpjCJdLulvLlTJmOS601phfuIBmvti6lO4keaTP0nHKIlepJaZ9P03lUcHcx1Z+uuboCMEhLmMKBW6PpudKLKTfUssu633ch9re4lS9zBPwYz22l9PI/S5xpEK4fNtXO56FxJcmGm7J7TTHzDBq8nLfRk8doH/D9SizUJ+ZN80uFIzcXoIBBFOpf0hFHyvAtT44qKqp+ndFnEIK2AKk1ewEE60yjiy9xNW3WnoRFrEd8mJluRQJbis+5+8o+asxvaqwJAQuSpNI6+lSCfUQ6VlAJxyujvD8/+IfxIVPfxLdg4NwWt2HQ2XZ0lIh2y5TAq4IJ+YZs9QBAN3du/CbqaQvU5CNQJeBu0xMhj0pDlfiGqOxuHwJqm2Lcp+Mcq03fyZrFusTQJ0hrdhJrPf7talpwOs19NGR2/q0XiovpJZfvUgxafCwgVCSqg/ntX9srUn1jQDpkQILhQFJAyZtGPZxp9DQflOZer8RTEL0UXJpMECGAWWUPW1ttFZPNz11gP4lvEQAMJu3X1w0DQAyRc+WHW/rPGHKjFmiiOyXBQCmzCcx+3rgpPg+DSvz92UoBYfjlJdkUI1WManclrAFghZhoyV3vD1rgpLMerSIqTgm+E8hdWR5iT+nrXd9Bzp/Fs/82P8Iw3IFapptuX8wlHz8k5KQrirYG0IRAWzQ373v8mL/YiS/XMurk8963OwrwuX3DjENAzuXLx1jgXhIGl2KIeotAaPsqu8bzAGAlIJerWDWaxAoCCz1kj3kd4fA0SCU5AJNFF64GHdRWB4D/dExV0geVA/sVi3YJZL+YBbOSjluc/S6uz/IGcxkmEHNtGxtGz11gO6pZXqRlBoZ0eMgIAG0plAfbxYngWsUflP+ehyjjQXaNiDiTbk2fAvW1cNVmikWg9N6B0FDAY0CqQakGkB5T3VrsmZAmMFj6qNlzf5S83oZIPKe7d8kaOgEbLoOO9euYvfiRZhh+GDBZjT32vVJ4zGKzUjEe7vkTqO7d99OISWmTQ9yRYqIZurt9d/2lvOEAXg/BeOKvXPlMvBI2nmZm09/tIRCW2Tpob8l+0cqGdtNZfTBIfRmU7TvSXIpNfVabMre++/lM2Txdlvu2dgNSjflAbOiVFR3z8i8IOHanMFgNpHv1dL3Zc6tC24MGmYYYyaT+xZ6Cp3irIc7tfRF6/EroKrCvOt7Fo+oq855hT2TDSlXtGfJK6n+sJqLA7FkA4/kfZ7XQwCS9xgqMo2UvA4WCkoUI9YGRvdhlzSwBRaatWhmM/TLJUgRmt1dGG2SvPK95GW+5UllNuA22PGzez6MZHEypQDqWuPUM9fR7u5gOFrZ+bsT0RY1+UOn8XxJKZhNh37/QdzEJmGaQL3scd0+Zc/TPHNQya8IIDmLbe+NMeC2wc6li25DnuPq+Kjtm5YzF9Cs+X0880cV51SjoI+W4H6ABziRaaV8x+Ut253ELUWesK1A6ZCJF/ZzIDjR8ViksRJy8cSCudPQSQFGBw1dphuKURQ+PcOSlD0NYWBAtdbkfvNLt75fg+1jTU8boNMrgPk/ALsE9RntUSmZVzzJ9qFUPssc5nI2V4gEhEqYeq5B8A1dOI0c0k+k6wzLtzq8OdbNUasDJAN2gBykbYRd0sygxS5pgGpnaPZ27elfly5g9+pl7F6/hp2rl7Fz+SLm586he+8uvvsf/ae494u/jPbMGbdhBIJmT1m5fDmjcPUwzD3Wu67D+mu725bWGqduXA9ryk/O0jPGRtHMenwRM4b/EGFtPmX+vkjUNNAHh+gfHATzZxm6FHcgQslWKFdCpGKBvE7ehHxd/2EDNZ9jceFCPIhmKz0s/xYAKJb2MQC5hvHDsMDYbqyg9/ctoG/db2C7maDE4Ypy4AMmiFx8gSzVrE3yNI/p+vE1iUQ41jWctOa1dT+HXmNceXqUlosUwzAZMENRBwB4ZbxsTzM9VYD+sgV0bs88+xwpumEsSI0L6P5V/AfACaThLA2/Bna7J+3I+UWyw9N42KC1uzhhbB8zKAHvGU1CtvGZctiP3AyDW4pi1zU3OwvMzp3F7sUL2Ll2BbvPXMPeM9exe/0Kdq9cxtwtR2rmcwckAIyB0RrqS5/H5d/xW/HNf/nfxGt/4S+jPXsm05TyXxalrTGnqEeenD0LQUakzUQ4deOZ961sP5ST14nD5sAvwbwOyKpRWB8cQq/WdspjkC4jgnOHS8mgyz4fJ5rK/MZqwZV2NtqgObWHuV+D/oECa6xXFKxEX3IF9XuTb9uE5ZHzJ8JwcGjPpFfCyz0pnyeudeztXbCqSZOrixw/NuFEjBupbyITRBZwgrYJar4dw4ZT5YAZ2m/7ekydWHTFIAb5shjWPKgOAL5yXJGeUnqqAP1F1zWaFj+w08xaWMdmO5mrhNZLKcuqdcJEK66EiBo3l3FGKQPqYwaSTM8WI4f4LDy5MjlTOTluxsae2mU3SdFursueANae2sP82jnsXLkUQHvvmevYvXYZO5cuYnbmDNqdhXUes5w6au39gKHro6brNPBhtULTzvAjf+KfQne0xNs/899jcdqf101p3QOwxNoGy0FNBJJNPtYcFNPwzJ5hzcA0n+HU9WsnNAN/lOQqFqZFWDzO2yACP6kG/f4DmPXGHqfLeY/0l6kmW1JQaV0aXPTvY8suQmut0Z4+jdnp03ba5QMlUUPpM0AEf06yn0N/n3JblaxMxHaXOABUCGxpW4ywkIfMUI6L5GUaLl/pMEbCLyPxo6wHjpduiRmYw7bJcQ49youSx46UVjwjkBX4+1nTdMcX/umlpwrQv46XCHgVjWq+NG8aDAQDsWl2CpBSOyk159xru+ycFEfqMVpyPjfsk011Tq6EFeCXARaggpBCbBkYaw3j/ljrVNs+fxZ7ly5i5+pl7N14BqduWODeuXIJi3PnMDu1CzVz522LE8CM1hiOlil3CpYNqjIPahrooQcbxif/gb8H7/z8LwCNSoEqu6w14th8+whX2CJRiZ3Ldnexe/kSeBg+aLXtBJRLI1KsjI1heSRJ3E7DCgBRjUJ/7x6MHqBm8ySdJIFj60rh81hNPTtLO1Bda+cgePipjQG7Fy+g3dmxp5F90Bq6A9XaK2uIcCXPlHdZlZrGehyF7YmNwbC/P1K8dDomiEbMD98MI00/XmQa0brH+NjxFPwLPeNig3BMqutjdg16qrAkzW4/SpGu7WzKz/P3R+t1DwBfAfiVhyzn00BPFaB7ooZ+0M71eEDIu5iUaoFaN09BNz6jkbuRkmRBamJrySA9WMZoFHcqY4bRGnoYgpkcAGg2Q3tqF/Nzl7Dj5rVPPeuA+9pVp22fDto2MRzwO+DedNDrjdDk4mY79Ah7kpNSMMOAZncH7enTUNrYhaYMATJ5pUebpfq40CBHFFB230HrAe2lS9g5f87uM/6RAzpXrrPSJpvhpFJKOLzWadHeG2Rz9549IGSWYZxPS4B60rdq30GUaNxZtFpyeMEJsJuMzM+fh5rNMHTdB9zWXFotsgIlW6eyB/lcqM8vTkZK2WNrhwcHMVGud2OhByOeKjZOhfGpEjwsacvZSxXIa3lIQW28POz6mFxg5g8h8pvKeEHFGK+hxz4bgVxWplLAKJz1O0pNGvoWeqoA/St4Vb8CQKH5grHOb1SAo6NcYEy62shIT9OqnwwetOws7Rh/5Ll4mmjq7nhM7da70twe3blz8Rp2r13FqWev49SzNyxwX72CxYXzmJ06hWY+A5EK5vZU23a19YDtJO0PlOkyQzUNNg8egLWxm4sMOlVKfQuEhknBud4+MmxutqicAEYI5lc9aOxduoTZqb36rmofO0rrF+w7idbN6N67Z994VYrL2DaF2ELVLy0/AQnNLCnDyDwppyKK1tquQW+io94HS7klIhvPsh6ImJGISI/Y3YkI3PfQh4dWG/dgh7Kqsk08LFLxtnZ3XCHSdEMaomukmnoy8E6UYxQjJUskuwadEc3vxu8SJ9o3yZuS3AquSgQyBgwaHpwzw9ZCPeX0NAE6EcB/GBfOqUZ9yliwChtwB2cMioM5AU73rCq1ukepRDyiqz8CKEYWG/Nlt9a1OzjA3o1ncONHfwRnP/NJnP7Es9i9dgU758+j3dtD07a2LtpYjV1rcNehX28QuRy5cfNo2vYjExG6u/fDOeJJNd3HiABRg5/4vPhWkF7xMiTS+6DNELTR2L1yGc18jr47+mjb4lHIm4mqdgmr8fGg0d29t10Y83OwQiNPlPMxYxPFNvRDgzjYCZJiSuAyzjKwc/nSo2LmiahYjcIAJZugi7XSSLvg+8q3aWCOjqCXq6ihY+RzidIW4At58iOLkNuE2TzVLe+Sl4kok12FAiWJRj07TZSN2yVOxQ5icklGCFIUHuWl9d9FMVgTmPvVPfRbqvTU01MD6C/DerhfuHDqeaXUZUMEJTbjzrXmgiiXnrPRT/lAGKdcb6w+lyK0QJ7gq6II68NDPP/3/J34of/1H8Tulct2nslYj3QzaOjVGlpyZjm33XyYrPR48gCzevc976PnNj6x71mihFhqVVsQWLZ55Dzy/O1cCMhjGDbYe+Za9Mr/WFJeB8llLXT6OpNSMF2H/t6+XU9vTKadZ+giJVnX/rHPS4SvFykAFtI+6ylZiq0UFpcuZh7oHyzJXhPuOG0/eTSnPGb10TO1J/WZoyVMAHSzvTsJVTmWdlxTPrZrngDxcwe1MvCWUbWlAARYAV2Y3A1HDT1EdclvLabjWZZvMQjUrVefHoCfGy/AU04fcxXkAyUFAEz8+UXTKhB0EA9Dx4raKsI9xH1pkOTKVY3Yd878ef7AO5LAAhzbMlvAgdstSRGODg7wwk/+ffid/+w/icXp0+j3H6B7cID+aAnjPMtJkT1IJDlM5PsL5IAby0SA1li9exckgBxIFCj344ZzkL+kzmfv03Y8po5EcYc6iqkxCKeuXzuZVPYR0vZeQwlnJoodWqkGerlCf3AAkPL7ycTYFP5Jc6L0XbVnZ5+Aq8/j0aU+XQagjQFmLXYuXnCnrG2r/fshjxqxbeIQyKeQolTi9955VFKqwXB0BNN1sRhZkYp2Fw1YE3KY8zgZ1ZRb2l4P3x+2WQyOy6bsP1FDt4KxEWvQkUl1cTiHbiPbXsqazABx9/WbXxrq5ZgIeKoA/SUAQKuaF9umcUMo7xbyUQ7mGUlbUXqDYuxJDaZCCYNlwG/EYF/GXbYY9vCQ1XKJs7/lS/itf+QPYTg8hO5768jmgPvjANrHERFh6Dqs33vP7WDmli5V2k02LycvRQBymqkEoyQ+pVEypmGMAc1anLp29YQbnXx0VB6wm76VAkjYCQ52DfpweIhhuXTTB7UeONYrSSAbR+Z/HIU2FsgeDWG2DxsDtVjETWXel2v3llCF17QYV2PGGi/Tv48hREpBPziASZz9RHsE5BJ5ZkGCH4v03pMT/zm/yYWGEwokhWyRvUvOp6gmG9E46j3OEkTKroiBE+J8qly9TIZrLIM8T502r7zyik/ofYhcTy49NYD+Il5lAFCqeZEUJUwmMv+yS8WxMdap65JsAHVKLkoqgIojACGOZ6uhMwyAtR7w+Z/4PZgvdqDlxhWPC7n5/2G5xGb/wO7K5raFLNqSk2iORJsHZpi1rxeOatnLeGSFJK01mr1d7F66+Igg86h0knxOwLsq+7lT06C7vw+92tSnETj5qRSNknak8C9t7dLSsiKf+XyM1mhPn8L8zGmwKc9GOp7GdEdKy1RRP/1BKRIfpUJMMsojQAYBIEV2yZp0rDxWmk9SEAWz7ZgCb+RKo0UV322rli7fc/luyzAqyU3psfYaOoVjVNmkqdUsA2k5Y52JiO06dGzCy4mq9JghwaPTlwENgEjR54y1u4m6p1I7Z/fjVNHKBRifBMjjvT+0xZqXOZTDm90BJkI/DFhcvIDLn/sshs3m8QNzR6ppsNl/gOHoyB3UMsI2apaOVGkoNPjwV2n6hHcJDcFojdnZM1j4JWsfGc94WNTwyJOXj4vn1Ch7KMvQp2FGSlF/S6FPx7YVCDhazLgzYqJ4kj02tT1zBu3eXuoQ+b7I5SIFwET/i2MJQKmpIwKKlPMfhQiEYf8gzBvLN6NFr7Q+yfKG8o3zFM5vaORdrVQPIcSwuIjCgG9fB+AAQMruDsnWPyWyRdFHK3Upi2I3lmG2gD6p5uP0eKLBQ5K3Bv0Tp09fJlIv2CVrTv2oziun2nvh6R6AgJPxlWjZqHQ8yhhnFEHDg1L7FyZ3Aoa+w6lrV7B34cJHdBrYh0OqabC5ex/Dyi63+zCWLuXaRc7w5JyyHgbsXLqI+d6e09A/8OJ8QFRTu6pmDBARuvfuhb0ISg2svrSyJCk5+b5diSkeFSZ6EUxrg8WFC2gWi1i2D5UiUkdPdluXOLUV33GlSiclInsATthUZkRS8nsfRCGp5EFecCUP5MeM9eJtJs8cN8QkUEvrTcUwUB1YXiNnYxvT3xvm8e66tQLuYVh2SJOGfgw9FYD+ZVfPVp3/1KxpzhuyuxLmQCyBtuhohWBMacDauyzN9NWjGBoJehhw5rlnMdvb/YiY4QdP5HaoW737rt2RzWlWucltq4UD27TK+P4k4UB2XfTulctoFnM81D7sHwg9RF+oCZ/VYBZVu/fuVsN4a5D/O3FbBQHX/3G4LiwimQOUFUrt9Mbiwnm7pPJDa+u875BQ4L03e0D3dJ8m1K+PIwaCs+ew/8BlmaFjYiXYllJ257dTRd1priRhyRmVauMjn2JinczDSpNLkYiTiLyJHa4tYFLfhW3WBRbvQ3B/z2DiDQDcunlzAvQReioA/Uuul8xb+sKiaQCQcK3NdsfKGWauVfuHlcvjAEiG84xlG8kwvq8bZpx7/jm7G9VHDjwfELk2Xt55J6hyyfnUgG13SrXIMUq/z0m/QaodGTbYu341OZHso6OHyK8IWmeUfg36xq9BP87dWSzCPs7okwrA+TG/FPlyJij4X8OMxZVLIPUQJ9J9IOSlRvsnQT23KDxSsdzKEu576AcHNvVEyhnpzYVFQIBarRzJlF6ekBS0gCSBY4YGj9xU8TtJ1BfLerX7/mSPTrUOcUW9fXt7+UGYB9IlxKJXMa3HSz8R8JQAuvdwb5R6UTWNn6ZG6hgH5L0978jB49Mr50mnq2jkhQmvHFFhzJbKRPoelhGiaXD2uWcBc8JDFj5m5Jkoa43VO+/GM7plmEq1apY+S5XA25pFzAX7cAYGTITTfsnax5pkAccrqtwa9O7+vj3SkmNfKoTJAPhW+97OwLNo7m0Kk0kooZFaTY0B7Fy8aM2o4xV9BErBs1BNM8tYgD2OLZJssjdCnCctS9DYdh/ELnFScKwnmPyIpPNvXeEz4rlv/+QbZE0gHUur5a89T+Ll70RvUnbbVxYCol2yZqIDYkUUyAVyCfRWwFRsNXRrcr85UpSJnhpAf9UAACt6EXL+3BGLrpUCcoay1TEwpq3nz+qafxFWKlNhrNpOboxBs7uDszeegdHDSIYffyJF0N0G63fvQikVPNxFiOp3qPKU4jv5517VFCpnxa7KcArFbIa9q1c/QCetD4pOooUhvXabm+jlCkNyDrrgzNVkHRhwymSP4eUjiUWwBxCcOq1QqrBz+ZJdqviBtvUx0ljYcceWMRaf6uNxJFXfrWrvlGpglivoo6UTpGRjcj1SNc/KJrq5vDJawu1ZcChL2faFrJJ3sbHvxc4qpLXtQ6Hubh/3ogInIBYChh2oKwD42p07H6cB+rGipwHQ6RXAvAS0LanPGkWI8+fRzGh/MwBH5bYG0JS9L8IcD/q+wwfNseCRBKM15mfP4NTlyzDDx9lxawux3cO9P1pifX8fpJq4Bh05I3JMx0v8OUBLLuxXB9SxJdEYZOpeUFJ7O27J2vfjlLVtVNqJ4t8WDb1p0B8cYjg8iqZtrnWsLNms80nZ8njKB0KJB+yOqF2cP/d98AHx/QlpNxoxeozJPpKSd16QOjqCXq3GE5GmgBOlzCXIEoK1g0fijeYgK54FqjVJkt6WYpNqAO20caWcZzqLNehp2ieQa4KwBWYQTSb34+iJB/SXXR/9LbsXr6NVnzAgcPVMT6pfZ5TAQWGyj2GiduKl/0z7l7/lTZKXT2/oe+xduYKds6e/T6eBfTCkmgab+w/QHx5aDb1ijrM0rlmPbhSDipaRBUnekz1lbX76tD1lbdCPkZw0zhJJuTXom03UloJ2mqZQtJe3emSWjRMx4LwcmfZrjIHa2bGArj9qawiB/GRt4qiFqEn7S360oinVYNh/YHeJG1Plg+B0Mgrr0HOzCXn3xBOLHCGyXxqbT0Mc/425vOQ4/cf+7JSmsVsNA9DGjanMUSEtWb0O5E7FdGfKr44t3lNOTzygf8P1lHYx/8xctXvWw93vAYljmVUdYhyzKwRcaQ714fxlHfzlgIpmKcqeMaCsd/CZZ59Bu9h5bD3cAavFrO/eg153dmlLBcq3p1ChEcGquA5NG9f9G+d1PT/1Qa6L/v6SX4NeLG2UFopEhiVIJ7Y0rEW3QoAU4ycnjj03zjmTZe7NqVOYnTr9ke3IR3HU1qcJRD2SKnGBQcfkYwFoeHBgT+sj27fz7DiNgTpjSMOelD9Fy03kH0WV/Udh/75MZftXrRA5P42wqYzdLCrV0EfMZxx/xgwXtg/xpKEfQ088oH8JLxEALJrZF+dNA0VUchHh4VswNcAeGuKvIbp1RfiOSW5zLiJUB/MWgZ5hneLOPnvDguDj6uHOlukt77wTGHp1Sct2PlenrdaSesIMv2Ttyke4LvrDJyJC9867Ff8ES7n5VGCuUFEh+mO6BXEEh7rWP5an0Qbzs2fCsssPVXQKgpsXLkINQymDnO3qkQwrSiy+J8qQiDDcraz99+DJxWOMt5ioRo2CRSErdDUFQm3KJWj+9aTFXUUzFyYNL5jD7eOuGuWuWWywI9sfzkmyKGVaNu+wae34k4Z+DD3xgB6oUT+oGmu+kabEdEBVBsOYw9Uxz8atahWgr/bkdFB5Z6Jzz90IGzc8jhROWbvzjjWj5ZyShBk4Y365lpMAzENRulmP1ganrl21W9CeVP3/GBO59cCbu/fsA5aAnHkRZ2TbxI+RiuApLBzBAnWCD+CdvLTWmF84j2Y+//D7cVFRYTlLLGD2mX8a+p1Qz0+ylI9c5P7ePVu3QgqgqtB+XB/e2rwh4xrZj5N+ogyqtyReWBI8UwsJxnzJmdj93u3UtGCt7WFSxh8Eu62zcNogvmruUCl3RsEE6MfQUwDo1sOdoL7IpMDJhJMA8po1qPqsDuYJ6FTNa2Xa46Afg3kmbOceFzjzzHWn2T5eIAN43mPXRy/9krVMg0yZSArmxyoiJyxDYf0gYO/a1WNiPT7kvY27u/eEhuPf+uvtdRr7Kr7zRmHK72hmhYCoBMowPp61hszPnYP6UDeVkWXNiWEXPdt5XxJB7VNRYjmWM7Apk7XnE/h239rEuYZbCBcPUZ1jx0G5+2Tt9tiiAhXeZ/sSGbtRFA/aWoTIneyoDbQzu3tTAAfGl5eFkLwKAqQY+GqaQz+OnnRAp1cA878CdqhVnzF2HjDMn3PeofxPop341+n9+1XkxvhDYCeEaOontzXpuXM4dfkSzDA8jngOwErcw2aD1Xt3rVTPWUsU2EEJmKcMBnXhibLf/D1iOxtmoG2xd/Uy8KEe5flhUL2wSimYzQbd/f1UaJIe18eonKkudbJGGXVqhLS6MHYuXwJUmsOHQ7XRZX+81uc9xfPOQ4I/JII3jZfat3t/9z6gsg2rxookQP24FklWwGVJHG+tkl4Ngr+J058KOQPiC3KlADJc28L0vW1PpWxtjJ0/N5Wd7UKtj1Fo3HciYwA9mdyPpSca0F92veji2SvPNaAbbi1sQMl8wOUMP5DcjCR7nsevDSiWYSsyxNaB6BjLMAzYvXQRO2fPfsSHh3yAxPZIz/7wCP3+AzQB0COrqRMlPCj1c0g1w0Ir9AJBAfzujHlt0OwssHf5EsxHesraB0GVFmOrLQ3LFfoHB/ZYXR9OOIAGIDsm5e0g4SnOU1eLFP4YhoCdSxe+77034jdFjGPfRMHEG8MLwBtTlNvZDJu338HqrbegZjOnlMq+PS7wSHHoxGLOQzXiiLUiVN5e5kaTUG/y/2TlZOeDrxpw39u3beOWrBnoxPExKiihJ4r8CoMNI2jozAYNWw39x69e/bAlwceWnmhA9x7uTbP47KKdzZjIhL5U0VLGeXmdrY2xxIRZUDRRbqNEOhdagBcGjNY4/cx1zHac49b3myM+Iqmmxeb+PvqjI8DtEpdYhJN6VaSf8Pk8ustvIwSsEc09yYes13V7+hR2LpwH68dpyVqdGG4N+oMDDMuV24mvEvAkwmQl7XEzedruiVbrnvidDhcXL34flqxlFCfKEZEsarFBO0QqS/ooOeA3ztJz5y/+FejDJVoxpVDTfLPCjD6pRsmtBDXVfvTDkggA8Q0qloRqISh95tbeExEwDDAMqHYGGA1mYAjOgSLBMN4z/lsrrVvWagAYNXm5H0dPNKB7D3dSeLFtGgAwUqsOw9f3Ua703ar53d/WgZoyzT1KpCNUbJoiTH2ufIYZ55674TZieVwFVIZSCsv33oPedFByfgxI2jQHXhEgaHs1ppBHKsIEfmS1eqM1FufPY3H6lNXQH3tIh12ydn8fZrNxzL6mH1LlahxzghJ7AhAOYM7pM2YGzVoszp3bIhh8dJQvw5N73rPQ0q01I5ZXKYJSKsyZc9dDnT6Fd/7yX8W9r/00Zrs74EEHk74HsPzP5SpLcLKCc+W6ItvWkotB8gBhtXvdyphPjTmhB8yg2cy2w2B3iaP53M6ngzHoIRaIc7F8vE8GskI/2RPbmhUA3KqUbyJL7fe7AB8FKWpfVErVmVEynqhgblQLt22261iGJ2x77HNJNRoJ2MZpA6wIZ5+98bFghI9KxACUwurOu2FZz6gSwbF56i2aMsLKRplhp08ZJskABD1o7F66iHaxg2G9fgw269nS92DbWCmF7u49mGGwzmeCqsy6cj9moN32Pg+cCma2rWmxwPzsGXdE7fe3rYszBDgFeSKn7zDAbGC0BhuGMRpaa+uo2jRoiHDvP/nP8c5//J+hbVrwMNj61bzcwRXszUG9JoD5d+6N0NIpC8iVGKMU5rfj+DjJtw3pG4ZaLMCbDmwMDIB2PgOvVjAMDImQHC0excY9bMerCiXwFh8FAKSZ0RAtjyva005PNKB/Ba/qVwColr7AisDOJ66qeWemQilBkrhgVGavK9aqAlwgmYXMsz58woAn6+He7Cxw9pnrj/UZ6LYBGcu371R1gWRJs8Qtyt5lZNs7+2hF8vGGyWldpKCNxu7Vyxb4DAPNx71tjxHoXN/evPNuss67LjgJC4mXM4/PYWvJkvyEYMZwZxGcPo35qT2xNvkjIg9cYQgKHxp2IMsM1vYwEWMsgGv/NwzQXYdhvYZeLmEeHILv74Pu72P4tW9h861vg3Z3LZgPQ0gvSKW58O6LUS3s2Ffg4pLk2KgwHR6xDqY86iQiWsWO4/oOLRbQDw7t06ZB0zTgfoA2BtoYp7tsP0zKloDhF7iFXO0WsjQwo3c7xd28devx1Wo+ZHpiAd3rwH8IOEOkPm0ooHik3P5TvIwDsOyLEZTjcNgyRIQj10NBBlkP9/kZv4f7x22v8RMSA6QIZhiwvPOOnToQa3U9AFi+J9DF0xauFASuWlhOfhL+6g2pp69de8iP8vElvwZ97c9B51ITzSLY38wsf1xfracol29KAcpGMMag3dtFs7PzwW8qk0zdUPil/Blz0LKN0RZ0Amj30F0PvdlAL5fQh0fQ+w9g7u/D3LsPc+8++P4D4OAQvFwCmw7c98BsBloswJuNawVpYqqVFYkCUbZDLWJdNCsEXZngCJjX043XnFxV0vUStmGotoVaLDCsV3ZKZb5jq641BjYwhqGUOzwjq2zQ0oPUUTJkUophDGnDpm0mDf04emIB/SsOkU9fuPaCatQVt2RNxY6TdvWq5j2iSdcAvsoACaVpCWODOIZPt4wkDFrjzKWL2D139rHdw53BaFSDYb3G+u596+FupEpY00rIxXRpZEpWYnakGL6SBJIWt+pTcNI6de1KLMtjTooIpu/RvXf30c52fz8qOoAcBKSAYIzBbGcHajYTpt6HSboEbRLgLcMZY8BOQzQBtAfo3mnaErQfHMDsP4C5dx/63j54fx98cAheroD1BhgGd1wxAFJ2XleRFdLnC8AY0GqNRpF9ly1xreoCW0E9/Qhe1EodQZG8J8kzsrSrZajmm7/NihQeu3daQ505AygF0/UwzKDdHaDrAQBd37uo0dQerQZUpl0rKZGXDXvVmjUAfGW0zBM9sYD+ousZM9N+bqdpFQiaCE0htko+ALhVTiRAOxtAhdRbGbheQN/CGBOFMgM1Z8iyGqTT0M9cv4rZzg765dIdWPD4kWoarO7dR/fgga2DNqhqHl5qjzfhcozxlVYSDu/TuXTRvkaD5jPsXr78ke0r/mETNQ30ZoPu/gO72UfizY3Q2coN+ipmjRDePZPoMNq3Y3j/BcKXbBt0+/vQ6zWa3V0Yo8M8ddQ0ZTn9ZQbazurAnAK20RqD1tB9L8zjK+iDQ+iDA5j7D6Dv3YfZ3wfvP3CgvQY2HTD0YZtcUgSoBsFZtZ2B4QRAwwAb8MDBDAhYvwUQjZu/ZdPmXXQrSfQfZyh+85Yc2P39WFalNp5r6WkeiagyGLSXL0HvPwCMgQZjceoU+N4+mIFu6JOUS6tl5TLRgAhoGpA9MKnrhvkGAL4C8CujLfF00xML6F/HSwS8Cpo1LzZNCwPipKO4URc6WQbsKVHWGXMpEscMzi3hPfB78dU/Q/wzxuDsjRtQbRMG1eNI1DRY37+PfrnCvGmdJ+yIgj7CvyLbyVtBOvVQaXEh357WDOK3fJ2dOoXdC+cfwzXoJTG7o2nv76M/OBCnrCHpVySMEXn/T5wLKROUfB/NqWoYIdjz1W0ixAaz+Rz333wb3/5LfxU/9Ad+H9Z374bwSkkBDvDe5cYBtpGmca2huy6C9tES+vAQev8gmsjv78PsHwCHTtPuevCgQf6oXqUAUvZoWSLAWQ3CvDcz2OhSvpBWIif82x3nnP6cKuehRWMbMmq8oq6ll2HG38J93/z7nUAYgB9PaQ5JWtLwwrDOcLMWzZnT6H/j29Yy0RDaU3vQb70NDaAftlsTUwG8rBkB7pCXAWCs1e60bO04emIB/UXYzQeUohf9fsBhYxdyBqxEpc6ux/tZOviofG/vj0H5wptFmMsEMQAm7+GOrQPkY00ObJZ33oXpemCvdQwU2G7jdRJ7Eq72cUpdI5giszxsm/ptSM9gceb047tZjyCCW4O+/wB6ubJaY7A82DYi2P6UbJoC2Y0F6IT3HFKoq25ZITJjCwFQpDBn4PTeHn7l3/n/gHZ38Nnf9XfA9L3zHjfQ2kAbDTMMGIbBatqbDYbV2p4xfmBB2+zvQ9/bh3nwAPzgEHx4BF5vgK6z9WWO491pziACZi0MYOvOBswG8M3DXIzp0Bbh2gM7hWEbgZxEbUWjOAnKC5Il4KfNWH+VMpkYZtu4eRSSuXsxJGdIrp2GAc2lizBdB3NwCE2M5txFe3xs16MH22NTQ1+jtGnCkGWAqe68RwSlFCtjyICXQ9NMO8UdQ08soH8ZtwwAUqr5vPNwDzpA6Eh+AMqRnKt1glJrWem1KYZ+Ej/pv4XskKWRjinrGbyY49wz12HCms7Hj2xVCcu37wBsHaJqC9dKs5wUsDJWxrK1M4YhLyV+BXAn6GHA4sIFzHZ3obvu8RWWPLE7a/69u9Bdh3axk7ZF4tUuBEqB3wVoR8+lwhqaNHjFrkpstTzl57tBODVbQPWEb/4r/w/c/+av4srv/O1odnYsMCyX0AdHFiD298H7B9APDsCHR8ByBV6t7Xy2NoAff07TtlKDm98GkjXk9lxuUcPMyhW2gPCAKepG+a+f7QrNWNniNVfCA785nsZE1jxMhHYZo6INnLBL1ywEzJzyKymoDQPaq1eh77wHwE4LLq5fg3lwAADY9B2Y4b69tzX6jpHyxSTX/MMoe2obER39+KuvblCJM1GkJxLQvU73h3H6MpH6pLESOqUAnkBzITwCch69RpQNrGOoCJLAfBHAzp9br/DZqVM4deUyzPAYm4WJADb2UBZ3drKkqAMKI2FNak/SLBKIz0MiKdvwp35B2d339q5cgpq10OvNY7Bk7RiyqjBWd95xUwiAbxj5L/LrAMD+nop3CNqq7/dlgwdjSBLFvlNEIGpAbKBmcyxIYf2Xfhp3/sYvYXb6FGjTgbvOOlRp44Q++52IlN37nQjcNIDbhc0Y47DCpMfEciyVf0AkRqoTAFK9V1zLsIIzpGvUZaS6bSflH2nfPglyb8PjhPfkgmyV11TS3Ar4rscwSpajDWhnB82ZU+i+/k1wo2DUDPNz59D95nfASmHTdWndK/lUWZlQ5u2xG8TEBiAcUCzOB22aeGLoiQT0r7jRs3f29CfbtjlvCKz8qMtHcYV5hX5OZZ8P4J90xhw0glIj0vUDOhqyxoSBeN669XDfu3Aeu+fPPbaOW8yWoeuux+qd9+wxpcZL7Tl56f0hx2wh6vtfDz2eHdhsDezfqWtXH1snw5wUEWAMVm/dsVU9rgkLC5MwrdcjVLTDqHV5uErie0sYe3lDQYGhmhbYbYGjJcyR3aKWmsY68qkGADuMdpq2NtFknZSock1xOk2K6n76JdXAU8HEvyrbILO81cKMFo6SnypI2iImPKhOMVAhHPgQjCh8CB+KeNgMV3hYzsUEA3PfIeTV9Zg9/xz0g0OYoyMYIrTXLoM2Pfhoib5p0A8DrC+L6xOxG9hjk70DIVHSa6QQT25FAWkGMx2UBZsopyeDk5VktxeaNV9YNA0AMqKXxNEkf0tbeEZRGkgP+qAiSGKWdCMnZ5V5r8zhzZuKzaBx+vo1zPd2YbR5bM3CqmnQL1dY3bsHapSdv/SUmNVLE3xJtW9FyfNaPP8NvEmWiXDqypXI9B5zIiIM6w6Ht19HM2vLwZ2rz5z1uuBn4v8qeWy5k0CTPiOvbQUTtbX4GzApGCIYZmg9YOh7ux7cbdDCWoO1gT9N27ufEREUkRUQ5J9SdmtWd+/zVGRPAFNKlAEe+HzZglaIONlN6TMqwZx821WbJgoUtdZMvsAWYWXb02h9GeENhfKR3dYMN/mYYPnLmF2/huG114GmQT/0mN+4geHOHYAI624Dvc3dP5meyCwrjvExYAU81UDZfeH3AeDWzZuPJwP8iOgJBfSXAABEzQ82TQMidww6pQzH9p18FFGGDRnYV7tTrulIE/LYAKwk4YXqUE6CNhpnnrmOpp09xnu4u7nd/QfoHxxC+eVUXPITS9FCUTC9Slun34ySUHWhyZpradZi97I/KOT91vD7SE4zbxZz3P+1X8fht7+L+e5uMEPH/l4BEK8FO00YYNHPckF37HtlxSkuyvISKYStVUXi1gOfoDxow+6brkhBNU0EaPg0qPwTfaAAav+OIphHkKdE0o5yvhTEY/qlBF82VNKWmcBZWEQ4/T2urVOlIBUx4jfOeVB2L29ZdAcZRi59HHq0Fy4AROjfvgNWCtjdxfzcWQxv3wE3LdbdZpRlljK7DJi1rP3eDK2hFN0BgCt37jzOI/VDpycU0F81ANAo9SXn5TruwMzJTyaZ2gEe+neRhtDYT9rNXFhOlYBYHA/q4u/8szfSwj5G5Eusmgbr996DXq+3b3jiTeRSaxcCTtoGFBTNVMsphbQU2ON2ursXL34s9hU/lmSHcORByvQ9AEK3XOI3/sxX0YCgoOzmKo5Dp9Beay/R8QrFO9NOj2sqKU1VNH0PnooIjde0lYp/RCB/AAoRVIiDoJlHLTtq/GH5WG4NkIBM/l6Wi+JLV0Ghw2eVEnG28IQSvIGx8Zt81kqQsVEfRIUky1gvLgLHgZIKAjn6clkvH6HrMXv+E+hvvw4YxrDZYPbcs+D9A/ByhZ4NumGACuk+zOQZx/M22AK6FzQNcOfEyTzF9CQCOr0CmJtAo5T6AbdDHBWaXmLmtcS56X0b4yo0+bFw2R+QjbTxo1UNG6BtcfaZ63arzI876FTI8gd7xOLRnXftXvROShqrd7We5IUr3+7ldwoKDnlttPyeXjjTRmN2+jR2zp5xp6x9TIi9puzIA5OKf2CAjUHfddis1tAANkeH+Maf+jex+vVvY767A9N34bSv6hkhEG3k85VjIS+TiBzmYqvAHwUsLuJmQYlAAsSVAGLlNnWkoM2npu94HYHcly81kfv8KMs8hk0apZQ/KoVPgmck1WzZ/zJBtBalIuDLIKPA7oWwTMNPy+w6P8nMspRDGmKgSBoGtGfOoDl9Ct13vweaz6DB2HnuBvrvvQZqWqzWK7sBT00Qys1lZSETvw+a270BjDZgognQT0BPnFPcyxbQ+eLuxevUqOftAegkpsDGAVve5opKck+lh3vq7mafj3ppFxJ0Oui9hmr0gNmpPZy+dvWx3cNdttvR23fC03I8R2l+ay1JpJnzShJt6tdSp9vEBaHAaIPdM6cx29tz+4p/RG0bbZqIWp6AI29NcHuOazMkm6oMWmNwW5cOyxWwXoPffgfv/NdfQ/fW29g5dw7Dcm2XauVz5EkZ5K3w4K7w31LA4upGfrFOnCp5HL+ZrH503PL3aS6JiVyWLZV3ZM4FkRuHZT2yiALTyjptyyF9Lzc3yhmI1T69Y5/M//1b3oS/ZzpFLXMqpk98226xAbguRACw6TD7/OcwvPU2eNNBNwrN1StoSGHz7nvArMWq67aOJdkPilBBBrLAruYLcD+QNgaqobcB4MevXn38zJQfIT1xgP4N109mi8Wn5027ByIDgko4AkXPyjgA6rvGSbJhS+YWaFvkgkppggX4MOzRg7tXLmHP7WT2+ME5LDMgBdYGR2/fseb2zMM9KgNOJPKnOG1PNoahQsFEAEvmwlrNRDBGY3HhPNrFAnqz+eCsH9khJ+lyKadRIoK2MQxmHUB7cCd7DX2PYdOhX68wHC3RHxxiuL+P4d59mHtuY5X9B3Yf8sMjqMUC7alTGFZrKGle5bRcdcp3QqxUK3mf9lNZz/A2GwvE6Tghqd5nWmNSjppQfBItWpR7jKiqPYuiZMosFS9ku+Rgya5aLjyJNmMe6W+jkgT82JA55DErhYohXRFk3pSH52p0+2wY0O7tob14Hsuv/begxQL98ginP/NpDN+9DQKw6jv0eoDy/LXaqTKhKnsvu4Va7ICHQW2MQd/OXgeAW9Nh6FvpiQP0L7ku0rbqi/OmARMZIr/zBIKUmgjPjEx4tTdjTCzEq6RTEcyT2LXBH9Uzx4MZYQ/3vUuXsDh16jHe+IRBjTuU5b270SHOaXJjzrT++sTi0ZgQRumN16C0YSzOnIFqGueR+5BtK4Bb7jWeM0s2bs9xZnscpwdutxPa0G3QL9cYlg60HzxAf28f+r778zuhrdZ2nbZbvgUiO8fYKGB3x5o5VxvLTAuc2sL8ZZXcv9uho5JKzpRr44d8k0l09Ko7JY/qScsFaDU9T1wnQ1WWXrzItXWKaQdLW5H0WMvlzykpZTbJHa3fY+GrJPfLKL9I9RvV5JQc6JG1ez4AvVS43mD+wz+I4fU3YZZLcNtCXTiP+enTWP7s3wTNZ1g+uJ/U56GUm4R3WkdGtTNnenBIPfO6Jf0GAHwd09Gp2+iJA3Tr4f4qGrQ/SP7kI2lO9Mx7hIFvFyq3ddAxtYGCcF6RGbYkZ7XIszeuo5nNHuuNT5RS2OzvY3N/H6pp7bGp28x8lbv4CTznFTbS0SFeE63sNRGhX2/CPHPRsuxZrIOSgNmlYMjMYL/fuDEw2mDQg9C0N+jX66hp7z+w2vb9Bw60D2COlha0+95uX2ocaCsFatxuaO0M3Pr9xq1JHlqDBo0m9GmFdFvjkWbJ2ywINePa+thzkiEy8MtxIs2aELdWzROrGG5JvPGCQMggG39ZHRNw9X4KCbq59pbSdUCZvOYpYJXgLMpfabBgNEmEJ59WzWDNxVXBS/K6VuQYRrVVRZuINPyYYAD9gOb0KTQXzuPo538JtLOD9eEBTv+234Lh9TfBw4AejHXfi53hTkiy8QSbpkZBzResNu8RQO/eA94FpoNZjqMnENCthzsa+mLwcAcCk2GhRfnnNY0kCOcUDKTpOzn/N66shCCjeI+0+7P4MwycvfGMPUACFdB5TEi1DdZ376M7OsK8aQGdnsJUpRwFaihEiOBVMykTi7MwHGN2JpDZ7g7e/uWv4953v4vLn/oU1gcHdsMbnx4BCsI0zv4cbRPO0R7CnuMdhrUF7f7wCIMD7f7+PvT9B9D7DzAcHICPVjBy+9JwQpbdVIUJQNPYP4Zdp+2EBYJxwVO7qF3i5ZhgqDgj2ywhpVrDn9BCUQP1BDu2AFhVcWNKyx10tFrx6n1gLF+LUzZOeC0GY2pBoADqZSky4PYCRFqE44X0QiVOUq0Hq0O46NN5rCzVDCy3FS0XWcIWuesOOy9+Ef13b4PXa5i2BZ0/h8WlSzj6hZ+Gms9xtDzMphKKL1iUMckri6fmC6jZjNV6A2rw2t//cz+35CjCTTRCTxqg0yuA+buAhVLqs2x3ABsXleGe1xiNiFKe3DWO4AUzOAGfJCInIEd9hp1n+Nlnrvu9jI9P6GNG7MBTNQ2O7rwDvemAUzP7zv8TJCcfyzMpadIQg71iYWEXttA+2LO96ISnXFvP2xbdcom/9qf+dfwt//Qfw/lnnsGwXocTvrTW0EZDD9pq2V2Hfr3BsFphODxCf3CAYf8Aw/4+hnv7GNxctjlawqw3QD8AbLcmJYI9NUq5LUzbFmg5tI/dwtRtXyoahkR/8LULa6wDkMU125E87LueG8DKv+PSYpR/u6zl83f1uNv7KMlvC1R8wSrQniQ5wsu5VNBDilvHfpYZHe9LUCuGNxbUylTknrCOmmh0EvHGPkvn6U9GdYFsC0auN2gvXwTt7WHzMz8L2tnB5uAAp3/0hy3Abzbo5zOsOueHkjdGyLCu+ch+FtqDGWp3FwC46Qcw1DcB4GsvvdTg1Vcf3wMtPgJ6ogD9ZQvo/KlzV59VSt0wBO/fnqswjgFELhAZQiGnZrc1STkNFAEGo2FDR6bIfO2/1oPYsEGzu4uz1699/PdwH+OC5Jg2EY7eettpmh7o0+gueMbEKsbJqmVkBHYSqT+KZQpAy8CZ3T0c/vpv4q/8c1/B537i9+DU88+BtYZerTEsVwG09QP3e+BAe7UCb3pg0PAHzfijOOFP9pvHjYDYOb/BaH8iTVL/UMoA0soFUKEtYk1cXYThKXRt2QwOwG0z5Qyb3LsKsHuTaSpLnFgv2gb2hXIushvHJAphYypZ+JG424SSShZF3Go8LxwdF75WrywAF6/KHOseDeMwnzjfASOOaUUkJB/YTUkQM6A1Fp//Aay//k2AGUPXgS5ewOLCBRz+jV+AWixwsDyENiY6w8l/a8MVGJXAiAgwjPbMGWDTgfUANOoXj6vBRJaeKED3Hu6Kmx9YtLM5vENc4Hb1oeH0hTSx7LYKxv6eKHrxCs56nHkSQLr7GyGI9fZoz7PYu3AB+iNcJ32i8Z/TWARngmNjcPDmW3Y+mDkIPDVNZzzhdMbxYbm0ZIsN4JbGGJw9dRr9/QN899/5D7F77QoUkTWL9z24H+wcteNMpAggBTTuHO1567DPadvGgMNyMcFM3a+/94KJFDfco8ABpbaSe5DHt6nGk2vAsR/azI8DADiLQdLII0uqTtpPaiAuX9imrY0sL1RUzTjJs+PkjTFgH+2229IS4zXvi3Vh9BHH1CjFlHzNyzxTB8J86fmJv91yhcULn4BZLtG/9gbU3i66Bw9w7n/8O9B969tAP6CfAUebTThRLy+jz5BGkT2NYfcQYLQXzkMfHCo2DN02XweAd6Yla8fSEwXoX8JLBLyKtm2/OHMe7qDK0UpSnRmRopNDWIKyVxEIfHgnuZ9o4ErHLpduMvwJ0IPGmUuXsDhzGjy4s7o/WM5QLxoeMpttgV09h9Uah2+9jdadkhVYMCFZqldNMrw+rkTHsfUYCuTnnRU0G9B8DgJheOc9u7lJ01jho22AtrGpMsJ8tj9zu1aq2M0iGAZt2vW9ChyPg4131AocWog15LuziO1xsOhjdWsSII5F9U0ozKTbPm8irwjMrcFuQZSOrzx0OT8sC5gCfP1L1PL0gWU811a51k1UOkuKNq2wg3LspJ/lpKXMynpcsDzF1CYT6nZsxkKIYraOcDs7mD13A0d/7a+D5jN0yyVmn7iB2c4ODr/1m1CLHRwePYBhkwG6KA2LvjFS/kRcZaBpZ2jPnmXzxltqBT7gzvwSAHz91uThfhw9UYDuSTXqRdXYQx8ChZGWajXJxZaRWPc+RTKCa/PcpSmuln+SFUAErQecvnYFs50F+qMlQOojs7on2RyH7qPc3rHZpsHhnXdw9ObbWCwW4EEjZ6iJJljjfBIsBKPLP2dQ6PIibkEbBbJLy8D2SFUi67NgTBKOMsGjmMvOihu3Dk21j+AIl7KxCCjC7Ud2RwnwSZojHyDRzETfTz9nhOTyFEEhYrJo64pVhWpm+q1UQbqi/DKkHDMkB0oIXbRCAt7k5ZMsHdcPg5AkAlTLJR5WGsSmknfgkzVKFfBFsxbv3APZbdwWiWXzElW/eRrIjz+2f5sOi9/2w9j8yrdgjpagxQIDMy7+4ItY/+LXQUTohj7MnSdiVgXEczGsFCz9N2LrUb9YGDo8aqCar/+tv/yzb7kkDSbaSk/U1q9fwasaABpFX4BSSORSgnBMjRySi39F1/c8OQkbkwDVn+XcPSydKxDZBpZpsCunNgZnrl+P67Y/IjAvaBSwK4+8FssMUgp604FmM/zmX34V5mhpNfTswJBqYnm7ZmWh4ntYBhUcwEg8JkrD5aZBEnt+O+1EgiU50CdC2J60cSd6NcodHkLpr9x3PNmy1D8TMJUAdYiHqM1TGjoVFlJpgpNEyfU7xMREaye6tytb2uYiD4qKe9KPxRgYhast/fahzkDwaXFWz/wbV5Hd19c/ophIUhfK4lPMyyYSwqZ9LxYu7d1lq5xYxczNHDVeI4OzD8Pxg4xu0MT1b+alg6MV5s8/B7NeYfPt70Dt7GBzeIDdL30eeHCA7q23gdkMB6sjGLm8rZKTFGzls+pnVwQyBrMrV2CWS242G3BD/z3gHOImOpaeJEAnAvgPAKeg1KfDHu5hkKbML2pBkWmNcxdKL4WzldTKWXIVyZUxPpC5cu0Z57kb17cMyg+OHsaOFUAbHMDbk/IHagDYHB1B7e7guz/z/8Pt/+ov48y589BdD+OWYo0qQ6MVTQFJyGT1sFQykhA/+5zx+E0Sv/YULgV37KYDZUUSTikAdP0XxV/IN7PURKBGBPe878rA/rG8rrZYvQ22afbVlPL2JFmrzKQgglWBQ4zBrRvYVeJ4ISAZa17oGGsLL+DkZfRFrwh5UliIHyj9mrFuaaJ2j3wWYdNCbR3RRPGAkvJVbMsK4NvLvOxjglrWP3ygzQbN6dNoL1/E6he+bneEW6+BC+ex99xzWP7NX4Ja7GC1WWPd221eU408LXsQMDLK2yCMJwDzq1eg336HBmYwzNcATFu+npCeGEB/2fWOvdOXPtE0zTVjB0a0I1JkYnFgUzrmIPqeC89xpIj3UbvJNYOxXrcVkMVAZQDGMNRshjNXr7qjPT9MOK9T2LyEU67rQdv/EazT2zAM2Gw2ODo6wsHRITpj8N2f/mv45X/j/4W9nR27S9owRM9vryWIdsvbLmWYJQdLtxeVi9Mq9UnuItMOWrgHc8dWAnAHEPfsJtO4EbtSSDPgsgdl8YcKcCccuQLDNVyg/KUE3dg3x7Tnca0694k/jo9K4JJlyaoU2oeKJJOyhPpRMi4qxTy2Jkkjjo3PY8ZtzGEEZEPcvIdl7Rg7iQtdF5zCChApSAgBYrwfjCrJI+R4m1xyMlgH0MWnX8Dql74J0/VgWNP62d/6W7D55W/CdB0MgIP1EtUGTgoTn9NYuCyFZncXzZkzbN59rzki7G94+G8BALduTeb2E9ATM4fuPdx32sVnF03bMMEochPPXlL1oJ4NgkJbcYNoVLPIYjIgnHEra1n9uEENmz3X4zCQjdZo93axd/GC3cP9QwD0iNEMD4ZyUwilSBSLg0OYdjuiDdqtz+579OsNutUS/eERuvv7GO7v4+hb38Z7P//L2D1zGkwU1njn2rlsh5o+EdsztHTyrha29gYQGpywzjCxnR9PAEKUx78KTDZ1SitL4tqt1qX8VRJPfP/8WVYbyt3mK7pXcsPpZbVNjn1O2fN8xFAlTj1e8n3zKspnVAlXkN9sKW2Han1yZTlLJ5aw0lbHeHXJr1bLMnkVsoqgHto4VEPkl0y1xdIFPpaVgkbapChPrRLGAKsN5p/9FDbfvY3+vbtQu7tYHzzA3g99CfTgCJvX3kC7t4v95SF6raMj3An4U6oCydUqTuhVBGiN2ZUrIK3N7OCw2TTNz/6uX/z5Oy/btxOgn4CeGED3Hu5o1JdmrfNwTywQJfPfig3ieT4YpAPROOPLGawbjCHZckB6nxatBywuXMLuubOPdrSnyzx39rGYZPP1gO0rwYDbvpRhOIK2Hgb0bvvSbrVCd3iE7uAQ/f4DbO7fR3/vPvr7+3ad9nIJs9rAdB1AhPnpU/bEsH5jS5Fp+2nbiKHOsZXSKp1csAn4Kx+E/GIbkd/fnerfsQRvStPwT4jqdUvKX0kn6SlZXkLQIH8vAtRWKPuiRJA4/jzqomzbIlQ07FAkrvR7nxzXBGoPXq5/bsXOEqRKpIz5UfzAI3E4i1E+tcHHBJZjiii6w/hacCH8J8VxDZF2mBDHc5LYXxNRqVaLevn9eGQGlivMblyDfnCAze3XoXYW2CwP0V6/it3Ll3H0138WameB9WaDZbce9WoXxTzmRT7OFIgHLJ67geGtt3lmDLid/QUA+PGXXlKvvPrqBOgnoCcG0F+EnWNRTfMiNQ3iWdgZk3SDRCpl+R4Hox7tMqGMMXMe65iRX+pWER2MYbQ7C7Sz+fHnoLPPPablQyulwjM/cNkYGLkbmjsopPene61W6JZH6B4coNt/gO7+A3T39y1oHxxiODpy67QHsBM2SCl7ippyW+vuLAAApu9TkMwBz2n/lDHNAFhUBC/4cwLctXc+PRmR099a+9ZaPGAP5ffiQbF0kdKwIvFUgKjkWJFBR0lWjxG1edE2WwEpgEem7crnlSakbXGT9CnIPPG5rDt72bIqqJAMJ96Mj9Us7eRZ7XpM135I8knVLA+1e1k00ZfKdqiPkZSE4H4C6cwLErxcY+asgevf+DbUfI6h62AWc5z//Oew/IVfDta1B+tlKXgFYS0rygkaUoqmze4eZhcu8OZXf6NZE3rN6z8PAD8+gfmJ6YkB9JuwcyxKqR9gUnBeTPbl6IDyQJOGqQPESFrwcLoNzLcw7TwtZqhZi6O797A8eIBzV66gX69BqkFwtREA4hluGJywWrbfd9weyWn3HB+6Hv1mY0H7aInu4ACb+/voHXD3+w60D5cw67XdWMXI073sISGkCOzWaANwW5fC7k/uGH9DBLvSgFCb3SagYjpEnf+I5i2s42M8OrRHBkrHUc7/8z4Q1Kl8miJPp9K3xrpIhr21QpV7+R/HsLNMSTJ7FHWMWm1eOJGOnxYay6vE/eS1l+fGef24IJ2C+vZUyrelsCFTCp2xmsrJqCZsjrCX8bLWBNgTl8AnIDoTZ89CqoD3j6H1Gu3pPYAIq9/4tj19UGt0Q4/zP/Lb0P3GtzE8OECzs8CD5SEGY6cAT1ynvHwV3khEdke669eAvjftgwdNN2t+9m/7pZ//VSc7TIB+QnpSAJ0I4JvAaUX0SWNHhyocnWvMNwd3EgOe0ueVSMl93onHOr3k9ZEBOhc8Btq2weH+Pn7uq38Of/sf+8cxY4YZBoBU0LS9lp2fo913Hfr1Gt1qjf7wEJsHB+gePMDm3j76Bw/Q7x9gODiAPlrCbDpw31srgEM+CdrUtgGK2R1OYndDk0tV0noRED283WistcMoq8z5T9bctc/gNZIElJL3Xo9ziY/xbvmpJY6NSoS1/pQ9qwJ1BtAZ4y/Bq4wPOOGGt9RpJJ695FKTLHovttzLKJUvPPYdxwZFmFdGKVALgSABadluHK6SEqegPlb+NDM7BSMWV3F8PwpkFIOFdfkhgy2CwRbQP/aTVj8XjfMwAGEjBwaw3kDN54BSWH7neyAQDDPWmxXOfuHz4PfuYfPm22h3Fjhar7DsOjtVNyKBJLJrNg7k4stYTLcIiexGT4sXnkd/+3WeA2DD/wkw7d/+sPREAPrLsHu4Xzj9zHPUNFdZLC+yPUcie8KpAyWMJKcElMaHWS1+ebBLvLCKAScOdQpAw4y9U6fxq3/hL6JbLfGjv/+nMNvbs+dnD4M9KGS1tpq2B+39B+j2H6Dff2D3ID84gl6tAmj79d/eAYVUY0F7NgPgwNoJCmHPcYEwfvz6lrRzoS7NoBREX3BpIEnqXuNt+fzzFk5WaFfJcwmJaTvXExepEcewJwLHEwdzgTNUcow1fnrbBnEj06oomJa9WKc1Bmhlo8cjVlPgKYVS3y5e2knTSvPwY8pr+m63tYSLC+tGpYbHNeqokZ0A5spYq2nNwlIQq5R19C3pJMfTZv4eJQ/gGCfNNXlPlWdjfT1NWYzFQsCWfUk4JRoG1muopoUBY3P7dftGETbrFc58+pNoBo3Vd76HZjHHuu9wuFkhHL6SlCHWrAbvec+UT4N1kRmz8+fRnj3Dq//hb7YbpdZdP/zHAPC1ydz+UPREALr3cG9n6tM7bdtAkQFBRccSREmY6mN2VEY+jmvnQoGMVwWpnOF6idoODCU6udrbw+2v/TUc/Ma3ceUHXwQRYVgu0T84xLA8gj5awaw3MP4Mbb9m3Zm7yR4f60DbatnGnQAWQZuzIpLku0GKzthHeu1kpmJgiyYN2kvWfPZ5nbnXGdq2D0IZG8nSKbiLDFeBCceBavETJewYCn1OTj6S1DhlJx0RbDg3cwoYDdEowdQ0LGdXZSax7bh4n1o5ktpVCgsnb3BmoUl0uPR5Gb0qEFqnSVQpwy+bju/LeXFlqf23EEsGiyyywiSCmHhQF/wZsQUrlUoEO6Aw/3teIgtW8BMxaEUdpJWBwSBtwJsNGtVADz027911fALYrFfYu/EMWigsv/1dNLMZ+mHAg/WqEJXzibQxdmq/Y8oxKJTLmdsHjZ1PvQB+755erNfNwXz2F3/Xr/3it/nllxW98soE6A9BTwSgew/3plFfaJM93HMaYfRATbSuaCspAyjxfoTpUj0dOSYlo/KHh4CBM2fOQL9zF2/95Veh/B7jHrD9OmZFYOUOCvGbvhge3XM85C0sF/n7UKYsRJTSOWk3/y8BUY6qMN6UcY2980zIz1F7VI0NmXy7utJT3iN7npVhVC8ueLDQMIt6iAe57biCUAlwhc5VKUjegfJnJF87BzTIqRFKk845tCiPgAHxptYyeSHEs+w7hQyrbU5ZSClEpJR1A1FuIcxmAkKYlagUlYEwNZTkgXozF3FRCVSXCMpwNW23wizYVTr0t9GSxTxC0vJCa/C6gyJCv1ph8+ABSCkwMzbdBqeuXsViNsfy9mtQbYvBaOyvlzDCMTctQ6mB52WxQX0DUxGSADSLBRY3bmD9P/wNmjctGQz/DgDgG98Ya/qJRuiJAHRPitTnVdPABMgihy6xo4+BN5B3URTjJVlyQ+mbsTjpCx69tcVyjMzxI0WANmwPC5nNLJBEPA3HkUKnyebXEWxdDWVxxRirrS4Oc3CS6ZFPT4Qu+dDWKYy8ACUDsu/YO+QV3yK2w1bwS+4rpt6i0NnDmne8CxOtPRIdOdH2Yr6VrvEwGJkVcVTYFGAYnhcVFh+T0theeApVdcG3TdUneYxoz9sqVYy7ahypG9ZSSFMr3o9+dAC0/RCaMRoF+lzYFwejJx7ioRNT/aNmmdS1//HChCSZgWEANj3IGGxWK3TLpXWAY4Ou73Hm6hXM2hmWr78JahSM82j3x6KmFUQxuEnkKL+Q/7Yk7nwMUgqkNXY+82nwamXo3ffU4Xz2neWi/a8ATJvJPAI9ITvF2XkW1dBnWCmwnPLzQeTSopwShBN/aSDHrsvntcskrVwKoDjo4yMBj5ncYDVuA6M1zKDt7nFsN5j0SSj3Z68pvSZryie3ran/z++KZp1SKDqzkQUkkhq8AEXZPMnuujF0qEvRZhS1QGSgZ0EyY+JbhC8AdefkKlHB9itBKjqhfcae6VbLI2tPwQv4/dC2+Dk/jYBYtmfamT1b3SYBUXklovuzBtLkk46cZp8/G8mWK8/S5zHBetjsXeV9HC1pT+Ci7dLItTL456PfyQO1/5FtmAit2bux9LYQ5+PIKTFW4LUmdqw24L7H0YMHWC+XoKZBrwd0w4DTly+jYcLq7TuAimA+iDPOjy2DyD+tXn28BGe4psXupz+F9a99ixdNS8z0b/39P/dzy7/60kvtIzbHU01PgoZOrwDmR4EZET3vDkIhvw92qtFkmhJlHY62LMfIBQR3d5xZbiSiY/pxcwgpfYeNTtgCcZT4vdktGsNzQSDVtgW81oqRaeYUEilKL/IEykWnNmPJ6rZZOtL6VgPUy3Cid8L8OsJMou6ap1DjH3Ww20ZjXGisb0XDgGdhXAkfgSh6Lsc6VC0iLNKXc73wGrww42aWkRiiRqKjJXVwz9MBlj3D8U2adJ28cDI/Wd4YsZwO2yJJCEeveFpaKYEwiSkWj8rCkTH4mQiGEx0CZXtl7ZPBn00lnc4KfWLU5GVBPbSVT3LQwHoD9D26rsNmtQIbA6UU1t0GaBTOXroEDBqrg/tWYzcGh93aauZqzLJUKUceMGti+8jxGacsUD9g51MvgLRm88Zb6mA2uzes+38bAE3OcI9Gjz2g+370w7uXrqBpbrAiUHIAdS20J9Fhk7lg//r49ZZlpMyEOBK5pkmEnaV8Go4ZlOzFPaX6swCoucCSZ7kNcxFBIG+TCCxU4bW55FK7sS10UmGoZHnbwxcNkycymlLlm0lwkAUWYJlEqeOPCESZiubTkeCafZjk/FLB330AwfcrclZpCBHaY+z/WZ0zgaEEcOnpLX/qPS4B/NGPQ5XQ497wVSEmr0tlbCZtIiV+FyFJN9UIRLoUfhPBIXRBTvC9JiQk3zpp/2JghwA5vwrJyDvW4K4HrTuYboP1ZoOu20C58i27NebzBc6cPYthtUa/XqFpWgzG4Khbg9m5IHEt/7Fd7Y+jyI8IlneotsHuZz+L9a/8ut5r2naf+N//Xb/5i3f45s2Gbt16hC0yJ3rsAf3L1tKsZ7P2ublqThkibqJrNlJ7sOuUOdCJwVEbMJIC09raq+Weylm6Wbg68yHHsD3CZ57lkfMneaRm8fphJXkZSrwtGXLBlGR5AuOrMKb6g+TZKPOv4Ul4J0BxTFtA1uaj3ysD2KKBBGfPGXoST4ZzUMTpN0nKJMF9zEGAjgFJqj3PJAqq9L0MiKtJ2AzSb1+Afj3LWjo+SiLoch4whgp1l2WoHXZfCB5p4eoaZuWaRsIL3jEmgNafU5kmlXF88ZPtYYNjX61vs/3uGci6V3aufLUGNht0XYfVZg2jrVbe6wGD0Ti9ewo7OztYHxzCaA2lGnTDgFW/AYOhSBXljV+vPnaLDZa48sxHUgQMGruf+RTQ96xff0MdzmfLdT/8qwzQV27dGuuZEx1Dj/0c+k3327btJ2ZtCwJMIQULZmrv6mDuibdJv1laKcX3JAUJn24sUDLYi/xFen6OOz1X289bx7RSNwBKfmXpXOFiHDff5ucHSzwTmuMYZmfvRx6UjzzTpsqfBJAaV5bzhKhbPIrnWWGSk/SSshUP4OfRi29YrbdrScq+uU8rmXOutma9ncbeh2djJ86JuuZpEFCfQ0Zavxq2yF8RLjnnXHw7ytPK0q+1VTpORGCXWPrc/2wptHsevkFRqLzyEOPDj+t0zBRRqIyeMpJsXObj0N/XEharW5JktAGv1sCDAwyHRzhYLvFgvYJme5jLsttAs8G502cxa1scHRxg0ANAhFXf4bBbw2QKQlrekX4aKrDtWVyq5n132tkMe5/5DNbf/DW917aqM/yn/95f/6XfvHXzpnpl2hnukemx19C/7g9lUeoTjV13HXey8CZhN0DIPcsl5lxrkl0xAfPRPp3uDe9NbWlq0QyeMp8yLx+kxDFKoqdFGh9w5ZxrXstKbG/NyMPXTQ1pSiPMn0SQMmNKQlVNwcWDmHYSxn8MlrnmQJdVJJlLHatiYXctg0gAYvG9TqBz5ErvVqLyG3rTBgOp4314TUisOuJ90J7Ds0SfHsnfX+aVq2jVVBsTPp+Y5ra8atpzNUrSVbcBUZ5v1vfyQiVTcNGSsB3shK1O7q9ftWiRz6ZS1zSP8N5Y8zqWK5jNBqu+x3roAGYoInTDAD302JvvYG93F33fo+87e84DA0fdBoMeoFRUHtLyZN/22I5ZrVK8VQoYBux+6YvQ+/vMd95RhzuL+4dHy//bpJ2/f3rsNXRPRPRC2EhFOMRlocKV1AYiEKcglkQbZTYVriLHKsVwYx7ZXORJ2b9Ovg3liPKuLFytmJQUYpyilkUp8whrwWPRRkdcrS3SANWyRO0xZ1qyfjHueP7uH9Hmvs0ST+BEQ0asryxeLeusHfxv1LDyiEjKErUvVK6ztsuaJGhlAkTGtHaJF2V9KCleLS95E7zaK+3j+22qWdemo8pvWH9X6wvk6pp/+/h8GwIc965qz8jHQF7eXDOXeRWvYnuz7CPJ90z7Ruj3/rnjaz6MXULI4PUG5sEB9L37WC6PcK9b42jowETQzDharwCjcf7UGewsFliuV+j6DkQKvdY43KzR60GsfNnWelxpz7IdSPxrr0IHBpECMWN+7hx2blzH8pe+ofd2FqrTw7/yE9/7lTcxaefvmx57Df0beJUBQCl6Dm7JWjpXFwen9VR1XS6fN896c66116i2CWWqiRKOO08ZROHMcULG0LZHS1X6XKQXFYivqHydJDiW0fGUz5dtV+S3pZlrzvXE4jfm8J6LWuZWjyzdRymebHiSZakUkmpaIok4FW9/yjTovDwerZO8U5LKea37FmuhQ1ldiWr13yIA+PJa3z12hpFK4bl8lL6rShZJxoXM4eJtO3fNQ1G0kMnoofNUss4Dc/ymvn6hMWMuQJ2fpMlSeBN9ISj5cEk+PgXN4E0HXq5g1mt0RmPF2p5PDts1Vt0GGAacXexgsdhBpwf0m85qb0RY9k4rh13Smn+ryL9G2iKpVf6cigSC6qEIShuc+sLnsfn2d0273jT7s/ZbD+4Nf5LxssKtaVe490uPPaB/KQxpdSXMA0t+mN6E6wJ4JW0B8TRMmk6ccrIZeMZW4qwYuPAa0ElPMKJ0/AlGVJq1yWPESB1kAg9B5Pbo9hltbSrBuNxvAVh5wQUi1YStAl1CBetMPeeJksYxpiIdJfLDiACT5HVM+/qmS8zj9X7Aedha3kX563nXpmBilHq84/qmSDj26zxO+vp4vDg+x6TfPKwQmVgWCrnD9qu0jJSECZYZmQB7EN5SmmSQCge3XJ4hJyCwsScZrjfg5Qp6s8GGDVbE6OGAHBbIuetxummxd+ostCIc9tH83g8DuqEDG0bjLZmhFLXiVnpVyWQS8q/zb0tKgQaNnec/AWLG+tvf5d3Fjtp03R/78jvfOPwqvtF8edLO3zc99oD+iu8Eii44STf8nw6QzFMcNQBEpilEisCyhclI8B4NJrxlT8Cv0piVCGODsBSUt6RF5SVnr3NkzYSBuqYolzaRiFcWufotKkJTvWFToaFajvydZ2YcY0pBI3yjot6yLkkmqR+FBGj5nJMormv69CQSCukhD1+htJjSWZDsTmHVsLKi8pfK718pP0TQlInHkiZ6K8l0hZA0lnalxvE7jYhiBBTLAv24rEnfW8dgfVyMyh4MxA2nVfKOisDieWE58h2fgb632vhyhWEYsFHAugUGf3gSM1abDcx6jT1SOL17Gpi1ODIDeNAgEAwbrLoOZhjcJlMU2iQ5inm8wIFiE8oxIGKKPmhnCJwzLwOzM2ew++wNHP3iLw9nZov2ru7+7N/7m7/8X3wVN5svY1qm9kHQ4w7oBIBvAruk6Hw6F1kgetJJWfyWHTTLofoif72NM/jRvh2W0vIgYYBS6C95kX2ZF7Wo2/YapHX1HJDlfV7WbavcM853rPAybjY9QdRQzuBQlEhNHKqRz4BEbK7nW+yhA2SfOtZ1jNFTtY1HzJVJP8kT5TxzZG+zJo/MOq94MApUMLWonngnu0b+bnws1ICRyrZ11Y8HqpSNGs37os9TEr2Y/gnlk+zAt0le5vw0vFxIpxgkzdSmURNMwxisdKTYTcW3GQaw08bNpkMPxrpV2Oy00Mwgo2GMQbdcgVdL7EHh9N5p0GKOFRtoPUCx7fP9Zg3d9yD4ExCl5w0lv8eNNBLtJLtxaeBM+6/diVLh1Kc/ifW3v2vUat0czto7/br/owzQVzA5wn1Q9LgDuqc5Ee1YxzPhXSQxHRVTqWC2Ve1HcgsZZgvIF2ArLwRT3a5tZWb1anaCkxBAfr1uvRLJbWGCLwQAGXi8rHKAi8IX7ZZT7i0Q06tos7LZpGk6ac4IquU1QuDaUsJtFJuJIL9sKXg45u+fZhWoNknt/G//nET0hE7AcEVxj7UqUam9h/ptyarez0bSB+x+/HlJnVQQxqQNGPti8qnSMWiTLsWXEDfrCqPNVlic5C/Kvky+j8pRngnq8ttJkB+Z+vNhjba7upnVGrxeY2CDTauw2ZuhJ4CNAbTG0G3QHR6BVmucogan9s6AdnawIUZvNIjtttCbzQbDZmNPbVT51s4U2jz3KyiaaOT5mDga/iU4f74GyhjsvfAczMEhurfeNruLRXuv6/63v/f2r77xVdxsXpm08w+MHmtA952qxekZQLNSm6oDbhxTcmDVzHtjHfp4bia145oUnoeRSR+fesZ8EDXNE5VvC7cbH6gl1cKWWpeQCDh9XmjLeXoUwyYavy9/ws8jQIZ3Mj9F6V40ieQlQDrX2qQqK8PLsosoqdl9G6eMhahptxYEaueTOyaco33tSLFK+8hUItCkuZTOej47jm0CcV8LI3Ma/chZ+5xwDqoYM0Gg8snIjyA/ehI8e1xrN0qTCRq1bGv357Mc88eh+I4Beyb5MIA3G/BqDb3eQBuDrlXY7M7QzxpoBqA1TN+jOzqCOThEu+lwZjbH7rnz4N0drAnQwwAYBmuNYb2G3mxAbjMZ78GOUFIKRUmGE6j4LLJHjDVR3JRTfBX3D5ECGYOdq1fQzmc4+tZv9mcXO7N7ff+v/t7vfOM/+6t4qf1bcWvARB8YPdaA7kntmRmI7aHfftBQ7KhSUykGsAD2qgZe8JgSAJNkeDRoybidWSzntekzX7bjnNCyzLfwRuHrX02l/lCiFxUmXP8mxqmN/pEkK2mUTmcVD+cayUbOI+QYAJQPKgy5qpEWaY0VSH6/XNCoxBHvxzbZ9KBSdtOyzQuLUTVfMRYKzZ6LgUHygAFZLsq/W2xzlhaSDPhrUy2xPie0xo6dlswSaHx6lLRPeJp9xxSgs+Wb/p2rc/JJPdCL4GwMWGug6+1ys00H3ffoYdC1Dbq9OfpZA0MEGAPTdXZb1oMD0NESOwY4vbuH2dWL0LsLLGFgBm3XoQ8D+uUSZr12QE5QSrmiyLny6IAngb3gfyewspV8SHIVlz8Di3PnMD99Boe/+R291zSz+0P3M8td/uNfxc3mxyfN/AOnJwLQ2yWYLpGR5rLElEThIZJeuK2/jqDxqNae5HEMZea9UaUl0YZEvFp6AgTGtd4K6Gfac23OOAWFEeDLwkv4F7GKMLXyHctLEpIBo621+p183bh4DC7KcsK8k4pmptgRcMuLXDxz0ZNp3sqnkw1lv1vVZlKW+ZgqpeWgatlq37+Wcgyej7vYGLHvxzCFYOfAOFraK/kTyvYk+RLIt95ILOHwAJ0FGDWX28AsxjGY7Z/W4EFbp7aug+l6DH2PgQ06IvSzBv3pBYZGgYnsaYpdh2G1wnB4CBwusRg0zs53sHPhEujMKQxti0M24GEAhgF6tYZ2QA5j0JCyQJqAuAd14aRW/Q75bb2fUB4+uXN5kHWCm+/tYXHuHI5uv6Znhpsl8XfWg/6JL3/jV7qX8Q315RNLaxOdlJ4IQF9C6YvsvN3DQJPgjtD7qlp48T5lLFE44CSspFEHMZHZGCutPR8t59bYpQVilO0WDG8sBpdxfJQqcx13lcspadtqWhmK5XU48fP4qpSPxOlrVeGpAohj+697cAWqbVA1l1f7nRVMUpM4xGeol80KcxTr4svEyVcUz0f4aUWTlaUshYdxUah4k1WHQ355nXKLTJz3TSLniVMeR4TP+hqFvEX4Cv8IwC3zZdeoRtttV4fBgfgAM2gMWkOzQc+MDoyeGMNOg6GZ2816mMHDAL3aQC9X0MsVmtUac2Nwdr7A4vwFtGdOQy8WWJOdY+dhgFlvoJdLDEdHwKZDA1gQV409MtnVy4O6ysGc6pBcDL2MfHN4WU7GlPqJP4p5truLxflzOHrrbUN93wxKHazM5vf+xPd+/c2vAs2XgUk7/xDosQZ036mWaAYm9IAYdJBa4DjElGamSgbywQhqF5hUMauOaasleGyBRMoqVy0vRd4lseMYnM21e/uQRNwaiOWPMkYIW4ig1IUqjqdVTE2ENChNwxeP06rXUQRIkKSogP+2jNQhoVbJCNwjIdLoEgkIIv0KoAoQjvEprYKXKZK2lsIRIVkwnHRb+bzaWPFdoolzKAcltfZgvMW+kX93Sl8VgWsfkyrj2AFIkZBrw9xEHneAcxNY5MsT0D0V7ry27UFbG8BomGEAGwOtNYzWGIxBzwYDGD0BA4CBAE2AZmv7YcMwmwHcd9CbDrzeQG06tFpjoRrs7OxgfvUa6NQe9GKOjoCVMcAwWPP8cgl9eAherUFaQ3ltHBG8vfad7vzm/80mQ6jGY2pQn459Kt7ae0VRaJjt7mBx5gyWd94x6HtFSvX3dfdTv++7v/4Ldt781Wne/EOixxrQPR1if2X4yhGAK54NyXm5RGvNmXnGIaq83ts/410JuTnWBwZUGpXDxSjw+FsaR2TKokucF9dpuSJnHdMiC6o3SFaHKlwk5R5L5nghB2VFSn6SHD073qYVdpR9B2ZKp2OrBgIXqargjgFM7V0sT5FU5XsCsM59IVLW2rJ9aoviQ2JZ4ZJ1WPZZkm/eqMXH9OXIwkgJt/LN7K/srCKrHIxDWNFa2dRVBHKfp3hOhGT7X9cezGw3bTEWrFnbuW4zDDBGQ2uDwYH2wPavZ7bXYGhmaFiB1RgGswlpsNbgvgcGDRoGNNpgRoS9psF8Psfs4kWo3V3w7gKmabACYIwBdx24s5q4PlqCl2tgGNCQ08abxnqtI8oiQQsP4A6nLYtn2W/6KcbAfBz2Sba3A/P57i5mu7s4fPddQ3pQjVLrQ9395O/73q//lxOYf/j0RAD6q8DmRxgHvmNGsLJPrIWUBF+pM1YAqTOzj4+0uxc4lps0k7jp4JHOegnTLqO664hWOYCTRHV2IUbV8Iz5bVGo6vF8BZCWm6qhCyrrKFBYPvOJJObverlsErnWHd8XwkJe9Zo0MQI8sfwC5U7UfinVxLtaOxaBa9idRfLma3IibdrHKtYXH0eCYN7wSYdjqahDtkWO+SFu5bskRffOWuBQ/hg0m18nkWu0LRfvfb2I2fYPt+QLAmiN+9NaY9ADBm0wGG01ba9xswNsZhg2MMwWcNmAnVc5O+0dxuZDxqAB0BKhbRrM2hlmp3bQzhdQ8znQNjCNggGwIrJpDQN4tQKvN9CrFXhl15/TMKAhstp40wgAl5p4CtzKA3v4JnKJWv6R8g4lX1WAvPjI1gri17cv9vbQtC0O797VLZsGoOWDofsHft/tb/3XE5h/NPS4A7qfzWTD5j4BMNJg6jugYCzb57qPo7oUmzCeWozs5bF7wOdhqty+rkXVy0HHgKRkhJUd0UcBr0TzArgFaKZHmOdaYZZkInhwFfUCADhhZps2kT/hEL6CmrWP46PmklyR05jNIUpeQcBM3ia+0paU+57M9gxpGX5EdqP0n/h8BM0JEH5iYqAkQO7C5laTEDSLI4E3FiAVQhzoyEoQ+XBUpCUBO/lizCDvQS4BexgsYA8OsI3d73wwGr2xYN0bAw3jANuCtQVsB9wmmtnZGBCz/QPQgNAqhbZp0LYzNE2Lpm3RzFpQ2wBNC1bWKjCA0TFbzb3vwGs7H85dB950MOsN0HUgrUHGbtPaKAVlj4NOmsJr5nJuXIlf/z080Psw4UtlwJ53Fdn25bBPhQMP5qppsNjZBTNj/+7dYVepdmC8c6C7L//B13/jay9PYP6R0eMO6LiFmwq4pY0xr8EONq901JlbDkhVplh/7qOMaln+NtNicZLw1fLV8i9BLQ747OjMPMyYJJOUYdsGNRW1vo4TCR4IRBivXtYYaZkpac8CKPI2LMoiyp6DUNJQ9dLVHNNskoLzifarl9PuuF31MQhXW0A4B8mRhoztlqddBIj4PWK5j/nS6Kqw3OwdnoVuRckzH5MUFXGLb+0kQDLWLM7GmbEHp2EPA7QeMDjQ7rV1RuvZgbZhaGcmNwK0o4btQNs9I2PPblMAFCm0SqFplAXstkXTWLBWSoUT0JgIhgDDjMGnP/R2fbkUNIbBery7XwwaZAwUM4iUXWpGBGotLCvYcRy0cHgwJ6gAqAiAHacXpROcb9oSyLMukn/15Hn8PO67CotAO5thNl+g6zteHR3pM23bLo35+bu6+6k//Ma3f+1lvNS+MoH5R0aPPaB/HXcIADT4NhuG5E6BmWd99UQAd6LnGRgWGFFj02n08fxEGKnlZunJevhgtaVntfJW9x5P4kZGyxzvq2CdvhmpiFRwRwBH5lEBSqutRwEhRguFzCshQL3MJ32Uzc2KdkrONhd5UB7Xvat1lWIPeC8ojMxdROGsBPaYZuW2APO0PWKZ/ZXvVaVZvtxdj9Lv58FE1CnZHzwgjwQS+XHYar+GAwB6T3GjB6thDz2GwQJ2PwzoTXRE00Zo2DWzuANsGLuDmrI1gKKoYTezOZqmQdO2UI0Fa38UsyErWBgGOrYavBl6u8zMcNDew5y59ub9AaxN0Lp93soDItm58AjUUebxu7op/1UomwtHqpl7Fzj7LKYTnot+kLGmtJfkY5/SeOTK7v9m8zmUanB4dGT6vqMzTdMeGP3n3joy/8gfvfvtBy8DE5h/xPTYA7onbYbf1EaDADS+9wlGI5l6VQPP59+2AXt+WaBiFk6+qgykNN/0VcrPc8bOqbdzmUoWPk2mBJ3aXGiMUz4WIC0DbGmCetnKOOU2qv61zydWwh9Akuy7HULnqjtFsBypT3lLFlmTaYD8skDC0mpAqAo0sT4V2w8hLUcRPg0cPEhKZEZS4kwr9kmm/Z7KZxlgi4jFmAvEXsO2YGe0hu4Hq2EPgwXsfrBg7TRtC9razmMbB9Tg0iTuBAIIcziB0JBC2xCUatDOZxawm8bORYvzxRkIaXfGCgU89DF9Y2CkdcCVH9rYXzdvLvMP89kC/IJHuvtLNW8IYK7MjYdrCfwUAT6EEwCf/SY9jmRPybqH6GOBW8q0SKFpGsxmMwzG4MHBg2EGbhWhv6eHf/4Pvv6tfxEA3NK0Ccw/YnrsAd2fhz705uuboccOdpvwMsE/gb5bwNyGeAgwf5gwYayMIWpKLANl/Dh4JlPdjz4VDrZlRAmW1NKyV8mkqSxg0l4Eu045PRWLZPB6cXKGkl36BBLcl0LYaB3HMmPxK8Kd9LvmwkNNQsj7VdIcBZsFknYcyVcGYAoYGsOoNJ4A3LxfR+27Pm+dArf/K+tll3axXYetDYweYHoL1rq3gN33VsvuBGhrp2lrNtDGOp8xO5AOoM0AG9tuHjCJoBShVQ0a1aCdzaE8YCu7nMubwxlWuzbOO90YW74I1AbGHXZivdMHGB3DeLN8KjAI7Vhqz0o5dwQBxP4dkGjZucbtw/uT0GJ8oY3L+JTeF8Arv3n4ZGmPSz9l2s9k/CCUEKFtW5BSONyszbrr6IyidmX4l9fMf+QPvfEb/93LgPqKtUVN68y/D3QMpHz8yelN/A/t7T1z5drzv3bu4sXT1LaslCIiFUx+oStLnkZpB4e4q5oeM4qxuXgiAaqA3AI4x9JNill5g/Q+A4xwIImMuQUvY35pAevhYr3z9quGd8EL7VSWJWvKsRa3dIKT2WTdMy+y8Y4/ZhmohKskQpUGPr5/xYBF+bNZgKIPhxtRnmBpcWH93IrQoMN3CL/+OcXM/PcI67HZAt7gzeKD3f2st4Ad/sR8tl/uZRxoM6xGbZgdWDtPdCetKVfuVik0ymqD4dcBtrcSMJEFfiCk6c3tXhgwHDVs69Vur/WgndbtzfNuX6ooJycHmuQAGv8cgHIG1kVYP/ctnmWmdKm1J1p3NUzN7C7yFAJnsR4/fPpsPARBzj5Rrk8oit9iozUfbVZmxmgGMGs2//rbm/3/0z/z3nsH1sQ+aeXfT3rsNXQPPX9muXz7nxjMt8jwj6B+LHb6pDCxxzBF9x9DKBkpnULNLlLOzmXACHh5OYuCl2bbqGumnt5y040xr+gcTPIpayAsKMrAxv5D8MYCoYkXQCYejCJp2QBbZyhYxXs32VwAvP9EvsFEmUdLIRvJNVr5ObY2aPq8+kHLPjVmIpeMNrkX6XoNSnBqwAO8B3Hl31HSL+ynjYBtBnuOtjeH664LoN11HfqhR9dbLXtwXuNxHtu4tdgeuOOvF8AIcA5gFiBapaAahUa1aJq4dakrlf0zJpjEeegjcJvomW6MX4pmoE1ckmbE/Lnf3a0AbAdaBIBUBrrhrwLk4jc6qo0APqgwrUeQF4BdAegxc3p1jbn/7q6fSNeOOKTTPk1ZX5P9qaUGTdtgYOaDzVoPQ9/uEjUr1n99yfzH/7E3v/3fAJOJ/eNCjz2gA8DLeKl5Ba8Ow9D9DBnzw46FKCK2I1QyUBrb57vOUEepwqPHHpTz4HUwSLypJVptA2KZRwXQnJdUkDkkvhRr5JEOelkWKgKkdUsOfMmrUXMOyMoZfQGCHT+mV6u5tywHfy4lMnVlLups0x9bulhgrzdfJ4KD0H63JZAwySRABsoStMn9H9NILBrk+wjF6wTIJViLOIDVrt2abOO0a90P0F2Pvu/Qd+6v79H1nZvPFoBtoqc4V/58Kcl5azdKOc/wqGGH0798HZw5nJ0zW2esN3gUDNyvESBtTARrHc3lAbB9OSTwubYiivPYMVzs6kp8swS0XRsq3+5CG49pRDN5ajL38Wqm9nRXN5+PBescwFOw9+lVNXEJ2K5yiaAvOkZIz8cntxSNrIe/Bvh+tzHd0Dc7QGuY376v9f/1L7317X/tFqC/CjQ3AUOTif1jQU8EoH8NrwIANv3w033f/6PNYi7ZaTqCxW3JdAv0Ee+rqCoCbdf80gJsMxaLQrJg4DJYxRpQA79UkPDXWc4CbMbLJG/TRkxKLc30lMfLH+bJlhHy8lfLluSXtlXw4k8AdQTMZZiAtZX6J21Q094jwx1L2z4jEd9zcsvaWTJaEn+AW5suwvvnwqPbO27prncatgXrbuN+3Zx2N/QYtPMUN7oEbDiwFs4Pdv7aatJNo+wctgPrRimQomDil4BvjMHgtkz1HuneJM6Gbf5hO1VbHq9h+zh+Dl32OUXirG83xSb9FyU4J/ce6HIwdVqt708k4nhzNyhODQSQdt+kZiaXeabALAE7B/w0TBA2qJJ+BupJLydxjai953PvcO3XuO87KOLDodfrvmsXzI0x+vCA+f/5YDB/8o+/8923gKCVT0D+MaInAtB/HDCvAjg4Wv43h5v10fnTp04huvvaQCWyZZQBqnw+BipZOmPz4lRNI0PmEZTJtep62DGQTvM6btZZuolJkB3FVNSUb5fCGBJ7tVnGToJmoFutWg0stz33b6kImgCqD5WnmRRRaM0hDQG4/nEC6PF9MI07QS0AsluXTTKc+AXgtic14aAO3fcYuh5Dt0HXdRg2Hbpug67v0XU9+qFPzOJB8wUHgExkQ6eZkVJo2sZp1xGwlXP6sj4WDqjFhiyD067Z+HfRI107JzTtNX6vbRsdtHHreCYBN4Jo67XH7FtGsERiTi/eIwM+eDCNoIvwLE1HxknmueHLKEBW5DN2XQf9VCNPgD1PK/8VfTK0RaiNnzaKAkEK4vZdowikGvQEs9SD2Wy6dqZNOxi97GD+v6uu+5f+qXff+DUgALmZwPzjR9t49WNFL+Nl9QpeMf+7T3z2v7h27frfzbPWkFINieMEkUirjjLQqu6oJd7nSFFip8ihhlc+1gjuFaBThLEPCyGB04Ec/qX4vixL2hqeKYrGSoBsjGpvClCTFfJ5J/mlhZUaRqxzmRsVFcjLLOfBKQ2ag24mkSXmbRExN2uHuibv3D/+mUCJeJ/1Rg+yfg677y1obzp0mw36boNuY8HbAnaH3p/s5YCSGTAwzvosAZus9kx2KVfTuDnsxgN240ytFMrCwextBYHocMbBTO6B2xi7ZWoO2nL3NQbHpf6ufct54Dh5lINvjBc+awrEMk6mHctnEM8TwMzi+T5ahM2fUZaOBFoRPvdUz53mUu279iwD/0wbl3wOyfNYFwniiqzvADcNbxTMke5Jd71qjMZa6/sA/3vcbf6Nf0IAuTOvSzlwoo8RPREauqWvKQBm3fV/dug2v1vN2pRZFshZgSGqzK97/paBX3xVoGQlbglw8n1Io6biZzhjcafMMBFEakCcnb6VTtVTLCelz/MZ/QRcS0QuSyaBUmrn4TknmRKlqSRALAC0ZkVg2Q45WCZhBUgn7UbxWR4/ADGExu3ToVg/H05ZE6YvHAHO98wuhTJ9D+M17M0G/caB9WaDzWZjTeN9j34YMOgBWpuwcQq7ddPJPjpEgJv3JDWzG6Y47drPXzfkQJ0R1nDbnc0MBh4S87bVruP8tjZsDytx2rbXsLXRQSP33uo1UGpce5GK3ysHV3utKmmE3pGMgxhXCuwpQMr0E/BzfcUPi6D55yAry0ZZvfK0C426BsZyrj4KNEDp5Z4LFyrUR7zLlRWK4SHSgUivIQIahUEpc0RslkPf8rpveBjQs/k1ZvMfHKy6f/dP3HvjNmCB/OsATxr5x5/GoOhxJALAN8+evXjjyid+5eLVK5epUUykFCnJClKmX4PqiFNbgEqmkxUiAWhxW4atv6A8FJVv46OoeldhUOKVL5QD0/BeWv5lpPSnfJ4JBSTLI6KUVhGXLYs2kADqixkLJMo3krYsg7+myjuXpheMSNwHwHfgGLR7skukJGMEeXCiWA4/Z+w2ING9ncPuN50D7DW6tQPszQabvsPQe8C252cb4+ax3Udh3wYk567tBine6axtGjTkHc5cJK8ZO63ZuB3NtNuIxZvLg9ncbeCi2Z0w5kzhfm7bz6X7vf4ToCIxjwwBnARQcFRLATaGS4E6VNeFyFbVj2rZoRsFzZ2ytABiSu9Femmd7Pu4N7q7zwDXhvFpSW1+TLO2z5Tojz6cCmWWwB0BuUg3SyP0W8g+imAFUaQApVg3ymrjRre674G+x7rvOwL+Chv+t19769t//k8BKyAC+SuAwUSPBT1BGjr45Zdeal959dW7f+TM+t+lfvin0Sy0VZMk2oXeH4drhnyjzljVh+m7rQ7dQqMtUxoDYf9vDbjzTCInkOCVhiLxPFNPRgof26ME5gKF40kforko+4nMtgrKomgyYqG9O0CNCr68F20ltfbsOpmr9iBN8U+RCuWyjeEczwaNYTM4wN6gX2/QrdfYrNfYbNbovJncbVs6OPOzNsaCNQPG9wVFgJu7VjO/BakD6rZFq4SGDcBvl8puPt30G3Rh+VbcmEWCtfHbpHrTuDHCe90DdmKgzwAn1xhLYMz3PfBtH+PkGu/I82rc7DnX48s+RTJO6C8Qz1ONXwJ4CuoEcp7iSTwRp/CQz7XtvE0LbT6Cv08vPo/9P4kX+r/r667yYRqDCNwoHhplNgReGd1q3ZHZ9Grdd+DB/E0m/MedMX/un3/ru9/03/5lvNR+Ba9qmjTyx462INTjRy8D6hWAb5679snnn7n+9fNXLi+YFCkiktpaHCAFcvgg4oKKZ5ENbIlrMxh5jnENVAaQYBWS9MDCI+mX4Fd8ZJI5iBBUCSuYV608IUTWlClIi3wkOOblJBlGpCuYVoxHof6hHSuALTiok+28Nu42HfI+FkRhPX0EygjY3WaDbrV2oL2ymna3Qd9Zs7h2WnbwFPcm8SAo2PXW5EG6lRp2G5YKKULYJpWNgXanhhmtw/7hwdkMEKBtTeODAOoaYIfZD9e+UkPMgRUibHHtQNV/IhnGA26II8dcETYDVlG2pAyUPi/KkpczB1jRj2U6YXl+XoZMqw5dTMb18Sr1Sz3VU+EoOMdJYTLPl1T0pHeRCRT8IFJt3QpcTGAoxYMiHhTxEtz0RpPfAGjVdYaM/hvM9BeU4j//z73+nf8ezgj0MqBeBOjLVhuf5sgfU6qw58ebvnrzZvPlW7f0H3nuM//is88++8/Q7s5AoNabBhOwlBEFQ0PxvHxTA+jRNCCAuJIGUX1tfLgfEwxkyajyVAJgllYtRSobRKSdgzkJ7JXXtTCUtk2RngsnwFjWQYI35Hek9H3yK3YU80wQoOB4ZrxJvO+jhr1aY7NaBdDebDr03Qa9MIsHQIVzOXNgTUqBGgXljtFs3VGaTePWYjuwVoDdJcFodwCJjqAdzORCKIAwiQezuABrsT5ceq3nW4fG3xR88t/iWa5xJ78RqGSPISS7EkQgFUJsFZxpJO0R7/UYN/a/WM5Y35Ce6K/SlJ/WsRIv1FECcwTTPP2yzaO2rfLwst8CsEvvKG5wQxGwyQmlRMSkiEEWuN3xrKpjo3pjoM2AYRiw6XpoPbwBw3+9Iforg+5ffeXt134Zgl7GSy3wqnllMqs/EfTEAToD9BW8TN/Av3bmxhc+8Y0r164/w0SslAoOvIAfmukk9yhY5k+pbjgP6Ut0Fmta05RjhOS10+qqH2bkuUzLXlbgmiho9enbfHVfloMMn13LEkjtOnkjNWkJyj6NAO4knvv0I0Cn2rZb7yxM1Z45RsczC5hD5wB7s3aAvcR6tUa3WmGzXgfns2EYold2AFNXtsaZw5sGqo3nXrcze+hH27ZhDhtu8xZ5xGc46tPPR4dlXQCTB2xYoPag7YA77IQGBJN4DmZx/lUCowVW2Uu3Arf4PvK9a4ECWMNzGdaDNlFRRrkyg5LnW8Bcli8HXVm3LE3ZBrI+hdaepQnfvUSdkzQC6ManyjXIKJB7oRN2/3nvKOn9ekj5pYLu1/Z19r/sgFsDGAjUA2pgQ5rt1MmgBwz9gM7u4LcCzHdh8PMK5mdA9LPrzeEv/0vvvXcgPidexkvtN/Aq35q08SeOnjhAB4CbuNncwi39v3zmuX/gEzee/3N7588NDDSKpJztSQBa3rUDk4nAB4w02lawTe7yWxQxa8+pEi6kn6dbv8+fJallWrF8XwgkObD7sklARvZcgHQ0n7t3bv/LxKlHkTOHO8CWjo1uDtke/tGhX3sNe4X1eoXNcoWNA+xus7EHg/Q9Bj3E5VeA3aJWaNgerJUD67Zt3VnYdrczBQfY/hCPwWnXbptU1n7pmNigBXau3B8QopmFhs0BtBkQO65JDde2Xe50JkEs/bYpyAbg4hqgxpgRsNO84xiQ3hEO1DjOK8ecJeBnIO3zyPp3AfBUxo11GWuHpNSFlg3y5a9r3PFalqHUsOOYiIJm0KT9HL0735wCUNvroGUrYiLFIGLXB9lttUYDs9JsKLXGuH3xtbaH2wzDxjC/Q8zfIfCvEfgbpOmXmqb51V976zuv3crmvq1z20s0aeJPPj2RgA4AzkFu+N+88Ll/6dOffOGf4sWiJ+ZZroGGO84eSi/w5FW9yQrMGwHpeOkH/0h6JMOUBQkCSA7Wgjl5QI3nnlOIbK+8xp49rwBznmYAcqF1h/oIM2JIN3suAVs1wjxOFLYo1W63s6Hr0DlT+Ppoic1qic1yhfXazmn7LUu1W4/tN0/xHuKkFMg5mjWzFs1sjtaDttOyPWATYI/4DNuj9vHkMK2dt3hcNpYCNkctW5jFLVgb6XOWgGoxX0soVhmW4BY11ATUBQAhiec/o3uXAWt1/bf/7iNz5ak2LNPy8Y8vRxFP5FMCt7xPtfgxwSLX2BOBILkWoO3r7Z/5eWvvdwGy/hBwx6I6Pwy3D33UrokY1jUDBoBmVgOz0nCb8bBxewhY0O61/eu0HtiY+2B+B+A3iPl7AH2Xmb/dsvq2aei106p/+5U331yiQh7AJy386aMnFtAB0Fdv3lRfvnUL/+gPvPifP//CC383z9oejFlgJFzp52z/CZpqxoTjP6lHcJpzBqDiMoPfcbDOmFkavpISZekJZpUCcgrWSV5hvQwladpLJQDca9WZtu3nqsM8oNCuVXwedhnzx2t2cf56s1phfXQUrjfrTdCytTBbG7G23ZrEGzSzmQPsGdr5PAC2X4tNgF1Gpd1+5n7jFg/a2p7ApU3Urj1gMwMaHMDaGIPB75ImtkqNCwfi96MMfPzXyGW5KsAlzxDAvjSPW1DOteryN01XppP/jgFvWCfuhkGi4eZp557vmZk7B3E5mgrw5Vi3QlvO2jWk5dOgFLQ9YAPOo9w7RybgbZ97bVspxbabWzM4YDVsB9ak2SjDTHYJoFizb+xSwE4P6LSGYXMA5veM4beJ+Q0G3VbG3DaE1xT49RnUW03fvPt/2f/efdoCxnZ68aUGsMdIf8kuMfPddqKnkJ5kQAcAYmZ8gmjn93zxh//cJz/5yb9LN83ARjcEomROcgzcCyD29/IUsjHgTp9T/kYmGphSDtwxcgLcXqhINGzPvCjNmiLzCnkFpibSzLVoGZZKwIbyDK9xoC2WePlDNIYBg/MQ3zhz+ProCOvlEpvlEhvnQd53dk22XPfMgNXiGwVyzmbN3IP1HO18htlsZp8r5yFu7E5rrAeYzoK17nroobcmcstQ3bIua3Y3cH/e+QzWW9yvzU4AGyX4yM1BInD7byJM2ImmG4FRdoUIktu1W7BcRuXfp6Jl/LRjGnitXCmI1uqLWhoirowX8syfBbDmJL8I8kIIyoQA388TCwOJdJP+TSlQS206HBbjhE5SrOz6NHatZU3hzGSsGVz5Y2D9CW9ewx60Rmfv18x8jw2/A+Y3QfwaMW4TcNsYfo2Mems+a+9szs3u/d+/9a0NjiHvfe5M5vgGMAH3RKP0pAO6W8pG5gXwzu/+4g//+88///xPNnu7zINmMNtpNQ/mnO3BxuEfyKaKPunpbwrSqSYc0iFKUopBIggH60BMJaSTa/QekOPcH4UXHtxJ+bjxnTRxJ5q2AGulmvBrteDIKIOn+GB3O+vWawvQyyXWR0sL2k7L7tYOsAdnFtcmmsSVXcqlWutw1s5maBcLzObzqGU7wCYikD98pB/cTmudNcv3fXRA8zuqwWvY8TeaxDndyEVo2CmQ1Zd0xc9MxWEg5W+mFbuLBDzzdJGuba7+5popgFxIyB0ki/CErGw5mNfKXhEkKiAegLdW5iwNEMU5bhJhZTjXp6UHOBJAFoDdNPaXFKixYO1N4XBgyAjTJEozK28GN25XPq3j/HVvNDqjDRu+D+Z3DfPbBPM6M26DcJsMbs+4ecPM+jvzYXgvd0SrEQP0ZUB9STSDB+yvIJxCPIH2RCemJx7QHSkQGTDjD3/6C//s9Rde+BfOX76stNGDGYaWAIQJUW82dZdh81OByZ7kIxJPiLJlaJIxB6BFuW5bCgMk4zmtRGrVPi0JyIAA5hys019SKmi//kAOauycti8Ha5MAdrdcYb08ioC9XAazeO/N4m6bUg/YJAC7mc3QzOdo5nPMFgvM5jO0szlmsxaNsiZxOMDmYcCw6aC7LpzJrb1Z3J/URUhA20CYxb2GLRzU0mmSCHgRyOKWo/GbivavPa9p2TIPIQyMvhOrDwpBgCA06DIfCY718qfAXQgRlIaT5Y3PKxvG+LLJnLIyRvCWoC/am6RQIrRrEKAAil7f0XEx+bVgrpRilzd7wLbTJGxN4cYow4bkITF+G9vBAbbbmOeQme8y8x2weQPAa2DcBnCboF4nmLe4o3deOnjj/km2QX3ZGm+CL+EE1hN92PS0ADoA0Msvv0yvvPKK+alLN/62Zz/5wp9+9lOf/HSzs6OHzUax1hQB3ZlW2XoeezMo5xp8QFaOTnSC8xeadg7YIRmK4C017AykqwANSrcgJRVM4x5Mw6YmbsexANiGrUm826DzXuLLJVaHh1gfSsBeW8DuegxDH+aNAYAVxeVcTrtuPWAvFmjnXsNuwrIu9nPWXYdhs3EnhnXQToMPW5NCADZFs7gWf1YbRwBsb2zJteoCbORnjF8FXiCrg3cWl+T9CGgLYSB/72PlFoEiDdmHKuknfUmGq6VLlfISALEtainAUFKGMZAOz+CA2T8M99IqhLhMK/haRMD213b+2gG1TZDBzGw30SH2gO1PlBNgrbXGYAx663DWgXEP4HeYzVvMeI2A20S4rcGvN6Te0Fq9s7eHu3/qtddWOIZy7fobDpwnc/hE3096mgAdAPDSSy+1r7766vA54PL/5IUf+JdvvPD8H7z03LOYLXa06ftG9z2gHZTUtHYgmugdI7SaUTS8E0kHdAqMzseJZlCKjE9q36MmcadZA0GbjhuaNCDVBCc0AGHHs6HrImAfLbE+OsTKa9lHR3Z513qDvu/sEZhuxzMAVjhoGqh2FuavZzuLANgzZxZvlPX6JWbw4OavPWBvNhawe7ujWtye1M1hE2BgfRI0EOax/bIuvwxMUgBqSCCSMFWC9jZtOXyP/Dml6VaFgYp2HcGyDsJ5PSQYFmUT6cvUIjhnYJ+nlQszNHLtU5LhKX0WyhOepwButWs/T03wewZYoG6cYKnkHDaTsgsC4U3h0X+BBqMbdqZvD9b+3PRBG/Ss0WvDhs0+mN8D4y0GvwEH1mz4NWb1ejNr39Z9+96fvveb+zie6OZkCp/oMaSnDtAB4CbQ3CLSYMbfoRb/8LVnnvnXnvvsZ89cevbZYffM6YaYadh0MH0PNiYBdu8u4w+pgH1sKQNu++MRgQQD9eActRfkgK1SsFZNa6/dc8Bqpdotreo3G+twtjzC+nCJ1dEh1kdHWB3ZeW177OYGQ+93JWPLmbyGPZsFDXu2WGC+u4PZfIHZYh6WdinAOZ0N0RS+joA9OE/0sHkKLPdjIqtdkzWJ50u8okk8Ug7Qbqk6GJSth0ZySEwCePEzxLYX67HLMBXQPgmgC6EieeavM+CVQJsLGOPpReEFxX2WRgLIMr9YslzAKTVqHzeawqOQKTzCBUiHzXektk3EiqKPI5jZzU+TNkZprcm45YBGO0dKo92mKRq9ndNeGvBdZn6HgDfAeI3BtxVwm0m9TmzenM/xzubZZ+//6Z/7uR7HUHQ0s5X1YA0Ar0za9USPMT2VgO7IL2vTLwE/eGpx9k+fP3/ux85ev4qrn/iEvnD1qto9dYqI4MzDdokTs4FdM+VgnUUjivnAAO4UGWmuaQfAVg2obRJmSGS5oNEagwdsr2EfHmJ1eBRAe72MZnHveGbPrIYFbDF/3S4WmO0sMN/ZscC9s4N2ZrcnVdZLyDqXdR2GTYdhs0a/3tjrvouALZzOmCiYxBl2cjEHa+MEorDazDWZEu2WA2fxGwCo4rGdhHOpVJ3VKOn0cY56xGRe1bDjk9Ss7XPI0qEccMesBClAS9BFdh+Fhawd5FRNEAx8f7ThleifiaYtpmpA1hkygLXrmwlgOzM4kXOZYMN+4x6ttdJaW1P4oK1lRpuwV4A2Br01hw/MuE/gdwzzWwR6HcS3GbgNqNeI+I2Zpjt7c333T7799hGOoROYwl2wiSZ68uhpBnQAwEtA+yow3PzSl+br1975PwL8xxeL+Xm1mOP0uXPDpWvXmgtXrtDZSxex2N21c9AMsNH2XGttLMhnHvHBI5zcTlFNE5x4vIYNMIw2AbC71QorZwZfHR5hdXiAVZjLtrueDc7xzBjvJU5uwxQL2LOdBWY7O5jv7mC+2Alm8cYt0YExAbD79QbD2m6L2ru5bO8prsW+4B6wvaat2W6skgM2Cz5J4q/01h4BbZLv02Ntx8Ax//Vxcy1XvicfRN5X04mCRPGOttSH0jRq5SY3L5PMTefX7DXjKIikc9bS6uPziNM2BLk1aQrYQbMOJnAnUDbuudggBbDzH8avCtCatNZKDwNpv2Oe07K9Z7gDaxjmB8x4D8Rvw9AbAL9GwPcA9VoDfl23zVvzTr13df97+6+cYBezydFsoonG6akHdCCc0mYA4PeevfKZZmf2cjOb/5RSat4zo+86rQDs7e2pU2fO0NmLF3D63HnsnNrDzt4e2vksMETLhzns1+217N6dgd2t1sFTfHV0hM1RCth914U9xQG4OWy3d7jTri1g72K+s4P5YhGWdhEBZNhumOLM4f167f6cWXwYwm5nXruWZnEmcoAdtyqVp4eVABnBKtWYSzDeCoLyWoJZlkaiCYdwUocVnt5U1763vfNlS03bFcDN2qGqKVfSk8JAYRaXaVTBOrv3WjVyzdr5VHht2oF04/0sGqtdKyLXRRnEzMZuL0pGDzQMg9LDAD1oGA/axp+VbueutTFrZtxj4A6I3yTgNQa9RuDvEdTrhvWb3PI7Z8+dO/Ga628AJLXryRQ+0UQnpwnQI9FNQPl9kF/C7AfPnj//j++ePfPlU2fOXGhmc/QwWB0t9ebwqOlWSwybDdhw2Fik8RusAIDXWv2+4zqukZZblChq7BnYs3mYv57tLrDY3cV8Zzc6nrVupzNnEtfuhLB+bQ8aiYDdhzlyIAI2lIrrsQnuMBCGgd2S1IO2LRXiL1e0S8ACjrefe20302TjLyVxI8CPmLllnJoQQHnY+FYCalmO9HkRN0lXxBcask8jAfQKeKdhctO3AGeZtgdpJ22oyrItf+21aWrtLnhBs7aOkezyD4eiG2NgdI9BG6WHQWm/897gNewhbJAyGIOBjTbM+2C8A8LbYLzOoNsA3ybm17ihN9o5vb2jL773b7zzjUMcT4mj2dcAXEWySQowAfZEE70vmgC9JHUTIA/snwduPIP279s5fean9s6c/rGz58/vtKdPYef0aajZDMxsmeCmC1q4dudjs+GowTbKHqXpl3fN/bakbo/xRlkPcW3Chin9aoV+FQHbpt1D63igB4icxxgF8DYgt7+4+3Ne+izM6FWg8w5jwmTtw+Rz3zlQh1+hLZfhkcxZl+XIQbl8F9PPQFY8S8PUn0WQzfLNAT8HXJk3pWnnpu/4XMW0gmOZKxm5U7jyddZu73nfb5TzsSCl2AK9n7cG2/PSewzDQEM/KN339gzscHCM1679Mi4Dw3xoiO8S421meoMUv8ag2wS+DVavzxr1Vr/Au+s3/qf3b+HWidZcfw1QP44UrL8ymcInmugjownQR8ib/+TJRb8d+PQpqN9z/sLlP2mUMnoYmrZtsdjbxXx3F4u9Pcx3dsKpXeRtwgwY7ZJxnumDA/9hvUG3XlvtOizt0hZ8ndro15bDrSFnB9h+ntub9gPH5Oh8BkRgspFTLVzSKEi7iwIkk3t3nWuvlbSVeFEFdJFpIRTkpm1EIE3KloO1+xTpki33PtPAx8zdiZAj5qsTAM/mq70JPIK11aRV60G6dev43X7z3hQOAIaZjWG3hS4NQ09D10ft2v9qD9Yag2EMbDpmvsfAOyC8SaDXifm2UXQbUK+hVW/umObOwS7fu3WCNdc1UzgwrbmeaKKPG02AfjzRS0DzKqBBxGDGP/bij/xbVz/9qT98aPRwtL/fHu0/wPLBAdZHh1aL7u1RmswcwdU5jaUe726NrtumkprGqbA2jIkrfZzzmXM8E0u8eASgvY8ehXuufuwSfL0+noEcBABWvMxD+CpQ17TkTBNO0k8FhCK9BNTzPKVQkM1Nh3ClCRzwznvxWQDroE3be0UU1lrnu5jJM9MDYLfK/tpjM62jmTHMAJve7XffdzS4fRB017ln1klxcHPXvdHoDTMz74P4XWa8TUSvM+E1sNOuFb3RzOmtTXfq7q2HWHN9B6Afx2QKn2iix5kmQH8Iugk0X3rpJfpvX3311Od/+Lf/9euf/9wXeDHXBDTanc/dbTr0G+eRvunQd9Z7XPeDdS5yDm9hLbhx5nN/LjZHZzo2HACc/bKvsO989Crn9J9IBRtmpPAYgVk+RXafOp2lIJyEqwK6iEnpffGsMr9d1Y59ulILT9Lx72PdlJyvzh3LAPgtb1VwNIs77nnTt1L2+FVvDg/Abeev2Z2Dbees7fJG1n0AazVsOrJWGD9/3WMYpHZtoNksmekuwHeI8AYTvaYItw3oNjXq9YbprW6Ody48xJrrr02m8IkmeipoAvSHJO8R/xOnLrz4wg//0H93/oXnz/TGMAHKuDlwrd285WAPDRncGnbvZR6dkYaw1anREdilh7zc0jTf3jRes2DLzhu99mXDUq2U6uDsL0bmqSEBOT6vads+bKo1C804yyvVwiNwJ05lPq3iPgVur1WD7PrrsHRQataNSkzfUsO2vy2IFJMiKIDZWGnLgnVPfdfR0HXKn90eQFsPAbB762jWA7jPwLsAvwlSrxPRbWa6rRS91rbqDRh159TC3P3TI2ddZ5+Tvuy0a8CCNTCZwiea6GmlCdAfgb5682bz5Vu39B+48Ym/78bnPv+fnnnuWTLGsHEnNmkB2vbozsEBe5e+C7u26bCenb3WzmzvPaj7OXKODm4A4jN/V2Xh0Swfl54J03o2B41MIJCm7ALApRlbRPD3hek80cKlYxoKzTlc+3zkvLXTwIPmnXiEW9BWjYqboyRgbc9NV245oGoaJqUsWDMz/Ly1Paud+k2n+k1Hw2ZjN9fxR73qIXiF99bS8gCg90D8NpF6nQn26Eyi22joDbSLt2a76r0/893v3nfru7fSTaC5I8boZAqfaKKJttEE6I9Ifk/433/9hX/w+R/84n947hPPzTurjjnzu12/q3t3JnffWxDw98Ngd6DT2oK619SNcYeTuBPFPJhzNL8H3PagPgbocuG4eD5qWheBC83YBZT3JRCn5vNc25bOZuE+d0DzWnT4teGUUvatckdi+j3m3V/jt69tW6iZPYY1mMbtMi4mELPRYOO0666jbrOhYbNRQ9ehX6+dNUUCtgVrzWYN8F2A3gHRGyB6HU67bmf0GhhvNTPc0Zcv37v1jW90x/Uf72gmtetpzfVEE030fmgC9PdBL7/0UvvKq68Of/CZT/6uZ77wA//hlU9+8kLHZtDD0LjdtGAGjcEBhHFHkXqNXc6ra+13nnPA7raY9b/R/I5Eaw8kNXhJYa34mFNcCs5ABsziHxL3QSMP4Cy0cqIUvKkE6Kh5U/AIjxq2W8YnAFvN4pK/qGE3UG3Dyh/uwcRsNGsnQHWbjerXG9VvNhg2a7t9rdtzfugHu6OZNujZaGa+T8C7DH6LoF5Hw7eJmttKNa+ZRr1BGnea2cX3bj3EmutJu55oook+SpoA/X3SzZs3m1u3bunfPT/9xS/8jh/9f9/4gR/4sWHWot902mjdGKOdE5T7DRq6A3SvyfsduQSoe2BnI7R0obEXIC4d48S1XMIGf+0ekjO9p1p4ORcutfPqPHViAs8A2j0PG6P4/euVCk5mzaxFM5ujaVu087lfxsXUNH7PcIY27JdrDes1bTYbNazX5NfoB8AeegyD1641mPmACXcBvA3QG1Bkj85UzW2l8Lpp52/NdtS7+LEf27916+Rrrv39BNYTTTTRx4EmQP8AyIM6gPk/9kM/+i9c+vQLf+zijRttp7XuNxsyWivvJKed2V337mzxPnWQC+Z3LczvFWc5CA09BXf/UcutWj3594WDmnSAo8zxzG5mAiAFbRW0a5WcBmeXcLXhYJh27jVr+6faBo1quGmV8/Wza65136Nbb6jfrKlfb1S/WqPfrN2e8xsL1L31Du+NhmbeMPM9EN5h0FtK0WsA3VaE20a1r7UKb6LdvXP2FN3797773fVx37JmCgcmR7OJJpro408ToH9A9DKgXiEyYMZPnL302z/5W3/kX7jy/Cf+zt3z59H1/dCt10oPg/LOVmFjEP/nD0UZvNauwW6JG/vlbOIXmdmdxRGvCD8eewgEDhCemNEDmCM1g4flW+5XqeBo5jdHadpZCthuDrudz6Da1pnCnXbtwHroevTrNXXrdWN3wFvDgnY8grUfrLNZb4wBeJ+B90D0FoheB+g1InVbtbiNpn0DM3r77Jkz7/2Z3/iNB8V0Q0mTKXyiiSZ6YmkC9A+WwpGsAPBTz73w+5/55Kf++Ruf+fTndy9cQG+M7tYrDJtOmX4gr5kPwfyeg/oQtPUE1P0fUAB7an6X5De1sVp1onmLU7j8YR6NX7rlHMwa+de23Li11+xObWE98ND16KwJXHWrFeWA3TtfAgvWGsaYIwbuArgDUm9aUzh9j5rmtVbhtaGZvWXmePd3fv7z91559dXhuMafTOETTTTR00wToH8I9DKgvsLMbmnS6Z+88sw/cvn5T/yj159/4YsXnr0BtZhDazP0q5Xqu44Gt/e2EevTjXOo8/PqrN3SNucJD7+kzUgg91p6nPP268qCxq3cqVtNE5zLmlZo2HY5FzfugA/DzNCa9TD4M9lVv1qrbrVCt1yhX9t95ju3gU7vdjYbjOkN830ivANSbxLz61DNbTTqdkPNa0rhzVmzuNN/6vrdP/83/sbyYbXriikcmAB7ookmeoppAvQPkW7evNnc+rN/Vjuw2nkJs5vXX3j+Hz5/9epLN57/RHPu2jW0u7tgRZoHzX23UX3Xke56SrR0b4L3x546k7sR274yc/Qu92uwwx7h1vGsbd2aa3d8JgBm7U3hHbrVijartepWS+qWK2z84TCbeJJbPwzorbVg355zjbdBeIOouY2GbjfU3KZZ88aixVu8t/fef/qd7+xPa64nmmiiiT58mgD9wyd66aWXmp/+6Z8e/LKzzwM/dJVmP3nh0uW/6/SF87/16rXrs4vXr2H33FnMdnfRzudGNcowCMYYYjbgQZM9YY3JO8e51WhhcxflgZPAxjCgNQ99D9312KzW1K2WarN0YL1coVst0a3X6DedNYcPA3qtoY1ZMXAPRHeI8CZIvQZFtxXotpo1r7Vq9paa8Ts7ly/fu/XNb3THQe3YmutX7OvJ0WyiiSaa6AOgCdA/OqKbgPoqsyGlwv6tnwQ+fxH4n+3R/G/Z2d35rTu7e589c/bM7qlTp7F7ag+LvT1nDp9DNW56mCnsIgciGKPd8ap2c5R+vUa3XmNj5+vRdx36vsegDQajBwbfZ8a7RPQWO+2aFN1WrbrdUvNm28zf3n3mwt1b3/zm4eRoNtFEE030eNAE6N8H8s5bP000xC3Y7eT354EX5sBn5sDnGuALCuo5heY6KXVZEfYItAvCwunldhE5uAdzz4wVgEMDHJCi9xToHWrUW6TUm6pRbyioN7HTvK12dt4792M/tn/rz97SJ9GuvzY5mk000UQTfexpAvTvP6mXAHUV4HD2evgq8fPc/MmfbO7/6q/umHff3aHNZmGYqWVWA5FpZrN+b2enmz/zzOarP/Mza1JK7A87TmNrrm9FM/gE1hNNNNFEjwlNgP7xIoI1YScgewsweDhwpZcBOmaDFDxkmhNNNNFEE32MaQL0x4eK3VsF5cA8AfVEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRBNNNNFEE0000UQTTTTRRB9j+v8DQHAJkLFVywAAAAAASUVORK5CYII=", primary: true, placement: "dock", layout: "workspace", component: Page });
}
export {
  apply,
  inject
};

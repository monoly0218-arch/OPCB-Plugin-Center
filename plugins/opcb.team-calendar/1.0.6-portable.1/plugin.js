// src/plan-import.mjs
function parsePlan(input, state, week) {
  if (input.trim().startsWith("{")) return JSON.parse(input);
  const rows = input.trim().split("\n").filter((x) => x.trim());
  if (!rows.length) throw new Error("\u8BF7\u586B\u5199\u9700\u8981\u5BFC\u5165\u7684\u4EFB\u52A1");
  const tasks = rows.map((line, i) => {
    const [sourceId, title, projectName, memberName, dayText, deliverable = ""] = line.split("|").map((s) => s.trim());
    if (!sourceId || !title || !projectName || !memberName) throw new Error(`\u7B2C ${i + 1} \u884C\u7F3A\u5C11\u7F16\u53F7\u3001\u4EFB\u52A1\u3001\u9879\u76EE\u6216\u8D1F\u8D23\u4EBA`);
    const project = state.projects.find((p) => p.name === projectName), member = state.members.find((m) => m.name === memberName);
    if (!project) throw new Error(`\u7B2C ${i + 1} \u884C\uFF1A\u627E\u4E0D\u5230\u9879\u76EE\u201C${projectName}\u201D`);
    if (!member) throw new Error(`\u7B2C ${i + 1} \u884C\uFF1A\u627E\u4E0D\u5230\u6210\u5458\u201C${memberName}\u201D`);
    return { sourceId, title, projectId: project.id, assigneeId: member.id, deliverable, dates: dayText ? dayText.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : [] };
  });
  return { sourceKey: "weekly-plan-manual", plan: { sourceId: week, title: "\u672C\u5468\u5DE5\u4F5C\u8BA1\u5212", weekStart: week }, tasks };
}

// src/dates.mjs
var localToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
function addDays(day, count) {
  const d = /* @__PURE__ */ new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
function monday(day) {
  const d = /* @__PURE__ */ new Date(day + "T12:00:00Z");
  return addDays(day, -((d.getUTCDay() + 6) % 7));
}
function shiftMonth(day, count) {
  const d = /* @__PURE__ */ new Date(day + "T12:00:00Z"), n = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + count);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(n, last));
  return d.toISOString().slice(0, 10);
}
var weekday = (day) => ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"][(/* @__PURE__ */ new Date(day + "T12:00:00Z")).getUTCDay()];
var shortDate = (day) => `${Number(day.slice(5, 7))}\u6708${Number(day.slice(8))}\u65E5`;
var statuses = { todo: "\u5F85\u5F00\u59CB", doing: "\u8FDB\u884C\u4E2D", review: "\u5F85\u5BA1\u6838", done: "\u5DF2\u5B8C\u6210", blocked: "\u963B\u585E" };

// src/team-month.mjs
function monthDays(day) {
  const first = day.slice(0, 8) + "01";
  const count = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => addDays(first, i));
}
function monthSchedule(day, members, tasks, allocations) {
  const days = monthDays(day), indexes = new Map(days.map((d, i) => [d, i]));
  const datesByTask = /* @__PURE__ */ new Map();
  for (const a of allocations) {
    if (!indexes.has(a.date)) continue;
    if (!datesByTask.has(a.taskId)) datesByTask.set(a.taskId, /* @__PURE__ */ new Set());
    datesByTask.get(a.taskId).add(indexes.get(a.date));
  }
  const rows = members.map((member) => {
    const segments = [];
    for (const task of tasks.filter((t) => t.assigneeId === member.id || t.kind === "meeting" && t.meeting?.participantIds.includes(member.id))) {
      const dates = [...datesByTask.get(task.id) || []].sort((a, b) => a - b);
      let segment;
      for (const index of dates) {
        if (segment && index === segment.end + 1) segment.end = index;
        else {
          segment = { task, start: index, end: index };
          segments.push(segment);
        }
      }
    }
    segments.sort((a, b) => a.start - b.start || b.end - a.end || a.task.id.localeCompare(b.task.id));
    const laneEnds = [];
    for (const segment of segments) {
      let lane = laneEnds.findIndex((end) => end < segment.start);
      if (lane === -1) lane = laneEnds.length;
      segment.lane = lane;
      laneEnds[lane] = segment.end;
    }
    return { member, segments, laneCount: Math.max(1, laneEnds.length), taskCount: new Set(segments.map((s) => s.task.id)).size };
  });
  return { days, rows };
}

// src/meetings.mjs
function meetingUrl(value) {
  if (typeof value !== "string" || value.length > 2e3) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
function dueMeetingReminders(tasks, allocations, now) {
  const due = [];
  for (const task of tasks) {
    if (task.kind !== "meeting" || !task.meeting || task.status === "done") continue;
    const meeting = task.meeting;
    for (const slot of allocations.filter((a) => a.taskId === task.id && a.start)) {
      const start = Date.parse(`${slot.date}T${slot.start}:00+08:00`);
      const events = /* @__PURE__ */ new Map([[meeting.reminderMinutes, "\u4F1A\u8BAE\u63D0\u9192"], [meeting.joinBeforeMinutes, meeting.provider === "offline" ? "\u4F1A\u8BAE\u51C6\u5907" : "\u8FDB\u4F1A\u63D0\u9192"]]);
      for (const [minutes, title] of events) {
        const at = start - minutes * 6e4;
        if (now < at || now >= at + 6e4) continue;
        due.push({
          key: `${task.id}:${slot.date}:${slot.start}:${minutes}`,
          taskId: task.id,
          title,
          message: `${task.title} \xB7 ${slot.start} \u5F00\u59CB${meeting.location ? " \xB7 " + meeting.location : ""}${minutes ? " \xB7 \u63D0\u524D " + minutes + " \u5206\u949F" : " \xB7 \u73B0\u5728\u5F00\u59CB"}`,
          url: meeting.provider === "offline" ? "" : meeting.url || ""
        });
      }
    }
  }
  return due;
}

// src/Calendar.jsx
function createCalendarApp(React, transport, { styles = "", preview = false } = {}) {
  const { useState, useEffect, useLayoutEffect, useRef } = React;
  function Icon({ name, size = 18 }) {
    const paths = { calendar: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" }), /* @__PURE__ */ React.createElement("path", { d: "M8 14h2m4 0h2m-8 4h2" })), chevron: /* @__PURE__ */ React.createElement("path", { d: "m9 5 7 7-7 7" }), plus: /* @__PURE__ */ React.createElement("path", { d: "M12 5v14M5 12h14" }), search: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "10", cy: "10", r: "6" }), /* @__PURE__ */ React.createElement("path", { d: "m15 15 5 5" })), close: /* @__PURE__ */ React.createElement("path", { d: "m6 6 12 12M6 18 18 6" }), refresh: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M20 7v5h-5M4 17v-5h5" }), /* @__PURE__ */ React.createElement("path", { d: "M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2" })), check: /* @__PURE__ */ React.createElement("path", { d: "m5 12 4 4L19 6" }), users: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "8", r: "3" }), /* @__PURE__ */ React.createElement("path", { d: "M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 2 4v2" })), sun: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "4" }), /* @__PURE__ */ React.createElement("path", { d: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" })), import: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" })), clock: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "9" }), /* @__PURE__ */ React.createElement("path", { d: "M12 7v5l3 2" })), moon: /* @__PURE__ */ React.createElement("path", { d: "M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z" }), dot: /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "4" }) };
    return /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, paths[name] || paths.calendar);
  }
  const Button = ({ children, icon, label, onClick, className = "", ...props }) => /* @__PURE__ */ React.createElement("button", { type: "button", className: "tc-btn " + (!children ? "tc-icon-only " : "") + className, "aria-label": label || (typeof children === "string" ? children : void 0), title: label, onClick, ...props }, icon && /* @__PURE__ */ React.createElement(Icon, { name: icon }), children && /* @__PURE__ */ React.createElement("span", null, children));
  const PanelForm = ({ children, ...props }) => {
    const nodes = React.Children.toArray(children);
    return /* @__PURE__ */ React.createElement("form", { ...props }, /* @__PURE__ */ React.createElement("div", { className: "tc-form-body" }, nodes.slice(0, -1)), nodes.at(-1));
  };
  const uid = () => crypto.randomUUID();
  const range = (start, count) => Array.from({ length: count }, (_, i) => addDays(start, i));
  return function Calendar() {
    const [state, setState] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [connectionError, setConnectionError] = useState("");
    const [selected, setSelected] = useState(localToday()), [view, setView] = useState("week"), [projectFilter, setProjectFilter] = useState(null), [memberFilter, setMemberFilter] = useState(null), [query, setQuery] = useState(""), [monthLayout, setMonthLayout] = useState("grid");
    const [draft, setDraft] = useState(null), [importText, setImportText] = useState(""), [notice, setNotice] = useState(""), [dark, setDark] = useState(false), [navOpen, setNavOpen] = useState(false), [quick, setQuick] = useState(null), [remindersOn, setRemindersOn] = useState(false), [reminderQueue, setReminderQueue] = useState([]);
    const active = useRef(true), pending = useRef(null), formFocus = useRef(null), loadId = useRef(0), rootRef = useRef(null), quickRef = useRef(null), quickAnchor = useRef(null), reminderSeen = useRef(/* @__PURE__ */ new Set());
    async function reload() {
      const seq = ++loadId.current;
      setLoading(true);
      try {
        const s = await transport.read();
        if (active.current && seq === loadId.current) {
          setState(s);
          setConnectionError("");
          setError("");
        }
      } catch (e) {
        if (active.current && seq === loadId.current) {
          setConnectionError(e.message);
          setError(e.message);
        }
      } finally {
        if (active.current && seq === loadId.current) setLoading(false);
      }
    }
    useEffect(() => {
      active.current = true;
      reload();
      return () => {
        active.current = false;
      };
    }, []);
    useEffect(() => transport.subscribe?.(() => reload()), []);
    useEffect(() => {
      if (!navOpen) return;
      const close = (e) => {
        if (e.key === "Escape") setNavOpen(false);
      };
      document.addEventListener("keydown", close);
      return () => document.removeEventListener("keydown", close);
    }, [navOpen]);
    useEffect(() => {
      if (!notice) return;
      const t = setTimeout(() => setNotice(""), 3500);
      return () => clearTimeout(t);
    }, [notice]);
    useEffect(() => {
      if (draft) formFocus.current?.focus();
    }, [draft?.id, draft?.mode]);
    useEffect(() => {
      if (!quick) return;
      quickRef.current?.focus();
      const dismiss = (e) => {
        if (e.key === "Escape") {
          setQuick(null);
          quickAnchor.current?.focus();
        }
      };
      const outside = (e) => {
        if (!rootRef.current?.contains(e.target) || !e.target.closest(".tc-quick") && !e.target.closest("[data-task-id]")) setQuick(null);
      };
      const close = () => setQuick(null);
      document.addEventListener("keydown", dismiss);
      document.addEventListener("pointerdown", outside);
      window.addEventListener("resize", close);
      return () => {
        document.removeEventListener("keydown", dismiss);
        document.removeEventListener("pointerdown", outside);
        window.removeEventListener("resize", close);
      };
    }, [quick?.taskId]);
    useEffect(() => {
      setQuick(null);
    }, [view, selected, query, projectFilter, memberFilter]);
    useEffect(() => {
      if (!remindersOn || !state?.currentMemberId) return;
      const tick = () => {
        const next = dueMeetingReminders(state.tasks.filter((t) => t.assigneeId === state.currentMemberId || t.meeting?.participantIds?.includes(state.currentMemberId)), state.allocations, Date.now()).filter((item) => !reminderSeen.current.has(item.key));
        for (const item of next) {
          reminderSeen.current.add(item.key);
          if (globalThis.Notification?.permission === "granted") {
            try {
              new Notification(item.title, { body: item.message, tag: item.key });
            } catch {
            }
          }
        }
        if (next.length) setReminderQueue((queue) => queue.concat(next));
      };
      tick();
      const timer = setInterval(tick, 15e3);
      return () => clearInterval(timer);
    }, [remindersOn, state]);
    const reminder = reminderQueue[0];
    const today = localToday(), week = monday(selected), days = range(week, 7), isMonth = view === "month" || view === "team-month";
    const members = state?.members || [], projects = state?.projects || [], tasks = state?.tasks || [], allocations = state?.allocations || [];
    const project = (id) => projects.find((p) => p.id === id) || { name: "\u672A\u77E5\u9879\u76EE", color: "blue" };
    const member = (id) => members.find((p) => p.id === id) || { name: "\u672A\u5206\u914D", initial: "?" };
    const belongs = (t, id) => t.assigneeId === id || t.kind === "meeting" && t.meeting?.participantIds.includes(id);
    const selfMember = members.find((m) => m.id === state?.currentMemberId);
    const previousIdentity = useRef(void 0);
    useLayoutEffect(() => {
      const key = state?.currentUserPubkey ? state.currentUserPubkey + ":" + (state.currentMemberId || "unbound") : null;
      if (previousIdentity.current !== void 0 && previousIdentity.current !== key) {
        setMemberFilter(null);
        setDraft(null);
        setQuick(null);
        setRemindersOn(false);
        setReminderQueue([]);
        reminderSeen.current.clear();
        pending.current = null;
      }
      previousIdentity.current = key;
    }, [state?.currentUserPubkey, state?.currentMemberId]);
    const onlyMe = !!selfMember && memberFilter?.length === 1 && memberFilter[0] === selfMember.id;
    const visibleMembers = members.filter((m) => memberFilter === null || memberFilter.includes(m.id));
    const search = query.trim().toLocaleLowerCase();
    const visibleTasks = tasks.filter((t) => (projectFilter === null || projectFilter.includes(t.projectId)) && (memberFilter === null || memberFilter.some((id) => belongs(t, id))) && (!search || [t.title, project(t.projectId).name, member(t.assigneeId).name, ...(t.meeting?.participantIds || []).map((id) => member(id).name)].join(" ").toLocaleLowerCase().includes(search)));
    const pendingTasks = visibleTasks.filter((t) => !allocations.some((a) => a.taskId === t.id));
    const entries = (day, person) => allocations.filter((a) => a.date === day).map((a) => ({ a, t: visibleTasks.find((t) => t.id === a.taskId) })).filter(({ t }) => t && (!person || belongs(t, person))).sort((x, y) => (x.a.start || "99").localeCompare(y.a.start || "99") || x.t.title.localeCompare(y.t.title, "zh-CN"));
    const quickTask = tasks.find((t) => t.id === quick?.taskId);
    useLayoutEffect(() => {
      if (!quick || !quickRef.current || !rootRef.current) return;
      const popup = quickRef.current.getBoundingClientRect(), root = rootRef.current.getBoundingClientRect();
      const top = Math.max(16, Math.min(quick.top, root.height - popup.height - 16));
      if (Math.abs(top - quick.top) > 1) setQuick((current) => current ? { ...current, top } : current);
    }, [quick, quickTask]);
    const weekCount = new Set(allocations.filter((a) => days.includes(a.date) && visibleTasks.some((t) => t.id === a.taskId)).map((a) => a.taskId)).size;
    function toggle(list, set, id) {
      set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    }
    function changeDraft(key, value) {
      pending.current = null;
      setDraft((d) => ({ ...d, [key]: value }));
    }
    function openTask(task, date) {
      pending.current = null;
      setError("");
      setQuick(null);
      if (task) setDraft({ ...task, mode: "task", baseRevision: state.revision, allocations: allocations.filter((a) => a.taskId === task.id).map((a) => ({ ...a })) });
      else setDraft({ mode: "task", id: uid(), isNew: true, title: "", projectId: projectFilter?.[0] || projects[0]?.id, assigneeId: memberFilter?.[0] || members[0]?.id, status: "todo", dueDate: "", description: "", deliverable: "", sourceUrl: "", kind: "task", meeting: { provider: "tencent", location: "", url: "", participantIds: [], joinBeforeMinutes: 5, reminderMinutes: 10 }, baseRevision: state.revision, allocations: date ? [{ id: uid(), date }] : [] });
      setNavOpen(false);
    }
    async function write(request) {
      setSaving(true);
      setError("");
      try {
        let result;
        try {
          result = await transport.write(request);
        } catch (e) {
          if (e.status || !transport.operation) throw e;
          try {
            result = await transport.operation(request.requestId);
          } catch {
            throw new Error("\u4FDD\u5B58\u7ED3\u679C\u5F85\u6838\u5BF9\uFF0C\u8BF7\u4FDD\u7559\u8349\u7A3F\u540E\u91CD\u8BD5\uFF1B\u7CFB\u7EDF\u5C06\u4F7F\u7528\u539F\u8BF7\u6C42\u6807\u8BC6\u67E5\u8BE2\u6216\u63D0\u4EA4\u3002");
          }
        }
        if (!result.saved) throw new Error("\u670D\u52A1\u672A\u786E\u8BA4\u4FDD\u5B58\uFF0C\u8BF7\u4FDD\u7559\u8349\u7A3F");
        if (!active.current) return;
        setDraft(null);
        pending.current = null;
        setNotice("\u5B89\u6392\u5DF2\u4FDD\u5B58");
        await reload();
      } catch (e) {
        if (active.current) {
          if (e.status === 409) {
            try {
              const latest = await transport.read();
              if (active.current) setState(latest);
            } catch {
            }
          }
          if (active.current) setError(e.message);
        }
      } finally {
        if (active.current) setSaving(false);
      }
    }
    async function loadLatestDraft() {
      const target = draft;
      setSaving(true);
      setError("");
      try {
        const latest = await transport.read();
        if (!active.current) return;
        if (latest.currentUserPubkey !== state.currentUserPubkey) throw new Error("\u8FDE\u63A5\u7528\u6237\u5DF2\u5207\u6362\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u65E5\u5386");
        setState(latest);
        pending.current = null;
        if (target.mode === "settings") setDraft({ mode: "settings", baseRevision: latest.revision, members: structuredClone(latest.members), projects: structuredClone(latest.projects) });
        else if (target.mode === "import") {
          setImportText("");
          setDraft({ mode: "import", baseRevision: latest.revision });
        } else if (target.isNew) setDraft((current) => current?.id === target.id ? { ...current, baseRevision: latest.revision } : current);
        else {
          const task = latest.tasks.find((t) => t.id === target.id);
          if (!task) throw new Error("\u8BE5\u5B89\u6392\u5DF2\u4E0D\u5B58\u5728");
          setDraft({ ...task, mode: "task", baseRevision: latest.revision, allocations: latest.allocations.filter((a) => a.taskId === task.id).map((a) => ({ ...a })) });
        }
        setNotice(target.isNew ? "\u5DF2\u8F7D\u5165\u6700\u65B0\u7248\u672C\uFF0C\u65B0\u5B89\u6392\u8349\u7A3F\u4FDD\u7559" : "\u5DF2\u8F7D\u5165\u6700\u65B0\u5185\u5BB9\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u540E\u4FDD\u5B58");
      } catch (e) {
        if (active.current) setError(e.message);
      } finally {
        if (active.current) setSaving(false);
      }
    }
    function saveTask(e) {
      e.preventDefault();
      const fields = { title: draft.title, projectId: draft.projectId, assigneeId: draft.assigneeId, status: draft.status, dueDate: draft.dueDate, description: draft.description, deliverable: draft.deliverable, sourceUrl: draft.sourceUrl, kind: draft.kind || "task", meeting: draft.kind === "meeting" ? draft.meeting : null };
      const dates = draft.allocations.filter((a) => a.date).map((a) => ({ id: a.id, date: a.date, ...a.start || a.end ? { start: a.start || "", end: a.end || "" } : {} }));
      const payload = draft.isNew ? { action: "upsert", sourceKey: "calendar-ui", tasks: [{ ...fields, sourceId: draft.id, dates: dates.map(({ id, ...a }) => a) }] } : { action: "update", taskId: draft.id, changes: fields, allocations: dates };
      if (!pending.current) pending.current = { ...payload, requestId: uid(), expectedRevision: draft.baseRevision };
      write(pending.current);
    }
    function openImport() {
      setQuick(null);
      pending.current = null;
      setError("");
      setImportText("");
      setDraft({ mode: "import", baseRevision: state.revision });
    }
    function openSettings() {
      setNavOpen(false);
      setQuick(null);
      pending.current = null;
      setError("");
      setDraft({ mode: "settings", baseRevision: state.revision, members: structuredClone(members), projects: structuredClone(projects) });
    }
    function importPlan(e) {
      e.preventDefault();
      try {
        const input = parsePlan(importText, state, week);
        if (!pending.current) pending.current = { ...input, action: "upsert", requestId: uid(), expectedRevision: draft.baseRevision };
        write(pending.current);
      } catch (error2) {
        setError(error2.message || "\u5468\u8BA1\u5212\u683C\u5F0F\u4E0D\u6B63\u786E\uFF0C\u8BF7\u53C2\u8003\u793A\u4F8B\u586B\u5199");
      }
    }
    function importExample() {
      setImportText(`W001 | \u5B8C\u6210\u811A\u672C\u4E0E\u5206\u955C | ${projects[0]?.name} | ${members[0]?.name} | ${week},${addDays(week, 1)} | \u786E\u8BA4\u7248\u5206\u955C\u7A3F`);
      pending.current = null;
    }
    function drop(e, date, person) {
      e.preventDefault();
      try {
        const a = allocations.find((a2) => a2.id === e.dataTransfer.getData("text/calendar-allocation"));
        if (!a) return;
        const t = tasks.find((t2) => t2.id === a.taskId);
        if (person && t.assigneeId !== person) {
          setError("\u8DE8\u6210\u5458\u6539\u6D3E\u8BF7\u5728\u4EFB\u52A1\u8BE6\u60C5\u4FEE\u6539\u8D1F\u8D23\u4EBA");
          return;
        }
        write({ action: "update", taskId: t.id, changes: {}, allocations: allocations.filter((x) => x.taskId === t.id).map((x) => x.id === a.id ? { ...x, date } : x), requestId: uid(), expectedRevision: state.revision });
      } catch {
        setError("\u672A\u80FD\u79FB\u52A8\u5B89\u6392\uFF0C\u8BF7\u6253\u5F00\u4EFB\u52A1\u8BE6\u60C5\u4FEE\u6539\u65E5\u671F");
      }
    }
    function showQuick(e, t, date) {
      if (draft) {
        openTask(t);
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect(), root = rootRef.current.getBoundingClientRect(), width = Math.min(370, root.width - 32);
      const x = rect.right - root.left + 12 + width <= root.width ? rect.right - root.left + 12 : rect.left - root.left - width - 12;
      quickAnchor.current = e.currentTarget;
      setQuick({ taskId: t.id, date, left: Math.max(16, Math.min(x, root.width - width - 16)), top: Math.max(16, Math.min(rect.top - root.top, root.height - 440)) });
    }
    function enableReminders() {
      setRemindersOn(!remindersOn);
      setNotice(remindersOn ? "\u672C\u673A\u4F1A\u8BAE\u63D0\u9192\u5DF2\u5173\u95ED" : "\u672C\u4EBA\u4F1A\u8BAE\u63D0\u9192\u5DF2\u5F00\u542F\uFF1A\u8BF7\u4FDD\u6301\u65E5\u5386\u9875\u9762\u6253\u5F00");
    }
    function meetingFields() {
      const m = draft.meeting || { provider: "tencent", participantIds: [], joinBeforeMinutes: 5, reminderMinutes: 10 };
      const edit = (key, value) => changeDraft("meeting", { ...m, [key]: value });
      return /* @__PURE__ */ React.createElement("section", { className: "tc-meeting-fields" }, /* @__PURE__ */ React.createElement("div", { className: "tc-section-title" }, "\u4F1A\u8BAE\u5B89\u6392 \xB7 Asia/Shanghai"), /* @__PURE__ */ React.createElement("label", null, "\u4F1A\u8BAE\u65B9\u5F0F", /* @__PURE__ */ React.createElement("select", { value: m.provider, onChange: (e) => edit("provider", e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "tencent" }, "\u817E\u8BAF\u4F1A\u8BAE"), /* @__PURE__ */ React.createElement("option", { value: "other" }, "\u5176\u4ED6\u7EBF\u4E0A\u4F1A\u8BAE"), /* @__PURE__ */ React.createElement("option", { value: "offline" }, "\u7EBF\u4E0B\u4F1A\u8BAE"))), m.provider !== "offline" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("label", null, "\u5165\u4F1A\u94FE\u63A5", /* @__PURE__ */ React.createElement("input", { type: "url", value: m.url || "", onChange: (e) => edit("url", e.target.value), placeholder: "\u7C98\u8D34 HTTPS \u4F1A\u8BAE\u94FE\u63A5" })), m.provider === "tencent" && /* @__PURE__ */ React.createElement("div", { className: "tc-connection-state" }, /* @__PURE__ */ React.createElement("span", null, "\u817E\u8BAF\u4F1A\u8BAE \xB7 \u672A\u8FDE\u63A5"), /* @__PURE__ */ React.createElement(Button, { disabled: true }, "\u81EA\u52A8\u521B\u5EFA\u4F1A\u8BAE"), /* @__PURE__ */ React.createElement("small", null, "\u81EA\u52A8\u521B\u5EFA\u5C1A\u672A\u63A5\u5165\uFF1B\u5F53\u524D\u53EF\u7C98\u8D34\u5DF2\u6709\u4F1A\u8BAE\u94FE\u63A5\u3002"))), /* @__PURE__ */ React.createElement("label", null, m.provider === "offline" ? "\u4F1A\u8BAE\u5730\u70B9" : "\u5730\u70B9\u6216\u8865\u5145\u8BF4\u660E", /* @__PURE__ */ React.createElement("input", { required: m.provider === "offline", value: m.location || "", onChange: (e) => edit("location", e.target.value), placeholder: "\u4F8B\u5982\uFF1A\u5DE5\u4F5C\u5BA4\u4E00\u697C\u4F1A\u8BAE\u5BA4" })), /* @__PURE__ */ React.createElement("fieldset", { className: "tc-attendees" }, /* @__PURE__ */ React.createElement("legend", null, "\u53C2\u4F1A\u6210\u5458"), members.map((person) => /* @__PURE__ */ React.createElement("label", { key: person.id }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: (m.participantIds || []).includes(person.id), onChange: () => edit("participantIds", (m.participantIds || []).includes(person.id) ? m.participantIds.filter((id) => id !== person.id) : [...m.participantIds || [], person.id]) }), person.name))), /* @__PURE__ */ React.createElement("div", { className: "tc-form-pair" }, /* @__PURE__ */ React.createElement("label", null, "\u63D0\u524D\u51C6\u5907\uFF0F\u8FDB\u4F1A", /* @__PURE__ */ React.createElement("select", { value: m.joinBeforeMinutes, onChange: (e) => edit("joinBeforeMinutes", Number(e.target.value)) }, [0, 5, 10, 15].map((n) => /* @__PURE__ */ React.createElement("option", { key: n, value: n }, n === 0 ? "\u51C6\u65F6\u5F00\u59CB" : `\u63D0\u524D ${n} \u5206\u949F`)))), /* @__PURE__ */ React.createElement("label", null, "\u5F00\u59CB\u524D\u63D0\u9192", /* @__PURE__ */ React.createElement("select", { value: m.reminderMinutes, onChange: (e) => edit("reminderMinutes", Number(e.target.value)) }, [0, 5, 10, 15, 30].map((n) => /* @__PURE__ */ React.createElement("option", { key: n, value: n }, n === 0 ? "\u5F00\u59CB\u65F6" : `\u63D0\u524D ${n} \u5206\u949F`))))), /* @__PURE__ */ React.createElement("p", { className: "tc-form-help" }, "\u5F00\u542F\u9876\u90E8\u300C\u672C\u673A\u63D0\u9192\u300D\u540E\uFF0C\u9875\u9762\u6253\u5F00\u65F6\u4F1A\u63D0\u9192\u4F1A\u8BAE\u5F00\u59CB\u548C\u63D0\u524D\u8FDB\u4F1A\uFF1B\u5728\u4F1A\u8BAE\u901F\u89C8\u4E2D\u5141\u8BB8\u7CFB\u7EDF\u901A\u77E5\u540E\uFF0C\u4E5F\u53EF\u663E\u793A\u6D4F\u89C8\u5668\u901A\u77E5\u3002\u9875\u9762\u5173\u95ED\u540E\u7684\u63D0\u9192\u5C1A\u672A\u63A5\u901A\u3002"));
    }
    function quickView() {
      if (!quickTask) return null;
      const t = quickTask, m = t.meeting, slots = allocations.filter((a) => a.taskId === t.id).sort((a, b) => a.date.localeCompare(b.date));
      return /* @__PURE__ */ React.createElement("section", { ref: quickRef, tabIndex: -1, role: "dialog", "aria-label": "\u5B89\u6392\u901F\u89C8", className: "tc-quick", style: { left: quick.left, top: quick.top } }, /* @__PURE__ */ React.createElement("div", { className: "tc-quick-top" }, /* @__PURE__ */ React.createElement("span", { className: "tc-quick-project tc-" + project(t.projectId).color }, /* @__PURE__ */ React.createElement("i", null), project(t.projectId).name), /* @__PURE__ */ React.createElement(Button, { icon: "close", label: "\u5173\u95ED\u901F\u89C8", onClick: () => {
        setQuick(null);
        quickAnchor.current?.focus();
      } })), /* @__PURE__ */ React.createElement("h2", null, t.kind === "meeting" && /* @__PURE__ */ React.createElement(Icon, { name: "users", size: 20 }), " ", t.title), /* @__PURE__ */ React.createElement("span", { className: "tc-status tc-status-" + t.status }, statuses[t.status]), /* @__PURE__ */ React.createElement("div", { className: "tc-quick-row" }, /* @__PURE__ */ React.createElement(Icon, { name: "users", size: 16 }), /* @__PURE__ */ React.createElement("span", null, member(t.assigneeId).name, m?.participantIds?.length > 0 && ` \xB7 \u53C2\u4F1A\uFF1A${m.participantIds.map((id) => member(id).name).join("\u3001")}`)), /* @__PURE__ */ React.createElement("div", { className: "tc-quick-row" }, /* @__PURE__ */ React.createElement(Icon, { name: "clock", size: 16 }), /* @__PURE__ */ React.createElement("div", null, slots.length ? slots.map((a) => /* @__PURE__ */ React.createElement("p", { key: a.id }, shortDate(a.date), " ", weekday(a.date), a.start ? ` \xB7 ${a.start}\u2013${a.end}` : "")) : "\u5C1A\u672A\u5B89\u6392\u65E5\u671F")), t.kind === "meeting" && m && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "tc-quick-row" }, /* @__PURE__ */ React.createElement(Icon, { name: "calendar", size: 16 }), /* @__PURE__ */ React.createElement("span", null, m.provider === "offline" ? "\u7EBF\u4E0B\u4F1A\u8BAE" : m.provider === "tencent" ? "\u817E\u8BAF\u4F1A\u8BAE" : "\u7EBF\u4E0A\u4F1A\u8BAE", m.location && ` \xB7 ${m.location}`)), /* @__PURE__ */ React.createElement("div", { className: "tc-quick-row" }, /* @__PURE__ */ React.createElement(Icon, { name: "clock", size: 16 }), /* @__PURE__ */ React.createElement("span", null, "\u63D0\u524D ", m.joinBeforeMinutes, " \u5206\u949F", m.provider === "offline" ? "\u51C6\u5907" : "\u8FDB\u4F1A", " \xB7 \u63D0\u524D ", m.reminderMinutes, " \u5206\u949F\u63D0\u9192", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("small", null, remindersOn ? "\u672C\u673A\u63D0\u9192\u5DF2\u5F00\u542F\uFF08\u9875\u9762\u6253\u5F00\u65F6\uFF09" : "\u672C\u673A\u63D0\u9192\u672A\u5F00\u542F"))), m.provider !== "offline" && !m.url && /* @__PURE__ */ React.createElement("p", { className: "tc-form-help" }, "\u4F1A\u8BAE\u94FE\u63A5\u5F85\u8865\u5145", m.provider === "tencent" ? " \xB7 \u817E\u8BAF\u4F1A\u8BAE\u81EA\u52A8\u521B\u5EFA\u672A\u8FDE\u63A5" : "")), t.deliverable && /* @__PURE__ */ React.createElement("p", { className: "tc-quick-note" }, "\u4EA4\u4ED8\u7269 \xB7 ", t.deliverable), t.description && /* @__PURE__ */ React.createElement("p", { className: "tc-quick-note" }, t.description), /* @__PURE__ */ React.createElement("div", { className: "tc-quick-actions" }, t.kind === "meeting" && remindersOn && globalThis.Notification?.permission === "default" && /* @__PURE__ */ React.createElement(Button, { onClick: () => Notification.requestPermission().then(() => setNotice(Notification.permission === "granted" ? "\u7CFB\u7EDF\u901A\u77E5\u5DF2\u5141\u8BB8" : "\u7EE7\u7EED\u4F7F\u7528\u9875\u9762\u5185\u63D0\u9192")) }, "\u5141\u8BB8\u7CFB\u7EDF\u901A\u77E5"), m?.provider !== "offline" && meetingUrl(m?.url) && /* @__PURE__ */ React.createElement("a", { className: "tc-btn tc-primary", href: m.url, target: "_blank", rel: "noopener noreferrer" }, "\u8FDB\u5165\u4F1A\u8BAE"), /* @__PURE__ */ React.createElement(Button, { className: m?.url ? "" : "tc-primary", onClick: () => openTask(t) }, state.role === "viewer" ? "\u67E5\u770B\u5B8C\u6574\u8BE6\u60C5" : "\u7F16\u8F91\u5B89\u6392")));
    }
    function teamMonthView() {
      return /* @__PURE__ */ React.createElement("div", { className: "tc-month-layout" }, /* @__PURE__ */ React.createElement("div", { className: "tc-month-layout-bar" }, /* @__PURE__ */ React.createElement("span", null, monthLayout === "grid" ? "\u6BCF\u65E5\u5B89\u6392" : "\u4EFB\u52A1\u4E0E\u6574\u6708\u6392\u671F"), /* @__PURE__ */ React.createElement("div", { role: "group", "aria-label": "\u6708\u5386\u5E03\u5C40" }, [["grid", "\u6309\u65E5\u671F"], ["people", "\u6309\u6210\u5458"]].map(([id, title]) => /* @__PURE__ */ React.createElement("button", { key: id, type: "button", "aria-pressed": monthLayout === id, className: monthLayout === id ? "is-active" : "", onClick: () => setMonthLayout(id) }, title)))), /* @__PURE__ */ React.createElement("div", { className: "tc-month-layout-body" }, monthLayout === "grid" ? monthView() : teamTimelineView()));
    }
    function teamTimelineView() {
      const schedule = monthSchedule(selected, visibleMembers, visibleTasks, allocations);
      const columns = () => schedule.days.map((d, i) => /* @__PURE__ */ React.createElement("div", { key: d, className: `tc-month-column ${weekday(d) === "\u5468\u516D" || weekday(d) === "\u5468\u65E5" ? "tc-weekend" : ""} ${d === today ? "tc-today-col" : ""}`, style: { gridColumn: i + 1, gridRow: 1 } }));
      return /* @__PURE__ */ React.createElement("div", { className: "tc-team-month" }, /* @__PURE__ */ React.createElement("div", { className: "tc-month-timeline-scroll", tabIndex: 0, role: "region", "aria-label": "\u56E2\u961F\u6574\u6708\u6392\u671F\uFF0C\u53EF\u6A2A\u5411\u6EDA\u52A8" }, /* @__PURE__ */ React.createElement("div", { className: "tc-month-timeline", style: { "--month-days": schedule.days.length } }, /* @__PURE__ */ React.createElement("div", { className: "tc-month-timeline-header" }, /* @__PURE__ */ React.createElement("div", { className: "tc-month-person tc-month-corner" }, "\u6210\u5458 / \u5DE5\u4F5C\u5B89\u6392", /* @__PURE__ */ React.createElement("small", null, visibleMembers.length, " \u4F4D\u6210\u5458")), /* @__PURE__ */ React.createElement("div", { className: "tc-month-track" }, schedule.days.map((d, i) => /* @__PURE__ */ React.createElement("button", { key: d, type: "button", className: `tc-month-head ${weekday(d) === "\u5468\u516D" || weekday(d) === "\u5468\u65E5" ? "tc-weekend" : ""} ${d === today ? "is-today" : ""}`, "aria-label": `\u67E5\u770B${d}\u5B89\u6392`, onClick: () => {
        setSelected(d);
        setView("day");
      }, style: { gridColumn: i + 1 } }, /* @__PURE__ */ React.createElement("span", null, weekday(d).slice(1)), /* @__PURE__ */ React.createElement("strong", null, Number(d.slice(8))))))), schedule.rows.map(({ member: m, segments, taskCount }) => {
        const personTasks = [...new Map(segments.map((segment) => [segment.task.id, segment.task])).values()];
        const personProjects = [...new Set(personTasks.map((t) => t.projectId))];
        return /* @__PURE__ */ React.createElement(React.Fragment, { key: m.id }, /* @__PURE__ */ React.createElement("div", { className: "tc-month-person-row tc-month-group-row" }, /* @__PURE__ */ React.createElement("div", { className: "tc-month-person" }, personAvatar(m), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, m.name), /* @__PURE__ */ React.createElement("small", null, m.role || "\u56E2\u961F\u6210\u5458"))), /* @__PURE__ */ React.createElement("div", { className: "tc-month-member-summary" }, /* @__PURE__ */ React.createElement("strong", null, taskCount, " \u9879\u4EFB\u52A1"), personProjects.map((id) => /* @__PURE__ */ React.createElement("span", { key: id, className: "tc-month-project tc-" + project(id).color }, /* @__PURE__ */ React.createElement("i", null), project(id).name)))), personTasks.map((t) => {
          const p = project(t.projectId), timed = allocations.find((a) => a.taskId === t.id && a.date.slice(0, 7) === selected.slice(0, 7) && a.start);
          return /* @__PURE__ */ React.createElement("div", { key: t.id, className: "tc-month-person-row tc-month-task-row" }, /* @__PURE__ */ React.createElement("button", { className: "tc-month-person tc-month-label tc-" + p.color, "data-task-id": t.id, "aria-expanded": quick?.taskId === t.id, "aria-label": `${t.title}\uFF0C${m.name}\uFF0C${p.name}`, onClick: (e) => showQuick(e, t) }, /* @__PURE__ */ React.createElement("strong", null, t.kind === "meeting" && /* @__PURE__ */ React.createElement(Icon, { name: "users", size: 14 }), " ", t.title), /* @__PURE__ */ React.createElement("small", null, /* @__PURE__ */ React.createElement("i", { className: "tc-project-mark" }), p.name, /* @__PURE__ */ React.createElement("span", null, "\xB7"), /* @__PURE__ */ React.createElement("span", { className: "tc-status tc-status-" + t.status }, statuses[t.status]), timed && /* @__PURE__ */ React.createElement("time", null, timed.start, "\u2013", timed.end))), /* @__PURE__ */ React.createElement("div", { className: "tc-month-track tc-month-task-track" }, columns(), segments.filter((segment) => segment.task.id === t.id).map(({ start, end }) => /* @__PURE__ */ React.createElement("button", { key: start, "data-task-id": t.id, type: "button", className: `tc-month-bar tc-${p.color} ${t.status === "done" ? "is-done" : ""}`, style: { gridColumn: `${start + 1} / ${end + 2}`, gridRow: 1 }, "aria-label": `${t.title}\uFF0C${m.name}\uFF0C${p.name}\uFF0C${shortDate(schedule.days[start])}\u81F3${shortDate(schedule.days[end])}\uFF0C${statuses[t.status]}`, "aria-expanded": quick?.taskId === t.id, title: `${t.title} \xB7 ${shortDate(schedule.days[start])}\u2013${shortDate(schedule.days[end])}`, onClick: (e) => showQuick(e, t, schedule.days[start]) }, t.kind === "meeting" ? /* @__PURE__ */ React.createElement(Icon, { name: "users", size: 14 }) : end > start ? /* @__PURE__ */ React.createElement("span", null, end - start + 1, " \u5929") : /* @__PURE__ */ React.createElement("span", { className: "tc-bar-dot" })))));
        }), !personTasks.length && /* @__PURE__ */ React.createElement("div", { className: "tc-month-person-row tc-month-task-row" }, /* @__PURE__ */ React.createElement("div", { className: "tc-month-person tc-month-empty-label" }, "\u672C\u6708\u6682\u65E0\u5B89\u6392"), /* @__PURE__ */ React.createElement("div", { className: "tc-month-track tc-month-task-track" }, columns())));
      }), !schedule.rows.length && /* @__PURE__ */ React.createElement("p", { className: "tc-empty" }, "\u6CA1\u6709\u5339\u914D\u7684\u6210\u5458"))));
    }
    function taskCard(t, a, compact = false) {
      const p = project(t.projectId);
      return /* @__PURE__ */ React.createElement("button", { key: a?.id || t.id, type: "button", className: `tc-task tc-${p.color} ${t.status === "done" ? "is-done" : ""} ${compact ? "is-compact" : ""}`, "data-task-id": t.id, "aria-expanded": quick?.taskId === t.id, onClick: (e) => showQuick(e, t, a?.date), draggable: !!a && !saving && state?.role !== "viewer", onDragStart: (e) => e.dataTransfer.setData("text/calendar-allocation", a.id), "aria-label": `${t.title}\uFF0C${p.name}\uFF0C${statuses[t.status]}` }, /* @__PURE__ */ React.createElement("span", { className: "tc-task-project" }, /* @__PURE__ */ React.createElement("i", null), p.name), /* @__PURE__ */ React.createElement("strong", null, t.kind === "meeting" && /* @__PURE__ */ React.createElement(Icon, { name: "users", size: 13 }), " ", t.title), /* @__PURE__ */ React.createElement("span", { className: "tc-task-meta" }, a?.start ? /* @__PURE__ */ React.createElement("span", { className: "tc-task-time" }, /* @__PURE__ */ React.createElement(Icon, { name: "clock", size: 13 }), a.start, "\u2013", a.end) : /* @__PURE__ */ React.createElement("span", null, t.kind === "meeting" ? "\u4F1A\u8BAE" : ""), /* @__PURE__ */ React.createElement("span", { className: "tc-status tc-status-" + t.status }, t.status === "done" && /* @__PURE__ */ React.createElement(Icon, { name: "check", size: 12 }), " ", statuses[t.status])));
    }
    function personAvatar(m) {
      return /* @__PURE__ */ React.createElement("span", { className: "tc-avatar tc-avatar-" + members.indexOf(m) % 4 }, m.initial);
    }
    function miniCalendar() {
      const first = selected.slice(0, 8) + "01", start = monday(first), month = Number(selected.slice(5, 7));
      return /* @__PURE__ */ React.createElement("div", { className: "tc-mini" }, /* @__PURE__ */ React.createElement("div", { className: "tc-mini-title" }, /* @__PURE__ */ React.createElement("strong", null, selected.slice(0, 4), "\u5E74", month, "\u6708"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Button, { icon: "chevron", label: "\u4E0A\u4E00\u6708", className: "tc-prev tc-tiny", onClick: () => setSelected(addDays(first, -1)) }), /* @__PURE__ */ React.createElement(Button, { icon: "chevron", label: "\u4E0B\u4E00\u6708", className: "tc-tiny", onClick: () => {
        const d = /* @__PURE__ */ new Date(first + "T12:00Z");
        d.setUTCMonth(d.getUTCMonth() + 1);
        setSelected(d.toISOString().slice(0, 10));
      } }))), /* @__PURE__ */ React.createElement("div", { className: "tc-mini-grid" }, ["\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u65E5"].map((d) => /* @__PURE__ */ React.createElement("span", { key: d, className: "tc-mini-weekday" }, d)), range(start, 42).map((d) => /* @__PURE__ */ React.createElement("button", { type: "button", key: d, "aria-label": d, "aria-pressed": d === selected, className: `${d.slice(5, 7) !== selected.slice(5, 7) ? "is-muted" : ""} ${d === today ? "is-today" : ""} ${d === selected ? "is-selected" : ""}`, onClick: () => setSelected(d) }, Number(d.slice(8))))));
    }
    function weekView() {
      return /* @__PURE__ */ React.createElement("div", { className: "tc-grid-scroll" }, /* @__PURE__ */ React.createElement("div", { className: "tc-week-grid" }, /* @__PURE__ */ React.createElement("div", { className: "tc-week-head tc-member-heading" }, "\u56E2\u961F\u6210\u5458 ", /* @__PURE__ */ React.createElement("small", null, visibleMembers.length, "\u4EBA")), days.map((d, i) => /* @__PURE__ */ React.createElement("div", { key: d, className: `tc-week-head ${i > 4 ? "tc-weekend" : ""} ${d === today ? "tc-today-col" : ""}` }, /* @__PURE__ */ React.createElement("span", null, weekday(d)), /* @__PURE__ */ React.createElement("button", { type: "button", className: "tc-day-number " + (d === today ? "is-today" : ""), onClick: () => {
        setSelected(d);
        setView("day");
      }, "aria-label": `\u67E5\u770B${d}\u5B89\u6392` }, Number(d.slice(8))), d === today && /* @__PURE__ */ React.createElement("small", null, "\u4ECA\u5929"))), visibleMembers.map((m) => /* @__PURE__ */ React.createElement(React.Fragment, { key: m.id }, /* @__PURE__ */ React.createElement("div", { className: "tc-person" }, personAvatar(m), /* @__PURE__ */ React.createElement("strong", null, m.name), /* @__PURE__ */ React.createElement("span", null, m.role || "\u56E2\u961F\u6210\u5458"), /* @__PURE__ */ React.createElement("small", null, new Set(allocations.filter((a) => days.includes(a.date) && visibleTasks.some((t) => t.id === a.taskId && belongs(t, m.id))).map((a) => a.taskId)).size, " \u9879\u5B89\u6392")), days.map((d, i) => /* @__PURE__ */ React.createElement("div", { key: d, className: `tc-cell ${i > 4 ? "tc-weekend" : ""} ${d === today ? "tc-today-col" : ""}`, onDragOver: (e) => e.preventDefault(), onDrop: (e) => drop(e, d, m.id) }, entries(d, m.id).map(({ t, a }) => taskCard(t, a)))))), !visibleMembers.length && /* @__PURE__ */ React.createElement("div", { className: "tc-empty" }, "\u6CA1\u6709\u5339\u914D\u7684\u6210\u5458")));
    }
    function dayView() {
      return /* @__PURE__ */ React.createElement("div", { className: "tc-day-view" }, /* @__PURE__ */ React.createElement("div", { className: "tc-day-intro" }, /* @__PURE__ */ React.createElement("span", null, weekday(selected)), /* @__PURE__ */ React.createElement("h2", null, shortDate(selected), "\u7684\u5B89\u6392"), /* @__PURE__ */ React.createElement("p", null, entries(selected).length, " \u9879\u5DE5\u4F5C \xB7 \u6240\u6709\u9009\u4E2D\u9879\u76EE")), visibleMembers.map((m) => /* @__PURE__ */ React.createElement("section", { key: m.id, className: "tc-day-person" }, /* @__PURE__ */ React.createElement("div", { className: "tc-day-person-head" }, personAvatar(m), /* @__PURE__ */ React.createElement("strong", null, m.name), /* @__PURE__ */ React.createElement("span", null, m.role)), /* @__PURE__ */ React.createElement("div", { className: "tc-day-tasks" }, entries(selected, m.id).map(({ t, a }) => taskCard(t, a)), !entries(selected, m.id).length && /* @__PURE__ */ React.createElement("p", { className: "tc-quiet" }, "\u5F53\u5929\u6682\u65E0\u5B89\u6392")))));
    }
    function monthView() {
      const first = selected.slice(0, 8) + "01", start = monday(first);
      return /* @__PURE__ */ React.createElement("div", { className: "tc-month-view" }, /* @__PURE__ */ React.createElement("div", { className: "tc-month-weekdays" }, ["\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u65E5"].map((d) => /* @__PURE__ */ React.createElement("span", { key: d }, "\u5468", d))), /* @__PURE__ */ React.createElement("div", { className: "tc-month-grid" }, range(start, 42).map((d) => {
        const list = entries(d);
        return /* @__PURE__ */ React.createElement("div", { key: d, className: `tc-month-cell ${d.slice(5, 7) !== selected.slice(5, 7) ? "is-muted" : ""} ${d === today ? "is-today" : ""}`, onDragOver: (e) => e.preventDefault(), onDrop: (e) => drop(e, d) }, /* @__PURE__ */ React.createElement("div", { className: "tc-month-cell-head" }, /* @__PURE__ */ React.createElement("button", { type: "button", "aria-label": `\u67E5\u770B${d}\u5B89\u6392`, className: "tc-month-date " + (d === today ? "is-today" : ""), onClick: () => {
          setSelected(d);
          setView("day");
        } }, Number(d.slice(8))), list.length > 0 && /* @__PURE__ */ React.createElement("span", null, list.length, " \u9879\u5B89\u6392")), list.slice(0, 2).map(({ t, a }) => /* @__PURE__ */ React.createElement("button", { type: "button", key: a.id, className: "tc-month-task tc-" + project(t.projectId).color, "data-task-id": t.id, "aria-label": `${t.title}\uFF0C${member(t.assigneeId).name}\uFF0C${project(t.projectId).name}`, "aria-expanded": quick?.taskId === t.id, onClick: (e) => showQuick(e, t, d), title: `${member(t.assigneeId).name} \xB7 ${t.title}` }, /* @__PURE__ */ React.createElement("span", { className: "tc-month-event-head" }, /* @__PURE__ */ React.createElement("span", { className: "tc-month-event-person" }, member(t.assigneeId).name), a.start && /* @__PURE__ */ React.createElement("time", null, a.start), t.kind === "meeting" && /* @__PURE__ */ React.createElement(Icon, { name: "users", size: 12 })), /* @__PURE__ */ React.createElement("strong", null, t.title))), list.length > 2 && /* @__PURE__ */ React.createElement("button", { type: "button", className: "tc-more", onClick: () => {
          setSelected(d);
          setView("day");
        } }, "\u8FD8\u6709 ", list.length - 2, " \u9879\u5B89\u6392 ", /* @__PURE__ */ React.createElement(Icon, { name: "chevron", size: 11 })));
      })));
    }
    return /* @__PURE__ */ React.createElement("div", { ref: rootRef, className: `tc ${preview ? "tc-preview" : ""} ${dark ? "tc-dark" : ""}` }, /* @__PURE__ */ React.createElement("style", null, styles), /* @__PURE__ */ React.createElement("aside", { className: "tc-sidebar " + (navOpen ? "is-open" : ""), "aria-label": "\u65E5\u5386\u7B5B\u9009" }, /* @__PURE__ */ React.createElement("div", { className: "tc-workspace" }, /* @__PURE__ */ React.createElement("span", { className: "tc-workspace-dot" }), state?.name || "\u8BBE\u8BA1\u56E2\u961F", /* @__PURE__ */ React.createElement("span", null, members.length, " \u4F4D\u6210\u5458"), /* @__PURE__ */ React.createElement(Button, { className: "tc-sidebar-close", icon: "close", label: "\u5173\u95ED\u6210\u5458\u4E0E\u9879\u76EE\u7B5B\u9009", onClick: () => setNavOpen(false) })), /* @__PURE__ */ React.createElement("details", { className: "tc-date-picker", open: true }, /* @__PURE__ */ React.createElement("summary", null, /* @__PURE__ */ React.createElement(Icon, { name: "calendar", size: 16 }), /* @__PURE__ */ React.createElement("span", null, "\u8DF3\u8F6C\u65E5\u671F"), /* @__PURE__ */ React.createElement(Icon, { name: "chevron", size: 14 })), miniCalendar()), /* @__PURE__ */ React.createElement("section", { className: "tc-filter-section" }, /* @__PURE__ */ React.createElement("div", { className: "tc-section-title" }, "\u9879\u76EE\u65E5\u5386", /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => setProjectFilter(null) }, "\u5168\u90E8")), projects.map((p) => /* @__PURE__ */ React.createElement("label", { key: p.id, className: "tc-filter-row" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: projectFilter === null || projectFilter.includes(p.id), onChange: () => {
      if (projectFilter === null) setProjectFilter(projects.filter((x) => x.id !== p.id).map((x) => x.id));
      else toggle(projectFilter, setProjectFilter, p.id);
    } }), /* @__PURE__ */ React.createElement("span", { className: "tc-project-mark tc-" + p.color }), /* @__PURE__ */ React.createElement("span", null, p.name), /* @__PURE__ */ React.createElement("small", null, tasks.filter((t) => t.projectId === p.id).length)))), /* @__PURE__ */ React.createElement("section", { className: "tc-filter-section" }, /* @__PURE__ */ React.createElement("div", { className: "tc-section-title" }, "\u56E2\u961F\u6210\u5458", /* @__PURE__ */ React.createElement("span", { className: "tc-filter-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", disabled: !selfMember, title: selfMember ? `\u53EA\u770B${selfMember.name}\u7684\u5B89\u6392` : "\u5F53\u524D\u8FDE\u63A5\u5C1A\u672A\u5173\u8054\u65E5\u5386\u6210\u5458", "aria-pressed": onlyMe, onClick: () => {
      if (selfMember) setMemberFilter([selfMember.id]);
    } }, "\u53EA\u770B\u6211"), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => setMemberFilter(null) }, "\u5168\u90E8"))), members.map((m) => /* @__PURE__ */ React.createElement("label", { key: m.id, className: "tc-filter-row tc-member-filter" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: memberFilter === null || memberFilter.includes(m.id), onChange: () => {
      if (memberFilter === null) setMemberFilter(members.filter((x) => x.id !== m.id).map((x) => x.id));
      else toggle(memberFilter, setMemberFilter, m.id);
    } }), personAvatar(m), /* @__PURE__ */ React.createElement("span", null, m.name)))), state?.role === "owner" && /* @__PURE__ */ React.createElement(Button, { className: "tc-sidebar-manage", onClick: openSettings }, "\u7BA1\u7406\u6210\u5458\u4E0E\u9879\u76EE"), /* @__PURE__ */ React.createElement("p", { className: "tc-identity-hint" }, selfMember ? `\u5F53\u524D\u6210\u5458 \xB7 ${selfMember.name}` : "\u5F53\u524D\u8FDE\u63A5\u672A\u5173\u8054\u6210\u5458"), /* @__PURE__ */ React.createElement("div", { className: "tc-sidebar-bottom" }, /* @__PURE__ */ React.createElement(Icon, { name: "clock", size: 14 }), /* @__PURE__ */ React.createElement("span", null, "Asia/Shanghai"), /* @__PURE__ */ React.createElement("span", { className: state && !connectionError ? "tc-connected-dot" : "" }), connectionError ? "\u672A\u8FDE\u63A5" : state ? "\u5DF2\u8FDE\u63A5" : "\u8FDE\u63A5\u4E2D")), /* @__PURE__ */ React.createElement("main", { className: "tc-main" }, /* @__PURE__ */ React.createElement("header", { className: "tc-header" }, /* @__PURE__ */ React.createElement("div", { className: "tc-heading" }, /* @__PURE__ */ React.createElement(Button, { icon: "users", className: "tc-mobile-toggle", label: "\u6253\u5F00\u6210\u5458\u4E0E\u9879\u76EE\u7B5B\u9009", onClick: () => setNavOpen(!navOpen) }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "\u56E2\u961F\u65E5\u5386")), state?.demo && /* @__PURE__ */ React.createElement("span", { className: "tc-demo-badge" }, "\u793A\u4F8B\u6570\u636E")), /* @__PURE__ */ React.createElement("div", { className: "tc-header-actions" }, /* @__PURE__ */ React.createElement(Button, { icon: "clock", label: !selfMember ? "\u5173\u8054\u5F53\u524D\u7528\u6237\u540E\u53EF\u5F00\u542F\u4E2A\u4EBA\u4F1A\u8BAE\u63D0\u9192" : remindersOn ? "\u5173\u95ED\u672C\u673A\u4F1A\u8BAE\u63D0\u9192" : "\u5F00\u542F\u672C\u673A\u4F1A\u8BAE\u63D0\u9192\uFF08\u9875\u9762\u6253\u5F00\u65F6\uFF09", disabled: !selfMember, "aria-pressed": remindersOn, onClick: enableReminders }), preview && /* @__PURE__ */ React.createElement(Button, { icon: dark ? "sun" : "moon", label: "\u5207\u6362\u660E\u6697\u4E3B\u9898", onClick: () => setDark(!dark) }), /* @__PURE__ */ React.createElement(Button, { icon: "refresh", label: "\u5237\u65B0\u5B89\u6392", onClick: reload, disabled: loading || saving }), /* @__PURE__ */ React.createElement(Button, { icon: "import", onClick: openImport, disabled: !state || saving || state.role === "viewer" }, "\u5BFC\u5165\u5468\u8BA1\u5212"), /* @__PURE__ */ React.createElement(Button, { className: "tc-primary", icon: "plus", onClick: () => openTask(null, selected), disabled: !state || saving || state.role === "viewer" }, "\u65B0\u5EFA\u5B89\u6392"))), /* @__PURE__ */ React.createElement("div", { className: "tc-toolbar" }, /* @__PURE__ */ React.createElement("div", { className: "tc-date-nav" }, /* @__PURE__ */ React.createElement("h2", null, selected.slice(0, 4), "\u5E74", /* @__PURE__ */ React.createElement("span", null, Number(selected.slice(5, 7)), "\u6708")), /* @__PURE__ */ React.createElement(Button, { onClick: () => setSelected(today) }, "\u4ECA\u5929"), /* @__PURE__ */ React.createElement("div", { className: "tc-prev-next" }, /* @__PURE__ */ React.createElement(Button, { icon: "chevron", className: "tc-prev", label: "\u4E0A\u4E00\u4E2A\u65E5\u671F\u8303\u56F4", onClick: () => setSelected(isMonth ? shiftMonth(selected, -1) : addDays(selected, view === "week" ? -7 : -1)) }), /* @__PURE__ */ React.createElement(Button, { icon: "chevron", label: "\u4E0B\u4E00\u4E2A\u65E5\u671F\u8303\u56F4", onClick: () => setSelected(isMonth ? shiftMonth(selected, 1) : addDays(selected, view === "week" ? 7 : 1)) })), /* @__PURE__ */ React.createElement("span", { className: "tc-date-range" }, view === "week" ? `${shortDate(week)} \u2014 ${shortDate(addDays(week, 6))}` : view === "day" ? weekday(selected) : view === "team-month" ? "\u56E2\u961F\u6574\u6708\u6392\u671F" : "\u6708\u5EA6\u5B89\u6392")), /* @__PURE__ */ React.createElement("div", { className: "tc-view-switch", role: "group", "aria-label": "\u65E5\u5386\u89C6\u56FE" }, [["day", "\u65E5"], ["week", "\u5468"], ["team-month", "\u6708"]].map(([id, title]) => /* @__PURE__ */ React.createElement("button", { type: "button", key: id, "aria-pressed": view === id, className: view === id ? "is-active" : "", onClick: () => setView(id) }, title)))), /* @__PURE__ */ React.createElement("div", { className: "tc-context-bar" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, view === "week" ? "\u5468\u5B89\u6392" : view === "day" ? "\u5F53\u65E5\u5B89\u6392" : "\u6708\u5B89\u6392"), /* @__PURE__ */ React.createElement("span", null, view === "week" ? weekCount : new Set(allocations.filter((a) => (view === "day" ? a.date === selected : a.date.slice(0, 7) === selected.slice(0, 7)) && visibleTasks.some((t) => t.id === a.taskId)).map((a) => a.taskId)).size, " \u9879\u4EFB\u52A1"), /* @__PURE__ */ React.createElement("span", { className: "tc-divider" }, "/"), /* @__PURE__ */ React.createElement("span", null, projectFilter?.length ?? projects.length, " \u4E2A\u9879\u76EE")), /* @__PURE__ */ React.createElement("label", { className: "tc-search" }, /* @__PURE__ */ React.createElement(Icon, { name: "search", size: 15 }), /* @__PURE__ */ React.createElement("input", { "aria-label": "\u641C\u7D22\u4EFB\u52A1\u3001\u6210\u5458\u6216\u9879\u76EE", placeholder: "\u641C\u7D22\u4EFB\u52A1\u3001\u6210\u5458\u6216\u9879\u76EE", value: query, onChange: (e) => setQuery(e.target.value) }), query && /* @__PURE__ */ React.createElement("button", { type: "button", "aria-label": "\u6E05\u9664\u641C\u7D22", onClick: () => setQuery("") }, "\xD7"))), error && !draft && /* @__PURE__ */ React.createElement("div", { className: "tc-alert", role: "alert" }, error), notice && /* @__PURE__ */ React.createElement("div", { className: "tc-notice", role: "status" }, /* @__PURE__ */ React.createElement(Icon, { name: "check", size: 16 }), notice), /* @__PURE__ */ React.createElement("div", { className: "tc-content" }, state && !state.demo && !tasks.length && /* @__PURE__ */ React.createElement("section", { className: "tc-workspace-intro", "aria-label": "\u5F00\u59CB\u5B89\u6392" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "\u5F00\u59CB\u5B89\u6392\u56E2\u961F\u5DE5\u4F5C"), /* @__PURE__ */ React.createElement("p", null, state.role === "owner" ? "\u5728\u5DE6\u4FA7\u7BA1\u7406\u6210\u5458\u4E0E\u9879\u76EE\uFF0C\u518D\u70B9\u51FB\u53F3\u4E0A\u89D2\u300C\u65B0\u5EFA\u5B89\u6392\u300D\u3002" : state.role === "viewer" ? "\u56E2\u961F\u5B89\u6392\u5C06\u5728\u8FD9\u91CC\u663E\u793A\uFF0C\u53EF\u901A\u8FC7\u5DE6\u4FA7\u7B5B\u9009\u6210\u5458\u4E0E\u9879\u76EE\u3002" : "\u70B9\u51FB\u53F3\u4E0A\u89D2\u300C\u65B0\u5EFA\u5B89\u6392\u300D\uFF0C\u5C06\u5DE5\u4F5C\u548C\u4F1A\u8BAE\u653E\u8FDB\u65E5\u5386\u3002"))), !state ? /* @__PURE__ */ React.createElement("div", { className: "tc-empty" }, loading ? "\u6B63\u5728\u8BFB\u53D6\u56E2\u961F\u5B89\u6392\u2026" : "\u672A\u80FD\u8FDE\u63A5\u65E5\u5386\u670D\u52A1", !loading && /* @__PURE__ */ React.createElement("span", null, "\u8BF7\u70B9\u51FB\u53F3\u4E0A\u89D2\u5237\u65B0\u91CD\u65B0\u8FDE\u63A5")) : view === "week" ? weekView() : view === "day" ? dayView() : view === "team-month" ? teamMonthView() : monthView()), state && pendingTasks.length > 0 && /* @__PURE__ */ React.createElement("section", { className: "tc-pending" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "tc-pending-label" }, "\u5F85\u5B89\u6392 ", /* @__PURE__ */ React.createElement("b", null, pendingTasks.length)), /* @__PURE__ */ React.createElement("span", null, "\u9009\u4E2A\u65E5\u671F\uFF0C\u653E\u8FDB\u65E5\u5386")), /* @__PURE__ */ React.createElement("div", { className: "tc-pending-items" }, pendingTasks.slice(0, 5).map((t) => /* @__PURE__ */ React.createElement("button", { type: "button", key: t.id, onClick: () => openTask(t) }, /* @__PURE__ */ React.createElement("i", { className: "tc-project-mark tc-" + project(t.projectId).color }), t.title, /* @__PURE__ */ React.createElement("small", null, member(t.assigneeId).name), /* @__PURE__ */ React.createElement(Icon, { name: "chevron", size: 14 }))))), /* @__PURE__ */ React.createElement("footer", { className: "tc-footer" }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("i", { className: state && !connectionError ? "tc-connected-dot" : "" }), connectionError ? "\u8FDE\u63A5\u5F85\u68C0\u67E5" : loading ? "\u6B63\u5728\u540C\u6B65" : saving ? "\u6B63\u5728\u4FDD\u5B58" : state ? "\u5B89\u6392\u5DF2\u4FDD\u5B58" : "\u672A\u8FDE\u63A5"), /* @__PURE__ */ React.createElement("span", null, state?.demo ? "\u5F53\u524D\u4E3A\u793A\u4F8B\u5B89\u6392" : "\u56E2\u961F\u5DE5\u4F5C\u533A", " \xB7 ", state?.timezone || "Asia/Shanghai"))), quick && quickView(), reminder && /* @__PURE__ */ React.createElement("section", { className: "tc-reminder", role: "alert" }, /* @__PURE__ */ React.createElement("strong", null, reminder.title), /* @__PURE__ */ React.createElement("p", null, reminder.message), meetingUrl(reminder.url) && /* @__PURE__ */ React.createElement("a", { className: "tc-btn tc-primary", href: reminder.url, target: "_blank", rel: "noopener noreferrer" }, "\u8FDB\u5165\u4F1A\u8BAE"), /* @__PURE__ */ React.createElement(Button, { onClick: () => setReminderQueue((queue) => queue.slice(1)) }, "\u5173\u95ED\u63D0\u9192")), draft && /* @__PURE__ */ React.createElement("aside", { className: "tc-detail", "aria-label": draft.mode === "import" ? "\u5BFC\u5165\u5468\u8BA1\u5212" : draft.mode === "settings" ? "\u9879\u76EE\u4E0E\u6210\u5458" : "\u4EFB\u52A1\u8BE6\u60C5" }, /* @__PURE__ */ React.createElement("div", { className: "tc-detail-header" }, /* @__PURE__ */ React.createElement("span", null, draft.mode === "import" ? "\u5BFC\u5165\u5468\u8BA1\u5212" : draft.mode === "settings" ? "\u9879\u76EE\u4E0E\u6210\u5458" : draft.isNew ? "\u65B0\u5EFA\u5B89\u6392" : "\u4EFB\u52A1\u8BE6\u60C5"), /* @__PURE__ */ React.createElement(Button, { icon: "close", label: "\u5173\u95ED\u8BE6\u60C5", onClick: () => {
      setDraft(null);
      setError("");
    }, disabled: saving })), error && /* @__PURE__ */ React.createElement("div", { className: "tc-panel-error", role: "alert" }, error, draft.baseRevision !== state.revision && /* @__PURE__ */ React.createElement(Button, { disabled: saving, onClick: loadLatestDraft }, draft.isNew ? "\u8F7D\u5165\u6700\u65B0\u7248\u672C\uFF08\u4FDD\u7559\u65B0\u5B89\u6392\uFF09" : "\u8F7D\u5165\u6700\u65B0\u5185\u5BB9\uFF08\u66FF\u6362\u8349\u7A3F\uFF09")), draft.mode === "settings" ? /* @__PURE__ */ React.createElement(PanelForm, { className: "tc-form", onSubmit: (e) => {
      e.preventDefault();
      if (!pending.current) pending.current = { action: "configure", members: draft.members, projects: draft.projects, expectedRevision: draft.baseRevision, requestId: uid() };
      write(pending.current);
    } }, /* @__PURE__ */ React.createElement("h2", null, "\u9879\u76EE\u4E0E\u6210\u5458"), /* @__PURE__ */ React.createElement("p", { className: "tc-form-help" }, "\u4E3A\u65E5\u5386\u6DFB\u52A0\u9879\u76EE\u548C\u6210\u5458\uFF0C\u5DF2\u6709\u4EFB\u52A1\u7EE7\u7EED\u5173\u8054\u539F\u6765\u7684\u8EAB\u4EFD\u3002"), /* @__PURE__ */ React.createElement("section", null, /* @__PURE__ */ React.createElement("div", { className: "tc-section-title" }, "\u9879\u76EE", /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => changeDraft("projects", [...draft.projects, { id: "project-" + uid(), name: "", color: "blue" }]) }, "\uFF0B \u6DFB\u52A0\u9879\u76EE")), draft.projects.map((p, i) => /* @__PURE__ */ React.createElement("div", { className: "tc-form-pair tc-settings-row", key: p.id }, /* @__PURE__ */ React.createElement("label", null, "\u9879\u76EE\u540D\u79F0", /* @__PURE__ */ React.createElement("input", { required: true, value: p.name, onChange: (e) => changeDraft("projects", draft.projects.map((x, j) => j === i ? { ...x, name: e.target.value } : x)) })), /* @__PURE__ */ React.createElement("label", null, "\u989C\u8272", /* @__PURE__ */ React.createElement("select", { value: p.color, onChange: (e) => changeDraft("projects", draft.projects.map((x, j) => j === i ? { ...x, color: e.target.value } : x)) }, /* @__PURE__ */ React.createElement("option", { value: "blue" }, "\u84DD\u8272"), /* @__PURE__ */ React.createElement("option", { value: "purple" }, "\u7D2B\u8272"), /* @__PURE__ */ React.createElement("option", { value: "amber" }, "\u7425\u73C0\u8272")))))), /* @__PURE__ */ React.createElement("section", null, /* @__PURE__ */ React.createElement("div", { className: "tc-section-title" }, "\u6210\u5458", /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => changeDraft("members", [...draft.members, { id: "member-" + uid(), name: "", role: "" }]) }, "\uFF0B \u6DFB\u52A0\u6210\u5458")), draft.members.map((m, i) => /* @__PURE__ */ React.createElement("section", { className: "tc-member-setting", key: m.id }, /* @__PURE__ */ React.createElement("div", { className: "tc-form-pair tc-settings-row" }, /* @__PURE__ */ React.createElement("label", null, "\u6210\u5458\u59D3\u540D", /* @__PURE__ */ React.createElement("input", { required: true, value: m.name, onChange: (e) => changeDraft("members", draft.members.map((x, j) => j === i ? { ...x, name: e.target.value } : x)) })), /* @__PURE__ */ React.createElement("label", null, "\u804C\u8D23", /* @__PURE__ */ React.createElement("input", { value: m.role || "", onChange: (e) => changeDraft("members", draft.members.map((x, j) => j === i ? { ...x, role: e.target.value } : x)) }))), /* @__PURE__ */ React.createElement("label", { className: "tc-member-binding" }, "Buzz \u7528\u6237\u516C\u94A5", /* @__PURE__ */ React.createElement("input", { "aria-label": `Buzz \u7528\u6237\u516C\u94A5\uFF1A${m.name}`, maxLength: 64, value: m.buzzPubkey || "", placeholder: "\u53EF\u7559\u7A7A\uFF0C\u5173\u8054\u540E\u53EF\u8BC6\u522B\u4E2A\u4EBA\u5B89\u6392", onChange: (e) => changeDraft("members", draft.members.map((x, j) => j === i ? { ...x, buzzPubkey: e.target.value } : x)) }), state.currentUserPubkey && /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => changeDraft("members", draft.members.map((x, j) => j === i ? { ...x, buzzPubkey: state.currentUserPubkey } : x)) }, "\u5173\u8054\u5F53\u524D\u7528\u6237"))))), /* @__PURE__ */ React.createElement("div", { className: "tc-form-actions" }, /* @__PURE__ */ React.createElement("button", { type: "submit", className: "tc-btn tc-primary", disabled: saving }, saving ? "\u6B63\u5728\u4FDD\u5B58\u2026" : "\u4FDD\u5B58\u9879\u76EE\u4E0E\u6210\u5458"))) : draft.mode === "import" ? /* @__PURE__ */ React.createElement(PanelForm, { onSubmit: importPlan, className: "tc-form" }, /* @__PURE__ */ React.createElement("div", { className: "tc-detail-kicker" }, "\u5468\u8BA1\u5212 \u2192 \u6BCF\u65E5\u5B89\u6392"), /* @__PURE__ */ React.createElement("h2", null, "\u628A\u5DE5\u4F5C\u653E\u8FDB\u8FD9\u4E00\u5468"), /* @__PURE__ */ React.createElement("p", { className: "tc-form-help" }, "\u6BCF\u884C\u4E00\u9879\u5DE5\u4F5C\uFF0C\u7528\u7AD6\u7EBF\u5206\u9694\u3002\u76F8\u540C\u4EFB\u52A1\u7F16\u53F7\u4F1A\u66F4\u65B0\u5DF2\u6709\u4EFB\u52A1\u3002"), /* @__PURE__ */ React.createElement(Button, { onClick: importExample }, "\u8F7D\u5165\u683C\u5F0F\u793A\u4F8B"), /* @__PURE__ */ React.createElement("p", { className: "tc-form-help" }, "\u7F16\u53F7 | \u4EFB\u52A1 | \u9879\u76EE | \u8D1F\u8D23\u4EBA | \u65E5\u671F | \u4EA4\u4ED8\u7269", /* @__PURE__ */ React.createElement("br", null), "\u591A\u4E2A\u65E5\u671F\u7528\u9017\u53F7\u5206\u9694\uFF0C\u65E5\u671F\u7559\u7A7A\u5219\u8FDB\u5165\u5F85\u5B89\u6392\u3002"), /* @__PURE__ */ React.createElement("label", null, "\u5468\u8BA1\u5212\u5185\u5BB9", /* @__PURE__ */ React.createElement("textarea", { ref: formFocus, required: true, value: importText, onChange: (e) => {
      setImportText(e.target.value);
      pending.current = null;
    }, rows: 20, className: "tc-json-input", placeholder: "W001 | \u5B8C\u6210\u5206\u955C | \u54C1\u724C\u77ED\u7247 | \u6D9B\u5B50 | 2026-11-16 | \u5206\u955C\u7A3F" })), /* @__PURE__ */ React.createElement("div", { className: "tc-form-actions" }, /* @__PURE__ */ React.createElement("button", { className: "tc-btn tc-primary", type: "submit", disabled: saving || !importText }, saving ? "\u6B63\u5728\u4FDD\u5B58\u2026" : "\u5BFC\u5165\u65E5\u5386"))) : /* @__PURE__ */ React.createElement(PanelForm, { onSubmit: saveTask, className: "tc-form" }, /* @__PURE__ */ React.createElement("div", { className: "tc-detail-kicker tc-" + project(draft.projectId).color }, project(draft.projectId).name), /* @__PURE__ */ React.createElement("label", null, "\u5B89\u6392\u7C7B\u578B", /* @__PURE__ */ React.createElement("select", { value: draft.kind || "task", onChange: (e) => {
      changeDraft("kind", e.target.value);
      if (e.target.value === "meeting" && !draft.meeting) changeDraft("meeting", { provider: "tencent", url: "", location: "", participantIds: [], joinBeforeMinutes: 5, reminderMinutes: 10 });
    } }, /* @__PURE__ */ React.createElement("option", { value: "task" }, "\u5DE5\u4F5C\u4EFB\u52A1"), /* @__PURE__ */ React.createElement("option", { value: "meeting" }, "\u4F1A\u8BAE"))), /* @__PURE__ */ React.createElement("label", { className: "tc-title-label" }, draft.kind === "meeting" ? "\u4F1A\u8BAE\u4E3B\u9898" : "\u4EFB\u52A1\u6807\u9898", /* @__PURE__ */ React.createElement("input", { ref: formFocus, required: true, maxLength: 200, className: "tc-title-input", value: draft.title, onChange: (e) => changeDraft("title", e.target.value), placeholder: "\u8FD9\u9879\u5DE5\u4F5C\u8981\u5B8C\u6210\u4EC0\u4E48\uFF1F" })), /* @__PURE__ */ React.createElement("div", { className: "tc-form-pair" }, /* @__PURE__ */ React.createElement("label", null, "\u6240\u5C5E\u9879\u76EE", /* @__PURE__ */ React.createElement("select", { value: draft.projectId, onChange: (e) => changeDraft("projectId", e.target.value) }, projects.map((p) => /* @__PURE__ */ React.createElement("option", { key: p.id, value: p.id }, p.name)))), /* @__PURE__ */ React.createElement("label", null, "\u8D1F\u8D23\u4EBA", /* @__PURE__ */ React.createElement("select", { value: draft.assigneeId, onChange: (e) => changeDraft("assigneeId", e.target.value) }, members.map((m) => /* @__PURE__ */ React.createElement("option", { key: m.id, value: m.id }, m.name))))), /* @__PURE__ */ React.createElement("div", { className: "tc-form-pair" }, /* @__PURE__ */ React.createElement("label", null, "\u4EFB\u52A1\u72B6\u6001", /* @__PURE__ */ React.createElement("select", { value: draft.status, onChange: (e) => changeDraft("status", e.target.value) }, Object.entries(statuses).map(([id, title]) => /* @__PURE__ */ React.createElement("option", { key: id, value: id }, title)))), /* @__PURE__ */ React.createElement("label", null, "\u622A\u6B62\u65E5\u671F", /* @__PURE__ */ React.createElement("input", { type: "date", value: draft.dueDate || "", onChange: (e) => changeDraft("dueDate", e.target.value) }))), /* @__PURE__ */ React.createElement("section", { className: "tc-schedule-editor" }, /* @__PURE__ */ React.createElement("div", { className: "tc-section-title" }, "\u6BCF\u65E5\u5B89\u6392 ", /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => changeDraft("allocations", [...draft.allocations, { id: uid(), date: selected }]) }, "\uFF0B \u6DFB\u52A0\u65E5\u671F")), !draft.allocations.length && /* @__PURE__ */ React.createElement("p", { className: "tc-form-help" }, "\u5C1A\u672A\u6392\u671F\uFF0C\u53EF\u6DFB\u52A0\u65E5\u671F\u540E\u663E\u793A\u5728\u65E5\u5386\u4E2D\u3002"), draft.allocations.map((a, i) => /* @__PURE__ */ React.createElement("div", { className: "tc-allocation-editor", key: a.id }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("input", { "aria-label": `\u5B89\u6392\u65E5\u671F${i + 1}`, required: true, type: "date", value: a.date, onChange: (e) => changeDraft("allocations", draft.allocations.map((x, j) => j === i ? { ...x, date: e.target.value } : x)) }), /* @__PURE__ */ React.createElement("button", { type: "button", "aria-label": `\u79FB\u9664\u65E5\u671F${i + 1}`, onClick: () => changeDraft("allocations", draft.allocations.filter((_, j) => i !== j)) }, /* @__PURE__ */ React.createElement(Icon, { name: "close", size: 14 }))), /* @__PURE__ */ React.createElement("div", { className: "tc-time-edit" }, /* @__PURE__ */ React.createElement("input", { required: draft.kind === "meeting", "aria-label": `\u5F00\u59CB\u65F6\u95F4${i + 1}`, type: "time", value: a.start || "", onChange: (e) => changeDraft("allocations", draft.allocations.map((x, j) => j === i ? { ...x, start: e.target.value } : x)) }), /* @__PURE__ */ React.createElement("span", null, "\u81F3"), /* @__PURE__ */ React.createElement("input", { "aria-label": `\u7ED3\u675F\u65F6\u95F4${i + 1}`, required: draft.kind === "meeting", type: "time", value: a.end || "", onChange: (e) => changeDraft("allocations", draft.allocations.map((x, j) => j === i ? { ...x, end: e.target.value } : x)) }), /* @__PURE__ */ React.createElement("small", null, draft.kind === "meeting" ? "\u5FC5\u586B" : "\u53EF\u9009"))))), draft.kind === "meeting" && meetingFields(), state.plans.filter((p) => p.taskIds.includes(draft.id)).map((p) => /* @__PURE__ */ React.createElement("section", { className: "tc-linked-plan", key: p.id }, /* @__PURE__ */ React.createElement("span", null, "\u6240\u5C5E\u5468\u8BA1\u5212"), /* @__PURE__ */ React.createElement("strong", null, p.title), /* @__PURE__ */ React.createElement("small", null, shortDate(p.weekStart), "\u8FD9\u4E00\u5468"))), /* @__PURE__ */ React.createElement("label", null, "\u4EA4\u4ED8\u7269", /* @__PURE__ */ React.createElement("input", { value: draft.deliverable || "", onChange: (e) => changeDraft("deliverable", e.target.value), placeholder: "\u4F8B\u5982\uFF1A\u4E00\u7248\u526A\u8F91\u3001\u786E\u8BA4\u7248\u5206\u955C" })), /* @__PURE__ */ React.createElement("label", null, "\u4EFB\u52A1\u8BF4\u660E", /* @__PURE__ */ React.createElement("textarea", { rows: 3, value: draft.description || "", onChange: (e) => changeDraft("description", e.target.value), placeholder: "\u8865\u5145\u5DE5\u4F5C\u8981\u6C42\u6216\u53C2\u8003\u4FE1\u606F" })), /* @__PURE__ */ React.createElement("label", null, "\u6765\u6E90\u94FE\u63A5", /* @__PURE__ */ React.createElement("input", { type: "text", value: draft.sourceUrl || "", onChange: (e) => changeDraft("sourceUrl", e.target.value), placeholder: "Buzz \u6D88\u606F\u6216\u9879\u76EE\u94FE\u63A5" })), !draft.isNew && /* @__PURE__ */ React.createElement("p", { className: "tc-task-id" }, "\u4EFB\u52A1 ID \xB7 ", draft.id), /* @__PURE__ */ React.createElement("div", { className: "tc-form-actions" }, /* @__PURE__ */ React.createElement("button", { type: "submit", className: "tc-btn tc-primary", disabled: saving || state?.role === "viewer" }, saving ? "\u6B63\u5728\u4FDD\u5B58\u2026" : "\u4FDD\u5B58\u5B89\u6392"), /* @__PURE__ */ React.createElement(Button, { onClick: () => setDraft(null), disabled: saving }, "\u53D6\u6D88")))));
  };
}

// src/tools.mjs
var toolDefinitions = [
  { name: "team_calendar_read", description: "\u8BFB\u53D6\u5F53\u524D\u56E2\u961F\u65E5\u5386\u7684\u6210\u5458\u3001\u9879\u76EE\u3001\u552F\u4E00\u4EFB\u52A1\u3001\u5468\u8BA1\u5212\u3001\u6BCF\u65E5\u5B89\u6392\u548C\u7248\u672C\uFF1B\u8FD4\u56DE\u7684\u6570\u636E\u4E0D\u6784\u6210\u6307\u6D3E\u6216\u6267\u884C\u6388\u6743\u3002", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "team_calendar_write", description: "\u521B\u5EFA\u6216\u66F4\u65B0\u5468/\u65E5\u8BA1\u5212\u548C\u4F1A\u8BAE\u3002\u4F1A\u8BAE\u4F7F\u7528 kind=meeting\uFF0Cmeeting={provider:tencent|other|offline,url,location,participantIds,joinBeforeMinutes,reminderMinutes}\uFF0Cdates \u5FC5\u987B\u5305\u542B date/start/end\u3002\u4FDD\u5B58\u5DF2\u6709\u4F1A\u8BAE\u94FE\u63A5\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u521B\u5EFA\u817E\u8BAF\u4F1A\u8BAE\u6216\u53D1\u9001\u9080\u8BF7\u3002\u5FC5\u987B\u5148\u8BFB\u53D6 revision\uFF0C\u5199\u5165\u5E26 requestId \u4E0E expectedRevision\uFF1B\u4EFB\u52A1\u4F7F\u7528\u7A33\u5B9A sourceKey/sourceId\uFF0Cdates \u5173\u8054\u6BCF\u65E5\u5B89\u6392\uFF0C\u4E0D\u590D\u5236\u539F\u4EFB\u52A1\u3002", inputSchema: { type: "object", properties: { requestId: { type: "string" }, expectedRevision: { type: "integer" }, action: { enum: ["upsert", "update"] }, sourceKey: { type: "string" }, tasks: { type: "array", items: { type: "object" } }, plan: { type: "object" }, taskId: { type: "string" }, changes: { type: "object" }, allocations: { type: "array", items: { type: "object" } } }, required: ["requestId", "expectedRevision", "action"], additionalProperties: false } },
  { name: "team_calendar_operation", description: "\u67E5\u8BE2\u6307\u5B9A requestId \u662F\u5426\u5DF2\u4FDD\u5B58\u3002\u8D85\u65F6\u540E\u5148\u67E5\u8BE2\uFF0C\u4E0D\u80FD\u76F2\u76EE\u91CD\u65B0\u5BFC\u5165\u3002", inputSchema: { type: "object", properties: { requestId: { type: "string" } }, required: ["requestId"], additionalProperties: false } }
];

// src/calendar.css
var calendar_default = `.tc {
  --tc-bg:var(--surface-panel,#fff);--tc-side:var(--surface-panel,#fff);--tc-inset:var(--surface-inset,#f8f9fc);
  --tc-text:var(--text-standard,#222432);--tc-muted:var(--text-subtle,#717787);--tc-border:var(--border-standard,#edf0f5);
  --tc-control:var(--affordance-subtle,#f7f8fb);--tc-hover:var(--affordance-subtle-hover,#f3f5fa);
  --tc-prominent:var(--affordance-prominent,#252735);--tc-on-prominent:var(--text-on-prominent,#fff);
  --tc-accent:var(--affordance-accent-prominent,#8763d2);--tc-on-accent:var(--text-on-accent,#fff);
  --tc-highlight:var(--affordance-sidebar-hover,#f3eeff);--tc-highlight-ink:var(--text-sidebar-hover,#7150b5);
  --tc-focus:var(--border-focus,#7150b5);--tc-success:var(--text-success,#32846a);
  --tc-warning:var(--text-warning,#987015);--tc-danger:var(--text-danger,#bd4154);
  display:flex;width:100%;height:100%;min-height:550px;position:relative;isolation:isolate;overflow:hidden;
  background:var(--tc-bg);color:var(--tc-text);font:14px/1.5 Inter,-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;text-align:left;
}
.tc *{box-sizing:border-box}.tc :where(button,input,select,textarea){font:inherit}.tc :where(button,a){-webkit-tap-highlight-color:transparent}
.tc-workspace-intro{display:flex;align-items:center;justify-content:space-between;gap:24px;margin:4px 32px 24px;padding:24px;border:1px solid var(--tc-border);border-radius:14px;background:var(--tc-bg)}
.tc-intro-kicker{font-size:12px;color:var(--tc-highlight-ink);font-weight:600}.tc-workspace-intro h2{font-size:20px;font-weight:600;margin:0 0 8px}.tc-workspace-intro p{font-size:14px;color:var(--tc-muted);line-height:1.7}
@media(max-width:1100px){.tc-workspace-intro{align-items:flex-start;flex-direction:column;gap:18px}}
@media(max-width:760px){.tc-workspace-intro{margin:4px 16px 18px;padding:20px}.tc-workspace-intro h2{font-size:20px}}
.tc button{margin:0;padding:0;cursor:pointer;color:inherit;letter-spacing:normal;transition:background .15s ease,border-color .15s ease,box-shadow .15s ease}.tc button:disabled{opacity:.45;cursor:default}
.tc svg{display:block;flex-shrink:0}.tc :is(time,.tc-day-number,.tc-month-date,.tc-mini-grid,.tc-month-head,.tc-filter-row small,.tc-context-bar){font-variant-numeric:tabular-nums}
.tc :where(button,input,select,textarea,a,summary):focus-visible{outline:2px solid var(--tc-focus);outline-offset:3px}
.tc h1,.tc h2,.tc p{margin:0}.tc input,.tc textarea,.tc select{color:var(--tc-text);background:var(--tc-bg)}
.tc .tc-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--tc-border);background:var(--tc-bg);padding:8px 13px;min-height:38px;border-radius:9px;white-space:nowrap;font-size:13px;font-weight:500;line-height:20px;text-decoration:none}
.tc .tc-btn:hover:not(:disabled){background:var(--tc-hover);border-color:var(--border-prominent,#d9dce6)}.tc .tc-btn:active:not(:disabled){background:var(--affordance-subtle-pressed,var(--tc-highlight))}
.tc .tc-btn.tc-primary{background:var(--tc-prominent);border-color:var(--tc-prominent);color:var(--tc-on-prominent);padding-left:16px;padding-right:16px}
.tc .tc-btn.tc-primary:hover:not(:disabled){background:var(--affordance-prominent-hover,#3c3e4d);border-color:transparent}
.tc .tc-btn.tc-primary:active:not(:disabled){background:var(--affordance-prominent-pressed,#11121a)}
.tc-prev svg{transform:rotate(180deg)}.tc .tc-btn.tc-tiny{border:0;padding:3px;min-height:26px}.tc-tiny svg{width:14px}
.tc-sidebar{width:216px;flex:0 0 216px;border-right:1px solid var(--tc-border);padding:28px 16px 16px;display:flex;flex-direction:column;overflow-y:auto;background:var(--tc-side)}


.tc-workspace{display:flex;align-items:center;gap:7px;padding:0 10px 18px;font-size:12px;color:var(--tc-muted)}.tc-workspace>span:last-child{margin-left:auto;font-size:11px}.tc-workspace-dot{width:5px;height:5px;border-radius:50%;background:var(--tc-accent)}


.tc-date-picker{border-top:1px solid var(--tc-border);border-bottom:1px solid var(--tc-border);margin:0 5px 4px}.tc-date-picker>summary{display:flex;align-items:center;gap:9px;padding:13px 4px;cursor:pointer;font-size:12px;color:var(--tc-muted);list-style:none}.tc-date-picker>summary::-webkit-details-marker{display:none}.tc-date-picker>summary>svg:last-child{margin-left:auto;transform:rotate(90deg)}.tc-date-picker[open]>summary>svg:last-child{transform:rotate(-90deg)}
.tc-mini{padding:6px 3px 16px}.tc-mini-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;font-size:12px}.tc-mini-title>span{display:flex;gap:4px}.tc-mini-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
.tc-mini-grid>button,.tc-mini-grid>span{padding:0;display:flex;align-items:center;justify-content:center;width:24px;height:26px;border:0;background:none;border-radius:6px;font-size:11px}.tc-mini-grid .tc-mini-weekday{color:var(--tc-muted);font-size:10px}.tc-mini-grid button:hover{background:var(--tc-hover)}.tc-mini-grid button.is-today{color:var(--tc-highlight-ink);font-weight:700}.tc-mini-grid button.is-selected{background:var(--tc-accent);color:var(--tc-on-accent)}.tc .is-muted{color:var(--text-metadata,#a0a6b4)}
.tc-filter-section{padding:23px 7px 0}.tc-section-title{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:10px;font-size:11px;font-weight:500;color:var(--tc-muted)}.tc-section-title button,.tc .tc-config-link{border:0;background:none;color:var(--tc-muted);font-size:11px;padding:3px 4px;cursor:pointer}.tc-section-title button:hover,.tc .tc-config-link:hover{color:var(--tc-highlight-ink)}
.tc-filter-row{display:flex;align-items:center;gap:9px;min-height:36px;padding:7px 0;cursor:pointer;font-size:13px}.tc-filter-row input{margin:0;width:13px;height:13px;accent-color:var(--tc-accent)}.tc-filter-row small{margin-left:auto;font-size:11px;color:var(--tc-muted)}.tc-project-mark{width:8px;height:8px;flex-shrink:0;border-radius:3px;display:inline-block;background:var(--project-color)}
.tc-blue{--project-color:var(--chart-series-1,#399bd1);--project-soft:color-mix(in srgb,var(--project-color) 11%,var(--tc-bg));--project-border:color-mix(in srgb,var(--project-color) 22%,var(--tc-bg))}
.tc-purple{--project-color:var(--icon-categorical-purple,#9b74d7);--project-soft:color-mix(in srgb,var(--project-color) 12%,var(--tc-bg));--project-border:color-mix(in srgb,var(--project-color) 23%,var(--tc-bg))}
.tc-amber{--project-color:var(--chart-series-2,#e5aa40);--project-soft:color-mix(in srgb,var(--project-color) 13%,var(--tc-bg));--project-border:color-mix(in srgb,var(--project-color) 27%,var(--tc-bg))}
.tc-avatar{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;flex-shrink:0;border-radius:50%;font-size:13px;font-weight:600;background:var(--tc-highlight);color:var(--tc-highlight-ink)}
.tc-avatar-1{background:color-mix(in srgb,var(--chart-series-1,#399bd1) 13%,var(--tc-bg));color:var(--tc-text)}.tc-avatar-2{background:color-mix(in srgb,var(--text-success,#32846a) 12%,var(--tc-bg));color:var(--tc-text)}.tc-avatar-3{background:color-mix(in srgb,var(--chart-series-2,#e5aa40) 17%,var(--tc-bg));color:var(--tc-text)}.tc-member-filter .tc-avatar{width:24px;height:24px;font-size:11px}
.tc-sidebar-bottom{display:flex;align-items:center;gap:6px;margin-top:auto;padding:26px 6px 0;font-size:10px;color:var(--tc-muted)}.tc-sidebar-bottom>.tc-connected-dot{margin-left:auto}.tc-connected-dot{width:6px;height:6px;border-radius:50%;background:var(--tc-success);display:inline-block;flex-shrink:0}
.tc-main{display:flex;flex-direction:column;flex:1;min-width:0;overflow:hidden;background:var(--tc-bg)}
.tc-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:28px 32px 24px}.tc-heading{display:flex;align-items:center;gap:12px}.tc-heading h1{font-size:24px;line-height:1.3;font-weight:650;letter-spacing:-.03em}.tc-heading p{display:none}.tc-demo-badge{background:var(--tc-control);color:var(--tc-muted);border:1px solid var(--tc-border);padding:3px 7px;border-radius:6px;font-size:10px}
.tc-header-actions{display:flex;align-items:center;gap:8px}.tc-header-actions>.tc-btn:has(svg):not(:has(span)){gap:7px}.tc-header-actions>.tc-icon-only{padding:8px;border-color:transparent;background:none}.tc-header-actions>.tc-icon-only:hover{background:var(--tc-hover)}.tc-header-actions [aria-pressed=true]{color:var(--tc-highlight-ink);background:var(--tc-highlight)!important}
.tc-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 32px 23px}.tc-date-nav{display:flex;align-items:center;gap:10px}.tc-date-nav h2{display:flex;align-items:baseline;gap:5px;font-size:25px;font-weight:450;letter-spacing:-.04em;margin-right:8px;white-space:nowrap}.tc-date-nav h2>span{font-weight:650;margin-left:0}.tc-date-nav>.tc-btn{min-height:34px;padding:5px 12px}.tc-prev-next{display:flex;gap:3px}.tc-prev-next>.tc-btn{border:0;padding:5px;min-height:34px;min-width:28px}.tc-prev-next svg{width:16px}.tc-date-range{font-size:12px;color:var(--tc-muted);margin-left:4px}
.tc-view-switch{display:flex;gap:3px;padding:4px;background:var(--tc-control);border:1px solid var(--tc-border);border-radius:10px;flex-shrink:0}.tc-view-switch>button{border:1px solid transparent;border-radius:7px;background:none;font-size:12px;color:var(--tc-muted);padding:5px 16px;min-height:30px}.tc-view-switch>button:hover{color:var(--tc-text)}.tc-view-switch>button.is-active{background:var(--tc-bg);border-color:var(--tc-border);box-shadow:0 1px 3px #10162908;color:var(--tc-highlight-ink);font-weight:600}
.tc-context-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 32px;padding:16px 0;border-top:1px solid var(--tc-border)}.tc-context-bar>div{display:flex;align-items:center;gap:12px;color:var(--tc-muted);font-size:12px}.tc-context-bar strong{color:var(--tc-text);font-size:14px;font-weight:600}.tc-divider{color:var(--border-prominent,#cbd0dc)}
.tc-search{display:flex;align-items:center;gap:8px;border:1px solid var(--tc-border);background:var(--tc-bg);border-radius:8px;padding:7px 10px;color:var(--tc-muted)}.tc-search input{padding:0;min-width:0;width:175px;border:0;font-size:12px;background:none;outline:none}.tc-search:focus-within{outline:2px solid var(--tc-focus);outline-offset:2px}.tc-search button{border:0;background:none}.tc-search input::placeholder{color:var(--tc-muted)}
.tc-content{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}.tc-content>div{flex:1;min-height:0}.tc-content>.tc-workspace-intro{flex-shrink:0}.tc-grid-scroll{height:100%;overflow:auto;padding:0 32px}.tc-week-grid{display:grid;grid-template-columns:126px repeat(7,minmax(130px,1fr));min-width:1040px;border-top:1px solid var(--tc-border);border-left:1px solid var(--tc-border);border-radius:12px 12px 0 0;position:relative}
.tc-week-head{position:sticky;top:0;z-index:3;height:86px;border-right:1px solid var(--tc-border);border-bottom:1px solid var(--tc-border);padding:12px 13px;display:flex;align-items:center;flex-wrap:wrap;align-content:center;gap:7px;background:var(--tc-bg);color:var(--tc-muted);font-size:12px}.tc-week-head>span{width:100%}.tc-week-head>small{font-size:10px;color:var(--tc-highlight-ink);font-weight:500}.tc-member-heading{left:0;z-index:4;font-size:12px;padding:16px}.tc-member-heading small{font-size:11px;color:var(--tc-muted)}
.tc .tc-day-number{border:0;border-radius:9px;background:none;padding:0;width:33px;height:33px;font-size:25px;line-height:33px;font-weight:500;color:var(--tc-text)}.tc .tc-day-number.is-today{background:var(--tc-accent);color:var(--tc-on-accent)}
.tc-person{position:sticky;left:0;z-index:2;min-height:190px;padding:21px 16px;display:flex;flex-direction:column;align-items:flex-start;background:var(--tc-bg);border-right:1px solid var(--tc-border);border-bottom:1px solid var(--tc-border)}.tc-person strong{font-size:14px;font-weight:600;margin-top:10px}.tc-person>span:not(.tc-avatar){font-size:11px;color:var(--tc-muted);margin-top:4px}.tc-person small{font-size:11px;color:var(--tc-muted);margin-top:13px}
.tc-cell{min-height:190px;padding:10px 8px;display:flex;flex-direction:column;gap:9px;align-items:stretch;border-right:1px solid var(--tc-border);border-bottom:1px solid var(--tc-border);background:var(--tc-bg)}.tc-weekend{background:color-mix(in srgb,var(--tc-control) 48%,var(--tc-bg))}.tc-today-col{background:color-mix(in srgb,var(--tc-highlight) 42%,var(--tc-bg))}
.tc-task{display:flex;flex-direction:column;align-items:stretch;gap:9px;width:100%;min-width:0;text-align:left;padding:12px 10px;border:1px solid var(--project-border);border-left:3px solid var(--project-color);border-radius:8px;background:var(--project-soft)}.tc-task:hover{box-shadow:0 3px 10px #252c3d0a;border-color:var(--project-color)}.tc-task strong{font-size:14px;line-height:1.65;font-weight:600;overflow-wrap:anywhere;letter-spacing:-.01em;color:var(--tc-text)}.tc-task strong svg{display:inline-block;vertical-align:-2px;margin-right:3px}
.tc-task-project{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:500;color:var(--tc-muted)}.tc-task-project i{width:5px;height:5px;border-radius:50%;background:var(--project-color)}.tc-task-meta{display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;font-size:11px;color:var(--tc-muted)}.tc-task-time{display:flex;align-items:center;gap:4px}.tc-status{display:inline-flex;align-items:center;gap:3px;white-space:nowrap;font-size:11px}.tc-status::before{content:"";display:block;width:5px;height:5px;border-radius:50%;background:currentColor}.tc-status:has(svg)::before{display:none}.tc-status-doing{color:var(--tc-highlight-ink);font-weight:500}.tc-status-review{color:var(--tc-warning)}.tc-status-blocked{color:var(--tc-danger)}.tc-status-done{color:var(--tc-success)}.tc-task.is-done strong{text-decoration:line-through;color:var(--tc-muted)}
.tc [data-task-id][aria-expanded=true]{outline:2px solid var(--project-color,var(--tc-accent));outline-offset:-1px}

.tc-pending{display:flex;align-items:center;gap:16px;padding:10px 14px;margin:14px 32px 0;border:1px solid var(--tc-border);border-radius:9px;background:var(--tc-bg)}.tc-pending>div:first-child{display:flex;align-items:center;gap:8px;flex-shrink:0;color:var(--tc-muted);font-size:11px}.tc-pending>div:first-child>span:last-child{display:none}.tc-pending-label{font-size:12px;font-weight:500;color:var(--tc-text)}.tc-pending-label b{font-size:11px;color:var(--tc-highlight-ink);background:var(--tc-highlight);padding:2px 6px;border-radius:5px;margin-left:5px;font-weight:500}
.tc-pending-items{display:flex;gap:10px;overflow:auto;min-width:0}.tc-pending-items button{display:flex;align-items:center;gap:8px;flex-shrink:0;border:0;border-radius:6px;padding:6px 8px;font-size:12px;background:var(--tc-control)}.tc-pending-items small{font-size:11px;color:var(--tc-muted)}
.tc-footer{display:flex;align-items:center;justify-content:space-between;padding:12px 32px;font-size:10px;color:var(--tc-muted)}.tc-footer>span:first-child{display:flex;align-items:center;gap:6px}
.tc-day-view{height:100%;overflow:auto;padding:0 32px 24px}.tc-day-intro{padding:8px 0 24px}.tc-day-intro>span{font-size:12px;color:var(--tc-highlight-ink)}.tc-day-intro h2{font-size:26px;font-weight:600;margin:7px 0}.tc-day-intro p{font-size:13px;color:var(--tc-muted)}.tc-day-person{border-top:1px solid var(--tc-border);padding:20px 0}.tc-day-person-head{display:flex;align-items:center;gap:10px}.tc-day-person-head>span:not(.tc-avatar){font-size:12px;color:var(--tc-muted)}.tc-day-tasks{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin:16px 0 0 46px}.tc-day-tasks .tc-task{padding:15px}.tc-day-tasks .tc-task strong{font-size:15px}.tc-quiet{font-size:12px;color:var(--tc-muted)}
.tc-month-view{height:100%;padding:0 32px;overflow:auto}.tc-month-weekdays{position:sticky;top:0;z-index:3;background:var(--tc-bg);display:grid;grid-template-columns:repeat(7,1fr);min-width:840px;padding:10px 0;font-size:12px;color:var(--tc-muted);text-align:right}.tc-month-weekdays>span{padding-right:12px}.tc-month-grid{display:grid;grid-template-columns:repeat(7,minmax(120px,1fr));min-width:840px;border-left:1px solid var(--tc-border);border-top:1px solid var(--tc-border)}.tc-month-cell{min-height:132px;padding:7px;border-right:1px solid var(--tc-border);border-bottom:1px solid var(--tc-border);display:flex;flex-direction:column;gap:5px}.tc-month-date{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;line-height:1;border:0;background:none;border-radius:7px;width:28px;height:28px;align-self:flex-end;font-size:13px}.tc-month-date.is-today{background:var(--tc-accent);color:var(--tc-on-accent)}.tc-month-task{display:flex;align-items:center;gap:5px;max-width:100%;border:0;border-left:2px solid var(--project-color);border-radius:4px;padding:5px 6px;background:var(--project-soft);text-align:left;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tc-month-task i{display:none}.tc-more{border:0;background:none;font-size:11px;text-align:left;color:var(--tc-muted)!important}
.tc-team-month{height:100%;display:flex;flex-direction:column;padding:0 32px;min-width:0}.tc-month-intro{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 0 12px;font-size:12px;color:var(--tc-muted)}.tc-month-timeline-scroll{flex:1;min-height:0;overflow:auto;border:1px solid var(--tc-border);border-radius:11px;position:relative;background:var(--tc-bg)}.tc-month-timeline{min-width:calc(282px + var(--month-days)*28px);width:100%}
.tc-month-timeline-header,.tc-month-person-row{display:grid;grid-template-columns:282px minmax(0,1fr)}.tc-month-timeline-header{position:sticky;top:0;z-index:5;background:var(--tc-bg)}.tc-month-person{position:sticky;left:0;z-index:2;border:0;border-right:1px solid var(--tc-border);border-bottom:1px solid var(--tc-border);background:var(--tc-bg);padding:12px 18px;min-width:0;text-align:left}
.tc-month-corner{display:flex;flex-direction:column;justify-content:center;gap:5px;font-size:13px;font-weight:500;z-index:6}.tc-month-corner small{font-size:11px;color:var(--tc-muted);font-weight:400}.tc-month-track{display:grid;grid-template-columns:repeat(var(--month-days),minmax(0,1fr));min-width:0;position:relative;align-items:center}.tc-month-head{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:70px;padding:8px 0;border:0;border-right:1px solid var(--tc-border);border-bottom:1px solid var(--tc-border);background:var(--tc-bg)}.tc-month-head>span{font-size:10px;color:var(--tc-muted)}.tc-month-head strong{display:flex;align-items:center;justify-content:center;width:25px;height:27px;line-height:27px;font-size:13px;font-weight:500;border-radius:7px}.tc-month-head.is-today strong{background:var(--tc-accent);color:var(--tc-on-accent)}.tc-month-head:hover{background:var(--tc-highlight)}
.tc-month-group-row>.tc-month-person{display:flex;align-items:center;gap:10px;background:var(--tc-control);padding:12px 16px}.tc-month-group-row .tc-avatar{width:30px;height:30px;font-size:12px}.tc-month-group-row strong{font-size:14px;font-weight:600}.tc-month-group-row small{display:block;font-size:11px;color:var(--tc-muted);margin-top:2px}.tc-month-member-summary{display:flex;align-items:center;gap:14px;padding:12px 18px;min-width:0;border-bottom:1px solid var(--tc-border);background:var(--tc-control)}.tc-month-member-summary>strong{font-size:12px;color:var(--tc-muted);font-weight:400}.tc-month-project{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--tc-muted)}.tc-month-project i{width:6px;height:6px;border-radius:2px;background:var(--project-color)}
.tc-month-label{display:flex;flex-direction:column;justify-content:center;align-items:stretch;gap:6px;min-height:56px;padding:8px 18px}.tc-month-label>strong{font-size:13px;line-height:1.6;font-weight:500;overflow-wrap:anywhere}.tc-month-label>strong svg{display:inline-block;vertical-align:-2px;margin-right:3px}.tc-month-label>small{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--tc-muted);flex-wrap:wrap}.tc-month-label .tc-project-mark{width:6px;height:6px}.tc-month-label .tc-status{font-size:10px}.tc-month-label time{margin-left:auto;font-size:10px}.tc-month-label:hover{background:var(--project-soft)}.tc-month-task-row:hover>.tc-month-task-track{background:var(--tc-control)}
.tc-month-task-track{min-height:56px;border-bottom:1px solid var(--tc-border)}.tc-month-column{border-right:1px solid var(--tc-border);align-self:stretch;grid-row:1}.tc-month-column.tc-weekend{background:color-mix(in srgb,var(--tc-control) 56%,var(--tc-bg))}.tc-month-column.tc-today-col{background:color-mix(in srgb,var(--tc-highlight) 55%,var(--tc-bg))}
.tc-month-bar{z-index:1;display:flex;align-items:center;justify-content:center;gap:4px;min-width:0;height:28px;margin:0 3px;padding:3px 4px;border:1px solid var(--project-border);border-radius:6px;background:color-mix(in srgb,var(--project-color) 30%,var(--tc-bg));box-shadow:inset 0 -2px 0 var(--project-color);font-size:11px;color:var(--tc-text)}.tc-month-bar:hover{border-color:var(--project-color);box-shadow:inset 0 -2px 0 var(--project-color),0 2px 7px #1016290d}.tc-month-bar.is-done{opacity:.55}.tc-bar-dot{height:5px;width:5px;border-radius:50%;background:var(--project-color)}.tc-month-empty-label{font-size:12px;color:var(--tc-muted);min-height:66px;display:flex;align-items:center}
.tc-quick{position:absolute;z-index:10;width:370px;max-width:calc(100% - 32px);max-height:calc(100% - 32px);overflow:auto;background:var(--surface-popover,var(--tc-bg));padding:23px;border:1px solid var(--tc-border);border-radius:16px;box-shadow:var(--shadow-sm,0 12px 40px #2225361f);outline:none}.tc-quick-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px}.tc-quick-top>.tc-btn{min-height:28px;padding:3px;border:0}.tc-quick-project{display:inline-flex;align-items:center;gap:7px;background:var(--project-soft);color:var(--tc-text);border-radius:6px;padding:5px 8px;font-size:12px}.tc-quick-project i{width:6px;height:6px;border-radius:2px;background:var(--project-color)}.tc-quick h2>svg{display:inline-block;vertical-align:-2px}.tc-quick h2{font-size:22px;line-height:1.5;font-weight:600;overflow-wrap:anywhere;margin-bottom:12px}.tc-quick>.tc-status{display:inline-flex;background:var(--tc-control);padding:4px 9px;border-radius:6px;font-size:12px;margin-bottom:12px}.tc-quick-row{display:flex;align-items:flex-start;gap:11px;padding:10px 0;font-size:13px;overflow-wrap:anywhere}.tc-quick-row svg{flex-shrink:0;color:var(--tc-muted);margin-top:2px}.tc-quick-row>div{max-height:100px;overflow:auto}.tc-quick-row small{font-size:11px;color:var(--tc-muted);display:inline-block;margin-top:5px}.tc-quick-note{font-size:12px;color:var(--tc-muted);line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:14px!important}.tc-quick-actions{display:flex;flex-wrap:wrap;gap:8px;padding-top:18px;margin-top:20px;border-top:1px solid var(--tc-border)}
.tc-detail{display:flex;flex-direction:column;flex-shrink:0;width:390px;overflow:hidden;border-left:1px solid var(--tc-border);background:var(--surface-popover,var(--tc-bg))}.tc-detail-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:19px 24px;border-bottom:1px solid var(--tc-border);font-size:14px;font-weight:600}.tc-detail-header>.tc-btn{padding:3px;min-height:30px;border:0}
.tc-form{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}.tc-form-body{display:flex;flex-direction:column;gap:22px;flex:1;min-height:0;overflow:auto;padding:24px}.tc-form-body>*{flex-shrink:0}.tc-form h2{font-size:22px;font-weight:600}.tc-form label{display:flex;flex-direction:column;gap:8px;font-size:12px;color:var(--tc-muted);min-width:0}.tc-form input,.tc-form textarea,.tc-form select{width:100%;min-width:0;min-height:39px;padding:9px 10px;border:1px solid var(--border-prominent,var(--tc-border));border-radius:8px;font-size:13px;line-height:1.5}.tc-form textarea{resize:vertical}.tc-form .tc-title-input{border:0;border-radius:0;background:none;padding:0;font-size:20px;font-weight:600;line-height:1.6}.tc-title-label{gap:10px!important}.tc-detail-kicker{font-size:12px;color:var(--tc-highlight-ink);font-weight:500}.tc-form-pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}.tc-form-help{font-size:12px;line-height:1.85;color:var(--tc-muted)}.tc-form-actions{display:flex;gap:9px;flex-shrink:0;padding:16px 24px;border-top:1px solid var(--tc-border);background:var(--tc-bg)}.tc-form .tc-json-input{font:11px/1.8 ui-monospace,monospace}.tc-task-id{font:10px/1.6 ui-monospace,monospace;color:var(--tc-muted);overflow-wrap:anywhere}
.tc-schedule-editor{border-top:1px solid var(--tc-border);border-bottom:1px solid var(--tc-border);padding:18px 0}.tc-allocation-editor{border:1px solid var(--tc-border);background:var(--tc-control);border-radius:8px;padding:10px;margin-top:10px}.tc-allocation-editor>div{display:flex;align-items:center;gap:6px}.tc-allocation-editor>div>button{display:flex;border:0;background:none;padding:5px;color:var(--tc-muted)}.tc-time-edit{margin-top:8px;font-size:11px;color:var(--tc-muted)}.tc-time-edit input{width:100px;min-height:32px;padding:5px 6px;font-size:11px}.tc-time-edit small{margin-left:auto;font-size:10px}.tc-linked-plan{display:flex;flex-direction:column;gap:6px;border:1px solid var(--tc-border);border-radius:8px;padding:13px}.tc-linked-plan span,.tc-linked-plan small{font-size:11px;color:var(--tc-muted)}.tc-linked-plan strong{font-size:13px;font-weight:500}.tc-settings-row{margin-top:12px}
.tc-meeting-fields{display:flex;flex-direction:column;gap:16px}.tc-connection-state{display:flex;align-items:center;flex-wrap:wrap;gap:9px;padding:13px;background:var(--tc-control);border:1px solid var(--tc-border);border-radius:8px;font-size:12px}.tc-connection-state small{width:100%;font-size:11px;line-height:1.8;color:var(--tc-muted)}.tc-attendees{display:flex;flex-wrap:wrap;gap:9px 15px;border:0;margin:0;padding:0}.tc-attendees legend{font-size:12px;color:var(--tc-muted);margin-bottom:9px}.tc .tc-attendees label{display:flex;flex-direction:row;align-items:center;gap:6px;color:var(--tc-text)}.tc-attendees input{width:14px;min-height:14px;margin:0;accent-color:var(--tc-accent)}
.tc-alert{display:flex;align-items:center;gap:10px;padding:10px 14px;margin:0 32px 12px;border:1px solid var(--border-danger,#f3cbd1);border-radius:8px;background:var(--affordance-danger,#fff3f4);color:var(--tc-danger);font-size:12px}.tc-alert>.tc-btn{margin-left:auto;min-height:28px;padding:3px 9px}.tc-notice{position:absolute;z-index:8;top:78px;right:32px;display:flex;align-items:center;gap:7px;padding:10px 14px;background:var(--affordance-success,#edfaf3);color:var(--tc-success);border:1px solid var(--border-success-subtle,#c9e9d8);border-radius:9px;font-size:12px}.tc-empty{display:flex;align-items:center;justify-content:center;gap:12px;padding:60px 20px;color:var(--tc-muted);font-size:13px}
.tc-reminder{position:absolute;z-index:12;bottom:22px;right:22px;width:360px;max-width:calc(100% - 40px);padding:23px;background:var(--surface-popover,var(--tc-bg));border:1px solid var(--tc-border);border-radius:14px;box-shadow:var(--shadow-sm,0 10px 30px #2225361f)}.tc-reminder strong{font-size:16px}.tc-reminder p{font-size:13px;line-height:1.8;margin:12px 0 18px}.tc-reminder>.tc-btn{margin-right:8px}.tc .tc-mobile-toggle{display:none}.tc-preview{height:100dvh}
.tc-dark{--tc-bg:#24252b;--tc-side:#202127;--tc-inset:#292b33;--tc-text:#f1f2f7;--tc-muted:#a7adbd;--tc-border:#363943;--tc-control:#2b2d35;--tc-hover:#323641;--tc-prominent:#f1f2f7;--tc-on-prominent:#24252b;--tc-accent:#a685eb;--tc-on-accent:#1c1230;--tc-highlight:#342c46;--tc-highlight-ink:#c5a6ff;--tc-focus:#c5a6ff;--tc-success:#83ceb0;--tc-warning:#e5bc73;--tc-danger:#f1a1ae}
.tc-dark .tc-btn.tc-primary:hover:not(:disabled){background:#daddf0}.tc-dark .tc-alert{background:#40282e;border-color:#643b43}.tc-dark .tc-notice{background:#243b31;border-color:#3b6050}.tc-dark .tc-blue{--project-color:#66b2dd}.tc-dark .tc-purple{--project-color:#b793e6}.tc-dark .tc-amber{--project-color:#e5b75f}
@media(max-width:1250px){.tc-header,.tc-toolbar{padding-left:24px;padding-right:24px}.tc-context-bar{margin-left:24px;margin-right:24px}.tc-grid-scroll,.tc-day-view,.tc-month-view,.tc-team-month{padding-left:24px;padding-right:24px}.tc-pending{margin-left:24px;margin-right:24px}.tc-footer{padding-left:24px;padding-right:24px}.tc-date-range{display:none}.tc-detail{width:360px}.tc-header{padding-top:25px;padding-bottom:22px}.tc-date-nav h2{font-size:23px}.tc-view-switch>button{padding-left:13px;padding-right:13px}}
@media(max-width:760px){.tc-sidebar{position:absolute;inset:0 auto 0 0;z-index:9;display:none;width:232px;box-shadow:12px 0 36px #252c3d1a}.tc-sidebar.is-open{display:flex}.tc .tc-mobile-toggle{display:flex;padding:5px;min-height:32px;border:0}.tc-header{padding:18px 16px 20px;gap:8px}.tc-heading{gap:6px}.tc-heading h1{font-size:20px}.tc-demo-badge{display:none}.tc-header-actions{gap:2px}.tc .tc-header-actions .tc-btn{font-size:0;padding:7px;min-width:31px;min-height:34px}.tc-header-actions svg{width:17px}.tc-toolbar{padding:0 16px 17px;gap:8px;flex-wrap:wrap}.tc-date-nav{gap:6px}.tc-date-nav h2{font-size:22px;margin-right:3px}.tc-date-nav>.tc-btn{font-size:12px;padding:5px 9px}.tc-prev-next>.tc-btn{min-width:24px;padding:4px}.tc-view-switch{padding:3px}.tc-view-switch>button{font-size:11px;padding:4px 10px;min-height:29px}.tc-context-bar{margin:0 16px;padding:12px 0;gap:8px}.tc-context-bar>div{font-size:11px;gap:7px}.tc-context-bar strong{font-size:12px}.tc-search{padding:6px 7px}.tc-search input{width:102px;font-size:10px}.tc-search svg{width:13px}.tc-grid-scroll,.tc-day-view,.tc-month-view,.tc-team-month{padding-left:16px;padding-right:16px}.tc-pending{margin:12px 16px 0;gap:10px;padding:9px 10px}.tc-pending-items button{font-size:11px}.tc-pending-items small{display:none}.tc-footer{padding:10px 16px;font-size:9px}.tc-detail{position:absolute;inset:0 0 0 auto;z-index:11;width:min(100%,390px);box-shadow:-12px 0 36px #252c3d1a}.tc-day-tasks{margin-left:0}.tc-day-person-head>span:not(.tc-avatar){display:none}.tc-month-intro{font-size:10px}.tc-month-intro>span:last-child{display:none}.tc-month-timeline{min-width:calc(220px + var(--month-days)*28px)}.tc-month-timeline-header,.tc-month-person-row{grid-template-columns:220px minmax(0,1fr)}.tc-month-person{padding-left:12px;padding-right:12px}.tc-month-label>strong{font-size:12px}.tc-month-label>small{font-size:10px}.tc-month-label time{width:100%;margin-left:0}.tc-month-member-summary{gap:10px}.tc .tc-quick{left:12px!important;right:12px;top:auto!important;bottom:12px;width:auto;max-width:none;max-height:calc(100% - 24px)}.tc-alert{margin-left:16px;margin-right:16px}}
@media(prefers-reduced-motion:reduce){.tc *{transition:none!important}}
/* One month destination, with date and member layouts. */
.tc-month-layout{height:100%;min-height:0;padding:0 32px;display:flex;flex-direction:column}.tc-month-layout-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 0 14px}.tc-month-layout-bar>span{font-size:12px;color:var(--tc-muted)}.tc-month-layout-bar>div{display:flex;align-items:center;gap:4px}.tc-month-layout-bar button{border:1px solid transparent;border-radius:7px;background:none;padding:5px 10px;font-size:12px;color:var(--tc-muted)}.tc-month-layout-bar button.is-active{background:var(--tc-highlight);color:var(--tc-highlight-ink);font-weight:500}.tc-month-layout-body{flex:1;min-height:0}.tc-month-layout .tc-month-view,.tc-month-layout .tc-team-month{padding:0}.tc-month-layout .tc-month-weekdays{padding:0;text-align:left;font-size:12px;border-left:1px solid transparent}.tc-month-weekdays>span{padding:8px 10px}.tc-month-grid{border-radius:10px}.tc-month-cell{min-height:110px;padding:8px;gap:5px}.tc-month-cell.is-muted{background:var(--tc-control)}.tc-month-cell.is-today{background:color-mix(in srgb,var(--tc-highlight) 22%,var(--tc-bg))}.tc-month-cell-head{display:flex;align-items:center;justify-content:space-between;gap:5px;margin-bottom:2px}.tc-month-cell-head>span{font-size:10px;color:var(--tc-muted)}.tc-month-date{align-self:auto;font-size:14px;font-weight:500}.tc-month-task{display:flex;flex-direction:column;align-items:stretch;gap:3px;white-space:normal;overflow:visible;border:1px solid var(--project-border);border-left:3px solid var(--project-color);border-radius:6px;padding:6px 7px}.tc-month-event-head{display:flex;align-items:center;gap:6px;min-width:0;font-size:11px;color:var(--tc-muted)}.tc-month-event-head time{margin-left:auto}.tc-month-event-person{font-weight:500}.tc-month-task strong{font-size:13px;font-weight:500;line-height:1.5;overflow-wrap:anywhere;color:var(--tc-text)}.tc-more{display:flex;align-items:center;gap:3px;font-size:10px;padding:4px 2px}.tc-month-task:hover{border-color:var(--project-color)}
@media(max-width:1250px){.tc-month-layout{padding-left:24px;padding-right:24px}}@media(max-width:760px){.tc-month-layout{padding-left:16px;padding-right:16px}.tc-month-layout-bar>span{font-size:10px}.tc-month-layout-bar button{font-size:11px;padding:5px 8px}.tc-month-layout .tc-month-view{padding:0}.tc-month-layout .tc-team-month{padding:0}}

/* Keep compact controls centered under the Buzz host button defaults. */
.tc :is(.tc-day-number,.tc-mini-grid>button){display:inline-flex;align-items:center;justify-content:center}
.tc-filter-row input{flex-shrink:0}.tc-project-mark{flex-shrink:0}.tc-filter-row>span:not(.tc-avatar):not(.tc-project-mark){min-width:0;overflow-wrap:anywhere}
.tc-workspace-intro h2{line-height:1.4;margin:0 0 8px}.tc-workspace-intro p{line-height:1.7}

.tc-panel-error{flex-shrink:0;max-height:160px;overflow:auto;padding:12px 24px;border-bottom:1px solid var(--tc-border);color:var(--tc-danger);background:var(--affordance-danger,var(--tc-control));font-size:12px;line-height:1.7}.tc-panel-error .tc-btn{margin-top:8px;white-space:normal}

.tc-filter-actions{display:inline-flex;align-items:center;gap:4px}.tc-filter-actions [aria-pressed=true]{color:var(--tc-highlight-ink);background:var(--tc-highlight);border-radius:4px}.tc .tc-sidebar-manage{width:100%;margin-top:24px;font-size:12px}.tc-workspace{min-height:38px;padding:0 7px 16px}

.tc .tc-sidebar-close{display:none}.tc-workspace>span:last-of-type{margin-left:auto;font-size:11px}
@media(max-width:760px){.tc .tc-sidebar-close{display:flex;min-height:28px;padding:3px;border:0;background:none}}

.tc-identity-hint{padding:10px 7px 0;font-size:11px;color:var(--tc-muted)}.tc-member-binding{margin-top:12px}.tc-member-binding>button{align-self:flex-start;background:none;border:0;color:var(--tc-highlight-ink);font-size:12px;padding:2px 0}.tc-member-binding>input{font-family:ui-monospace,monospace;font-size:11px}
`;

// src/plugin.jsx
var inject = ["react", "pages", "agents", "host", "relay"];
function apply(ctx) {
  let alive = true;
  const subscribers = /* @__PURE__ */ new Set();
  const notify = () => {
    for (const fn of subscribers) fn();
  };
  ctx.effect(() => () => {
    alive = false;
  });
  ctx.effect(() => {
    if (!ctx.host.spawn) return;
    let disposed = false, process, buffer = "";
    ctx.host.spawn("calendar-events", { onStdout: (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        try {
          if (JSON.parse(line).revision !== void 0) notify();
        } catch {
        }
      }
      if (buffer.length > 8192) buffer = "";
    } }).then((p) => {
      if (disposed) p.kill();
      else process = p;
    }).catch(() => {
    });
    return () => {
      disposed = true;
      process?.kill();
      subscribers.clear();
    };
  });
  async function call(action, args = {}) {
    if (!alive) throw new Error("\u65E5\u5386\u63D2\u4EF6\u5DF2\u505C\u6B62");
    const viewer = ctx.relay.snapshot().viewer;
    if (!/^[0-9a-f]{64}$/.test(viewer || "")) throw new Error("\u8BF7\u5148\u767B\u5F55 Buzz\uFF0C\u518D\u6253\u5F00\u65E5\u5386");
    const input = JSON.stringify({ action, args, viewer });
    if (new TextEncoder().encode(input).length > 65536) throw new Error("\u672C\u6B21\u5185\u5BB9\u8FC7\u591A\uFF0C\u8BF7\u5206\u6279\u5BFC\u5165");
    const raw = await ctx.host.runCommand("calendar-client", input);
    if (!alive) throw new Error("\u65E5\u5386\u63D2\u4EF6\u5DF2\u505C\u6B62");
    if (ctx.relay.snapshot().viewer !== viewer) throw new Error("\u767B\u5F55\u7528\u6237\u5DF2\u5207\u6362\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u5B89\u6392\uFF1B\u5982\u6709\u4FDD\u5B58\u64CD\u4F5C\u8BF7\u5148\u6838\u5BF9\u56DE\u6267");
    if (!raw) throw new Error("\u65E0\u6CD5\u8FDE\u63A5\u65E5\u5386\u670D\u52A1\uFF0C\u8BF7\u786E\u8BA4\u670D\u52A1\u5DF2\u542F\u52A8\uFF1B\u82E5\u521A\u624D\u6B63\u5728\u4FDD\u5B58\uFF0C\u8BF7\u5148\u67E5\u8BE2\u64CD\u4F5C\u56DE\u6267");
    const result = JSON.parse(raw);
    if (!result.ok) {
      const error = new Error(result.error || "\u65E5\u5386\u670D\u52A1\u8BF7\u6C42\u5931\u8D25");
      error.status = result.status;
      throw error;
    }
    if (action === "write") notify();
    return result.data;
  }
  const App = createCalendarApp(ctx.react, { read: () => call("read"), write: (payload) => call("write", payload), operation: (id) => call("operation", { requestId: id }), subscribe: (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  } }, { styles: calendar_default });
  function Page() {
    const connection = ctx.react.useSyncExternalStore(ctx.relay.subscribe, ctx.relay.snapshot, ctx.relay.snapshot);
    return ctx.react.createElement(App, { key: `${connection.scope || connection.viewer || "signed-out"}:${connection.viewer || ""}:${connection.generation}` });
  }
  ctx.pages.register({ id: "main", title: "\u56E2\u961F\u65E5\u5386", primary: true, layout: "workspace", component: Page });
  for (const definition of toolDefinitions) ctx.agents.addTool({ ...definition, async call(client, context, args) {
    if (context.channel !== "b7491401-2c3f-4d20-8295-e5cda3c19661") throw new Error("\u65E5\u5386\u5DE5\u5177\u4EC5\u6388\u6743\u5F53\u524D\u201C\u8BBE\u8BA1\u56E2\u961F\u65E5\u5386\u63D2\u4EF6\u201D\u4F1A\u8BDD");
    if (client.key !== "936956c409fe0cc10f18ab8363b479b1f9c1bb6a9c6d8f0595f1b42cfce07003") throw new Error("\u8BE5 Agent \u5C1A\u672A\u83B7\u5F97\u6B64\u65E5\u5386\u8FDE\u63A5\u7684\u6388\u6743");
    const action = definition.name === "team_calendar_read" ? "read" : definition.name === "team_calendar_operation" ? "operation" : "write";
    return JSON.stringify(await call(action, args));
  } });
}
export {
  apply,
  inject
};

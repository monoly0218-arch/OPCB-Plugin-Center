export const inject = [
  "react",
  "pages",
  "panels",
  "relay",
  "conversation",
  "agents",
];

export function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const title = "任务中心";
  const company = false;
  const sourceChannel = "7dc199bc-755b-47bb-8f71-fe311b1f1ab1";
  const source = `buzz://channel/${sourceChannel}`;
  const text = (value) =>
    typeof value === "string" || typeof value === "number"
      ? String(value)
      : "—";

  function current() {
    const connection = ctx.relay.snapshot();
    if (
      connection.status !== "ready" ||
      connection.cached ||
      !connection.session?.viewer
    ) {
      throw new Error("请先连接当前账号的社区。");
    }
    return connection;
  }
  function check(connection) {
    const latest = current();
    if (
      latest.session !== connection.session ||
      latest.generation !== connection.generation ||
      latest.scope !== connection.scope
    ) {
      throw new Error("账号或社区已变化，请重新读取。");
    }
  }
  // The channel Canvas owns the new plan. This projection never imports old progress.
  async function read(connection) {
    check(connection);
    if (typeof connection.session.canvas?.read !== "function")
      throw new Error("当前宿主尚不能读取频道基线，请更新 Buzz。");
    const access = () => {
      check(connection);
      const list = connection.session.channels.list();
      const channel = list.channels.find((c) => c.id === sourceChannel);
      if (
        list.status !== "ready" ||
        !channel ||
        channel.archived ||
        channel.cached ||
        channel.metadataPending ||
        !channel.members?.includes(connection.session.viewer)
      )
        throw new Error("工作基线频道访问权限已变化，请核对当前成员身份。");
    };
    access();
    const event = await connection.session.canvas.read(sourceChannel);
    access();
    if (
      !event ||
      !/^[0-9a-f]{64}$/.test(event.id) ||
      typeof event.content !== "string"
    )
      throw new Error("指定频道没有可读取的工作基线。");
    const section = event.content.split("## 人员分工")[1]?.split(/\n## /)[0];
    if (!section) throw new Error("频道基线缺少人员分工，未回退到旧任务。");
    const rows = section
      .split("\n")
      .filter((line) => line.trim().startsWith("|"))
      .map((line) =>
        line
          .trim()
          .slice(1, -1)
          .split("|")
          .map((v) => v.trim()),
      );
    const headers = rows.shift() || [];
    const owners = headers.indexOf("负责人"),
      work = headers.indexOf("主要工作"),
      delivery = headers.indexOf("可检查的交付");
    if ([owners, work, delivery].some((index) => index < 0))
      throw new Error("人员分工表结构已变，请核对基线。");
    const heading = event.content.match(/^# (.+)$/m)?.[1] || "工作分配";
    const team = heading.split("｜")[0].trim();
    const tasks = rows
      .filter((row) => !row.every((cell) => /^[-: ]+$/.test(cell)))
      .map((row) => {
        const owner = row[owners]?.replace(/（.*$/, "").trim();
        const assignment = row[work];
        if (!owner || !assignment || !row[delivery])
          throw new Error("分工表有未填写的负责人或交付，未显示旧进度。");
        const project = row[headers.indexOf("项目")] || team;
        const clauses = assignment
          .split(/[。；]/)
          .map((v) => v.trim())
          .filter(Boolean);
        return {
          id:
            row[headers.indexOf("任务ID")] ||
            `baseline-${encodeURIComponent(owner)}`,
          title: clauses[0],
          assignee: owner,
          team,
          project,
          status: "planning",
          progress: 0,
          completionDefinition: row[delivery],
          steps: clauses.map((name) => ({ name, status: "planning" })),
        };
      });
    if (!tasks.length || new Set(tasks.map((t) => t.id)).size !== tasks.length)
      throw new Error("基线分工为空或人员重复，请先核对频道 Canvas。");
    return {
      tasks,
      baselineRevision: event.id,
      source,
      projection: "channel_baseline",
      syncedAt: new Date(event.created_at * 1000).toISOString(),
      companyMilestones: [
        {
          id: "baseline-goal",
          company: team,
          targetDate:
            heading
              .match(/(\d+)\s*月\s*(\d+)\s*日/)
              ?.slice(1)
              .join("月")
              ?.concat("日") || "未登记",
          title:
            event.content
              .split("## 共同目标")[1]
              ?.split(/\n## /)[0]
              ?.trim()
              .split("\n")[0]
              ?.replace(/\*\*/g, "") || heading,
          status: "planning",
        },
      ],
    };
  }

  const column = {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
  };
  const row = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "var(--space-2)",
    minWidth: 0,
  };
  const inset = { padding: "var(--space-panel-inset)" };
  const button = (label, onClick, props = {}) =>
    h("button", { type: "button", onClick, ...props }, label);
  function eligible(c, session, choices) {
    return (
      c.channelType === "solo" &&
      c.private === true &&
      c.creator === session.viewer &&
      !c.archived &&
      !c.readOnly &&
      !c.cached &&
      !c.pending &&
      !c.metadataPending &&
      c.members?.length === 2 &&
      c.members.includes(session.viewer) &&
      choices.selectable.some(
        (a) => a.pubkey !== session.viewer && c.members.includes(a.pubkey),
      )
    );
  }
  function Messages({ connection, channel }) {
    const session = connection.session;
    const subscribe = React.useCallback(
      (n) => session.channels.subscribeWindow(channel.id, n),
      [session, channel.id],
    );
    const snapshot = React.useCallback(
      () => session.channels.window(channel.id),
      [session, channel.id],
    );
    const messages = React.useSyncExternalStore(subscribe, snapshot, snapshot);
    const scroll = React.useRef(null),
      follow = React.useRef(true);
    React.useEffect(
      () => session.channels.ensure(channel.id),
      [session, channel.id],
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
      children: (interactions) =>
        h(
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
                follow.current =
                  v.scrollHeight - v.scrollTop - v.clientHeight < 80;
              },
            },
            messages.hasMore &&
              button(
                messages.loadingOlder ? "正在读取…" : "读取更早消息",
                () => {
                  follow.current = false;
                  session.channels.loadOlder(channel.id);
                },
                {
                  disabled:
                    messages.loadingOlder || messages.status !== "ready",
                },
              ),
            messages.error &&
              h("p", { role: "alert", style: inset }, messages.error),
            messages.status === "loading" &&
              h("p", { role: "status", style: inset }, "正在读取对话…"),
            messages.status === "ready" &&
              !messages.rows.length &&
              h("p", { style: inset }, "在此讨论当前工作"),
            messages.rows.map((m) =>
              h(ctx.conversation.ui.Message, {
                key: m.id,
                row: m,
                media: session.media,
                onOpenLink: interactions.onOpenLink,
                day: false,
                retry: session.messages.retry,
              }),
            ),
          ),
          h(ctx.conversation.ui.Composer, {
            session,
            scope: connection.scope,
            channelId: channel.id,
            channelName: channel.name,
            disabled: messages.status !== "ready",
          }),
        ),
    });
  }
  function Assistant({ connection, context, visible, onChannel }) {
    const session = connection.session;
    const list = React.useSyncExternalStore(
      session.channels.subscribeList,
      session.channels.list,
      session.channels.list,
    );
    const choices = React.useSyncExternalStore(
      session.agentChoices.subscribe,
      session.agentChoices.snapshot,
      session.agentChoices.snapshot,
    );
    const [selected, select] = React.useState("");
    React.useEffect(() => {
      session.channels.ensureList();
      session.agentChoices.ensure(true, true);
    }, [session]);
    const candidates =
      list.status === "ready"
        ? list.channels.filter((c) => eligible(c, session, choices))
        : [];
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
        style: { ...column, flex: 1, height: "100%" },
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
              onChange: (e) => select(e.target.value),
            },
            h("option", { value: "" }, "选择已有的 Solo"),
            candidates.map((c) =>
              h("option", { key: c.id, value: c.id }, c.name),
            ),
          ),
        ),
        h(
          "p",
          {
            className: "text-secondary",
            style: { margin: 0, overflowWrap: "anywhere" },
          },
          context,
        ),
        !channel &&
          h(
            "p",
            {
              role: "status",
              className: "text-secondary",
              style: { margin: 0 },
            },
            list.status === "loading" || choices.pending
              ? "正在读取私人对话…"
              : "选择本人和一个 Agent 的私人 Solo",
          ),
      ),
      visible &&
        channel &&
        h(Messages, { key: channel.id, connection, channel }),
    );
  }
  const clayAvatars = [];
  const clayPet = "";
  // Display-only projections of the existing archive. Missing facts stay missing.
  const statusGroups = [
    ["planning", "待办"],
    ["active", "进行中"],
    ["review", "验收中"],
    ["blocked", "已阻塞"],
    ["done", "已完成"],
  ];
  function phase(value) {
    if (["active", "in_progress", "running"].includes(value)) return "active";
    if (["review", "ready_for_review"].includes(value)) return "review";
    if (["done", "completed", "approved"].includes(value)) return "done";
    if (["blocked", "failed"].includes(value)) return "blocked";
    if (value === "cancelled") return "cancelled";
    return "planning";
  }
  const label = (value) =>
    statusGroups.find(([key]) => key === phase(value))?.[1] || "已取消";
  const tone = (value) =>
    ({
      active: "var(--blue-11)",
      blocked: "var(--text-danger)",
      review: "var(--text-warning)",
    })[phase(value)] || "var(--text-subtle)";
  const companyOf = (task) => task.company || task.team || "公司未登记";
  const projectOf = (task) => task.projectId || task.project || "项目未登记";
  const stepsOf = (task) =>
    Array.isArray(task.steps)
      ? task.steps
      : Array.isArray(task.milestones)
        ? task.milestones
        : [];
  const execution = (task) => {
    const values = [
      task.lastExecutedAt,
      task.executedAt,
      ...stepsOf(task).map((step) => step.lastExecutedAt || step.executedAt),
    ];
    return (
      values
        .filter(
          (v) =>
            typeof v === "string" &&
            /^\d{4}-\d\d-\d\dT/.test(v) &&
            Number.isFinite(Date.parse(v)) &&
            Date.parse(v) <= Date.now(),
        )
        .sort()
        .at(-1) || null
    );
  };
  const dateText = (value) =>
    value
      ? new Date(value).toLocaleString("zh-CN", { hour12: false })
      : "未登记";
  const percent = (value) =>
    Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
  const card = {
    ...column,
    padding: "var(--space-5)",
    gap: "var(--space-4)",
    textAlign: "start",
    whiteSpace: "normal",
    height: "auto",
    alignItems: "stretch",
    flexShrink: 0,
    overflowWrap: "anywhere",
    background: "var(--surface-popover)",
    border: 0,
    borderRadius: "var(--radius-row)",
    boxShadow:
      "var(--shadow-sm), inset 0 1px 0 var(--rim-lit), inset 0 -1px 0 var(--rim-shade)",
  };
  const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 17rem), 1fr))",
    alignItems: "start",
    gap: "var(--space-5)",
  };
  const heading = (value, level = "h2") =>
    h(
      level,
      { className: "text-body-lg", style: { margin: 0, fontWeight: 500 } },
      value,
    );
  function Signal({ status }) {
    return h(
      "span",
      { style: { ...row, gap: "var(--space-2)", color: tone(status) } },
      h("span", {
        "aria-hidden": true,
        style: {
          width: "0.5rem",
          height: "0.5rem",
          borderRadius: "50%",
          background: "currentColor",
          flexShrink: 0,
        },
      }),
      label(status),
    );
  }
  const clayCard = {
    ...card,
    borderRadius: "1.5rem",
    background:
      "linear-gradient(145deg, var(--surface-popover), var(--surface-inset))",
    border: "1px solid var(--border-standard)",
    borderTopColor: "var(--rim-lit)",
    boxShadow:
      "inset 0 1px 0 var(--rim-lit), 0 5px 0 var(--border-standard), var(--shadow-sm)",
  };
  const sizedGrid = (size) => ({
    ...grid,
    alignItems: "stretch",
    gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${size}), 1fr))`,
  });
  function Avatar({ name, small = false }) {
    const portrait =
      clayAvatars[{ 潘涛: 2, Steven: 0, 周阳: 4, 李浩: 3, 小卢: 1 }[name]];
    return h(
      "span",
      {
        "aria-hidden": true,
        title: name,
        style: {
          display: "inline-block",
          width: small ? "2rem" : "4.25rem",
          height: small ? "2rem" : "4.25rem",
          flexShrink: 0,
          borderRadius: "50%",
          overflow: "hidden",
          background: "var(--surface-inset)",
          boxShadow:
            "inset 0 2px 3px var(--rim-lit), 0 3px 0 var(--border-standard), var(--shadow-sm)",
        },
      },
      portrait
        ? h("img", {
            src: portrait,
            alt: "",
            draggable: false,
            style: {
              width: "125%",
              height: "125%",
              maxWidth: "none",
              objectFit: "contain",
              display: "block",
              transform: "translate(-10%, -10%)",
            },
          })
        : h(
            "span",
            {
              style: {
                display: "grid",
                placeItems: "center",
                height: "100%",
                fontSize: small ? "1rem" : "1.5rem",
              },
            },
            String(name || "未").slice(0, 1),
          ),
    );
  }
  function Ring({ done, total }) {
    return h(
      "svg",
      {
        viewBox: "0 0 100 100",
        width: 76,
        height: 76,
        role: "img",
        "aria-label": `${total}项中完成${done}项`,
        style: { flexShrink: 0 },
      },
      h("circle", {
        cx: 50,
        cy: 50,
        r: 40,
        fill: "none",
        stroke: "var(--border-standard)",
        strokeWidth: 7,
      }),
      h("circle", {
        cx: 50,
        cy: 50,
        r: 40,
        fill: "none",
        stroke: "var(--text-standard)",
        strokeWidth: 7,
        strokeDasharray: 251.33,
        strokeDashoffset: total ? 251.33 * (1 - done / total) : 251.33,
        transform: "rotate(-90 50 50)",
      }),
    );
  }
  function Choices({ name, value, values, onChange }) {
    return h(
      "div",
      { role: "group", "aria-label": name, style: row },
      values.map(([key, title]) =>
        button(title, () => onChange(key), {
          key,
          "aria-pressed": value === key,
        }),
      ),
    );
  }
  function Pet({ open, setOpen, parent }) {
    const [position, setPosition] = React.useState({ x: 1, y: 1 });
    const drag = React.useRef(null),
      suppress = React.useRef(false);
    function finish(event, cancel = false) {
      const active = drag.current;
      if (!active || active.id !== event.pointerId) return;
      drag.current = null;
      suppress.current = active.moved;
      if (cancel) setPosition(active.start);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    }
    return h(
      "button",
      {
        type: "button",
        "aria-label": open ? "收起助手" : "打开助手",
        "aria-expanded": open,
        title: "拖动移动，Alt＋方向键移动，点击打开助手",
        style: {
          position: "absolute",
          zIndex: 3,
          left: `calc(${position.x * 100}% - ${position.x * 88}px)`,
          top: `calc(${position.y * 100}% - ${position.y * 88}px)`,
          width: 88,
          height: 88,
          padding: "var(--space-1)",
          border: 0,
          background: "transparent",
          touchAction: "none",
          cursor: "grab",
        },
        onPointerDown: (e) => {
          if (e.button !== 0) return;
          const bounds = parent.current.getBoundingClientRect();
          drag.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            start: position,
            width: Math.max(1, bounds.width - 88),
            height: Math.max(1, bounds.height - 88),
            moved: false,
          };
          suppress.current = false;
          e.currentTarget.setPointerCapture?.(e.pointerId);
        },
        onPointerMove: (e) => {
          const active = drag.current;
          if (!active || active.id !== e.pointerId) return;
          const dx = e.clientX - active.x,
            dy = e.clientY - active.y;
          if (Math.hypot(dx, dy) > 5) active.moved = true;
          if (active.moved)
            setPosition({
              x: Math.max(0, Math.min(1, active.start.x + dx / active.width)),
              y: Math.max(0, Math.min(1, active.start.y + dy / active.height)),
            });
        },
        onPointerUp: (e) => finish(e),
        onPointerCancel: (e) => finish(e, true),
        onLostPointerCapture: (e) => finish(e, true),
        onClick: () => {
          if (suppress.current) {
            suppress.current = false;
            return;
          }
          setOpen(!open);
        },
        onKeyDown: (e) => {
          const direction = {
            ArrowLeft: [-0.05, 0],
            ArrowRight: [0.05, 0],
            ArrowUp: [0, -0.05],
            ArrowDown: [0, 0.05],
          }[e.key];
          if (!e.altKey || !direction) return;
          e.preventDefault();
          setPosition((p) => ({
            x: Math.max(0, Math.min(1, p.x + direction[0])),
            y: Math.max(0, Math.min(1, p.y + direction[1])),
          }));
        },
      },
      h("img", {
        src: clayPet,
        alt: "",
        draggable: false,
        style: {
          width: "100%",
          height: "100%",
          objectFit: "contain",
          pointerEvents: "none",
        },
      }),
    );
  }
  let bridge;
  function Workspace({ connection, panel = false }) {
    const roster = React.useSyncExternalStore(
      connection.session.channels.subscribeList,
      connection.session.channels.list,
      connection.session.channels.list,
    );
    const sourceMember = roster.channels.find((c) => c.id === sourceChannel);
    const sourceAllowed =
      roster.status === "ready" &&
      sourceMember &&
      !sourceMember.archived &&
      !sourceMember.cached &&
      !sourceMember.metadataPending &&
      sourceMember.members?.includes(connection.session.viewer);
    React.useEffect(() => {
      connection.session.channels.ensureList();
    }, [connection.session]);
    const [state, setState] = React.useState({ loading: true });
    const [refresh, setRefresh] = React.useState(0);
    const [selected, select] = React.useState(""),
      [project, selectProject] = React.useState("");
    const [period, setPeriod] = React.useState(7),
      [milestoneCompany, setMilestoneCompany] = React.useState("");
    const [view, setView] = React.useState("list"),
      [overview, setOverview] = React.useState("board");
    const [focusId, setFocusId] = React.useState("");
    const [team, setTeam] = React.useState(""),
      [person, setPerson] = React.useState("");
    const [chat, showChat] = React.useState(false),
      [compact, setCompact] = React.useState(false);
    const listScroll = React.useRef(0);
    const root = React.useRef(null),
      listRef = React.useRef(null),
      backRef = React.useRef(null);
    React.useEffect(() => {
      const observer = new ResizeObserver(([e]) =>
        setCompact(e.contentRect.width < 820),
      );
      if (root.current) observer.observe(root.current);
      return () => observer.disconnect();
    }, [sourceAllowed]);
    const owner = React.useMemo(
      () => ({
        connection,
        channel: "",
        linkVersion: 0,
        selected: "",
        focus: (id, data) => {
          setState({ data, loading: false });
          select(id);
        },
      }),
      [connection.session, connection.scope, connection.generation],
    );
    const onChannel = React.useCallback(
      (id) => {
        if (owner.channel !== id) owner.linkVersion++;
        owner.channel = id;
      },
      [owner],
    );
    owner.selected = selected;
    React.useEffect(() => {
      if (panel) return;
      bridge = owner;
      return () => {
        if (bridge === owner) bridge = undefined;
      };
    }, [owner, panel]);
    React.useEffect(() => {
      if (!sourceAllowed) {
        setState({ loading: false });
        return;
      }
      let active = true;
      setState((p) => ({ ...p, loading: true, error: "" }));
      read(connection).then(
        (data) => {
          if (active) setState({ data, loading: false });
        },
        (error) => {
          if (active)
            setState((p) => ({ ...p, loading: false, error: error.message }));
        },
      );
      return () => {
        active = false;
      };
    }, [
      connection.session,
      connection.generation,
      connection.scope,
      refresh,
      sourceAllowed,
    ]);
    const tasks = state.data?.tasks || [],
      chosen = tasks.find((t) => t.id === selected);
    const projects = [...new Set(tasks.map(projectOf))];
    const projectTasks = tasks.filter(
      (t) =>
        (!project || projectOf(t) === project) &&
        (!person || t.assignee === person) &&
        (!team || companyOf(t) === team),
    );
    const companyNames = [...new Set(tasks.map(companyOf))];
    const context = chosen
      ? `当前任务 ${chosen.id} · 频道基线`
      : "可读取同一份频道工作基线，不写业务进度。";
    const reload = () => setRefresh((r) => r + 1);
    function closeDetail() {
      const id = selected;
      select("");
      requestAnimationFrame(() => {
        if (!listRef.current) return;
        listRef.current.scrollTop = listScroll.current;
        [...listRef.current.querySelectorAll("[data-task-id]")]
          .find((node) => node.dataset.taskId === id)
          ?.focus({ preventScroll: true });
      });
    }
    function picker(name, value, set, values) {
      return h(
        "label",
        { style: row },
        name,
        h(
          "select",
          {
            "aria-label": name,
            value,
            onChange: (e) => set(e.target.value),
            style: { maxWidth: "100%" },
          },
          h("option", { value: "" }, `全部${name}`),
          values.map((v) => h("option", { key: v, value: v }, v)),
        ),
      );
    }
    function sourceDetails() {
      return h(
        "details",
        { style: { ...inset, flexShrink: 0 } },
        h("summary", null, "来源与同步"),
        h(
          "p",
          { style: { overflowWrap: "anywhere" } },
          `${source} · ${state.data?.baselineRevision?.slice(0, 12) || "未读取"} · ${text(state.data?.syncedAt)}`,
        ),
        h(
          "p",
          null,
          "旧任务和旧完成数已退出；此页按频道分工从零登记，尚未接通实际执行进度。",
        ),
        button("重新读取", reload, { disabled: state.loading }),
      );
    }
    function steps(task) {
      const values = stepsOf(task);
      return values.length
        ? h(
            "ol",
            {
              "aria-label": "任务步骤",
              style: {
                ...column,
                gap: "var(--space-4)",
                padding: 0,
                margin: 0,
                listStyle: "none",
              },
            },
            values.map((step, i) =>
              h(
                "li",
                {
                  key: step.id || i,
                  style: {
                    ...row,
                    alignItems: "start",
                    flexWrap: "nowrap",
                    color: tone(step.status),
                  },
                },
                h(
                  "span",
                  {
                    style: {
                      border: "1px solid currentColor",
                      borderRadius: "50%",
                      minWidth: "1.75rem",
                      height: "1.75rem",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    },
                  },
                  phase(step.status) === "done" ? "✓" : i + 1,
                ),
                h(
                  "div",
                  { style: column },
                  h(
                    "strong",
                    { style: { fontWeight: 500, overflowWrap: "anywhere" } },
                    text(step.name || step.title),
                  ),
                  h(Signal, { status: step.status }),
                ),
              ),
            ),
          )
        : h("p", { role: "status" }, "任务步骤尚未登记");
    }
    function taskCard(task, expanded = false) {
      const values = stepsOf(task),
        done = values.filter((s) => phase(s.status) === "done").length;
      return h(
        "div",
        {
          key: task.id,
          className: "ui-card",
          style: { ...card, padding: "var(--space-4)" },
        },
        button(
          h(
            React.Fragment,
            null,
            h(
              "strong",
              {
                className: "text-body-lg",
                style: {
                  display: "block",
                  textAlign: "start",
                  whiteSpace: "normal",
                },
              },
              task.title,
            ),
            h(
              "span",
              {
                style: {
                  ...row,
                  marginTop: "var(--space-3)",
                  justifyContent: "space-between",
                },
              },
              h(Signal, { status: task.status }),
              values.length
                ? `${done} / ${values.length} 任务完成`
                : "步骤未登记",
            ),
          ),
          () => select(task.id),
          {
            "aria-label": `查看任务 ${task.title}`,
            "data-task-id": task.id,
            style: {
              height: "auto",
              whiteSpace: "normal",
              textAlign: "start",
              width: "100%",
            },
          },
        ),
        expanded
          ? steps(task)
          : h("details", null, h("summary", null, "任务进度"), steps(task)),
      );
    }
    function taskViews() {
      const sorted = [...projectTasks].sort((a, b) =>
        (execution(b) || "").localeCompare(execution(a) || ""),
      );
      return h(
        React.Fragment,
        null,
        h(
          "div",
          { style: { ...row, marginBottom: "var(--space-4)" } },
          picker(
            "项目",
            project,
            (value) => {
              selectProject(value);
              if (!value) setOverview("tasks");
            },
            projects,
          ),
          picker("负责人", person, setPerson, [
            ...new Set(tasks.map((t) => t.assignee || "未分配")),
          ]),
          button("清空筛选", () => {
            selectProject("");
            setOverview("tasks");
            setPerson("");
            setTeam("");
          }),
        ),
        h(Choices, {
          name: "任务视图",
          value: view,
          onChange: setView,
          values: [
            ["list", "清单"],
            ["focus", "聚焦一件事"],
            ["status", "状态分组"],
            ["time", "执行时间"],
          ],
        }),
        h(
          "div",
          {
            style: {
              ...column,
              gap: "var(--space-4)",
              marginTop: "var(--space-5)",
            },
          },
          !projectTasks.length && h("p", { role: "status" }, "没有匹配任务"),
          view === "focus"
            ? h(
                React.Fragment,
                null,
                h(
                  "div",
                  { role: "group", "aria-label": "聚焦任务", style: row },
                  projectTasks.map((t, i) =>
                    button(i + 1, () => setFocusId(t.id), {
                      key: t.id,
                      "aria-label": `聚焦 ${t.title}`,
                      "aria-pressed": (focusId || projectTasks[0]?.id) === t.id,
                    }),
                  ),
                ),
                projectTasks.length > 0 &&
                  taskCard(
                    projectTasks.find((t) => t.id === focusId) ||
                      projectTasks[0],
                    true,
                  ),
              )
            : view === "status"
              ? statusGroups.map(([key, title]) => {
                  const items = projectTasks.filter(
                    (t) => phase(t.status) === key,
                  );
                  return h(
                    "section",
                    { key, style: { ...column, gap: "var(--space-3)" } },
                    heading(`${title} ${items.length}`, "h3"),
                    items.map((t) => taskCard(t)),
                  );
                })
              : view === "time"
                ? h(
                    React.Fragment,
                    null,
                    sorted
                      .filter(execution)
                      .map((t) =>
                        h(
                          "section",
                          { key: t.id },
                          h("p", null, dateText(execution(t))),
                          taskCard(t),
                        ),
                      ),
                    heading("执行时间未登记", "h3"),
                    sorted.filter((t) => !execution(t)).map((t) => taskCard(t)),
                  )
                : projectTasks.map((t) => taskCard(t)),
        ),
      );
    }
    function projectCard(name) {
      const items = tasks.filter((t) => projectOf(t) === name),
        done = items.filter((t) => phase(t.status) === "done").length;
      return button(
        h(
          React.Fragment,
          null,
          h(
            "strong",
            {
              className: "text-heading",
              style: { fontSize: "1.125rem", lineHeight: 1.6, fontWeight: 600 },
            },
            text(items[0]?.project || name),
          ),
          h(
            "span",
            {
              className: "text-body-lg",
              style: { color: "var(--text-subtle)", fontSize: "1rem" },
            },
            `${done} / ${items.length} 任务完成`,
          ),
          h(
            "span",
            {
              style: {
                ...row,
                gap: ".35rem",
                marginTop: ".85rem",
                color: "var(--text-subtle)",
                fontSize: "1rem",
              },
            },
            [
              companyOf(items[0]),
              ...new Set(items.map((t) => t.assignee || "未分配")),
            ].map((name) =>
              h(
                "span",
                {
                  key: name,
                  style: {
                    borderRadius: "var(--radius-pill)",
                    padding: ".25rem .7rem",
                    background: "var(--affordance-subtle)",
                  },
                },
                name,
              ),
            ),
          ),
        ),
        () => {
          selectProject(name);
          setView("list");
        },
        {
          key: name,
          className: "ui-card",
          "aria-label": `查看项目 ${text(items[0]?.project || name)}`,
          style: { ...card, width: "100%", minHeight: "10rem", gap: "1.25rem" },
        },
      );
    }
    function projectOverview() {
      const names = projects.filter((p) =>
        tasks.some(
          (t) => projectOf(t) === p && (!team || companyOf(t) === team),
        ),
      );
      const stateFor = (name) => {
        const items = tasks.filter((t) => projectOf(t) === name);
        return (
          ["blocked", "active", "review", "planning", "done"].find((s) =>
            items.some((t) => phase(t.status) === s),
          ) || "planning"
        );
      };
      return h(
        React.Fragment,
        null,
        h(
          "div",
          { style: { ...row, marginBottom: "var(--space-5)" } },
          picker("团队", team, setTeam, companyNames),
          h(Choices, {
            name: "项目视图",
            value: overview,
            onChange: setOverview,
            values: [
              ["list", "列表"],
              ["board", "看板"],
            ],
          }),
          button("全部任务", () => {
            selectProject("");
            setOverview("tasks");
          }),
        ),
        overview === "tasks"
          ? taskViews()
          : overview === "list"
            ? h("div", { style: grid }, names.map(projectCard))
            : h(
                "div",
                {
                  "aria-label": "项目状态看板",
                  style: {
                    display: "grid",
                    gridTemplateColumns: "repeat(5, minmax(14rem, 1fr))",
                    minHeight: "calc(100dvh - 16rem)",
                    gap: "var(--space-4)",
                    overflowX: "auto",
                    alignItems: "stretch",
                    paddingBottom: "var(--space-3)",
                  },
                },
                statusGroups.map(([key]) => {
                  const values = names.filter((p) => stateFor(p) === key);
                  return h(
                    "section",
                    {
                      key,
                      style: {
                        ...column,
                        flex: "1 0 13rem",
                        gap: "var(--space-4)",
                        padding: "var(--space-4)",
                        background: "var(--surface-inset)",
                        borderRadius: "var(--radius-container)",
                      },
                    },
                    h(
                      "div",
                      { style: { ...row, justifyContent: "space-between" } },
                      h(Signal, { status: key }),
                      h(
                        "span",
                        { style: { color: "var(--text-subtle)" } },
                        values.length,
                      ),
                    ),
                    values.map(projectCard),
                  );
                }),
              ),
      );
    }
    function companyOverview() {
      const recent = tasks.filter(
        (t) =>
          !execution(t) ||
          Date.now() - Date.parse(execution(t)) < period * 86400000,
      );
      const undated = tasks.filter((t) => !execution(t));
      const rank = (a, b) =>
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
        (a.manualRank ?? 100) - (b.manualRank ?? 100) ||
        (a.priorityCode || "P3").localeCompare(b.priorityCode || "P3");
      const people = [...new Set(tasks.map((t) => t.assignee || "未分配"))];
      const milestones = Array.isArray(state.data?.companyMilestones)
        ? state.data.companyMilestones
        : [];
      const selectedCompany = milestoneCompany || companyNames[0];
      return h(
        "div",
        { style: { ...column, gap: "var(--space-8)" } },
        h(
          "section",
          {
            "aria-label": "每个人的第一件事",
            style: { ...column, gap: "var(--space-5)" },
          },
          h(
            "div",
            { style: { ...row, justifyContent: "space-between" } },
            heading("每个人的第一件事"),
            h("span", null, `${people.length} 人`),
          ),
          h(
            "div",
            { style: sizedGrid("13rem") },
            people.map((name) => {
              const own = tasks
                .filter(
                  (t) =>
                    (t.assignee || "未分配") === name &&
                    !["done", "cancelled"].includes(phase(t.status)),
                )
                .sort(rank);
              const first =
                own.find((t) => phase(t.status) === "active") || own[0];
              return button(
                h(
                  React.Fragment,
                  null,
                  h(
                    "span",
                    { style: row },
                    h(Avatar, { name }),
                    h("strong", null, name),
                  ),
                  h(
                    "strong",
                    {
                      className: "text-heading",
                      style: {
                        minHeight: "3.75rem",
                        fontSize: "1.25rem",
                        lineHeight: 1.5,
                        fontWeight: 500,
                      },
                    },
                    first?.title || "暂无待办",
                  ),
                  first &&
                    h(
                      "span",
                      {
                        style: {
                          ...row,
                          justifyContent: "space-between",
                          marginTop: "auto",
                        },
                      },
                      h("span", null, first.project),
                      h(Signal, { status: first.status }),
                    ),
                ),
                () => first && select(first.id),
                {
                  key: name,
                  className: "ui-card",
                  "aria-label": `${name}的首要任务`,
                  "data-task-id": first?.id,
                  disabled: !first,
                  style: {
                    ...clayCard,
                    height: "100%",
                    gap: "1.125rem",
                    minHeight: "14.75rem",
                    width: "100%",
                  },
                },
              );
            }),
          ),
        ),
        h(
          "section",
          {
            "aria-label": "公司进度",
            style: { ...column, gap: "var(--space-5)" },
          },
          h(
            "div",
            { style: { ...row, justifyContent: "space-between" } },
            heading("公司进度"),
            h(Choices, {
              name: "执行周期",
              value: period,
              onChange: setPeriod,
              values: [
                [1, "1 天"],
                [7, "7 天"],
                [30, "30 天"],
              ],
            }),
          ),
          h(
            "div",
            { style: sizedGrid("20rem") },
            companyNames.map((name) => {
              const items = recent.filter((t) => companyOf(t) === name),
                done = items.filter((t) => phase(t.status) === "done").length;
              const all = tasks.filter((t) => companyOf(t) === name);
              return h(
                "article",
                {
                  key: name,
                  className: "ui-card",
                  style: {
                    ...clayCard,
                    minHeight: items.length ? "23rem" : "12rem",
                  },
                },
                h(
                  "div",
                  { style: row },
                  h(
                    "span",
                    {
                      "aria-hidden": true,
                      style: {
                        display: "grid",
                        placeItems: "center",
                        width: "2.75rem",
                        height: "2.75rem",
                        borderRadius: "1rem",
                        background: "var(--surface-inset)",
                        boxShadow:
                          "inset 0 1px 0 var(--rim-lit), 0 3px 0 var(--border-standard)",
                      },
                    },
                    name === "公司未登记" ? "—" : name.slice(0, 1),
                  ),
                  heading(name, "h3"),
                ),
                h(
                  "div",
                  { style: { ...row, justifyContent: "space-between" } },
                  h(
                    "span",
                    { style: column },
                    h(
                      "strong",
                      {
                        className: "text-title",
                        style: {
                          fontSize: "2.75rem",
                          lineHeight: 1.1,
                          fontWeight: 500,
                        },
                      },
                      done,
                      h(
                        "span",
                        {
                          style: {
                            fontSize: "1.25rem",
                            color: "var(--text-subtle)",
                          },
                        },
                        ` / ${items.length}`,
                      ),
                    ),
                    h("span", null, "基线分工已完成"),
                  ),
                  h(Ring, { done, total: items.length }),
                ),
                items.length > 0 &&
                  h(
                    "div",
                    { style: row },
                    ["active", "blocked"].map((status) =>
                      h(
                        "span",
                        { key: status, style: row },
                        h(Signal, { status }),
                        items.filter((t) => phase(t.status) === status).length,
                      ),
                    ),
                  ),
                items.slice(0, 3).map((t) =>
                  button(
                    h(
                      React.Fragment,
                      null,
                      h(Avatar, {
                        name: t.assignee,
                        small: true,
                      }),
                      t.title,
                    ),
                    () => select(t.id),
                    {
                      key: t.id,
                      style: {
                        height: "auto",
                        whiteSpace: "normal",
                        textAlign: "start",
                      },
                    },
                  ),
                ),
                !items.length &&
                  h(
                    "p",
                    { role: "status", style: { margin: 0 } },
                    "当前周期没有已登记执行记录",
                  ),
                button(
                  h(
                    React.Fragment,
                    null,
                    `全部 ${all.length} 项`,
                    h("span", { "aria-hidden": true }, "→"),
                  ),
                  () => {
                    setTeam(name);
                    setOverview("tasks");
                    setPerson("");
                    selectProject("");
                  },
                  {
                    style: {
                      ...row,
                      justifyContent: "space-between",
                      marginTop: "auto",
                      border: 0,
                      borderTop: "1px solid var(--border-standard)",
                      borderRadius: 0,
                      padding: "1rem 0 0",
                      background: "transparent",
                      width: "100%",
                    },
                  },
                ),
              );
            }),
          ),
          undated.length > 0 &&
            h(
              "details",
              null,
              h("summary", null, `执行时间未登记 · ${undated.length} 项`),
              h(
                "div",
                { style: { ...grid, marginTop: "var(--space-4)" } },
                undated.map((t) => taskCard(t)),
              ),
            ),
        ),
        h(
          "section",
          {
            "aria-label": "公司里程碑",
            style: { ...column, gap: "var(--space-5)" },
          },
          h(
            "div",
            { style: { ...row, justifyContent: "space-between" } },
            heading("公司里程碑"),
            h(Choices, {
              name: "里程碑公司",
              value: selectedCompany,
              onChange: setMilestoneCompany,
              values: companyNames.map((n) => [n, n]),
            }),
          ),
          h(
            "div",
            { style: sizedGrid("16rem") },
            milestones
              .filter((m) => m.company === selectedCompany)
              .map((m, i) =>
                h(
                  "article",
                  { key: m.id || i, className: "ui-card", style: clayCard },
                  h("span", null, text(m.targetDate)),
                  heading(m.title, "h3"),
                  h(Signal, { status: m.status }),
                ),
              ),
          ),
          !milestones.some((m) => m.company === selectedCompany) &&
            h(
              "div",
              {
                role: "status",
                style: {
                  ...clayCard,
                  minHeight: "10rem",
                  justifyContent: "center",
                  alignItems: "center",
                  color: "var(--text-subtle)",
                },
              },
              "公司里程碑尚未登记",
            ),
        ),
      );
    }
    function detail() {
      const values = stepsOf(chosen),
        done = values.filter((s) => phase(s.status) === "done").length;
      const progress = values.length
        ? (done / values.length) * 100
        : percent(chosen.progress);
      return h(
        "article",
        {
          "aria-label": "任务详情",
          style: {
            ...column,
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            lineHeight: 1.6,
          },
        },
        h(
          "div",
          {
            style: {
              ...column,
              paddingBlock: "var(--space-5)",
              gap: "var(--space-4)",
              overflow: "auto",
              flex: "0 0 auto",
              width: "calc(100% - 2rem)",
              maxWidth: "44rem",
              alignSelf: "center",
            },
          },
          h(
            "div",
            { style: row },
            button("关闭任务详情", closeDetail, { ref: backRef }),
            h("span", null, chosen.project),
          ),
          h(
            "h2",
            {
              className: "text-heading",
              style: { margin: 0, lineHeight: 1.6, fontWeight: 600 },
            },
            chosen.title,
          ),
          h(Signal, { status: chosen.status }),
          h(
            "div",
            { style: { ...row, justifyContent: "space-between" } },
            heading("任务进度", "h3"),
            h(
              "span",
              null,
              values.length
                ? `${done} / ${values.length} 任务完成`
                : "步骤未登记",
            ),
          ),
          progress !== null &&
            h(
              "div",
              {
                role: "progressbar",
                "aria-valuemin": 0,
                "aria-valuemax": 100,
                "aria-valuenow": progress,
                "aria-label": "任务完成进度",
                style: {
                  height: ".5rem",
                  width: "100%",
                  overflow: "hidden",
                  borderRadius: "var(--radius-pill)",
                  background: "var(--surface-inset)",
                },
              },
              h("div", {
                style: {
                  height: "100%",
                  width: `${progress}%`,
                  background: "var(--blue-11)",
                },
              }),
            ),
          steps(chosen),
          h("p", null, `最近执行 · ${dateText(execution(chosen))}`),
          h(
            "details",
            null,
            h("summary", null, "任务资料"),
            h("p", null, `${chosen.assignee || "未分配"} · ${chosen.id}`),
            h("h3", null, "完成定义"),
            h(
              "p",
              { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } },
              chosen.completionDefinition || "未登记",
            ),
          ),
        ),
        !panel &&
          !company &&
          h(
            "div",
            {
              "aria-label": "任务对话",
              style: {
                ...column,
                width: "100%",
                maxWidth: "52rem",
                alignSelf: "center",
                flex: "0 0 auto",
                height: "clamp(30rem, 60vh, 48rem)",
                paddingTop: "2rem",
                background:
                  "linear-gradient(to bottom, transparent, var(--surface-panel))",
              },
            },
            h(Assistant, {
              key: chosen.id,
              connection,
              context: `${context} · 选择该任务的私人对话`,
              visible: true,
              onChannel,
            }),
          ),
        company &&
          button("打开助手讨论此任务", () => showChat(true), {
            style: { alignSelf: "start", margin: "var(--space-4)" },
          }),
      );
    }
    if (!sourceAllowed)
      return h(
        "p",
        { role: "alert", style: inset },
        "当前账号尚不能读取工作基线频道，请检查成员权限。",
      );
    return h(
      "div",
      {
        ref: root,
        style: {
          ...column,
          height: "100%",
          position: "relative",
          overflow: "hidden",
          fontSize: "var(--text-label)",
          lineHeight: "var(--text-label--line-height)",
          color: "var(--text-standard)",
        },
      },
      !panel &&
        h(
          "header",
          {
            style: {
              ...row,
              ...inset,
              flexShrink: 0,
              borderBottom: "1px solid var(--border-standard)",
            },
          },
          h(
            "h1",
            { className: "text-label", style: { margin: 0, flex: 1 } },
            title,
          ),
          !company &&
            !chosen &&
            button(chat ? "收起助手" : "打开助手", () => showChat(!chat), {
              "aria-expanded": chat,
            }),
        ),
      h(
        "div",
        { role: "status", style: { ...row, ...inset, flexShrink: 0 } },
        state.loading ? "正在读取任务…" : `频道基线 · ${tasks.length} 项`,
        state.data &&
          h(
            "span",
            null,
            `来源更新 ${String(state.data.syncedAt || "未登记").slice(0, 10)}`,
          ),
        state.error &&
          h(
            "div",
            { role: "alert" },
            state.error,
            "；保留上次结果 ",
            button("重试", reload),
          ),
      ),
      h(
        "div",
        { style: { display: "flex", flex: 1, minHeight: 0, minWidth: 0 } },
        h(
          "div",
          {
            style: {
              ...column,
              flex: 1,
              display:
                compact && chat && (company || !chosen) ? "none" : "flex",
            },
          },
          chosen
            ? detail()
            : h(
                "div",
                {
                  ref: listRef,
                  "aria-label": "任务列表",
                  onScroll: (event) => {
                    listScroll.current = event.currentTarget.scrollTop;
                  },
                  style: { ...inset, flex: 1, overflow: "auto", minWidth: 0 },
                },
                project &&
                  h(
                    "div",
                    { style: { ...row, marginBottom: "var(--space-5)" } },
                    button("全部项目", () => {
                      selectProject("");
                      setOverview("board");
                    }),
                    heading(String(project)),
                  ),
                company &&
                  !panel &&
                  overview === "tasks" &&
                  button("返回公司看板", () => {
                    setOverview("board");
                    setTeam("");
                    selectProject("");
                  }),
                state.data &&
                  (!company || panel || overview === "tasks" || project
                    ? panel || project || overview === "tasks"
                      ? taskViews()
                      : projectOverview()
                    : companyOverview()),
                !state.loading &&
                  !tasks.length &&
                  h("p", { role: "status" }, "当前基线没有任务"),
              ),
          sourceDetails(),
        ),
        chat &&
          !panel &&
          (company || !chosen) &&
          h(
            "aside",
            {
              "aria-label": "工作助手",
              onKeyDown: (event) => {
                if (event.key === "Escape" && !event.defaultPrevented) {
                  event.stopPropagation();
                  showChat(false);
                  root.current
                    ?.querySelector('button[title^="拖动移动"]')
                    ?.focus();
                }
              },
              style: {
                ...column,
                width: compact ? "100%" : "min(44%, 30rem)",
                ...(company && !compact
                  ? {
                      position: "absolute",
                      zIndex: 2,
                      insetInlineEnd: "var(--space-4)",
                      bottom: "6rem",
                      width: "min(44%, 30rem)",
                      height: "min(75%, 40rem)",
                      borderRadius: "var(--radius-container)",
                      boxShadow: "var(--elevation-popover)",
                    }
                  : {}),
                flexShrink: 0,
                background:
                  "linear-gradient(to bottom, transparent, var(--surface-panel))",
              },
            },
            button("收起助手", () => showChat(false), {
              "aria-label": "关闭工作助手",
            }),
            h(Assistant, { connection, context, visible: true, onChannel }),
          ),
      ),
      company &&
        !panel &&
        h(Pet, { open: chat, setOpen: showChat, parent: root }),
    );
  }
  function Page({ panel = false } = {}) {
    const connection = React.useSyncExternalStore(
      ctx.relay.subscribe,
      ctx.relay.snapshot,
      ctx.relay.snapshot,
    );
    const visit = React.useMemo(
      () => ({}),
      [connection.session, connection.generation, connection.scope],
    );
    const previous = React.useRef();
    const sequence = React.useRef(0);
    if (previous.current !== visit) {
      previous.current = visit;
      sequence.current++;
    }
    return connection.status === "ready" &&
      !connection.cached &&
      connection.session?.viewer
      ? h(Workspace, {
          key: sequence.current,
          connection,
          panel,
        })
      : h(
          "p",
          { style: inset, role: "status" },
          "连接当前账号的社区后可读取任务。",
        );
  }
  ctx.pages.register({
    icon: "data:image/svg+xml;base64,PHN2ZwogIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICB3aWR0aD0iMjQiCiAgaGVpZ2h0PSIyNCIKICB2aWV3Qm94PSIwIDAgMjQgMjQiCiAgZmlsbD0ibm9uZSIKICBzdHJva2U9IiMyNjM0NDkiCiAgc3Ryb2tlLXdpZHRoPSIxLjgiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCiAgY2xhc3M9Imljb24gaWNvbi10YWJsZXIgaWNvbnMtdGFibGVyLW91dGxpbmUgaWNvbi10YWJsZXItbGlzdC1jaGVjayIKPjxyZWN0IHg9IjAiIHk9IjAiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgcng9IjUiIGZpbGw9IiNmMWY0ZjgiIHN0cm9rZT0ibm9uZSIvPgogIDxwYXRoIHN0cm9rZT0ibm9uZSIgZD0iTTAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIgLz4KICA8cGF0aCBkPSJNMy41IDUuNWwxLjUgMS41bDIuNSAtMi41IiAvPgogIDxwYXRoIGQ9Ik0zLjUgMTEuNWwxLjUgMS41bDIuNSAtMi41IiAvPgogIDxwYXRoIGQ9Ik0zLjUgMTcuNWwxLjUgMS41bDIuNSAtMi41IiAvPgogIDxwYXRoIGQ9Ik0xMSA2bDkgMCIgLz4KICA8cGF0aCBkPSJNMTEgMTJsOSAwIiAvPgogIDxwYXRoIGQ9Ik0xMSAxOGw5IDAiIC8+Cjwvc3ZnPg==",
    id: "main",
    title,
    primary: true,
    placement: "dock",
    layout: "workspace",
    component: Page,
  });

  ctx.panels.register({
    id: "task-progress",
    title: "任务进度",
    channelPlacement: "side",
    matches: (target) => target.startsWith("opcb-task-progress:"),
    channelLauncher: ({ context, pressed, toggle, available }) =>
      button(
        "任务进度",
        () => toggle(`opcb-task-progress:${context.channelId}`),
        { disabled: !available(), "aria-pressed": pressed },
      ),
    component: () => h(Page, { panel: true }),
  });

  if (!company) {
    ctx.agents.addTool({
      name: "opcb_tasks_guide",
      description:
        "读取公司看板与任务中心的同源同步规则（ask-opcb-flow / manage-end-to-end-task 的兼容接入说明）。不修改任务。",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      async call() {
        return "当前任务唯一基线为 buzz://channel/7dc199bc-755b-47bb-8f71-fe311b1f1ab1 的人员分工 Canvas；旧Git任务与旧完成数已退出。读取不代表重新执行或验收通过，所有分工从0登记。基线与执行事实分开：当前仅支持读取/定位，不能写进度；没有受控写回入口时不得把聊天汇报自动记为完成，也不能刷新旧Vault恢复旧任务。";
      },
    });
    ctx.agents.addTool({
      name: "opcb_tasks_snapshot",
      description:
        "只读现有公司看板/任务中心的同一频道工作基线，含 task ID、Canvas版本和来源时间；不是 Relay 实时执行状态。仅供当前拥有者与本 Agent 的私人 Solo。",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      async call(client, context) {
        const connection = current();
        const authorize = () => {
          check(connection);
          const list = connection.session.channels.list();
          const channel = list.channels.find(
            (item) => item.id === context.channel,
          );
          if (
            client.owner !== connection.session.viewer ||
            list.status !== "ready" ||
            !channel ||
            channel.channelType !== "solo" ||
            channel.private !== true ||
            channel.archived ||
            channel.cached ||
            channel.pending ||
            channel.readOnly ||
            channel.metadataPending ||
            channel.members?.length !== 2 ||
            !channel.members.includes(client.owner) ||
            !channel.members.includes(client.pubkey)
          ) {
            throw new Error(
              "请在当前拥有者和本 Agent 的私人 Solo 中读取任务。",
            );
          }
        };
        authorize();
        const data = await read(connection);
        authorize();
        return JSON.stringify({
          ...data,
          source,
          projection: "channel_baseline",
        });
      },
    });
  }

  ctx.agents.addTool({
    name: company ? "opcb_company_board_task" : "opcb_task_center_task",
    description:
      "读取或定位当前关联私人 Solo 的基线任务。省略 task_id 读取当前选择；focus 只改变页面选中项，不写任务。",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        action: { type: "string", enum: ["read", "focus"] },
      },
      additionalProperties: false,
    },
    async call(client, context, args) {
      const owner = bridge;
      const expectedLink = owner?.linkVersion;
      const expectedSelection = owner?.selected;
      const authorize = () => {
        if (
          !owner ||
          bridge !== owner ||
          owner.linkVersion !== expectedLink ||
          owner.selected !== expectedSelection ||
          !owner.channel ||
          owner.channel !== context.channel
        )
          throw new Error("请先在页面关联本私人 Solo。");
        check(owner.connection);
        const agentConnection = ctx.agents.relay(client.key)?.snapshot();
        const roster = owner.connection.session.channels.list();
        const c = roster.channels.find((c) => c.id === context.channel);
        if (
          client.owner !== owner.connection.session.viewer ||
          agentConnection?.status !== "ready" ||
          agentConnection.cached ||
          agentConnection.scope !== owner.connection.scope ||
          roster.status !== "ready" ||
          !c ||
          c.channelType !== "solo" ||
          !c.private ||
          c.creator !== client.owner ||
          c.archived ||
          c.cached ||
          c.pending ||
          c.readOnly ||
          c.metadataPending ||
          c.members?.length !== 2 ||
          !c.members.includes(client.owner) ||
          !c.members.includes(client.pubkey)
        )
          throw new Error("当前私人 Solo 权限已变化。");
      };
      authorize();
      if (![undefined, "read", "focus"].includes(args.action))
        throw new Error("操作不受支持。");
      const id = args.task_id || owner.selected;
      if (!id) throw new Error("先选择任务或提供 task_id。");
      const data = await read(owner.connection);
      authorize();
      const task = data.tasks.find((t) => t.id === id);
      if (!task) throw new Error("该任务不在当前基线中，请刷新列表。");
      if (args.action === "focus") owner.focus(id, data);
      return JSON.stringify({
        source,
        projection: "channel_baseline",
        baselineRevision: data.baselineRevision,
        syncedAt: data.syncedAt,
        task,
      });
    },
  });
}

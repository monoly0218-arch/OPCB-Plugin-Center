// src/identity-icons/bases/opcb.hot-workflow/plugin.js
var inject = ["react", "pages", "relay"];
var TYPE = "opcb.hot-workflow.v1";
var SOURCE_CHANNEL = "7dc199bc-755b-47bb-8f71-fe311b1f1ab1";
var STAGES = ["热点笔记", "复刻模板", "BD", "内容分发", "数据监控"];
var OWNERS = ["finder", "maker", "bd", "distribution", "analyst"];
var EVENT_TYPES = ["code_used", "result_received", "registered"];
var tag = (e, name) => e.tags?.find((t) => t[0] === name)?.[1];
var clone = (value) => JSON.parse(JSON.stringify(value));
var text = (value) => typeof value === "string" ? value.trim() : "";
function safeURL(value) {
  try {
    const u = new URL(value);
    return ["https:", "http:", "buzz:"].includes(u.protocol) && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}
function newCampaign(id, title = "新热点") {
  return {
    schema: 1,
    id,
    title,
    sourceURL: "",
    sourceEvidence: "",
    observedAt: "",
    followers: null,
    author: "",
    saves: null,
    likesDisplay: "",
    sourceMediaURL: "",
    sourceMediaKind: "待采集",
    sourceComments: [],
    monitoring: {
      views: null,
      likes: null,
      saves: null,
      comments: null,
      observedAt: "",
      evidenceURL: "",
      interactions: []
    },
    likes: null,
    comments: null,
    contentType: "待判断",
    motivation: "",
    replaceable: "",
    engagement: "待判断",
    decision: "待评估",
    decisionReason: "",
    owners: { finder: "", maker: "", bd: "", distribution: "", analyst: "" },
    stage: 0,
    template: {
      referenceURL: "",
      resultURL: "",
      promptURL: "",
      platformURL: "",
      acceptance: "待制作"
    },
    cooperation: {
      status: "待联系",
      evidenceURL: "",
      terms: "",
      next: "",
      decision: "待决定",
      decisionReason: ""
    },
    content: { draftURL: "", postURL: "", communityURL: "", followup: "" },
    codes: [],
    events: [],
    measurement: "unconnected",
    period: "全部已导入事件",
    improvements: [],
    blocker: "",
    nextDelivery: ""
  };
}
function seeds() {
  const rows = [
    [
      "84d8d65a-e7ce-5070-9c26-178fb4e75501",
      "小猫巴士",
      "https://xhslink.cn/o/4dBXKHbBpFr",
      "fb16dd5453c1dfc34efed666c0c6585feb393ae90033c99d4dba640a66ff6213"
    ],
    [
      "84d8d65a-e7ce-5070-9c26-178fb4e75502",
      "火象：你想不想去玩。土象：let's no",
      "https://xhslink.cn/o/8T82wWKMKEo",
      "de18a092d9c56aa6dc3cf6bd7064a4688645bfed6eb88199f435c52b4924d40a"
    ],
    [
      "84d8d65a-e7ce-5070-9c26-178fb4e75503",
      "小猫打工日记：为什么我才八块",
      "https://xhslink.cn/o/4EnuOOTQpgj",
      "915f276c60e886988de9ad87eac175ef4d75a1f71e9d3b846918e5731aa2aff2"
    ],
    [
      "84d8d65a-e7ce-5070-9c26-178fb4e75504",
      "我错了，还能做朋友吗？厉娜",
      "https://xhslink.cn/o/oKSDTS9t4s",
      "97ca51d1c4b55a55f2dc3c817b0a137c469ffe411376e494fde5fbdd1532690e"
    ],
    [
      "84d8d65a-e7ce-5070-9c26-178fb4e75505",
      "海底怪谈之惊现大猫咪",
      "https://xhslink.cn/o/4CdVXZHIqfY",
      "97ca51d1c4b55a55f2dc3c817b0a137c469ffe411376e494fde5fbdd1532690e"
    ]
  ];
  return rows.map(
    ([id, title, url, evidence]) => enrichSeed({
      ...newCampaign(id, title),
      sourceURL: url,
      sourceEvidence: `buzz://message?channel=${SOURCE_CHANNEL}&id=${evidence}`,
      observedAt: "2026-11-13T15:52:00+08:00",
      owners: {
        finder: "周洋",
        maker: "",
        bd: "",
        distribution: "",
        analyst: ""
      },
      blocker: "周洋已交原帖；粉丝、互动及用户制作动机待核，不能直接认定通过"
    })
  );
}
function evaluateCandidate(c) {
  const issues = [];
  if (c.contentType === "泛娱乐") issues.push("泛娱乐向淘汰");
  if (c.contentType === "待判断") issues.push("先判断内容是否适合复用");
  if (!safeURL(c.sourceURL)) issues.push("补原帖链接");
  if (c.followers === null) issues.push("补粉丝数");
  else if (c.followers >= 2e3) issues.push("未满足2000粉丝以下");
  if (c.likes === null && !text(c.likesDisplay) || c.comments === null)
    issues.push("补点赞和评论数");
  if (c.engagement !== "较高") issues.push("补高互动判断");
  if (!safeURL(c.sourceEvidence)) issues.push("补筛选证据链接");
  if (!Number.isFinite(Date.parse(c.observedAt))) issues.push("补有效观察时间");
  if (!text(c.motivation) || !text(c.replaceable))
    issues.push("写清用户为什么想做、替换什么");
  return { pass: issues.length === 0, issues };
}
function gate(c, target) {
  const issues = [];
  const required = target === 0 ? [0] : target === 1 ? [0, 1] : target === 2 ? [0, 2] : target === 3 ? [0, 1, 2, 3] : [0, 1, 2, 3, 4];
  for (const i of required)
    if (!text(c.owners[OWNERS[i]])) issues.push(`${STAGES[i]}缺负责人`);
  if (target >= 1) {
    if (c.cooperation.decision === "放弃")
      issues.push("该模板已放弃，需先重新决定");
    if (c.decision !== "通过") issues.push("先完成筛选并标通过");
    issues.push(...evaluateCandidate(c).issues);
  }
  if (target >= 3) {
    if (c.template.acceptance !== "平台通过" || !safeURL(c.template.resultURL) || !safeURL(c.template.platformURL))
      issues.push("补平台通过结果、成片和模板入口");
    if (c.cooperation.status === "已达成") {
      if (!safeURL(c.cooperation.evidenceURL)) issues.push("补BD达成记录");
    } else if (c.cooperation.status !== "未达成" || c.cooperation.decision !== "继续制作" || !text(c.cooperation.decisionReason))
      issues.push("BD需已达成，或未达成后明确继续制作及理由");
  }
  if (target >= 4 && !c.codes.some(
    (x) => x.status === "已开通" && safeURL(x.platformEvidence) && safeURL(x.postURL)
  ))
    issues.push("至少有一条已开通口令及实际投放原帖");
  return [...new Set(issues)];
}
function validateCampaign(c) {
  if (!c || c.schema !== 1 || !/^[0-9a-f-]{36}$/.test(c.id) || !text(c.title) || c.title.length > 160)
    throw Error("热点编号或标题无效");
  if (!Number.isInteger(c.stage) || c.stage < 0 || c.stage > 4)
    throw Error("工作流步骤无效");
  for (const k of ["followers", "likes", "comments"])
    if (c[k] !== null && (!Number.isSafeInteger(c[k]) || c[k] < 0))
      throw Error("粉丝及互动必须为非负整数，未知留空");
  if (!c.owners || !OWNERS.every((k) => typeof c.owners[k] === "string"))
    throw Error("负责人字段无效");
  if (!["待判断", "娱乐", "泛娱乐", "利他教程"].includes(c.contentType) || !["待评估", "通过", "淘汰"].includes(c.decision) || !["unconnected", "partial", "complete"].includes(c.measurement))
    throw Error("状态值无效");
  for (const key of ["template", "cooperation", "content"])
    if (!c[key] || typeof c[key] !== "object") throw Error("工作流记录不完整");
  if (!Array.isArray(c.codes) || c.codes.length > 40 || !Array.isArray(c.events) || c.events.length > 1500 || !Array.isArray(c.improvements) || c.improvements.length > 100)
    throw Error("记录超过单条容量，请按批次归档");
  const codes = /* @__PURE__ */ new Set();
  for (const code of c.codes) {
    if (!text(code.code) || code.code !== text(code.code) || code.code.length > 80 || codes.has(code.code))
      throw Error("口令不能为空或重复");
    if (!["草案", "已开通", "已停用"].includes(code.status))
      throw Error("口令状态无效");
    codes.add(code.code);
    if (code.status === "已开通" && !safeURL(code.platformEvidence))
      throw Error("口令开通需要平台证据链接");
  }
  for (const [group, keys] of [
    [
      "template",
      ["referenceURL", "resultURL", "promptURL", "platformURL", "acceptance"]
    ],
    ["cooperation", ["status", "evidenceURL", "terms", "next"]],
    ["content", ["draftURL", "postURL", "communityURL", "followup"]]
  ])
    if (!keys.every((k) => typeof c[group][k] === "string"))
      throw Error("记录字段无效");
  if (["样片通过", "平台通过"].includes(c.template.acceptance) && !safeURL(c.template.resultURL))
    throw Error("模板通过需要可查看的成片链接");
  if (c.template.acceptance === "平台通过" && !safeURL(c.template.platformURL))
    throw Error("平台通过需要实际模板入口");
  if (c.cooperation.status === "已达成" && !safeURL(c.cooperation.evidenceURL))
    throw Error("BD已达成需要合作证据链接");
  if (!c.improvements.every(
    (x) => x && [
      "metric",
      "hypothesis",
      "action",
      "owner",
      "reviewAt",
      "before",
      "after"
    ].every((k) => typeof x[k] === "string")
  ))
    throw Error("改善记录字段无效");
  validateDetails(c);
  mergeEvents([], c.events, c.codes);
  if (c.decision === "通过" && !evaluateCandidate(c).pass)
    throw Error(evaluateCandidate(c).issues.join("；"));
  if (c.stage > 0 && c.cooperation.decision !== "放弃" && gate(c, c.stage).length)
    throw Error(gate(c, c.stage).join("；"));
  if (new TextEncoder().encode(JSON.stringify(c)).length > 18e4)
    throw Error("单条热点超过180KB，请按批次归档");
  return c;
}
function mergeEvents(existing, incoming, codes) {
  if (!Array.isArray(incoming) || incoming.length > 1500)
    throw Error("每批最多1500条事件");
  const allowed = new Set(codes.map((c) => c.code));
  const all = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) {
    if (!e || !text(e.id) || !text(e.userKey) || !allowed.has(e.code) || !EVENT_TYPES.includes(e.event) || !Number.isFinite(Date.parse(e.at)) || !text(e.evidence))
      throw Error("事件需含id、已登记code、匿名userKey、event、at和evidence");
    if (e.id.length > 160 || e.userKey.length > 160 || e.evidence.length > 1e3)
      throw Error("事件字段过长");
    const normalized = {
      id: e.id,
      code: e.code,
      userKey: e.userKey,
      event: e.event,
      at: e.at,
      evidence: e.evidence
    };
    const prior = all.get(e.id);
    if (prior && ["id", "code", "userKey", "event", "at", "evidence"].some(
      (k) => prior[k] !== normalized[k]
    ))
      throw Error(`事件ID冲突：${e.id}`);
    all.set(e.id, normalized);
  }
  if (all.size > 1500) throw Error("单条热点最多1500条事件，请按批次归档");
  return [...all.values()];
}
function metrics(c, code) {
  const sets = Object.fromEntries(EVENT_TYPES.map((k) => [k, /* @__PURE__ */ new Set()]));
  for (const e of c.events)
    if (!code || e.code === code) sets[e.event]?.add(e.userKey);
  const count = (k) => c.measurement === "unconnected" && !c.events.length ? null : sets[k].size;
  const used = count("code_used"), result = count("result_received"), registered = count("registered");
  const intersect = (a, b) => [...a].filter((x) => b.has(x)).length;
  const complete = c.measurement === "complete";
  return {
    used,
    result,
    registered,
    resultRate: complete && used > 0 ? intersect(sets.code_used, sets.result_received) / used : null,
    registerRate: complete && result > 0 ? intersect(sets.result_received, sets.registered) / result : null,
    orphanResults: [...sets.result_received].filter(
      (x) => !sets.code_used.has(x)
    ).length,
    orphanRegistrations: [...sets.registered].filter(
      (x) => !sets.result_received.has(x)
    ).length
  };
}
function decodeEvent(e, channel) {
  if (e?.kind !== 45010 || tag(e, "type") !== TYPE || tag(e, "h") !== channel || tag(e, "op") === "delete")
    return null;
  try {
    const c = JSON.parse(e.content);
    validateCampaign(c);
    if (c.id !== tag(e, "d")) return null;
    return { ...normalizeCampaign(c), _revision: e.id, _author: e.pubkey };
  } catch {
    return null;
  }
}
function template(c, channel, expected) {
  const clean = clone(c);
  delete clean._revision;
  delete clean._author;
  validateCampaign(clean);
  return {
    kind: 45010,
    content: JSON.stringify(clean),
    tags: [
      ["ar", "1"],
      ["d", c.id],
      ["h", channel],
      ["type", TYPE],
      ["title", c.title],
      ["op", expected ? "update" : "create"],
      ...expected ? [["prev", expected]] : []
    ]
  };
}
function readAllowed(connection, channel) {
  if (connection?.status !== "ready" || connection.cached) return false;
  const s = connection.session;
  const c = s.channels.get?.(channel) ?? s.channels.list().channels.find((x) => x.id === channel);
  return !!c && !c.cached && !c.metadataCached && !c.pending && !c.metadataPending && !c.archived && (c.visibility === "public" || c.members?.includes(connection.viewer ?? s.viewer));
}
function createRepository(relay) {
  const captured = relay.snapshot();
  const session = captured.session, scope = captured.scope, viewer = captured.viewer;
  let disposed = false;
  const waiters = /* @__PURE__ */ new Set();
  const active = (channel) => !disposed && relay.snapshot().session === session && relay.snapshot().scope === scope && relay.snapshot().viewer === viewer && readAllowed(relay.snapshot(), channel);
  async function read(channel, id) {
    if (!active(channel)) throw Error("频道不可读或会话已切换");
    const reader = session.readRemote ?? session.read;
    if (!reader) throw Error("当前Buzz缺少共享数据读取能力");
    const all = [];
    for (let offset = 0; offset < 1e3; offset += 100) {
      const events = await reader.call(session, [
        {
          kinds: [45010],
          "#h": [channel],
          "#type": [TYPE],
          ...id ? { "#d": [id] } : {},
          artifact: "current",
          limit: 100,
          offset
        }
      ]);
      if (!active(channel)) throw Error("会话已切换，旧数据已丢弃");
      if (!Array.isArray(events)) throw Error("共享数据返回无效");
      all.push(...events);
      if (events.length < 100) return all;
    }
    throw Error("热点超过1000条，请缩小归档范围");
  }
  async function save(c, channel) {
    if (!active(channel)) throw Error("当前频道不可写或会话已切换");
    const outbox = session.outbox;
    if (!outbox?.supports?.(45010))
      throw Error("当前Buzz或社区尚未支持共享工作流写入");
    const remote = await read(channel);
    const duplicate = remote.map((e) => decodeEvent(e, channel)).filter(Boolean).find(
      (other) => other.id !== c.id && other.codes.some(
        (code) => c.codes.some((item) => item.code === code.code)
      )
    );
    if (duplicate)
      throw Error(`口令已被「${duplicate.title}」使用，请分配独立口令`);
    const heads = remote.filter((e) => tag(e, "d") === c.id);
    if (heads.length > 1 || (heads[0]?.id ?? null) !== (c._revision ?? null))
      throw Error("此热点已被他人修改，请刷新后合并；当前编辑仍保留");
    if (!active(channel)) throw Error("会话已切换");
    await outbox.ready();
    if (!active(channel)) throw Error("会话已切换");
    const recoveryKey = `opcb.hot-workflow:${channel}:${c.id}`;
    if (typeof outbox.recovery !== "function")
      throw Error("当前Buzz缺少可恢复保存能力，请更新客户端后保存");
    const prior = await outbox.recovery(recoveryKey);
    if (!active(channel)) throw Error("会话已切换");
    if (prior) {
      if (prior.event.id === c._revision && heads[0]?.id === c._revision)
        await outbox.acknowledge(prior.event.id, async () => "recorded");
      else
        throw Error(
          "此热点有未确认的保存，请先刷新核对或在Buzz待发送中处理原操作，勿重复提交"
        );
    }
    if (!active(channel)) throw Error("会话已切换");
    const operation = outbox.send(
      template(c, channel, c._revision),
      {
        key: recoveryKey,
        value: JSON.stringify({
          id: c.id,
          channel,
          expected: c._revision || null
        })
      },
      () => active(channel)
    );
    await new Promise((resolve, reject) => {
      let off = () => {
      }, settled = false;
      const timer = setTimeout(
        () => done(
          Error(
            `保存回执未确定，请先刷新核对，勿重复提交（${operation.slice(0, 8)}）`
          )
        ),
        18e3
      );
      function cancel() {
        done(Error("页面已关闭，请刷新核对原保存结果"));
      }
      function done(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        off();
        waiters.delete(cancel);
        error ? reject(error) : resolve();
      }
      waiters.add(cancel);
      function check() {
        if (!active(channel))
          return done(Error("会话已切换，需回原频道核对保存结果"));
        const row = outbox.snapshot().find((x) => x.event.id === operation);
        if (row?.delivery === "failed")
          done(Error(row.error || "社区拒绝保存"));
        else if (row?.delivery === "unknown")
          done(Error("保存状态未知，请先刷新核对，勿重复提交"));
        else if (!row || ["accepted", "seen"].includes(row.delivery)) done();
      }
      off = outbox.subscribe(check);
      check();
      if (settled) off();
    });
    const verified = (await read(channel, c.id)).find(
      (e) => e.id === operation
    );
    const result = verified && decodeEvent(verified, channel);
    if (!result)
      throw Error("已提交，但尚未读到同一版本；请刷新核对，勿重复提交");
    await outbox.acknowledge?.(operation, async () => "recorded").catch(() => {
    });
    return result;
  }
  return {
    read,
    save,
    active,
    session,
    dispose() {
      disposed = true;
      for (const cancel of [...waiters]) cancel();
    }
  };
}
function normalizeCampaign(c) {
  const d = newCampaign(c.id, c.title);
  return {
    ...d,
    ...c,
    cooperation: { ...d.cooperation, ...c.cooperation },
    monitoring: { ...d.monitoring, ...c.monitoring },
    sourceComments: c.sourceComments || []
  };
}
function enrichSeed(c) {
  if (c.id.endsWith("5501"))
    Object.assign(c, {
      author: "🐾PawHeal Village",
      likesDisplay: "1.9万",
      saves: 2716,
      comments: 1335,
      observedAt: "2026-11-13T16:51:00+08:00",
      sourceComments: [
        {
          author: "Olivia",
          text: "大家千万不要被视频骗了，这是假的，现实中根本没有这么大的猫"
        },
        { author: "壶中仙", text: "要是这比例，吃人没商量" },
        {
          author: "茶茶（酷盖版）",
          text: "我这个点下班怎么没有猫猫巴士来接我！！！（震怒）"
        }
      ]
    });
  return c;
}
function mergeInteractions(existing, incoming) {
  if (!Array.isArray(incoming) || incoming.length > 1e3)
    throw Error("每批最多1000条评论或提及");
  const all = new Map(existing.map((x) => [x.id, x]));
  for (const x of incoming) {
    if (!x || !text(x.id) || x.id.length > 160 || !text(x.userKey) || x.userKey.length > 160 || !["mention", "comment"].includes(x.type) || typeof x.text !== "string" || x.text.length > 3e3 || !Number.isFinite(Date.parse(x.at)) || !safeURL(x.evidenceURL) || typeof x.handled !== "boolean")
      throw Error(
        "互动需含id、匿名userKey、type(mention/comment)、text、at、evidenceURL和handled"
      );
    const row = {
      id: x.id,
      userKey: x.userKey,
      type: x.type,
      text: x.text,
      at: x.at,
      evidenceURL: x.evidenceURL,
      handled: x.handled
    };
    const old = all.get(x.id);
    if (old && ["id", "userKey", "type", "text", "at", "evidenceURL"].some(
      (k) => old[k] !== row[k]
    ))
      throw Error("互动ID冲突：" + x.id);
    all.set(x.id, { ...row, handled: old?.handled ?? row.handled });
  }
  if (all.size > 1e3) throw Error("单条热点最多1000条互动，请按批次归档");
  return [...all.values()];
}
function interactionMetrics(c) {
  const rows = c.monitoring?.interactions || [];
  return {
    mentions: rows.length ? new Set(rows.filter((x) => x.type === "mention").map((x) => x.userKey)).size : null,
    commenters: rows.length ? new Set(rows.filter((x) => x.type === "comment").map((x) => x.userKey)).size : null,
    comments: rows.length ? rows.filter((x) => x.type === "comment").length : null
  };
}
function validateDetails(c) {
  if (text(c.likesDisplay) && !/^\d+(?:[.,]\d+)*(?:万|亿|[wWkK])?\+?$/.test(c.likesDisplay))
    throw Error("点赞显示值应为数字或平台显示约数，如1.9万");
  if (!["待联系", "联系中", "已达成", "未达成"].includes(c.cooperation.status))
    throw Error("BD状态无效");
  for (const k of [
    "author",
    "likesDisplay",
    "sourceMediaURL",
    "sourceMediaKind"
  ])
    if (c[k] !== void 0 && (typeof c[k] !== "string" || c[k].length > 3e3))
      throw Error("笔记字段无效");
  if (c.saves !== void 0 && c.saves !== null && (!Number.isSafeInteger(c.saves) || c.saves < 0))
    throw Error("收藏数无效");
  if (c.sourceMediaURL && !/^https?:/.test(safeURL(c.sourceMediaURL) || ""))
    throw Error("媒体地址需为HTTP(S)链接");
  if (c.sourceMediaKind !== void 0 && !["待采集", "图片", "视频"].includes(c.sourceMediaKind))
    throw Error("媒体类型无效");
  if (c.sourceComments !== void 0 && (!Array.isArray(c.sourceComments) || c.sourceComments.length > 100 || !c.sourceComments.every(
    (x) => x && typeof x.author === "string" && typeof x.text === "string" && x.author.length <= 160 && x.text.length <= 3e3
  )))
    throw Error("原帖评论字段无效");
  if (c.cooperation.decision !== void 0 && !["待决定", "继续制作", "放弃"].includes(c.cooperation.decision))
    throw Error("BD失败决策无效");
  if (c.cooperation.decisionReason !== void 0 && typeof c.cooperation.decisionReason !== "string")
    throw Error("BD决策理由无效");
  if (c.cooperation.decision === "继续制作" && c.cooperation.status === "未达成" && !text(c.cooperation.decisionReason))
    throw Error("继续制作需要记录理由");
  if (c.cooperation.decision === "放弃" && !text(c.cooperation.decisionReason))
    throw Error("放弃模板需要记录理由");
  if (c.monitoring !== void 0) {
    const m = c.monitoring;
    if (!m || typeof m !== "object") throw Error("监控记录无效");
    for (const k of ["views", "likes", "saves", "comments"])
      if (m[k] !== null && (!Number.isSafeInteger(m[k]) || m[k] < 0))
        throw Error("帖子数据需非负整数，未知留空");
    if (typeof m.observedAt !== "string" || typeof m.evidenceURL !== "string")
      throw Error("监控来源无效");
    if (["views", "likes", "saves", "comments"].some((k) => m[k] !== null) && (!Number.isFinite(Date.parse(m.observedAt)) || !safeURL(m.evidenceURL)))
      throw Error("帖子数据需要采集时间及证据链接");
    mergeInteractions([], m.interactions);
  }
}
var FACTORY_CSS = '.hf{color-scheme:light dark;--bg:#f6f7f9;--surface:#fff;--surface2:#f0f2f5;--text:#17191e;--muted:#90959f;--line:#e9ebef;--accent:#007aff;--tint:#eaf3ff;--red:#e65561;--shadow:0 12px 36px #1820380b;--nav:#f6f7f9e8;--radius:24px}.hf *{box-sizing:border-box}.hf{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Display","PingFang SC",sans-serif;-webkit-font-smoothing:antialiased}.hf button,.hf input,.hf textarea{font:inherit}.hf button,.hf a,.hf input,.hf textarea{-webkit-tap-highlight-color:transparent}.hf button{cursor:pointer;color:inherit;border:0;background:none}.hf a{color:inherit;text-decoration:none}.hf button:disabled{opacity:.4;cursor:default}.hf button:not(:disabled):active{transform:scale(.96)}.hf button:focus-visible,.hf a:focus-visible,.hf input:focus-visible,.hf textarea:focus-visible{outline:3px solid #007aff55;outline-offset:4px}.hf button{transition:background .15s,transform .12s,color .15s}.hf svg.icon{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}.hf [hidden]{display:none!important}.hf h1,.hf h2,.hf h3,.hf p{margin:0}.hf .icon-button{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:50%}.hf .icon-button:hover{background:var(--surface2)}.hf .primary,.hf .secondary{min-height:44px;padding:0 20px;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:600}.hf .primary{background:var(--text);color:var(--surface)}.hf .primary:hover{opacity:.88}.hf .secondary{background:var(--surface2);color:var(--text)}.hf .accent{background:var(--accent);color:#fff}.hf .wordmark{display:flex;align-items:center;gap:10px;font-size:26px;font-weight:750;letter-spacing:-1.1px;flex-shrink:0}.hf .brand-icon{height:28px;width:27px;position:relative;display:block}.hf .brand-icon i{position:absolute;width:16px;height:23px;border:2.5px solid currentColor;border-radius:5px;left:2px;top:3px;transform:rotate(-12deg)}.hf .brand-icon i:last-child{background:var(--bg);left:9px;top:0;transform:rotate(12deg)}.hf .brand-dot{width:5px;height:5px;border-radius:50%;background:var(--accent);align-self:flex-end;margin:0 0 10px -6px}.hf .topbar{height:92px;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:0 44px;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20;background:var(--nav);backdrop-filter:blur(22px)}.hf .step-nav{display:flex;gap:5px;align-items:center;background:var(--surface2);padding:5px;border-radius:18px}.hf .nav-item{display:flex;align-items:center;gap:7px;padding:10px 13px;border-radius:13px;min-height:44px;font-size:13px;color:#777d88;white-space:nowrap}.hf .nav-item .icon{width:18px;height:18px}.hf .nav-item.active{color:var(--text);background:var(--surface);box-shadow:0 2px 6px #00000008;font-weight:650}.hf .nav-count{font:11px/1.4 -apple-system,sans-serif;font-variant-numeric:tabular-nums;min-width:17px;text-align:center;opacity:.55}.hf .nav-item.active .nav-count{color:var(--accent);opacity:1}.hf .top-actions{display:flex;align-items:center;gap:8px}.hf .profile-trigger{display:inline-flex;align-items:center;gap:7px;padding:4px;border-radius:50%}.hf .avatar{--avatar-bg:#edf0f5;--avatar-fg:#66758d;display:inline-grid;place-items:center;flex-shrink:0;width:36px;height:36px;background:var(--avatar-bg);color:var(--avatar-fg);border-radius:50%;font-size:15px;font-weight:650;letter-spacing:-.5px;border:2px solid var(--surface);overflow:hidden}.hf .avatar-sm{width:26px;height:26px;font-size:11px}.hf .avatar-lg{width:48px;height:48px;font-size:20px}.hf .avatar-xl{width:84px;height:84px;font-size:32px;border:5px solid var(--surface);box-shadow:0 0 0 1px var(--line)}.hf .avatar-stack{display:inline-flex;align-items:center;padding-left:0}.hf .avatar-stack .avatar:not(:first-child){margin-left:-7px}.hf .workspace{max-width:1320px;margin:0 auto;padding:40px 44px 80px;display:flex;align-items:flex-start;gap:48px}.hf .main{min-width:0;flex:1}.hf .page-header{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:24px}.hf .eyebrow{font-size:10px;font-weight:650;letter-spacing:2px;color:var(--muted);margin-bottom:6px}.hf h1{font-size:30px;font-weight:650;letter-spacing:-1px;display:flex;align-items:center;gap:12px}.hf .title-count{font-size:13px;letter-spacing:0;background:var(--surface2);color:var(--muted);padding:2px 10px;border-radius:8px;font-weight:500}.hf .search{height:42px;width:210px;display:flex;align-items:center;gap:8px;padding:0 14px;border-radius:14px;background:var(--surface)}.hf .search .icon{width:17px;color:var(--muted)}.hf .search input{width:100%;background:none;border:0;outline:0;color:var(--text);font-size:13px}.hf .search input::placeholder{color:var(--muted)}.hf .feed-toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px;min-height:40px}.hf .segment{display:flex;gap:4px}.hf .segment button{border-radius:11px;padding:8px 14px;color:var(--muted);font-size:13px;min-height:40px}.hf .segment button.active{background:var(--surface);color:var(--text);font-weight:600}.hf .display-modes{display:flex;gap:3px;color:var(--muted)}.hf .display-modes .active{background:var(--surface);color:var(--text)}.hf .display-modes .icon{width:19px}.hf .feed{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;align-items:start}.hf .post{background:var(--surface);border-radius:var(--radius);overflow:hidden;border:1px solid var(--line);position:relative;box-shadow:0 2px 8px #12162203;min-width:0}.hf .post-top{display:flex;align-items:center;gap:9px;padding:14px 14px 12px;height:65px}.hf .post-person{min-width:0;flex:1}.hf .person-name{display:block;font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hf .person-meta{display:block;font-size:10px;color:var(--muted);margin-top:2px}.hf .post-top .icon-button{width:32px;height:36px}.hf .post-top .icon{width:19px}.hf .rank-badge{font-size:16px;font-variant-numeric:tabular-nums;font-weight:650;color:var(--muted);padding-right:4px}.hf .visual{position:relative;aspect-ratio:3/4;background:#111317;overflow:hidden;touch-action:pan-y;margin:0 10px;border-radius:17px}.hf .visual video,.hf .visual iframe{display:block;width:100%;height:100%;object-fit:cover;border:0}.hf .visual video.playing{object-fit:contain}.hf .play-overlay{position:absolute;inset:0;display:grid;place-items:center;width:100%;height:100%;background:linear-gradient(0deg,#0003,transparent 25%);color:#fff;border-radius:0!important}.hf .play-overlay span{display:grid;place-items:center;width:50px;height:50px;border-radius:50%;background:#ffffff28;backdrop-filter:blur(12px);border:1px solid #ffffff50}.hf .play-overlay .icon{width:22px;margin-left:3px;fill:#fff;stroke-width:1}.hf .media-placeholder{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#c5c9d1;padding:28px;text-align:center;font-size:13px}.hf .media-placeholder .icon{width:32px;height:32px}.hf .media-placeholder .secondary{background:#ffffff15;color:#fff;font-size:12px}.hf .media-choice{position:absolute;left:12px;top:12px;display:flex;padding:3px;border-radius:11px;background:#111a;backdrop-filter:blur(15px);z-index:4;color:#fff}.hf .media-choice button{font-size:11px;padding:5px 9px;border-radius:8px;color:#ffffffa0}.hf .media-choice button.active{background:#ffffff28;color:#fff}.hf .revision-chip,.hf .high-chip{display:inline-flex;align-items:center;font-size:10px;line-height:1;padding:6px 8px;border-radius:7px;background:var(--surface2);color:var(--muted);font-weight:600}.hf .high-chip{background:var(--tint);color:var(--accent)}.hf .revision-overlay{position:absolute;right:12px;bottom:13px;color:#fff;background:#0006;backdrop-filter:blur(12px);z-index:3;font-size:11px;padding:5px 8px;border-radius:8px}.hf .post-detail{padding:14px 16px 16px}.hf .post-title{font-size:14px;font-weight:600;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.25px;margin-bottom:10px}.hf .social-line{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.hf .likes-summary{display:flex;align-items:center;gap:6px;min-width:0;font-size:11px;color:var(--muted)}.hf .likes-summary strong{font-size:12px;color:var(--text);font-weight:650}.hf .post-action-icons{display:flex;gap:3px}.hf .vote-button{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;border:1px solid var(--line)}.hf .vote-button .icon{width:19px}.hf .vote-button.yes.chosen{color:var(--accent);background:var(--tint);border-color:transparent}.hf .vote-button.no.chosen{color:var(--red);background:#e6556110;border-color:transparent}.hf .comment-snippets{font-size:11px;line-height:1.7;margin:4px 0 9px;color:var(--muted)}.hf .comment-snippets p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.hf .comment-snippets b{color:var(--text);font-weight:600;margin-right:6px}.hf .all-comments{font-size:11px;color:var(--muted);padding:3px 0;text-align:left}.hf .comment-mini{display:flex;align-items:center;gap:6px;border-top:1px solid var(--line);padding-top:10px;margin-top:10px}.hf .comment-mini input{min-width:0;flex:1;border:0;background:none;outline:0;color:var(--text);font-size:11px;padding:6px 0}.hf .comment-mini input::placeholder{color:var(--muted)}.hf .comment-mini button{width:30px;height:30px;border-radius:50%;color:var(--accent);display:grid;place-items:center}.hf .comment-mini .icon{width:16px}.hf .post-cta{margin-top:12px;display:flex;gap:8px;align-items:center}.hf .post-cta .primary,.hf .post-cta .secondary{min-height:40px;border-radius:12px;font-size:12px;padding:0 12px;flex:1}.hf .post-cta .icon{width:17px}.hf .owner-line{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);margin-bottom:10px}.hf .owner-line .avatar{width:23px;height:23px;font-size:10px}.hf .feedback-line{font-size:11px;padding:10px 12px;background:var(--surface2);border-radius:12px;margin-bottom:12px;line-height:1.7}.hf .feedback-line b{display:block;margin-bottom:2px;font-weight:600}.hf .connection-chip{font-size:10px;color:var(--muted);white-space:nowrap}.hf .empty{grid-column:1/-1;padding:80px 24px 100px;display:flex;flex-direction:column;align-items:center;gap:18px;color:var(--muted);text-align:center}.hf .empty>.icon{width:48px;height:48px;stroke-width:1.25;color:#c6cbd3}.hf .empty h2{font-size:18px;color:var(--text);font-weight:550}.hf .empty p{font-size:13px}.hf .empty button{margin-top:4px;font-size:13px}.hf .page-footer{display:flex;justify-content:space-between;gap:16px;font-size:10px;color:var(--muted);margin-top:28px}.hf .inline-error{padding:12px 16px;border-radius:12px;background:#e6556112;color:var(--red);margin-bottom:20px;font-size:13px}.hf .workspace.deck-workspace{max-width:1080px;gap:56px}.hf .deck-workspace .main{max-width:580px}.hf .deck-workspace .feed-toolbar{margin-bottom:20px}.hf .feed.deck{display:block;position:relative;max-width:370px;margin:0 auto;padding-bottom:6px}.hf .deck.has-next:before,.hf .deck.has-next:after{content:"";position:absolute;inset:4px 0 6px;border-radius:24px;background:var(--surface2);border:1px solid var(--line);transform:rotate(5deg) translate(6px,1px);z-index:0}.hf .deck.has-next:after{transform:rotate(-3deg) translate(-4px,0);background:var(--surface)}.hf .deck .post{z-index:2;box-shadow:0 15px 45px #00000010;touch-action:pan-y;user-select:none}.hf .deck .post-top{height:58px;padding:10px 15px}.hf .deck .visual{aspect-ratio:9/16;max-height:calc(100% - 338px);min-height:290px;margin:0;border-radius:0}.hf .deck .post-detail{padding:12px 16px}.hf .deck .post-title{font-size:13px;margin:0}.hf .deck .social-line{margin:8px 0 0}.hf .deck .comment-snippets,.hf .deck .comment-mini,.hf .deck .post-cta{display:none}.hf .deck .owner-line{margin-bottom:7px}.hf .swipe-stamp{position:absolute;z-index:8;top:82px;width:76px;height:76px;border:3px solid currentColor;border-radius:18px;color:var(--accent);background:#ffffffc0;display:grid;place-items:center;opacity:0;pointer-events:none;transform:rotate(-15deg)}.hf .swipe-stamp .icon{width:50px;height:50px;stroke-width:3}.hf .swipe-stamp.yes{left:24px}.hf .swipe-stamp.no{right:24px;color:var(--red);transform:rotate(15deg)}.hf .deck-actions{display:flex;align-items:center;justify-content:center;gap:26px;margin-top:20px}.hf .deck-action{display:flex;flex-direction:column;align-items:center;gap:7px;font-size:10px;color:var(--muted);padding:0}.hf .deck-action span{width:60px;height:60px;border-radius:50%;display:grid;place-items:center;background:var(--surface);border:1px solid var(--line);box-shadow:0 4px 12px #12162205}.hf .deck-action .icon{width:27px;height:27px}.hf .deck-action.no span{color:var(--red)}.hf .deck-action.yes span{background:var(--accent);border-color:var(--accent);color:#fff}.hf .deck-action.next span,.hf .deck-action.undo span{width:44px;height:44px}.hf .deck-action.next .icon,.hf .deck-action.undo .icon{width:21px;height:21px}.hf .discussion-panel{width:300px;flex-shrink:0;position:sticky;top:140px;padding-top:68px}.hf .discussion-panel h2{font-size:16px;font-weight:600;margin-bottom:22px}.hf .discussion-list{display:flex;flex-direction:column;gap:20px;max-height:48vh;overflow:auto;padding-right:5px}.hf .comment{display:flex;gap:10px;font-size:12px}.hf .comment>div{flex:1;min-width:0}.hf .comment-header{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:5px}.hf .comment-header strong{font-size:11px;font-weight:600}.hf .comment-header time{font-size:9px;color:var(--muted);white-space:nowrap}.hf .comment p{line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}.hf .empty-discussion{color:var(--muted);font-size:12px;padding:0 0 26px}.hf .quick-replies{display:flex;flex-wrap:wrap;gap:6px;margin-top:22px}.hf .quick-replies button,.hf .feedback-options button{min-height:36px;font-size:11px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:6px 10px}.hf .discussion-compose{display:flex;align-items:center;gap:8px;background:var(--surface);padding:8px 10px;border:1px solid var(--line);border-radius:14px;margin-top:14px}.hf .discussion-compose input{width:100%;min-width:0;background:none;border:0;outline:0;color:var(--text);font-size:12px}.hf .discussion-compose button{height:36px;width:36px;display:grid;place-items:center;color:var(--accent)}.hf .discussion-compose .icon{width:18px}.hf .bottom-nav,.hf .floating-add{display:none}.hf .sheet-overlay{position:absolute;inset:0;background:#10141d4d;backdrop-filter:blur(6px);z-index:100;display:flex;align-items:center;justify-content:center;padding:24px;animation:hf-fade-in .15s ease-out}.hf .sheet{width:100%;max-width:460px;background:var(--surface);border-radius:28px;padding:24px;max-height:85dvh;overflow:auto;box-shadow:0 24px 70px #0002;animation:hf-sheet-in .22s cubic-bezier(.23,1,.32,1)}.hf .sheet-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}.hf .sheet h2{font-size:19px;font-weight:650;letter-spacing:-.5px}.hf .sheet-head .icon-button{width:32px;height:32px;background:var(--surface2)}.hf .sheet-head .icon{width:18px}.hf .sheet textarea,.hf .hf-sheet-input{width:100%;background:var(--surface2);border:0;border-radius:14px;padding:14px;resize:vertical;color:var(--text);outline:0;font-size:13px}.hf .sheet textarea{min-height:95px}.hf .sheet-actions{display:flex;gap:10px;margin-top:20px}.hf .sheet-actions button{flex:1}.hf .sheet-note{font-size:11px;color:var(--muted);margin-top:12px}.hf .member-options{display:flex;flex-wrap:wrap;justify-content:center;gap:18px;margin:14px 0}.hf .member-option{display:flex;flex-direction:column;align-items:center;gap:8px;font-size:11px;min-width:54px}.hf .member-option.selected .avatar{box-shadow:0 0 0 3px var(--accent)}.hf .sheet-row{display:flex;align-items:center;gap:12px;width:100%;padding:12px 3px;text-align:left;font-size:13px;border-bottom:1px solid var(--line);min-height:48px}.hf .sheet-row:last-child{border-bottom:0}.hf .sheet-row .icon{width:19px;color:var(--muted)}.hf .sheet-row .arrow-label{margin-left:auto;font-size:11px;color:var(--muted)}.hf .feedback-options{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}.hf .feedback-options button{font-size:12px;min-height:40px;background:var(--surface2)}.hf .feedback-options button.active{color:var(--accent);border-color:var(--accent);background:var(--tint)}.hf .form-error{color:var(--red);font-size:12px;margin-top:12px;min-height:0}.hf .sheet form>label{display:block;font-size:12px;color:var(--muted);margin:12px 0 7px}.hf .toast{position:absolute;z-index:200;left:50%;bottom:30px;transform:translateX(-50%);background:#25272fed;color:#fff;backdrop-filter:blur(16px);border-radius:14px;padding:13px 20px;font-size:12px;box-shadow:0 8px 30px #0002;max-width:calc(100vw - 40px);display:flex;gap:18px;align-items:center;white-space:nowrap}.hf .toast button{color:#8abaff;font-size:12px;font-weight:600}.hf .drop-overlay{position:absolute;inset:16px;z-index:150;border:2px dashed var(--accent);border-radius:28px;background:var(--nav);backdrop-filter:blur(20px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:var(--accent)}.hf .drop-overlay .icon{width:44px;height:44px}.hf .pending{opacity:.65;pointer-events:none}.hf .loading{background:linear-gradient(90deg,var(--surface2),var(--surface),var(--surface2));background-size:200% 100%;animation:hf-shimmer 1.5s infinite}.hf .login-.hf{min-height:100%;display:grid;place-items:center;padding:32px}.hf .login-panel{width:100%;max-width:800px;text-align:center}.hf .login-panel>.wordmark{justify-content:center;font-size:30px}.hf .login-heading{margin-top:74px}.hf .login-heading .eyebrow{margin-bottom:15px}.hf .login-heading h1{display:block;font-size:36px;font-weight:600;letter-spacing:-1.5px}.hf .login-heading p{font-size:14px;color:var(--muted);margin-top:12px}.hf .login-people{display:flex;flex-wrap:wrap;justify-content:center;gap:32px;margin:48px 0 18px}.hf .login-people button{display:flex;flex-direction:column;align-items:center;gap:16px;padding:6px;min-width:98px}.hf .login-people strong{font-size:13px;font-weight:550}.hf .login-people button:hover .avatar,.hf .login-people .chosen .avatar{box-shadow:0 0 0 3px var(--accent)}.hf .login-error{color:var(--red);font-size:12px;min-height:26px}.hf .login-footer{display:block;font-size:11px;color:var(--muted);margin-top:40px}@keyframes hf-fade-in{from{opacity:0}to{opacity:1}}@keyframes hf-sheet-in{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}@keyframes hf-shimmer{to{background-position:-200% 0}}@container hot-factory(min-width:1650px){.hf .workspace{max-width:1440px}.hf .feed{grid-template-columns:repeat(4,minmax(0,1fr))}.hf .deck-workspace .feed{display:block}.hf .workspace.deck-workspace{max-width:1080px}}@container hot-factory(max-width:1100px){.hf .topbar{padding:0 26px;gap:16px}.hf .step-nav{gap:0}.hf .nav-item{padding:10px}.hf .nav-item>.icon{display:none}.hf .top-actions>#archive-nav{display:none}.hf .workspace{padding:32px 28px 80px;gap:32px}.hf .feed{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.hf .discussion-panel{width:260px}.hf .workspace.deck-workspace{gap:32px}.hf .top-actions .primary{padding:0 13px}}@container hot-factory(max-width:820px){.hf .topbar{height:76px;padding:0 22px}.hf .step-nav{display:none}.hf .workspace{padding:28px 22px 110px}.hf .feed{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.hf .bottom-nav{display:flex;position:absolute;bottom:0;left:0;right:0;z-index:30;padding:8px 10px calc(8px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--nav);backdrop-filter:blur(24px);justify-content:space-around}.hf .bottom-nav .nav-item{display:flex;flex-direction:column;justify-content:center;gap:3px;border-radius:12px;min-width:60px;font-size:9px;padding:6px 8px;position:relative;background:none;box-shadow:none}.hf .bottom-nav .nav-item>.icon{display:block;width:22px;height:22px}.hf .bottom-nav .nav-item.active{color:var(--accent)}.hf .bottom-nav .nav-count{position:absolute;top:0;right:8px;background:var(--surface2);border-radius:5px;font-size:8px;padding:1px 3px;min-width:13px}.hf .workspace.deck-workspace{display:block;max-width:580px}.hf .deck-workspace .main{max-width:none}.hf .discussion-panel{display:none}.hf .toast{bottom:100px}.hf .page-header{margin-bottom:20px}.hf .deck-workspace .page-footer{margin-top:20px}.hf .deck .visual{max-height:calc(100% - 360px);min-height:260px}.hf .sheet-overlay{align-items:flex-end;padding:0}.hf .sheet{max-width:600px;border-radius:28px 28px 0 0;padding:22px 22px calc(24px + env(safe-area-inset-bottom));max-height:88dvh;animation:hf-sheet-in .25s ease-out}.hf .login-people{gap:22px}.hf .login-panel>.wordmark{font-size:27px}}@container hot-factory(max-width:520px){.hf .topbar{height:66px;padding:0 18px;gap:12px}.hf .wordmark{font-size:23px;gap:8px}.hf .brand-icon{transform:scale(.85);transform-origin:left center;width:24px}.hf .brand-dot{margin-bottom:8px}.hf .top-actions{gap:6px}.hf .top-actions .primary{padding:0;width:40px;min-height:40px;border-radius:50%;color:var(--text);background:var(--surface)}.hf .top-actions .primary>span{display:none}.hf .top-actions .profile-trigger .avatar{width:33px;height:33px;font-size:14px}.hf .workspace{padding:24px 16px 104px}.hf .page-header{gap:12px;align-items:flex-end}.hf h1{font-size:25px;gap:9px}.hf .eyebrow{font-size:9px;letter-spacing:1.7px}.hf .title-count{font-size:11px;padding:2px 7px}.hf .search{width:40px;background:none;position:relative;padding:0;display:grid;place-items:center}.hf .search input{position:absolute;inset:0;opacity:0;cursor:pointer}.hf .search:focus-within{position:absolute;right:16px;left:16px;width:auto;background:var(--surface);z-index:10;padding:0 14px;display:flex;box-shadow:0 5px 20px #0001}.hf .search:focus-within input{position:static;opacity:1;cursor:text}.hf .feed-toolbar{margin-bottom:18px;gap:8px}.hf .segment button{padding:8px 11px;font-size:11px;min-height:36px}.hf .display-modes .icon-button{width:36px;height:36px}.hf .display-modes .icon{width:17px}.hf .feed{gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}.hf .post{border-radius:19px}.hf .post-top{gap:6px;padding:9px 9px 8px;height:51px}.hf .post-top .avatar{width:26px;height:26px;font-size:11px}.hf .person-name{font-size:10px}.hf .person-meta{font-size:8px}.hf .post-top .icon-button{width:24px;height:28px}.hf .post-top .icon{width:16px}.hf .visual{margin:0 6px;border-radius:12px;aspect-ratio:9/13}.hf .play-overlay span{width:35px;height:35px}.hf .play-overlay .icon{width:17px}.hf .post-detail{padding:10px}.hf .post-title{font-size:11px;line-height:1.5;margin-bottom:8px}.hf .social-line{gap:4px;align-items:center;margin-bottom:7px}.hf .likes-summary{gap:4px;font-size:9px}.hf .likes-summary .avatar{width:21px;height:21px;font-size:8px}.hf .likes-summary strong{font-size:10px}.hf .vote-button{width:28px;height:28px}.hf .vote-button .icon{width:15px}.hf .post-action-icons{gap:4px}.hf .comment-snippets{font-size:9px;margin-bottom:4px}.hf .all-comments{font-size:9px}.hf .comment-mini{padding-top:7px;margin-top:7px;gap:5px}.hf .comment-mini>.avatar{display:none}.hf .comment-mini input{font-size:10px;width:30px}.hf .comment-mini button{width:24px;height:24px}.hf .post-cta{margin-top:9px;gap:5px}.hf .post-cta .primary,.hf .post-cta .secondary{min-height:34px;font-size:10px;padding:0 7px;border-radius:9px}.hf .post-cta .icon{width:13px}.hf .owner-line{font-size:9px;gap:4px;margin-bottom:7px}.hf .high-chip,.hf .revision-chip{font-size:8px;padding:5px 6px}.hf .feedback-line{font-size:9px;padding:8px;margin-bottom:8px}.hf .connection-chip{font-size:8px}.hf .media-choice{left:8px;top:8px;padding:2px;border-radius:9px}.hf .media-choice button{font-size:9px;padding:4px 6px}.hf .media-placeholder{padding:12px;font-size:10px;gap:10px}.hf .media-placeholder>.icon{width:25px}.hf .media-placeholder .secondary{padding:0 9px;font-size:10px;min-height:34px}.hf .rank-badge{font-size:12px}.hf .feed.deck{max-width:330px;padding-bottom:5px}.hf .deck .post{border-radius:24px}.hf .deck .post-top{height:52px;padding:9px 13px}.hf .deck .post-top .avatar{width:29px;height:29px;font-size:12px}.hf .deck .person-name{font-size:11px}.hf .deck .person-meta{font-size:9px}.hf .deck .visual{margin:0;border-radius:0;max-height:calc(100% - 350px);min-height:240px;aspect-ratio:9/16}.hf .deck .post-detail{padding:10px 14px}.hf .deck .post-title{font-size:12px}.hf .deck .likes-summary{font-size:10px}.hf .deck .vote-button{width:30px;height:30px}.hf .deck-actions{margin-top:16px;gap:24px}.hf .deck-action span{height:55px;width:55px}.hf .deck-workspace .feed-toolbar{margin-bottom:16px}.hf .deck-workspace .page-header{margin-bottom:16px}.hf .deck-workspace .page-footer{font-size:9px;margin-top:15px}.hf .deck-workspace .eyebrow{display:none}.hf .deck-workspace h1{font-size:22px}.hf .empty{padding:65px 16px 80px}.hf .empty h2{font-size:16px}.hf .login-.hf{padding:24px}.hf .login-heading{margin-top:62px}.hf .login-heading h1{font-size:29px}.hf .login-people{gap:20px 13px;margin-top:35px}.hf .login-people button{min-width:calc((100% - 26px)/3);gap:12px}.hf .avatar-xl{height:72px;width:72px;font-size:27px}.hf .login-footer{font-size:10px;margin-top:25px}}@media(prefers-reduced-motion:reduce){.hf *,.hf *:before,.hf *:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}.hf .topbar-main{display:flex;align-items:center;justify-content:space-between;gap:24px;width:100%;min-width:0}.hf .compact-toolbar:empty{display:none}.hf .visual video,.hf .visual iframe{position:absolute;inset:0;width:100%;height:100%;max-width:none;max-height:none}.hf .media-placeholder{position:absolute;inset:0}.hf .visual{isolation:isolate}.hf.deck-active{height:100%;overflow:hidden;overscroll-behavior:none}.hf.deck-active .workspace{position:absolute;top:var(--chrome-top,92px);left:0;right:0;height:var(--workspace-height,calc(100% - 92px));padding-top:16px;padding-bottom:12px;overflow:hidden;align-items:stretch}.hf.deck-active .main{display:flex;flex-direction:column;height:100%;min-height:0}.hf.deck-active .page-header{margin-bottom:10px}.hf.deck-active .eyebrow{display:none}.hf.deck-active h1{font-size:22px}.hf.deck-active .feed-toolbar{margin-bottom:10px;flex-shrink:0}.hf.deck-active .page-footer{display:none}.hf .feed.deck{flex:1;min-height:0;width:min(100%,370px);max-width:370px;margin:0 auto;padding:0;display:flex;flex-direction:column;align-items:stretch;isolation:isolate;overflow:hidden}.hf .deck.has-next:before,.hf .deck.has-next:after{display:none}.hf .deck .post{height:100%;flex:1;min-height:0;max-width:100%;background:#111317;border:0;border-radius:24px;box-shadow:none!important;will-change:transform}.hf .deck .visual{position:absolute;inset:0;width:100%;height:100%;min-height:0;max-height:none;aspect-ratio:auto;margin:0;border-radius:inherit;background:#111317}.hf .deck .visual video{object-fit:contain}.hf .deck .post-top{position:absolute;left:0;right:0;top:0;height:54px;padding:8px 13px;z-index:7;color:#fff;background:linear-gradient(#0009,transparent)}.hf .deck .person-meta{display:none}.hf .deck .person-name{font-size:11px}.hf .deck .post-top .avatar{width:28px;height:28px;font-size:12px;border-color:#ffffff40}.hf .deck .post-top .icon-button{width:40px;height:40px}.hf .deck .post-top .icon-button:hover{background:#ffffff20}.hf .deck .post-detail{position:absolute;left:0;right:0;bottom:44px;z-index:6;padding:22px 14px 8px;color:#fff;background:linear-gradient(transparent,#0008);pointer-events:none}.hf .deck .post-title{font-size:12px;line-height:1.4;margin:0;white-space:nowrap}.hf .deck .social-line{display:flex;margin:5px 0 0}.hf .deck .likes-summary{font-size:10px;color:#ffffffc4;pointer-events:auto;padding:0}.hf .deck .likes-summary strong{color:#fff}.hf .deck .likes-summary .avatar{width:21px;height:21px;font-size:9px;border-color:#ffffff40}.hf .deck .post-action-icons,.hf .deck .social-line>.icon-button,.hf .deck .owner-line,.hf .deck .comment-mini{display:none}.hf .deck .comment-snippets{display:block;color:#ffffffc4;font-size:10px;line-height:1.4;margin:5px 0 0}.hf .deck .comment-snippets p{white-space:nowrap;display:block;text-overflow:ellipsis;overflow:hidden}.hf .deck .comment-snippets p:not(:last-of-type),.hf .deck .comment-snippets .all-comments{display:none}.hf .deck .comment-snippets b{color:#fff}.hf .deck .comment-snippets .avatar{width:17px;height:17px;font-size:8px;border-width:1px;vertical-align:middle;margin-right:4px}.hf .deck .media-choice{top:58px}.hf .deck .revision-overlay{bottom:116px;right:12px}.hf .deck .high-chip{background:#ffffff26;color:#fff}.hf .deck .post-cta{display:none}.hf .deck .post-cta .primary{background:#ffffff26;color:#fff;backdrop-filter:blur(12px)}.hf.pool-view .deck .post-cta{display:flex;pointer-events:auto;position:absolute;right:12px;bottom:calc(100% + 8px);margin:0}.hf .deck .post-cta .primary{min-height:36px;font-size:11px}.hf .deck-actions{flex-shrink:0;gap:24px;margin:12px 0 0;height:68px}.hf .deck-action{gap:5px;font-size:10px}.hf .deck-action span{width:48px;height:48px}.hf .deck-action.undo span,.hf .deck-action.next span{width:40px;height:40px}.hf .deck-action .icon{width:25px;height:25px}.hf .review-view .deck .social-line{display:none}.hf .review-view .page-header{display:flex}.hf .review-view .discussion-panel{padding-top:8px}.hf .deck-workspace .discussion-panel{max-height:100%;overflow:auto;position:static;padding-top:12px}.hf .deck .empty{padding:24px 12px;flex:1;justify-content:center}.hf .swipe-stamp{top:65px;width:60px;height:60px;border-width:2px}.hf .swipe-stamp .icon{width:38px;height:38px}@container hot-factory(max-width:820px){.hf .topbar{height:auto;min-height:0;display:flex;flex-direction:column;gap:0;padding:env(safe-area-inset-top,0px) 16px 0;background:var(--bg)}.hf .topbar-main{height:54px;gap:12px}.hf .wordmark{font-size:22px}.hf .top-actions .primary{padding:0;width:40px;min-height:40px;border-radius:50%;color:var(--text);background:var(--surface)}.hf .top-actions .primary>span{display:none}.hf .top-actions .profile-trigger .avatar{width:32px;height:32px}.hf .compact-toolbar{display:flex;align-items:center;gap:6px;height:44px;width:100%;padding-bottom:4px}.hf .compact-toolbar .page-header{display:contents}.hf .compact-toolbar .eyebrow{display:none}.hf .compact-toolbar h1{font-size:14px;gap:6px}.hf .compact-toolbar .page-header>div{flex:1}.hf .compact-toolbar .search{order:3;flex:0 0 34px;width:34px;height:36px;position:relative;padding:0;display:grid;place-items:center;background:none}.hf .compact-toolbar .search input{position:absolute;inset:0;opacity:0;cursor:pointer}.hf .compact-toolbar .search:focus-within{position:absolute;left:16px;right:16px;bottom:4px;width:auto;height:40px;background:var(--surface);z-index:12;padding:0 12px;display:flex}.hf .compact-toolbar .search:focus-within input{position:static;opacity:1;cursor:text}.hf .compact-toolbar .feed-toolbar{display:flex;flex:1;min-width:0;gap:4px;height:40px;min-height:0;margin:0}.hf .compact-toolbar .segment{gap:0}.hf .compact-toolbar .segment button{padding:0 10px;min-height:36px;font-size:11px}.hf .compact-toolbar .display-modes{gap:0;margin-left:auto}.hf .compact-toolbar .display-modes .icon-button{width:36px;height:36px}.hf .compact-toolbar .display-modes .icon{width:17px}.hf.pool-view .compact-toolbar .page-header>div{display:none}.hf .workspace{padding-top:14px}.hf .bottom-nav{padding:5px 8px calc(5px + env(safe-area-inset-bottom,0px))}.hf .bottom-nav .nav-item{min-height:44px;font-size:9px;gap:2px;padding:4px 6px}.hf .bottom-nav .nav-item>.icon{width:22px;height:22px}.hf.deck-active .workspace{padding:8px 16px 8px;max-width:580px}.hf.deck-active .main{max-width:none}.hf .feed.deck{width:100%;max-width:370px}.hf .deck-actions{height:65px;margin-top:8px;gap:26px}.hf .deck .post{border-radius:20px}.hf .vote-button{width:36px;height:36px}.hf .comment-mini button{width:36px;height:36px}.hf .post-top .icon-button{width:36px;height:36px}.hf .toast{bottom:calc(76px + env(safe-area-inset-bottom,0px))}.hf .deck-active .toast{bottom:calc(146px + env(safe-area-inset-bottom,0px))}}@container hot-factory(max-height:650px) and (max-width:820px){.hf .topbar-main{height:48px}.hf .compact-toolbar{height:40px}.hf .deck-actions{height:54px;gap:24px}.hf .deck-action span{width:42px;height:42px}.hf .deck-action{font-size:9px;gap:2px}.hf .deck .post-top{height:45px}.hf .deck .post-detail{padding-top:12px}.hf .deck .comment-snippets{display:none}.hf .deck .media-choice{top:48px}}.hf .hf-download-spinner{width:28px;height:28px;border:2px solid #ffffff30;border-top-color:#fff;border-radius:50%;animation:hf-download-spin .9s linear infinite}@keyframes hf-download-spin{to{transform:rotate(360deg)}}.hf .sound-toggle{position:absolute;right:10px;top:10px;z-index:8;display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:#1119;color:#fff;border:1px solid #ffffff30;backdrop-filter:blur(12px)}.hf .sound-toggle .icon{width:20px;height:20px}.hf .deck .sound-toggle{top:60px;right:12px}.hf .play-overlay{z-index:1}.hf .media-tap-target{position:absolute;inset:0;z-index:2;display:grid;place-items:center;cursor:pointer;touch-action:manipulation;-webkit-user-select:none;user-select:none}.hf .deck .media-tap-target{touch-action:none}.hf .play-glyph{pointer-events:none;color:white;opacity:0;filter:drop-shadow(0 2px 8px #000a);transition:opacity .15s}.hf .play-glyph .icon{width:42px;height:42px;fill:white;stroke-width:1}.hf .video-paused .play-glyph{opacity:1}.hf .video-seek{position:absolute;z-index:9;left:5%;bottom:12px;width:90%;height:20px;margin:0;appearance:none;-webkit-appearance:none;background:transparent;touch-action:none;cursor:pointer}.hf .video-seek::-webkit-slider-runnable-track{height:2px;border-radius:2px;background:#ffffff9c}.hf .video-seek::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:10px;height:10px;margin-top:-4px;border-radius:50%;background:#fff;box-shadow:0 1px 4px #0008}.hf .video-seek::-moz-range-track{height:2px;background:#ffffff9c}.hf .video-seek::-moz-range-thumb{width:10px;height:10px;border:0;border-radius:50%;background:#fff}.hf .download-status{display:inline-flex;align-items:center;gap:3px;justify-content:center;min-width:38px;height:36px;padding:0 7px;border-radius:10px;color:var(--muted);font-size:11px;white-space:nowrap;touch-action:manipulation}.hf .download-status:hover{background:var(--surface2)}.hf .download-status .icon{width:16px;height:16px}.hf .download-row{display:flex;align-items:center;gap:8px;padding:12px 2px;border-bottom:1px solid var(--line)}.hf .download-row>div{min-width:0;flex:1}.hf .download-row strong,.hf .download-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hf .download-row strong{font-size:13px;font-weight:600}.hf .download-row small{font-size:11px;color:var(--muted);margin-top:3px}.hf .download-row .icon-button{width:36px;height:36px;flex-shrink:0}.hf .download-row .icon{width:17px;height:17px}.hf .vote-button.comment-button{position:relative;display:flex;align-items:center;justify-content:center;width:auto;min-width:36px;gap:5px;padding:0 10px;border-radius:999px;color:var(--muted);font-size:11px;font-weight:600;flex-shrink:0}.hf .comment-button .comment-count{position:absolute;top:-5px;right:-4px;display:grid;place-items:center;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--tint);color:var(--accent);font-size:10px;line-height:1}@container hot-factory(max-width:520px){.hf .comment-button .comment-action-label{display:none}.hf .vote-button.comment-button{width:36px;padding:0}}.hf .page-footer{display:none!important}.hf .nav-count{background:var(--tint);color:var(--accent);border-radius:7px;opacity:1;font-weight:700;padding:1px 5px}.hf .feed:not(.deck){grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.hf .feed:not(.deck) .post{display:grid;grid-template-columns:118px minmax(0,1fr);grid-template-rows:38px minmax(0,1fr);min-height:154px;padding:8px;border-radius:18px;box-shadow:0 5px 18px #12162208}.hf .feed:not(.deck) .visual{grid-column:1;grid-row:1/3;width:118px;height:138px;aspect-ratio:auto;margin:0;border-radius:12px}.hf .feed:not(.deck) .post-top{grid-column:2;grid-row:1;height:38px;gap:6px;padding:0 0 0 10px}.hf .feed:not(.deck) .post-top .avatar{width:25px;height:25px;font-size:10px}.hf .feed:not(.deck) .post-top .icon-button{width:30px;height:30px}.hf .feed:not(.deck) .post-top .icon{width:17px;height:17px}.hf .feed:not(.deck) .post-detail{grid-column:2;grid-row:2;min-width:0;display:flex;flex-direction:column;padding:3px 2px 1px 10px}.hf .feed:not(.deck) .post-title{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal;overflow:hidden;line-height:1.35;font-size:13px;max-height:2.7em;margin:0 0 6px}.hf .feed:not(.deck) .social-line{margin:auto 0 0;gap:4px}.hf .feed:not(.deck) .comment-snippets,.hf .feed:not(.deck) .comment-mini,.hf .feed:not(.deck) .owner-line,.hf .feed:not(.deck) .feedback-line{display:none}.hf .feed:not(.deck) .post-cta{margin-top:6px}.hf .feed:not(.deck) .post-cta .primary,.hf .feed:not(.deck) .post-cta .secondary{min-height:30px;border-radius:9px}.hf .feed:not(.deck) .sound-toggle{top:5px;right:5px;width:27px;height:27px;border:0;background:#1119}.hf .feed:not(.deck) .sound-toggle .icon{width:15px;height:15px}.hf .feed:not(.deck) .play-glyph .icon{width:28px;height:28px}.hf .deck-actions{width:min(100%,370px);max-width:370px;height:58px;margin:10px auto 0;display:grid;grid-template-columns:44px minmax(0,1fr) minmax(0,1fr) 44px;gap:9px;align-items:center;justify-content:stretch}.hf .deck-action{height:50px;min-width:0;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:4px;padding:0 7px;border-radius:15px;font-size:12px;font-weight:650;white-space:nowrap;color:var(--text);background:var(--surface);border:1px solid var(--line);box-shadow:none}.hf .deck-action span,.hf .deck-action.undo span,.hf .deck-action.next span{width:23px;height:23px;display:grid;place-items:center;flex-shrink:0;background:none;border:0;border-radius:0;box-shadow:none}.hf .deck-action .icon,.hf .deck-action.undo .icon,.hf .deck-action.next .icon{width:22px;height:22px}.hf .deck-action strong{font-size:12px;font-weight:650}.hf .deck-action.minor{height:44px;width:44px;padding:0;border-radius:50%;color:var(--muted);background:var(--surface);box-shadow:0 3px 10px #12162208}.hf .deck-action.major.no{color:var(--red);background:#e655611b;border-color:#e6556125}.hf .deck-action.major.yes,.hf .deck-action.major.submit{color:#fff;background:var(--accent);border-color:var(--accent);box-shadow:0 6px 18px #007aff30}.hf .deck-action.major.submit{grid-column:2/4}.hf .deck-action.major.download{color:var(--accent);background:var(--tint);border-color:transparent}.hf .deck-action.major.publish{color:var(--muted);background:var(--surface2);border-color:transparent}.hf .deck-action:disabled{opacity:.6}.hf .swipe-stamp{top:38%;width:72px;height:72px;border-radius:22px;border:1px solid #ffffff75;color:#fff;background:#007affe6;box-shadow:0 16px 38px #007aff55;backdrop-filter:blur(12px);transform:translateY(-50%) rotate(-10deg) scale(.82);transition:opacity .1s,transform .15s}.hf .swipe-stamp.yes{left:18px;color:#fff}.hf .swipe-stamp.no{right:18px;color:#fff;background:#e65561e6;box-shadow:0 16px 38px #e6556150;transform:translateY(-50%) rotate(10deg) scale(.82)}.hf .swipe-stamp.yes,.hf .swipe-stamp.no,.hf .swipe-stamp .icon{width:38px;height:38px;stroke-width:3.2}.hf .progress-view .deck .owner-line,.hf .ready-view .deck .owner-line{display:flex;color:#ffffffd4;margin-bottom:5px}.hf .progress-view .deck .owner-line .avatar,.hf .ready-view .deck .owner-line .avatar{border-color:#ffffff40}.hf .progress-view .deck .feedback-line{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;max-height:3.2em;margin:6px 0 0;padding:5px 8px;border:1px solid #ffffff30;border-radius:9px;background:#0007;color:#fff;font-size:10px;line-height:1.45}.hf .progress-view .deck .feedback-line b{display:inline;margin-right:5px;font-weight:650}@container hot-factory(max-width:820px){.hf .bottom-nav{left:50%;right:auto;transform:translateX(-50%);width:calc(100% - 24px);max-width:480px;bottom:calc(8px + env(safe-area-inset-bottom,0px));padding:6px;min-height:60px;border:1px solid var(--line);border-radius:22px;background:var(--surface);box-shadow:0 12px 34px #1118271c;gap:2px;justify-content:space-between}.hf .bottom-nav .nav-item{flex:1;min-width:0;min-height:47px;padding:3px 1px;border-radius:16px;gap:1px;font-size:9px}.hf .bottom-nav .nav-item.active{background:var(--tint);color:var(--accent);font-weight:700}.hf .bottom-nav .nav-item>.icon{width:20px;height:20px}.hf .bottom-nav .nav-count{top:-2px;right:calc(50% - 23px);font-size:8px;padding:1px 4px;background:var(--accent);color:#fff;border-radius:9px}.hf:not(.deck-active) .workspace{padding-bottom:calc(100px + env(safe-area-inset-bottom,0px))}.hf .feed:not(.deck){grid-template-columns:minmax(0,1fr);gap:10px}.hf .feed:not(.deck) .post{grid-template-columns:102px minmax(0,1fr);grid-template-rows:36px minmax(0,1fr);min-height:134px;padding:7px;border-radius:16px}.hf .feed:not(.deck) .visual{width:102px;height:120px;border-radius:11px}.hf .feed:not(.deck) .post-top{height:36px;padding-left:9px}.hf .feed:not(.deck) .post-detail{padding-left:9px}.hf .feed:not(.deck) .post-title{font-size:12px}.hf .deck-actions{max-width:370px;height:54px;margin-top:8px;gap:8px}.hf .deck-action{height:48px;font-size:11px}.hf .deck-action strong{font-size:11px}.hf .deck-action.minor{height:42px;width:42px}}.hf .image-gallery{position:absolute;inset:0;background:#111317;overflow:hidden}.hf .image-gallery img{display:block;width:100%;height:100%;object-fit:contain}.hf .gallery-tap{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:space-between;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none}.hf .deck .gallery-tap{touch-action:none}.hf .gallery-edge{display:grid;place-items:center;width:30px;height:30px;margin:0 9px;border-radius:50%;background:#0006;color:#fff;pointer-events:none;backdrop-filter:blur(6px)}.hf .gallery-edge .icon{width:17px;height:17px}.hf .gallery-count{position:absolute;z-index:4;right:12px;top:61px;padding:4px 8px;border-radius:9px;background:#0008;color:#fff;font-size:11px;font-variant-numeric:tabular-nums;pointer-events:none}.hf .image-gallery.single .gallery-edge{display:none}.hf .confirmation-line{display:flex;align-items:center;gap:5px;margin:0 0 7px;font-size:11px;color:var(--muted)}.hf .confirmation-line .avatar{width:21px;height:21px;font-size:9px;flex-shrink:0}.hf .confirmation-line strong{font-weight:600;color:var(--text)}.hf .confirmation-complete{margin-left:auto;font-size:10px}.hf .deck .confirmation-line{color:#ffffffc4;margin-bottom:5px}.hf .deck .confirmation-line strong{color:#fff}.hf .deck .confirmation-line .avatar{border-color:#ffffff40}.hf .evaluation-history-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 10px}.hf .evaluation-history-title h3{margin:0;font-size:13px;font-weight:650}.hf .evaluation-history-title>span{font-size:11px;color:var(--muted)}.hf .evaluation-history .discussion-list{max-height:min(46dvh,400px);overflow:auto;overscroll-behavior:contain}.hf .evaluation-history .empty-discussion{padding:20px 0}.hf .feed:not(.deck) .image-gallery img{object-fit:cover}.hf .feed:not(.deck) .gallery-count{top:auto;right:6px;bottom:6px;font-size:9px;padding:2px 5px}.hf .feed:not(.deck) .gallery-edge{width:22px;height:22px;margin:0 3px}.hf .feed:not(.deck) .gallery-edge .icon{width:13px;height:13px}.hf .comment-button{position:relative;overflow:visible}.hf .comment-button .comment-count{position:absolute;top:-5px;right:-4px;display:grid;place-items:center;width:auto;min-width:17px;height:17px;padding:0 4px;border:0;border-radius:9px;background:var(--tint);color:var(--accent);font-size:10px;font-weight:650;line-height:1;pointer-events:none}.hf .comment-button .comment-new,.hf .read-all-comments .comment-new{position:absolute;left:-4px;bottom:-5px;display:grid;place-items:center;width:auto;min-width:25px;height:14px;padding:0 4px;border:0;border-radius:6px;background:#ffedf0;color:#d33b55;font-size:8px;font-weight:750;line-height:1;letter-spacing:.2px;pointer-events:none}.hf .read-all-comments{position:relative;flex-shrink:0}.hf .read-all-comments>.icon:first-child{width:21px;height:21px}.hf .read-all-comments>.icon:nth-child(2){position:absolute;width:12px;height:12px;right:6px;bottom:8px;padding:1px;background:var(--surface);color:var(--accent);border-radius:50%;stroke-width:2.5}.hf .read-all-comments .comment-new{bottom:0;left:-2px}.hf .comment-button .comment-indicator,.hf .read-all-comments .comment-indicator{position:absolute;top:-5px;right:-5px;display:grid;place-items:center;width:auto;min-width:17px;height:17px;padding:0 4px;border:0;border-radius:9px;background:var(--tint);color:var(--accent);font-size:10px;font-weight:650;line-height:1;pointer-events:none}.hf .comment-button .comment-indicator.is-new,.hf .read-all-comments .comment-indicator.is-new{min-width:28px;background:#ffedf0;color:#d33b55;font-size:8px;font-weight:750;letter-spacing:.2px}.hf .video-download{flex-shrink:0}.hf .deck .post-top .video-download{color:#fff}.hf .select-videos.active,.hf .post-select[aria-pressed=true]{color:var(--accent);background:var(--tint)}.hf .post.is-selected{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}.hf .selection-bar{display:flex;align-items:center;gap:10px;margin:0 0 16px;padding:10px;border:1px solid var(--line);border-radius:16px;background:var(--surface);font-size:12px;position:sticky;top:calc(var(--chrome-top,92px) + 8px);z-index:20}.hf .selection-bar>span{flex:1;white-space:nowrap}.hf .selection-bar .primary,.hf .selection-bar .secondary{min-height:36px;padding:0 13px;font-size:12px;border-radius:11px}.hf .selection-bar .icon-button{width:32px;height:36px}@container hot-factory(max-width:520px){.hf .top-actions .select-videos{width:36px;height:40px}.hf .top-actions .read-all-comments{width:36px}.hf .selection-bar{gap:7px;padding:8px;margin-bottom:12px}.hf .selection-bar .primary,.hf .selection-bar .secondary{padding:0 10px}}.hf.selecting-videos .post-cta,.hf.selecting-videos .post-action-icons>[data-action^=vote-]{display:none}\n.hf-shell{container:hot-factory / inline-size;height:100%;min-height:0;overflow:auto;flex:1}.hf{position:relative;height:100%;min-height:600px;background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;--bg:var(--surface-inset,#f6f7f9);--surface:var(--surface-panel,#fff);--surface2:var(--surface-hover,#f0f2f5);--text:var(--text-standard,#17191e);--muted:var(--text-subtle,#90959f);--line:var(--border-standard,#e9ebef);--accent:var(--blue-11,#007aff);--tint:var(--blue-3,#eaf3ff);--nav:var(--bg)}\n.hf .topbar{height:auto;min-height:80px;padding:12px 24px}.hf .wordmark{font-size:21px}.hf .topbar-main{gap:16px}.hf .step-nav{gap:2px}.hf .nav-item{padding:9px 12px}.hf .top-actions{gap:6px}.hf .primary.accent{background:var(--accent);color:#fff}.hf.deck-active{overflow:hidden}.hf.deck-active .workspace{position:absolute;top:var(--chrome-top,80px);height:calc(100% - var(--chrome-top,80px));padding-bottom:12px}.hf .workspace{padding:24px;max-width:1320px}.hf .workspace.deck-workspace{max-width:1080px}.hf .stat-line{display:flex;gap:14px;font-size:12px;color:var(--muted);margin:7px 0}.hf .stat-line span{display:flex;gap:3px;align-items:center}.hf .stat-line .icon{width:16px;height:16px}.hf .deck .stat-line{color:#fff}.hf .deck .post-detail{bottom:14px;pointer-events:auto}.hf .deck .post-title{font-size:14px;white-space:normal}.hf .flow-columns{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,1fr);gap:24px;align-items:start}.hf .flow-section{background:var(--surface);border:1px solid var(--line);border-radius:24px;padding:22px;min-width:0}.hf .flow-section h2{font-size:17px;margin:0 0 18px}.hf .flow-section h3{font-size:14px;margin:20px 0 12px}.hf .field{display:grid;gap:6px;margin:12px 0;font-size:12px;color:var(--muted)}.hf .field input,.hf .field select,.hf .field textarea,.hf .task-pick select{width:100%;min-width:0;border:0;border-radius:12px;padding:11px 12px;background:var(--surface2);color:var(--text);font:inherit;font-size:13px}.hf .field textarea{min-height:76px;resize:vertical}.hf .field-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:0 14px}.hf .muted{color:var(--muted);font-size:12px}.hf .notice{padding:12px 14px;background:var(--tint);border-radius:12px;font-size:12px;margin:12px 0;color:var(--accent)}.hf .error{color:var(--red);font-size:13px;white-space:pre-wrap;margin:10px 0}.hf .inline-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:18px}.hf .task-pick{display:flex;gap:12px;align-items:center;margin-bottom:18px}.hf .task-pick select{max-width:300px;background:var(--surface)}.hf .comparison{display:grid;grid-template-columns:1fr 1fr;gap:14px}.hf .compare-media{aspect-ratio:3/4;border-radius:16px;background:var(--surface2);position:relative;overflow:hidden;display:grid;place-items:center;color:var(--muted);font-size:12px}.hf .compare-media img,.hf .compare-media video{width:100%;height:100%;object-fit:contain}.hf .comparison figure{margin:0}.hf figcaption{font-size:12px;color:var(--muted);margin-top:8px}.hf .metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.hf .metric{padding:14px;border-radius:14px;background:var(--surface2)}.hf .metric strong{display:block;font-size:26px;font-weight:600;margin:4px 0}.hf .metric span,.hf .metric small{color:var(--muted);font-size:11px}.hf .sheet-row{font-size:12px;gap:12px}.hf .sheet-row>span:first-child{min-width:80px;color:var(--muted)}.hf .sheet-row>span:last-child{min-width:0;overflow-wrap:anywhere}.hf .discussion-panel{padding-top:0}.hf .discussion-panel .segment{margin-bottom:18px}.hf .discussion-panel .field input,.hf .discussion-panel .field textarea{background:var(--surface)}.hf .comment p{font-size:13px}.hf .source-caption{font-size:11px;color:var(--muted);margin:16px 0}.hf .empty-business{text-align:center;padding:70px 20px}.hf .empty-business h2{font-size:20px}.hf .empty-business p{font-size:13px;color:var(--muted);margin:12px auto 20px;max-width:420px}.hf .batch-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:18px}.hf .field input[type=checkbox]{width:16px}.hf .toolbar-label{font-size:11px;color:var(--muted)}.hf .feed:not(.deck) .media-placeholder{font-size:11px;padding:10px;gap:6px}.hf .feed:not(.deck) .media-placeholder>.icon{width:22px;height:22px}.hf .nav-arrows{display:flex}.hf .nav-arrows .icon-button{width:32px;height:32px}.hf details{margin-top:14px}.hf summary{font-size:12px;cursor:pointer;color:var(--muted)}.hf .sheet-overlay{position:sticky;top:0;height:100%;z-index:90}.hf .modal-layer{position:absolute;inset:0;z-index:90}.hf .status-strip{font-size:12px;padding:6px 24px;background:var(--surface);border-bottom:1px solid var(--line)}.hf .status-strip:empty{display:none}\n@container hot-factory (max-width:1000px){.hf .topbar-main{flex-wrap:wrap}.hf .step-nav{order:3;width:100%;overflow:auto;justify-content:center}.hf .top-actions{margin-left:auto}.hf .topbar-main{height:auto}.hf .topbar{padding:10px 16px}.hf .nav-item .icon{display:none}.hf .nav-item{font-size:12px;flex:1;justify-content:center}.hf .flow-columns{gap:16px}.hf .discussion-panel{width:260px}.hf .workspace.deck-workspace{gap:24px}.hf .task-pick{flex-wrap:wrap}}\n@container hot-factory (max-width:720px){.hf .workspace{padding:18px 16px}.hf .flow-columns{grid-template-columns:1fr}.hf .nav-item{font-size:10px;padding:8px 4px;min-height:38px}.hf .page-header{flex-wrap:wrap}.hf .flow-section{padding:18px}.hf .discussion-panel{display:none}.hf .wordmark{font-size:20px}.hf .top-actions .secondary{padding:0 10px;min-height:36px;font-size:11px}.hf .top-actions .primary{padding:0 14px;min-height:36px;font-size:12px}.hf .metric-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.hf .metric{padding:10px}.hf .metric span{font-size:10px}.hf .feed:not(.deck){grid-template-columns:1fr}.hf .workspace.deck-workspace{display:block;max-width:580px}.hf.deck-active .page-header{margin-bottom:10px}.hf .feed-toolbar{flex-wrap:wrap}.hf .sheet{padding:20px;max-height:85%}}\n';
var CAT_POSTER = "data:image/webp;base64,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";
function apply(ctx) {
  const R = ctx.react, h = R.createElement;
  const paths = {
    inbox: "m4 4-2 11v5h20v-5L20 4H4Z M2 15h6l2 3h4l2-3h6",
    check: "m5 12 4 4L19 6",
    x: "m6 6 12 12M18 6 6 18",
    next: "M4 12h16m-6-6 6 6-6 6",
    back: "M20 12H4m6-6-6 6 6 6",
    chat: "M21 11.5a9 9 0 0 1-9 9c-1.5 0-3-.4-4.2-1L3 21l1.5-4.8A9 9 0 1 1 21 11.5Z",
    heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
    save: "m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2L12 17.3l-5.7 3 1.1-6.3L3 9.6l6.3-.9Z",
    list: "M3 4h6v6H3ZM13 6h8M13 9h6M3 14h6v6H3ZM13 16h8M13 19h6",
    swipe: "M7 3h14v18H7ZM4 6H2v14h2",
    external: "M14 3h7v7m0-7L10 14M10 3H3v18h18v-7",
    search: "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-1 6 5 5",
    film: "M3 8h18v13H3ZM3 8 20 3l-1-3L2 5l1 3ZM6 4l3 3M12 2l3 3M3 13h18"
  };
  const icon = (k) => h(
    "svg",
    { className: "icon", viewBox: "0 0 24 24", "aria-hidden": true },
    h("path", { d: paths[k] || paths.chat })
  );
  const avatar = (s) => h(
    "span",
    {
      className: "avatar",
      style: { "--avatar-bg": "#e6edf9", "--avatar-fg": "#526b8f" }
    },
    [...s || "待"][0]
  );
  const button = (label, fn, cls = "secondary", disabled = false, props = {}) => h(
    "button",
    { type: "button", className: cls, onClick: fn, disabled, ...props },
    label
  );
  const link = (url, label) => safeURL(url) ? h(
    "a",
    { href: safeURL(url), target: "_blank", rel: "noopener noreferrer" },
    label
  ) : h("span", { className: "muted" }, "待补");
  const num = (x) => x === null || x === void 0 ? "—" : x.toLocaleString("zh-CN");
  function App({ connection }) {
    const [channel, setChannel] = R.useState(SOURCE_CHANNEL), [rows, setRows] = R.useState([]), [draft, setDraft] = R.useState(null), [stage, setStage] = R.useState(0), [mode, setMode] = R.useState("swipe"), [side, setSide] = R.useState("comments");
    const [loading, setLoading] = R.useState(true), [busy, setBusy] = R.useState(false), [error, setError] = R.useState(""), [notice, setNotice] = R.useState(""), [refresh, setRefresh] = R.useState(0), [query, setQuery] = R.useState(""), [filter, setFilter] = R.useState("全部");
    const [selected, setSelected] = R.useState(/* @__PURE__ */ new Set()), [modal, setModal] = R.useState(""), [eventJSON, setEventJSON] = R.useState(""), [interactionJSON, setInteractionJSON] = R.useState(""), [commentJSON, setCommentJSON] = R.useState(""), [batchOwner, setBatchOwner] = R.useState(""), [, permissionVersion] = R.useState(0);
    const root = R.useRef(null), writing = R.useRef(false);
    const repo = R.useMemo(
      () => createRepository(ctx.relay),
      [connection.session, connection.scope, connection.viewer]
    );
    R.useEffect(() => () => repo.dispose(), [repo]);
    R.useEffect(() => {
      const node = root.current;
      if (!node || !modal) return;
      const previous = document.activeElement;
      const dialog = node.querySelector('[role="dialog"]');
      dialog?.querySelector("button,input,select,textarea")?.focus();
      const keydown = (e) => {
        if (e.key === "Escape" && !writing.current) {
          e.preventDefault();
          setModal("");
        }
        if (e.key === "Tab" && dialog) {
          const elements = [
            ...dialog.querySelectorAll("button,input,select,textarea,a[href]")
          ].filter((x) => !x.disabled && x.getClientRects().length);
          const first = elements[0], last = elements.at(-1);
          if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
            e.preventDefault();
            first?.focus();
          }
        }
      };
      node.addEventListener("keydown", keydown);
      return () => {
        node.removeEventListener("keydown", keydown);
        if (previous?.isConnected) previous.focus();
      };
    }, [modal]);
    R.useEffect(
      () => connection.session?.channels.subscribeList?.(
        () => permissionVersion((v) => v + 1)
      ),
      [connection.session]
    );
    const accessible = readAllowed(connection, channel), writable = accessible && !!connection.session?.outbox?.supports?.(45010);
    R.useEffect(() => {
      const node = root.current;
      if (!node) return;
      const update = () => {
        const top = node.querySelector(".topbar");
        const strip = node.querySelector(".status-strip");
        node.style.setProperty(
          "--chrome-top",
          (top?.offsetHeight || 80) + (strip?.offsetHeight || 0) + "px"
        );
      };
      const o = new ResizeObserver(update);
      o.observe(node);
      if (node.querySelector(".topbar"))
        o.observe(node.querySelector(".topbar"));
      if (node.querySelector(".status-strip"))
        o.observe(node.querySelector(".status-strip"));
      update();
      return () => o.disconnect();
    }, [stage, mode, error, notice]);
    R.useEffect(() => {
      let alive = true, sync, off;
      setRows([]);
      setDraft(null);
      setSelected(/* @__PURE__ */ new Set());
      setLoading(true);
      setError("");
      setNotice("");
      if (!accessible) {
        setLoading(false);
        return;
      }
      const consume = (events) => {
        if (!alive || !repo.active(channel)) return;
        const data = events.map((e) => decodeEvent(e, channel)).filter(Boolean);
        setRows(data);
        setDraft((d2) => d2 || data[0] || null);
        setLoading(false);
      };
      const finite = async () => {
        try {
          consume(await repo.read(channel));
        } catch (e) {
          if (alive) {
            setError(e.message);
            setLoading(false);
          }
        }
      };
      if (typeof repo.session?.artifacts?.sync === "function") {
        try {
          sync = repo.session.artifacts.sync({
            kinds: [45010],
            "#h": [channel],
            "#type": [TYPE]
          });
          const update = () => {
            if (!alive) return;
            const s = sync.snapshot();
            if (s.status === "live") consume(s.events);
            else if (["unsupported", "error"].includes(s.status)) {
              off?.();
              sync.dispose();
              sync = void 0;
              void finite();
            } else if (s.status === "restricted") {
              setRows([]);
              setDraft(null);
              setLoading(false);
              setError("当前频道访问已撤销");
            }
          };
          off = sync.subscribe(update);
          update();
        } catch {
          void finite();
        }
      } else void finite();
      return () => {
        alive = false;
        off?.();
        sync?.dispose();
      };
    }, [repo, channel, refresh, accessible]);
    const current = accessible ? rows : [], d = accessible ? draft : null;
    const dirty = !!d && JSON.stringify(d) !== JSON.stringify(current.find((x) => x.id === d.id));
    const leave = () => !dirty || typeof globalThis.confirm === "function" && globalThis.confirm("有未保存修改，放弃修改后切换？");
    const patch = (key, value, group) => setDraft(
      (p) => group ? { ...p, [group]: { ...p[group], [key]: value } } : { ...p, [key]: value }
    );
    function choose(c) {
      if (busy || !leave()) return;
      setDraft(clone(normalizeCampaign(c)));
      setError("");
      setNotice("");
      setEventJSON("");
      setInteractionJSON("");
      setCommentJSON("");
    }
    async function runSave(value = d) {
      if (writing.current || !writable) return null;
      writing.current = true;
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const saved = await repo.save(value, channel);
        if (!repo.active(channel)) return null;
        setRows((a) => [...a.filter((x) => x.id !== saved.id), saved]);
        setDraft(saved);
        setNotice("已保存到共享频道，并读回确认同一版本");
        return saved;
      } catch (e) {
        if (repo.active(channel)) setError(e.message);
        return null;
      } finally {
        writing.current = false;
        setBusy(false);
      }
    }
    async function saveSeeds() {
      if (writing.current || !writable) return;
      writing.current = true;
      setBusy(true);
      setError("");
      setNotice("");
      let count = 0;
      try {
        const have = (await repo.read(channel)).map((e) => decodeEvent(e, channel)).filter(Boolean);
        let first;
        for (const seed of seeds().filter(
          (s) => !have.some((c) => c.id === s.id)
        )) {
          const saved = await repo.save(seed, channel);
          if (!repo.active(channel)) return;
          setRows((a) => [...a.filter((x) => x.id !== saved.id), saved]);
          first ??= saved;
          count++;
        }
        if (!draft && first) setDraft(first);
        setNotice(`已保存${count}条待评估候选，未自动判为通过`);
      } catch (e) {
        if (repo.active(channel)) setError(`已保存${count}条；${e.message}`);
      } finally {
        writing.current = false;
        setBusy(false);
      }
    }
    async function advance(target, value = d) {
      if (!value) return;
      const reasons = gate(value, target);
      if (reasons.length) {
        setError(reasons.join("；"));
        return;
      }
      const saved = await runSave({ ...value, stage: target });
      if (saved) {
        setStage(target);
        setModal("");
      }
    }
    async function batchSubmit() {
      if (writing.current || !writable) return;
      const values = current.filter((c) => selected.has(c.id)).map((c) => ({
        ...clone(c.id === d?.id ? d : c),
        stage: 1,
        owners: {
          ...(c.id === d?.id ? d : c).owners,
          maker: text(batchOwner) || (c.id === d?.id ? d : c).owners.maker
        }
      }));
      try {
        if (!values.length) throw Error("先勾选笔记");
        for (const c of values) validateCampaign(c);
      } catch (e) {
        setError(e.message);
        return;
      }
      writing.current = true;
      setBusy(true);
      setError("");
      let count = 0;
      try {
        let first;
        for (const c of values) {
          const saved = await repo.save(c, channel);
          if (!repo.active(channel)) return;
          setRows((a) => [...a.filter((x) => x.id !== saved.id), saved]);
          first ??= saved;
          count++;
        }
        setDraft(first);
        setSelected(/* @__PURE__ */ new Set());
        setModal("");
        setStage(1);
        setNotice(`已将${count}条筛选通过的笔记交给复刻；BD可并行开始`);
      } catch (e) {
        if (repo.active(channel))
          setError(`已交接${count}条；${e.message}。请刷新核对后处理剩余项`);
      } finally {
        writing.current = false;
        setBusy(false);
      }
    }
    function field(label, key, group, options, numeric = false, multi = false) {
      const val = group ? d[group]?.[key] : d[key];
      return h(
        "label",
        { className: "field" },
        h("span", null, label),
        options ? h(
          "select",
          {
            "aria-label": label,
            value: val ?? "",
            disabled: busy || !writable,
            onChange: (e) => patch(key, e.target.value, group)
          },
          options.map((v) => h("option", { key: v, value: v }, v))
        ) : h(multi ? "textarea" : "input", {
          "aria-label": label,
          value: val ?? "",
          disabled: busy || !writable,
          type: numeric ? "number" : "text",
          min: numeric ? 0 : void 0,
          onChange: (e) => patch(
            key,
            numeric ? e.target.value === "" ? null : Number(e.target.value) : e.target.value,
            group
          )
        })
      );
    }
    const grid = (...children) => h("div", { className: "field-grid" }, children);
    const actions = (...children) => h("div", { className: "inline-actions" }, children);
    const row = (a, b) => h(
      "div",
      { className: "sheet-row" },
      h("span", null, a),
      h("span", null, b)
    );
    const section = (title, ...children) => h(
      "section",
      { className: "flow-section" },
      h("h2", null, title),
      children
    );
    const details = (title, ...children) => h("details", null, h("summary", null, title), children);
    const saveButton = () => button(
      busy ? "保存中…" : dirty ? "保存修改" : "保存",
      () => runSave(),
      "primary accent",
      !writable || busy || !d
    );
    function imageFor(c) {
      return safeURL(c.sourceMediaURL) || (c.id === seeds()[0].id && c.sourceURL === seeds()[0].sourceURL ? CAT_POSTER : null);
    }
    function media(c, result = false) {
      const url = result ? safeURL(c.template.resultURL) : imageFor(c);
      if (!url)
        return h(
          "div",
          { className: "media-placeholder" },
          icon("external"),
          h("span", null, result ? "尚未提交复刻结果" : "原帖媒体待采集")
        );
      const video = result ? /\.(mp4|webm|mov)(?:\?|$)/i.test(url) : c.sourceMediaKind === "视频";
      return video ? h("video", {
        src: url,
        controls: true,
        preload: "metadata",
        "aria-label": result ? "复刻成片" : "原帖视频"
      }) : h(
        "div",
        { className: "image-gallery single" },
        h("img", {
          src: url,
          alt: result ? "复刻结果" : c.title + "原帖封面",
          onError: (e) => {
            e.currentTarget.alt = "媒体加载失败，请打开对应链接查看";
          }
        })
      );
    }
    const statLine = (c) => h(
      "div",
      { className: "stat-line" },
      [
        ["heart", c.likes !== null ? num(c.likes) : c.likesDisplay || "—"],
        ["save", num(c.saves)],
        ["chat", num(c.comments)]
      ].map(([i, v]) => h("span", { key: i }, icon(i), v))
    );
    function toggleSelect(c) {
      setSelected((old) => {
        const next = new Set(old);
        next.has(c.id) ? next.delete(c.id) : next.add(c.id);
        return next;
      });
    }
    function card(c) {
      return h(
        "article",
        {
          key: c.id,
          className: "post" + (selected.has(c.id) ? " is-selected" : "")
        },
        h(
          "header",
          { className: "post-top" },
          avatar(c.author || c.owners.finder),
          h(
            "div",
            { className: "post-person" },
            h("span", { className: "person-name" }, c.author || "作者待采集"),
            h(
              "span",
              { className: "person-meta" },
              `${c.owners.finder || "待分配"} · ${c.cooperation.decision === "放弃" ? "已放弃" : c.decision}`
            )
          ),
          button(
            icon("external"),
            () => {
              choose(c);
              setMode("swipe");
            },
            "icon-button",
            busy,
            { "aria-label": "展开笔记 " + c.title }
          )
        ),
        h("div", { className: "visual" }, media(c)),
        h(
          "div",
          { className: "post-detail" },
          h("h2", { className: "post-title" }, c.title),
          statLine(c),
          h(
            "div",
            { className: "social-line" },
            h(
              "label",
              { className: "likes-summary" },
              h("input", {
                type: "checkbox",
                "aria-label": "勾选 " + c.title,
                checked: selected.has(c.id),
                onChange: () => toggleSelect(c),
                disabled: busy
              }),
              selected.has(c.id) ? "已勾选" : "勾选优质候选"
            )
          )
        )
      );
    }
    function commentsView() {
      return h(
        R.Fragment,
        null,
        h(
          "header",
          { className: "evaluation-history-title" },
          h("h3", null, `原帖评论 · 共${num(d.comments)}条`)
        ),
        h(
          "div",
          { className: "discussion-list" },
          d.sourceComments.length ? d.sourceComments.map(
            (c, i) => h(
              "div",
              { className: "comment", key: i },
              avatar(c.author),
              h(
                "div",
                null,
                h(
                  "div",
                  { className: "comment-header" },
                  h("strong", null, c.author)
                ),
                h("p", null, c.text)
              )
            )
          ) : h("p", { className: "empty-discussion" }, "具体评论待采集")
        ),
        h(
          "p",
          { className: "source-caption" },
          `原帖快照 · ${d.observedAt || "采集时间待补"} · 仅展示已录入节选`
        ),
        link(d.sourceURL, "打开原帖查看完整内容 ↗")
      );
    }
    function assessment() {
      return h(
        R.Fragment,
        null,
        field("笔记标题", "title"),
        grid(
          field("找热点负责人", "finder", "owners"),
          field("原作者", "author")
        ),
        field("粉丝数（需低于2000）", "followers", null, null, true),
        grid(
          field("点赞数（精确值）", "likes", null, null, true),
          field("点赞显示值（如1.9万）", "likesDisplay"),
          field("收藏数", "saves", null, null, true),
          field("评论数", "comments", null, null, true)
        ),
        field("互动判断", "engagement", null, ["待判断", "较高", "一般"]),
        field("内容类型", "contentType", null, [
          "待判断",
          "娱乐",
          "泛娱乐",
          "利他教程"
        ]),
        field("用户为什么愿意亲自制作", "motivation", null, null, false, true),
        field("可以替换什么角色或素材", "replaceable"),
        field("筛选结论", "decision", null, ["待评估", "通过", "淘汰"]),
        field("结论理由", "decisionReason", null, null, false, true),
        field("复刻负责人", "maker", "owners"),
        details(
          "原帖、媒体与采集证据",
          field("原帖链接", "sourceURL"),
          field("证据链接", "sourceEvidence"),
          field("采集时间（ISO时间）", "observedAt"),
          field("图片／视频直链", "sourceMediaURL"),
          field("媒体类型", "sourceMediaKind", null, [
            "待采集",
            "图片",
            "视频"
          ]),
          h(
            "label",
            { className: "field" },
            "原帖评论节选 JSON（author、text）",
            h("textarea", {
              "aria-label": "原帖评论JSON",
              value: commentJSON,
              disabled: busy,
              onChange: (e) => setCommentJSON(e.target.value)
            })
          ),
          button(
            "载入评论节选到草稿",
            () => {
              try {
                const next = { ...d, sourceComments: JSON.parse(commentJSON) };
                validateDetails(next);
                setDraft(next);
                setCommentJSON("");
                setNotice("评论已载入草稿，保存后共享");
              } catch (e) {
                setError(e.message);
              }
            },
            "secondary",
            busy || !writable
          )
        ),
        actions(
          saveButton(),
          button(
            "通过并交给复刻",
            () => advance(1, { ...d, decision: "通过" }),
            "primary accent",
            busy || !writable
          )
        )
      );
    }
    function sidebar() {
      return h(
        "aside",
        { className: "discussion-panel" },
        h(
          "div",
          { className: "segment" },
          button(
            "原帖评论",
            () => setSide("comments"),
            side === "comments" ? "active" : ""
          ),
          button(
            "筛选评估",
            () => setSide("review"),
            side === "review" ? "active" : ""
          )
        ),
        side === "comments" ? commentsView() : assessment(),
        side === "comments" && actions(
          button("开始评估", () => setSide("review"), "primary accent", busy)
        )
      );
    }
    const candidates = current.filter(
      (c) => c.title.toLowerCase().includes(query.toLowerCase()) && (filter === "全部" || filter === "已勾选" && selected.has(c.id) || filter === "待评估" && c.decision === "待评估" || filter === "通过" && c.decision === "通过")
    );
    function nextNote() {
      const i = candidates.findIndex((c) => c.id === d?.id);
      if (candidates.length) choose(candidates[(i + 1) % candidates.length]);
    }
    function noteContent() {
      return h(
        "div",
        {
          className: "workspace" + (mode === "swipe" && d ? " deck-workspace" : "")
        },
        h(
          "main",
          { className: "main" },
          pageHeader(),
          h(
            "section",
            { className: "feed-toolbar" },
            h(
              "div",
              { className: "segment" },
              ["全部", "待评估", "已勾选"].map(
                (f) => button(
                  f === "已勾选" ? `${f} ${selected.size}` : f,
                  () => {
                    setFilter(f);
                    setMode("feed");
                  },
                  filter === f ? "active" : ""
                )
              )
            ),
            h(
              "div",
              { className: "display-modes" },
              button(
                icon("list"),
                () => setMode("feed"),
                "icon-button" + (mode === "feed" ? " active" : ""),
                false,
                { "aria-label": "紧凑列表视图" }
              ),
              button(
                icon("swipe"),
                () => {
                  if (!candidates.some((c) => c.id === d?.id) && candidates[0])
                    choose(candidates[0]);
                  setMode("swipe");
                },
                "icon-button" + (mode === "swipe" ? " active" : ""),
                !candidates.length,
                { "aria-label": "滑卡视图" }
              )
            )
          ),
          h(
            "section",
            { className: "feed" + (mode === "swipe" && d ? " deck" : "") },
            mode === "swipe" && d ? card(d) : candidates.length ? candidates.map(card) : h(
              "div",
              { className: "empty" },
              h("h2", null, "没有符合条件的笔记")
            )
          ),
          mode === "swipe" && d ? h(
            "div",
            { className: "deck-actions" },
            button(
              icon("chat"),
              () => setModal("review"),
              "deck-action minor",
              busy,
              { "aria-label": "评论与筛选评估" }
            ),
            button(
              [icon("x"), h("strong", { key: "label" }, "淘汰")],
              () => {
                patch("decision", "淘汰");
                setSide("review");
                setModal("review");
              },
              "deck-action major no",
              busy || !writable
            ),
            button(
              [
                icon("check"),
                h(
                  "strong",
                  { key: "label" },
                  selected.has(d.id) ? "已勾选" : "勾选"
                )
              ],
              () => toggleSelect(d),
              "deck-action major yes",
              busy
            ),
            button(icon("next"), nextNote, "deck-action minor", busy, {
              "aria-label": "下一条笔记"
            })
          ) : h(
            "div",
            { className: "batch-bar" },
            button(
              `交给复刻 · ${selected.size}条`,
              () => setModal("batch"),
              "primary accent",
              busy || !writable || !selected.size
            ),
            h(
              "span",
              { className: "muted" },
              "入选需满足筛选条件，并明确制作负责人"
            )
          )
        ),
        mode === "swipe" && d ? sidebar() : null
      );
    }
    function pageHeader() {
      return h(
        "header",
        { className: "page-header" },
        h(
          "div",
          null,
          h("div", { className: "eyebrow" }, "HOT FACTORY"),
          h(
            "h1",
            null,
            STAGES[stage],
            stage === 0 && h("span", { className: "title-count" }, current.length)
          )
        ),
        stage === 0 && h(
          "label",
          { className: "search" },
          icon("search"),
          h("input", {
            "aria-label": "搜索热点",
            type: "search",
            placeholder: "搜索笔记",
            value: query,
            onChange: (e) => {
              setQuery(e.target.value);
              setMode("feed");
            }
          })
        ),
        h(
          "div",
          { className: "nav-arrows" },
          button(
            icon("back"),
            () => setStage(Math.max(0, stage - 1)),
            "icon-button",
            stage === 0 || busy,
            { "aria-label": "上一个工作空间" }
          ),
          button(
            icon("next"),
            () => setStage(Math.min(4, stage + 1)),
            "icon-button",
            stage === 4 || busy,
            { "aria-label": "下一个工作空间" }
          )
        )
      );
    }
    function owner(which) {
      return field("负责人", which, "owners");
    }
    function cloneContent() {
      return h(
        "div",
        { className: "flow-columns" },
        section(
          "原片与复刻结果",
          h(
            "div",
            { className: "comparison" },
            [
              ["原帖参考", false],
              ["复刻成片", true]
            ].map(
              ([label, result]) => h(
                "figure",
                { key: label },
                h("div", { className: "compare-media" }, media(d, result)),
                h(
                  "figcaption",
                  null,
                  link(
                    result ? d.template.resultURL : d.sourceURL,
                    label + " ↗"
                  )
                )
              )
            )
          ),
          actions(
            saveButton(),
            button("同步跟进BD", () => setStage(2), "secondary", busy)
          )
        ),
        section(
          "制作任务",
          owner("maker"),
          field("原片／素材链接", "referenceURL", "template"),
          field("提示词与参数文档", "promptURL", "template"),
          field("复刻成片链接", "resultURL", "template"),
          field("模板使用入口", "platformURL", "template"),
          field("验收状态", "acceptance", "template", [
            "待制作",
            "制作中",
            "待验收",
            "样片通过",
            "平台通过",
            "未通过"
          ]),
          h(
            "p",
            { className: "notice" },
            "复刻与BD可以并行。制作工作流接口待接入。"
          ),
          actions(
            button(
              "记录制作进度",
              () => advance(1),
              "secondary",
              busy || !writable
            )
          )
        )
      );
    }
    function bdContent() {
      const failed = d.cooperation.status === "未达成";
      return h(
        "div",
        { className: "flow-columns" },
        section(
          "商务对接",
          row("原作者", d.author || "待采集"),
          row("来源笔记", link(d.sourceURL, d.title + " ↗")),
          owner("bd"),
          field("对接状态", "status", "cooperation", [
            "待联系",
            "联系中",
            "已达成",
            "未达成"
          ]),
          field("合作证据链接", "evidenceURL", "cooperation"),
          field(
            "合作条件与沟通记录",
            "terms",
            "cooperation",
            null,
            false,
            true
          ),
          field("下次跟进", "next", "cooperation"),
          failed && h(
            R.Fragment,
            null,
            h(
              "p",
              { className: "notice" },
              "BD未成功，请决定继续制作还是放弃，并记录理由。"
            ),
            field("失败后决定", "decision", "cooperation", [
              "待决定",
              "继续制作",
              "放弃"
            ]),
            field(
              "决策理由",
              "decisionReason",
              "cooperation",
              null,
              false,
              true
            )
          ),
          actions(
            saveButton(),
            button(
              "保存并进入分发准备",
              () => advance(3),
              "primary accent",
              busy || !writable
            )
          )
        ),
        section(
          "推进条件",
          row("模板验收", d.template.acceptance),
          row("BD", d.cooperation.status),
          row("失败后决策", d.cooperation.decision || "待决定"),
          h(
            "p",
            { className: "source-caption" },
            "BD成功后可准备分发；复刻结果仍须平台验收。BD未成功时，继续制作需有明确理由，放弃后保留记录。"
          ),
          actions(
            button(
              "保存并回到复刻",
              async () => {
                const saved = await runSave();
                if (saved) setStage(1);
              },
              "secondary",
              busy || !writable
            ),
            button(
              "记录BD进度",
              () => advance(2),
              "secondary",
              busy || !writable
            )
          )
        )
      );
    }
    function codeForm(c, i) {
      const cp = (key, v) => patch(
        "codes",
        d.codes.map((a, j) => j === i ? { ...a, [key]: v } : a)
      );
      return h(
        "section",
        { key: i },
        h("h3", null, `口令 ${i + 1}`),
        grid(
          ...[
            ["code", "口令"],
            ["entryURL", "使用入口"],
            ["platformEvidence", "开通证据"],
            ["postURL", "实际投放链接"],
            ["placement", "置顶／引流／引用位置"]
          ].map(
            ([key, label]) => h(
              "label",
              { className: "field" },
              label,
              h("input", {
                "aria-label": `${label} ${i + 1}`,
                value: c[key],
                disabled: busy || !writable,
                onChange: (e) => cp(key, e.target.value)
              })
            )
          )
        ),
        h(
          "label",
          { className: "field" },
          "开通状态",
          h(
            "select",
            {
              "aria-label": `口令状态 ${i + 1}`,
              value: c.status,
              disabled: busy || !writable,
              onChange: (e) => cp("status", e.target.value)
            },
            ["草案", "已开通", "已停用"].map((x) => h("option", { key: x }, x))
          )
        )
      );
    }
    function distribution() {
      return h(
        "div",
        { className: "flow-columns" },
        section(
          "内容与投放",
          owner("distribution"),
          row("来源原帖", link(d.sourceURL, d.sourceURL)),
          field("内容文案与教程文档", "draftURL", "content"),
          field("我方小红书发布帖", "postURL", "content"),
          field("社群入口", "communityURL", "content"),
          field("运营与跟进记录", "followup", "content", null, false, true),
          d.codes.map(codeForm),
          actions(
            button(
              "新增口令",
              () => patch("codes", [
                ...d.codes,
                {
                  code: "",
                  status: "草案",
                  placement: "待定",
                  platformEvidence: "",
                  entryURL: "",
                  postURL: ""
                }
              ]),
              "secondary",
              busy || !writable || d.codes.length >= 40
            ),
            saveButton()
          )
        ),
        section(
          "分发准备",
          row("模板验收", d.template.acceptance),
          row("BD", d.cooperation.status),
          row("决策", d.cooperation.decision || "待决定"),
          h(
            "p",
            { className: "source-caption" },
            "口令开通需平台证据；实际投放位置单独留链接。当前不会自动开通口令、联系作者或发布笔记。"
          ),
          actions(
            button(
              "进入监控",
              () => advance(4),
              "primary accent",
              busy || !writable
            )
          )
        )
      );
    }
    const metric = (label, value, sub) => h(
      "div",
      { className: "metric", key: label },
      h("span", null, label),
      h("strong", null, num(value)),
      h("small", null, sub)
    );
    function monitoring() {
      const m = interactionMetrics(d), counts = metrics(d), per = (val) => val === null ? "—" : `${(val * 100).toFixed(1)}%`;
      return h(
        "div",
        { className: "flow-columns" },
        section(
          "帖子表现",
          h(
            "div",
            { className: "metric-grid" },
            metric("浏览量", d.monitoring.views, "快照"),
            metric("点赞数", d.monitoring.likes, "快照"),
            metric("收藏数", d.monitoring.saves, "快照"),
            metric("@我们的人数", m.mentions, "导入互动去重人数"),
            metric("评论人数", m.commenters, "导入互动去重人数"),
            metric("评论条数", d.monitoring.comments, "帖子整体快照")
          ),
          h(
            "p",
            { className: "source-caption" },
            `帖子快照：${d.monitoring.observedAt || "未采集"} · ${d.monitoring.evidenceURL ? "已附证据" : "自动监控未接入"}`
          ),
          h("h3", null, "口令使用与转化"),
          h(
            "div",
            { className: "metric-grid" },
            metric("使用口令人数", counts.used, "导入用户去重"),
            metric("拿到成果人数", counts.result, "导入用户去重"),
            metric("注册账号人数", counts.registered, "导入用户去重")
          ),
          h(
            "p",
            { className: "source-caption" },
            `使用→成果：${per(counts.resultRate)} · 成果→注册：${per(counts.registerRate)} · ${d.period}`
          ),
          d.codes.map((c) => {
            const a = metrics(d, c.code);
            return row(
              c.code,
              `使用 ${num(a.used)} · 成果 ${num(a.result)} · 注册 ${num(a.registered)}`
            );
          }),
          (counts.orphanResults > 0 || counts.orphanRegistrations > 0) && h(
            "p",
            { className: "notice" },
            `有${counts.orphanResults}位成果用户缺口令使用事件，${counts.orphanRegistrations}位注册用户缺成果事件，请核实漏报。`
          ),
          details(
            "数据来源与导入",
            owner("analyst"),
            grid(
              field("浏览量", "views", "monitoring", null, true),
              field("点赞数", "likes", "monitoring", null, true),
              field("收藏数", "saves", "monitoring", null, true),
              field(
                "评论条数（帖子整体）",
                "comments",
                "monitoring",
                null,
                true
              )
            ),
            field("采集时间（ISO时间）", "observedAt", "monitoring"),
            field("帖子数据证据链接", "evidenceURL", "monitoring"),
            field("统计范围说明", "period"),
            field("口令事件数据完整度", "measurement", null, [
              "unconnected",
              "partial",
              "complete"
            ]),
            h(
              "p",
              { className: "muted" },
              "unconnected=未接入；partial=部分事件；complete=已核齐该范围，才显示转化率。互动导入可能仅为样本。"
            ),
            h(
              "label",
              { className: "field" },
              "口令事件JSON",
              h("textarea", {
                "aria-label": "口令事件JSON",
                value: eventJSON,
                onChange: (e) => setEventJSON(e.target.value),
                disabled: busy
              })
            ),
            button(
              "导入口令事件到草稿",
              () => {
                try {
                  const next = mergeEvents(
                    d.events,
                    JSON.parse(eventJSON),
                    d.codes
                  );
                  patch("events", next);
                  setEventJSON("");
                  setNotice("事件已去重载入草稿，保存后共享");
                } catch (e) {
                  setError(e.message);
                }
              },
              "secondary",
              busy || !writable
            ),
            h(
              "p",
              { className: "source-caption" },
              "字段：id、code、匿名userKey、event(code_used/result_received/registered)、at、evidence。"
            ),
            h(
              "label",
              { className: "field" },
              "提及与评论JSON",
              h("textarea", {
                "aria-label": "提及与评论JSON",
                value: interactionJSON,
                onChange: (e) => setInteractionJSON(e.target.value),
                disabled: busy
              })
            ),
            button(
              "导入提及与评论到草稿",
              () => {
                try {
                  patch(
                    "interactions",
                    mergeInteractions(
                      d.monitoring.interactions,
                      JSON.parse(interactionJSON)
                    ),
                    "monitoring"
                  );
                  setInteractionJSON("");
                  setNotice("互动明细已载入草稿，保存后共享");
                } catch (e) {
                  setError(e.message);
                }
              },
              "secondary",
              busy || !writable
            ),
            h(
              "p",
              { className: "source-caption" },
              "字段：id、匿名userKey、type(mention/comment)、text、at、evidenceURL、handled(false)。"
            ),
            saveButton()
          )
        ),
        section(
          "评论处理与改善",
          d.monitoring.interactions.length ? h(
            "div",
            { className: "discussion-list" },
            d.monitoring.interactions.map(
              (x) => h(
                "div",
                { className: "comment", key: x.id },
                h(
                  "div",
                  null,
                  h(
                    "div",
                    { className: "comment-header" },
                    h(
                      "strong",
                      null,
                      x.type === "mention" ? "提及我们" : "评论"
                    ),
                    h("time", null, x.at)
                  ),
                  h("p", null, x.text),
                  link(x.evidenceURL, "查看原文 ↗"),
                  h(
                    "label",
                    { className: "field" },
                    h("input", {
                      type: "checkbox",
                      "aria-label": "已处理 " + x.id,
                      checked: x.handled,
                      disabled: busy || !writable,
                      onChange: (e) => patch(
                        "interactions",
                        d.monitoring.interactions.map(
                          (v) => v.id === x.id ? { ...v, handled: e.target.checked } : v
                        ),
                        "monitoring"
                      )
                    }),
                    "已处理"
                  )
                )
              )
            )
          ) : h(
            "p",
            { className: "empty-discussion" },
            "尚未导入我方帖子评论或提及明细"
          ),
          h("h3", null, "改善记录"),
          d.improvements.map(
            (item, i) => h(
              "div",
              { key: i },
              details(
                `${item.metric || "待选指标"} · ${item.owner || "待分配"}`,
                ...[
                  ["metric", "改善指标"],
                  ["hypothesis", "原因假设"],
                  ["action", "改善动作"],
                  ["owner", "负责人"],
                  ["reviewAt", "复查时间"],
                  ["before", "改善前证据"],
                  ["after", "改善后证据"]
                ].map(
                  ([k, label]) => h(
                    "label",
                    { className: "field" },
                    label,
                    h("input", {
                      "aria-label": `${label} ${i + 1}`,
                      value: item[k],
                      disabled: busy || !writable,
                      onChange: (e) => patch(
                        "improvements",
                        d.improvements.map(
                          (v, j) => j === i ? { ...v, [k]: e.target.value } : v
                        )
                      )
                    })
                  )
                )
              )
            )
          ),
          actions(
            button(
              "新增改善",
              () => patch("improvements", [
                ...d.improvements,
                {
                  metric: "",
                  hypothesis: "",
                  action: "",
                  owner: "",
                  reviewAt: "",
                  before: "",
                  after: ""
                }
              ]),
              "secondary",
              busy || !writable || d.improvements.length >= 100
            ),
            saveButton()
          )
        )
      );
    }
    function exportData() {
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              {
                schema: 1,
                channel,
                exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
                campaigns: current
              },
              null,
              2
            )
          ],
          { type: "application/json" }
        )
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "HOT_FACTORY_EXPORT.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    const channels = connection.session?.channels.list().channels.filter((c) => readAllowed(connection, c.id)) || [];
    const toolbar = h(
      "header",
      { className: "topbar" },
      h(
        "div",
        { className: "topbar-main" },
        h(
          "span",
          { className: "wordmark" },
          h("span", { className: "brand-icon" }, h("i"), h("i")),
          "热点工厂",
          h("span", { className: "brand-dot" })
        ),
        h(
          "nav",
          { className: "step-nav", "aria-label": "热点工作流" },
          STAGES.map(
            (name, i) => button(
              [
                icon(["inbox", "film", "chat", "next", "check"][i]),
                h("span", { key: "label" }, `${i + 1} ${name}`)
              ],
              () => {
                setStage(i);
                setModal("");
              },
              "nav-item" + (stage === i ? " active" : ""),
              busy,
              { "aria-current": stage === i ? "step" : void 0, key: i }
            )
          )
        ),
        h(
          "div",
          { className: "top-actions" },
          button(
            icon("list"),
            () => setModal("settings"),
            "icon-button",
            busy,
            { "aria-label": "共享频道与工具" }
          ),
          saveButton()
        )
      )
    );
    function modalView() {
      if (!modal || !accessible) return null;
      return h(
        "div",
        { className: "modal-layer" },
        h(
          "div",
          { className: "sheet-overlay" },
          h(
            "section",
            {
              className: "sheet",
              role: "dialog",
              "aria-modal": true,
              "aria-label": modal === "settings" ? "共享频道与工具" : modal === "batch" ? "批量交给复刻" : "评论与筛选评估"
            },
            h(
              "header",
              { className: "sheet-head" },
              h(
                "h2",
                null,
                modal === "settings" ? "共享频道与工具" : modal === "batch" ? "批量交给复刻" : "评论与筛选评估"
              ),
              button(icon("x"), () => setModal(""), "icon-button", busy, {
                "aria-label": "关闭"
              })
            ),
            modal === "settings" ? h(
              R.Fragment,
              null,
              h(
                "label",
                { className: "field" },
                "共享频道",
                h(
                  "select",
                  {
                    "aria-label": "共享频道",
                    value: channel,
                    onChange: (e) => {
                      if (leave()) {
                        setChannel(e.target.value);
                        setModal("");
                      }
                    },
                    disabled: busy
                  },
                  !channels.some((c) => c.id === channel) && h("option", { value: channel }, "待连接工作频道"),
                  channels.map(
                    (c) => h("option", { key: c.id, value: c.id }, c.name || c.id)
                  )
                )
              ),
              actions(
                button(
                  "刷新",
                  () => {
                    if (leave()) {
                      setRefresh((x) => x + 1);
                      setModal("");
                    }
                  },
                  "secondary",
                  busy
                ),
                button(
                  "新增热点",
                  () => {
                    if (leave()) {
                      setDraft(newCampaign(crypto.randomUUID()));
                      setStage(0);
                      setMode("swipe");
                      setModal("review");
                    }
                  },
                  "secondary",
                  busy || !writable
                ),
                button(
                  "导出记录",
                  exportData,
                  "secondary",
                  !current.length
                ),
                button(
                  "保存周洋5条候选",
                  saveSeeds,
                  "primary accent",
                  busy || !writable
                )
              ),
              h(
                "p",
                { className: "sheet-note" },
                "保存后同频道成员可见。负责人不会自动收到通知；插件不会自动联系作者或发帖。"
              )
            ) : modal === "batch" ? h(
              R.Fragment,
              null,
              h(
                "p",
                { className: "muted" },
                `已勾选${selected.size}条；逐条筛选通过后才能交接。`
              ),
              h(
                "label",
                { className: "field" },
                "统一复刻负责人（留空保留各条分工）",
                h("input", {
                  "aria-label": "统一复刻负责人",
                  value: batchOwner,
                  onChange: (e) => setBatchOwner(e.target.value),
                  disabled: busy
                })
              ),
              actions(
                button(
                  "交给复刻",
                  batchSubmit,
                  "primary accent",
                  busy || !writable
                )
              )
            ) : d ? h(
              R.Fragment,
              null,
              commentsView(),
              h("h3", { style: { marginTop: 20 } }, "筛选评估"),
              assessment()
            ) : null,
            error && h("p", { className: "error", role: "alert" }, error)
          )
        )
      );
    }
    return h(
      "div",
      { className: "hf-shell" },
      h("style", null, FACTORY_CSS),
      h(
        "div",
        {
          ref: root,
          className: "hf" + (stage === 0 && mode === "swipe" && d ? " deck-active" : "")
        },
        toolbar,
        h(
          "div",
          { className: "status-strip" },
          error ? h("span", { role: "alert", className: "error" }, error) : notice ? h("span", { role: "status" }, notice) : h(
            "span",
            { className: "muted" },
            `${channels.find((c) => c.id === channel)?.name || "待连接工作频道"} · ${dirty ? "有未保存修改" : "共享记录"} · 自动采集与监控未接入`
          )
        ),
        loading ? h("div", { className: "empty-business" }, "正在读取共享记录…") : !accessible ? h(
          "div",
          { className: "empty-business" },
          h("h2", null, "连接共享工作频道"),
          h(
            "p",
            null,
            "连接社区并取得频道访问后，可读取和保存热点工作流。"
          )
        ) : !d ? h(
          "div",
          { className: "empty-business" },
          h("h2", null, "从一条热点开始"),
          h(
            "p",
            null,
            "周洋已提交5条原帖候选，载入后逐条评估，再分工复刻、BD与分发。"
          ),
          button(
            "载入周洋5条候选",
            saveSeeds,
            "primary accent",
            busy || !writable
          ),
          actions(
            button(
              "新增热点",
              () => {
                setDraft(newCampaign(crypto.randomUUID()));
                setStage(0);
                setMode("swipe");
              },
              "secondary",
              busy || !writable
            )
          )
        ) : stage === 0 ? noteContent() : h(
          "div",
          { className: "workspace" },
          h(
            "main",
            { className: "main" },
            pageHeader(),
            h(
              "div",
              { className: "task-pick" },
              h(
                "select",
                {
                  "aria-label": "当前热点",
                  value: d.id,
                  onChange: (e) => choose(
                    current.find((c) => c.id === e.target.value)
                  ),
                  disabled: busy
                },
                !current.some((c) => c.id === d.id) && h("option", { value: d.id }, d.title),
                current.map(
                  (c) => h(
                    "option",
                    { value: c.id, key: c.id },
                    `${c.title}${c.cooperation.decision === "放弃" ? " · 已放弃" : ""}`
                  )
                )
              ),
              h(
                "span",
                { className: "muted" },
                `当前进度：${STAGES[d.stage]} · ${d.owners[OWNERS[d.stage]] || "待分配"}`
              )
            ),
            stage === 1 ? cloneContent() : stage === 2 ? bdContent() : stage === 3 ? distribution() : monitoring(),
            details(
              "卡点与下次交付",
              field("当前卡点", "blocker", null, null, false, true),
              field("下次交付时间", "nextDelivery")
            ),
            h(
              "p",
              { className: "source-caption" },
              "自动采集、制作与平台监控接口待接入；当前支持登记、共享和导入真实数据。"
            )
          )
        ),
        modalView()
      )
    );
  }
  function ScopedPage() {
    const connection = R.useSyncExternalStore(
      ctx.relay.subscribe,
      ctx.relay.snapshot,
      ctx.relay.snapshot
    );
    return h(App, {
      key: `${connection.scope || "none"}:${connection.generation || 0}`,
      connection
    });
  }
  ctx.pages.register({
    id: "main",
    title: "热点工厂",
    primary: true,
    placement: "dock",
    layout: "workspace",
    component: ScopedPage
  });
}
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
function apply2(ctx) {
  return apply(withPluginIcon(ctx, "data:image/png;base64,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"));
}

// src/plugin-icons/context.mjs
function withPluginIcon2(context, icon) {
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
function apply3(ctx) {
  return apply2(withPluginIcon2(ctx, "data:image/png;base64,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"));
}
export {
  EVENT_TYPES,
  OWNERS,
  SOURCE_CHANNEL,
  STAGES,
  TYPE,
  apply3 as apply,
  createRepository,
  decodeEvent,
  evaluateCandidate,
  gate,
  inject,
  interactionMetrics,
  mergeEvents,
  mergeInteractions,
  metrics,
  newCampaign,
  normalizeCampaign,
  readAllowed,
  safeURL,
  seeds,
  template,
  validateCampaign
};

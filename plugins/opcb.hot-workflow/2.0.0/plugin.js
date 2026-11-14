export const inject = ["react", "pages", "relay"];
export const TYPE = "opcb.hot-workflow.v1";
export const SOURCE_CHANNEL = "7dc199bc-755b-47bb-8f71-fe311b1f1ab1";
export const STAGES = ["热点笔记", "复刻模板", "BD", "内容分发", "数据监控"];
export const OWNERS = ["finder", "maker", "bd", "distribution", "analyst"];
export const EVENT_TYPES = ["code_used", "result_received", "registered"];
const tag = (e, name) => e.tags?.find((t) => t[0] === name)?.[1];
const clone = (value) => JSON.parse(JSON.stringify(value));
const text = (value) => (typeof value === "string" ? value.trim() : "");
export function safeURL(value) {
  try {
    const u = new URL(value);
    return ["https:", "http:", "buzz:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function newCampaign(id, title = "新热点") {
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
      interactions: [],
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
      acceptance: "待制作",
    },
    cooperation: {
      status: "待联系",
      evidenceURL: "",
      terms: "",
      next: "",
      decision: "待决定",
      decisionReason: "",
    },
    content: { draftURL: "", postURL: "", communityURL: "", followup: "" },
    codes: [],
    events: [],
    measurement: "unconnected",
    period: "全部已导入事件",
    improvements: [],
    blocker: "",
    nextDelivery: "",
  };
}
export function seeds() {
  const rows = [
    [
      "84d8d65a-e7ce-5070-9c26-178fb4e75501",
      "小猫巴士",
      "https://xhslink.cn/o/4dBXKHbBpFr",
      "fb16dd5453c1dfc34efed666c0c6585feb393ae90033c99d4dba640a66ff6213",
    ],
    [
      "84d8d65a-e7ce-5070-9c26-178fb4e75502",
      "火象：你想不想去玩。土象：let's no",
      "https://xhslink.cn/o/8T82wWKMKEo",
      "de18a092d9c56aa6dc3cf6bd7064a4688645bfed6eb88199f435c52b4924d40a",
    ],
    [
      "84d8d65a-e7ce-5070-9c26-178fb4e75503",
      "小猫打工日记：为什么我才八块",
      "https://xhslink.cn/o/4EnuOOTQpgj",
      "915f276c60e886988de9ad87eac175ef4d75a1f71e9d3b846918e5731aa2aff2",
    ],
    [
      "84d8d65a-e7ce-5070-9c26-178fb4e75504",
      "我错了，还能做朋友吗？厉娜",
      "https://xhslink.cn/o/oKSDTS9t4s",
      "97ca51d1c4b55a55f2dc3c817b0a137c469ffe411376e494fde5fbdd1532690e",
    ],
    [
      "84d8d65a-e7ce-5070-9c26-178fb4e75505",
      "海底怪谈之惊现大猫咪",
      "https://xhslink.cn/o/4CdVXZHIqfY",
      "97ca51d1c4b55a55f2dc3c817b0a137c469ffe411376e494fde5fbdd1532690e",
    ],
  ];
  return rows.map(([id, title, url, evidence]) =>
    enrichSeed({
      ...newCampaign(id, title),
      sourceURL: url,
      sourceEvidence: `buzz://message?channel=${SOURCE_CHANNEL}&id=${evidence}`,
      observedAt: "2026-11-13T15:52:00+08:00",
      owners: {
        finder: "周洋",
        maker: "",
        bd: "",
        distribution: "",
        analyst: "",
      },
      blocker: "周洋已交原帖；粉丝、互动及用户制作动机待核，不能直接认定通过",
    }),
  );
}
export function evaluateCandidate(c) {
  const issues = [];
  if (c.contentType === "泛娱乐") issues.push("泛娱乐向淘汰");
  if (c.contentType === "待判断") issues.push("先判断内容是否适合复用");
  if (!safeURL(c.sourceURL)) issues.push("补原帖链接");
  if (c.followers === null) issues.push("补粉丝数");
  else if (c.followers >= 2000) issues.push("未满足2000粉丝以下");
  if ((c.likes === null && !text(c.likesDisplay)) || c.comments === null)
    issues.push("补点赞和评论数");
  if (c.engagement !== "较高") issues.push("补高互动判断");
  if (!safeURL(c.sourceEvidence)) issues.push("补筛选证据链接");
  if (!Number.isFinite(Date.parse(c.observedAt))) issues.push("补有效观察时间");
  if (!text(c.motivation) || !text(c.replaceable))
    issues.push("写清用户为什么想做、替换什么");
  return { pass: issues.length === 0, issues };
}
export function gate(c, target) {
  const issues = [];
  const required =
    target === 0
      ? [0]
      : target === 1
        ? [0, 1]
        : target === 2
          ? [0, 2]
          : target === 3
            ? [0, 1, 2, 3]
            : [0, 1, 2, 3, 4];
  for (const i of required)
    if (!text(c.owners[OWNERS[i]])) issues.push(`${STAGES[i]}缺负责人`);
  if (target >= 1) {
    if (c.cooperation.decision === "放弃")
      issues.push("该模板已放弃，需先重新决定");
    if (c.decision !== "通过") issues.push("先完成筛选并标通过");
    issues.push(...evaluateCandidate(c).issues);
  }
  if (target >= 3) {
    if (
      c.template.acceptance !== "平台通过" ||
      !safeURL(c.template.resultURL) ||
      !safeURL(c.template.platformURL)
    )
      issues.push("补平台通过结果、成片和模板入口");
    if (c.cooperation.status === "已达成") {
      if (!safeURL(c.cooperation.evidenceURL)) issues.push("补BD达成记录");
    } else if (
      c.cooperation.status !== "未达成" ||
      c.cooperation.decision !== "继续制作" ||
      !text(c.cooperation.decisionReason)
    )
      issues.push("BD需已达成，或未达成后明确继续制作及理由");
  }
  if (
    target >= 4 &&
    !c.codes.some(
      (x) =>
        x.status === "已开通" &&
        safeURL(x.platformEvidence) &&
        safeURL(x.postURL),
    )
  )
    issues.push("至少有一条已开通口令及实际投放原帖");
  return [...new Set(issues)];
}
export function validateCampaign(c) {
  if (
    !c ||
    c.schema !== 1 ||
    !/^[0-9a-f-]{36}$/.test(c.id) ||
    !text(c.title) ||
    c.title.length > 160
  )
    throw Error("热点编号或标题无效");
  if (!Number.isInteger(c.stage) || c.stage < 0 || c.stage > 4)
    throw Error("工作流步骤无效");
  for (const k of ["followers", "likes", "comments"])
    if (c[k] !== null && (!Number.isSafeInteger(c[k]) || c[k] < 0))
      throw Error("粉丝及互动必须为非负整数，未知留空");
  if (!c.owners || !OWNERS.every((k) => typeof c.owners[k] === "string"))
    throw Error("负责人字段无效");
  if (
    !["待判断", "娱乐", "泛娱乐", "利他教程"].includes(c.contentType) ||
    !["待评估", "通过", "淘汰"].includes(c.decision) ||
    !["unconnected", "partial", "complete"].includes(c.measurement)
  )
    throw Error("状态值无效");
  for (const key of ["template", "cooperation", "content"])
    if (!c[key] || typeof c[key] !== "object") throw Error("工作流记录不完整");
  if (
    !Array.isArray(c.codes) ||
    c.codes.length > 40 ||
    !Array.isArray(c.events) ||
    c.events.length > 1500 ||
    !Array.isArray(c.improvements) ||
    c.improvements.length > 100
  )
    throw Error("记录超过单条容量，请按批次归档");
  const codes = new Set();
  for (const code of c.codes) {
    if (
      !text(code.code) ||
      code.code !== text(code.code) ||
      code.code.length > 80 ||
      codes.has(code.code)
    )
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
      ["referenceURL", "resultURL", "promptURL", "platformURL", "acceptance"],
    ],
    ["cooperation", ["status", "evidenceURL", "terms", "next"]],
    ["content", ["draftURL", "postURL", "communityURL", "followup"]],
  ])
    if (!keys.every((k) => typeof c[group][k] === "string"))
      throw Error("记录字段无效");
  if (
    ["样片通过", "平台通过"].includes(c.template.acceptance) &&
    !safeURL(c.template.resultURL)
  )
    throw Error("模板通过需要可查看的成片链接");
  if (c.template.acceptance === "平台通过" && !safeURL(c.template.platformURL))
    throw Error("平台通过需要实际模板入口");
  if (c.cooperation.status === "已达成" && !safeURL(c.cooperation.evidenceURL))
    throw Error("BD已达成需要合作证据链接");
  if (
    !c.improvements.every(
      (x) =>
        x &&
        [
          "metric",
          "hypothesis",
          "action",
          "owner",
          "reviewAt",
          "before",
          "after",
        ].every((k) => typeof x[k] === "string"),
    )
  )
    throw Error("改善记录字段无效");
  validateDetails(c);
  mergeEvents([], c.events, c.codes);
  if (c.decision === "通过" && !evaluateCandidate(c).pass)
    throw Error(evaluateCandidate(c).issues.join("；"));
  if (
    c.stage > 0 &&
    c.cooperation.decision !== "放弃" &&
    gate(c, c.stage).length
  )
    throw Error(gate(c, c.stage).join("；"));
  if (new TextEncoder().encode(JSON.stringify(c)).length > 180000)
    throw Error("单条热点超过180KB，请按批次归档");
  return c;
}
export function mergeEvents(existing, incoming, codes) {
  if (!Array.isArray(incoming) || incoming.length > 1500)
    throw Error("每批最多1500条事件");
  const allowed = new Set(codes.map((c) => c.code));
  const all = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) {
    if (
      !e ||
      !text(e.id) ||
      !text(e.userKey) ||
      !allowed.has(e.code) ||
      !EVENT_TYPES.includes(e.event) ||
      !Number.isFinite(Date.parse(e.at)) ||
      !text(e.evidence)
    )
      throw Error("事件需含id、已登记code、匿名userKey、event、at和evidence");
    if (e.id.length > 160 || e.userKey.length > 160 || e.evidence.length > 1000)
      throw Error("事件字段过长");
    const normalized = {
      id: e.id,
      code: e.code,
      userKey: e.userKey,
      event: e.event,
      at: e.at,
      evidence: e.evidence,
    };
    const prior = all.get(e.id);
    if (
      prior &&
      ["id", "code", "userKey", "event", "at", "evidence"].some(
        (k) => prior[k] !== normalized[k],
      )
    )
      throw Error(`事件ID冲突：${e.id}`);
    all.set(e.id, normalized);
  }
  if (all.size > 1500) throw Error("单条热点最多1500条事件，请按批次归档");
  return [...all.values()];
}
export function metrics(c, code) {
  const sets = Object.fromEntries(EVENT_TYPES.map((k) => [k, new Set()]));
  for (const e of c.events)
    if (!code || e.code === code) sets[e.event]?.add(e.userKey);
  const count = (k) =>
    c.measurement === "unconnected" && !c.events.length ? null : sets[k].size;
  const used = count("code_used"),
    result = count("result_received"),
    registered = count("registered");
  const intersect = (a, b) => [...a].filter((x) => b.has(x)).length;
  const complete = c.measurement === "complete";
  return {
    used,
    result,
    registered,
    resultRate:
      complete && used > 0
        ? intersect(sets.code_used, sets.result_received) / used
        : null,
    registerRate:
      complete && result > 0
        ? intersect(sets.result_received, sets.registered) / result
        : null,
    orphanResults: [...sets.result_received].filter(
      (x) => !sets.code_used.has(x),
    ).length,
    orphanRegistrations: [...sets.registered].filter(
      (x) => !sets.result_received.has(x),
    ).length,
  };
}
export function decodeEvent(e, channel) {
  if (
    e?.kind !== 45010 ||
    tag(e, "type") !== TYPE ||
    tag(e, "h") !== channel ||
    tag(e, "op") === "delete"
  )
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
export function template(c, channel, expected) {
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
      ...(expected ? [["prev", expected]] : []),
    ],
  };
}
export function readAllowed(connection, channel) {
  if (connection?.status !== "ready" || connection.cached) return false;
  const s = connection.session;
  const c =
    s.channels.get?.(channel) ??
    s.channels.list().channels.find((x) => x.id === channel);
  return (
    !!c &&
    !c.cached &&
    !c.metadataCached &&
    !c.pending &&
    !c.metadataPending &&
    !c.archived &&
    (c.visibility === "public" ||
      c.members?.includes(connection.viewer ?? s.viewer))
  );
}
export function createRepository(relay) {
  const captured = relay.snapshot();
  const session = captured.session,
    scope = captured.scope,
    viewer = captured.viewer;
  let disposed = false;
  const waiters = new Set();
  const active = (channel) =>
    !disposed &&
    relay.snapshot().session === session &&
    relay.snapshot().scope === scope &&
    relay.snapshot().viewer === viewer &&
    readAllowed(relay.snapshot(), channel);
  async function read(channel, id) {
    if (!active(channel)) throw Error("频道不可读或会话已切换");
    const reader = session.readRemote ?? session.read;
    if (!reader) throw Error("当前Buzz缺少共享数据读取能力");
    const all = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const events = await reader.call(session, [
        {
          kinds: [45010],
          "#h": [channel],
          "#type": [TYPE],
          ...(id ? { "#d": [id] } : {}),
          artifact: "current",
          limit: 100,
          offset,
        },
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
    const duplicate = remote
      .map((e) => decodeEvent(e, channel))
      .filter(Boolean)
      .find(
        (other) =>
          other.id !== c.id &&
          other.codes.some((code) =>
            c.codes.some((item) => item.code === code.code),
          ),
      );
    if (duplicate)
      throw Error(`口令已被「${duplicate.title}」使用，请分配独立口令`);
    const heads = remote.filter((e) => tag(e, "d") === c.id);
    if (heads.length > 1 || (heads[0]?.id ?? null) !== (c._revision ?? null))
      throw Error("此热点已被他人修改，请刷新后合并；当前编辑仍保留");
    if (!active(channel)) throw Error("会话已切换");
    if (session.mobile) {
      const key = `opcb.hot-workflow:${channel}:${c.id}`;
      const pending = (await session.mobile.pending()).find(p => p.key === key);
      if (pending) {
        if (heads[0]?.id === pending.event.id) {
          await session.mobile.acknowledge(key);
          return decodeEvent(heads[0], channel);
        }
        throw Error("存在未确认保存，请在页面顶部核对或重试原操作；当前编辑保留");
      }
      const receipt = await session.mobile.publish(template(c, channel, c._revision), key);
      if (!active(channel)) throw Error("会话已切换，请回原账号核对保存");
      const verified = (await read(channel, c.id)).find(e => e.id === receipt.event.id);
      const result = verified && decodeEvent(verified, channel);
      if (!result) throw Error("已提交但未读回同一版本，请先核对原保存");
      await session.mobile.acknowledge(key);
      return result;
    }
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
          "此热点有未确认的保存，请先刷新核对或在Buzz待发送中处理原操作，勿重复提交",
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
          expected: c._revision || null,
        }),
      },
      () => active(channel),
    );
    await new Promise((resolve, reject) => {
      let off = () => {},
        settled = false;
      const timer = setTimeout(
        () =>
          done(
            Error(
              `保存回执未确定，请先刷新核对，勿重复提交（${operation.slice(0, 8)}）`,
            ),
          ),
        18000,
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
      (e) => e.id === operation,
    );
    const result = verified && decodeEvent(verified, channel);
    if (!result)
      throw Error("已提交，但尚未读到同一版本；请刷新核对，勿重复提交");
    await outbox
      .acknowledge?.(operation, async () => "recorded")
      .catch(() => {});
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
    },
  };
}

export function normalizeCampaign(c) {
  const d = newCampaign(c.id, c.title);
  return {
    ...d,
    ...c,
    cooperation: { ...d.cooperation, ...c.cooperation },
    monitoring: { ...d.monitoring, ...c.monitoring },
    sourceComments: c.sourceComments || [],
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
          text: "大家千万不要被视频骗了，这是假的，现实中根本没有这么大的猫",
        },
        { author: "壶中仙", text: "要是这比例，吃人没商量" },
        {
          author: "茶茶（酷盖版）",
          text: "我这个点下班怎么没有猫猫巴士来接我！！！（震怒）",
        },
      ],
    });
  return c;
}
export function mergeInteractions(existing, incoming) {
  if (!Array.isArray(incoming) || incoming.length > 1000)
    throw Error("每批最多1000条评论或提及");
  const all = new Map(existing.map((x) => [x.id, x]));
  for (const x of incoming) {
    if (
      !x ||
      !text(x.id) ||
      x.id.length > 160 ||
      !text(x.userKey) ||
      x.userKey.length > 160 ||
      !["mention", "comment"].includes(x.type) ||
      typeof x.text !== "string" ||
      x.text.length > 3000 ||
      !Number.isFinite(Date.parse(x.at)) ||
      !safeURL(x.evidenceURL) ||
      typeof x.handled !== "boolean"
    )
      throw Error(
        "互动需含id、匿名userKey、type(mention/comment)、text、at、evidenceURL和handled",
      );
    const row = {
      id: x.id,
      userKey: x.userKey,
      type: x.type,
      text: x.text,
      at: x.at,
      evidenceURL: x.evidenceURL,
      handled: x.handled,
    };
    const old = all.get(x.id);
    if (
      old &&
      ["id", "userKey", "type", "text", "at", "evidenceURL"].some(
        (k) => old[k] !== row[k],
      )
    )
      throw Error("互动ID冲突：" + x.id);
    all.set(x.id, { ...row, handled: old?.handled ?? row.handled });
  }
  if (all.size > 1000) throw Error("单条热点最多1000条互动，请按批次归档");
  return [...all.values()];
}
export function interactionMetrics(c) {
  const rows = c.monitoring?.interactions || [];
  return {
    mentions: rows.length
      ? new Set(rows.filter((x) => x.type === "mention").map((x) => x.userKey))
          .size
      : null,
    commenters: rows.length
      ? new Set(rows.filter((x) => x.type === "comment").map((x) => x.userKey))
          .size
      : null,
    comments: rows.length
      ? rows.filter((x) => x.type === "comment").length
      : null,
  };
}
function validateDetails(c) {
  if (
    text(c.likesDisplay) &&
    !/^\d+(?:[.,]\d+)*(?:万|亿|[wWkK])?\+?$/.test(c.likesDisplay)
  )
    throw Error("点赞显示值应为数字或平台显示约数，如1.9万");
  if (!["待联系", "联系中", "已达成", "未达成"].includes(c.cooperation.status))
    throw Error("BD状态无效");

  for (const k of [
    "author",
    "likesDisplay",
    "sourceMediaURL",
    "sourceMediaKind",
  ])
    if (c[k] !== undefined && (typeof c[k] !== "string" || c[k].length > 3000))
      throw Error("笔记字段无效");
  if (
    c.saves !== undefined &&
    c.saves !== null &&
    (!Number.isSafeInteger(c.saves) || c.saves < 0)
  )
    throw Error("收藏数无效");
  if (c.sourceMediaURL && !/^https?:/.test(safeURL(c.sourceMediaURL) || ""))
    throw Error("媒体地址需为HTTP(S)链接");
  if (
    c.sourceMediaKind !== undefined &&
    !["待采集", "图片", "视频"].includes(c.sourceMediaKind)
  )
    throw Error("媒体类型无效");
  if (
    c.sourceComments !== undefined &&
    (!Array.isArray(c.sourceComments) ||
      c.sourceComments.length > 100 ||
      !c.sourceComments.every(
        (x) =>
          x &&
          typeof x.author === "string" &&
          typeof x.text === "string" &&
          x.author.length <= 160 &&
          x.text.length <= 3000,
      ))
  )
    throw Error("原帖评论字段无效");
  if (
    c.cooperation.decision !== undefined &&
    !["待决定", "继续制作", "放弃"].includes(c.cooperation.decision)
  )
    throw Error("BD失败决策无效");
  if (
    c.cooperation.decisionReason !== undefined &&
    typeof c.cooperation.decisionReason !== "string"
  )
    throw Error("BD决策理由无效");
  if (
    c.cooperation.decision === "继续制作" &&
    c.cooperation.status === "未达成" &&
    !text(c.cooperation.decisionReason)
  )
    throw Error("继续制作需要记录理由");
  if (c.cooperation.decision === "放弃" && !text(c.cooperation.decisionReason))
    throw Error("放弃模板需要记录理由");
  if (c.monitoring !== undefined) {
    const m = c.monitoring;
    if (!m || typeof m !== "object") throw Error("监控记录无效");
    for (const k of ["views", "likes", "saves", "comments"])
      if (m[k] !== null && (!Number.isSafeInteger(m[k]) || m[k] < 0))
        throw Error("帖子数据需非负整数，未知留空");
    if (typeof m.observedAt !== "string" || typeof m.evidenceURL !== "string")
      throw Error("监控来源无效");
    if (
      ["views", "likes", "saves", "comments"].some((k) => m[k] !== null) &&
      (!Number.isFinite(Date.parse(m.observedAt)) || !safeURL(m.evidenceURL))
    )
      throw Error("帖子数据需要采集时间及证据链接");
    mergeInteractions([], m.interactions);
  }
}

const FACTORY_CSS =
  '.hf{color-scheme:light dark;--bg:#f6f7f9;--surface:#fff;--surface2:#f0f2f5;--text:#17191e;--muted:#90959f;--line:#e9ebef;--accent:#007aff;--tint:#eaf3ff;--red:#e65561;--shadow:0 12px 36px #1820380b;--nav:#f6f7f9e8;--radius:24px}.hf *{box-sizing:border-box}.hf{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Display","PingFang SC",sans-serif;-webkit-font-smoothing:antialiased}.hf button,.hf input,.hf textarea{font:inherit}.hf button,.hf a,.hf input,.hf textarea{-webkit-tap-highlight-color:transparent}.hf button{cursor:pointer;color:inherit;border:0;background:none}.hf a{color:inherit;text-decoration:none}.hf button:disabled{opacity:.4;cursor:default}.hf button:not(:disabled):active{transform:scale(.96)}.hf button:focus-visible,.hf a:focus-visible,.hf input:focus-visible,.hf textarea:focus-visible{outline:3px solid #007aff55;outline-offset:4px}.hf button{transition:background .15s,transform .12s,color .15s}.hf svg.icon{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}.hf [hidden]{display:none!important}.hf h1,.hf h2,.hf h3,.hf p{margin:0}.hf .icon-button{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:50%}.hf .icon-button:hover{background:var(--surface2)}.hf .primary,.hf .secondary{min-height:44px;padding:0 20px;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:600}.hf .primary{background:var(--text);color:var(--surface)}.hf .primary:hover{opacity:.88}.hf .secondary{background:var(--surface2);color:var(--text)}.hf .accent{background:var(--accent);color:#fff}.hf .wordmark{display:flex;align-items:center;gap:10px;font-size:26px;font-weight:750;letter-spacing:-1.1px;flex-shrink:0}.hf .brand-icon{height:28px;width:27px;position:relative;display:block}.hf .brand-icon i{position:absolute;width:16px;height:23px;border:2.5px solid currentColor;border-radius:5px;left:2px;top:3px;transform:rotate(-12deg)}.hf .brand-icon i:last-child{background:var(--bg);left:9px;top:0;transform:rotate(12deg)}.hf .brand-dot{width:5px;height:5px;border-radius:50%;background:var(--accent);align-self:flex-end;margin:0 0 10px -6px}.hf .topbar{height:92px;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:0 44px;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20;background:var(--nav);backdrop-filter:blur(22px)}.hf .step-nav{display:flex;gap:5px;align-items:center;background:var(--surface2);padding:5px;border-radius:18px}.hf .nav-item{display:flex;align-items:center;gap:7px;padding:10px 13px;border-radius:13px;min-height:44px;font-size:13px;color:#777d88;white-space:nowrap}.hf .nav-item .icon{width:18px;height:18px}.hf .nav-item.active{color:var(--text);background:var(--surface);box-shadow:0 2px 6px #00000008;font-weight:650}.hf .nav-count{font:11px/1.4 -apple-system,sans-serif;font-variant-numeric:tabular-nums;min-width:17px;text-align:center;opacity:.55}.hf .nav-item.active .nav-count{color:var(--accent);opacity:1}.hf .top-actions{display:flex;align-items:center;gap:8px}.hf .profile-trigger{display:inline-flex;align-items:center;gap:7px;padding:4px;border-radius:50%}.hf .avatar{--avatar-bg:#edf0f5;--avatar-fg:#66758d;display:inline-grid;place-items:center;flex-shrink:0;width:36px;height:36px;background:var(--avatar-bg);color:var(--avatar-fg);border-radius:50%;font-size:15px;font-weight:650;letter-spacing:-.5px;border:2px solid var(--surface);overflow:hidden}.hf .avatar-sm{width:26px;height:26px;font-size:11px}.hf .avatar-lg{width:48px;height:48px;font-size:20px}.hf .avatar-xl{width:84px;height:84px;font-size:32px;border:5px solid var(--surface);box-shadow:0 0 0 1px var(--line)}.hf .avatar-stack{display:inline-flex;align-items:center;padding-left:0}.hf .avatar-stack .avatar:not(:first-child){margin-left:-7px}.hf .workspace{max-width:1320px;margin:0 auto;padding:40px 44px 80px;display:flex;align-items:flex-start;gap:48px}.hf .main{min-width:0;flex:1}.hf .page-header{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:24px}.hf .eyebrow{font-size:10px;font-weight:650;letter-spacing:2px;color:var(--muted);margin-bottom:6px}.hf h1{font-size:30px;font-weight:650;letter-spacing:-1px;display:flex;align-items:center;gap:12px}.hf .title-count{font-size:13px;letter-spacing:0;background:var(--surface2);color:var(--muted);padding:2px 10px;border-radius:8px;font-weight:500}.hf .search{height:42px;width:210px;display:flex;align-items:center;gap:8px;padding:0 14px;border-radius:14px;background:var(--surface)}.hf .search .icon{width:17px;color:var(--muted)}.hf .search input{width:100%;background:none;border:0;outline:0;color:var(--text);font-size:13px}.hf .search input::placeholder{color:var(--muted)}.hf .feed-toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px;min-height:40px}.hf .segment{display:flex;gap:4px}.hf .segment button{border-radius:11px;padding:8px 14px;color:var(--muted);font-size:13px;min-height:40px}.hf .segment button.active{background:var(--surface);color:var(--text);font-weight:600}.hf .display-modes{display:flex;gap:3px;color:var(--muted)}.hf .display-modes .active{background:var(--surface);color:var(--text)}.hf .display-modes .icon{width:19px}.hf .feed{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;align-items:start}.hf .post{background:var(--surface);border-radius:var(--radius);overflow:hidden;border:1px solid var(--line);position:relative;box-shadow:0 2px 8px #12162203;min-width:0}.hf .post-top{display:flex;align-items:center;gap:9px;padding:14px 14px 12px;height:65px}.hf .post-person{min-width:0;flex:1}.hf .person-name{display:block;font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hf .person-meta{display:block;font-size:10px;color:var(--muted);margin-top:2px}.hf .post-top .icon-button{width:32px;height:36px}.hf .post-top .icon{width:19px}.hf .rank-badge{font-size:16px;font-variant-numeric:tabular-nums;font-weight:650;color:var(--muted);padding-right:4px}.hf .visual{position:relative;aspect-ratio:3/4;background:#111317;overflow:hidden;touch-action:pan-y;margin:0 10px;border-radius:17px}.hf .visual video,.hf .visual iframe{display:block;width:100%;height:100%;object-fit:cover;border:0}.hf .visual video.playing{object-fit:contain}.hf .play-overlay{position:absolute;inset:0;display:grid;place-items:center;width:100%;height:100%;background:linear-gradient(0deg,#0003,transparent 25%);color:#fff;border-radius:0!important}.hf .play-overlay span{display:grid;place-items:center;width:50px;height:50px;border-radius:50%;background:#ffffff28;backdrop-filter:blur(12px);border:1px solid #ffffff50}.hf .play-overlay .icon{width:22px;margin-left:3px;fill:#fff;stroke-width:1}.hf .media-placeholder{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#c5c9d1;padding:28px;text-align:center;font-size:13px}.hf .media-placeholder .icon{width:32px;height:32px}.hf .media-placeholder .secondary{background:#ffffff15;color:#fff;font-size:12px}.hf .media-choice{position:absolute;left:12px;top:12px;display:flex;padding:3px;border-radius:11px;background:#111a;backdrop-filter:blur(15px);z-index:4;color:#fff}.hf .media-choice button{font-size:11px;padding:5px 9px;border-radius:8px;color:#ffffffa0}.hf .media-choice button.active{background:#ffffff28;color:#fff}.hf .revision-chip,.hf .high-chip{display:inline-flex;align-items:center;font-size:10px;line-height:1;padding:6px 8px;border-radius:7px;background:var(--surface2);color:var(--muted);font-weight:600}.hf .high-chip{background:var(--tint);color:var(--accent)}.hf .revision-overlay{position:absolute;right:12px;bottom:13px;color:#fff;background:#0006;backdrop-filter:blur(12px);z-index:3;font-size:11px;padding:5px 8px;border-radius:8px}.hf .post-detail{padding:14px 16px 16px}.hf .post-title{font-size:14px;font-weight:600;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.25px;margin-bottom:10px}.hf .social-line{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.hf .likes-summary{display:flex;align-items:center;gap:6px;min-width:0;font-size:11px;color:var(--muted)}.hf .likes-summary strong{font-size:12px;color:var(--text);font-weight:650}.hf .post-action-icons{display:flex;gap:3px}.hf .vote-button{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;border:1px solid var(--line)}.hf .vote-button .icon{width:19px}.hf .vote-button.yes.chosen{color:var(--accent);background:var(--tint);border-color:transparent}.hf .vote-button.no.chosen{color:var(--red);background:#e6556110;border-color:transparent}.hf .comment-snippets{font-size:11px;line-height:1.7;margin:4px 0 9px;color:var(--muted)}.hf .comment-snippets p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.hf .comment-snippets b{color:var(--text);font-weight:600;margin-right:6px}.hf .all-comments{font-size:11px;color:var(--muted);padding:3px 0;text-align:left}.hf .comment-mini{display:flex;align-items:center;gap:6px;border-top:1px solid var(--line);padding-top:10px;margin-top:10px}.hf .comment-mini input{min-width:0;flex:1;border:0;background:none;outline:0;color:var(--text);font-size:11px;padding:6px 0}.hf .comment-mini input::placeholder{color:var(--muted)}.hf .comment-mini button{width:30px;height:30px;border-radius:50%;color:var(--accent);display:grid;place-items:center}.hf .comment-mini .icon{width:16px}.hf .post-cta{margin-top:12px;display:flex;gap:8px;align-items:center}.hf .post-cta .primary,.hf .post-cta .secondary{min-height:40px;border-radius:12px;font-size:12px;padding:0 12px;flex:1}.hf .post-cta .icon{width:17px}.hf .owner-line{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);margin-bottom:10px}.hf .owner-line .avatar{width:23px;height:23px;font-size:10px}.hf .feedback-line{font-size:11px;padding:10px 12px;background:var(--surface2);border-radius:12px;margin-bottom:12px;line-height:1.7}.hf .feedback-line b{display:block;margin-bottom:2px;font-weight:600}.hf .connection-chip{font-size:10px;color:var(--muted);white-space:nowrap}.hf .empty{grid-column:1/-1;padding:80px 24px 100px;display:flex;flex-direction:column;align-items:center;gap:18px;color:var(--muted);text-align:center}.hf .empty>.icon{width:48px;height:48px;stroke-width:1.25;color:#c6cbd3}.hf .empty h2{font-size:18px;color:var(--text);font-weight:550}.hf .empty p{font-size:13px}.hf .empty button{margin-top:4px;font-size:13px}.hf .page-footer{display:flex;justify-content:space-between;gap:16px;font-size:10px;color:var(--muted);margin-top:28px}.hf .inline-error{padding:12px 16px;border-radius:12px;background:#e6556112;color:var(--red);margin-bottom:20px;font-size:13px}.hf .workspace.deck-workspace{max-width:1080px;gap:56px}.hf .deck-workspace .main{max-width:580px}.hf .deck-workspace .feed-toolbar{margin-bottom:20px}.hf .feed.deck{display:block;position:relative;max-width:370px;margin:0 auto;padding-bottom:6px}.hf .deck.has-next:before,.hf .deck.has-next:after{content:"";position:absolute;inset:4px 0 6px;border-radius:24px;background:var(--surface2);border:1px solid var(--line);transform:rotate(5deg) translate(6px,1px);z-index:0}.hf .deck.has-next:after{transform:rotate(-3deg) translate(-4px,0);background:var(--surface)}.hf .deck .post{z-index:2;box-shadow:0 15px 45px #00000010;touch-action:pan-y;user-select:none}.hf .deck .post-top{height:58px;padding:10px 15px}.hf .deck .visual{aspect-ratio:9/16;max-height:calc(100% - 338px);min-height:290px;margin:0;border-radius:0}.hf .deck .post-detail{padding:12px 16px}.hf .deck .post-title{font-size:13px;margin:0}.hf .deck .social-line{margin:8px 0 0}.hf .deck .comment-snippets,.hf .deck .comment-mini,.hf .deck .post-cta{display:none}.hf .deck .owner-line{margin-bottom:7px}.hf .swipe-stamp{position:absolute;z-index:8;top:82px;width:76px;height:76px;border:3px solid currentColor;border-radius:18px;color:var(--accent);background:#ffffffc0;display:grid;place-items:center;opacity:0;pointer-events:none;transform:rotate(-15deg)}.hf .swipe-stamp .icon{width:50px;height:50px;stroke-width:3}.hf .swipe-stamp.yes{left:24px}.hf .swipe-stamp.no{right:24px;color:var(--red);transform:rotate(15deg)}.hf .deck-actions{display:flex;align-items:center;justify-content:center;gap:26px;margin-top:20px}.hf .deck-action{display:flex;flex-direction:column;align-items:center;gap:7px;font-size:10px;color:var(--muted);padding:0}.hf .deck-action span{width:60px;height:60px;border-radius:50%;display:grid;place-items:center;background:var(--surface);border:1px solid var(--line);box-shadow:0 4px 12px #12162205}.hf .deck-action .icon{width:27px;height:27px}.hf .deck-action.no span{color:var(--red)}.hf .deck-action.yes span{background:var(--accent);border-color:var(--accent);color:#fff}.hf .deck-action.next span,.hf .deck-action.undo span{width:44px;height:44px}.hf .deck-action.next .icon,.hf .deck-action.undo .icon{width:21px;height:21px}.hf .discussion-panel{width:300px;flex-shrink:0;position:sticky;top:140px;padding-top:68px}.hf .discussion-panel h2{font-size:16px;font-weight:600;margin-bottom:22px}.hf .discussion-list{display:flex;flex-direction:column;gap:20px;max-height:48vh;overflow:auto;padding-right:5px}.hf .comment{display:flex;gap:10px;font-size:12px}.hf .comment>div{flex:1;min-width:0}.hf .comment-header{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:5px}.hf .comment-header strong{font-size:11px;font-weight:600}.hf .comment-header time{font-size:9px;color:var(--muted);white-space:nowrap}.hf .comment p{line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}.hf .empty-discussion{color:var(--muted);font-size:12px;padding:0 0 26px}.hf .quick-replies{display:flex;flex-wrap:wrap;gap:6px;margin-top:22px}.hf .quick-replies button,.hf .feedback-options button{min-height:36px;font-size:11px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:6px 10px}.hf .discussion-compose{display:flex;align-items:center;gap:8px;background:var(--surface);padding:8px 10px;border:1px solid var(--line);border-radius:14px;margin-top:14px}.hf .discussion-compose input{width:100%;min-width:0;background:none;border:0;outline:0;color:var(--text);font-size:12px}.hf .discussion-compose button{height:36px;width:36px;display:grid;place-items:center;color:var(--accent)}.hf .discussion-compose .icon{width:18px}.hf .bottom-nav,.hf .floating-add{display:none}.hf .sheet-overlay{position:absolute;inset:0;background:#10141d4d;backdrop-filter:blur(6px);z-index:100;display:flex;align-items:center;justify-content:center;padding:24px;animation:hf-fade-in .15s ease-out}.hf .sheet{width:100%;max-width:460px;background:var(--surface);border-radius:28px;padding:24px;max-height:85dvh;overflow:auto;box-shadow:0 24px 70px #0002;animation:hf-sheet-in .22s cubic-bezier(.23,1,.32,1)}.hf .sheet-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}.hf .sheet h2{font-size:19px;font-weight:650;letter-spacing:-.5px}.hf .sheet-head .icon-button{width:32px;height:32px;background:var(--surface2)}.hf .sheet-head .icon{width:18px}.hf .sheet textarea,.hf .hf-sheet-input{width:100%;background:var(--surface2);border:0;border-radius:14px;padding:14px;resize:vertical;color:var(--text);outline:0;font-size:13px}.hf .sheet textarea{min-height:95px}.hf .sheet-actions{display:flex;gap:10px;margin-top:20px}.hf .sheet-actions button{flex:1}.hf .sheet-note{font-size:11px;color:var(--muted);margin-top:12px}.hf .member-options{display:flex;flex-wrap:wrap;justify-content:center;gap:18px;margin:14px 0}.hf .member-option{display:flex;flex-direction:column;align-items:center;gap:8px;font-size:11px;min-width:54px}.hf .member-option.selected .avatar{box-shadow:0 0 0 3px var(--accent)}.hf .sheet-row{display:flex;align-items:center;gap:12px;width:100%;padding:12px 3px;text-align:left;font-size:13px;border-bottom:1px solid var(--line);min-height:48px}.hf .sheet-row:last-child{border-bottom:0}.hf .sheet-row .icon{width:19px;color:var(--muted)}.hf .sheet-row .arrow-label{margin-left:auto;font-size:11px;color:var(--muted)}.hf .feedback-options{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}.hf .feedback-options button{font-size:12px;min-height:40px;background:var(--surface2)}.hf .feedback-options button.active{color:var(--accent);border-color:var(--accent);background:var(--tint)}.hf .form-error{color:var(--red);font-size:12px;margin-top:12px;min-height:0}.hf .sheet form>label{display:block;font-size:12px;color:var(--muted);margin:12px 0 7px}.hf .toast{position:absolute;z-index:200;left:50%;bottom:30px;transform:translateX(-50%);background:#25272fed;color:#fff;backdrop-filter:blur(16px);border-radius:14px;padding:13px 20px;font-size:12px;box-shadow:0 8px 30px #0002;max-width:calc(100vw - 40px);display:flex;gap:18px;align-items:center;white-space:nowrap}.hf .toast button{color:#8abaff;font-size:12px;font-weight:600}.hf .drop-overlay{position:absolute;inset:16px;z-index:150;border:2px dashed var(--accent);border-radius:28px;background:var(--nav);backdrop-filter:blur(20px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:var(--accent)}.hf .drop-overlay .icon{width:44px;height:44px}.hf .pending{opacity:.65;pointer-events:none}.hf .loading{background:linear-gradient(90deg,var(--surface2),var(--surface),var(--surface2));background-size:200% 100%;animation:hf-shimmer 1.5s infinite}.hf .login-.hf{min-height:100%;display:grid;place-items:center;padding:32px}.hf .login-panel{width:100%;max-width:800px;text-align:center}.hf .login-panel>.wordmark{justify-content:center;font-size:30px}.hf .login-heading{margin-top:74px}.hf .login-heading .eyebrow{margin-bottom:15px}.hf .login-heading h1{display:block;font-size:36px;font-weight:600;letter-spacing:-1.5px}.hf .login-heading p{font-size:14px;color:var(--muted);margin-top:12px}.hf .login-people{display:flex;flex-wrap:wrap;justify-content:center;gap:32px;margin:48px 0 18px}.hf .login-people button{display:flex;flex-direction:column;align-items:center;gap:16px;padding:6px;min-width:98px}.hf .login-people strong{font-size:13px;font-weight:550}.hf .login-people button:hover .avatar,.hf .login-people .chosen .avatar{box-shadow:0 0 0 3px var(--accent)}.hf .login-error{color:var(--red);font-size:12px;min-height:26px}.hf .login-footer{display:block;font-size:11px;color:var(--muted);margin-top:40px}@keyframes hf-fade-in{from{opacity:0}to{opacity:1}}@keyframes hf-sheet-in{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}@keyframes hf-shimmer{to{background-position:-200% 0}}@container hot-factory(min-width:1650px){.hf .workspace{max-width:1440px}.hf .feed{grid-template-columns:repeat(4,minmax(0,1fr))}.hf .deck-workspace .feed{display:block}.hf .workspace.deck-workspace{max-width:1080px}}@container hot-factory(max-width:1100px){.hf .topbar{padding:0 26px;gap:16px}.hf .step-nav{gap:0}.hf .nav-item{padding:10px}.hf .nav-item>.icon{display:none}.hf .top-actions>#archive-nav{display:none}.hf .workspace{padding:32px 28px 80px;gap:32px}.hf .feed{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.hf .discussion-panel{width:260px}.hf .workspace.deck-workspace{gap:32px}.hf .top-actions .primary{padding:0 13px}}@container hot-factory(max-width:820px){.hf .topbar{height:76px;padding:0 22px}.hf .step-nav{display:none}.hf .workspace{padding:28px 22px 110px}.hf .feed{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.hf .bottom-nav{display:flex;position:absolute;bottom:0;left:0;right:0;z-index:30;padding:8px 10px calc(8px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--nav);backdrop-filter:blur(24px);justify-content:space-around}.hf .bottom-nav .nav-item{display:flex;flex-direction:column;justify-content:center;gap:3px;border-radius:12px;min-width:60px;font-size:9px;padding:6px 8px;position:relative;background:none;box-shadow:none}.hf .bottom-nav .nav-item>.icon{display:block;width:22px;height:22px}.hf .bottom-nav .nav-item.active{color:var(--accent)}.hf .bottom-nav .nav-count{position:absolute;top:0;right:8px;background:var(--surface2);border-radius:5px;font-size:8px;padding:1px 3px;min-width:13px}.hf .workspace.deck-workspace{display:block;max-width:580px}.hf .deck-workspace .main{max-width:none}.hf .discussion-panel{display:none}.hf .toast{bottom:100px}.hf .page-header{margin-bottom:20px}.hf .deck-workspace .page-footer{margin-top:20px}.hf .deck .visual{max-height:calc(100% - 360px);min-height:260px}.hf .sheet-overlay{align-items:flex-end;padding:0}.hf .sheet{max-width:600px;border-radius:28px 28px 0 0;padding:22px 22px calc(24px + env(safe-area-inset-bottom));max-height:88dvh;animation:hf-sheet-in .25s ease-out}.hf .login-people{gap:22px}.hf .login-panel>.wordmark{font-size:27px}}@container hot-factory(max-width:520px){.hf .topbar{height:66px;padding:0 18px;gap:12px}.hf .wordmark{font-size:23px;gap:8px}.hf .brand-icon{transform:scale(.85);transform-origin:left center;width:24px}.hf .brand-dot{margin-bottom:8px}.hf .top-actions{gap:6px}.hf .top-actions .primary{padding:0;width:40px;min-height:40px;border-radius:50%;color:var(--text);background:var(--surface)}.hf .top-actions .primary>span{display:none}.hf .top-actions .profile-trigger .avatar{width:33px;height:33px;font-size:14px}.hf .workspace{padding:24px 16px 104px}.hf .page-header{gap:12px;align-items:flex-end}.hf h1{font-size:25px;gap:9px}.hf .eyebrow{font-size:9px;letter-spacing:1.7px}.hf .title-count{font-size:11px;padding:2px 7px}.hf .search{width:40px;background:none;position:relative;padding:0;display:grid;place-items:center}.hf .search input{position:absolute;inset:0;opacity:0;cursor:pointer}.hf .search:focus-within{position:absolute;right:16px;left:16px;width:auto;background:var(--surface);z-index:10;padding:0 14px;display:flex;box-shadow:0 5px 20px #0001}.hf .search:focus-within input{position:static;opacity:1;cursor:text}.hf .feed-toolbar{margin-bottom:18px;gap:8px}.hf .segment button{padding:8px 11px;font-size:11px;min-height:36px}.hf .display-modes .icon-button{width:36px;height:36px}.hf .display-modes .icon{width:17px}.hf .feed{gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}.hf .post{border-radius:19px}.hf .post-top{gap:6px;padding:9px 9px 8px;height:51px}.hf .post-top .avatar{width:26px;height:26px;font-size:11px}.hf .person-name{font-size:10px}.hf .person-meta{font-size:8px}.hf .post-top .icon-button{width:24px;height:28px}.hf .post-top .icon{width:16px}.hf .visual{margin:0 6px;border-radius:12px;aspect-ratio:9/13}.hf .play-overlay span{width:35px;height:35px}.hf .play-overlay .icon{width:17px}.hf .post-detail{padding:10px}.hf .post-title{font-size:11px;line-height:1.5;margin-bottom:8px}.hf .social-line{gap:4px;align-items:center;margin-bottom:7px}.hf .likes-summary{gap:4px;font-size:9px}.hf .likes-summary .avatar{width:21px;height:21px;font-size:8px}.hf .likes-summary strong{font-size:10px}.hf .vote-button{width:28px;height:28px}.hf .vote-button .icon{width:15px}.hf .post-action-icons{gap:4px}.hf .comment-snippets{font-size:9px;margin-bottom:4px}.hf .all-comments{font-size:9px}.hf .comment-mini{padding-top:7px;margin-top:7px;gap:5px}.hf .comment-mini>.avatar{display:none}.hf .comment-mini input{font-size:10px;width:30px}.hf .comment-mini button{width:24px;height:24px}.hf .post-cta{margin-top:9px;gap:5px}.hf .post-cta .primary,.hf .post-cta .secondary{min-height:34px;font-size:10px;padding:0 7px;border-radius:9px}.hf .post-cta .icon{width:13px}.hf .owner-line{font-size:9px;gap:4px;margin-bottom:7px}.hf .high-chip,.hf .revision-chip{font-size:8px;padding:5px 6px}.hf .feedback-line{font-size:9px;padding:8px;margin-bottom:8px}.hf .connection-chip{font-size:8px}.hf .media-choice{left:8px;top:8px;padding:2px;border-radius:9px}.hf .media-choice button{font-size:9px;padding:4px 6px}.hf .media-placeholder{padding:12px;font-size:10px;gap:10px}.hf .media-placeholder>.icon{width:25px}.hf .media-placeholder .secondary{padding:0 9px;font-size:10px;min-height:34px}.hf .rank-badge{font-size:12px}.hf .feed.deck{max-width:330px;padding-bottom:5px}.hf .deck .post{border-radius:24px}.hf .deck .post-top{height:52px;padding:9px 13px}.hf .deck .post-top .avatar{width:29px;height:29px;font-size:12px}.hf .deck .person-name{font-size:11px}.hf .deck .person-meta{font-size:9px}.hf .deck .visual{margin:0;border-radius:0;max-height:calc(100% - 350px);min-height:240px;aspect-ratio:9/16}.hf .deck .post-detail{padding:10px 14px}.hf .deck .post-title{font-size:12px}.hf .deck .likes-summary{font-size:10px}.hf .deck .vote-button{width:30px;height:30px}.hf .deck-actions{margin-top:16px;gap:24px}.hf .deck-action span{height:55px;width:55px}.hf .deck-workspace .feed-toolbar{margin-bottom:16px}.hf .deck-workspace .page-header{margin-bottom:16px}.hf .deck-workspace .page-footer{font-size:9px;margin-top:15px}.hf .deck-workspace .eyebrow{display:none}.hf .deck-workspace h1{font-size:22px}.hf .empty{padding:65px 16px 80px}.hf .empty h2{font-size:16px}.hf .login-.hf{padding:24px}.hf .login-heading{margin-top:62px}.hf .login-heading h1{font-size:29px}.hf .login-people{gap:20px 13px;margin-top:35px}.hf .login-people button{min-width:calc((100% - 26px)/3);gap:12px}.hf .avatar-xl{height:72px;width:72px;font-size:27px}.hf .login-footer{font-size:10px;margin-top:25px}}@media(prefers-reduced-motion:reduce){.hf *,.hf *:before,.hf *:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}.hf .topbar-main{display:flex;align-items:center;justify-content:space-between;gap:24px;width:100%;min-width:0}.hf .compact-toolbar:empty{display:none}.hf .visual video,.hf .visual iframe{position:absolute;inset:0;width:100%;height:100%;max-width:none;max-height:none}.hf .media-placeholder{position:absolute;inset:0}.hf .visual{isolation:isolate}.hf.deck-active{height:100%;overflow:hidden;overscroll-behavior:none}.hf.deck-active .workspace{position:absolute;top:var(--chrome-top,92px);left:0;right:0;height:var(--workspace-height,calc(100% - 92px));padding-top:16px;padding-bottom:12px;overflow:hidden;align-items:stretch}.hf.deck-active .main{display:flex;flex-direction:column;height:100%;min-height:0}.hf.deck-active .page-header{margin-bottom:10px}.hf.deck-active .eyebrow{display:none}.hf.deck-active h1{font-size:22px}.hf.deck-active .feed-toolbar{margin-bottom:10px;flex-shrink:0}.hf.deck-active .page-footer{display:none}.hf .feed.deck{flex:1;min-height:0;width:min(100%,370px);max-width:370px;margin:0 auto;padding:0;display:flex;flex-direction:column;align-items:stretch;isolation:isolate;overflow:hidden}.hf .deck.has-next:before,.hf .deck.has-next:after{display:none}.hf .deck .post{height:100%;flex:1;min-height:0;max-width:100%;background:#111317;border:0;border-radius:24px;box-shadow:none!important;will-change:transform}.hf .deck .visual{position:absolute;inset:0;width:100%;height:100%;min-height:0;max-height:none;aspect-ratio:auto;margin:0;border-radius:inherit;background:#111317}.hf .deck .visual video{object-fit:contain}.hf .deck .post-top{position:absolute;left:0;right:0;top:0;height:54px;padding:8px 13px;z-index:7;color:#fff;background:linear-gradient(#0009,transparent)}.hf .deck .person-meta{display:none}.hf .deck .person-name{font-size:11px}.hf .deck .post-top .avatar{width:28px;height:28px;font-size:12px;border-color:#ffffff40}.hf .deck .post-top .icon-button{width:40px;height:40px}.hf .deck .post-top .icon-button:hover{background:#ffffff20}.hf .deck .post-detail{position:absolute;left:0;right:0;bottom:44px;z-index:6;padding:22px 14px 8px;color:#fff;background:linear-gradient(transparent,#0008);pointer-events:none}.hf .deck .post-title{font-size:12px;line-height:1.4;margin:0;white-space:nowrap}.hf .deck .social-line{display:flex;margin:5px 0 0}.hf .deck .likes-summary{font-size:10px;color:#ffffffc4;pointer-events:auto;padding:0}.hf .deck .likes-summary strong{color:#fff}.hf .deck .likes-summary .avatar{width:21px;height:21px;font-size:9px;border-color:#ffffff40}.hf .deck .post-action-icons,.hf .deck .social-line>.icon-button,.hf .deck .owner-line,.hf .deck .comment-mini{display:none}.hf .deck .comment-snippets{display:block;color:#ffffffc4;font-size:10px;line-height:1.4;margin:5px 0 0}.hf .deck .comment-snippets p{white-space:nowrap;display:block;text-overflow:ellipsis;overflow:hidden}.hf .deck .comment-snippets p:not(:last-of-type),.hf .deck .comment-snippets .all-comments{display:none}.hf .deck .comment-snippets b{color:#fff}.hf .deck .comment-snippets .avatar{width:17px;height:17px;font-size:8px;border-width:1px;vertical-align:middle;margin-right:4px}.hf .deck .media-choice{top:58px}.hf .deck .revision-overlay{bottom:116px;right:12px}.hf .deck .high-chip{background:#ffffff26;color:#fff}.hf .deck .post-cta{display:none}.hf .deck .post-cta .primary{background:#ffffff26;color:#fff;backdrop-filter:blur(12px)}.hf.pool-view .deck .post-cta{display:flex;pointer-events:auto;position:absolute;right:12px;bottom:calc(100% + 8px);margin:0}.hf .deck .post-cta .primary{min-height:36px;font-size:11px}.hf .deck-actions{flex-shrink:0;gap:24px;margin:12px 0 0;height:68px}.hf .deck-action{gap:5px;font-size:10px}.hf .deck-action span{width:48px;height:48px}.hf .deck-action.undo span,.hf .deck-action.next span{width:40px;height:40px}.hf .deck-action .icon{width:25px;height:25px}.hf .review-view .deck .social-line{display:none}.hf .review-view .page-header{display:flex}.hf .review-view .discussion-panel{padding-top:8px}.hf .deck-workspace .discussion-panel{max-height:100%;overflow:auto;position:static;padding-top:12px}.hf .deck .empty{padding:24px 12px;flex:1;justify-content:center}.hf .swipe-stamp{top:65px;width:60px;height:60px;border-width:2px}.hf .swipe-stamp .icon{width:38px;height:38px}@container hot-factory(max-width:820px){.hf .topbar{height:auto;min-height:0;display:flex;flex-direction:column;gap:0;padding:env(safe-area-inset-top,0px) 16px 0;background:var(--bg)}.hf .topbar-main{height:54px;gap:12px}.hf .wordmark{font-size:22px}.hf .top-actions .primary{padding:0;width:40px;min-height:40px;border-radius:50%;color:var(--text);background:var(--surface)}.hf .top-actions .primary>span{display:none}.hf .top-actions .profile-trigger .avatar{width:32px;height:32px}.hf .compact-toolbar{display:flex;align-items:center;gap:6px;height:44px;width:100%;padding-bottom:4px}.hf .compact-toolbar .page-header{display:contents}.hf .compact-toolbar .eyebrow{display:none}.hf .compact-toolbar h1{font-size:14px;gap:6px}.hf .compact-toolbar .page-header>div{flex:1}.hf .compact-toolbar .search{order:3;flex:0 0 34px;width:34px;height:36px;position:relative;padding:0;display:grid;place-items:center;background:none}.hf .compact-toolbar .search input{position:absolute;inset:0;opacity:0;cursor:pointer}.hf .compact-toolbar .search:focus-within{position:absolute;left:16px;right:16px;bottom:4px;width:auto;height:40px;background:var(--surface);z-index:12;padding:0 12px;display:flex}.hf .compact-toolbar .search:focus-within input{position:static;opacity:1;cursor:text}.hf .compact-toolbar .feed-toolbar{display:flex;flex:1;min-width:0;gap:4px;height:40px;min-height:0;margin:0}.hf .compact-toolbar .segment{gap:0}.hf .compact-toolbar .segment button{padding:0 10px;min-height:36px;font-size:11px}.hf .compact-toolbar .display-modes{gap:0;margin-left:auto}.hf .compact-toolbar .display-modes .icon-button{width:36px;height:36px}.hf .compact-toolbar .display-modes .icon{width:17px}.hf.pool-view .compact-toolbar .page-header>div{display:none}.hf .workspace{padding-top:14px}.hf .bottom-nav{padding:5px 8px calc(5px + env(safe-area-inset-bottom,0px))}.hf .bottom-nav .nav-item{min-height:44px;font-size:9px;gap:2px;padding:4px 6px}.hf .bottom-nav .nav-item>.icon{width:22px;height:22px}.hf.deck-active .workspace{padding:8px 16px 8px;max-width:580px}.hf.deck-active .main{max-width:none}.hf .feed.deck{width:100%;max-width:370px}.hf .deck-actions{height:65px;margin-top:8px;gap:26px}.hf .deck .post{border-radius:20px}.hf .vote-button{width:36px;height:36px}.hf .comment-mini button{width:36px;height:36px}.hf .post-top .icon-button{width:36px;height:36px}.hf .toast{bottom:calc(76px + env(safe-area-inset-bottom,0px))}.hf .deck-active .toast{bottom:calc(146px + env(safe-area-inset-bottom,0px))}}@container hot-factory(max-height:650px) and (max-width:820px){.hf .topbar-main{height:48px}.hf .compact-toolbar{height:40px}.hf .deck-actions{height:54px;gap:24px}.hf .deck-action span{width:42px;height:42px}.hf .deck-action{font-size:9px;gap:2px}.hf .deck .post-top{height:45px}.hf .deck .post-detail{padding-top:12px}.hf .deck .comment-snippets{display:none}.hf .deck .media-choice{top:48px}}.hf .hf-download-spinner{width:28px;height:28px;border:2px solid #ffffff30;border-top-color:#fff;border-radius:50%;animation:hf-download-spin .9s linear infinite}@keyframes hf-download-spin{to{transform:rotate(360deg)}}.hf .sound-toggle{position:absolute;right:10px;top:10px;z-index:8;display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:#1119;color:#fff;border:1px solid #ffffff30;backdrop-filter:blur(12px)}.hf .sound-toggle .icon{width:20px;height:20px}.hf .deck .sound-toggle{top:60px;right:12px}.hf .play-overlay{z-index:1}.hf .media-tap-target{position:absolute;inset:0;z-index:2;display:grid;place-items:center;cursor:pointer;touch-action:manipulation;-webkit-user-select:none;user-select:none}.hf .deck .media-tap-target{touch-action:none}.hf .play-glyph{pointer-events:none;color:white;opacity:0;filter:drop-shadow(0 2px 8px #000a);transition:opacity .15s}.hf .play-glyph .icon{width:42px;height:42px;fill:white;stroke-width:1}.hf .video-paused .play-glyph{opacity:1}.hf .video-seek{position:absolute;z-index:9;left:5%;bottom:12px;width:90%;height:20px;margin:0;appearance:none;-webkit-appearance:none;background:transparent;touch-action:none;cursor:pointer}.hf .video-seek::-webkit-slider-runnable-track{height:2px;border-radius:2px;background:#ffffff9c}.hf .video-seek::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:10px;height:10px;margin-top:-4px;border-radius:50%;background:#fff;box-shadow:0 1px 4px #0008}.hf .video-seek::-moz-range-track{height:2px;background:#ffffff9c}.hf .video-seek::-moz-range-thumb{width:10px;height:10px;border:0;border-radius:50%;background:#fff}.hf .download-status{display:inline-flex;align-items:center;gap:3px;justify-content:center;min-width:38px;height:36px;padding:0 7px;border-radius:10px;color:var(--muted);font-size:11px;white-space:nowrap;touch-action:manipulation}.hf .download-status:hover{background:var(--surface2)}.hf .download-status .icon{width:16px;height:16px}.hf .download-row{display:flex;align-items:center;gap:8px;padding:12px 2px;border-bottom:1px solid var(--line)}.hf .download-row>div{min-width:0;flex:1}.hf .download-row strong,.hf .download-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hf .download-row strong{font-size:13px;font-weight:600}.hf .download-row small{font-size:11px;color:var(--muted);margin-top:3px}.hf .download-row .icon-button{width:36px;height:36px;flex-shrink:0}.hf .download-row .icon{width:17px;height:17px}.hf .vote-button.comment-button{position:relative;display:flex;align-items:center;justify-content:center;width:auto;min-width:36px;gap:5px;padding:0 10px;border-radius:999px;color:var(--muted);font-size:11px;font-weight:600;flex-shrink:0}.hf .comment-button .comment-count{position:absolute;top:-5px;right:-4px;display:grid;place-items:center;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--tint);color:var(--accent);font-size:10px;line-height:1}@container hot-factory(max-width:520px){.hf .comment-button .comment-action-label{display:none}.hf .vote-button.comment-button{width:36px;padding:0}}.hf .page-footer{display:none!important}.hf .nav-count{background:var(--tint);color:var(--accent);border-radius:7px;opacity:1;font-weight:700;padding:1px 5px}.hf .feed:not(.deck){grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.hf .feed:not(.deck) .post{display:grid;grid-template-columns:118px minmax(0,1fr);grid-template-rows:38px minmax(0,1fr);min-height:154px;padding:8px;border-radius:18px;box-shadow:0 5px 18px #12162208}.hf .feed:not(.deck) .visual{grid-column:1;grid-row:1/3;width:118px;height:138px;aspect-ratio:auto;margin:0;border-radius:12px}.hf .feed:not(.deck) .post-top{grid-column:2;grid-row:1;height:38px;gap:6px;padding:0 0 0 10px}.hf .feed:not(.deck) .post-top .avatar{width:25px;height:25px;font-size:10px}.hf .feed:not(.deck) .post-top .icon-button{width:30px;height:30px}.hf .feed:not(.deck) .post-top .icon{width:17px;height:17px}.hf .feed:not(.deck) .post-detail{grid-column:2;grid-row:2;min-width:0;display:flex;flex-direction:column;padding:3px 2px 1px 10px}.hf .feed:not(.deck) .post-title{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal;overflow:hidden;line-height:1.35;font-size:13px;max-height:2.7em;margin:0 0 6px}.hf .feed:not(.deck) .social-line{margin:auto 0 0;gap:4px}.hf .feed:not(.deck) .comment-snippets,.hf .feed:not(.deck) .comment-mini,.hf .feed:not(.deck) .owner-line,.hf .feed:not(.deck) .feedback-line{display:none}.hf .feed:not(.deck) .post-cta{margin-top:6px}.hf .feed:not(.deck) .post-cta .primary,.hf .feed:not(.deck) .post-cta .secondary{min-height:30px;border-radius:9px}.hf .feed:not(.deck) .sound-toggle{top:5px;right:5px;width:27px;height:27px;border:0;background:#1119}.hf .feed:not(.deck) .sound-toggle .icon{width:15px;height:15px}.hf .feed:not(.deck) .play-glyph .icon{width:28px;height:28px}.hf .deck-actions{width:min(100%,370px);max-width:370px;height:58px;margin:10px auto 0;display:grid;grid-template-columns:44px minmax(0,1fr) minmax(0,1fr) 44px;gap:9px;align-items:center;justify-content:stretch}.hf .deck-action{height:50px;min-width:0;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:4px;padding:0 7px;border-radius:15px;font-size:12px;font-weight:650;white-space:nowrap;color:var(--text);background:var(--surface);border:1px solid var(--line);box-shadow:none}.hf .deck-action span,.hf .deck-action.undo span,.hf .deck-action.next span{width:23px;height:23px;display:grid;place-items:center;flex-shrink:0;background:none;border:0;border-radius:0;box-shadow:none}.hf .deck-action .icon,.hf .deck-action.undo .icon,.hf .deck-action.next .icon{width:22px;height:22px}.hf .deck-action strong{font-size:12px;font-weight:650}.hf .deck-action.minor{height:44px;width:44px;padding:0;border-radius:50%;color:var(--muted);background:var(--surface);box-shadow:0 3px 10px #12162208}.hf .deck-action.major.no{color:var(--red);background:#e655611b;border-color:#e6556125}.hf .deck-action.major.yes,.hf .deck-action.major.submit{color:#fff;background:var(--accent);border-color:var(--accent);box-shadow:0 6px 18px #007aff30}.hf .deck-action.major.submit{grid-column:2/4}.hf .deck-action.major.download{color:var(--accent);background:var(--tint);border-color:transparent}.hf .deck-action.major.publish{color:var(--muted);background:var(--surface2);border-color:transparent}.hf .deck-action:disabled{opacity:.6}.hf .swipe-stamp{top:38%;width:72px;height:72px;border-radius:22px;border:1px solid #ffffff75;color:#fff;background:#007affe6;box-shadow:0 16px 38px #007aff55;backdrop-filter:blur(12px);transform:translateY(-50%) rotate(-10deg) scale(.82);transition:opacity .1s,transform .15s}.hf .swipe-stamp.yes{left:18px;color:#fff}.hf .swipe-stamp.no{right:18px;color:#fff;background:#e65561e6;box-shadow:0 16px 38px #e6556150;transform:translateY(-50%) rotate(10deg) scale(.82)}.hf .swipe-stamp.yes,.hf .swipe-stamp.no,.hf .swipe-stamp .icon{width:38px;height:38px;stroke-width:3.2}.hf .progress-view .deck .owner-line,.hf .ready-view .deck .owner-line{display:flex;color:#ffffffd4;margin-bottom:5px}.hf .progress-view .deck .owner-line .avatar,.hf .ready-view .deck .owner-line .avatar{border-color:#ffffff40}.hf .progress-view .deck .feedback-line{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;max-height:3.2em;margin:6px 0 0;padding:5px 8px;border:1px solid #ffffff30;border-radius:9px;background:#0007;color:#fff;font-size:10px;line-height:1.45}.hf .progress-view .deck .feedback-line b{display:inline;margin-right:5px;font-weight:650}@container hot-factory(max-width:820px){.hf .bottom-nav{left:50%;right:auto;transform:translateX(-50%);width:calc(100% - 24px);max-width:480px;bottom:calc(8px + env(safe-area-inset-bottom,0px));padding:6px;min-height:60px;border:1px solid var(--line);border-radius:22px;background:var(--surface);box-shadow:0 12px 34px #1118271c;gap:2px;justify-content:space-between}.hf .bottom-nav .nav-item{flex:1;min-width:0;min-height:47px;padding:3px 1px;border-radius:16px;gap:1px;font-size:9px}.hf .bottom-nav .nav-item.active{background:var(--tint);color:var(--accent);font-weight:700}.hf .bottom-nav .nav-item>.icon{width:20px;height:20px}.hf .bottom-nav .nav-count{top:-2px;right:calc(50% - 23px);font-size:8px;padding:1px 4px;background:var(--accent);color:#fff;border-radius:9px}.hf:not(.deck-active) .workspace{padding-bottom:calc(100px + env(safe-area-inset-bottom,0px))}.hf .feed:not(.deck){grid-template-columns:minmax(0,1fr);gap:10px}.hf .feed:not(.deck) .post{grid-template-columns:102px minmax(0,1fr);grid-template-rows:36px minmax(0,1fr);min-height:134px;padding:7px;border-radius:16px}.hf .feed:not(.deck) .visual{width:102px;height:120px;border-radius:11px}.hf .feed:not(.deck) .post-top{height:36px;padding-left:9px}.hf .feed:not(.deck) .post-detail{padding-left:9px}.hf .feed:not(.deck) .post-title{font-size:12px}.hf .deck-actions{max-width:370px;height:54px;margin-top:8px;gap:8px}.hf .deck-action{height:48px;font-size:11px}.hf .deck-action strong{font-size:11px}.hf .deck-action.minor{height:42px;width:42px}}.hf .image-gallery{position:absolute;inset:0;background:#111317;overflow:hidden}.hf .image-gallery img{display:block;width:100%;height:100%;object-fit:contain}.hf .gallery-tap{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:space-between;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none}.hf .deck .gallery-tap{touch-action:none}.hf .gallery-edge{display:grid;place-items:center;width:30px;height:30px;margin:0 9px;border-radius:50%;background:#0006;color:#fff;pointer-events:none;backdrop-filter:blur(6px)}.hf .gallery-edge .icon{width:17px;height:17px}.hf .gallery-count{position:absolute;z-index:4;right:12px;top:61px;padding:4px 8px;border-radius:9px;background:#0008;color:#fff;font-size:11px;font-variant-numeric:tabular-nums;pointer-events:none}.hf .image-gallery.single .gallery-edge{display:none}.hf .confirmation-line{display:flex;align-items:center;gap:5px;margin:0 0 7px;font-size:11px;color:var(--muted)}.hf .confirmation-line .avatar{width:21px;height:21px;font-size:9px;flex-shrink:0}.hf .confirmation-line strong{font-weight:600;color:var(--text)}.hf .confirmation-complete{margin-left:auto;font-size:10px}.hf .deck .confirmation-line{color:#ffffffc4;margin-bottom:5px}.hf .deck .confirmation-line strong{color:#fff}.hf .deck .confirmation-line .avatar{border-color:#ffffff40}.hf .evaluation-history-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 10px}.hf .evaluation-history-title h3{margin:0;font-size:13px;font-weight:650}.hf .evaluation-history-title>span{font-size:11px;color:var(--muted)}.hf .evaluation-history .discussion-list{max-height:min(46dvh,400px);overflow:auto;overscroll-behavior:contain}.hf .evaluation-history .empty-discussion{padding:20px 0}.hf .feed:not(.deck) .image-gallery img{object-fit:cover}.hf .feed:not(.deck) .gallery-count{top:auto;right:6px;bottom:6px;font-size:9px;padding:2px 5px}.hf .feed:not(.deck) .gallery-edge{width:22px;height:22px;margin:0 3px}.hf .feed:not(.deck) .gallery-edge .icon{width:13px;height:13px}.hf .comment-button{position:relative;overflow:visible}.hf .comment-button .comment-count{position:absolute;top:-5px;right:-4px;display:grid;place-items:center;width:auto;min-width:17px;height:17px;padding:0 4px;border:0;border-radius:9px;background:var(--tint);color:var(--accent);font-size:10px;font-weight:650;line-height:1;pointer-events:none}.hf .comment-button .comment-new,.hf .read-all-comments .comment-new{position:absolute;left:-4px;bottom:-5px;display:grid;place-items:center;width:auto;min-width:25px;height:14px;padding:0 4px;border:0;border-radius:6px;background:#ffedf0;color:#d33b55;font-size:8px;font-weight:750;line-height:1;letter-spacing:.2px;pointer-events:none}.hf .read-all-comments{position:relative;flex-shrink:0}.hf .read-all-comments>.icon:first-child{width:21px;height:21px}.hf .read-all-comments>.icon:nth-child(2){position:absolute;width:12px;height:12px;right:6px;bottom:8px;padding:1px;background:var(--surface);color:var(--accent);border-radius:50%;stroke-width:2.5}.hf .read-all-comments .comment-new{bottom:0;left:-2px}.hf .comment-button .comment-indicator,.hf .read-all-comments .comment-indicator{position:absolute;top:-5px;right:-5px;display:grid;place-items:center;width:auto;min-width:17px;height:17px;padding:0 4px;border:0;border-radius:9px;background:var(--tint);color:var(--accent);font-size:10px;font-weight:650;line-height:1;pointer-events:none}.hf .comment-button .comment-indicator.is-new,.hf .read-all-comments .comment-indicator.is-new{min-width:28px;background:#ffedf0;color:#d33b55;font-size:8px;font-weight:750;letter-spacing:.2px}.hf .video-download{flex-shrink:0}.hf .deck .post-top .video-download{color:#fff}.hf .select-videos.active,.hf .post-select[aria-pressed=true]{color:var(--accent);background:var(--tint)}.hf .post.is-selected{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}.hf .selection-bar{display:flex;align-items:center;gap:10px;margin:0 0 16px;padding:10px;border:1px solid var(--line);border-radius:16px;background:var(--surface);font-size:12px;position:sticky;top:calc(var(--chrome-top,92px) + 8px);z-index:20}.hf .selection-bar>span{flex:1;white-space:nowrap}.hf .selection-bar .primary,.hf .selection-bar .secondary{min-height:36px;padding:0 13px;font-size:12px;border-radius:11px}.hf .selection-bar .icon-button{width:32px;height:36px}@container hot-factory(max-width:520px){.hf .top-actions .select-videos{width:36px;height:40px}.hf .top-actions .read-all-comments{width:36px}.hf .selection-bar{gap:7px;padding:8px;margin-bottom:12px}.hf .selection-bar .primary,.hf .selection-bar .secondary{padding:0 10px}}.hf.selecting-videos .post-cta,.hf.selecting-videos .post-action-icons>[data-action^=vote-]{display:none}\n.hf-shell{container:hot-factory / inline-size;height:100%;min-height:0;overflow:auto;flex:1}.hf{position:relative;height:100%;min-height:600px;background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;--bg:var(--surface-inset,#f6f7f9);--surface:var(--surface-panel,#fff);--surface2:var(--surface-hover,#f0f2f5);--text:var(--text-standard,#17191e);--muted:var(--text-subtle,#90959f);--line:var(--border-standard,#e9ebef);--accent:var(--blue-11,#007aff);--tint:var(--blue-3,#eaf3ff);--nav:var(--bg)}\n.hf .topbar{height:auto;min-height:80px;padding:12px 24px}.hf .wordmark{font-size:21px}.hf .topbar-main{gap:16px}.hf .step-nav{gap:2px}.hf .nav-item{padding:9px 12px}.hf .top-actions{gap:6px}.hf .primary.accent{background:var(--accent);color:#fff}.hf.deck-active{overflow:hidden}.hf.deck-active .workspace{position:absolute;top:var(--chrome-top,80px);height:calc(100% - var(--chrome-top,80px));padding-bottom:12px}.hf .workspace{padding:24px;max-width:1320px}.hf .workspace.deck-workspace{max-width:1080px}.hf .stat-line{display:flex;gap:14px;font-size:12px;color:var(--muted);margin:7px 0}.hf .stat-line span{display:flex;gap:3px;align-items:center}.hf .stat-line .icon{width:16px;height:16px}.hf .deck .stat-line{color:#fff}.hf .deck .post-detail{bottom:14px;pointer-events:auto}.hf .deck .post-title{font-size:14px;white-space:normal}.hf .flow-columns{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,1fr);gap:24px;align-items:start}.hf .flow-section{background:var(--surface);border:1px solid var(--line);border-radius:24px;padding:22px;min-width:0}.hf .flow-section h2{font-size:17px;margin:0 0 18px}.hf .flow-section h3{font-size:14px;margin:20px 0 12px}.hf .field{display:grid;gap:6px;margin:12px 0;font-size:12px;color:var(--muted)}.hf .field input,.hf .field select,.hf .field textarea,.hf .task-pick select{width:100%;min-width:0;border:0;border-radius:12px;padding:11px 12px;background:var(--surface2);color:var(--text);font:inherit;font-size:13px}.hf .field textarea{min-height:76px;resize:vertical}.hf .field-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:0 14px}.hf .muted{color:var(--muted);font-size:12px}.hf .notice{padding:12px 14px;background:var(--tint);border-radius:12px;font-size:12px;margin:12px 0;color:var(--accent)}.hf .error{color:var(--red);font-size:13px;white-space:pre-wrap;margin:10px 0}.hf .inline-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:18px}.hf .task-pick{display:flex;gap:12px;align-items:center;margin-bottom:18px}.hf .task-pick select{max-width:300px;background:var(--surface)}.hf .comparison{display:grid;grid-template-columns:1fr 1fr;gap:14px}.hf .compare-media{aspect-ratio:3/4;border-radius:16px;background:var(--surface2);position:relative;overflow:hidden;display:grid;place-items:center;color:var(--muted);font-size:12px}.hf .compare-media img,.hf .compare-media video{width:100%;height:100%;object-fit:contain}.hf .comparison figure{margin:0}.hf figcaption{font-size:12px;color:var(--muted);margin-top:8px}.hf .metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.hf .metric{padding:14px;border-radius:14px;background:var(--surface2)}.hf .metric strong{display:block;font-size:26px;font-weight:600;margin:4px 0}.hf .metric span,.hf .metric small{color:var(--muted);font-size:11px}.hf .sheet-row{font-size:12px;gap:12px}.hf .sheet-row>span:first-child{min-width:80px;color:var(--muted)}.hf .sheet-row>span:last-child{min-width:0;overflow-wrap:anywhere}.hf .discussion-panel{padding-top:0}.hf .discussion-panel .segment{margin-bottom:18px}.hf .discussion-panel .field input,.hf .discussion-panel .field textarea{background:var(--surface)}.hf .comment p{font-size:13px}.hf .source-caption{font-size:11px;color:var(--muted);margin:16px 0}.hf .empty-business{text-align:center;padding:70px 20px}.hf .empty-business h2{font-size:20px}.hf .empty-business p{font-size:13px;color:var(--muted);margin:12px auto 20px;max-width:420px}.hf .batch-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:18px}.hf .field input[type=checkbox]{width:16px}.hf .toolbar-label{font-size:11px;color:var(--muted)}.hf .feed:not(.deck) .media-placeholder{font-size:11px;padding:10px;gap:6px}.hf .feed:not(.deck) .media-placeholder>.icon{width:22px;height:22px}.hf .nav-arrows{display:flex}.hf .nav-arrows .icon-button{width:32px;height:32px}.hf details{margin-top:14px}.hf summary{font-size:12px;cursor:pointer;color:var(--muted)}.hf .sheet-overlay{position:sticky;top:0;height:100%;z-index:90}.hf .modal-layer{position:absolute;inset:0;z-index:90}.hf .status-strip{font-size:12px;padding:6px 24px;background:var(--surface);border-bottom:1px solid var(--line)}.hf .status-strip:empty{display:none}\n@container hot-factory (max-width:1000px){.hf .topbar-main{flex-wrap:wrap}.hf .step-nav{order:3;width:100%;overflow:auto;justify-content:center}.hf .top-actions{margin-left:auto}.hf .topbar-main{height:auto}.hf .topbar{padding:10px 16px}.hf .nav-item .icon{display:none}.hf .nav-item{font-size:12px;flex:1;justify-content:center}.hf .flow-columns{gap:16px}.hf .discussion-panel{width:260px}.hf .workspace.deck-workspace{gap:24px}.hf .task-pick{flex-wrap:wrap}}\n@container hot-factory (max-width:720px){.hf .workspace{padding:18px 16px}.hf .flow-columns{grid-template-columns:1fr}.hf .nav-item{font-size:10px;padding:8px 4px;min-height:38px}.hf .page-header{flex-wrap:wrap}.hf .flow-section{padding:18px}.hf .discussion-panel{display:none}.hf .wordmark{font-size:20px}.hf .top-actions .secondary{padding:0 10px;min-height:36px;font-size:11px}.hf .top-actions .primary{padding:0 14px;min-height:36px;font-size:12px}.hf .metric-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.hf .metric{padding:10px}.hf .metric span{font-size:10px}.hf .feed:not(.deck){grid-template-columns:1fr}.hf .workspace.deck-workspace{display:block;max-width:580px}.hf.deck-active .page-header{margin-bottom:10px}.hf .feed-toolbar{flex-wrap:wrap}.hf .sheet{padding:20px;max-height:85%}}\n';
const CAT_POSTER =
  "data:image/webp;base64,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";
export function apply(ctx) {
  const R = ctx.react,
    h = R.createElement;
  const paths = {
    inbox: "m4 4-2 11v5h20v-5L20 4H4Z M2 15h6l2 3h4l2-3h6",
    check: "m5 12 4 4L19 6",
    x: "m6 6 12 12M18 6 6 18",
    next: "M4 12h16m-6-6 6 6-6 6",
    back: "M20 12H4m6-6-6 6 6 6",
    chat: "M21 11.5a9 9 0 0 1-9 9c-1.5 0-3-.4-4.2-1L3 21l1.5-4.8A9 9 0 1 1 21 11.5Z",
    heart:
      "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
    save: "m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2L12 17.3l-5.7 3 1.1-6.3L3 9.6l6.3-.9Z",
    list: "M3 4h6v6H3ZM13 6h8M13 9h6M3 14h6v6H3ZM13 16h8M13 19h6",
    swipe: "M7 3h14v18H7ZM4 6H2v14h2",
    external: "M14 3h7v7m0-7L10 14M10 3H3v18h18v-7",
    search: "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-1 6 5 5",
    film: "M3 8h18v13H3ZM3 8 20 3l-1-3L2 5l1 3ZM6 4l3 3M12 2l3 3M3 13h18",
  };
  const icon = (k) =>
    h(
      "svg",
      { className: "icon", viewBox: "0 0 24 24", "aria-hidden": true },
      h("path", { d: paths[k] || paths.chat }),
    );
  const avatar = (s) =>
    h(
      "span",
      {
        className: "avatar",
        style: { "--avatar-bg": "#e6edf9", "--avatar-fg": "#526b8f" },
      },
      [...(s || "待")][0],
    );
  const button = (label, fn, cls = "secondary", disabled = false, props = {}) =>
    h(
      "button",
      { type: "button", className: cls, onClick: fn, disabled, ...props },
      label,
    );
  const link = (url, label) =>
    safeURL(url)
      ? h(
          "a",
          { href: safeURL(url), target: "_blank", rel: "noopener noreferrer" },
          label,
        )
      : h("span", { className: "muted" }, "待补");
  const num = (x) =>
    x === null || x === undefined ? "—" : x.toLocaleString("zh-CN");
  function App({ connection }) {
    const [channel, setChannel] = R.useState(SOURCE_CHANNEL),
      [rows, setRows] = R.useState([]),
      [draft, setDraft] = R.useState(null),
      [stage, setStage] = R.useState(0),
      [mode, setMode] = R.useState("swipe"),
      [side, setSide] = R.useState("comments");
    const [loading, setLoading] = R.useState(true),
      [busy, setBusy] = R.useState(false),
      [error, setError] = R.useState(""),
      [notice, setNotice] = R.useState(""),
      [refresh, setRefresh] = R.useState(0),
      [query, setQuery] = R.useState(""),
      [filter, setFilter] = R.useState("全部");
    const [selected, setSelected] = R.useState(new Set()),
      [modal, setModal] = R.useState(""),
      [eventJSON, setEventJSON] = R.useState(""),
      [interactionJSON, setInteractionJSON] = R.useState(""),
      [commentJSON, setCommentJSON] = R.useState(""),
      [batchOwner, setBatchOwner] = R.useState(""),
      [, permissionVersion] = R.useState(0);
    const root = R.useRef(null),
      writing = R.useRef(false);
    const repo = R.useMemo(
      () => createRepository(ctx.relay),
      [connection.session, connection.scope, connection.viewer],
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
            ...dialog.querySelectorAll("button,input,select,textarea,a[href]"),
          ].filter((x) => !x.disabled && x.getClientRects().length);
          const first = elements[0],
            last = elements.at(-1);
          if (
            e.shiftKey &&
            (document.activeElement === first ||
              !dialog.contains(document.activeElement))
          ) {
            e.preventDefault();
            last?.focus();
          } else if (
            !e.shiftKey &&
            (document.activeElement === last ||
              !dialog.contains(document.activeElement))
          ) {
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
      () =>
        connection.session?.channels.subscribeList?.(() =>
          permissionVersion((v) => v + 1),
        ),
      [connection.session],
    );
    const accessible = readAllowed(connection, channel),
      writable = accessible && !!connection.session?.outbox?.supports?.(45010);
    R.useEffect(() => {
      const node = root.current;
      if (!node) return;
      const update = () => {
        const top = node.querySelector(".topbar");
        const strip = node.querySelector(".status-strip");
        node.style.setProperty(
          "--chrome-top",
          (top?.offsetHeight || 80) + (strip?.offsetHeight || 0) + "px",
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
      let alive = true,
        sync,
        off;
      setRows([]);
      setDraft(null);
      setSelected(new Set());
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
        setDraft((d) => d || data[0] || null);
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
            "#type": [TYPE],
          });
          const update = () => {
            if (!alive) return;
            const s = sync.snapshot();
            if (s.status === "live") consume(s.events);
            else if (["unsupported", "error"].includes(s.status)) {
              off?.();
              sync.dispose();
              sync = undefined;
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
    const current = accessible ? rows : [],
      d = accessible ? draft : null;
    const dirty =
      !!d &&
      JSON.stringify(d) !== JSON.stringify(current.find((x) => x.id === d.id));
    const leave = () =>
      !dirty ||
      (typeof globalThis.confirm === "function" &&
        globalThis.confirm("有未保存修改，放弃修改后切换？"));
    const patch = (key, value, group) =>
      setDraft((p) =>
        group
          ? { ...p, [group]: { ...p[group], [key]: value } }
          : { ...p, [key]: value },
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
        const have = (await repo.read(channel))
          .map((e) => decodeEvent(e, channel))
          .filter(Boolean);
        let first;
        for (const seed of seeds().filter(
          (s) => !have.some((c) => c.id === s.id),
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
      const values = current
        .filter((c) => selected.has(c.id))
        .map((c) => ({
          ...clone(c.id === d?.id ? d : c),
          stage: 1,
          owners: {
            ...(c.id === d?.id ? d : c).owners,
            maker: text(batchOwner) || (c.id === d?.id ? d : c).owners.maker,
          },
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
        setSelected(new Set());
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
        options
          ? h(
              "select",
              {
                "aria-label": label,
                value: val ?? "",
                disabled: busy || !writable,
                onChange: (e) => patch(key, e.target.value, group),
              },
              options.map((v) => h("option", { key: v, value: v }, v)),
            )
          : h(multi ? "textarea" : "input", {
              "aria-label": label,
              value: val ?? "",
              disabled: busy || !writable,
              type: numeric ? "number" : "text",
              min: numeric ? 0 : undefined,
              onChange: (e) =>
                patch(
                  key,
                  numeric
                    ? e.target.value === ""
                      ? null
                      : Number(e.target.value)
                    : e.target.value,
                  group,
                ),
            }),
      );
    }
    const grid = (...children) =>
      h("div", { className: "field-grid" }, children);
    const actions = (...children) =>
      h("div", { className: "inline-actions" }, children);
    const row = (a, b) =>
      h(
        "div",
        { className: "sheet-row" },
        h("span", null, a),
        h("span", null, b),
      );
    const section = (title, ...children) =>
      h(
        "section",
        { className: "flow-section" },
        h("h2", null, title),
        children,
      );
    const details = (title, ...children) =>
      h("details", null, h("summary", null, title), children);
    const saveButton = () =>
      button(
        busy ? "保存中…" : dirty ? "保存修改" : "保存",
        () => runSave(),
        "primary accent",
        !writable || busy || !d,
      );
    function imageFor(c) {
      return (
        safeURL(c.sourceMediaURL) ||
        (c.id === seeds()[0].id && c.sourceURL === seeds()[0].sourceURL
          ? CAT_POSTER
          : null)
      );
    }
    function media(c, result = false) {
      const url = result ? safeURL(c.template.resultURL) : imageFor(c);
      if (!url)
        return h(
          "div",
          { className: "media-placeholder" },
          icon("external"),
          h("span", null, result ? "尚未提交复刻结果" : "原帖媒体待采集"),
        );
      const video = result
        ? /\.(mp4|webm|mov)(?:\?|$)/i.test(url)
        : c.sourceMediaKind === "视频";
      return video
        ? h("video", {
            src: url,
            controls: true,
            preload: "metadata",
            "aria-label": result ? "复刻成片" : "原帖视频",
          })
        : h(
            "div",
            { className: "image-gallery single" },
            h("img", {
              src: url,
              alt: result ? "复刻结果" : c.title + "原帖封面",
              onError: (e) => {
                e.currentTarget.alt = "媒体加载失败，请打开对应链接查看";
              },
            }),
          );
    }
    const statLine = (c) =>
      h(
        "div",
        { className: "stat-line" },
        [
          ["heart", c.likes !== null ? num(c.likes) : c.likesDisplay || "—"],
          ["save", num(c.saves)],
          ["chat", num(c.comments)],
        ].map(([i, v]) => h("span", { key: i }, icon(i), v)),
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
          className: "post" + (selected.has(c.id) ? " is-selected" : ""),
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
              `${c.owners.finder || "待分配"} · ${c.cooperation.decision === "放弃" ? "已放弃" : c.decision}`,
            ),
          ),
          button(
            icon("external"),
            () => {
              choose(c);
              setMode("swipe");
            },
            "icon-button",
            busy,
            { "aria-label": "展开笔记 " + c.title },
          ),
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
                disabled: busy,
              }),
              selected.has(c.id) ? "已勾选" : "勾选优质候选",
            ),
          ),
        ),
      );
    }
    function commentsView() {
      return h(
        R.Fragment,
        null,
        h(
          "header",
          { className: "evaluation-history-title" },
          h("h3", null, `原帖评论 · 共${num(d.comments)}条`),
        ),
        h(
          "div",
          { className: "discussion-list" },
          d.sourceComments.length
            ? d.sourceComments.map((c, i) =>
                h(
                  "div",
                  { className: "comment", key: i },
                  avatar(c.author),
                  h(
                    "div",
                    null,
                    h(
                      "div",
                      { className: "comment-header" },
                      h("strong", null, c.author),
                    ),
                    h("p", null, c.text),
                  ),
                ),
              )
            : h("p", { className: "empty-discussion" }, "具体评论待采集"),
        ),
        h(
          "p",
          { className: "source-caption" },
          `原帖快照 · ${d.observedAt || "采集时间待补"} · 仅展示已录入节选`,
        ),
        link(d.sourceURL, "打开原帖查看完整内容 ↗"),
      );
    }
    function assessment() {
      return h(
        R.Fragment,
        null,
        field("笔记标题", "title"),
        grid(
          field("找热点负责人", "finder", "owners"),
          field("原作者", "author"),
        ),
        field("粉丝数（需低于2000）", "followers", null, null, true),
        grid(
          field("点赞数（精确值）", "likes", null, null, true),
          field("点赞显示值（如1.9万）", "likesDisplay"),
          field("收藏数", "saves", null, null, true),
          field("评论数", "comments", null, null, true),
        ),
        field("互动判断", "engagement", null, ["待判断", "较高", "一般"]),
        field("内容类型", "contentType", null, [
          "待判断",
          "娱乐",
          "泛娱乐",
          "利他教程",
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
            "视频",
          ]),
          h(
            "label",
            { className: "field" },
            "原帖评论节选 JSON（author、text）",
            h("textarea", {
              "aria-label": "原帖评论JSON",
              value: commentJSON,
              disabled: busy,
              onChange: (e) => setCommentJSON(e.target.value),
            }),
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
            busy || !writable,
          ),
        ),
        actions(
          saveButton(),
          button(
            "通过并交给复刻",
            () => advance(1, { ...d, decision: "通过" }),
            "primary accent",
            busy || !writable,
          ),
        ),
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
            side === "comments" ? "active" : "",
          ),
          button(
            "筛选评估",
            () => setSide("review"),
            side === "review" ? "active" : "",
          ),
        ),
        side === "comments" ? commentsView() : assessment(),
        side === "comments" &&
          actions(
            button("开始评估", () => setSide("review"), "primary accent", busy),
          ),
      );
    }
    const candidates = current.filter(
      (c) =>
        c.title.toLowerCase().includes(query.toLowerCase()) &&
        (filter === "全部" ||
          (filter === "已勾选" && selected.has(c.id)) ||
          (filter === "待评估" && c.decision === "待评估") ||
          (filter === "通过" && c.decision === "通过")),
    );
    function nextNote() {
      const i = candidates.findIndex((c) => c.id === d?.id);
      if (candidates.length) choose(candidates[(i + 1) % candidates.length]);
    }
    function noteContent() {
      return h(
        "div",
        {
          className:
            "workspace" + (mode === "swipe" && d ? " deck-workspace" : ""),
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
              ["全部", "待评估", "已勾选"].map((f) =>
                button(
                  f === "已勾选" ? `${f} ${selected.size}` : f,
                  () => {
                    setFilter(f);
                    setMode("feed");
                  },
                  filter === f ? "active" : "",
                ),
              ),
            ),
            h(
              "div",
              { className: "display-modes" },
              button(
                icon("list"),
                () => setMode("feed"),
                "icon-button" + (mode === "feed" ? " active" : ""),
                false,
                { "aria-label": "紧凑列表视图" },
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
                { "aria-label": "滑卡视图" },
              ),
            ),
          ),
          h(
            "section",
            { className: "feed" + (mode === "swipe" && d ? " deck" : "") },
            mode === "swipe" && d
              ? card(d)
              : candidates.length
                ? candidates.map(card)
                : h(
                    "div",
                    { className: "empty" },
                    h("h2", null, "没有符合条件的笔记"),
                  ),
          ),
          mode === "swipe" && d
            ? h(
                "div",
                { className: "deck-actions" },
                button(
                  icon("chat"),
                  () => setModal("review"),
                  "deck-action minor",
                  busy,
                  { "aria-label": "评论与筛选评估" },
                ),
                button(
                  [icon("x"), h("strong", { key: "label" }, "淘汰")],
                  () => {
                    patch("decision", "淘汰");
                    setSide("review");
                    setModal("review");
                  },
                  "deck-action major no",
                  busy || !writable,
                ),
                button(
                  [
                    icon("check"),
                    h(
                      "strong",
                      { key: "label" },
                      selected.has(d.id) ? "已勾选" : "勾选",
                    ),
                  ],
                  () => toggleSelect(d),
                  "deck-action major yes",
                  busy,
                ),
                button(icon("next"), nextNote, "deck-action minor", busy, {
                  "aria-label": "下一条笔记",
                }),
              )
            : h(
                "div",
                { className: "batch-bar" },
                button(
                  `交给复刻 · ${selected.size}条`,
                  () => setModal("batch"),
                  "primary accent",
                  busy || !writable || !selected.size,
                ),
                h(
                  "span",
                  { className: "muted" },
                  "入选需满足筛选条件，并明确制作负责人",
                ),
              ),
        ),
        mode === "swipe" && d ? sidebar() : null,
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
            stage === 0 &&
              h("span", { className: "title-count" }, current.length),
          ),
        ),
        stage === 0 &&
          h(
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
              },
            }),
          ),
        h(
          "div",
          { className: "nav-arrows" },
          button(
            icon("back"),
            () => setStage(Math.max(0, stage - 1)),
            "icon-button",
            stage === 0 || busy,
            { "aria-label": "上一个工作空间" },
          ),
          button(
            icon("next"),
            () => setStage(Math.min(4, stage + 1)),
            "icon-button",
            stage === 4 || busy,
            { "aria-label": "下一个工作空间" },
          ),
        ),
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
              ["复刻成片", true],
            ].map(([label, result]) =>
              h(
                "figure",
                { key: label },
                h("div", { className: "compare-media" }, media(d, result)),
                h(
                  "figcaption",
                  null,
                  link(
                    result ? d.template.resultURL : d.sourceURL,
                    label + " ↗",
                  ),
                ),
              ),
            ),
          ),
          actions(
            saveButton(),
            button("同步跟进BD", () => setStage(2), "secondary", busy),
          ),
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
            "未通过",
          ]),
          h(
            "p",
            { className: "notice" },
            "复刻与BD可以并行。制作工作流接口待接入。",
          ),
          actions(
            button(
              "记录制作进度",
              () => advance(1),
              "secondary",
              busy || !writable,
            ),
          ),
        ),
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
            "未达成",
          ]),
          field("合作证据链接", "evidenceURL", "cooperation"),
          field(
            "合作条件与沟通记录",
            "terms",
            "cooperation",
            null,
            false,
            true,
          ),
          field("下次跟进", "next", "cooperation"),
          failed &&
            h(
              R.Fragment,
              null,
              h(
                "p",
                { className: "notice" },
                "BD未成功，请决定继续制作还是放弃，并记录理由。",
              ),
              field("失败后决定", "decision", "cooperation", [
                "待决定",
                "继续制作",
                "放弃",
              ]),
              field(
                "决策理由",
                "decisionReason",
                "cooperation",
                null,
                false,
                true,
              ),
            ),
          actions(
            saveButton(),
            button(
              "保存并进入分发准备",
              () => advance(3),
              "primary accent",
              busy || !writable,
            ),
          ),
        ),
        section(
          "推进条件",
          row("模板验收", d.template.acceptance),
          row("BD", d.cooperation.status),
          row("失败后决策", d.cooperation.decision || "待决定"),
          h(
            "p",
            { className: "source-caption" },
            "BD成功后可准备分发；复刻结果仍须平台验收。BD未成功时，继续制作需有明确理由，放弃后保留记录。",
          ),
          actions(
            button(
              "保存并回到复刻",
              async () => {
                const saved = await runSave();
                if (saved) setStage(1);
              },
              "secondary",
              busy || !writable,
            ),
            button(
              "记录BD进度",
              () => advance(2),
              "secondary",
              busy || !writable,
            ),
          ),
        ),
      );
    }
    function codeForm(c, i) {
      const cp = (key, v) =>
        patch(
          "codes",
          d.codes.map((a, j) => (j === i ? { ...a, [key]: v } : a)),
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
            ["placement", "置顶／引流／引用位置"],
          ].map(([key, label]) =>
            h(
              "label",
              { className: "field" },
              label,
              h("input", {
                "aria-label": `${label} ${i + 1}`,
                value: c[key],
                disabled: busy || !writable,
                onChange: (e) => cp(key, e.target.value),
              }),
            ),
          ),
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
              onChange: (e) => cp("status", e.target.value),
            },
            ["草案", "已开通", "已停用"].map((x) => h("option", { key: x }, x)),
          ),
        ),
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
              () =>
                patch("codes", [
                  ...d.codes,
                  {
                    code: "",
                    status: "草案",
                    placement: "待定",
                    platformEvidence: "",
                    entryURL: "",
                    postURL: "",
                  },
                ]),
              "secondary",
              busy || !writable || d.codes.length >= 40,
            ),
            saveButton(),
          ),
        ),
        section(
          "分发准备",
          row("模板验收", d.template.acceptance),
          row("BD", d.cooperation.status),
          row("决策", d.cooperation.decision || "待决定"),
          h(
            "p",
            { className: "source-caption" },
            "口令开通需平台证据；实际投放位置单独留链接。当前不会自动开通口令、联系作者或发布笔记。",
          ),
          actions(
            button(
              "进入监控",
              () => advance(4),
              "primary accent",
              busy || !writable,
            ),
          ),
        ),
      );
    }
    const metric = (label, value, sub) =>
      h(
        "div",
        { className: "metric", key: label },
        h("span", null, label),
        h("strong", null, num(value)),
        h("small", null, sub),
      );
    function monitoring() {
      const m = interactionMetrics(d),
        counts = metrics(d),
        per = (val) => (val === null ? "—" : `${(val * 100).toFixed(1)}%`);
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
            metric("评论条数", d.monitoring.comments, "帖子整体快照"),
          ),
          h(
            "p",
            { className: "source-caption" },
            `帖子快照：${d.monitoring.observedAt || "未采集"} · ${d.monitoring.evidenceURL ? "已附证据" : "自动监控未接入"}`,
          ),
          h("h3", null, "口令使用与转化"),
          h(
            "div",
            { className: "metric-grid" },
            metric("使用口令人数", counts.used, "导入用户去重"),
            metric("拿到成果人数", counts.result, "导入用户去重"),
            metric("注册账号人数", counts.registered, "导入用户去重"),
          ),
          h(
            "p",
            { className: "source-caption" },
            `使用→成果：${per(counts.resultRate)} · 成果→注册：${per(counts.registerRate)} · ${d.period}`,
          ),
          d.codes.map((c) => {
            const a = metrics(d, c.code);
            return row(
              c.code,
              `使用 ${num(a.used)} · 成果 ${num(a.result)} · 注册 ${num(a.registered)}`,
            );
          }),
          (counts.orphanResults > 0 || counts.orphanRegistrations > 0) &&
            h(
              "p",
              { className: "notice" },
              `有${counts.orphanResults}位成果用户缺口令使用事件，${counts.orphanRegistrations}位注册用户缺成果事件，请核实漏报。`,
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
                true,
              ),
            ),
            field("采集时间（ISO时间）", "observedAt", "monitoring"),
            field("帖子数据证据链接", "evidenceURL", "monitoring"),
            field("统计范围说明", "period"),
            field("口令事件数据完整度", "measurement", null, [
              "unconnected",
              "partial",
              "complete",
            ]),
            h(
              "p",
              { className: "muted" },
              "unconnected=未接入；partial=部分事件；complete=已核齐该范围，才显示转化率。互动导入可能仅为样本。",
            ),
            h(
              "label",
              { className: "field" },
              "口令事件JSON",
              h("textarea", {
                "aria-label": "口令事件JSON",
                value: eventJSON,
                onChange: (e) => setEventJSON(e.target.value),
                disabled: busy,
              }),
            ),
            button(
              "导入口令事件到草稿",
              () => {
                try {
                  const next = mergeEvents(
                    d.events,
                    JSON.parse(eventJSON),
                    d.codes,
                  );
                  patch("events", next);
                  setEventJSON("");
                  setNotice("事件已去重载入草稿，保存后共享");
                } catch (e) {
                  setError(e.message);
                }
              },
              "secondary",
              busy || !writable,
            ),
            h(
              "p",
              { className: "source-caption" },
              "字段：id、code、匿名userKey、event(code_used/result_received/registered)、at、evidence。",
            ),
            h(
              "label",
              { className: "field" },
              "提及与评论JSON",
              h("textarea", {
                "aria-label": "提及与评论JSON",
                value: interactionJSON,
                onChange: (e) => setInteractionJSON(e.target.value),
                disabled: busy,
              }),
            ),
            button(
              "导入提及与评论到草稿",
              () => {
                try {
                  patch(
                    "interactions",
                    mergeInteractions(
                      d.monitoring.interactions,
                      JSON.parse(interactionJSON),
                    ),
                    "monitoring",
                  );
                  setInteractionJSON("");
                  setNotice("互动明细已载入草稿，保存后共享");
                } catch (e) {
                  setError(e.message);
                }
              },
              "secondary",
              busy || !writable,
            ),
            h(
              "p",
              { className: "source-caption" },
              "字段：id、匿名userKey、type(mention/comment)、text、at、evidenceURL、handled(false)。",
            ),
            saveButton(),
          ),
        ),
        section(
          "评论处理与改善",
          d.monitoring.interactions.length
            ? h(
                "div",
                { className: "discussion-list" },
                d.monitoring.interactions.map((x) =>
                  h(
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
                          x.type === "mention" ? "提及我们" : "评论",
                        ),
                        h("time", null, x.at),
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
                          onChange: (e) =>
                            patch(
                              "interactions",
                              d.monitoring.interactions.map((v) =>
                                v.id === x.id
                                  ? { ...v, handled: e.target.checked }
                                  : v,
                              ),
                              "monitoring",
                            ),
                        }),
                        "已处理",
                      ),
                    ),
                  ),
                ),
              )
            : h(
                "p",
                { className: "empty-discussion" },
                "尚未导入我方帖子评论或提及明细",
              ),
          h("h3", null, "改善记录"),
          d.improvements.map((item, i) =>
            h(
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
                  ["after", "改善后证据"],
                ].map(([k, label]) =>
                  h(
                    "label",
                    { className: "field" },
                    label,
                    h("input", {
                      "aria-label": `${label} ${i + 1}`,
                      value: item[k],
                      disabled: busy || !writable,
                      onChange: (e) =>
                        patch(
                          "improvements",
                          d.improvements.map((v, j) =>
                            j === i ? { ...v, [k]: e.target.value } : v,
                          ),
                        ),
                    }),
                  ),
                ),
              ),
            ),
          ),
          actions(
            button(
              "新增改善",
              () =>
                patch("improvements", [
                  ...d.improvements,
                  {
                    metric: "",
                    hypothesis: "",
                    action: "",
                    owner: "",
                    reviewAt: "",
                    before: "",
                    after: "",
                  },
                ]),
              "secondary",
              busy || !writable || d.improvements.length >= 100,
            ),
            saveButton(),
          ),
        ),
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
                exportedAt: new Date().toISOString(),
                campaigns: current,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "HOT_FACTORY_EXPORT.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    const channels =
      connection.session?.channels
        .list()
        .channels.filter((c) => readAllowed(connection, c.id)) || [];
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
          h("span", { className: "brand-dot" }),
        ),
        h(
          "nav",
          { className: "step-nav", "aria-label": "热点工作流" },
          STAGES.map((name, i) =>
            button(
              [
                icon(["inbox", "film", "chat", "next", "check"][i]),
                h("span", { key: "label" }, `${i + 1} ${name}`),
              ],
              () => {
                setStage(i);
                setModal("");
              },
              "nav-item" + (stage === i ? " active" : ""),
              busy,
              { "aria-current": stage === i ? "step" : undefined, key: i },
            ),
          ),
        ),
        h(
          "div",
          { className: "top-actions" },
          button(
            icon("list"),
            () => setModal("settings"),
            "icon-button",
            busy,
            { "aria-label": "共享频道与工具" },
          ),
          saveButton(),
        ),
      ),
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
              "aria-label":
                modal === "settings"
                  ? "共享频道与工具"
                  : modal === "batch"
                    ? "批量交给复刻"
                    : "评论与筛选评估",
            },
            h(
              "header",
              { className: "sheet-head" },
              h(
                "h2",
                null,
                modal === "settings"
                  ? "共享频道与工具"
                  : modal === "batch"
                    ? "批量交给复刻"
                    : "评论与筛选评估",
              ),
              button(icon("x"), () => setModal(""), "icon-button", busy, {
                "aria-label": "关闭",
              }),
            ),
            modal === "settings"
              ? h(
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
                        disabled: busy,
                      },
                      !channels.some((c) => c.id === channel) &&
                        h("option", { value: channel }, "待连接工作频道"),
                      channels.map((c) =>
                        h("option", { key: c.id, value: c.id }, c.name || c.id),
                      ),
                    ),
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
                      busy,
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
                      busy || !writable,
                    ),
                    button(
                      "导出记录",
                      exportData,
                      "secondary",
                      !current.length,
                    ),
                    button(
                      "保存周洋5条候选",
                      saveSeeds,
                      "primary accent",
                      busy || !writable,
                    ),
                  ),
                  h(
                    "p",
                    { className: "sheet-note" },
                    "保存后同频道成员可见。负责人不会自动收到通知；插件不会自动联系作者或发帖。",
                  ),
                )
              : modal === "batch"
                ? h(
                    R.Fragment,
                    null,
                    h(
                      "p",
                      { className: "muted" },
                      `已勾选${selected.size}条；逐条筛选通过后才能交接。`,
                    ),
                    h(
                      "label",
                      { className: "field" },
                      "统一复刻负责人（留空保留各条分工）",
                      h("input", {
                        "aria-label": "统一复刻负责人",
                        value: batchOwner,
                        onChange: (e) => setBatchOwner(e.target.value),
                        disabled: busy,
                      }),
                    ),
                    actions(
                      button(
                        "交给复刻",
                        batchSubmit,
                        "primary accent",
                        busy || !writable,
                      ),
                    ),
                  )
                : d
                  ? h(
                      R.Fragment,
                      null,
                      commentsView(),
                      h("h3", { style: { marginTop: 20 } }, "筛选评估"),
                      assessment(),
                    )
                  : null,
            error && h("p", { className: "error", role: "alert" }, error),
          ),
        ),
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
          className:
            "hf" + (stage === 0 && mode === "swipe" && d ? " deck-active" : ""),
        },
        toolbar,
        h(
          "div",
          { className: "status-strip" },
          error
            ? h("span", { role: "alert", className: "error" }, error)
            : notice
              ? h("span", { role: "status" }, notice)
              : h(
                  "span",
                  { className: "muted" },
                  `${channels.find((c) => c.id === channel)?.name || "待连接工作频道"} · ${dirty ? "有未保存修改" : "共享记录"} · 自动采集与监控未接入`,
                ),
        ),
        loading
          ? h("div", { className: "empty-business" }, "正在读取共享记录…")
          : !accessible
            ? h(
                "div",
                { className: "empty-business" },
                h("h2", null, "连接共享工作频道"),
                h(
                  "p",
                  null,
                  "连接社区并取得频道访问后，可读取和保存热点工作流。",
                ),
              )
            : !d
              ? h(
                  "div",
                  { className: "empty-business" },
                  h("h2", null, "从一条热点开始"),
                  h(
                    "p",
                    null,
                    "周洋已提交5条原帖候选，载入后逐条评估，再分工复刻、BD与分发。",
                  ),
                  button(
                    "载入周洋5条候选",
                    saveSeeds,
                    "primary accent",
                    busy || !writable,
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
                      busy || !writable,
                    ),
                  ),
                )
              : stage === 0
                ? noteContent()
                : h(
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
                            onChange: (e) =>
                              choose(
                                current.find((c) => c.id === e.target.value),
                              ),
                            disabled: busy,
                          },
                          !current.some((c) => c.id === d.id) &&
                            h("option", { value: d.id }, d.title),
                          current.map((c) =>
                            h(
                              "option",
                              { value: c.id, key: c.id },
                              `${c.title}${c.cooperation.decision === "放弃" ? " · 已放弃" : ""}`,
                            ),
                          ),
                        ),
                        h(
                          "span",
                          { className: "muted" },
                          `当前进度：${STAGES[d.stage]} · ${d.owners[OWNERS[d.stage]] || "待分配"}`,
                        ),
                      ),
                      stage === 1
                        ? cloneContent()
                        : stage === 2
                          ? bdContent()
                          : stage === 3
                            ? distribution()
                            : monitoring(),
                      details(
                        "卡点与下次交付",
                        field("当前卡点", "blocker", null, null, false, true),
                        field("下次交付时间", "nextDelivery"),
                      ),
                      h(
                        "p",
                        { className: "source-caption" },
                        "自动采集、制作与平台监控接口待接入；当前支持登记、共享和导入真实数据。",
                      ),
                    ),
                  ),
        modalView(),
      ),
    );
  }
  function ScopedPage() {
    const connection = R.useSyncExternalStore(
      ctx.relay.subscribe,
      ctx.relay.snapshot,
      ctx.relay.snapshot,
    );
    return h(App, {
      key: `${connection.scope || "none"}:${connection.generation || 0}`,
      connection,
    });
  }
  ctx.pages.register({
    id: "main",
    title: "热点工厂",
    primary: true,
    layout: "workspace",
    component: ScopedPage,
  });
}

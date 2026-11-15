// src/plugin-icons/bases/opcb.xhs-topic-burst/plugin.js
var inject = ["react", "pages", "relay", "agents"];
var TYPES = {
  extend: { key: "extend", label: "延伸选题", short: "延伸", icon: "🌱", color: "#2f9e6b" },
  post: { key: "post", label: "小红书帖子", short: "帖子", icon: "📕", color: "#e0425c" },
  draft: { key: "draft", label: "文稿", short: "文稿", icon: "📝", color: "#3b7ddd" },
  research: { key: "research", label: "深入研究", short: "研究", icon: "🔬", color: "#8456d8" },
  note: { key: "note", label: "笔记", short: "笔记", icon: "💬", color: "#7a8394" }
};
var TYPE_ORDER = ["extend", "post", "draft", "research", "note"];
var ICON_TO_TYPE = { "🌱": "extend", "📕": "post", "📝": "draft", "🔬": "research", "💬": "note" };
var TOPIC_ICON = "💡";
var LINK_ICON = "🔗";
var HEX64 = /^[0-9a-f]{64}$/;
var MAX_TEXT = 2e4;
var PAGE_ICON = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iY3VycmVudENvbG9yIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIzLjQiLz48Y2lyY2xlIGN4PSIyMS4yMCIgY3k9IjEyLjAwIiByPSIxLjkiLz48cGF0aCBkPSJNMTYuNjAgMTIuMDBMMTguNjAgMTIuMDAiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjEuMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PGNpcmNsZSBjeD0iMTcuODAiIGN5PSIxNy44MCIgcj0iMS4zIi8+PHBhdGggZD0iTTE1LjI1IDE1LjI1TDE1Ljk2IDE1Ljk2IiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjxjaXJjbGUgY3g9IjEyLjAwIiBjeT0iMjEuMjAiIHI9IjEuOSIvPjxwYXRoIGQ9Ik0xMi4wMCAxNi42MEwxMi4wMCAxOC42MCIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMS4yIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48Y2lyY2xlIGN4PSI2LjIwIiBjeT0iMTcuODAiIHI9IjEuMyIvPjxwYXRoIGQ9Ik04Ljc1IDE1LjI1TDguMDQgMTUuOTYiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjEuMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PGNpcmNsZSBjeD0iMi44MCIgY3k9IjEyLjAwIiByPSIxLjkiLz48cGF0aCBkPSJNNy40MCAxMi4wMEw1LjQwIDEyLjAwIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjxjaXJjbGUgY3g9IjYuMjAiIGN5PSI2LjIwIiByPSIxLjMiLz48cGF0aCBkPSJNOC43NSA4Ljc1TDguMDQgOC4wNCIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMS4yIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48Y2lyY2xlIGN4PSIxMi4wMCIgY3k9IjIuODAiIHI9IjEuOSIvPjxwYXRoIGQ9Ik0xMi4wMCA3LjQwTDEyLjAwIDUuNDAiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjEuMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PGNpcmNsZSBjeD0iMTcuODAiIGN5PSI2LjIwIiByPSIxLjMiLz48cGF0aCBkPSJNMTUuMjUgOC43NUwxNS45NiA4LjA0IiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg==";
var URL_RE = /https?:\/\/[^\s<>"'）】]+/g;
function hash(text, salt) {
  let h = 2166136261 ^ (salt || 0);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
function clip(text, max) {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text;
}
function firstLine(text) {
  return text.split("\n").map((line) => line.replace(/^[#>*\-\s]+/, "").trim()).find(Boolean) || "";
}
function urlsOf(text) {
  return text.match(URL_RE) || [];
}
function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
function parseChild(content) {
  const text = content.trim();
  const icon = Object.keys(ICON_TO_TYPE).find((candidate) => text.startsWith(candidate));
  if (icon) {
    const body = text.slice(icon.length).replace(/^\s*(延伸选题|小红书帖子|深入研究|延伸|帖子|文稿|研究|笔记)\s*[｜|:：]\s*/, "").trim();
    return { type: ICON_TO_TYPE[icon], body };
  }
  return void 0;
}
var XHS_URL = /xiaohongshu\.com|xhslink\.com/i;
var XHS_BOILERPLATE = /复制(本条信息|后)[^\n]*?(查看[^\n！!]*[！!]?)|打开【小红书】App查看精彩内容[！!]?/g;
var POST_FIELD = /^(作者|博主|账号|点赞|赞|收藏|藏|评论|评|亮点|爆点|拆解|分析|为什么火|标签|话题)\s*[:：]/;
function noteIdOf(url) {
  return (url.match(/(?:explore|discovery\/item|notes?|item)\/([0-9a-f]{24})/i) || [])[1];
}
function parsePost(body) {
  const urls = urlsOf(body);
  const url = urls.find((candidate) => XHS_URL.test(candidate)) || urls[0] || "";
  let text = body.replace(XHS_BOILERPLATE, " ");
  let title = "";
  let author = "";
  const shared = text.match(/【(.+?)\s*[-–]\s*([^|【】]+?)\s*\|\s*小红书[^】]*】/);
  if (shared) {
    title = shared[1].trim();
    author = shared[2].trim();
    text = text.replace(/^\s*\d+\s*(?=【)/, "").replace(shared[0], " ").replace(/😆[^😆\n]*😆/g, " ");
  }
  const stat = (names) => (text.match(new RegExp(`(?:${names})\\s*[:：]?\\s*([\\d.]+\\s*[wWkK万千]?\\+?)`)) || [])[1]?.replace(/\s/g, "") || "";
  const likes = stat("点赞|赞");
  const collects = stat("收藏|藏");
  const comments = stat("评论|评");
  author = author || ((text.match(/(?:作者|博主|账号)\s*[:：]\s*@?([^｜|\n]+)/) || [])[1] || "").trim();
  const lines = text.split("\n").map((line) => line.trim());
  const why = [];
  const rest = [];
  let tags = [];
  let inWhy = false;
  for (const line of lines) {
    const bare = line.replace(URL_RE, "").trim();
    if (!bare) {
      inWhy = false;
      continue;
    }
    const whyMatch = bare.match(/^(?:亮点|爆点|拆解|分析|为什么火)\s*[:：]\s*(.*)$/);
    if (whyMatch) {
      inWhy = true;
      if (whyMatch[1]) why.push(whyMatch[1]);
    } else if (/^(?:标签|话题)\s*[:：]/.test(bare)) {
      inWhy = false;
      tags = bare.replace(/^(?:标签|话题)\s*[:：]/, "").split(/[\s,，、#]+/).filter(Boolean);
    } else if (POST_FIELD.test(bare)) {
      inWhy = false;
    } else if (inWhy) {
      why.push(bare);
    } else if (!title) {
      title = bare.replace(/^[#>*\-\s]+/, "");
    } else {
      rest.push(bare);
    }
  }
  if (!tags.length) tags = [...new Set((rest.join(" ").match(/#[^\s#]+/g) || []).map((tag) => tag.slice(1)))];
  return {
    url,
    noteId: url ? noteIdOf(url) : void 0,
    title,
    author,
    likes,
    collects,
    comments,
    why: why.join("\n"),
    tags: tags.slice(0, 12),
    rest: rest.join("\n")
  };
}
function childLabel(child) {
  if (child.type === "post") {
    const post = parsePost(child.body);
    if (post.title) return post.title;
    if (post.why) return firstLine(post.why);
  }
  const withoutUrls = child.body.replace(URL_RE, " ").trim();
  const line = firstLine(withoutUrls);
  if (line) return line;
  const url = urlsOf(child.body)[0];
  if (child.type === "post") return "小红书帖子";
  return url ? hostOf(url) : TYPES[child.type].label;
}
function buildGraph(events) {
  const byId = /* @__PURE__ */ new Map();
  for (const event of events) {
    if (event && event.kind === 9 && typeof event.content === "string" && !byId.has(event.id)) {
      byId.set(event.id, event);
    }
  }
  const topics = /* @__PURE__ */ new Map();
  const replies = [];
  const loose = [];
  const chat = (event, under) => loose.push({ id: event.id, author: event.pubkey, at: event.created_at, text: event.content.trim(), under });
  for (const event of byId.values()) {
    const refs = event.tags.filter((tag) => tag[0] === "e" && HEX64.test(tag[1] || ""));
    const isCopy = event.tags.some((tag) => tag[0] === "buzz:copy-of" || tag[0] === "buzz:sent-from-thread");
    if (!refs.length) {
      const raw = event.content.trim();
      if (!raw || isCopy) continue;
      if (!raw.startsWith(TOPIC_ICON)) {
        if (!/^(📌|🔗)/u.test(raw)) chat(event, void 0);
        continue;
      }
      const text = raw.slice(TOPIC_ICON.length).trim();
      if (!text) continue;
      const title = firstLine(text);
      const body = text.split("\n").slice(1).join("\n").trim();
      topics.set(event.id, {
        id: event.id,
        kind: "topic",
        title: title || "未命名选题",
        body: firstLine(text) === text.trim() ? "" : body,
        author: event.pubkey,
        at: event.created_at,
        pending: !!event.delivery && !["accepted", "seen"].includes(event.delivery),
        children: [],
        count: 0
      });
    } else {
      const parent = (refs.find((tag) => tag[3] === "reply") || refs[refs.length - 1])[1];
      const root = (refs.find((tag) => tag[3] === "root") || refs[0])[1];
      replies.push({ event, parent, root });
    }
  }
  const nodes = new Map(topics);
  const links = [];
  const pendingChildren = [];
  for (const { event, parent, root } of replies) {
    const text = event.content.trim();
    if (text.startsWith(LINK_ICON)) {
      const target = (text.match(/\b[0-9a-f]{64}\b/) || [])[0];
      const from = topics.has(root) ? root : topics.has(parent) ? parent : void 0;
      if (target && from && topics.has(target) && target !== from) {
        links.push({ id: event.id, a: from, b: target, author: event.pubkey });
      }
      continue;
    }
    if (!text) continue;
    const parsed = parseChild(text);
    if (!parsed) {
      chat(event, root);
      continue;
    }
    const child = {
      id: event.id,
      kind: "child",
      type: parsed.type,
      body: parsed.body,
      author: event.pubkey,
      at: event.created_at,
      pending: !!event.delivery && !["accepted", "seen"].includes(event.delivery),
      parent,
      root,
      topic: void 0,
      children: []
    };
    nodes.set(child.id, child);
    pendingChildren.push(child);
  }
  for (const child of pendingChildren) {
    const parent = nodes.get(child.parent) || topics.get(child.root);
    if (!parent || parent === child) {
      nodes.delete(child.id);
      continue;
    }
    child.parent = parent.id;
    parent.children.push(child);
  }
  const byTime = (a, b) => a.at - b.at || a.id.localeCompare(b.id);
  const stamp = (node, topicId) => {
    node.children.sort(byTime);
    let total = 0;
    for (const child of node.children) {
      child.topic = topicId;
      total += 1 + stamp(child, topicId);
    }
    return total;
  };
  for (const topic of topics.values()) topic.count = stamp(topic, topic.id);
  for (const [id, node] of nodes) if (node.kind === "child" && !node.topic) nodes.delete(id);
  const seen = /* @__PURE__ */ new Set();
  const uniqueLinks = links.filter((link) => {
    const key = [link.a, link.b].sort().join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    topics: [...topics.values()].sort((a, b) => a.id.localeCompare(b.id)),
    links: uniqueLinks,
    nodes,
    // Chat under a message that is not a topic is not about any topic.
    loose: loose.map((item) => ({ ...item, under: topics.has(item.under) ? item.under : void 0 })).sort((a, b) => b.at - a.at)
  };
}
var ink = (strength) => `color-mix(in srgb, var(--text-primary) ${strength}%, var(--bg-app, #17181b))`;
var topicColour = () => ink(78);
var topicRadius = (topic) => 26 + Math.min(52, Math.sqrt(topic.count) * 10);
var childRadius = (node) => 19 + Math.min(node.children.length, 6) * 2.2;
function dropPath(id, radius, time, buds = 0, swell = 0) {
  const steps = 32;
  const a = hash(id, 21) * 6.283;
  const b = hash(id, 22) * 6.283;
  const c = hash(id, 23) * 6.283;
  const fast = 0.55 + hash(id, 24) * 0.35;
  const slow = 0.32 + hash(id, 25) * 0.3;
  const xs = [];
  const ys = [];
  for (let i = 0; i < steps; i++) {
    const angle = i / steps * 6.283185;
    const wave = 1 + 0.075 * Math.sin(2 * angle + a + time * fast) + 0.05 * Math.sin(3 * angle + b - time * slow) + 0.03 * Math.sin(angle + c + time * 0.4) + (buds ? swell * 0.17 * (0.5 + 0.5 * Math.cos(buds * (angle + Math.PI / 2))) ** 2 : 0);
    xs.push(Math.cos(angle) * radius * wave);
    ys.push(Math.sin(angle) * radius * wave);
  }
  const mid = (i) => `${((xs[i] + xs[(i + 1) % steps]) / 2).toFixed(1)} ${((ys[i] + ys[(i + 1) % steps]) / 2).toFixed(1)}`;
  let path = `M${mid(steps - 1)}`;
  for (let i = 0; i < steps; i++) path += `Q${xs[i].toFixed(1)} ${ys[i].toFixed(1)} ${mid(i)}`;
  return `${path}Z`;
}
function layoutTopics(topics, links) {
  const n = topics.length;
  const spread = 95 * Math.sqrt(n) + 40;
  const points = topics.map((topic) => {
    const angle = hash(topic.id, 1) * Math.PI * 2;
    const distance = spread * Math.sqrt(hash(topic.id, 2));
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * 0.72 };
  });
  const index = new Map(topics.map((topic, i) => [topic.id, i]));
  const pairs = links.map((link) => [index.get(link.a), index.get(link.b)]).filter(([a, b]) => a >= 0 && b >= 0);
  const radii = topics.map(topicRadius);
  const iterations = n > 250 ? 30 : 70;
  for (let step = 0; step < iterations; step++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = points[j].x - points[i].x;
        let dy = points[j].y - points[i].y;
        let distance = Math.hypot(dx, dy);
        const minGap = radii[i] + radii[j] + 104;
        if (distance >= minGap) continue;
        if (distance < 0.01) {
          dx = hash(topics[i].id, 3) - 0.5;
          dy = hash(topics[j].id, 4) - 0.5;
          distance = Math.hypot(dx, dy) || 1;
        }
        const push = (minGap - distance) / 2 / distance;
        points[i].x -= dx * push;
        points[i].y -= dy * push;
        points[j].x += dx * push;
        points[j].y += dy * push;
      }
    }
    for (const [a, b] of pairs) {
      const dx = points[b].x - points[a].x;
      const dy = points[b].y - points[a].y;
      const distance = Math.hypot(dx, dy);
      if (distance < 250) continue;
      const pull = (distance - 250) / distance * 0.04;
      points[a].x += dx * pull;
      points[a].y += dy * pull;
      points[b].x -= dx * pull;
      points[b].y -= dy * pull;
    }
  }
  const layout = /* @__PURE__ */ new Map();
  topics.forEach((topic, i) => layout.set(topic.id, points[i]));
  return layout;
}
function burstLayout(topic, expanded) {
  const offsets = /* @__PURE__ */ new Map();
  const first = topic.children.length;
  if (!first) return { offsets, radius: 0 };
  const dense = first > 8;
  const base = Math.max(topicRadius(topic) + 118, first * (dense ? 78 : 132) / (Math.PI * 2));
  let radius = base;
  const fan = (node, x, y, angle, depth) => {
    if (!node.children.length || !expanded.has(node.id)) return;
    const count = node.children.length;
    const reach = Math.max(132, count * 120 / Math.PI);
    const spread = count === 1 ? 0 : Math.min(Math.PI * 1.15, count * 0.62);
    node.children.forEach((child, i) => {
      const turn = count === 1 ? angle : angle - spread / 2 + spread * i / (count - 1);
      const dx = x + Math.cos(turn) * reach;
      const dy = y + Math.sin(turn) * reach;
      offsets.set(child.id, { dx, dy, parent: node.id, depth });
      radius = Math.max(radius, Math.hypot(dx, dy));
      fan(child, dx, dy, turn, depth + 1);
    });
  };
  topic.children.forEach((node, i) => {
    const angle = -Math.PI / 2 + Math.PI * 2 * i / first;
    const distance = base + (dense && i % 2 ? 92 : 0);
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    offsets.set(node.id, { dx, dy, parent: topic.id, depth: 1 });
    radius = Math.max(radius, distance);
    fan(node, dx, dy, angle, 2);
  });
  return { offsets, radius };
}
function formatTime(seconds) {
  const date = new Date(seconds * 1e3);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function loadChoice(scope) {
  try {
    return localStorage.getItem(`opcb.xhs-topic-burst:channel:${scope}`) || "";
  } catch {
    return "";
  }
}
function saveChoice(scope, channelId) {
  try {
    localStorage.setItem(`opcb.xhs-topic-burst:channel:${scope}`, channelId);
  } catch {
  }
}
var STYLE = `
.xtb-goo{position:absolute;inset:0;pointer-events:none;filter:url(#xtb-goo)}
.xtb-drop{position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;transition:transform .45s cubic-bezier(.34,1.56,.64,1)}
.xtb-drop path{transition:fill .35s ease}
.xtb-born{animation:xtb-split .55s cubic-bezier(.34,1.56,.64,1) backwards}
.xtb-face{transition:transform .28s cubic-bezier(.34,1.56,.64,1)}
.xtb-topic:active .xtb-face,.xtb-pill:active .xtb-face{transform:scale(.9)}
@keyframes xtb-split{from{transform:scale(.1);opacity:0}}
.xtb-topic:focus-visible,.xtb-pill:focus-visible{outline:2px solid var(--text-primary);outline-offset:4px}
@keyframes xtb-pulse{0%{transform:scale(1);opacity:.55}100%{transform:scale(2.6);opacity:0}}
@media (prefers-reduced-motion: reduce){.xtb-ring{animation:none!important;display:none}.xtb-born{animation:none!important}}
.xtb-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;padding:0 10px;box-sizing:border-box;border-radius:6px;border:1px solid transparent;background:transparent;color:var(--text-secondary);font:inherit;font-size:13px;font-weight:500;line-height:1;white-space:nowrap;cursor:pointer;flex-shrink:0;transition:background .12s ease,color .12s ease,border-color .12s ease,opacity .12s ease,transform .06s ease}
.xtb-btn:hover{background:var(--surface-hover);color:var(--text-primary)}
.xtb-btn:active{transform:scale(.97)}
.xtb-btn:focus-visible{outline:2px solid var(--text-primary);outline-offset:1px}
.xtb-btn:disabled{opacity:.35;pointer-events:none}
.xtb-btn[data-small]{height:24px;padding:0 8px;font-size:12px}
.xtb-btn[data-icon]{width:28px;padding:0}
.xtb-btn[data-icon][data-small]{width:24px}
.xtb-btn[data-on]{background:var(--surface-hover);color:var(--text-primary)}
.xtb-btn[data-v=outline]{border-color:var(--border);color:var(--text-primary)}
.xtb-btn[data-v=primary]{background:var(--text-primary);color:var(--surface-panel)}
.xtb-btn[data-v=primary]:hover{background:var(--text-primary);color:var(--surface-panel);opacity:.86}
.xtb-btn[data-v=danger]:hover{color:var(--text-warning,#c2410c)}
.xtb-field{display:flex;flex-direction:column;box-sizing:border-box;border:1px solid var(--border);border-radius:8px;background:var(--surface-input,transparent);transition:border-color .12s ease,box-shadow .12s ease}
.xtb-field:hover{border-color:color-mix(in srgb,var(--text-secondary) 40%,var(--border))}
.xtb-field:focus-within{border-color:var(--text-secondary);box-shadow:0 0 0 3px color-mix(in srgb,var(--text-primary) 9%,transparent)}
.xtb-field[data-inline]{flex:0 1 260px;min-width:0;flex-direction:row;align-items:center;gap:6px;height:32px;padding:0 4px 0 9px;transition:border-color .12s ease,box-shadow .12s ease,flex-basis .2s ease}
.xtb-field[data-inline]:focus-within{flex-basis:440px}
.xtb-field[data-over]{border-style:dashed;border-color:var(--text-secondary);background:var(--surface-hover)}
@media (prefers-reduced-motion: reduce){.xtb-field[data-inline]{transition:none}}
.xtb-field input,.xtb-field textarea{flex:1;min-width:0;width:100%;box-sizing:border-box;margin:0;border:none;outline:none;background:transparent;color:var(--text-primary);font:inherit;font-size:14px}
.xtb-field textarea{display:block;resize:none;padding:12px 14px 4px;font-size:15px;line-height:1.7;scrollbar-width:thin}
.xtb-field ::placeholder{color:var(--text-tertiary)}
.xtb-grip{height:10px;margin-top:-2px;display:grid;place-items:center;cursor:ns-resize;touch-action:none;outline:none}
.xtb-grip::after{content:"";width:24px;height:3px;border-radius:2px;background:var(--border);opacity:0;transition:background .12s ease,width .12s ease,opacity .12s ease}
.xtb-field:hover .xtb-grip::after,.xtb-field:focus-within .xtb-grip::after{opacity:1}
.xtb-grip:hover::after,.xtb-grip:focus-visible::after,.xtb-grip[data-drag=true]::after{width:40px;background:var(--text-secondary)}
.xtb-select{appearance:none;-webkit-appearance:none;height:28px;max-width:170px;padding:0 8px;border-radius:6px;border:1px solid transparent;background:transparent;color:var(--text-secondary);font:inherit;font-size:13px;cursor:pointer;text-overflow:ellipsis;transition:background .12s ease,color .12s ease}
.xtb-select:hover{background:var(--surface-hover);color:var(--text-primary)}
.xtb-select:focus-visible{outline:2px solid var(--text-primary);outline-offset:1px}
.xtb-row{display:flex;align-items:center;gap:2px;min-height:32px;margin:0 -8px;padding:0 4px 0 0;border-radius:6px;transition:background .12s ease}
.xtb-row:hover,.xtb-row:focus-within{background:var(--surface-hover)}
.xtb-row[data-pending]{border:1px dashed var(--border);background:transparent}
.xtb-rowmain{flex:1;min-width:0;display:flex;align-items:center;gap:10px;height:32px;padding:0 8px;border:none;border-radius:6px;background:transparent;color:var(--text-primary);font:inherit;font-size:14px;text-align:left;cursor:pointer}
.xtb-rowmain:focus-visible{outline:2px solid var(--text-primary);outline-offset:-2px}
.xtb-card{display:flex;flex-direction:column;gap:4px;padding:8px 12px 10px;border-radius:8px;transition:background .12s ease}
.xtb-card:hover,.xtb-card:focus-within,.xtb-card[data-on=true]{background:var(--surface-hover)}
.xtb-acts{opacity:0;transition:opacity .12s ease}
.xtb-row:hover .xtb-acts,.xtb-row:focus-within .xtb-acts,.xtb-card:hover .xtb-acts,.xtb-card:focus-within .xtb-acts{opacity:1}
@media (hover:none){.xtb-acts{opacity:1}}
.xtb-label{font-size:12px;font-weight:600;color:var(--text-secondary)}
.xtb-count{font-size:12px;color:var(--text-tertiary);font-variant-numeric:tabular-nums}
.xtb-scroll{scrollbar-width:thin}
`;
function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const { useState, useEffect, useRef, useMemo, useCallback } = React;
  function useStore(subscribe, read) {
    const [, tick] = useState(0);
    useEffect(() => {
      let alive = true;
      const unsubscribe = subscribe(() => {
        if (alive) tick((value) => value + 1);
      });
      tick((value) => value + 1);
      return () => {
        alive = false;
        if (typeof unsubscribe === "function") unsubscribe();
      };
    }, [subscribe]);
    return read();
  }
  function useObserved(session, key, filters, refreshRef) {
    const [state, setState] = useState({ status: "idle", events: [] });
    useEffect(() => {
      if (!filters) {
        setState({ status: "idle", events: [] });
        return void 0;
      }
      let view;
      try {
        view = session.observe(filters);
      } catch (error) {
        setState((previous) => ({ status: "error", events: previous.events, error: String(error) }));
        return void 0;
      }
      const update = () => {
        const next = view.snapshot();
        setState(
          (previous) => next.status === "ready" || next.events.length >= previous.events.length ? next : { ...next, events: previous.events }
        );
      };
      const unsubscribe = view.subscribe(update);
      update();
      const refresh = () => Promise.resolve(view.refresh()).catch(() => {
      });
      refresh();
      if (refreshRef) refreshRef.current = refresh;
      return () => {
        unsubscribe();
        view.dispose();
      };
    }, [session, key]);
    return state;
  }
  const ICONS = {
    plus: "M12 5v14M5 12h14",
    x: "M6 6l12 12M18 6L6 18",
    link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
    trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5",
    refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
    clip: "M21 12.5l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l8.8-8.8a3.7 3.7 0 0 1 5.2 5.2l-8.7 8.7a1.8 1.8 0 0 1-2.6-2.6l8-8",
    deeper: "M6 5v7a4 4 0 0 0 4 4h9M15 12l4 4-4 4",
    out: "M8 16L17 7M9 7h8v8",
    expand: "M15 4h5v5M9 20H4v-5M20 4l-6 6M4 20l6-6",
    collapse: "M20 10h-6V4M4 14h6v6M14 10l6-6M10 14l-6 6"
  };
  function Icon({ name, size = 16 }) {
    return h(
      "svg",
      { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { flexShrink: 0 } },
      h("path", { d: ICONS[name] })
    );
  }
  function Button({ variant, on, icon, label, small, children, type = "button", ...rest }) {
    const bare = icon && children === void 0;
    return h(
      "button",
      {
        type,
        className: "xtb-btn",
        "data-v": variant,
        "data-on": on ? true : void 0,
        "data-icon": bare ? true : void 0,
        "data-small": small ? true : void 0,
        "aria-label": label,
        title: label,
        ...rest
      },
      icon ? h(Icon, { name: icon, size: small ? 14 : 16 }) : null,
      children
    );
  }
  const mutedStyle = { color: "var(--text-secondary)", fontSize: 13, margin: 0 };
  function Message({ title, children }) {
    return h(
      "div",
      { style: { height: "100%", display: "grid", placeItems: "center", padding: "var(--space-panel-inset)" } },
      h(
        "section",
        { className: "ui-card", style: { padding: "var(--space-panel-inset)", maxWidth: 460, width: "100%" } },
        h("h2", { style: { marginTop: 0 } }, title),
        children
      )
    );
  }
  const people = { name: (pubkey) => `${pubkey.slice(0, 6)}…`, avatar: () => void 0, person: (pubkey) => pubkey };
  function Author({ pubkey, size = 18, after, style }) {
    const person = people.person(pubkey);
    const name = people.name(person);
    const source = people.avatar(person);
    const hint = person === pubkey ? name : `${name}（由 ${people.name(pubkey)} 代填）`;
    const [broken, setBroken] = useState(null);
    const disc = { width: size, height: size, borderRadius: "50%", flexShrink: 0 };
    return h(
      "span",
      { className: "xtb-author", title: hint, style: { display: "inline-flex", alignItems: "center", gap: Math.round(size / 3), minWidth: 0, ...style } },
      source && source !== broken ? h("img", { src: source, alt: "", draggable: false, onError: () => setBroken(source), style: { ...disc, objectFit: "cover", background: "var(--border)" } }) : h(
        "span",
        {
          "aria-hidden": true,
          style: {
            ...disc,
            display: "grid",
            placeItems: "center",
            background: ink(34),
            color: "var(--text-primary)",
            fontSize: Math.round(size * 0.56),
            fontWeight: 600,
            lineHeight: 1
          }
        },
        [...name.trim()][0] || "?"
      ),
      h("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, name),
      after ? h("span", { style: { flexShrink: 0, color: "var(--text-tertiary)" } }, after) : null
    );
  }
  function Linked({ text, style }) {
    const parts = [];
    let last = 0;
    for (const match of text.matchAll(URL_RE)) {
      if (match.index > last) parts.push(text.slice(last, match.index));
      parts.push(
        h(
          "a",
          {
            key: match.index,
            href: match[0],
            target: "_blank",
            rel: "noreferrer",
            style: { color: "var(--link-text)", textDecoration: "underline", wordBreak: "break-all" }
          },
          match[0]
        )
      );
      last = match.index + match[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return h(
      "div",
      { style: { whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 15, lineHeight: 1.75, color: "var(--text-primary)", ...style } },
      parts
    );
  }
  function Canvas({ graph, active, peek, pinned, selected, linking, onHover, onPick, onChild, onBackground }) {
    const rootRef = useRef(null);
    const elements = useRef(/* @__PURE__ */ new Map());
    const shapes = useRef(/* @__PURE__ */ new Map());
    const outlines = useRef(/* @__PURE__ */ new Map());
    const swells = useRef(/* @__PURE__ */ new Map());
    const lines = useRef(/* @__PURE__ */ new Map());
    const positions = useRef(/* @__PURE__ */ new Map());
    const view = useRef({ panX: 0, panY: 0, k: 1, width: 0, height: 0, fitted: 0 });
    const drag = useRef(null);
    const live = useRef({});
    const layout = useMemo(() => layoutTopics(graph.topics, graph.links), [graph]);
    const activeTopic = active ? graph.nodes.get(active) : void 0;
    const [expanded, setExpanded] = useState(() => /* @__PURE__ */ new Set());
    useEffect(() => setExpanded(/* @__PURE__ */ new Set()), [active]);
    useEffect(() => {
      const chain = [];
      for (let node = selected && graph.nodes.get(selected); node && node.kind === "child"; node = graph.nodes.get(node.parent)) {
        const parent = graph.nodes.get(node.parent);
        if (parent && parent.kind === "child") chain.push(parent.id);
      }
      if (chain.length) setExpanded((current) => chain.every((id) => current.has(id)) ? current : /* @__PURE__ */ new Set([...current, ...chain]));
    }, [selected, graph]);
    const peekTopic = !activeTopic && peek ? graph.nodes.get(peek) : void 0;
    const burst = useMemo(
      () => activeTopic && activeTopic.kind === "topic" ? burstLayout(activeTopic, expanded) : { offsets: /* @__PURE__ */ new Map(), radius: 0 },
      [activeTopic, expanded]
    );
    const budding = false;
    const split = (node) => {
      if (node.children.length) {
        setExpanded((current) => {
          const next = new Set(current);
          if (next.has(node.id)) {
            const fold = (item) => {
              next.delete(item.id);
              item.children.forEach(fold);
            };
            fold(node);
          } else next.add(node.id);
          return next;
        });
      }
      onChild(node);
    };
    const neighbours = useMemo(() => {
      const set = /* @__PURE__ */ new Set();
      for (const link of graph.links) {
        if (link.a === active) set.add(link.b);
        if (link.b === active) set.add(link.a);
      }
      return set;
    }, [graph, active]);
    const burstNodes = useMemo(() => [...burst.offsets.keys()].map((id) => graph.nodes.get(id)).filter(Boolean), [burst, graph]);
    live.current = { graph, layout, active, origin: active, peek: peekTopic ? peek : null, pinned, burst, neighbours, selected, onHover };
    useEffect(() => {
      const state = view.current;
      const spot = active ? layout.get(active) : void 0;
      if (!spot || !state.width) {
        state.goal = void 0;
        return;
      }
      const room = Math.min(state.width, state.height) / 2 - 56;
      const k = Math.max(0.42, Math.min(state.k, 1, room / (burst.radius + 70)));
      state.goal = { k, panX: -spot.x * k, panY: -spot.y * k };
    }, [active, burst, layout]);
    const fit = useCallback(() => {
      const state = view.current;
      if (!state.width || !layout.size) return;
      let extent = 120;
      for (const point of layout.values()) extent = Math.max(extent, Math.abs(point.x) + 110, (Math.abs(point.y) + 110) * (state.width / Math.max(state.height, 1)));
      state.k = Math.max(0.4, Math.min(1, state.width / 2 / extent));
      state.panX = 0;
      state.panY = 0;
    }, [layout]);
    useEffect(() => {
      const state = view.current;
      const count = layout.size;
      if (count && (!state.fitted || Math.abs(count - state.fitted) >= Math.max(3, state.fitted * 0.3))) {
        fit();
        state.fitted = count;
      }
    }, [layout, fit]);
    useEffect(() => {
      const root = rootRef.current;
      if (!root) return void 0;
      const measure = () => {
        const rect = root.getBoundingClientRect();
        const first = !view.current.width;
        view.current.width = rect.width;
        view.current.height = rect.height;
        if (first) {
          fit();
          view.current.fitted = live.current.layout.size;
        }
      };
      measure();
      const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : void 0;
      observer?.observe(root);
      const onWheel = (event) => {
        event.preventDefault();
        const state = view.current;
        const rect = root.getBoundingClientRect();
        const px = event.clientX - rect.left - state.width / 2 - state.panX;
        const py = event.clientY - rect.top - state.height / 2 - state.panY;
        state.goal = void 0;
        const next = Math.max(0.3, Math.min(1.8, state.k * Math.exp(-event.deltaY * 15e-4)));
        state.panX -= px / state.k * (next - state.k);
        state.panY -= py / state.k * (next - state.k);
        state.k = next;
      };
      root.addEventListener("wheel", onWheel, { passive: false });
      return () => {
        observer?.disconnect();
        root.removeEventListener("wheel", onWheel);
      };
    }, []);
    useEffect(() => {
      const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      let frame = 0;
      const step = (now) => {
        frame = requestAnimationFrame(step);
        const { graph: g, layout: spots, active: focus, burst: tree, neighbours: near, selected: chosen } = live.current;
        const state = view.current;
        const time = still ? 0 : now / 1e3;
        const ease = still ? 1 : 0.16;
        const store = positions.current;
        if (state.goal) {
          const goal = state.goal;
          state.k += (goal.k - state.k) * ease;
          state.panX += (goal.panX - state.panX) * ease;
          state.panY += (goal.panY - state.panY) * ease;
          if (Math.abs(goal.k - state.k) < 2e-3 && Math.hypot(goal.panX - state.panX, goal.panY - state.panY) < 0.5) state.goal = void 0;
        }
        const originX = state.width / 2 + state.panX;
        const originY = state.height / 2 + state.panY;
        const scale = Math.max(0.62, Math.min(1.15, state.k));
        const centre = focus ? spots.get(focus) : void 0;
        const keep = /* @__PURE__ */ new Set();
        for (const topic of g.topics) {
          const spot = spots.get(topic.id);
          if (!spot) continue;
          let targetX = spot.x + Math.sin(time * (0.25 + hash(topic.id, 5) * 0.3) + hash(topic.id, 6) * 6.28) * 7;
          let targetY = spot.y + Math.cos(time * (0.22 + hash(topic.id, 7) * 0.3) + hash(topic.id, 8) * 6.28) * 7;
          if (centre && topic.id !== focus && tree.radius) {
            const dx = spot.x - centre.x;
            const dy = spot.y - centre.y;
            const distance = Math.hypot(dx, dy) || 1;
            const clear = tree.radius + 110;
            const shove = clear * Math.exp(-distance / clear);
            targetX += dx / distance * shove;
            targetY += dy / distance * shove;
          }
          if (topic.id === focus) {
            targetX = spot.x;
            targetY = spot.y;
          }
          let point = store.get(topic.id);
          if (!point) store.set(topic.id, point = { x: targetX, y: targetY });
          point.x += (targetX - point.x) * ease;
          point.y += (targetY - point.y) * ease;
          keep.add(topic.id);
          const element = elements.current.get(topic.id);
          if (element) {
            element.style.transform = `translate(${originX + point.x * state.k}px,${originY + point.y * state.k}px) scale(${scale})`;
            const shape = shapes.current.get(topic.id);
            if (shape) shape.style.transform = element.style.transform;
            element.style.opacity = topic.pending ? "0.5" : !focus || topic.id === focus ? "1" : near.has(topic.id) ? "0.85" : "0.38";
            element.style.zIndex = topic.id === focus ? "3" : "1";
          }
        }
        const home = live.current.origin ? store.get(live.current.origin) : void 0;
        if (home) {
          for (const [id, offset] of tree.offsets) {
            const from = store.get(offset.parent) || home;
            let point = store.get(id);
            if (!point) store.set(id, point = { x: from.x, y: from.y });
            point.x += (home.x + offset.dx - point.x) * ease;
            point.y += (home.y + offset.dy - point.y) * ease;
            keep.add(id);
            const element = elements.current.get(id);
            if (element) {
              element.style.transform = `translate(${originX + point.x * state.k}px,${originY + point.y * state.k}px) scale(${scale})`;
              const shape = shapes.current.get(id);
              if (shape) shape.style.transform = element.style.transform;
              element.style.opacity = g.nodes.get(id)?.pending ? "0.55" : "1";
              element.style.zIndex = id === chosen ? "5" : "4";
            }
          }
        }
        for (const id of store.keys()) if (!keep.has(id)) store.delete(id);
        const leaning = live.current.peek;
        for (const [id, outline] of outlines.current) {
          const want = id === leaning ? 1 : 0;
          const was = swells.current.get(id) || 0;
          const swell = Math.abs(want - was) < 4e-3 ? want : was + (want - was) * (still ? 1 : 0.12);
          if (swell) swells.current.set(id, swell);
          else swells.current.delete(id);
          if (!still || swell !== was) outline.element.setAttribute("d", dropPath(id, outline.radius, time, outline.buds, swell));
        }
        for (const [key, line] of lines.current) {
          const [a, b] = key.split("|");
          const from = store.get(a);
          const to = store.get(b);
          if (!from || !to) {
            line.style.opacity = "0";
            continue;
          }
          line.setAttribute("x1", originX + from.x * state.k);
          line.setAttribute("y1", originY + from.y * state.k);
          line.setAttribute("x2", originX + to.x * state.k);
          line.setAttribute("y2", originY + to.y * state.k);
          line.style.opacity = "";
        }
      };
      frame = requestAnimationFrame(step);
      return () => cancelAnimationFrame(frame);
    }, []);
    const attach = (map, key) => (element) => {
      if (element) map.current.set(key, element);
      else map.current.delete(key);
    };
    const onPointerDown = (event) => {
      if (event.button !== 0 || event.target.closest("[data-node]")) return;
      view.current.goal = void 0;
      drag.current = { x: event.clientX, y: event.clientY, panX: view.current.panX, panY: view.current.panY, moved: false };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event) => {
      const state = view.current;
      if (drag.current) {
        const dx = event.clientX - drag.current.x;
        const dy = event.clientY - drag.current.y;
        if (Math.hypot(dx, dy) > 4) drag.current.moved = true;
        state.panX = drag.current.panX + dx;
        state.panY = drag.current.panY + dy;
        return;
      }
      const current = live.current;
      if (!current.active || current.pinned) return;
      const home = positions.current.get(current.active);
      const root = rootRef.current;
      if (!home || !root) return;
      const rect = root.getBoundingClientRect();
      const x = (event.clientX - rect.left - state.width / 2 - state.panX) / state.k;
      const y = (event.clientY - rect.top - state.height / 2 - state.panY) / state.k;
      if (Math.hypot(x - home.x, y - home.y) > current.burst.radius + 150) current.onHover(null);
    };
    const onPointerUp = (event) => {
      const moved = drag.current?.moved;
      const wasDrag = !!drag.current;
      drag.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      if (wasDrag && !moved) onBackground();
    };
    const linkLines = graph.links.map(
      (link) => h("line", {
        key: `l:${link.id}`,
        ref: attach(lines, `${link.a}|${link.b}`),
        stroke: "var(--text-tertiary)",
        strokeWidth: link.a === active || link.b === active ? 2 : 1.2,
        strokeDasharray: "5 6",
        strokeOpacity: !active || link.a === active || link.b === active ? 0.75 : 0.25
      })
    );
    const treeLines = (budding ? [] : burstNodes).map(
      (node) => h("line", {
        key: `t:${node.id}`,
        ref: attach(lines, `${burst.offsets.get(node.id).parent}|${node.id}`),
        stroke: "var(--text-tertiary)",
        strokeWidth: 1,
        strokeOpacity: 0.5
      })
    );
    const anchor = { position: "absolute", left: 0, top: 0, width: 0, height: 0, willChange: "transform" };
    const drop = (id, radius, fill, grow, buds = 0) => h(
      "svg",
      { className: "xtb-drop", style: { transform: `scale(${grow})` } },
      h("path", {
        ref: (element) => {
          if (element) outlines.current.set(id, { element, radius, buds });
          else outlines.current.delete(id);
        },
        d: dropPath(id, radius, 0),
        style: { fill }
      })
    );
    const topicInk = (topic) => topic.pending ? 34 : !active ? topic.id === peek ? 90 : 74 : topic.id === active ? 92 : neighbours.has(topic.id) ? 50 : 24;
    const topicShapes = graph.topics.map(
      (topic) => h(
        "div",
        { key: topic.id, ref: attach(shapes, topic.id), style: anchor },
        drop(topic.id, topicRadius(topic), ink(topicInk(topic)), topic.id === peek && !active ? 1.04 : 1, Math.min(topic.children.length, 9))
      )
    );
    const childShapes = burstNodes.map(
      (node) => h(
        "div",
        { key: node.id, ref: attach(shapes, node.id), style: anchor },
        h("div", { className: "xtb-born" }, drop(node.id, childRadius(node), ink(node.pending ? 30 : node.id === selected ? 92 : 58), budding ? 0.5 : 1))
      )
    );
    const caption = (text, top, width, strong, owner) => h(
      "div",
      { style: { position: "absolute", top, left: -width / 2, width, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 5 } },
      captionText(text, width, strong),
      owner ? h(Author, { pubkey: owner, size: 16, style: { maxWidth: width, fontSize: 12, color: "var(--text-secondary)" } }) : null
    );
    const captionText = (text, width, strong) => h(
      "div",
      {
        style: {
          width,
          textAlign: "center",
          fontSize: strong ? 15 : width < 150 ? 12.5 : 14,
          lineHeight: 1.35,
          fontWeight: strong ? 700 : width < 150 ? 500 : 600,
          color: "var(--text-primary)",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          wordBreak: "break-word"
        }
      },
      text
    );
    const shell = (radius, cursor) => ({
      position: "absolute",
      left: -radius,
      top: -radius,
      width: radius * 2,
      height: radius * 2,
      padding: 0,
      border: "none",
      background: "transparent",
      borderRadius: "50%",
      font: "inherit",
      cursor
    });
    const face = { position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--bg-app, #17181b)", fontWeight: 700 };
    const topicNodes = graph.topics.map((topic) => {
      const radius = topicRadius(topic);
      const isActive = topic.id === active;
      return h(
        "div",
        {
          key: topic.id,
          ref: attach(elements, topic.id),
          style: { position: "absolute", left: 0, top: 0, width: 0, height: 0, opacity: 0, willChange: "transform" }
        },
        h(
          "button",
          {
            type: "button",
            className: "xtb-topic",
            "data-node": "topic",
            "aria-label": `选题：${topic.title}，${topic.count} 条相关内容`,
            "aria-expanded": isActive,
            title: topic.title,
            onMouseEnter: () => onHover(topic.id),
            onMouseLeave: () => onHover(null),
            onFocus: () => onHover(topic.id),
            onBlur: () => onHover(null),
            onClick: () => onPick(topic.id),
            style: shell(radius, linking && topic.id !== pinned ? "crosshair" : "pointer")
          },
          h("span", { className: "xtb-face", style: { ...face, fontSize: Math.round(12 + radius * 0.12) } }, topic.count || "·")
        ),
        caption(topic.title, radius + 12, 172, isActive, isActive ? topic.author : void 0)
      );
    });
    const childNodes = burstNodes.map((node) => {
      const type = TYPES[node.type];
      const label = childLabel(node);
      const radius = childRadius(node);
      const open = expanded.has(node.id);
      const more = node.children.length;
      return h(
        "div",
        {
          key: node.id,
          ref: attach(elements, node.id),
          style: { position: "absolute", left: 0, top: 0, width: 0, height: 0, opacity: 0, willChange: "transform" }
        },
        h(
          "button",
          {
            type: "button",
            className: "xtb-pill xtb-born",
            "data-node": "child",
            "aria-label": `${type.label}：${clip(label, 120)}${more ? `，${open ? "已分裂" : "可分裂"} ${more} 条` : ""}`,
            "aria-expanded": more ? open : void 0,
            title: `${type.label}：${clip(label, 120)}`,
            onClick: () => split(node),
            tabIndex: budding ? -1 : void 0,
            "aria-hidden": budding || void 0,
            style: {
              ...shell(radius, "pointer"),
              // A bud is not a target yet: the pointer stays on the topic it grows from.
              pointerEvents: budding ? "none" : void 0,
              transform: budding ? "scale(.42)" : "scale(1)",
              transition: "transform .45s cubic-bezier(.34,1.56,.64,1)"
            }
          },
          h(
            "span",
            { style: { position: "absolute", inset: 0 } },
            h("span", { className: "xtb-face", "aria-hidden": true, style: { ...face, fontSize: Math.round(radius * 0.7), filter: "grayscale(1)", opacity: budding ? 0 : 1 } }, type.icon),
            more && !open && !budding ? h(
              "span",
              {
                "aria-hidden": true,
                style: {
                  position: "absolute",
                  right: -6,
                  top: -6,
                  minWidth: 18,
                  height: 18,
                  padding: "0 4px",
                  boxSizing: "border-box",
                  borderRadius: 9,
                  background: "var(--surface-panel)",
                  border: "1px solid var(--text-primary)",
                  color: "var(--text-primary)",
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: "16px",
                  textAlign: "center"
                }
              },
              more
            ) : null
          )
        ),
        budding ? null : caption(label, radius + 8, 124, false, node.id === selected ? node.author : void 0)
      );
    });
    return h(
      "div",
      {
        ref: rootRef,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: onPointerUp,
        style: {
          position: "relative",
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
          touchAction: "none",
          cursor: linking ? "crosshair" : "grab",
          userSelect: "none",
          backgroundImage: "radial-gradient(color-mix(in srgb, var(--text-tertiary) 22%, transparent) 1px, transparent 1px)",
          backgroundSize: "22px 22px"
        }
      },
      h(
        "svg",
        { style: { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }, "aria-hidden": true },
        // Blur, then cut the alpha back hard: shapes that come close pull into one another like liquid.
        h(
          "defs",
          null,
          h(
            "filter",
            { id: "xtb-goo", x: "-10%", y: "-10%", width: "120%", height: "120%", colorInterpolationFilters: "sRGB" },
            h("feGaussianBlur", { in: "SourceGraphic", stdDeviation: 9, result: "soft" }),
            h("feColorMatrix", { in: "soft", mode: "matrix", values: "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -11" })
          )
        ),
        linkLines,
        treeLines
      ),
      h("div", { className: "xtb-goo", "aria-hidden": true }, topicShapes, childShapes),
      topicNodes,
      childNodes
    );
  }
  function Composer({ topic, target, onTarget, onSend, onDone }) {
    const [type, setType] = useState("extend");
    const [text, setText] = useState("");
    const [problem, setProblem] = useState("");
    const [manual, setManual] = useState(null);
    const [dragging, setDragging] = useState(false);
    const [guessing, setGuessing] = useState(true);
    const [over, setOver] = useState(false);
    const guess = (value) => XHS_URL.test(value) ? "post" : value.length > 280 || (value.match(/\n\s*\n/g) || []).length >= 2 ? "draft" : "extend";
    const write = (value) => {
      setText(value);
      if (guessing) setType(guess(value));
    };
    const fileRef = useRef(null);
    const areaRef = useRef(null);
    const grab = useRef(null);
    const MIN = 76;
    useEffect(() => {
      const area = areaRef.current;
      if (!area) return;
      if (manual !== null) {
        area.style.height = `${manual}px`;
        return;
      }
      area.style.height = "auto";
      const limit = Math.max(MIN, Math.round((window.innerHeight || 800) * 0.4));
      area.style.height = `${Math.max(MIN, Math.min(area.scrollHeight, limit))}px`;
    }, [text, manual]);
    const placeholders = {
      extend: "还能延伸出什么角度",
      post: "粘贴小红书链接，或 App 里复制的分享文字",
      draft: "粘贴文稿，第一行作为标题",
      research: "发现、数据、参考资料",
      note: "随手记一句"
    };
    const submit = () => {
      const body = text.trim();
      if (!body) return;
      if (body.length > MAX_TEXT) {
        setProblem(`内容 ${body.length} 字，超过上限 ${MAX_TEXT} 字`);
        return;
      }
      if (onSend(type, body, target ? target.id : topic.id)) {
        setText("");
        setProblem("");
        onDone();
      }
    };
    const readFile = (file) => {
      if (!file) return;
      if (!/\.(txt|md|markdown)$/i.test(file.name) && !file.type.startsWith("text/")) {
        setProblem("只支持 txt / md 文稿");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setGuessing(false);
        setType("draft");
        setText(`${file.name.replace(/\.[^.]+$/, "")}

${String(reader.result || "").trim()}`);
        setProblem("");
      };
      reader.onerror = () => setProblem("读取文件失败");
      reader.readAsText(file);
    };
    const onFile = (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      readFile(file);
    };
    const tall = () => Math.round((window.innerHeight || 800) * 0.6);
    const expanded = manual !== null && manual >= tall() - 4;
    const onGripDown = (event) => {
      const area = areaRef.current;
      if (!area) return;
      grab.current = { y: event.clientY, height: area.offsetHeight };
      setDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };
    const onGripMove = (event) => {
      if (!grab.current) return;
      const limit = Math.round((window.innerHeight || 800) * 0.7);
      setManual(Math.max(MIN, Math.min(limit, grab.current.height + event.clientY - grab.current.y)));
    };
    const onGripUp = (event) => {
      grab.current = null;
      setDragging(false);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    };
    const onGripKey = (event) => {
      const area = areaRef.current;
      if (!area) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setManual(Math.max(MIN, area.offsetHeight + (event.key === "ArrowDown" ? 40 : -40)));
      } else if (event.key === "Home") {
        setManual(null);
      }
    };
    return h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 6 } },
      h(
        "div",
        {
          className: "xtb-field",
          "data-over": over ? true : void 0,
          onDragOver: (event) => {
            if (![...event.dataTransfer?.types || []].includes("Files")) return;
            event.preventDefault();
            setOver(true);
          },
          onDragLeave: () => setOver(false),
          onDrop: (event) => {
            const file = event.dataTransfer?.files?.[0];
            if (!file) return;
            event.preventDefault();
            setOver(false);
            readFile(file);
          }
        },
        target ? h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 6, padding: "8px 8px 0 12px", fontSize: 12, color: "var(--text-secondary)" } },
          h(Icon, { name: "deeper", size: 14 }),
          h("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, childLabel(target)),
          h(Button, { icon: "x", label: "改为挂在选题下", small: true, onClick: () => onTarget(null) })
        ) : null,
        h("textarea", {
          ref: areaRef,
          value: text,
          placeholder: placeholders[type],
          "aria-label": "内容",
          autoFocus: true,
          onChange: (event) => write(event.target.value),
          onKeyDown: (event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
            else if (event.key === "Escape" && !text) {
              event.stopPropagation();
              onDone();
            }
          }
        }),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 2, padding: "4px 6px 0" } },
          h(
            "div",
            { role: "radiogroup", "aria-label": "内容类型", style: { display: "flex", gap: 2, flexWrap: "wrap", flex: 1, minWidth: 0 } },
            TYPE_ORDER.map(
              (key) => h(
                Button,
                {
                  key,
                  role: "radio",
                  "aria-checked": type === key,
                  on: type === key,
                  small: true,
                  onClick: () => {
                    setGuessing(false);
                    setType(key);
                  }
                },
                type === key ? h("span", { "aria-hidden": true, style: { width: 6, height: 6, borderRadius: "50%", background: TYPES[key].color } }) : null,
                TYPES[key].short
              )
            )
          ),
          text.length > MAX_TEXT * 0.8 ? h("span", { className: "xtb-count", style: text.length > MAX_TEXT ? { color: "var(--text-warning, var(--text-primary))" } : void 0 }, `${text.length} / ${MAX_TEXT}`) : null,
          h(Button, { icon: expanded ? "collapse" : "expand", label: expanded ? "收起输入框" : "展开输入框", onClick: () => setManual(expanded ? null : tall()) }),
          h(Button, { icon: "clip", label: "上传 txt / md 文稿", onClick: () => fileRef.current?.click() }),
          h(Button, { variant: "primary", disabled: !text.trim(), onClick: submit }, "添加"),
          h("input", { ref: fileRef, type: "file", accept: ".txt,.md,.markdown,text/plain,text/markdown", onChange: onFile, style: { display: "none" } })
        ),
        h("div", {
          className: "xtb-grip",
          role: "separator",
          "aria-orientation": "horizontal",
          "aria-label": "调整输入框高度，双击恢复自动",
          tabIndex: 0,
          "data-drag": dragging,
          onPointerDown: onGripDown,
          onPointerMove: onGripMove,
          onPointerUp: onGripUp,
          onPointerCancel: onGripUp,
          onDoubleClick: () => setManual(null),
          onKeyDown: onGripKey
        })
      ),
      problem ? h("p", { role: "alert", style: { ...mutedStyle, fontSize: 12, color: "var(--text-warning, var(--text-primary))" } }, problem) : null
    );
  }
  function PostView({ body }) {
    const post = parsePost(body);
    const stats = [post.likes && `赞 ${post.likes}`, post.collects && `藏 ${post.collects}`, post.comments && `评 ${post.comments}`].filter(Boolean);
    const meta = [post.author && `@${post.author.replace(/^@/, "")}`, ...stats].filter(Boolean);
    return h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 6 } },
      post.title ? h("div", { style: { fontSize: 15, fontWeight: 600, lineHeight: 1.5, wordBreak: "break-word" } }, post.title) : null,
      meta.length ? h("div", { style: { fontSize: 12.5, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" } }, meta.join("  ·  ")) : null,
      post.why ? h(Linked, { text: post.why }) : null,
      post.rest ? h(Linked, { text: post.rest }) : null,
      post.tags.length ? h("div", { style: { fontSize: 12.5, color: "var(--text-tertiary)" } }, post.tags.map((tag) => `#${tag}`).join("  ")) : null,
      post.url ? h(
        "a",
        { className: "xtb-btn", "data-v": "outline", href: post.url, target: "_blank", rel: "noreferrer", style: { alignSelf: "flex-start", textDecoration: "none", marginTop: 2 } },
        XHS_URL.test(post.url) ? "打开小红书" : `打开 ${hostOf(post.url)}`,
        h(Icon, { name: "out", size: 13 })
      ) : null
    );
  }
  function ContentCard({ node, depth, open, chosen, mine, nameOf, onOpen, onDeeper, onRemove }) {
    const ref = useRef(null);
    useEffect(() => {
      if (chosen) ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }, [chosen]);
    const type = TYPES[node.type];
    const long = node.type !== "post" && (node.body.length > 260 || node.body.split("\n").length > 7);
    const lines = node.body.split("\n");
    const titled = node.type === "draft" && lines.length > 1 && lines[0].trim().length <= 60;
    return h(
      "article",
      {
        ref,
        className: "xtb-card",
        "data-card": node.id,
        "data-on": chosen,
        style: { marginLeft: Math.min(depth, 4) * 18 - 12, opacity: node.pending ? 0.6 : 1 }
      },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 6, height: 24, fontSize: 12, color: "var(--text-tertiary)" } },
        h("span", { "aria-hidden": true, style: { width: 7, height: 7, borderRadius: "50%", background: type.color, flexShrink: 0 } }),
        h("span", { style: { color: "var(--text-secondary)", fontWeight: 600 } }, type.short),
        h(Author, { pubkey: node.author, size: 16, after: `· ${formatTime(node.at)}`, style: { flex: 1 } }),
        h(
          "span",
          { className: "xtb-acts", style: { display: "flex" } },
          h(Button, { icon: "deeper", label: "在这条下继续深入", small: true, onClick: () => onDeeper(node.id) }),
          mine ? h(Button, { icon: "trash", label: "删除这条内容", variant: "danger", small: true, onClick: () => onRemove(node.id, "删除这条内容？") }) : null
        )
      ),
      node.type === "post" ? h(PostView, { body: node.body }) : h(
        "div",
        { style: long && !open ? { maxHeight: "11.5em", overflow: "hidden", WebkitMaskImage: "linear-gradient(#000 70%, transparent)", maskImage: "linear-gradient(#000 70%, transparent)" } : void 0 },
        titled ? h("div", { style: { fontSize: 15, fontWeight: 600, lineHeight: 1.5, marginBottom: 2 } }, lines[0].trim()) : null,
        h(Linked, { text: (titled ? lines.slice(1).join("\n").trim() : node.body) || "（空）" })
      ),
      long ? h(Button, { small: true, style: { marginLeft: -8, marginTop: 2 }, onClick: () => onOpen(node.id) }, open ? "收起" : "展开全文") : null
    );
  }
  function LinkedTopic({ topic, removable, onOpen, onRemove }) {
    return h(
      "div",
      { className: "xtb-row" },
      h(
        "button",
        { type: "button", className: "xtb-rowmain", title: topic.title, onClick: onOpen },
        h("span", { "aria-hidden": true, style: { width: 10, height: 10, borderRadius: "50%", background: topicColour(topic.id), flexShrink: 0 } }),
        h("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, topic.title),
        h("span", { style: { fontSize: 12, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" } }, topic.count || "")
      ),
      removable ? h("span", { className: "xtb-acts", style: { display: "flex" } }, h(Button, { icon: "x", label: `取消与「${topic.title}」的连接`, small: true, onClick: onRemove })) : null
    );
  }
  function Panel({ graph, topic, selected, viewer, nameOf, linking, onLinking, onSelect, onSend, onRemove, onPick, onClose }) {
    const [target, setTarget] = useState(null);
    const [adding, setAdding] = useState(false);
    const [filter, setFilter] = useState("all");
    const [opened, setOpened] = useState(() => /* @__PURE__ */ new Set());
    useEffect(() => {
      setTarget(null);
      setAdding(false);
      setFilter("all");
      setOpened(/* @__PURE__ */ new Set());
    }, [topic.id]);
    useEffect(() => {
      if (!selected) return;
      setOpened((previous) => new Set(previous).add(selected));
      setFilter("all");
    }, [selected]);
    const liveTarget = target ? graph.nodes.get(target) : void 0;
    const links = graph.links.filter((link) => link.a === topic.id || link.b === topic.id);
    const flat = [];
    const counts = {};
    const walk = (nodes, depth) => {
      for (const node of nodes) {
        flat.push({ node, depth });
        counts[node.type] = (counts[node.type] || 0) + 1;
        walk(node.children, depth + 1);
      }
    };
    walk(topic.children, 0);
    const present = TYPE_ORDER.filter((key) => counts[key]);
    const shown = filter === "all" ? flat : flat.filter(({ node }) => node.type === filter).map(({ node }) => ({ node, depth: 0 }));
    const toggle = (id) => setOpened((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    const section = { display: "flex", flexDirection: "column", gap: 2 };
    const heading = { display: "flex", alignItems: "center", gap: 4, minHeight: 28 };
    return h(
      "aside",
      {
        "aria-label": "选题详情",
        className: "xtb-scroll",
        style: {
          width: "min(420px, 100%)",
          flexShrink: 0,
          borderLeft: "1px solid var(--border)",
          background: "var(--surface-panel)",
          overflowY: "auto",
          boxSizing: "border-box"
        }
      },
      h(
        "div",
        { style: { position: "sticky", top: 0, zIndex: 2, background: "var(--surface-panel)", padding: "10px 12px 12px 20px", display: "flex", flexDirection: "column", gap: 4 } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 2 } },
          h("span", { "aria-hidden": true, style: { width: 10, height: 10, borderRadius: "50%", background: topicColour(topic.id) } }),
          h(Author, { pubkey: topic.author, size: 20, after: `· ${formatTime(topic.at)}`, style: { flex: 1, marginLeft: 8, fontSize: 13, color: "var(--text-secondary)" } }),
          h(Button, { icon: "plus", label: "添加内容", on: adding, "aria-expanded": adding, onClick: () => setAdding(!adding) }),
          h(Button, { icon: "link", label: "连接选题", on: linking, "aria-pressed": linking, onClick: () => onLinking(!linking) }),
          topic.author === viewer ? h(Button, { icon: "trash", label: "删除选题", variant: "danger", onClick: () => onRemove(topic.id, "删除这个选题？它下面的内容会留在频道的话题串里。") }) : null,
          h(Button, { icon: "x", label: "关闭", onClick: onClose })
        ),
        h("h2", { style: { margin: 0, paddingRight: 8, fontSize: 20, fontWeight: 650, lineHeight: 1.4, wordBreak: "break-word" } }, topic.title)
      ),
      h(
        "div",
        { style: { padding: "0 20px 28px", display: "flex", flexDirection: "column", gap: 18 } },
        topic.body ? h(Linked, { text: topic.body }) : null,
        adding ? h(Composer, { topic, target: liveTarget, onTarget: setTarget, onSend, onDone: () => setAdding(false) }) : null,
        links.length || linking ? h(
          "section",
          { style: section },
          h("div", { style: heading }, h("span", { className: "xtb-label" }, "关联选题"), h("span", { className: "xtb-count" }, links.length || "")),
          links.map((link) => {
            const other = graph.nodes.get(link.a === topic.id ? link.b : link.a);
            return h(LinkedTopic, { key: link.id, topic: other, removable: link.author === viewer, onOpen: () => onPick(other.id), onRemove: () => onRemove(link.id) });
          }),
          linking ? h(
            "div",
            { className: "xtb-row", "data-pending": true, role: "status" },
            h("span", { className: "xtb-rowmain", style: { cursor: "default", color: "var(--text-secondary)" } }, h(Icon, { name: "link", size: 14 }), "在图上点一个选题"),
            h(Button, { small: true, onClick: () => onLinking(false) }, "取消")
          ) : null
        ) : null,
        h(
          "section",
          { style: section },
          h(
            "div",
            { style: heading },
            h("span", { className: "xtb-label" }, "内容"),
            h("span", { className: "xtb-count", style: { flex: 1 } }, flat.length || ""),
            present.length > 1 ? h(
              "div",
              { role: "radiogroup", "aria-label": "按类型筛选", style: { display: "flex", gap: 2 } },
              ["all", ...present].map(
                (key) => h(Button, { key, role: "radio", "aria-checked": filter === key, on: filter === key, small: true, onClick: () => setFilter(key) }, key === "all" ? "全部" : TYPES[key].short)
              )
            ) : null
          ),
          shown.length ? shown.map(
            ({ node, depth }) => h(ContentCard, {
              key: node.id,
              node,
              depth,
              open: opened.has(node.id),
              chosen: node.id === selected,
              mine: node.author === viewer,
              nameOf,
              onOpen: toggle,
              onDeeper: (id) => {
                setTarget(id);
                setAdding(true);
                onSelect(id);
              },
              onRemove
            })
          ) : h("p", { style: { ...mutedStyle, color: "var(--text-tertiary)", padding: "6px 0" } }, "还没有内容")
        )
      )
    );
  }
  function Board({ session, viewer, scope }) {
    const subscribeChannels = useCallback((listener) => session.channels.subscribeList(listener), [session]);
    const listing = useStore(subscribeChannels, () => session.channels.list());
    const channels = useMemo(
      () => (listing?.channels || []).filter((channel2) => channel2 && channel2.id && !channel2.huddle && !channel2.metadataPending && channel2.name).filter((channel2) => !channel2.members || channel2.members.includes(viewer)).sort((a, b) => String(a.name).localeCompare(String(b.name), "zh")),
      [listing, viewer]
    );
    const [choice, setChoice] = useState(() => loadChoice(scope));
    const channel = channels.find((candidate) => candidate.id === choice) || (choice ? void 0 : channels.find((candidate) => /选题|小红书|xhs/i.test(String(candidate.name))));
    const channelId = channel?.id;
    const refreshTopics = useRef(null);
    const refreshReplies = useRef(null);
    const main = useObserved(
      session,
      channelId || "",
      channelId ? [{ kinds: [9], "#h": [channelId], limit: 500 }] : void 0,
      refreshTopics
    );
    const rootIds = useMemo(
      () => main.events.filter((event) => event.kind === 9 && !event.tags.some((tag) => tag[0] === "e")).map((event) => event.id).sort(),
      [main.events]
    );
    const replyFilters = useMemo(() => {
      if (!channelId || !rootIds.length) return void 0;
      const filters = [];
      for (let i = 0; i < rootIds.length; i += 100) {
        filters.push({ kinds: [9], "#h": [channelId], "#e": rootIds.slice(i, i + 100), limit: 500 });
      }
      return filters;
    }, [channelId, rootIds]);
    const replies = useObserved(session, `${channelId}:${rootIds.join(",")}`, replyFilters, refreshReplies);
    const graph = useMemo(() => buildGraph([...main.events, ...replies.events]), [main.events, replies.events]);
    const profiles = session.profiles;
    const subscribeProfiles = useCallback(
      (listener) => typeof profiles?.subscribe === "function" ? profiles.subscribe(listener) : () => {
      },
      [profiles]
    );
    const profileMap = useStore(subscribeProfiles, () => {
      try {
        return profiles?.snapshot?.();
      } catch {
        return void 0;
      }
    });
    const personOf = (pubkey) => {
      try {
        const owner = profiles?.owner?.(pubkey);
        const key = typeof owner === "string" ? owner : owner?.pubkey;
        return typeof key === "string" && HEX64.test(key) ? key : pubkey;
      } catch {
        return pubkey;
      }
    };
    const writers = useMemo(() => [...new Set([...graph.nodes.values()].map((node) => node.author))], [graph]);
    const authors = [...new Set(writers.flatMap((pubkey) => [pubkey, personOf(pubkey)]))].sort().join(",");
    useEffect(() => {
      if (authors) Promise.resolve(profiles?.ensure?.(authors.split(","))).catch(() => {
      });
    }, [authors, profiles]);
    const nameOf = (pubkey) => profileMap?.get?.(pubkey)?.name || (pubkey === viewer ? "我" : `${pubkey.slice(0, 6)}…`);
    people.name = nameOf;
    people.person = personOf;
    people.avatar = (pubkey) => {
      const profile = profileMap?.get?.(pubkey);
      const picture = profile?.picture || profile?.avatar;
      if (typeof picture !== "string" || !picture) return void 0;
      try {
        const sized = session.media?.(picture, "small");
        return typeof sized === "string" && sized ? sized : picture;
      } catch {
        return picture;
      }
    };
    const [hover, setHover] = useState(null);
    const [pinned, setPinned] = useState(null);
    const [selected, setSelected] = useState(null);
    const [linking, setLinking] = useState(false);
    const [draft, setDraft] = useState("");
    const [notice, setNotice] = useState("");
    const pinnedTopic = pinned ? graph.nodes.get(pinned) : void 0;
    const active = pinnedTopic ? pinned : null;
    useEffect(() => {
      if (pinned && !pinnedTopic && main.status === "ready") {
        setPinned(null);
        setSelected(null);
        setLinking(false);
      }
    }, [pinned, pinnedTopic, main.status]);
    useEffect(() => {
      const onKey = (event) => {
        if (event.key !== "Escape") return;
        if (linking) setLinking(false);
        else if (selected) setSelected(null);
        else if (pinned) setPinned(null);
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [linking, selected, pinned]);
    useEffect(() => {
      if (!notice) return void 0;
      const timer = setTimeout(() => setNotice(""), 6e3);
      return () => clearTimeout(timer);
    }, [notice]);
    const attempt = (action) => {
      try {
        action();
        setNotice("");
        return true;
      } catch (error) {
        setNotice(`没发出去：${error?.message || error}`);
        return false;
      }
    };
    const addTopic = () => {
      const text = draft.trim();
      if (!text || !channelId) return;
      if (attempt(() => session.messages.send(channelId, `${TOPIC_ICON} ${text}`))) setDraft("");
    };
    const addContent = (type, body, parentId) => attempt(() => {
      const text = `${TYPES[type].icon} ${body}`;
      const outbox = session.outbox;
      if (parentId !== pinned && outbox?.supports?.(9)) {
        outbox.send({
          kind: 9,
          content: text,
          tags: [
            ["h", channelId],
            ["e", pinned, "", "root"],
            ["e", parentId, "", "reply"]
          ]
        });
      } else {
        session.messages.reply(channelId, pinned, text);
      }
    });
    const connect = (otherId) => {
      const other = graph.nodes.get(otherId);
      if (!other || !pinnedTopic) return;
      if (graph.links.some((link) => [link.a, link.b].includes(pinned) && [link.a, link.b].includes(otherId))) {
        setNotice("这两个选题已经连上了。");
      } else {
        attempt(() => session.messages.reply(channelId, pinned, `${LINK_ICON} 关联选题「${clip(other.title, 40)}」 ${otherId}`));
      }
      setLinking(false);
    };
    const remove = (id, question) => {
      if (question && typeof window.confirm === "function" && !window.confirm(question)) return;
      if (attempt(() => session.messages.remove([id]))) {
        if (id === pinned) setPinned(null);
        if (id === selected) setSelected(null);
      }
    };
    const pick = (id) => {
      if (linking && pinned && id !== pinned) {
        connect(id);
        return;
      }
      setSelected(null);
      setLinking(false);
      setPinned(id === pinned ? null : id);
      setHover(id);
    };
    if (!channels.length) {
      return h(
        Message,
        { title: listing?.status === "ready" ? "先建一个放选题的频道" : "正在读取频道…" },
        listing?.status === "ready" ? h("p", { style: mutedStyle }, "在 Buzz 里新建一个频道（建议起名「小红书选题」），把要一起共建的同事拉进来，再回到这里。频道里的人看到的是同一张图。") : null
      );
    }
    const header = h(
      "header",
      { style: { display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border)" } },
      channelId ? h(
        "form",
        {
          className: "xtb-field",
          "data-inline": true,
          onSubmit: (event) => {
            event.preventDefault();
            addTopic();
          }
        },
        h("span", { style: { display: "grid", placeItems: "center", color: "var(--text-tertiary)" } }, h(Icon, { name: "plus", size: 15 })),
        h("input", {
          value: draft,
          onChange: (event) => setDraft(event.target.value),
          placeholder: "丢一个选题",
          "aria-label": "新选题",
          maxLength: 300,
          enterKeyHint: "send"
        }),
        draft.trim() ? h(Button, { type: "submit", variant: "primary", small: true }, "添加") : null
      ) : null,
      h("span", { style: { flex: 1 } }),
      h(
        "select",
        {
          className: "xtb-select",
          value: channelId || "",
          "aria-label": "选题频道",
          onChange: (event) => {
            setChoice(event.target.value);
            saveChoice(scope, event.target.value);
            setPinned(null);
            setSelected(null);
            setHover(null);
          }
        },
        channelId ? null : h("option", { value: "" }, "选择频道"),
        channels.map((candidate) => h("option", { key: candidate.id, value: candidate.id }, `# ${candidate.name}`))
      ),
      channelId ? h(Button, {
        icon: "refresh",
        label: "刷新",
        onClick: () => {
          refreshTopics.current?.();
          refreshReplies.current?.();
        }
      }) : null
    );
    if (!channelId) {
      return h(
        "div",
        { style: { height: "100%", display: "flex", flexDirection: "column" } },
        header,
        h(Message, { title: "在右上角选一个放选题的频道" })
      );
    }
    const loading = main.status !== "ready" && !graph.topics.length;
    const status = main.status === "error" ? `读取失败：${main.error || ""}` : loading ? "正在读取选题…" : !graph.topics.length ? "还没有选题" : "";
    return h(
      "div",
      { style: { height: "100%", minHeight: 420, display: "flex", flexDirection: "column", position: "relative" } },
      h("style", null, STYLE),
      header,
      h(
        "div",
        { style: { flex: 1, minHeight: 0, display: "flex", position: "relative" } },
        h(Canvas, {
          graph,
          active,
          pinned: pinnedTopic ? pinned : null,
          selected,
          linking,
          peek: !pinnedTopic && hover && graph.nodes.has(hover) ? hover : null,
          onHover: setHover,
          onPick: pick,
          onChild: (node) => {
            setPinned(node.topic);
            setSelected(node.id);
          },
          onBackground: () => {
            setPinned(null);
            setSelected(null);
            setLinking(false);
            setHover(null);
          }
        }),
        status ? h("p", { role: "status", style: { ...mutedStyle, position: "absolute", left: 16, right: 16, top: "42%", textAlign: "center", pointerEvents: "none" } }, status) : null,
        pinnedTopic ? h(Panel, {
          graph,
          topic: pinnedTopic,
          selected,
          viewer,
          nameOf,
          linking,
          onLinking: setLinking,
          onSelect: setSelected,
          onSend: addContent,
          onRemove: remove,
          onPick: pick,
          onClose: () => {
            setPinned(null);
            setSelected(null);
            setLinking(false);
          }
        }) : null
      ),
      notice ? h(
        "div",
        {
          role: "alert",
          style: {
            position: "absolute",
            left: "50%",
            bottom: 40,
            transform: "translateX(-50%)",
            maxWidth: "80%",
            padding: "8px 14px",
            borderRadius: 10,
            background: "var(--surface-inverse, #222)",
            color: "var(--text-on-prominent, #fff)",
            fontSize: 13,
            zIndex: 10
          }
        },
        notice
      ) : null
    );
  }
  function Page() {
    const subscribe = useCallback((listener) => ctx.relay.subscribe(listener), []);
    const connection = useStore(subscribe, () => ctx.relay.snapshot());
    if (connection.status !== "ready" || !connection.session || !connection.viewer) {
      return h(
        Message,
        { title: connection.status === "error" ? "连接出错" : "正在连接社区…" },
        h("p", { style: mutedStyle }, connection.status === "error" ? connection.error || "请稍后重试。" : "连上之后会显示选题图。")
      );
    }
    return h(Board, {
      key: `${connection.scope}:${connection.generation}`,
      session: connection.session,
      viewer: connection.viewer,
      scope: connection.scope || ""
    });
  }
  ctx.pages.register({
    id: "board",
    title: "选题灵感",
    primary: true,
    placement: "dock",
    // the Apps icon bar; the default lists it among the sidebar pages
    icon: PAGE_ICON,
    layout: "workspace",
    component: Page
  });
  const CHANNEL_HINT = { type: "string", description: "选题频道的名称或 ID。省略时用名字含「选题」「小红书」或 xhs 的频道。" };
  const TOPIC_HINT = { type: "string", description: "选题的 ID（xhs_topics_list 返回的 8 位前缀即可）或完整标题。" };
  function sessionOf(client) {
    const snapshot = ctx.agents.relay?.(client.key)?.snapshot?.();
    if (snapshot?.status !== "ready" || !snapshot.session) throw Error("选题工具需要这个 agent 已连上社区，请稍后再试。");
    return snapshot.session;
  }
  function channelOf(session, wanted) {
    const viewer = session.viewer;
    const channels = (session.channels.list()?.channels || []).filter(
      (channel) => channel?.id && channel.name && !channel.huddle && (!channel.members || !viewer || channel.members.includes(viewer))
    );
    const found = wanted ? channels.find((channel) => channel.id === wanted || channel.name === wanted) : channels.find((channel) => /选题|小红书|xhs/i.test(String(channel.name)));
    if (!found) {
      throw Error(
        `找不到选题频道${wanted ? `「${wanted}」` : ""}。这个 agent 需要先被拉进该频道。它现在所在的频道：${channels.map((channel) => channel.name).join("、") || "无"}`
      );
    }
    return found;
  }
  async function graphOf(session, channelId, signal) {
    const main = await session.read([{ kinds: [9], "#h": [channelId], limit: 500 }], { signal });
    const roots = main.filter((event) => event.kind === 9 && !event.tags.some((tag) => tag[0] === "e")).map((event) => event.id);
    const replies = [];
    for (let i = 0; i < roots.length; i += 100) {
      replies.push(...await session.read([{ kinds: [9], "#h": [channelId], "#e": roots.slice(i, i + 100), limit: 500 }], { signal }));
    }
    return buildGraph([...main, ...replies]);
  }
  function topicOf(graph, reference) {
    const wanted = String(reference || "").trim();
    if (!wanted) throw Error("需要 topic：选题的 ID 或标题。");
    const byId = graph.topics.filter((topic) => topic.id === wanted || wanted.length >= 6 && /^[0-9a-f]+$/.test(wanted) && topic.id.startsWith(wanted));
    const exact = graph.topics.filter((topic) => topic.title === wanted);
    const loose = graph.topics.filter((topic) => topic.title.includes(wanted));
    const hits = byId.length ? byId : exact.length ? exact : loose;
    if (hits.length === 1) return hits[0];
    if (!hits.length) throw Error(`没有找到选题「${wanted}」。先用 xhs_topics_list 看现有选题，或用 xhs_topics_add 新建。`);
    throw Error(`「${wanted}」匹配到多个选题，请改用 ID：${hits.map((topic) => `${topic.id.slice(0, 8)} ${topic.title}`).join("；")}`);
  }
  const field = (args, key, required) => {
    const value = typeof args[key] === "string" ? args[key].trim() : "";
    if (required && !value) throw Error(`需要 ${key}。`);
    if (value.length > MAX_TEXT) throw Error(`${key} 过长（${value.length} 字），上限 ${MAX_TEXT} 字，请拆成几条。`);
    return value;
  };
  function replyAs(session, client, channelId, topic, parentId, content) {
    client.signal?.throwIfAborted();
    if (parentId && parentId !== topic.id && session.outbox?.supports?.(9)) {
      return session.outbox.send({
        kind: 9,
        content,
        tags: [
          ["h", channelId],
          ["e", topic.id, "", "root"],
          ["e", parentId, "", "reply"]
        ]
      });
    }
    return session.messages.reply(channelId, topic.id, content);
  }
  function parentOf(graph, topic, reference) {
    const wanted = String(reference || "").trim();
    if (!wanted) return void 0;
    const hits = [...graph.nodes.values()].filter((node) => node.kind === "child" && node.topic === topic.id && node.id.startsWith(wanted));
    if (hits.length !== 1) throw Error(`parent「${wanted}」在这个选题下${hits.length ? "匹配到多条" : "不存在"}，请用 xhs_topics_list 查到的内容 ID。`);
    return hits[0].id;
  }
  const describe = (node, depth) => {
    const pad = "  ".repeat(depth);
    const body = node.type === "post" ? node.body : clip(node.body.replace(/\s+/g, " "), 300);
    const lines = [`${pad}- [${node.id.slice(0, 8)}] ${TYPES[node.type].icon}${TYPES[node.type].short}：${body.replace(/\n/g, `
${pad}  `)}`];
    for (const child of node.children) lines.push(...describe(child, depth + 1));
    return lines;
  };
  const shortId = (id) => typeof id === "string" ? `，ID ${id.slice(0, 8)}` : "";
  ctx.agents.addTool({
    name: "xhs_topics_list",
    description: "读取小红书选题灵感图。不带 topic：列出所有选题及其内容数量。带 topic：返回该选题下的全部内容（延伸选题、帖子、文稿、研究）和已连接的选题。写入前先调用它，避免重复。",
    inputSchema: { type: "object", properties: { topic: TOPIC_HINT, channel: CHANNEL_HINT }, additionalProperties: false },
    async call(client, context, args) {
      const session = sessionOf(client);
      const channel = channelOf(session, field(args, "channel"));
      const graph = await graphOf(session, channel.id, client.signal);
      if (!field(args, "topic")) {
        if (!graph.topics.length) return `频道「${channel.name}」里还没有选题。`;
        const rows = [...graph.topics].sort((a, b) => b.at - a.at).map((topic2) => {
          const counts = {};
          const tally = (nodes) => {
            for (const node of nodes) {
              counts[node.type] = (counts[node.type] || 0) + 1;
              tally(node.children);
            }
          };
          tally(topic2.children);
          const detail = TYPE_ORDER.filter((key) => counts[key]).map((key) => `${TYPES[key].short}${counts[key]}`).join(" ");
          return `- [${topic2.id.slice(0, 8)}] ${topic2.title}${detail ? `（${detail}）` : "（空）"}`;
        });
        return `频道「${channel.name}」共 ${graph.topics.length} 个选题：
${rows.join("\n")}`;
      }
      const topic = topicOf(graph, args.topic);
      const linked = graph.links.filter((link) => link.a === topic.id || link.b === topic.id).map((link) => graph.nodes.get(link.a === topic.id ? link.b : link.a)).map((other) => `[${other.id.slice(0, 8)}] ${other.title}`);
      return [
        `选题 [${topic.id.slice(0, 8)}] ${topic.title}`,
        topic.body ? `说明：${topic.body}` : "",
        linked.length ? `已连接：${linked.join("；")}` : "",
        topic.children.length ? `内容（${topic.count} 条）：` : "还没有内容。",
        ...topic.children.flatMap((child) => describe(child, 0))
      ].filter(Boolean).join("\n");
    }
  });
  ctx.agents.addTool({
    name: "xhs_topics_inbox",
    description: "读取选题频道里还没进灵感图的普通聊天消息，供你判断哪些值得收录。聊天不会自动上图：由你挑出有价值的，整理、改写、归类后，用 xhs_topics_add 建选题，或用 xhs_topics_add_content / xhs_topics_add_post 挂到已有选题下。闲聊、寒暄、重复的不要收。",
    inputSchema: {
      type: "object",
      properties: {
        hours: { type: "number", description: "只看最近多少小时的消息，默认 72。" },
        limit: { type: "number", description: "最多返回多少条，默认 50，上限 200。" },
        channel: CHANNEL_HINT
      },
      additionalProperties: false
    },
    async call(client, context, args) {
      const session = sessionOf(client);
      const channel = channelOf(session, field(args, "channel"));
      const hours = Number.isFinite(args.hours) && args.hours > 0 ? args.hours : 72;
      const limit = Math.min(200, Number.isFinite(args.limit) && args.limit > 0 ? Math.floor(args.limit) : 50);
      const graph = await graphOf(session, channel.id, client.signal);
      const since = Date.now() / 1e3 - hours * 3600;
      const recent = graph.loose.filter((item) => item.at >= since);
      if (!recent.length) return `频道「${channel.name}」最近 ${hours} 小时没有未收录的聊天消息。`;
      const shown = recent.slice(0, limit);
      await Promise.resolve(session.profiles?.ensure?.([...new Set(shown.map((item) => item.author))])).catch(() => {
      });
      const names = session.profiles?.snapshot?.();
      const rows = shown.map((item) => {
        const who = names?.get?.(item.author)?.name || item.author.slice(0, 8);
        const where = item.under ? `（在选题 [${item.under.slice(0, 8)}] ${graph.nodes.get(item.under).title} 的话题串里）` : "";
        return `- [${item.id.slice(0, 8)}] ${formatTime(item.at)} ${who}${where}：${clip(item.text.replace(/\s+/g, " "), 600)}`;
      });
      return [
        `频道「${channel.name}」最近 ${hours} 小时有 ${recent.length} 条未收录的聊天${recent.length > shown.length ? `，显示最新 ${shown.length} 条` : ""}：`,
        ...rows,
        "这些只是聊天原文，没有上图。挑出值得收录的，整理后用写入工具添加；不确定是否值得收录时先问人。"
      ].join("\n");
    }
  });
  ctx.agents.addTool({
    name: "xhs_topics_add",
    description: "往小红书选题灵感图里丢一个新选题（图上的一个点）。标题要像一条小红书选题：具体、有钩子。同名选题已存在时不会重复创建。",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "选题标题，一行，建议 30 字以内。" },
        note: { type: "string", description: "可选：选题说明，比如目标人群、切入角度、为什么可能爆。" },
        channel: CHANNEL_HINT
      },
      required: ["title"],
      additionalProperties: false
    },
    async call(client, context, args) {
      const session = sessionOf(client);
      const channel = channelOf(session, field(args, "channel"));
      const title = firstLine(field(args, "title", true));
      const note = field(args, "note");
      const graph = await graphOf(session, channel.id, client.signal);
      const existing = graph.topics.find((topic) => topic.title === title);
      if (existing) return `选题已存在：[${existing.id.slice(0, 8)}] ${existing.title}。用 xhs_topics_add_content 往里填内容。`;
      client.signal?.throwIfAborted();
      const id = session.messages.send(channel.id, `${TOPIC_ICON} ${title}${note ? `
${note}` : ""}`);
      return `已添加选题「${title}」${shortId(id)}。`;
    }
  });
  ctx.agents.addTool({
    name: "xhs_topics_add_content",
    description: "往一个选题里填内容：extend=延伸选题（一条一个角度），draft=文稿（第一行是标题，后面是正文），research=深入研究（发现、数据、来源链接），note=随手笔记。小红书帖子请用 xhs_topics_add_post。parent 可把内容挂在某条已有内容下面继续深入。",
    inputSchema: {
      type: "object",
      properties: {
        topic: TOPIC_HINT,
        type: { type: "string", enum: ["extend", "draft", "research", "note"] },
        text: { type: "string", description: "内容正文，纯文本，可多行，可带链接。" },
        parent: { type: "string", description: "可选：挂在哪条内容下面（该内容的 ID 前缀）。省略则直接挂在选题下。" },
        channel: CHANNEL_HINT
      },
      required: ["topic", "type", "text"],
      additionalProperties: false
    },
    async call(client, context, args) {
      const session = sessionOf(client);
      const channel = channelOf(session, field(args, "channel"));
      const type = TYPES[args.type];
      if (!type || type.key === "post") throw Error("type 必须是 extend、draft、research 或 note；帖子请用 xhs_topics_add_post。");
      const body = field(args, "text", true);
      const graph = await graphOf(session, channel.id, client.signal);
      const topic = topicOf(graph, args.topic);
      const parent = parentOf(graph, topic, args.parent);
      const id = replyAs(session, client, channel.id, topic, parent, `${type.icon} ${body}`);
      return `已在「${topic.title}」下添加${type.label}${shortId(id)}。`;
    }
  });
  ctx.agents.addTool({
    name: "xhs_topics_add_post",
    description: "把一篇小红书帖子挂到选题下，作为对标参考。尽量填全：标题、链接（保留完整链接含 xsec_token，否则打不开）、作者、赞藏评数据，以及 why——这篇为什么火、可以借鉴什么。同一篇帖子在同一选题下不会重复添加。",
    inputSchema: {
      type: "object",
      properties: {
        topic: TOPIC_HINT,
        url: { type: "string", description: "帖子链接：xiaohongshu.com/explore/… 或 xhslink.com 短链，原样保留。" },
        title: { type: "string", description: "帖子标题。" },
        author: { type: "string", description: "作者昵称。" },
        likes: { type: "string", description: "点赞数，如 3.2w 或 856。" },
        collects: { type: "string", description: "收藏数。" },
        comments: { type: "string", description: "评论数。" },
        why: { type: "string", description: "亮点拆解：钩子、结构、封面、评论区在聊什么、可借鉴的点。" },
        tags: { type: "array", items: { type: "string" }, description: "帖子的话题标签，不带 #。" },
        parent: { type: "string", description: "可选：挂在哪条内容下面（该内容的 ID 前缀）。" },
        channel: CHANNEL_HINT
      },
      required: ["topic", "url"],
      additionalProperties: false
    },
    async call(client, context, args) {
      const session = sessionOf(client);
      const channel = channelOf(session, field(args, "channel"));
      const url = field(args, "url", true);
      if (!/^https?:\/\/\S+$/.test(url)) throw Error("url 必须是一个完整的 http(s) 链接。");
      const graph = await graphOf(session, channel.id, client.signal);
      const topic = topicOf(graph, args.topic);
      const noteId = noteIdOf(url);
      const duplicate = [...graph.nodes.values()].find((node) => {
        if (node.kind !== "child" || node.type !== "post" || node.topic !== topic.id) return false;
        const other = parsePost(node.body);
        return other.url === url || !!noteId && other.noteId === noteId;
      });
      if (duplicate) return `这篇帖子已经在「${topic.title}」下了（[${duplicate.id.slice(0, 8)}]），没有重复添加。`;
      const one = (value) => String(value ?? "").replace(/[\n｜|]/g, " ").trim();
      const meta = [
        one(args.author) && `作者：${one(args.author).replace(/^@/, "")}`,
        one(args.likes) && `赞 ${one(args.likes)}`,
        one(args.collects) && `藏 ${one(args.collects)}`,
        one(args.comments) && `评 ${one(args.comments)}`
      ].filter(Boolean);
      const tags = Array.isArray(args.tags) ? args.tags.map((tag) => one(tag).replace(/^#/, "")).filter(Boolean).slice(0, 12) : [];
      const why = field(args, "why");
      const content = [
        `${TYPES.post.icon} ${one(field(args, "title")) || "小红书帖子"}`,
        url,
        meta.join(" ｜ "),
        why && `亮点：${why}`,
        tags.length && `标签：${tags.map((tag) => `#${tag}`).join(" ")}`
      ].filter(Boolean).join("\n");
      if (content.length > MAX_TEXT) throw Error(`内容过长，上限 ${MAX_TEXT} 字。`);
      const parent = parentOf(graph, topic, args.parent);
      const id = replyAs(session, client, channel.id, topic, parent, content);
      return `已把帖子挂到「${topic.title}」下${shortId(id)}。`;
    }
  });
  ctx.agents.addTool({
    name: "xhs_topics_link",
    description: "把两个相关的选题连起来（图上出现一条连线），比如同一人群、同一系列、可以互相引流的选题。已连接的不会重复。",
    inputSchema: {
      type: "object",
      properties: { from: TOPIC_HINT, to: TOPIC_HINT, channel: CHANNEL_HINT },
      required: ["from", "to"],
      additionalProperties: false
    },
    async call(client, context, args) {
      const session = sessionOf(client);
      const channel = channelOf(session, field(args, "channel"));
      const graph = await graphOf(session, channel.id, client.signal);
      const from = topicOf(graph, args.from);
      const to = topicOf(graph, args.to);
      if (from.id === to.id) throw Error("from 和 to 是同一个选题。");
      if (graph.links.some((link) => [link.a, link.b].includes(from.id) && [link.a, link.b].includes(to.id))) {
        return `「${from.title}」和「${to.title}」已经连上了。`;
      }
      client.signal?.throwIfAborted();
      session.messages.reply(channel.id, from.id, `${LINK_ICON} 关联选题「${clip(to.title, 40)}」 ${to.id}`);
      return `已连接「${from.title}」↔「${to.title}」。`;
    }
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
  inject
};

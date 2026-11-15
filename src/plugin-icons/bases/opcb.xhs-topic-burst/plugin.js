// 选题灵感 — a Buzz page plugin (API v1, single file, no imports).
//
// Data lives in one Buzz channel, so everyone in that channel shares it:
//   top-level message            = a topic (选题)
//   thread reply                 = related content (延伸 / 帖子 / 文稿 / 研究 / 笔记)
//   thread reply starting with 🔗 = a connection to another topic
// Nothing is stored outside the channel except the per-device channel choice.

export const inject = ["react", "pages", "relay", "agents"];

const TYPES = {
  extend: { key: "extend", label: "延伸选题", short: "延伸", icon: "🌱", color: "#2f9e6b" },
  post: { key: "post", label: "小红书帖子", short: "帖子", icon: "📕", color: "#e0425c" },
  draft: { key: "draft", label: "文稿", short: "文稿", icon: "📝", color: "#3b7ddd" },
  research: { key: "research", label: "深入研究", short: "研究", icon: "🔬", color: "#8456d8" },
  note: { key: "note", label: "笔记", short: "笔记", icon: "💬", color: "#7a8394" },
};
const TYPE_ORDER = ["extend", "post", "draft", "research", "note"];
const ICON_TO_TYPE = { "🌱": "extend", "📕": "post", "📝": "draft", "🔬": "research", "💬": "note" };
const TOPIC_ICON = "💡";
const LINK_ICON = "🔗";
const HEX64 = /^[0-9a-f]{64}$/;
const MAX_TEXT = 20000;
const PAGE_ICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iY3VycmVudENvbG9yIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIzLjQiLz48Y2lyY2xlIGN4PSIyMS4yMCIgY3k9IjEyLjAwIiByPSIxLjkiLz48cGF0aCBkPSJNMTYuNjAgMTIuMDBMMTguNjAgMTIuMDAiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjEuMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PGNpcmNsZSBjeD0iMTcuODAiIGN5PSIxNy44MCIgcj0iMS4zIi8+PHBhdGggZD0iTTE1LjI1IDE1LjI1TDE1Ljk2IDE1Ljk2IiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjxjaXJjbGUgY3g9IjEyLjAwIiBjeT0iMjEuMjAiIHI9IjEuOSIvPjxwYXRoIGQ9Ik0xMi4wMCAxNi42MEwxMi4wMCAxOC42MCIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMS4yIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48Y2lyY2xlIGN4PSI2LjIwIiBjeT0iMTcuODAiIHI9IjEuMyIvPjxwYXRoIGQ9Ik04Ljc1IDE1LjI1TDguMDQgMTUuOTYiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjEuMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PGNpcmNsZSBjeD0iMi44MCIgY3k9IjEyLjAwIiByPSIxLjkiLz48cGF0aCBkPSJNNy40MCAxMi4wMEw1LjQwIDEyLjAwIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjxjaXJjbGUgY3g9IjYuMjAiIGN5PSI2LjIwIiByPSIxLjMiLz48cGF0aCBkPSJNOC43NSA4Ljc1TDguMDQgOC4wNCIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMS4yIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48Y2lyY2xlIGN4PSIxMi4wMCIgY3k9IjIuODAiIHI9IjEuOSIvPjxwYXRoIGQ9Ik0xMi4wMCA3LjQwTDEyLjAwIDUuNDAiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjEuMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PGNpcmNsZSBjeD0iMTcuODAiIGN5PSI2LjIwIiByPSIxLjMiLz48cGF0aCBkPSJNMTUuMjUgOC43NUwxNS45NiA4LjA0IiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg==";
const URL_RE = /https?:\/\/[^\s<>"'）】]+/g;

// ---------- pure helpers ----------

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
  return (
    text
      .split("\n")
      .map((line) => line.replace(/^[#>*\-\s]+/, "").trim())
      .find(Boolean) || ""
  );
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
    const body = text
      .slice(icon.length)
      .replace(/^\s*(延伸选题|小红书帖子|深入研究|延伸|帖子|文稿|研究|笔记)\s*[｜|:：]\s*/, "")
      .trim();
    return { type: ICON_TO_TYPE[icon], body };
  }
  // Anything unmarked is ordinary chat: it stays in the channel, off the map.
  return undefined;
}

const XHS_URL = /xiaohongshu\.com|xhslink\.com/i;
const XHS_BOILERPLATE = /复制(本条信息|后)[^\n]*?(查看[^\n！!]*[！!]?)|打开【小红书】App查看精彩内容[！!]?/g;
const POST_FIELD = /^(作者|博主|账号|点赞|赞|收藏|藏|评论|评|亮点|爆点|拆解|分析|为什么火|标签|话题)\s*[:：]/;

/** The note id a Xiaohongshu URL points at, when the URL carries one. */
function noteIdOf(url) {
  return (url.match(/(?:explore|discovery\/item|notes?|item)\/([0-9a-f]{24})/i) || [])[1];
}

/**
 * Read a post out of free text. It accepts the structured form the agent tool
 * writes (title, URL, `作者：… ｜ 赞 … ｜ 藏 … ｜ 评 …`, `亮点：…`, `标签：…`),
 * a bare link with a comment, and the text the Xiaohongshu app copies on Share.
 */
function parsePost(body) {
  const urls = urlsOf(body);
  const url = urls.find((candidate) => XHS_URL.test(candidate)) || urls[0] || "";
  let text = body.replace(XHS_BOILERPLATE, " ");
  let title = "";
  let author = "";
  // Share text: `12 【标题 - 作者 | 小红书 - 你的生活兴趣社区】 😆 code 😆 https://…`
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
    noteId: url ? noteIdOf(url) : undefined,
    title,
    author,
    likes,
    collects,
    comments,
    why: why.join("\n"),
    tags: tags.slice(0, 12),
    rest: rest.join("\n"),
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

/** Fold channel messages into topics, their content trees and topic links. */
function buildGraph(events) {
  const byId = new Map();
  for (const event of events) {
    if (event && event.kind === 9 && typeof event.content === "string" && !byId.has(event.id)) {
      byId.set(event.id, event);
    }
  }
  const topics = new Map();
  const replies = [];
  // Unmarked chat, kept so an agent can decide what is worth filing.
  const loose = [];
  const chat = (event, under) => loose.push({ id: event.id, author: event.pubkey, at: event.created_at, text: event.content.trim(), under });
  for (const event of byId.values()) {
    const refs = event.tags.filter((tag) => tag[0] === "e" && HEX64.test(tag[1] || ""));
    const isCopy = event.tags.some((tag) => tag[0] === "buzz:copy-of" || tag[0] === "buzz:sent-from-thread");
    if (!refs.length) {
      const raw = event.content.trim();
      if (!raw || isCopy) continue;
      // Only a message that opens with 💡 is a topic. 📌 is a channel notice.
      if (!raw.startsWith(TOPIC_ICON)) {
        if (!/^(📌|🔗)/u.test(raw)) chat(event, undefined);
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
        count: 0,
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
      const from = topics.has(root) ? root : topics.has(parent) ? parent : undefined;
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
      topic: undefined,
      children: [],
    };
    nodes.set(child.id, child);
    pendingChildren.push(child);
  }
  for (const child of pendingChildren) {
    // An unknown parent (not loaded or deleted) falls back to the thread root.
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
  // Drop children whose ancestry never reached a topic (cycles or orphans).
  for (const [id, node] of nodes) if (node.kind === "child" && !node.topic) nodes.delete(id);
  const seen = new Set();
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
    loose: loose.map((item) => ({ ...item, under: topics.has(item.under) ? item.under : undefined })).sort((a, b) => b.at - a.at),
  };
}

/** One ink, several strengths: the map is monochrome and follows the theme. */
const ink = (strength) => `color-mix(in srgb, var(--text-primary) ${strength}%, var(--bg-app, #17181b))`;
const topicColour = () => ink(78);
// A topic grows with what has been filed under it: area, not radius, tracks the count.
const topicRadius = (topic) => 26 + Math.min(52, Math.sqrt(topic.count) * 10);
const childRadius = (node) => 19 + Math.min(node.children.length, 6) * 2.2;
/**
 * The outline of one drop at a moment in time: a single closed curve whose
 * radius swells and settles in a few slow, low waves, so the edge is always
 * smooth and the drop reads as one body of liquid. `swell` (0..1) pushes out
 * one soft bulge per piece inside it: the drop about to divide, still whole.
 */
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
    const angle = (i / steps) * 6.283185;
    const wave =
      1 +
      0.075 * Math.sin(2 * angle + a + time * fast) +
      0.05 * Math.sin(3 * angle + b - time * slow) +
      0.03 * Math.sin(angle + c + time * 0.4) +
      (buds ? swell * 0.17 * (0.5 + 0.5 * Math.cos(buds * (angle + Math.PI / 2))) ** 2 : 0);
    xs.push(Math.cos(angle) * radius * wave);
    ys.push(Math.sin(angle) * radius * wave);
  }
  // Curve through the midpoints, steered by the samples: no corners anywhere.
  const mid = (i) => `${((xs[i] + xs[(i + 1) % steps]) / 2).toFixed(1)} ${((ys[i] + ys[(i + 1) % steps]) / 2).toFixed(1)}`;
  let path = `M${mid(steps - 1)}`;
  for (let i = 0; i < steps; i++) path += `Q${xs[i].toFixed(1)} ${ys[i].toFixed(1)} ${mid(i)}`;
  return `${path}Z`;
}

/** Deterministic scatter: the same topics land in the same place for everyone. */
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
      const pull = ((distance - 250) / distance) * 0.04;
      points[a].x += dx * pull;
      points[a].y += dy * pull;
      points[b].x -= dx * pull;
      points[b].y -= dy * pull;
    }
  }
  const layout = new Map();
  topics.forEach((topic, i) => layout.set(topic.id, points[i]));
  return layout;
}

/**
 * Where a topic's content sits once it has split. The first ring surrounds the
 * topic; a piece that has been split again fans its own children outward.
 */
function burstLayout(topic, expanded) {
  const offsets = new Map();
  const first = topic.children.length;
  if (!first) return { offsets, radius: 0 };
  const dense = first > 8;
  const base = Math.max(topicRadius(topic) + 118, (first * (dense ? 78 : 132)) / (Math.PI * 2));
  let radius = base;
  const fan = (node, x, y, angle, depth) => {
    if (!node.children.length || !expanded.has(node.id)) return;
    const count = node.children.length;
    const reach = Math.max(132, (count * 120) / Math.PI);
    const spread = count === 1 ? 0 : Math.min(Math.PI * 1.15, count * 0.62);
    node.children.forEach((child, i) => {
      const turn = count === 1 ? angle : angle - spread / 2 + (spread * i) / (count - 1);
      const dx = x + Math.cos(turn) * reach;
      const dy = y + Math.sin(turn) * reach;
      offsets.set(child.id, { dx, dy, parent: node.id, depth });
      radius = Math.max(radius, Math.hypot(dx, dy));
      fan(child, dx, dy, turn, depth + 1);
    });
  };
  topic.children.forEach((node, i) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / first;
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
  const date = new Date(seconds * 1000);
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
    // The choice just lasts for this session.
  }
}

const STYLE = `
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

// ---------- plugin ----------

export function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const { useState, useEffect, useRef, useMemo, useCallback } = React;

  /** Re-render on an external store without assuming its snapshots are stable. */
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

  /** A kept-current filtered event view owned by the component. */
  function useObserved(session, key, filters, refreshRef) {
    const [state, setState] = useState({ status: "idle", events: [] });
    useEffect(() => {
      if (!filters) {
        setState({ status: "idle", events: [] });
        return undefined;
      }
      let view;
      try {
        view = session.observe(filters);
      } catch (error) {
        setState((previous) => ({ status: "error", events: previous.events, error: String(error) }));
        return undefined;
      }
      const update = () => {
        const next = view.snapshot();
        // A replaced view starts empty; keep what is shown until it has loaded.
        setState((previous) =>
          next.status === "ready" || next.events.length >= previous.events.length
            ? next
            : { ...next, events: previous.events },
        );
      };
      const unsubscribe = view.subscribe(update);
      update();
      const refresh = () => Promise.resolve(view.refresh()).catch(() => {});
      refresh();
      if (refreshRef) refreshRef.current = refresh;
      return () => {
        unsubscribe();
        view.dispose();
      };
    }, [session, key]);
    return state;
  }

  // ----- design kit: every control on the page is one of these -----
  //
  // Button   ghost by default (text, a hover wash); `outline` for a secondary
  //          action that must read as a button; `primary` for the one committing
  //          action in view; `danger` is a ghost that warns on hover. `on` marks
  //          the pressed one of a set. An `icon` with no children is a square
  //          icon button and must carry a `label`.
  // Field    `.xtb-field` is the only framed surface: one hairline, a ring while
  //          focused. Inline for single-line, stacked with a toolbar for prose.
  // Row      `.xtb-row` is a list line with a hover wash; its actions fade in.
  // Card     `.xtb-card` is a block of reading text with the same hover wash.

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
    collapse: "M20 10h-6V4M4 14h6v6M14 10l6-6M10 14l-6 6",
  };

  function Icon({ name, size = 16 }) {
    return h(
      "svg",
      { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { flexShrink: 0 } },
      h("path", { d: ICONS[name] }),
    );
  }

  function Button({ variant, on, icon, label, small, children, type = "button", ...rest }) {
    const bare = icon && children === undefined;
    return h(
      "button",
      {
        type,
        className: "xtb-btn",
        "data-v": variant,
        "data-on": on ? true : undefined,
        "data-icon": bare ? true : undefined,
        "data-small": small ? true : undefined,
        "aria-label": label,
        title: label,
        ...rest,
      },
      icon ? h(Icon, { name: icon, size: small ? 14 : 16 }) : null,
      children,
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
        children,
      ),
    );
  }

  // Who is who, refreshed by the board each time profiles change.
  const people = { name: (pubkey) => `${pubkey.slice(0, 6)}…`, avatar: () => undefined, person: (pubkey) => pubkey };

  /** Whose it is: a face and a name. Falls back to an initial when there is no picture. */
  function Author({ pubkey, size = 18, after, style }) {
    // What an agent files belongs to the person it works for.
    const person = people.person(pubkey);
    const name = people.name(person);
    const source = people.avatar(person);
    const hint = person === pubkey ? name : `${name}（由 ${people.name(pubkey)} 代填）`;
    const [broken, setBroken] = useState(null);
    const disc = { width: size, height: size, borderRadius: "50%", flexShrink: 0 };
    return h(
      "span",
      { className: "xtb-author", title: hint, style: { display: "inline-flex", alignItems: "center", gap: Math.round(size / 3), minWidth: 0, ...style } },
      source && source !== broken
        ? h("img", { src: source, alt: "", draggable: false, onError: () => setBroken(source), style: { ...disc, objectFit: "cover", background: "var(--border)" } })
        : h(
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
                lineHeight: 1,
              },
            },
            [...name.trim()][0] || "?",
          ),
      h("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, name),
      after ? h("span", { style: { flexShrink: 0, color: "var(--text-tertiary)" } }, after) : null,
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
            style: { color: "var(--link-text)", textDecoration: "underline", wordBreak: "break-all" },
          },
          match[0],
        ),
      );
      last = match.index + match[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return h(
      "div",
      { style: { whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 15, lineHeight: 1.75, color: "var(--text-primary)", ...style } },
      parts,
    );
  }

  // ----- the floating map -----

  function Canvas({ graph, active, peek, pinned, selected, linking, onHover, onPick, onChild, onBackground }) {
    const rootRef = useRef(null);
    const elements = useRef(new Map());
    // The liquid itself is drawn on its own filtered layer, under the labels and hit targets.
    const shapes = useRef(new Map());
    const outlines = useRef(new Map());
    const swells = useRef(new Map());
    const lines = useRef(new Map());
    const positions = useRef(new Map());
    const view = useRef({ panX: 0, panY: 0, k: 1, width: 0, height: 0, fitted: 0 });
    const drag = useRef(null);
    const live = useRef({});

    const layout = useMemo(() => layoutTopics(graph.topics, graph.links), [graph]);
    const activeTopic = active ? graph.nodes.get(active) : undefined;
    // Pieces the reader has split a second time. A new topic starts whole again.
    const [expanded, setExpanded] = useState(() => new Set());
    useEffect(() => setExpanded(new Set()), [active]);
    useEffect(() => {
      // Opening a nested piece from the panel splits its ancestors so it is on the map.
      const chain = [];
      for (let node = selected && graph.nodes.get(selected); node && node.kind === "child"; node = graph.nodes.get(node.parent)) {
        const parent = graph.nodes.get(node.parent);
        if (parent && parent.kind === "child") chain.push(parent.id);
      }
      if (chain.length) setExpanded((current) => (chain.every((id) => current.has(id)) ? current : new Set([...current, ...chain])));
    }, [selected, graph]);
    const peekTopic = !activeTopic && peek ? graph.nodes.get(peek) : undefined;
    const burst = useMemo(
      () =>
        activeTopic && activeTopic.kind === "topic"
          ? burstLayout(activeTopic, expanded)
          : { offsets: new Map(), radius: 0 },
      [activeTopic, expanded],
    );
    const budding = false;
    const split = (node) => {
      if (node.children.length) {
        setExpanded((current) => {
          const next = new Set(current);
          if (next.has(node.id)) {
            // Folding a piece folds everything that grew out of it.
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
      const set = new Set();
      for (const link of graph.links) {
        if (link.a === active) set.add(link.b);
        if (link.b === active) set.add(link.a);
      }
      return set;
    }, [graph, active]);
    const burstNodes = useMemo(() => [...burst.offsets.keys()].map((id) => graph.nodes.get(id)).filter(Boolean), [burst, graph]);

    live.current = { graph, layout, active, origin: active, peek: peekTopic ? peek : null, pinned, burst, neighbours, selected, onHover };

    useEffect(() => {
      // Bring a split topic to the middle and pull back far enough to see every piece.
      const state = view.current;
      const spot = active ? layout.get(active) : undefined;
      if (!spot || !state.width) {
        state.goal = undefined;
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
      // Refit when topics first arrive or the count changes a lot, not on every reply.
      const state = view.current;
      const count = layout.size;
      if (count && (!state.fitted || Math.abs(count - state.fitted) >= Math.max(3, state.fitted * 0.3))) {
        fit();
        state.fitted = count;
      }
    }, [layout, fit]);

    useEffect(() => {
      const root = rootRef.current;
      if (!root) return undefined;
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
      const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : undefined;
      observer?.observe(root);
      const onWheel = (event) => {
        event.preventDefault();
        const state = view.current;
        const rect = root.getBoundingClientRect();
        const px = event.clientX - rect.left - state.width / 2 - state.panX;
        const py = event.clientY - rect.top - state.height / 2 - state.panY;
        state.goal = undefined;
        const next = Math.max(0.3, Math.min(1.8, state.k * Math.exp(-event.deltaY * 0.0015)));
        state.panX -= (px / state.k) * (next - state.k);
        state.panY -= (py / state.k) * (next - state.k);
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
        const time = still ? 0 : now / 1000;
        const ease = still ? 1 : 0.16;
        const store = positions.current;
        if (state.goal) {
          const goal = state.goal;
          state.k += (goal.k - state.k) * ease;
          state.panX += (goal.panX - state.panX) * ease;
          state.panY += (goal.panY - state.panY) * ease;
          if (Math.abs(goal.k - state.k) < 0.002 && Math.hypot(goal.panX - state.panX, goal.panY - state.panY) < 0.5) state.goal = undefined;
        }
        const originX = state.width / 2 + state.panX;
        const originY = state.height / 2 + state.panY;
        const scale = Math.max(0.62, Math.min(1.15, state.k));
        const centre = focus ? spots.get(focus) : undefined;
        const keep = new Set();
        for (const topic of g.topics) {
          const spot = spots.get(topic.id);
          if (!spot) continue;
          let targetX = spot.x + Math.sin(time * (0.25 + hash(topic.id, 5) * 0.3) + hash(topic.id, 6) * 6.28) * 7;
          let targetY = spot.y + Math.cos(time * (0.22 + hash(topic.id, 7) * 0.3) + hash(topic.id, 8) * 6.28) * 7;
          if (centre && topic.id !== focus && tree.radius) {
            // The burst shoves neighbouring topics out of its way.
            const dx = spot.x - centre.x;
            const dy = spot.y - centre.y;
            const distance = Math.hypot(dx, dy) || 1;
            // Everything moves outward, nearest most, so neighbours keep their order and do not pile up.
            const clear = tree.radius + 110;
            const shove = clear * Math.exp(-distance / clear);
            targetX += (dx / distance) * shove;
            targetY += (dy / distance) * shove;
          }
          if (topic.id === focus) {
            targetX = spot.x;
            targetY = spot.y;
          }
          let point = store.get(topic.id);
          if (!point) store.set(topic.id, (point = { x: targetX, y: targetY }));
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
        const home = live.current.origin ? store.get(live.current.origin) : undefined;
        if (home) {
          for (const [id, offset] of tree.offsets) {
            const from = store.get(offset.parent) || home;
            let point = store.get(id);
            // New content starts at its parent and flies out: the explosion.
            if (!point) store.set(id, (point = { x: from.x, y: from.y }));
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
        // Every drop keeps moving as one surface. Standing still, it holds its resting shape.
        const leaning = live.current.peek;
        for (const [id, outline] of outlines.current) {
          // A hovered topic leans toward dividing; it relaxes again when the pointer leaves or it splits.
          const want = id === leaning ? 1 : 0;
          const was = swells.current.get(id) || 0;
          const swell = Math.abs(want - was) < 0.004 ? want : was + (want - was) * (still ? 1 : 0.12);
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
      view.current.goal = undefined;
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
      // An unpinned burst closes once the pointer leaves its blast radius.
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

    const linkLines = graph.links.map((link) =>
      h("line", {
        key: `l:${link.id}`,
        ref: attach(lines, `${link.a}|${link.b}`),
        stroke: "var(--text-tertiary)",
        strokeWidth: link.a === active || link.b === active ? 2 : 1.2,
        strokeDasharray: "5 6",
        strokeOpacity: !active || link.a === active || link.b === active ? 0.75 : 0.25,
      }),
    );
    const treeLines = (budding ? [] : burstNodes).map((node) =>
      h("line", {
        key: `t:${node.id}`,
        ref: attach(lines, `${burst.offsets.get(node.id).parent}|${node.id}`),
        stroke: "var(--text-tertiary)",
        strokeWidth: 1,
        strokeOpacity: 0.5,
      }),
    );

    const anchor = { position: "absolute", left: 0, top: 0, width: 0, height: 0, willChange: "transform" };
    const drop = (id, radius, fill, grow, buds = 0) =>
      h(
        "svg",
        { className: "xtb-drop", style: { transform: `scale(${grow})` } },
        h("path", {
          ref: (element) => {
            if (element) outlines.current.set(id, { element, radius, buds });
            else outlines.current.delete(id);
          },
          d: dropPath(id, radius, 0),
          style: { fill },
        }),
      );
    const topicInk = (topic) => (topic.pending ? 34 : !active ? (topic.id === peek ? 90 : 74) : topic.id === active ? 92 : neighbours.has(topic.id) ? 50 : 24);
    const topicShapes = graph.topics.map((topic) =>
      h(
        "div",
        { key: topic.id, ref: attach(shapes, topic.id), style: anchor },
        drop(topic.id, topicRadius(topic), ink(topicInk(topic)), topic.id === peek && !active ? 1.04 : 1, Math.min(topic.children.length, 9)),
      ),
    );
    const childShapes = burstNodes.map((node) =>
      h(
        "div",
        { key: node.id, ref: attach(shapes, node.id), style: anchor },
        h("div", { className: "xtb-born" }, drop(node.id, childRadius(node), ink(node.pending ? 30 : node.id === selected ? 92 : 58), budding ? 0.5 : 1)),
      ),
    );

    const caption = (text, top, width, strong, owner) =>
      h(
        "div",
        { style: { position: "absolute", top, left: -width / 2, width, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 5 } },
        captionText(text, width, strong),
        owner ? h(Author, { pubkey: owner, size: 16, style: { maxWidth: width, fontSize: 12, color: "var(--text-secondary)" } }) : null,
      );
    const captionText = (text, width, strong) =>
      h(
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
            wordBreak: "break-word",
          },
        },
        text,
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
      cursor,
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
          style: { position: "absolute", left: 0, top: 0, width: 0, height: 0, opacity: 0, willChange: "transform" },
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
            style: shell(radius, linking && topic.id !== pinned ? "crosshair" : "pointer"),
          },
          h("span", { className: "xtb-face", style: { ...face, fontSize: Math.round(12 + radius * 0.12) } }, topic.count || "·"),
        ),
        caption(topic.title, radius + 12, 172, isActive, isActive ? topic.author : undefined),
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
          style: { position: "absolute", left: 0, top: 0, width: 0, height: 0, opacity: 0, willChange: "transform" },
        },
        h(
          "button",
          {
            type: "button",
            className: "xtb-pill xtb-born",
            "data-node": "child",
            "aria-label": `${type.label}：${clip(label, 120)}${more ? `，${open ? "已分裂" : "可分裂"} ${more} 条` : ""}`,
            "aria-expanded": more ? open : undefined,
            title: `${type.label}：${clip(label, 120)}`,
            onClick: () => split(node),
            tabIndex: budding ? -1 : undefined,
            "aria-hidden": budding || undefined,
            style: {
              ...shell(radius, "pointer"),
              // A bud is not a target yet: the pointer stays on the topic it grows from.
              pointerEvents: budding ? "none" : undefined,
              transform: budding ? "scale(.42)" : "scale(1)",
              transition: "transform .45s cubic-bezier(.34,1.56,.64,1)",
            },
          },
          h(
            "span",
            { style: { position: "absolute", inset: 0 } },
            h("span", { className: "xtb-face", "aria-hidden": true, style: { ...face, fontSize: Math.round(radius * 0.7), filter: "grayscale(1)", opacity: budding ? 0 : 1 } }, type.icon),
            more && !open && !budding
              ? h(
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
                      textAlign: "center",
                    },
                  },
                  more,
                )
              : null,
          ),
        ),
        budding ? null : caption(label, radius + 8, 124, false, node.id === selected ? node.author : undefined),
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
          backgroundSize: "22px 22px",
        },
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
            h("feColorMatrix", { in: "soft", mode: "matrix", values: "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -11" }),
          ),
        ),
        linkLines,
        treeLines,
      ),
      h("div", { className: "xtb-goo", "aria-hidden": true }, topicShapes, childShapes),
      topicNodes,
      childNodes,
    );
  }

  // ----- the side panel: a reader first, a form second -----

  /**
   * The one multi-line field. It grows with its text up to 40% of the window,
   * then scrolls; the grip below sets a height by hand, and a double-click on
   * the grip hands sizing back to the text.
   */
  function Composer({ topic, target, onTarget, onSend, onDone }) {
    const [type, setType] = useState("extend");
    const [text, setText] = useState("");
    const [problem, setProblem] = useState("");
    const [manual, setManual] = useState(null);
    const [dragging, setDragging] = useState(false);
    // Until someone picks a type, the text picks it: a link is a post, an essay is a draft.
    const [guessing, setGuessing] = useState(true);
    const [over, setOver] = useState(false);
    const guess = (value) =>
      XHS_URL.test(value) ? "post" : value.length > 280 || (value.match(/\n\s*\n/g) || []).length >= 2 ? "draft" : "extend";
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
      note: "随手记一句",
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
        setText(`${file.name.replace(/\.[^.]+$/, "")}\n\n${String(reader.result || "").trim()}`);
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
      // The grip is a separator: arrows resize it, Home returns to automatic.
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
          "data-over": over ? true : undefined,
          onDragOver: (event) => {
            if (![...(event.dataTransfer?.types || [])].includes("Files")) return;
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
          },
        },
        target
          ? h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: 6, padding: "8px 8px 0 12px", fontSize: 12, color: "var(--text-secondary)" } },
              h(Icon, { name: "deeper", size: 14 }),
              h("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, childLabel(target)),
              h(Button, { icon: "x", label: "改为挂在选题下", small: true, onClick: () => onTarget(null) }),
            )
          : null,
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
          },
        }),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 2, padding: "4px 6px 0" } },
          h(
            "div",
            { role: "radiogroup", "aria-label": "内容类型", style: { display: "flex", gap: 2, flexWrap: "wrap", flex: 1, minWidth: 0 } },
            TYPE_ORDER.map((key) =>
              h(
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
                  },
                },
                type === key ? h("span", { "aria-hidden": true, style: { width: 6, height: 6, borderRadius: "50%", background: TYPES[key].color } }) : null,
                TYPES[key].short,
              ),
            ),
          ),
          text.length > MAX_TEXT * 0.8
            ? h("span", { className: "xtb-count", style: text.length > MAX_TEXT ? { color: "var(--text-warning, var(--text-primary))" } : undefined }, `${text.length} / ${MAX_TEXT}`)
            : null,
          h(Button, { icon: expanded ? "collapse" : "expand", label: expanded ? "收起输入框" : "展开输入框", onClick: () => setManual(expanded ? null : tall()) }),
          h(Button, { icon: "clip", label: "上传 txt / md 文稿", onClick: () => fileRef.current?.click() }),
          h(Button, { variant: "primary", disabled: !text.trim(), onClick: submit }, "添加"),
          h("input", { ref: fileRef, type: "file", accept: ".txt,.md,.markdown,text/plain,text/markdown", onChange: onFile, style: { display: "none" } }),
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
          onKeyDown: onGripKey,
        }),
      ),
      problem ? h("p", { role: "alert", style: { ...mutedStyle, fontSize: 12, color: "var(--text-warning, var(--text-primary))" } }, problem) : null,
    );
  }

  /** A Xiaohongshu post: title, who posted it, how it did, why it works, a way in. */
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
      post.url
        ? h(
            "a",
            { className: "xtb-btn", "data-v": "outline", href: post.url, target: "_blank", rel: "noreferrer", style: { alignSelf: "flex-start", textDecoration: "none", marginTop: 2 } },
            XHS_URL.test(post.url) ? "打开小红书" : `打开 ${hostOf(post.url)}`,
            h(Icon, { name: "out", size: 13 }),
          )
        : null,
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
        style: { marginLeft: Math.min(depth, 4) * 18 - 12, opacity: node.pending ? 0.6 : 1 },
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
          mine ? h(Button, { icon: "trash", label: "删除这条内容", variant: "danger", small: true, onClick: () => onRemove(node.id, "删除这条内容？") }) : null,
        ),
      ),
      node.type === "post"
        ? h(PostView, { body: node.body })
        : h(
            "div",
            { style: long && !open ? { maxHeight: "11.5em", overflow: "hidden", WebkitMaskImage: "linear-gradient(#000 70%, transparent)", maskImage: "linear-gradient(#000 70%, transparent)" } : undefined },
            titled ? h("div", { style: { fontSize: 15, fontWeight: 600, lineHeight: 1.5, marginBottom: 2 } }, lines[0].trim()) : null,
            h(Linked, { text: (titled ? lines.slice(1).join("\n").trim() : node.body) || "（空）" }),
          ),
      long ? h(Button, { small: true, style: { marginLeft: -8, marginTop: 2 }, onClick: () => onOpen(node.id) }, open ? "收起" : "展开全文") : null,
    );
  }

  /** A connected topic, shown the way the map shows it: its dot, its title, its size. */
  function LinkedTopic({ topic, removable, onOpen, onRemove }) {
    return h(
      "div",
      { className: "xtb-row" },
      h(
        "button",
        { type: "button", className: "xtb-rowmain", title: topic.title, onClick: onOpen },
        h("span", { "aria-hidden": true, style: { width: 10, height: 10, borderRadius: "50%", background: topicColour(topic.id), flexShrink: 0 } }),
        h("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, topic.title),
        h("span", { style: { fontSize: 12, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" } }, topic.count || ""),
      ),
      removable ? h("span", { className: "xtb-acts", style: { display: "flex" } }, h(Button, { icon: "x", label: `取消与「${topic.title}」的连接`, small: true, onClick: onRemove })) : null,
    );
  }

  function Panel({ graph, topic, selected, viewer, nameOf, linking, onLinking, onSelect, onSend, onRemove, onPick, onClose }) {
    const [target, setTarget] = useState(null);
    const [adding, setAdding] = useState(false);
    const [filter, setFilter] = useState("all");
    const [opened, setOpened] = useState(() => new Set());
    useEffect(() => {
      setTarget(null);
      setAdding(false);
      setFilter("all");
      setOpened(new Set());
    }, [topic.id]);
    useEffect(() => {
      if (!selected) return;
      setOpened((previous) => new Set(previous).add(selected));
      setFilter("all");
    }, [selected]);
    const liveTarget = target ? graph.nodes.get(target) : undefined;
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
    const toggle = (id) =>
      setOpened((previous) => {
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
          boxSizing: "border-box",
        },
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
          topic.author === viewer
            ? h(Button, { icon: "trash", label: "删除选题", variant: "danger", onClick: () => onRemove(topic.id, "删除这个选题？它下面的内容会留在频道的话题串里。") })
            : null,
          h(Button, { icon: "x", label: "关闭", onClick: onClose }),
        ),
        h("h2", { style: { margin: 0, paddingRight: 8, fontSize: 20, fontWeight: 650, lineHeight: 1.4, wordBreak: "break-word" } }, topic.title),
      ),
      h(
        "div",
        { style: { padding: "0 20px 28px", display: "flex", flexDirection: "column", gap: 18 } },
        topic.body ? h(Linked, { text: topic.body }) : null,
        adding ? h(Composer, { topic, target: liveTarget, onTarget: setTarget, onSend, onDone: () => setAdding(false) }) : null,
        links.length || linking
          ? h(
              "section",
              { style: section },
              h("div", { style: heading }, h("span", { className: "xtb-label" }, "关联选题"), h("span", { className: "xtb-count" }, links.length || "")),
              links.map((link) => {
                const other = graph.nodes.get(link.a === topic.id ? link.b : link.a);
                return h(LinkedTopic, { key: link.id, topic: other, removable: link.author === viewer, onOpen: () => onPick(other.id), onRemove: () => onRemove(link.id) });
              }),
              linking
                ? h(
                    "div",
                    { className: "xtb-row", "data-pending": true, role: "status" },
                    h("span", { className: "xtb-rowmain", style: { cursor: "default", color: "var(--text-secondary)" } }, h(Icon, { name: "link", size: 14 }), "在图上点一个选题"),
                    h(Button, { small: true, onClick: () => onLinking(false) }, "取消"),
                  )
                : null,
            )
          : null,
        h(
          "section",
          { style: section },
          h(
            "div",
            { style: heading },
            h("span", { className: "xtb-label" }, "内容"),
            h("span", { className: "xtb-count", style: { flex: 1 } }, flat.length || ""),
            present.length > 1
              ? h(
                  "div",
                  { role: "radiogroup", "aria-label": "按类型筛选", style: { display: "flex", gap: 2 } },
                  ["all", ...present].map((key) =>
                    h(Button, { key, role: "radio", "aria-checked": filter === key, on: filter === key, small: true, onClick: () => setFilter(key) }, key === "all" ? "全部" : TYPES[key].short),
                  ),
                )
              : null,
          ),
          shown.length
            ? shown.map(({ node, depth }) =>
                h(ContentCard, {
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
                  onRemove,
                }),
              )
            : h("p", { style: { ...mutedStyle, color: "var(--text-tertiary)", padding: "6px 0" } }, "还没有内容"),
        ),
      ),
    );
  }

  // ----- the board: one channel's topics -----

  function Board({ session, viewer, scope }) {
    const subscribeChannels = useCallback((listener) => session.channels.subscribeList(listener), [session]);
    const listing = useStore(subscribeChannels, () => session.channels.list());
    const channels = useMemo(
      () =>
        (listing?.channels || [])
          .filter((channel) => channel && channel.id && !channel.huddle && !channel.metadataPending && channel.name)
          .filter((channel) => !channel.members || channel.members.includes(viewer))
          .sort((a, b) => String(a.name).localeCompare(String(b.name), "zh")),
      [listing, viewer],
    );
    const [choice, setChoice] = useState(() => loadChoice(scope));
    const channel =
      channels.find((candidate) => candidate.id === choice) ||
      (choice ? undefined : channels.find((candidate) => /选题|小红书|xhs/i.test(String(candidate.name))));
    const channelId = channel?.id;

    const refreshTopics = useRef(null);
    const refreshReplies = useRef(null);
    const main = useObserved(
      session,
      channelId || "",
      channelId ? [{ kinds: [9], "#h": [channelId], limit: 500 }] : undefined,
      refreshTopics,
    );
    const rootIds = useMemo(
      () =>
        main.events
          .filter((event) => event.kind === 9 && !event.tags.some((tag) => tag[0] === "e"))
          .map((event) => event.id)
          .sort(),
      [main.events],
    );
    const replyFilters = useMemo(() => {
      if (!channelId || !rootIds.length) return undefined;
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
      (listener) => (typeof profiles?.subscribe === "function" ? profiles.subscribe(listener) : () => {}),
      [profiles],
    );
    const profileMap = useStore(subscribeProfiles, () => {
      try {
        return profiles?.snapshot?.();
      } catch {
        return undefined;
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
    // Owners become known as agent profiles load, so the list is recomputed with the profile map.
    const authors = [...new Set(writers.flatMap((pubkey) => [pubkey, personOf(pubkey)]))].sort().join(",");
    useEffect(() => {
      if (authors) Promise.resolve(profiles?.ensure?.(authors.split(","))).catch(() => {});
    }, [authors, profiles]);
    const nameOf = (pubkey) => profileMap?.get?.(pubkey)?.name || (pubkey === viewer ? "我" : `${pubkey.slice(0, 6)}…`);
    people.name = nameOf;
    people.person = personOf;
    people.avatar = (pubkey) => {
      const profile = profileMap?.get?.(pubkey);
      const picture = profile?.picture || profile?.avatar;
      if (typeof picture !== "string" || !picture) return undefined;
      try {
        // The community serves a small, access-checked copy; fall back to the address as published.
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

    const pinnedTopic = pinned ? graph.nodes.get(pinned) : undefined;
    // A topic splits when it is clicked, not when the pointer passes over it.
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
      if (!notice) return undefined;
      const timer = setTimeout(() => setNotice(""), 6000);
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
    const addContent = (type, body, parentId) =>
      attempt(() => {
        const text = `${TYPES[type].icon} ${body}`;
        const outbox = session.outbox;
        if (parentId !== pinned && outbox?.supports?.(9)) {
          // A reply to a reply keeps the topic as its thread root.
          outbox.send({
            kind: 9,
            content: text,
            tags: [
              ["h", channelId],
              ["e", pinned, "", "root"],
              ["e", parentId, "", "reply"],
            ],
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
        listing?.status === "ready"
          ? h("p", { style: mutedStyle }, "在 Buzz 里新建一个频道（建议起名「小红书选题」），把要一起共建的同事拉进来，再回到这里。频道里的人看到的是同一张图。")
          : null,
      );
    }

    const header = h(
      "header",
      { style: { display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border)" } },
      channelId
        ? h(
            "form",
            {
              className: "xtb-field",
              "data-inline": true,
              onSubmit: (event) => {
                event.preventDefault();
                addTopic();
              },
            },
            h("span", { style: { display: "grid", placeItems: "center", color: "var(--text-tertiary)" } }, h(Icon, { name: "plus", size: 15 })),
            h("input", {
              value: draft,
              onChange: (event) => setDraft(event.target.value),
              placeholder: "丢一个选题",
              "aria-label": "新选题",
              maxLength: 300,
              enterKeyHint: "send",
            }),
            draft.trim() ? h(Button, { type: "submit", variant: "primary", small: true }, "添加") : null,
          )
        : null,
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
          },
        },
        channelId ? null : h("option", { value: "" }, "选择频道"),
        channels.map((candidate) => h("option", { key: candidate.id, value: candidate.id }, `# ${candidate.name}`)),
      ),
      channelId
        ? h(Button, {
            icon: "refresh",
            label: "刷新",
            onClick: () => {
              refreshTopics.current?.();
              refreshReplies.current?.();
            },
          })
        : null,
    );

    if (!channelId) {
      return h(
        "div",
        { style: { height: "100%", display: "flex", flexDirection: "column" } },
        header,
        h(Message, { title: "在右上角选一个放选题的频道" }),
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
          },
        }),
        status
          ? h("p", { role: "status", style: { ...mutedStyle, position: "absolute", left: 16, right: 16, top: "42%", textAlign: "center", pointerEvents: "none" } }, status)
          : null,
        pinnedTopic
          ? h(Panel, {
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
              },
            })
          : null,
      ),
      notice
        ? h(
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
                zIndex: 10,
              },
            },
            notice,
          )
        : null,
    );
  }

  function Page() {
    const subscribe = useCallback((listener) => ctx.relay.subscribe(listener), []);
    const connection = useStore(subscribe, () => ctx.relay.snapshot());
    if (connection.status !== "ready" || !connection.session || !connection.viewer) {
      return h(
        Message,
        { title: connection.status === "error" ? "连接出错" : "正在连接社区…" },
        h("p", { style: mutedStyle }, connection.status === "error" ? connection.error || "请稍后重试。" : "连上之后会显示选题图。"),
      );
    }
    return h(Board, {
      key: `${connection.scope}:${connection.generation}`,
      session: connection.session,
      viewer: connection.viewer,
      scope: connection.scope || "",
    });
  }

  ctx.pages.register({
    id: "board",
    title: "选题灵感",
    primary: true,
    placement: "dock", // the Apps icon bar; the default lists it among the sidebar pages
    icon: PAGE_ICON,
    layout: "workspace",
    component: Page,
  });

  // ----- tools: agents fill the map, acting as themselves -----

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
      (channel) => channel?.id && channel.name && !channel.huddle && (!channel.members || !viewer || channel.members.includes(viewer)),
    );
    const found = wanted
      ? channels.find((channel) => channel.id === wanted || channel.name === wanted)
      : channels.find((channel) => /选题|小红书|xhs/i.test(String(channel.name)));
    if (!found) {
      throw Error(
        `找不到选题频道${wanted ? `「${wanted}」` : ""}。这个 agent 需要先被拉进该频道。它现在所在的频道：${channels.map((channel) => channel.name).join("、") || "无"}`,
      );
    }
    return found;
  }

  async function graphOf(session, channelId, signal) {
    const main = await session.read([{ kinds: [9], "#h": [channelId], limit: 500 }], { signal });
    const roots = main.filter((event) => event.kind === 9 && !event.tags.some((tag) => tag[0] === "e")).map((event) => event.id);
    const replies = [];
    for (let i = 0; i < roots.length; i += 100) {
      replies.push(...(await session.read([{ kinds: [9], "#h": [channelId], "#e": roots.slice(i, i + 100), limit: 500 }], { signal })));
    }
    return buildGraph([...main, ...replies]);
  }

  function topicOf(graph, reference) {
    const wanted = String(reference || "").trim();
    if (!wanted) throw Error("需要 topic：选题的 ID 或标题。");
    const byId = graph.topics.filter((topic) => topic.id === wanted || (wanted.length >= 6 && /^[0-9a-f]+$/.test(wanted) && topic.id.startsWith(wanted)));
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
          ["e", parentId, "", "reply"],
        ],
      });
    }
    return session.messages.reply(channelId, topic.id, content);
  }

  function parentOf(graph, topic, reference) {
    const wanted = String(reference || "").trim();
    if (!wanted) return undefined;
    const hits = [...graph.nodes.values()].filter((node) => node.kind === "child" && node.topic === topic.id && node.id.startsWith(wanted));
    if (hits.length !== 1) throw Error(`parent「${wanted}」在这个选题下${hits.length ? "匹配到多条" : "不存在"}，请用 xhs_topics_list 查到的内容 ID。`);
    return hits[0].id;
  }

  const describe = (node, depth) => {
    const pad = "  ".repeat(depth);
    const body = node.type === "post" ? node.body : clip(node.body.replace(/\s+/g, " "), 300);
    const lines = [`${pad}- [${node.id.slice(0, 8)}] ${TYPES[node.type].icon}${TYPES[node.type].short}：${body.replace(/\n/g, `\n${pad}  `)}`];
    for (const child of node.children) lines.push(...describe(child, depth + 1));
    return lines;
  };
  const shortId = (id) => (typeof id === "string" ? `，ID ${id.slice(0, 8)}` : "");

  ctx.agents.addTool({
    name: "xhs_topics_list",
    description:
      "读取小红书选题灵感图。不带 topic：列出所有选题及其内容数量。带 topic：返回该选题下的全部内容（延伸选题、帖子、文稿、研究）和已连接的选题。写入前先调用它，避免重复。",
    inputSchema: { type: "object", properties: { topic: TOPIC_HINT, channel: CHANNEL_HINT }, additionalProperties: false },
    async call(client, context, args) {
      const session = sessionOf(client);
      const channel = channelOf(session, field(args, "channel"));
      const graph = await graphOf(session, channel.id, client.signal);
      if (!field(args, "topic")) {
        if (!graph.topics.length) return `频道「${channel.name}」里还没有选题。`;
        const rows = [...graph.topics]
          .sort((a, b) => b.at - a.at)
          .map((topic) => {
            const counts = {};
            const tally = (nodes) => {
              for (const node of nodes) {
                counts[node.type] = (counts[node.type] || 0) + 1;
                tally(node.children);
              }
            };
            tally(topic.children);
            const detail = TYPE_ORDER.filter((key) => counts[key])
              .map((key) => `${TYPES[key].short}${counts[key]}`)
              .join(" ");
            return `- [${topic.id.slice(0, 8)}] ${topic.title}${detail ? `（${detail}）` : "（空）"}`;
          });
        return `频道「${channel.name}」共 ${graph.topics.length} 个选题：\n${rows.join("\n")}`;
      }
      const topic = topicOf(graph, args.topic);
      const linked = graph.links
        .filter((link) => link.a === topic.id || link.b === topic.id)
        .map((link) => graph.nodes.get(link.a === topic.id ? link.b : link.a))
        .map((other) => `[${other.id.slice(0, 8)}] ${other.title}`);
      return [
        `选题 [${topic.id.slice(0, 8)}] ${topic.title}`,
        topic.body ? `说明：${topic.body}` : "",
        linked.length ? `已连接：${linked.join("；")}` : "",
        topic.children.length ? `内容（${topic.count} 条）：` : "还没有内容。",
        ...topic.children.flatMap((child) => describe(child, 0)),
      ]
        .filter(Boolean)
        .join("\n");
    },
  });

  ctx.agents.addTool({
    name: "xhs_topics_inbox",
    description:
      "读取选题频道里还没进灵感图的普通聊天消息，供你判断哪些值得收录。聊天不会自动上图：由你挑出有价值的，整理、改写、归类后，用 xhs_topics_add 建选题，或用 xhs_topics_add_content / xhs_topics_add_post 挂到已有选题下。闲聊、寒暄、重复的不要收。",
    inputSchema: {
      type: "object",
      properties: {
        hours: { type: "number", description: "只看最近多少小时的消息，默认 72。" },
        limit: { type: "number", description: "最多返回多少条，默认 50，上限 200。" },
        channel: CHANNEL_HINT,
      },
      additionalProperties: false,
    },
    async call(client, context, args) {
      const session = sessionOf(client);
      const channel = channelOf(session, field(args, "channel"));
      const hours = Number.isFinite(args.hours) && args.hours > 0 ? args.hours : 72;
      const limit = Math.min(200, Number.isFinite(args.limit) && args.limit > 0 ? Math.floor(args.limit) : 50);
      const graph = await graphOf(session, channel.id, client.signal);
      const since = Date.now() / 1000 - hours * 3600;
      const recent = graph.loose.filter((item) => item.at >= since);
      if (!recent.length) return `频道「${channel.name}」最近 ${hours} 小时没有未收录的聊天消息。`;
      const shown = recent.slice(0, limit);
      await Promise.resolve(session.profiles?.ensure?.([...new Set(shown.map((item) => item.author))])).catch(() => {});
      const names = session.profiles?.snapshot?.();
      const rows = shown.map((item) => {
        const who = names?.get?.(item.author)?.name || item.author.slice(0, 8);
        const where = item.under ? `（在选题 [${item.under.slice(0, 8)}] ${graph.nodes.get(item.under).title} 的话题串里）` : "";
        return `- [${item.id.slice(0, 8)}] ${formatTime(item.at)} ${who}${where}：${clip(item.text.replace(/\s+/g, " "), 600)}`;
      });
      return [
        `频道「${channel.name}」最近 ${hours} 小时有 ${recent.length} 条未收录的聊天${recent.length > shown.length ? `，显示最新 ${shown.length} 条` : ""}：`,
        ...rows,
        "这些只是聊天原文，没有上图。挑出值得收录的，整理后用写入工具添加；不确定是否值得收录时先问人。",
      ].join("\n");
    },
  });

  ctx.agents.addTool({
    name: "xhs_topics_add",
    description: "往小红书选题灵感图里丢一个新选题（图上的一个点）。标题要像一条小红书选题：具体、有钩子。同名选题已存在时不会重复创建。",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "选题标题，一行，建议 30 字以内。" },
        note: { type: "string", description: "可选：选题说明，比如目标人群、切入角度、为什么可能爆。" },
        channel: CHANNEL_HINT,
      },
      required: ["title"],
      additionalProperties: false,
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
      const id = session.messages.send(channel.id, `${TOPIC_ICON} ${title}${note ? `\n${note}` : ""}`);
      return `已添加选题「${title}」${shortId(id)}。`;
    },
  });

  ctx.agents.addTool({
    name: "xhs_topics_add_content",
    description:
      "往一个选题里填内容：extend=延伸选题（一条一个角度），draft=文稿（第一行是标题，后面是正文），research=深入研究（发现、数据、来源链接），note=随手笔记。小红书帖子请用 xhs_topics_add_post。parent 可把内容挂在某条已有内容下面继续深入。",
    inputSchema: {
      type: "object",
      properties: {
        topic: TOPIC_HINT,
        type: { type: "string", enum: ["extend", "draft", "research", "note"] },
        text: { type: "string", description: "内容正文，纯文本，可多行，可带链接。" },
        parent: { type: "string", description: "可选：挂在哪条内容下面（该内容的 ID 前缀）。省略则直接挂在选题下。" },
        channel: CHANNEL_HINT,
      },
      required: ["topic", "type", "text"],
      additionalProperties: false,
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
    },
  });

  ctx.agents.addTool({
    name: "xhs_topics_add_post",
    description:
      "把一篇小红书帖子挂到选题下，作为对标参考。尽量填全：标题、链接（保留完整链接含 xsec_token，否则打不开）、作者、赞藏评数据，以及 why——这篇为什么火、可以借鉴什么。同一篇帖子在同一选题下不会重复添加。",
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
        channel: CHANNEL_HINT,
      },
      required: ["topic", "url"],
      additionalProperties: false,
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
        return other.url === url || (!!noteId && other.noteId === noteId);
      });
      if (duplicate) return `这篇帖子已经在「${topic.title}」下了（[${duplicate.id.slice(0, 8)}]），没有重复添加。`;
      const one = (value) =>
        String(value ?? "")
          .replace(/[\n｜|]/g, " ")
          .trim();
      const meta = [
        one(args.author) && `作者：${one(args.author).replace(/^@/, "")}`,
        one(args.likes) && `赞 ${one(args.likes)}`,
        one(args.collects) && `藏 ${one(args.collects)}`,
        one(args.comments) && `评 ${one(args.comments)}`,
      ].filter(Boolean);
      const tags = Array.isArray(args.tags)
        ? args.tags
            .map((tag) => one(tag).replace(/^#/, ""))
            .filter(Boolean)
            .slice(0, 12)
        : [];
      const why = field(args, "why");
      const content = [
        `${TYPES.post.icon} ${one(field(args, "title")) || "小红书帖子"}`,
        url,
        meta.join(" ｜ "),
        why && `亮点：${why}`,
        tags.length && `标签：${tags.map((tag) => `#${tag}`).join(" ")}`,
      ]
        .filter(Boolean)
        .join("\n");
      if (content.length > MAX_TEXT) throw Error(`内容过长，上限 ${MAX_TEXT} 字。`);
      const parent = parentOf(graph, topic, args.parent);
      const id = replyAs(session, client, channel.id, topic, parent, content);
      return `已把帖子挂到「${topic.title}」下${shortId(id)}。`;
    },
  });

  ctx.agents.addTool({
    name: "xhs_topics_link",
    description: "把两个相关的选题连起来（图上出现一条连线），比如同一人群、同一系列、可以互相引流的选题。已连接的不会重复。",
    inputSchema: {
      type: "object",
      properties: { from: TOPIC_HINT, to: TOPIC_HINT, channel: CHANNEL_HINT },
      required: ["from", "to"],
      additionalProperties: false,
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
    },
  });
}

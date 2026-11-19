// src/sixlab-portfolio/archive.mjs
var MEDIA = /* @__PURE__ */ new Map([
  ["webp", "image/webp"],
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["mp4", "video/mp4"]
]);
var decoder = new TextDecoder();
var LIMIT = 450 * 1024 * 1024;
var MAX_INDEX_SIZE = 1024 * 1024;
function invalid() {
  return new Error("请选择随作品集交付的 ZIP 素材包。");
}
async function bytes(file, start, size) {
  if (start < 0 || size < 0 || start + size > file.size) throw invalid();
  return new DataView(await file.slice(start, start + size).arrayBuffer());
}
async function readDirectory(file) {
  if (file.size < 22 || file.size > LIMIT) throw invalid();
  const tailSize = Math.min(file.size, 65557);
  const tail = await bytes(file, file.size - tailSize, tailSize);
  let end = tailSize - 22;
  while (end >= 0) {
    if (tail.getUint32(end, true) === 101010256 && end + 22 + tail.getUint16(end + 20, true) === tailSize) break;
    end--;
  }
  if (end < 0 || tail.getUint32(end + 4, true) !== 0) throw invalid();
  const count = tail.getUint16(end + 10, true);
  const size = tail.getUint32(end + 12, true);
  const start = tail.getUint32(end + 16, true);
  if (!count || count > 5e3 || size > MAX_INDEX_SIZE || start + size !== file.size - tailSize + end) throw invalid();
  const directory = await bytes(file, start, size);
  const files = /* @__PURE__ */ new Map();
  let offset = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > size || directory.getUint32(offset, true) !== 33639248) throw invalid();
    const flags = directory.getUint16(offset + 8, true);
    const method = directory.getUint16(offset + 10, true);
    const length = directory.getUint32(offset + 24, true);
    const nameLength = directory.getUint16(offset + 28, true);
    const nameStart = offset + 46;
    const local = directory.getUint32(offset + 42, true);
    const next = nameStart + nameLength + directory.getUint16(offset + 30, true) + directory.getUint16(offset + 32, true);
    if (next > size || local + 30 > start || flags & 1 || method !== 0 || length !== directory.getUint32(offset + 20, true)) throw invalid();
    const name = decoder.decode(new Uint8Array(directory.buffer, nameStart, nameLength));
    if (files.has(name)) throw invalid();
    files.set(name, { local, length });
    offset = next;
  }
  if (offset !== size) throw invalid();
  return { files, start };
}
function sourceLink(value) {
  if (typeof value !== "string") return "";
  return /^https:\/\/(?:www\.xiaohongshu\.com\/explore\/[a-f0-9]{24}|xhslink\.cn\/o\/[A-Za-z0-9]+)$/.test(value) ? value : "";
}
async function readArchive(file) {
  const { files, start } = await readDirectory(file);
  async function asset(name) {
    const entry = files.get(name);
    const mime = MEDIA.get(name.split(".").at(-1));
    if (!entry || !mime && name !== "portfolio.json") throw invalid();
    const header = await bytes(file, entry.local, 30);
    if (header.getUint32(0, true) !== 67324752 || header.getUint16(8, true) !== 0) throw invalid();
    const begin = entry.local + 30 + header.getUint16(26, true) + header.getUint16(28, true);
    if (begin + entry.length > start) throw invalid();
    return file.slice(begin, begin + entry.length, mime || "application/json");
  }
  const index = await asset("portfolio.json");
  if (index.size > MAX_INDEX_SIZE) throw invalid();
  const data = JSON.parse(await index.text());
  if (data.schema !== 1 || !/^[a-z0-9-]{1,80}$/.test(data.edition) || !Number.isInteger(data.part) || !Number.isInteger(data.parts) || data.part < 1 || data.part > data.parts || data.parts > 40 || !Array.isArray(data.notes) || data.notes.length > 500) throw invalid();
  const ids = /* @__PURE__ */ new Set();
  const notes = data.notes.map((note) => {
    if (typeof note?.id !== "string" || !/^[a-f0-9]{24}$/.test(note.id) || ids.has(note.id) || !Number.isInteger(note.order) || note.order < 0 || typeof note.title !== "string" || !note.title.trim() || !Array.isArray(note.images)) throw invalid();
    ids.add(note.id);
    function media(name, pattern) {
      return typeof name === "string" && name.startsWith("media/" + note.id + "/") && pattern.test(name.split("/").at(-1)) && files.has(name);
    }
    const photos = note.images.filter((name) => media(name, /^\d+\.(?:webp|jpg|png)$/));
    const video = media(note.video, /^video\.mp4$/) ? note.video : "";
    return {
      id: note.id,
      order: note.order,
      title: note.title.slice(0, 350),
      author: String(note.author || "").slice(0, 100),
      description: String(note.description || "").slice(0, 4e4),
      date: /^\d{4}-\d{2}-\d{2}$/.test(note.date) ? note.date : "",
      source: sourceLink(note.source),
      featured: note.featured === true,
      isVideo: note.isVideo === true,
      images: photos,
      video,
      asset
    };
  });
  return { file, edition: data.edition, part: data.part, parts: data.parts, notes };
}
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("opcb.sixlab-portfolio", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("archives");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("素材库正在更新，请关闭其他作品集窗口后重试。"));
  });
}
async function archiveTransaction(mode, operation) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("archives", mode);
      const request = operation(tx.objectStore("archives"));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || new Error("素材存储操作中断。"));
    });
  } finally {
    db.close();
  }
}
var restoreFiles = async (scope) => await archiveTransaction("readonly", (store) => store.get(scope)) || [];
var storeFiles = (scope, files) => archiveTransaction("readwrite", (store) => store.put(files, scope));
function combineArchives(current, additions) {
  if (!additions.length) return current;
  const [{ edition, parts }] = additions;
  const groups = /* @__PURE__ */ new Map();
  for (const archive of [...current.filter((item) => item.edition === edition && item.parts === parts), ...additions]) {
    if (archive.edition !== edition || archive.parts !== parts) throw new Error("请一次导入同一版作品集的素材包。");
    groups.set(archive.part, archive);
  }
  const ids = /* @__PURE__ */ new Set();
  for (const archive of groups.values()) {
    for (const note of archive.notes) {
      if (ids.has(note.id)) throw new Error("素材包包含重复作品，请重新下载。");
      ids.add(note.id);
    }
  }
  return [...groups.values()].sort((a, b) => a.part - b.part);
}

// src/sixlab-portfolio/workspace.css
var workspace_default = '.sixlab-workspace,\n.sx-dialog {\n  --sx-bg: #f4f1ea;\n  --sx-ink: #25241f;\n  --sx-muted: #5d5a51;\n  --sx-line: #d5cfc3;\n  --sx-card: #eeeae0;\n  --sx-focus: #a34422;\n  color: var(--sx-ink);\n  font: 15px/1.55 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;\n}\n.sixlab-workspace[data-theme=dark],\n.sx-dialog[data-theme=dark] {\n  --sx-bg: #1d1c1a;\n  --sx-ink: #f6f0e6;\n  --sx-muted: #bfb6a8;\n  --sx-line: #4b4740;\n  --sx-card: #282622;\n  --sx-focus: #f5b798;\n}\n@media (prefers-color-scheme: dark) {\n  .sixlab-workspace[data-theme=auto],\n  .sx-dialog[data-theme=auto] {\n    --sx-bg: #1d1c1a;\n    --sx-ink: #f6f0e6;\n    --sx-muted: #bfb6a8;\n    --sx-line: #4b4740;\n    --sx-card: #282622;\n    --sx-focus: #f5b798;\n  }\n}\n.sixlab-workspace { height: 100%; min-height: 0; flex: 1 1 auto; overflow: auto; background: var(--sx-bg); }\n.sx-inner { max-width: 1540px; margin: auto; padding: 0 clamp(18px,4vw,64px) 60px; }\n.sx-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 76px; border-bottom: 1px solid var(--sx-line); }\n.sx-wordmark { display: flex; align-items: baseline; gap: 12px; font-size: 38px; font-weight: 780; letter-spacing: -.105em; line-height: 1; white-space: nowrap; }\n.sx-wordmark span { font-size: 13px; font-weight: 700; letter-spacing: .06em; }\n.sx-header-actions, .sx-stepper, .sx-media-actions { display: flex; align-items: center; gap: 8px; }\n.sx-header-actions button, .sx-header-actions select { white-space: nowrap; }\n.sixlab-workspace button, .sixlab-workspace input, .sixlab-workspace select, .sx-dialog button {\n  min-width: 0; min-height: 40px; padding: 6px 13px; border: 1px solid var(--sx-line);\n  border-radius: 8px; background: transparent; color: inherit; font: inherit;\n}\n.sixlab-workspace button, .sx-dialog button, .sx-theme select { cursor: pointer; }\n.sixlab-workspace button:hover, .sx-dialog button:hover { border-color: var(--sx-ink); }\n.sixlab-workspace button:disabled, .sx-dialog button:disabled { opacity: .45; cursor: default; }\n.sixlab-workspace :focus-visible, .sx-dialog :focus-visible { outline: 2px solid var(--sx-focus); outline-offset: 3px; }\n.sixlab-workspace input::placeholder { color: var(--sx-muted); }\n.sixlab-workspace select option { background: var(--sx-bg); color: var(--sx-ink); }\n.sixlab-workspace .sx-hero {\n  position: relative; isolation: isolate; display: grid; align-items: end; width: 100%; min-height: clamp(350px,45vw,630px); margin-top: 22px;\n  padding: 0; overflow: hidden; border: 0; border-radius: 14px; background: #24221e; text-align: left; color: white;\n}\n.sx-hero .sx-cover, .sx-hero::after { position: absolute; inset: 0; z-index: -1; }\n.sx-hero .sx-cover { border-radius: 0; }\n.sx-hero::after { content: ""; background: linear-gradient(20deg,#17130f 0%,#17130fcb 24%,#17130f20 65%,transparent 100%); }\n.sx-hero .sx-cover img { object-position: center 46%; }\n.sx-hero-copy { padding: clamp(22px,5vw,76px); }\n.sx-hero-copy p { margin: 0 0 12px; font-size: 13px; letter-spacing: .13em; font-weight: 700; }\n.sx-hero-copy h1 { max-width: 16em; margin: 0 0 24px; font-size: clamp(30px,5vw,68px); font-weight: 720; line-height: 1.1; letter-spacing: -.055em; text-wrap: balance; }\n.sx-hero-copy span { display: inline-block; padding: 8px 15px; border-radius: 30px; background: #fff; color: #201d19; font-weight: 700; font-size: 14px; }\n.sx-catalog { margin-top: clamp(28px,5vw,66px); }\n.sx-catalog-head { display: flex; gap: 16px; align-items: center; justify-content: space-between; }\n.sx-catalog h2 { margin: 0; font-size: clamp(26px,4vw,46px); line-height: 1.12; letter-spacing: -.06em; }\n.sx-search input { width: clamp(130px,24vw,260px); }\n.sx-filters { display: flex; flex-wrap: wrap; gap: 7px; margin: 16px 0 20px; }\n.sixlab-workspace .sx-filters button { min-height: 37px; border-radius: 99px; }\n.sixlab-workspace .sx-filters button[aria-pressed=true] { color: var(--sx-bg); background: var(--sx-ink); border-color: var(--sx-ink); }\n.sx-grid { list-style: none; display: grid; grid-template-columns: repeat(auto-fill,minmax(min(100%,250px),1fr)); gap: clamp(15px,2.3vw,30px); align-items: start; padding: 0; margin: 0; }\n.sixlab-workspace .sx-card { display: block; width: 100%; padding: 0 0 16px; border: 0; border-bottom: 1px solid var(--sx-line); border-radius: 0; text-align: left; }\n.sx-card .sx-cover { aspect-ratio: 4/3; border-radius: 10px; }\n.sx-cover { position: relative; overflow: hidden; background: var(--sx-card); }\n.sx-cover img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform .25s ease; }\n.sx-card:hover img, .sx-hero:hover img { transform: scale(1.035); }\n.sx-video-mark { position: absolute; bottom: 10px; right: 10px; width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; background: #20201edb; color: white; font-size: 11px; }\n.sx-card-meta { display: flex; align-items: start; justify-content: space-between; gap: 8px; margin: 11px 0 5px; color: var(--sx-muted); font-size: 12px; }\n.sx-card h3 { margin: 0; line-height: 1.35; font-size: 16px; font-weight: 710; overflow-wrap: anywhere; }\n.sx-quiet { color: var(--sx-muted); }\n.sx-notice { margin: 14px 0 0; color: var(--sx-muted); }\n.sx-empty { margin-top: 46px; padding: clamp(20px,5vw,50px); border: 1px solid var(--sx-line); border-radius: 14px; }\n.sx-empty h1 { margin: 0; font-size: clamp(24px,4vw,40px); }\n.sx-empty p { color: var(--sx-muted); }\n.sx-dialog { box-sizing: border-box; max-width: 1200px; width: calc(100% - 32px); max-height: calc(100% - 36px); padding: 0; margin: auto; border: 0; border-radius: 14px; background: var(--sx-bg); }\n.sx-dialog::backdrop { background: #10100dc4; }\n.sx-detail { width: 100%; }\n.sx-detail-bar { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 18px; border-bottom: 1px solid var(--sx-line); background: var(--sx-bg); }\n.sx-detail-body { display: grid; grid-template-columns: minmax(0, 1.47fr) minmax(0, 1fr); gap: clamp(16px,3vw,34px); padding: clamp(14px,3vw,36px); }\n.sx-stage { min-height: 140px; display: grid; place-items: center; overflow: hidden; border-radius: 9px; background: #131310; }\n.sx-stage img, .sx-stage video { display: block; width: 100%; max-height: 69vh; object-fit: contain; }\n.sx-media-actions { justify-content: space-between; flex-wrap: wrap; margin-top: 12px; }\n.sx-stepper span { min-width: 4ch; text-align: center; font-variant-numeric: tabular-nums; }\n.sx-story h2 { margin: 8px 0 18px; line-height: 1.2; font-size: clamp(22px,3.5vw,40px); overflow-wrap: anywhere; }\n.sx-story p { margin-top: 0; }\n.sx-description { white-space: pre-wrap; overflow-wrap: anywhere; }\n.sx-story a { color: var(--sx-ink); text-underline-offset: 4px; }\n.sx-screen-reader { position: absolute; width: 1px; height: 1px; clip-path: inset(50%); overflow: hidden; white-space: nowrap; }\n@media (max-width: 680px) {\n  .sx-header { min-height: 64px; }\n  .sx-detail-body { grid-template-columns: minmax(0,1fr); }\n  .sixlab-workspace .sx-hero { min-height: 370px; }\n}\n@media (max-width: 380px) {\n  .sx-header { gap: 8px; }\n  .sx-wordmark { font-size: 31px; gap: 6px; }\n  .sx-wordmark span { font-size: 12px; }\n  .sx-header-actions { gap: 4px; }\n  .sx-header-actions button, .sx-header-actions select { padding-inline: 6px; }\n}\n@media (prefers-reduced-motion: reduce) { .sx-cover img { transition: none; } }\n';

// src/sixlab-portfolio/page.mjs
var title = "sixlab 作品集";
function createGallery(React) {
  const { createElement: h, useEffect, useRef, useState } = React;
  function useAsset(note, name) {
    const [loaded, setLoaded] = useState(null);
    useEffect(() => {
      if (!note || !name) return;
      let active = true;
      let url = "";
      note.asset(name).then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setLoaded({ note, name, url });
      }).catch(() => {
        if (active) setLoaded({ note, name, url: "" });
      });
      return () => {
        active = false;
        if (url) URL.revokeObjectURL(url);
      };
    }, [note, name]);
    return loaded?.note === note && loaded.name === name ? loaded.url : "";
  }
  function Cover({ note, hero = false }) {
    const url = useAsset(note, note.images[0]);
    return h(
      "div",
      { className: "sx-cover" },
      url && h("img", { src: url, alt: "", loading: hero ? "eager" : "lazy" }),
      !hero && note.isVideo && h("span", { className: "sx-video-mark", "aria-hidden": true }, "▶")
    );
  }
  function Detail({ note, onClose, switchNote, position, count, theme }) {
    const [photo, setPhoto] = useState(0);
    const [mode, setMode] = useState(note.video ? "video" : "photos");
    const dialog = useRef(null);
    const photoUrl = useAsset(note, mode === "photos" && note.images[photo]);
    const videoUrl = useAsset(note, mode === "video" && note.video);
    const poster = useAsset(note, mode === "video" && note.images[0]);
    useEffect(() => {
      const node = dialog.current;
      node.showModal();
      return () => node.close();
    }, []);
    return h(
      "dialog",
      {
        ref: dialog,
        className: "sx-dialog",
        "data-theme": theme,
        "aria-labelledby": "sixlab-detail-title",
        onCancel: (event) => {
          event.preventDefault();
          onClose();
        },
        onClick: (event) => {
          if (event.target === event.currentTarget) onClose();
        }
      },
      h(
        "div",
        { className: "sx-detail" },
        h(
          "header",
          { className: "sx-detail-bar" },
          h(
            "div",
            { className: "sx-stepper" },
            h("button", { onClick: () => switchNote(-1), disabled: position < 1, "aria-label": "上一篇作品" }, "←"),
            h("span", null, position + 1, " / ", count),
            h("button", { onClick: () => switchNote(1), disabled: position >= count - 1, "aria-label": "下一篇作品" }, "→")
          ),
          h("button", { onClick: onClose, "aria-label": "关闭作品", autoFocus: true }, "关闭 ×")
        ),
        h(
          "div",
          { className: "sx-detail-body" },
          h(
            "div",
            { className: "sx-detail-media" },
            (note.video || note.images.length > 0) && h(
              "div",
              { className: "sx-stage" },
              mode === "video" && videoUrl && h("video", { src: videoUrl, poster: poster || void 0, controls: true, playsInline: true, preload: "metadata" }),
              mode === "photos" && photoUrl && h("img", { src: photoUrl, alt: note.title + " · 图 " + (photo + 1) })
            ),
            note.isVideo && !note.video && h("p", { className: "sx-quiet" }, "此作品的视频暂未收入素材包，可打开原笔记观看。"),
            (note.video && note.images.length > 0 || note.images.length > 1) && h(
              "div",
              { className: "sx-media-actions" },
              note.video && note.images.length > 0 && h("button", {
                onClick: () => setMode(mode === "video" ? "photos" : "video")
              }, mode === "video" ? "查看封面" : "播放视频"),
              mode === "photos" && note.images.length > 1 && h(
                "div",
                { className: "sx-stepper" },
                h("button", { onClick: () => setPhoto(photo - 1), disabled: photo === 0, "aria-label": "上一张图" }, "←"),
                h("span", { role: "status" }, photo + 1, " / ", note.images.length),
                h("button", { onClick: () => setPhoto(photo + 1), disabled: photo >= note.images.length - 1, "aria-label": "下一张图" }, "→")
              )
            )
          ),
          h(
            "article",
            { className: "sx-story" },
            h("p", { className: "sx-quiet" }, [note.author, note.date].filter(Boolean).join("  /  ")),
            h("h2", { id: "sixlab-detail-title" }, note.title),
            note.description && h("p", { className: "sx-description" }, note.description),
            note.source && h("a", { href: note.source, target: "_blank", rel: "noopener noreferrer" }, "小红书原笔记 ↗")
          )
        )
      )
    );
  }
  return function Gallery({ scope }) {
    const [archives, setArchives] = useState([]);
    const [ready, setReady] = useState(false);
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState("");
    const [filter, setFilter] = useState("all");
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(null);
    const [theme, setTheme] = useState("auto");
    const input = useRef(null);
    const lastTrigger = useRef(null);
    useEffect(() => {
      let mounted = true;
      restoreFiles(scope).then((files) => Promise.all(files.map(readArchive))).then((next) => {
        if (mounted) setArchives(combineArchives([], next));
      }).catch(() => {
        if (mounted) setMessage("读取本机素材失败。请重新导入作品素材包。");
      }).finally(() => {
        if (mounted) setReady(true);
      });
      return () => {
        mounted = false;
      };
    }, [scope]);
    async function importFiles(event) {
      const files = [...event.currentTarget.files];
      event.currentTarget.value = "";
      if (!files.length || pending) return;
      setMessage("");
      setPending(true);
      try {
        const additions = await Promise.all(files.map(readArchive));
        const next = combineArchives(archives, additions);
        setArchives(next);
        setSelected(null);
        setFilter("all");
        setQuery("");
        try {
          await storeFiles(scope, next.map((archive) => archive.file));
          setMessage("已导入 " + next.reduce((sum, archive) => sum + archive.notes.length, 0) + " 篇作品。");
        } catch {
          setMessage("素材可在当前页面查看。本机保存失败，重新打开时需要再次导入。");
        }
      } catch (error) {
        setMessage(error instanceof SyntaxError ? "素材包的索引无法读取。请重新下载。" : error.message);
      } finally {
        setPending(false);
      }
    }
    const notes = archives.flatMap((archive) => archive.notes).sort((a, b) => a.order - b.order);
    const search = query.trim().toLocaleLowerCase();
    const matches = notes.filter((note) => (!search || [note.title, note.description, note.author].some((value) => value.toLocaleLowerCase().includes(search))) && (filter === "all" || filter === "video" && note.isVideo || filter === "photos" && !note.isVideo || filter === "feature" && note.featured));
    const featured = notes.find((note) => note.featured);
    const hero = !search && filter === "all" ? featured || notes.find((note) => note.video) || notes[0] : null;
    const gridNotes = hero && matches.length > 1 ? matches.filter((note) => note !== hero) : matches;
    const opened = matches.find((note) => note.id === selected);
    const position = matches.indexOf(opened);
    function open(note, event) {
      lastTrigger.current = event.currentTarget;
      setSelected(note.id);
    }
    function close() {
      setSelected(null);
      requestAnimationFrame(() => lastTrigger.current?.focus());
    }
    return h(
      "section",
      { className: "sixlab-workspace", "data-theme": theme },
      h("style", null, workspace_default),
      h(
        "div",
        { className: "sx-inner" },
        h(
          "header",
          { className: "sx-header" },
          h("div", { className: "sx-wordmark" }, "sixlab", h("span", null, "作品集")),
          h(
            "div",
            { className: "sx-header-actions" },
            h(
              "label",
              { className: "sx-theme" },
              h("span", { className: "sx-screen-reader" }, "显示主题"),
              h(
                "select",
                { value: theme, onChange: (event) => setTheme(event.target.value) },
                h("option", { value: "auto" }, "跟随系统"),
                h("option", { value: "light" }, "浅色"),
                h("option", { value: "dark" }, "深色")
              )
            ),
            h("input", { ref: input, type: "file", accept: ".zip,application/zip", multiple: true, hidden: true, onChange: importFiles }),
            h("button", { onClick: () => input.current.click(), disabled: !ready || pending }, pending ? "正在导入…" : "导入素材")
          )
        ),
        message && h("p", { role: "status", className: "sx-notice" }, message),
        archives.length > 0 && archives.length < archives[0].parts && h(
          "p",
          { className: "sx-notice" },
          "已导入 ",
          archives.length,
          " / ",
          archives[0].parts,
          " 个素材包。已导入的作品可直接浏览。"
        ),
        !ready && h("div", { className: "sx-empty", role: "status" }, "正在读取本机作品…"),
        ready && !notes.length && h(
          "div",
          { className: "sx-empty" },
          h("h1", null, "导入作品素材包"),
          h("p", null, "选择随作品集交付的 ZIP 文件。导入后可离线浏览图文和视频。"),
          h("button", { onClick: () => input.current.click(), disabled: pending }, "选择 ZIP")
        ),
        hero && h(
          "button",
          { className: "sx-hero", onClick: (event) => open(hero, event) },
          h(Cover, { note: hero, hero: true }),
          h(
            "div",
            { className: "sx-hero-copy" },
            h("p", null, hero.featured ? "OPCB / 品牌智能体" : hero.author),
            h("h1", null, hero.title),
            h("span", null, hero.video ? "播放作品 ↗" : "查看作品 ↗")
          )
        ),
        notes.length > 0 && h(
          "div",
          { className: "sx-catalog" },
          h(
            "div",
            { className: "sx-catalog-head" },
            h("h2", null, filter === "feature" ? "品牌智能体" : "作品"),
            h(
              "label",
              { className: "sx-search" },
              h("span", { className: "sx-screen-reader" }, "搜索作品"),
              h("input", { type: "search", placeholder: "搜索作品", value: query, onChange: (event) => setQuery(event.target.value) })
            )
          ),
          h(
            "div",
            { className: "sx-filters", "aria-label": "筛选作品" },
            ...[["all", "全部"], ["video", "视频"], ["photos", "图文"], ["feature", "品牌智能体"]].map(([value, label]) => h("button", { key: value, "aria-pressed": filter === value, onClick: () => setFilter(value) }, label))
          ),
          gridNotes.length ? h(
            "ul",
            { className: "sx-grid" },
            gridNotes.map((note) => h(
              "li",
              { key: note.id },
              h(
                "button",
                { className: "sx-card", onClick: (event) => open(note, event) },
                h(Cover, { note }),
                h(
                  "div",
                  { className: "sx-card-meta" },
                  h("span", null, note.featured ? "OPCB / 品牌智能体" : note.isVideo ? "视频" : "图文"),
                  note.date && h("time", { dateTime: note.date }, note.date.replaceAll("-", "."))
                ),
                h("h3", null, note.title)
              )
            ))
          ) : h("p", { className: "sx-quiet", role: "status" }, "没有符合条件的作品。")
        ),
        opened && h(Detail, {
          key: opened.id,
          note: opened,
          onClose: close,
          position,
          count: matches.length,
          theme,
          switchNote: (offset) => setSelected(matches[position + offset].id)
        })
      )
    );
  };
}

// src/sixlab-portfolio/plugin.mjs
var pluginId = "opcb.sixlab-portfolio";
var inject = ["react", "pages", "relay"];
function apply(ctx, icon) {
  const React = ctx.react;
  const Gallery = createGallery(React);
  function Page() {
    const { scope } = React.useSyncExternalStore(ctx.relay.subscribe, ctx.relay.snapshot);
    return scope ? React.createElement(Gallery, { key: scope, scope }) : React.createElement(
      "p",
      { role: "status", style: { padding: "24px" } },
      "连接 Buzz 账号后可打开作品集。"
    );
  }
  ctx.pages.register({
    id: "portfolio",
    title,
    component: Page,
    primary: true,
    placement: "sidebar",
    layout: "workspace",
    icon
  });
}

// <stdin>
function apply2(ctx) {
  apply(ctx, "data:image/png;base64,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");
}
export {
  apply2 as apply,
  inject,
  pluginId
};

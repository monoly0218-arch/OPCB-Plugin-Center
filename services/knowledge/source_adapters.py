"""Read-only mirrors of three fixed existing sites. Never restart upstream jobs."""
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import tempfile
import urllib.error
import urllib.parse
import urllib.request

SLS = "https://paolab.cn/shangliangshan/"
RESEARCH = "https://staging.paolab.cn/tingzi/"
CONTENT = "https://staging.paolab.cn/ins/"
MAX_RESPONSE = 12 * 1024 * 1024


class SameSiteRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        old, new = urllib.parse.urlsplit(req.full_url), urllib.parse.urlsplit(newurl)
        if new.scheme != "https" or old.netloc != new.netloc:
            raise ValueError("Cross-site redirect refused")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class Site:
    def __init__(self, cache):
        self.cache = Path(cache)
        self.cache.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.opener = urllib.request.build_opener(SameSiteRedirect(), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def json(self, url, body=None, cached=False):
        key = self.cache / (hashlib.sha256(url.encode()).hexdigest() + ".json")
        previous = None
        if cached and key.exists():
            try:
                previous = json.loads(key.read_text())
                if not isinstance(previous, dict) or "data" not in previous:
                    previous = None
            except (OSError, ValueError):
                pass
        headers = {"Accept": "application/json"}
        if previous:
            if previous.get("etag"):
                headers["If-None-Match"] = previous["etag"]
            if previous.get("modified"):
                headers["If-Modified-Since"] = previous["modified"]
        if body is not None:
            parts = urllib.parse.urlsplit(url)
            headers.update({"Content-Type": "application/json", "Origin": f"{parts.scheme}://{parts.netloc}", "Referer": url})
        req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=headers)
        try:
            with self.opener.open(req, timeout=20) as response:
                raw = response.read(MAX_RESPONSE + 1)
                if len(raw) > MAX_RESPONSE:
                    raise ValueError("Source response too large")
                data = json.loads(raw)
                entry = {"etag": response.headers.get("ETag"), "modified": response.headers.get("Last-Modified"), "data": data}
        except urllib.error.HTTPError as error:
            if error.code == 304 and previous and "data" in previous:
                return previous["data"]
            raise
        if cached:
            fd, name = tempfile.mkstemp(dir=self.cache)
            try:
                with os.fdopen(fd, "w") as output:
                    json.dump(entry, output, ensure_ascii=False)
                os.replace(name, key)
            finally:
                if os.path.exists(name):
                    os.unlink(name)
        return data


def document(source, key, title, payload, url, updated=""):
    return {"id": source + ":" + hashlib.sha256(str(key).encode()).hexdigest()[:24],
            "title": str(title), "content": json.dumps(payload, ensure_ascii=False, allow_nan=False),
            "created_at": "", "updated_at": str(updated or ""), "url": url}


def research_records(data, state):
    if not isinstance(data, dict) or not isinstance(data.get("products"), list) or not isinstance(state.get("entries"), dict):
        raise ValueError("Invalid research snapshot")
    records, excluded, seen = [], 0, set()
    for original in data["products"]:
        if not isinstance(original, dict) or not isinstance(original.get("id"), str) or original["id"] in seen:
            raise ValueError("Invalid or duplicate product identity")
        seen.add(original["id"])
        entry = state["entries"].get(original["id"], {})
        product = {**original, **entry.get("corrections", {})}
        for key in ["category", "channel", "matrix_group", "tier", "excluded"]:
            if key in entry:
                product[key] = entry[key]
        if product.get("excluded") is True:
            excluded += 1
            continue
        fields = {"原始ID": original["id"], "名称": product.get("name"), "平台": product.get("platform"),
                  "渠道": product.get("channel"), "品类": product.get("category_suggestion"),
                  "人工品类": product.get("category"), "价格": product.get("price"), "规格": product.get("spec"),
                  "卖点": product.get("selling_points"), "分组": product.get("matrix_group"), "等级": product.get("tier"),
                  "新品": product.get("new_status"), "评价展示": product.get("reviews_display"),
                  "采集时间": original.get("collected_at"), "人工修改时间": entry.get("updated_at"), "人工备注": entry.get("note")}
        records.append(document("research", original["id"], f"{product.get('name') or '未命名产品'} · {product.get('platform') or ''}",
                                fields, RESEARCH, entry.get("updated_at") or original.get("collected_at")))
    return records, {"snapshot_at": data.get("snapshot_at"), "source_records": len(data["products"]), "excluded_records": excluded,
                     "manual_entries": len(state["entries"]), "scope": "现有产品与人工修订；未恢复上游自动采集；未执行网页的规格归并；评价数不是销量"}


def content_records(data):
    if not isinstance(data, dict) or not isinstance(data.get("cards"), list):
        raise ValueError("Invalid content export")
    people = {p["id"]: p.get("name") for p in data.get("members", []) if isinstance(p, dict) and "id" in p}
    records, seen = [], set()
    for card in data["cards"]:
        if not isinstance(card, dict) or not isinstance(card.get("id"), str) or card["id"] in seen:
            raise ValueError("Invalid or duplicate material identity")
        seen.add(card["id"])
        fields = {key: card.get(key) for key in ["id", "title", "platform", "brand", "tags", "note", "status", "stage", "source_url", "canonical_url", "created_at", "updated_at", "result_publish_status", "result_revision", "media_status"]}
        fields["负责人"] = people.get(card.get("owner_id"))
        fields["成品版本"] = [{k: r.get(k) for k in ["revision", "filename", "uploaded_at"]} for r in data.get("result_versions", []) if r.get("card_id") == card["id"]]
        fields["评论"] = [{k: c.get(k) for k in ["text", "created_at"]} for c in data.get("comments", []) if c.get("card_id") == card["id"]]
        fields["审核"] = [{k: r.get(k) for k in ["result_revision", "verdict", "note", "created_at"]} for r in data.get("production_reviews", []) if r.get("card_id") == card["id"]]
        records.append(document("content", card["id"], card.get("title") or "未命名素材", fields, CONTENT, card.get("updated_at")))
    return records, {"exported_at": data.get("exported_at"), "cards": len(records), "result_versions": len(data.get("result_versions", [])), "scope": "素材与成品关系、评论和审核元数据；未复制视频、图片或媒体授权票据"}


def business_records(data):
    if not isinstance(data, dict) or not data.get("completedDate") or not isinstance(data.get("completed"), dict):
        raise ValueError("Invalid business snapshot")
    records = []

    def add(key, title, payload, updated=None):
        records.append(document("business", key, title, payload, SLS, updated or data.get("capturedAt")))

    add("overview", f"上粮山 淘宝 经营概览 {data['completedDate']}", {k: data.get(k) for k in ["platform", "shop", "completedDate", "capturedAt", "source", "completed", "promotion", "trafficSources", "inventory", "coverage", "platformPublication", "realtimeSourceAudit"]})
    add("realtime", f"上粮山 淘宝 实时快照 {data.get('realtime', {}).get('date', '')}", data.get("realtime", {}))
    for kind in ["sales", "promotion", "monthly"]:
        for index, row in enumerate(data.get("history", {}).get(kind, [])):
            date = row.get("date") or row.get("month") or str(index)
            add(f"taobao:{kind}:{date}", f"上粮山 淘宝 {kind} {date}", row)
    for platform, label in [("traffic", "淘宝流量"), ("youzan", "有赞"), ("xiaohongshu", "小红书")]:
        ext = data.get("extensions", {}).get(platform, {})
        for window, period in ext.get("periods", {}).items():
            payload = {k: period.get(k) for k in ["dateRange", "metrics", "channels", "dimensions", "status", "issues", "capturedAt", "verifiedEmpty", "rowsComplete"]}
            payload["source"] = ext.get("source")
            add(f"{platform}:period:{window}", f"上粮山 {label} {window} {period.get('dateRange') or ''}", payload, period.get("capturedAt"))
        for index, row in enumerate(ext.get("daily", [])):
            dimensions = json.dumps(row.get("dimensions", {}), sort_keys=True, ensure_ascii=False)
            add(f"{platform}:day:{row.get('date', index)}:{dimensions}", f"上粮山 {label} 日报 {row.get('date') or ''}", row)
        if platform == "youzan":
            for day in ext.get("dailyProducts", []):
                for index, row in enumerate(day.get("rows", [])):
                    key = f"sku:{day.get('date')}:{json.dumps(day.get('dimensions', {}), sort_keys=True)}:{row.get('productId')}:{row.get('sku')}:{index}"
                    add(key, f"上粮山 有赞 商品日报 {day.get('date')} {row.get('name') or row.get('productId') or ''}", {"date": day.get("date"), "dimensions": day.get("dimensions"), "status": day.get("status"), "rowsComplete": day.get("rowsComplete"), "product": row})
    return records, {"completed_date": data["completedDate"], "captured_at": data.get("capturedAt"), "platform_publication": data.get("platformPublication"), "scope": "原报表经营指标、逐日记录与有赞商品明细；缺失保留null，不把实时快照当完整日，不重新计算口径"}


def collect_web(store, credentials):
    credentials = Path(credentials)
    if credentials.stat().st_mode & 0o077:
        raise ValueError("Business credentials must have mode 0600")
    config = json.loads(credentials.read_text())
    results, failed = {}, []
    for source in ["business", "research", "content"]:
        try:
            site = Site(store.root / "web-cache")
            if source == "business":
                site.json(SLS + "auth/login", config["sls"])
                records, facts = business_records(site.json(SLS + "data/taobao.json", cached=True))
            elif source == "research":
                records, facts = research_records(site.json(RESEARCH + "data.json", cached=True), site.json(RESEARCH + "api/state"))
            else:
                site.json(CONTENT + "api/login", config["adflow"])
                records, facts = content_records(site.json(CONTENT + "api/export"))
            results[source] = store.replace_source(source, records, facts)
        except Exception:
            store.record_error(source)
            failed.append(source)
            results[source] = {"error": "Source mirror failed; previous snapshot retained"}
    return results, failed

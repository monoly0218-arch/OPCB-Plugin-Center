"""Authorized organization views over the existing read-only source index.

Classification never grants access. Teams are not inferred from mentions.
A private, operator-managed sidecar may confirm attribution without copying or
editing source documents. Missing sidecars keep all team attributions unset.
"""
from collections import Counter
import json
from pathlib import Path
import stat
from urllib.parse import urlsplit
import re

TEAMS = [
    {"id": "opcb", "name": "OPCB 团队"},
    {"id": "you-dian-ke-le", "name": "有点可乐团队"},
    {"id": "pao-quan", "name": "跑圈团队"},
    {"id": "pao-quan-production", "name": "跑圈制作团队"},
    {"id": "six-lab", "name": "Six Lab 团队"},
    {"id": "zhu-dian", "name": "逐点团队"},
    {"id": "isense", "name": "iSense 团队"},
]
CATEGORIES = [
    {"id": "projects", "name": "项目与交付"},
    {"id": "meetings", "name": "会议与决策"},
    {"id": "methods", "name": "方法与标准"},
    {"id": "assets", "name": "素材与案例"},
    {"id": "research", "name": "经营与研究"},
    {"id": "unclassified", "name": "用途待分类"},
]
KINDS = [{"id": k, "name": n} for k, n in [
    ("text", "文本"), ("image", "图片"), ("video", "视频"),
    ("audio", "音频"), ("ppt", "PPT"), ("pdf", "PDF"), ("data", "表格与数据")]]
PROJECTS = [{"id": "shangliangshan", "name": "上粮山", "team": None}]
SOURCE_CLASSIFICATION = {
    "business": ("research", "data", ["shangliangshan"]),
    "research": ("research", "data", ["shangliangshan"]),
    "content": ("assets", "text", ["shangliangshan"]),
}
MAX_CONFIG = 8 * 1024 * 1024


def load_classification(filename):
    if filename is None or not Path(filename).exists():
        return {"version": 1, "revision": 0, "projects": [], "documents": {}}
    path = Path(filename)
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_size > MAX_CONFIG:
        raise ValueError("Classification must be a private bounded regular file")
    value = json.loads(path.read_text())
    if not isinstance(value, dict) or set(value) != {"version", "revision", "projects", "documents"} or value["version"] != 1 or type(value["revision"]) is not int or value["revision"] < 0:
        raise ValueError("Invalid classification document")
    if not isinstance(value["projects"], list) or len(value["projects"]) > 2000 or not isinstance(value["documents"], dict) or len(value["documents"]) > 20000:
        raise ValueError("Classification collection limit")
    import re
    team_ids = {x["id"] for x in TEAMS}
    project_ids = {x["id"] for x in PROJECTS}
    for project in value["projects"]:
        if not isinstance(project, dict) or set(project) != {"id", "name", "team"} or not isinstance(project["id"], str) or not re.fullmatch(r"[a-z][a-z0-9.-]{0,79}", project["id"]) or project["id"] in project_ids or not isinstance(project["name"], str) or not 1 <= len(project["name"].strip()) <= 80 or project["team"] not in team_ids | {None}:
            raise ValueError("Invalid project classification")
        project_ids.add(project["id"])
    for ref, item in value["documents"].items():
        if not isinstance(ref, str) or not 1 <= len(ref) <= 160 or not isinstance(item, dict) or set(item) - {"team", "projects", "category", "kind", "shared", "evidence", "originals"}:
            raise ValueError("Invalid document classification")
        from knowledge import SOURCES, valid_id
        source, separator, doc_id = ref.partition(":")
        if not separator or source not in SOURCES or not valid_id(source, doc_id):
            raise ValueError("Invalid source-bound classification reference")
        if not isinstance(item.get("evidence"), str) or not 1 <= len(item["evidence"]) <= 1000:
            raise ValueError("Confirmed attribution requires evidence")
        if item.get("team") not in team_ids | {None} or item.get("category", "unclassified") not in {x["id"] for x in CATEGORIES} or item.get("kind", "text") not in {x["id"] for x in KINDS} or type(item.get("shared", False)) is not bool:
            raise ValueError("Unknown classification value")
        if not isinstance(item.get("projects", []), list) or len(item.get("projects", [])) > 20 or any(p not in project_ids for p in item.get("projects", [])):
            raise ValueError("Unknown project")
        originals = item.get("originals", [])
        if not isinstance(originals, list) or len(originals) > 20:
            raise ValueError("Original reference limit")
        for original in originals:
            if not isinstance(original, dict) or set(original) != {"name", "kind", "url", "access"} or original["access"] != "source" or not isinstance(original["name"], str) or not 1 <= len(original["name"]) <= 200 or original["kind"] not in {k["id"] for k in KINDS} or not isinstance(original["url"], str) or len(original["url"]) > 2000:
                raise ValueError("Invalid original reference")
            url = urlsplit(original["url"])
            if url.scheme != "https" or not url.hostname or url.username or url.password or re.search(r"[?&](?:token|signature|expires|password|accesskeyid|x-amz-[^=]+|x-oss-[^=]+)=", original["url"], re.I):
                raise ValueError("Original URL must not contain credentials or temporary access tickets")
        if item.get("kind") in {"image", "video", "audio", "ppt", "pdf"} and not any(o["kind"] == item["kind"] for o in originals):
            raise ValueError("A media type requires an explicit original reference")
    return value


class GroupCatalog:
    def __init__(self, store, configuration=None):
        self.store = store
        self.config = load_classification(configuration)
        self.projects = [*PROJECTS, *self.config["projects"]]

    def attribution(self, source, doc_id):
        category, kind, projects = SOURCE_CLASSIFICATION.get(source, ("unclassified", "text", []))
        value = {"team": None, "projects": projects, "category": category,
                 "kind": kind, "shared": False,
                 "classification": "source" if source in SOURCE_CLASSIFICATION else "unassigned"}
        override = self.config["documents"].get(source + ":" + str(doc_id))
        if override:
            value.update({k: v for k, v in override.items() if k != "evidence"})
            value["classification"] = "confirmed"
        return value

    def enrich(self, doc, source):
        attribution = self.attribution(source, doc["id"])
        originals = attribution.pop("originals", [])
        return {**doc, "sourceId": source, "organization": attribution,
                "originals": [{**o, "state": "linked", "archived": False} for o in originals]}

    def rows(self, sources, query=""):
        sources = sorted(sources)
        if not sources:
            return []
        placeholders = ",".join("?" for _ in sources)
        where = "source IN (" + placeholders + ")"
        values = list(sources)
        if query:
            where += " AND (instr(lower(title),lower(?))>0 OR instr(lower(content),lower(?))>0)"
            values.extend([query, query])
        with self.store.connect() as db:
            rows = db.execute("SELECT id,source,title,substr(content,1,360) AS excerpt,url,updated_at FROM documents WHERE " + where + " ORDER BY updated_at DESC,source,id DESC", values).fetchall()
        return [self.enrich(dict(row), row["source"]) for row in rows]

    def ready(self, sources):
        ready, unavailable = [], []
        for source in sorted(sources):
            status = self.store.status(source)
            (ready if status["state"] == "ready" else unavailable).append(source)
        return ready, unavailable

    def catalog(self, sources):
        ready, unavailable = self.ready(sources)
        rows = self.rows(ready)
        teams, projects, kinds, categories = Counter(), Counter(), Counter(), Counter()
        shared = unassigned = 0
        for row in rows:
            a = row["organization"]
            if a["team"]:
                teams[a["team"]] += 1
            else:
                unassigned += 1
            for p in set(a["projects"]):
                projects[p] += 1
            kinds[a["kind"]] += 1
            categories[a["category"]] += 1
            shared += int(a["shared"])
        return {"name": "跑圈集团知识库", "version": 1, "revision": self.config["revision"],
                "total": len(rows), "shared": shared, "unassigned": unassigned,
                "teams": [{**t, "documents": teams[t["id"]]} for t in TEAMS],
                "projects": [{**p, "documents": projects[p["id"]]} for p in self.projects],
                "categories": [{**c, "documents": categories[c["id"]]} for c in CATEGORIES],
                "kinds": [{**k, "documents": kinds[k["id"]]} for k in KINDS],
                "unavailable": unavailable, "attribution_grants_access": False}

    def browse(self, request, sources):
        allowed = {"op", "space", "space_id", "category", "kind", "query", "limit", "offset"}
        if set(request) - allowed:
            raise ValueError("Unexpected organization browse field")
        space, space_id = request.get("space", "all"), request.get("space_id", "")
        if space not in {"all", "team", "project", "shared", "unassigned"} or not isinstance(space_id, str):
            raise ValueError("Unknown organization space")
        if space == "team" and space_id not in {t["id"] for t in TEAMS} or space == "project" and space_id not in {p["id"] for p in self.projects} or space not in {"team", "project"} and space_id:
            raise ValueError("Unknown space ID")
        category, kind = request.get("category", ""), request.get("kind", "")
        if category and category not in {c["id"] for c in CATEGORIES} or kind and kind not in {k["id"] for k in KINDS}:
            raise ValueError("Invalid browse filter")
        query = request.get("query", "")
        limit, offset = request.get("limit", 20), request.get("offset", 0)
        if not isinstance(query, str) or len(query) > 100 or type(limit) is not int or not 1 <= limit <= 20 or type(offset) is not int or not 0 <= offset <= 1000000:
            raise ValueError("Invalid browse page")
        ready, unavailable = self.ready(sources)
        def matches(row):
            a = row["organization"]
            return ((space != "team" or a["team"] == space_id)
                    and (space != "project" or space_id in a["projects"])
                    and (space != "shared" or a["shared"])
                    and (space != "unassigned" or a["team"] is None)
                    and (not category or a["category"] == category)
                    and (not kind or a["kind"] == kind))
        rows = [r for r in self.rows(ready, query.strip()) if matches(r)]
        selected = rows[offset:offset + limit]
        return {"space": space, "space_id": space_id, "query": query.strip(),
                "results": selected, "total": len(rows), "offset": offset,
                "next_offset": offset + len(selected) if offset + len(selected) < len(rows) else None,
                "unavailable": unavailable, "organization_revision": self.config["revision"]}

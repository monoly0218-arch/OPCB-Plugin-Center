#!/usr/bin/env python3
"""Team Agent reader: no SSH, Getnote login or third-party Python packages."""
import argparse
import getpass
import json
import os
from pathlib import Path
import stat
import sys
import urllib.error
import urllib.request

URL = "https://shangliangshan.paolab.cn/opcb-knowledge/query"
ACCESS_FILE = Path.home() / ".config/opcb-knowledge/team-access"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["setup", "catalog", "status", "search", "get"])
    parser.add_argument("--source", choices=["recordings", "business", "research", "content"], default="recordings")
    parser.add_argument("--query")
    parser.add_argument("--id")
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()
    if args.operation == "setup":
        code = getpass.getpass("团队访问码：").strip()
        if not 32 <= len(code) <= 128 or not code.isascii() or any(c.isspace() for c in code):
            parser.error("访问码格式错误")
        ACCESS_FILE.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd = os.open(ACCESS_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(code)
        print("团队知识库已配置")
        return 0
    try:
        code = os.environ.get("OPCB_KNOWLEDGE_CODE", "")
        if not code:
            if stat.S_IMODE(ACCESS_FILE.stat().st_mode) & 0o077:
                raise ValueError("Access file must have mode 0600")
            code = ACCESS_FILE.read_text().strip()
        if not 32 <= len(code) <= 128:
            raise ValueError("Run setup or configure OPCB_KNOWLEDGE_CODE")
        value = {"op": args.operation}
        if args.operation != "catalog":
            value["source"] = args.source
        if args.operation == "search":
            if not args.query or not 1 <= len(args.query.strip()) <= 100 or not 1 <= args.limit <= 20:
                parser.error("search needs --query and --limit 1–20")
            value.update(query=args.query, limit=args.limit)
        elif args.operation == "get":
            import re
            pattern = r"[0-9]{1,30}" if args.source == "recordings" else args.source + r":[0-9a-f]{24}"
            if not args.id or not re.fullmatch(pattern, args.id):
                parser.error("get needs an --id returned by the selected source")
            value["id"] = args.id
        request = urllib.request.Request(URL, data=json.dumps(value).encode(), method="POST",
                                         headers={"Authorization": "Bearer " + code,
                                                  "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            result = json.loads(error.read(8192))
            print(json.dumps(result, ensure_ascii=False))
            return 1
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (OSError, ValueError):
        print(json.dumps({"error": "团队知识库连接失败，请检查访问码、有效期和网络"}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Import one complete, administrator-supplied historical text snapshot.

This is an offline command, not an HTTP write operation. The NAS exporter writes
an immutable JSON file; transport and filesystem access are deployment concerns.
No binary Office files, credentials or arbitrary URLs enter the search store.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path

from knowledge import KnowledgeError, MAX_BYTES, Store


def import_snapshot(store, path):
    with Path(path).open("rb") as stream:
        raw = stream.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise KnowledgeError("Archive text snapshot exceeds its limit")
    try:
        value = json.loads(raw)
        if (not isinstance(value, dict) or set(value) != {"version", "complete", "snapshot_date", "documents", "facts"}
                or type(value["version"]) is not int or value["version"] != 1 or value["complete"] is not True):
            raise ValueError()
        date = dt.date.fromisoformat(value["snapshot_date"])
        if date.isoformat() != value["snapshot_date"] or date > dt.datetime.now(dt.timezone.utc).date():
            raise ValueError()
        facts, documents = value["facts"], value["documents"]
        if not isinstance(facts, dict) or not isinstance(documents, list) or not documents or len(documents) > 20000:
            raise ValueError()
        # Facts are supplied by the exporter, never used as an authorization or
        # executable configuration. The importer owns snapshot provenance.
        facts = {**facts, "snapshot_date": date.isoformat(), "mode": "historical_snapshot",
                 "manifest_sha256": hashlib.sha256(raw).hexdigest()}
        records = []
        for document in documents:
            if (not isinstance(document, dict) or set(document) != {"object_key", "title", "content"}
                    or not all(isinstance(document[k], str) for k in document)
                    or not 1 <= len(document["object_key"]) <= 256
                    or not 1 <= len(document["title"]) <= 2000):
                raise ValueError()
            document_id = "haowangshui:" + hashlib.sha256(document["object_key"].encode()).hexdigest()[:24]
            records.append({"id": document_id, "title": document["title"], "content": document["content"],
                            "created_at": "", "updated_at": "",
                            "url": "https://shangliangshan.paolab.cn/opcb-knowledge/archive/" + document_id})
    except (ValueError, TypeError, KeyError):
        raise KnowledgeError("Invalid or incomplete archive snapshot; previous index retained") from None
    return store.replace_source("haowangshui", records, facts)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("snapshot", type=Path)
    args = parser.parse_args()
    result = import_snapshot(Store(args.root), args.snapshot)
    print(json.dumps({"source_id": result["source_id"], "documents": result["documents"],
                      "manifest_sha256": result["source_facts"]["manifest_sha256"]}))


if __name__ == "__main__":
    main()

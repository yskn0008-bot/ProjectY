#!/usr/bin/env python3
"""One Enter Factory Core: local-first source store and rollback history.

This module deliberately has no network dependency.  A filesystem directory is
canonical; GitHub, Google Drive and other services are optional mirrors.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

SCHEMA_VERSION = "1.0"
STORE_VERSION = "1"

EXCLUDED_DIRS = {
    ".git", ".svn", ".hg", "node_modules", "Pods", "DerivedData",
    "coverage", ".next", ".cache", ".pytest_cache", "__pycache__",
    ".factory-store",
}
EXCLUDED_FILENAMES = {".DS_Store"}
SECRET_SUFFIXES = {".p12", ".pfx", ".mobileprovision", ".cer", ".key", ".pem"}


class FactoryStoreError(ValueError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _is_secret_name(name: str) -> bool:
    lower = name.lower()
    if lower == ".env.example" or lower.endswith(".env.example"):
        return False
    return lower == ".env" or lower.startswith(".env.") or Path(lower).suffix in SECRET_SUFFIXES


def should_include(rel: PurePosixPath) -> bool:
    parts = rel.parts
    if any(part in EXCLUDED_DIRS for part in parts[:-1]):
        return False
    if not parts:
        return False
    name = parts[-1]
    if name in EXCLUDED_FILENAMES or _is_secret_name(name):
        return False
    return True


def iter_source_files(source_root: Path) -> Iterable[tuple[PurePosixPath, Path]]:
    source_root = source_root.resolve()
    if not source_root.is_dir():
        raise FactoryStoreError(f"source root does not exist: {source_root}")
    for path in sorted(source_root.rglob("*")):
        if not path.is_file() or path.is_symlink():
            continue
        rel = PurePosixPath(path.relative_to(source_root).as_posix())
        if should_include(rel):
            yield rel, path


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def build_manifest(source_root: Path) -> dict[str, Any]:
    files: list[dict[str, Any]] = []
    total_bytes = 0
    tree_hasher = hashlib.sha256()
    for rel, path in iter_source_files(source_root):
        size = path.stat().st_size
        digest = sha256_file(path)
        total_bytes += size
        row = {"path": rel.as_posix(), "sha256": digest, "bytes": size}
        files.append(row)
        tree_hasher.update(f"{row['path']}\0{digest}\0{size}\n".encode("utf-8"))
    return {
        "schema_version": SCHEMA_VERSION,
        "created_at": utc_now(),
        "source_name": source_root.resolve().name,
        "file_count": len(files),
        "total_bytes": total_bytes,
        "tree_sha256": tree_hasher.hexdigest(),
        "files": files,
    }


def init_store(store_root: Path) -> Path:
    store_root = store_root.expanduser().resolve()
    for name in ("history", "state", "exports"):
        (store_root / name).mkdir(parents=True, exist_ok=True)
    version = store_root / "STORE_VERSION"
    if not version.exists():
        version.write_text(STORE_VERSION + "\n", encoding="utf-8")
    return store_root


def _snapshot_paths(store_root: Path, snapshot_id: str) -> tuple[Path, Path]:
    return (
        store_root / "history" / f"{snapshot_id}.zip",
        store_root / "history" / f"{snapshot_id}.manifest.json",
    )


def create_snapshot(source_root: Path, store_root: Path, label: str | None = None) -> dict[str, Any]:
    source_root = source_root.expanduser().resolve()
    store_root = init_store(store_root)
    # Prevent recursive self-capture when a store is accidentally placed under source.
    if store_root == source_root or store_root.is_relative_to(source_root):
        raise FactoryStoreError("store root must be outside source root")

    manifest = build_manifest(source_root)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    snapshot_id = f"{stamp}-{manifest['tree_sha256'][:12]}"
    zip_path, manifest_path = _snapshot_paths(store_root, snapshot_id)
    if zip_path.exists() and manifest_path.exists():
        current = json.loads(manifest_path.read_text(encoding="utf-8"))
        _write_current(store_root, current)
        return current

    manifest.update({
        "snapshot_id": snapshot_id,
        "label": label or "",
        "archive": zip_path.name,
    })

    tmp_path = store_root / "history" / f".{snapshot_id}.{uuid.uuid4().hex}.tmp"
    try:
        with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
            for rel, path in iter_source_files(source_root):
                zf.write(path, arcname=rel.as_posix())
            zf.writestr("FACTORY_SNAPSHOT.json", json.dumps({
                k: v for k, v in manifest.items() if k != "files"
            }, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
        os.replace(tmp_path, zip_path)
    finally:
        if tmp_path.exists():
            tmp_path.unlink()

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    with (store_root / "history" / "index.jsonl").open("a", encoding="utf-8") as fh:
        fh.write(json.dumps({
            "snapshot_id": snapshot_id,
            "created_at": manifest["created_at"],
            "tree_sha256": manifest["tree_sha256"],
            "file_count": manifest["file_count"],
            "total_bytes": manifest["total_bytes"],
            "label": manifest["label"],
        }, ensure_ascii=False, sort_keys=True) + "\n")
    _write_current(store_root, manifest)
    return manifest


def _write_current(store_root: Path, manifest: dict[str, Any]) -> None:
    payload = {
        "schema_version": SCHEMA_VERSION,
        "snapshot_id": manifest["snapshot_id"],
        "tree_sha256": manifest["tree_sha256"],
        "created_at": manifest["created_at"],
        "label": manifest.get("label", ""),
    }
    tmp = store_root / "state" / ".current.tmp"
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(tmp, store_root / "state" / "current.json")


def current_snapshot_id(store_root: Path) -> str:
    path = store_root.expanduser().resolve() / "state" / "current.json"
    if not path.is_file():
        raise FactoryStoreError("no current snapshot")
    data = json.loads(path.read_text(encoding="utf-8"))
    return str(data["snapshot_id"])


def load_manifest(store_root: Path, snapshot_id: str | None = None) -> dict[str, Any]:
    store_root = store_root.expanduser().resolve()
    snapshot_id = snapshot_id or current_snapshot_id(store_root)
    _, manifest_path = _snapshot_paths(store_root, snapshot_id)
    if not manifest_path.is_file():
        raise FactoryStoreError(f"snapshot manifest not found: {snapshot_id}")
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def verify_snapshot(store_root: Path, snapshot_id: str | None = None) -> dict[str, Any]:
    store_root = store_root.expanduser().resolve()
    manifest = load_manifest(store_root, snapshot_id)
    snapshot_id = manifest["snapshot_id"]
    zip_path, _ = _snapshot_paths(store_root, snapshot_id)
    if not zip_path.is_file():
        raise FactoryStoreError(f"snapshot archive not found: {snapshot_id}")

    expected = {row["path"]: row for row in manifest["files"]}
    checked = 0
    with zipfile.ZipFile(zip_path, "r") as zf:
        actual_names = {name for name in zf.namelist() if name != "FACTORY_SNAPSHOT.json" and not name.endswith("/")}
        if actual_names != set(expected):
            missing = sorted(set(expected) - actual_names)
            extra = sorted(actual_names - set(expected))
            raise FactoryStoreError(f"archive file set mismatch; missing={missing[:5]} extra={extra[:5]}")
        for name in sorted(actual_names):
            data = zf.read(name)
            row = expected[name]
            if len(data) != row["bytes"] or sha256_bytes(data) != row["sha256"]:
                raise FactoryStoreError(f"checksum mismatch: {name}")
            checked += 1
    return {"ok": True, "snapshot_id": snapshot_id, "checked_files": checked, "tree_sha256": manifest["tree_sha256"]}


def _safe_member(name: str) -> PurePosixPath:
    p = PurePosixPath(name)
    if p.is_absolute() or ".." in p.parts:
        raise FactoryStoreError(f"unsafe archive member: {name}")
    return p


def restore_snapshot(store_root: Path, destination: Path, snapshot_id: str | None = None, force: bool = False) -> dict[str, Any]:
    store_root = store_root.expanduser().resolve()
    manifest = load_manifest(store_root, snapshot_id)
    verify_snapshot(store_root, manifest["snapshot_id"])
    zip_path, _ = _snapshot_paths(store_root, manifest["snapshot_id"])
    destination = destination.expanduser().resolve()
    destination.mkdir(parents=True, exist_ok=True)
    if any(destination.iterdir()) and not force:
        raise FactoryStoreError("restore destination is not empty; pass --force only when overwrite is intended")

    restored = 0
    with zipfile.ZipFile(zip_path, "r") as zf:
        for info in zf.infolist():
            if info.filename == "FACTORY_SNAPSHOT.json" or info.is_dir():
                continue
            rel = _safe_member(info.filename)
            target = destination.joinpath(*rel.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(zf.read(info.filename))
            restored += 1
    return {"ok": True, "snapshot_id": manifest["snapshot_id"], "destination": str(destination), "restored_files": restored}


def diff_snapshots(store_root: Path, older: str, newer: str) -> dict[str, Any]:
    a = load_manifest(store_root, older)
    b = load_manifest(store_root, newer)
    amap = {row["path"]: row["sha256"] for row in a["files"]}
    bmap = {row["path"]: row["sha256"] for row in b["files"]}
    return {
        "older": older,
        "newer": newer,
        "added": sorted(set(bmap) - set(amap)),
        "removed": sorted(set(amap) - set(bmap)),
        "changed": sorted(path for path in set(amap) & set(bmap) if amap[path] != bmap[path]),
    }


def list_snapshots(store_root: Path) -> list[dict[str, Any]]:
    history = store_root.expanduser().resolve() / "history"
    if not history.is_dir():
        return []
    rows = []
    for path in sorted(history.glob("*.manifest.json"), reverse=True):
        data = json.loads(path.read_text(encoding="utf-8"))
        rows.append({
            "snapshot_id": data["snapshot_id"],
            "created_at": data["created_at"],
            "label": data.get("label", ""),
            "file_count": data["file_count"],
            "total_bytes": data["total_bytes"],
            "tree_sha256": data["tree_sha256"],
        })
    return rows


def export_snapshot(store_root: Path, destination: Path, snapshot_id: str | None = None) -> dict[str, Any]:
    store_root = store_root.expanduser().resolve()
    manifest = load_manifest(store_root, snapshot_id)
    verify_snapshot(store_root, manifest["snapshot_id"])
    source, _ = _snapshot_paths(store_root, manifest["snapshot_id"])
    destination = destination.expanduser().resolve()
    if destination.is_dir():
        destination = destination / source.name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    return {"ok": True, "snapshot_id": manifest["snapshot_id"], "path": str(destination), "sha256": sha256_file(destination), "bytes": destination.stat().st_size}


def main() -> int:
    parser = argparse.ArgumentParser(description="One Enter Factory Core local-first source store")
    parser.add_argument("--store", default="~/.one-enter-factory", help="factory store outside the source tree")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init")
    p = sub.add_parser("snapshot")
    p.add_argument("source")
    p.add_argument("--label", default="")
    sub.add_parser("status")
    sub.add_parser("list")
    p = sub.add_parser("verify")
    p.add_argument("snapshot_id", nargs="?")
    p = sub.add_parser("diff")
    p.add_argument("older")
    p.add_argument("newer")
    p = sub.add_parser("restore")
    p.add_argument("destination")
    p.add_argument("snapshot_id", nargs="?")
    p.add_argument("--force", action="store_true")
    p = sub.add_parser("export")
    p.add_argument("destination")
    p.add_argument("snapshot_id", nargs="?")

    args = parser.parse_args()
    store = Path(args.store)
    try:
        if args.command == "init":
            out = {"ok": True, "store": str(init_store(store))}
        elif args.command == "snapshot":
            out = create_snapshot(Path(args.source), store, args.label or None)
        elif args.command == "status":
            out = load_manifest(store)
        elif args.command == "list":
            out = {"snapshots": list_snapshots(store)}
        elif args.command == "verify":
            out = verify_snapshot(store, args.snapshot_id)
        elif args.command == "diff":
            out = diff_snapshots(store, args.older, args.newer)
        elif args.command == "restore":
            out = restore_snapshot(store, Path(args.destination), args.snapshot_id, args.force)
        elif args.command == "export":
            out = export_snapshot(store, Path(args.destination), args.snapshot_id)
        else:
            raise FactoryStoreError(f"unsupported command: {args.command}")
        print(json.dumps(out, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    except (FactoryStoreError, OSError, json.JSONDecodeError, zipfile.BadZipFile) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=os.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""YOS Shortcut Factory: reviewed, pinned, fail-closed build and sign pipeline.

Additive lane: existing v3/STASH, Clarity, installers and main stay untouched.
Only explicit reviewed dispatch sends a Shortcut to third-party HubSign.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import plistlib
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "tools/shortcut-factory/registry.json"
ARTIFACTS = ROOT / "tools/shortcut-factory/artifacts"
ALLOWED_PREFIX = "tools/shortcut-factory/shortcuts/"
ID_PATTERN = re.compile(r"[a-z][a-z0-9-]{0,39}\Z")
SHA_PATTERN = re.compile(r"[0-9a-f]{40}\Z")
PRIVATE_PATTERNS = [
    re.compile(r"\b(?:ntn_|secret_|sk-proj-|sk-live-)[A-Za-z0-9_-]{12,}"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    re.compile(r"BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY"),
    re.compile(r"Bearer\s+[^\s\"']{12,}", re.I),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),
]
URL_PATTERN = re.compile(r"https?://[^\s\"'<>]+", re.I)


class FactoryError(ValueError):
    pass


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_blob_sha1(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def load_registry(path: Path = REGISTRY) -> dict[str, dict]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("schema") != 1 or not isinstance(raw.get("targets"), list):
        raise FactoryError("Unsupported registry schema")
    targets = {}
    for item in raw["targets"]:
        if not isinstance(item, dict):
            raise FactoryError("Invalid target entry")
        ident, source = item.get("id"), item.get("source")
        name, pinned, hosts = item.get("name"), item.get("source_git_blob_sha1"), item.get("allowed_hosts")
        if not isinstance(ident, str) or not ID_PATTERN.fullmatch(ident) or ident in targets:
            raise FactoryError("Invalid or duplicate target ID")
        if not isinstance(source, str) or not source.startswith(ALLOWED_PREFIX) or not source.endswith(".cherri"):
            raise FactoryError(f"Unsafe source path for {ident}")
        if Path(source).is_absolute() or ".." in Path(source).parts or "\\" in source:
            raise FactoryError(f"Source path traversal for {ident}")
        if not isinstance(name, str) or not name.strip() or "\n" in name:
            raise FactoryError(f"Invalid name for {ident}")
        if not isinstance(pinned, str) or not SHA_PATTERN.fullmatch(pinned):
            raise FactoryError(f"Missing reviewed source pin for {ident}")
        if not isinstance(hosts, list) or len(set(hosts)) != len(hosts) or any(
            not isinstance(h, str) or not re.fullmatch(r"[a-z0-9.-]+", h) or h.startswith(".")
            for h in hosts
        ):
            raise FactoryError(f"Invalid network host allowlist for {ident}")
        targets[ident] = item
    if not targets:
        raise FactoryError("Registry cannot be empty")
    return targets


def select(targets: dict[str, dict], ident: str) -> list[dict]:
    if ident == "all":
        return list(targets.values())
    if ident not in targets:
        raise FactoryError(f"Unknown target: {ident}")
    return [targets[ident]]


def validate_source(item: dict, root: Path = ROOT) -> tuple[Path, bytes]:
    source = root / item["source"]
    if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(root.resolve()):
        raise FactoryError(f"Missing, symlinked or escaping source: {item['id']}")
    data = source.read_bytes()
    if git_blob_sha1(data) != item["source_git_blob_sha1"]:
        raise FactoryError(f"Source pin mismatch: {item['id']} (review and update pin)")
    try:
        content = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise FactoryError(f"Source not UTF-8: {item['id']}") from exc
    if not re.search(r"(?m)^#define name\s+" + re.escape(item["name"]) + r"\s*$", content):
        raise FactoryError(f"Shortcut name mismatch: {item['id']}")
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith(("#include", "#import")) and not re.fullmatch(
            r"#include\s+['\"]actions/[a-z0-9_/-]+['\"]", stripped
        ):
            raise FactoryError(f"Unreviewed Cherri include: {item['id']}")
    if any(p.search(content) for p in PRIVATE_PATTERNS):
        raise FactoryError(f"Potential secret in source: {item['id']}")
    observed = set()
    for raw_url in URL_PATTERN.findall(content):
        host = (urlparse(raw_url).hostname or "").lower()
        if not host:
            raise FactoryError(f"Unparseable URL: {item['id']}")
        observed.add(host)
    if not observed.issubset(set(item["allowed_hosts"])):
        raise FactoryError(f"Unreviewed URL host: {item['id']}: {sorted(observed - set(item['allowed_hosts']))}")
    if not item["allowed_hosts"] and re.search(r"\b(?:downloadURL|postURL|httpRequest)\s*\(", content):
        raise FactoryError(f"Network action without allowlisted host: {item['id']}")
    return source, data


def parse_unsigned(path: Path) -> dict:
    workflow = plistlib.loads(path.read_bytes())
    actions = workflow.get("WFWorkflowActions")
    if not isinstance(actions, list) or not actions:
        raise FactoryError(f"No actions: {path.name}")
    if any(not isinstance(a, dict) or not a.get("WFWorkflowActionIdentifier") for a in actions):
        raise FactoryError(f"Invalid action: {path.name}")
    return workflow


def build(item: dict, root: Path = ROOT, out: Path = ARTIFACTS) -> tuple[Path, dict]:
    source, data = validate_source(item, root)
    generated = source.with_name(source.stem + "_unsigned.shortcut")
    generated.unlink(missing_ok=True)
    subprocess.run(["cherri", source.name, "--skip-sign", "--debug"], cwd=source.parent, check=True)
    if not generated.is_file():
        raise FactoryError(f"Missing compiled artifact: {item['id']}")
    workflow = parse_unsigned(generated)
    out.mkdir(parents=True, exist_ok=True)
    destination = out / f"{item['id']}-unsigned.shortcut"
    shutil.copyfile(generated, destination)
    receipt = {
        "schema": 1, "id": item["id"], "name": item["name"],
        "source": item["source"], "source_sha256": sha256(data),
        "source_git_blob_sha1": git_blob_sha1(data),
        "unsigned_sha256": sha256(destination.read_bytes()),
        "action_count": len(workflow["WFWorkflowActions"]),
        "signed": False, "iphone_verified": False,
        "generated_utc": datetime.now(timezone.utc).isoformat(),
    }
    (out / f"{item['id']}-receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    return destination, receipt


def verify_signed(unsigned: Path, signed: Path) -> None:
    import lzfse
    raw = signed.read_bytes()
    if not raw.startswith(b"AEA1") or len(raw) <= 500:
        raise FactoryError("Invalid AEA1 envelope")
    cert_len = int.from_bytes(raw[8:12], "little")
    pos = raw.find(b"bvx", 12 + cert_len)
    if pos < 0:
        raise FactoryError("Signed LZFSE payload missing")
    decoded = lzfse.decompress(raw[pos:])
    idx = decoded.find(b"bplist00")
    if idx < 0:
        raise FactoryError("Signed workflow plist missing")
    signed_workflow = plistlib.loads(decoded[idx:])
    original = parse_unsigned(unsigned)
    if signed_workflow.get("WFWorkflowActions") != original.get("WFWorkflowActions"):
        raise FactoryError("Signed actions differ from reviewed unsigned workflow")


def sign(item: dict, root: Path = ROOT, out: Path = ARTIFACTS) -> tuple[Path, dict]:
    unsigned, receipt = build(item, root, out)
    signed = out / f"{item['id']}.shortcut"
    signed.unlink(missing_ok=True)
    subprocess.run([
        sys.executable, str(root / "tools/clarity-factory/sign_with_hubsign.py"),
        "--input", str(unsigned), "--output", str(signed), "--name", item["name"],
    ], check=True)
    verify_signed(unsigned, signed)
    receipt.update({"signed": True, "signed_sha256": sha256(signed.read_bytes()), "signed_semantics_verified": True})
    (out / f"{item['id']}-receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    return signed, receipt


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="YOS Shortcut Factory reviewed pipeline")
    parser.add_argument("command", choices=["validate", "build", "sign"])
    parser.add_argument("--target", default="all")
    parser.add_argument("--reviewed", action="store_true")
    args = parser.parse_args(argv)
    try:
        targets = load_registry()
        chosen = select(targets, args.target)
        if args.command == "sign" and (not args.reviewed or args.target == "all"):
            raise FactoryError("Signing requires --reviewed and one explicit target")
        for item in chosen:
            if args.command == "validate":
                validate_source(item)
                print(f"PASS preflight: {item['id']}")
            elif args.command == "build":
                artifact, receipt = build(item)
                print(f"PASS compiled: {artifact.name} ({receipt['action_count']} actions)")
            else:
                artifact, _ = sign(item)
                print(f"PASS signed and semantically verified: {artifact.name}")
    except (FactoryError, ValueError, OSError, subprocess.CalledProcessError) as exc:
        print(f"FAIL CLOSED: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

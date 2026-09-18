#!/usr/bin/env python3
"""Provider-neutral fallback router for One Enter Factory Core.

It does not contact providers itself. The active executor reports success/failure;
this router deterministically returns the next eligible route, so GitHub/Vercel
failures do not become a factory stop by default.
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class ProviderRouterError(ValueError):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_config(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    providers = data.get("providers")
    if not isinstance(providers, list) or not providers:
        raise ProviderRouterError("providers must be a non-empty list")
    seen = set()
    for row in providers:
        if not isinstance(row, dict):
            raise ProviderRouterError("provider entries must be objects")
        pid = row.get("id")
        if not isinstance(pid, str) or not pid or pid in seen:
            raise ProviderRouterError("provider ids must be unique non-empty strings")
        seen.add(pid)
        if not isinstance(row.get("roles"), list) or not all(isinstance(x, str) for x in row["roles"]):
            raise ProviderRouterError(f"provider {pid} roles must be strings")
        if not isinstance(row.get("priority"), int):
            raise ProviderRouterError(f"provider {pid} priority must be integer")
        if not isinstance(row.get("enabled", True), bool):
            raise ProviderRouterError(f"provider {pid} enabled must be boolean")
    return data


def load_health(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {"schema_version": "1.0", "providers": {}}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data.get("providers", {}), dict):
        raise ProviderRouterError("health providers must be an object")
    return data


def save_health(path: Path, health: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(health, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def candidates(config: dict[str, Any], health: dict[str, Any], role: str, exclude: set[str] | None = None) -> list[dict[str, Any]]:
    exclude = exclude or set()
    health_map = health.get("providers", {})
    rows = []
    for provider in config["providers"]:
        if provider["id"] in exclude or not provider.get("enabled", True) or role not in provider["roles"]:
            continue
        state = health_map.get(provider["id"], {}).get("state", "available")
        if state == "blocked":
            continue
        row = dict(provider)
        row["health"] = state
        rows.append(row)
    # Healthy before degraded, then explicit stable priority.
    rows.sort(key=lambda x: (x["health"] != "available", x["priority"], x["id"]))
    return rows


def select_provider(config: dict[str, Any], health: dict[str, Any], role: str, exclude: set[str] | None = None) -> dict[str, Any]:
    rows = candidates(config, health, role, exclude)
    if not rows:
        return {"ok": False, "role": role, "status": "needs_route", "reason": "no eligible provider"}
    selected = rows[0]
    return {
        "ok": True,
        "role": role,
        "status": "routed",
        "provider": selected["id"],
        "external": bool(selected.get("external", True)),
        "mode": selected.get("mode", "unknown"),
        "health": selected["health"],
        "remaining_fallbacks": [x["id"] for x in rows[1:]],
    }


def record_failure(config: dict[str, Any], health: dict[str, Any], role: str, provider_id: str, reason: str) -> dict[str, Any]:
    known = {p["id"] for p in config["providers"]}
    if provider_id not in known:
        raise ProviderRouterError(f"unknown provider: {provider_id}")
    providers = health.setdefault("providers", {})
    row = providers.setdefault(provider_id, {"failures": 0, "state": "available"})
    row["failures"] = int(row.get("failures", 0)) + 1
    row["state"] = "degraded" if row["failures"] < 2 else "blocked"
    row["last_failure_at"] = _now()
    row["last_reason"] = reason
    fallback = select_provider(config, health, role, {provider_id})
    return {
        "ok": fallback.get("ok", False),
        "failed_provider": provider_id,
        "failed_provider_state": row["state"],
        "failure_count": row["failures"],
        "fallback": fallback,
    }


def record_success(config: dict[str, Any], health: dict[str, Any], provider_id: str) -> dict[str, Any]:
    known = {p["id"] for p in config["providers"]}
    if provider_id not in known:
        raise ProviderRouterError(f"unknown provider: {provider_id}")
    providers = health.setdefault("providers", {})
    row = providers.setdefault(provider_id, {})
    row.update({"state": "available", "failures": 0, "last_success_at": _now()})
    return {"ok": True, "provider": provider_id, "state": "available"}


def main() -> int:
    parser = argparse.ArgumentParser(description="One Enter provider fallback router")
    parser.add_argument("--config", default=str(Path(__file__).with_name("providers.json")))
    parser.add_argument("--health", default=".factory-state/provider-health.json")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("select")
    p.add_argument("role")
    p = sub.add_parser("fail")
    p.add_argument("role")
    p.add_argument("provider")
    p.add_argument("reason")
    p = sub.add_parser("success")
    p.add_argument("provider")

    args = parser.parse_args()
    try:
        config = load_config(Path(args.config))
        health_path = Path(args.health)
        health = load_health(health_path)
        if args.command == "select":
            out = select_provider(config, health, args.role)
        elif args.command == "fail":
            out = record_failure(config, health, args.role, args.provider, args.reason)
            save_health(health_path, health)
        else:
            out = record_success(config, health, args.provider)
            save_health(health_path, health)
        print(json.dumps(out, ensure_ascii=False, indent=2, sort_keys=True))
        return 0 if out.get("ok") else 2
    except (ProviderRouterError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=os.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

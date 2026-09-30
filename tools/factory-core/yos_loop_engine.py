#!/usr/bin/env python3
"""YOS Loop Engine v1: bounded local implementation -> verify -> recover -> verify."""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "1.0.0"
MAX_RECOVERY_ATTEMPTS = 2
TAIL = 8000


class ConfigError(ValueError):
    pass


def load_job(path: Path) -> dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ConfigError("job must be a JSON object")

    for key in ("job_id", "goal"):
        if not isinstance(raw.get(key), str) or not raw[key].strip():
            raise ConfigError(f"{key} is required")

    for key in ("acceptance", "scope"):
        value = raw.get(key)
        if not isinstance(value, list) or not value or not all(isinstance(x, str) and x.strip() for x in value):
            raise ConfigError(f"{key} must contain non-empty strings")

    forbidden = raw.get("forbidden_paths", [])
    if not isinstance(forbidden, list) or not all(isinstance(x, str) and x.strip() for x in forbidden):
        raise ConfigError("forbidden_paths must be a list of globs")

    def argv(value: Any, name: str, optional: bool = False):
        if value is None and optional:
            return None
        if not isinstance(value, list) or not value or not all(isinstance(x, str) and x for x in value):
            raise ConfigError(f"{name} must be a non-empty argv list")
        return value

    if raw.get("implementation_command") is not None:
        raw["implementation_command"] = argv(raw["implementation_command"], "implementation_command")

    checks = raw.get("verification_commands")
    if not isinstance(checks, list) or not checks:
        raise ConfigError("verification_commands must contain at least one command")
    raw["verification_commands"] = [argv(x, f"verification_commands[{i}]") for i, x in enumerate(checks)]

    if raw.get("recovery_command") is not None:
        raw["recovery_command"] = argv(raw["recovery_command"], "recovery_command")

    attempts = raw.get("max_recovery_attempts", MAX_RECOVERY_ATTEMPTS)
    if not isinstance(attempts, int) or attempts < 0 or attempts > MAX_RECOVERY_ATTEMPTS:
        raise ConfigError(f"max_recovery_attempts must be 0..{MAX_RECOVERY_ATTEMPTS}")
    raw["max_recovery_attempts"] = attempts

    for key in ("requires_device_verification", "requires_production_verification"):
        value = raw.get(key, False)
        if not isinstance(value, bool):
            raise ConfigError(f"{key} must be boolean")
        raw[key] = value

    return raw


def run_command(argv: list[str], cwd: Path, extra_env: dict[str, str] | None = None) -> dict[str, Any]:
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)
    started = time.monotonic()
    proc = subprocess.run(argv, cwd=cwd, env=env, text=True, capture_output=True, shell=False, check=False)
    return {
        "argv": argv,
        "returncode": proc.returncode,
        "stdout_tail": (proc.stdout or "")[-TAIL:],
        "stderr_tail": (proc.stderr or "")[-TAIL:],
        "duration_ms": round((time.monotonic() - started) * 1000),
    }


def git(repo: Path, *args: str) -> str:
    proc = subprocess.run(["git", *args], cwd=repo, text=True, capture_output=True, shell=False, check=False)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or f"git {' '.join(args)} failed")
    return proc.stdout.strip()


def changed_paths(repo: Path, start_head: str) -> list[str]:
    tracked = set(filter(None, git(repo, "diff", "--name-only", start_head, "--").splitlines()))
    untracked = set(filter(None, git(repo, "ls-files", "--others", "--exclude-standard").splitlines()))
    return sorted(tracked | untracked)


def matches(path: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatch(path, pattern) for pattern in patterns)


def check_scope(paths: list[str], allowed: list[str], forbidden: list[str]) -> dict[str, Any]:
    forbidden_hits = [p for p in paths if matches(p, forbidden)]
    outside_scope = [p for p in paths if not matches(p, allowed)]
    return {
        "ok": not forbidden_hits and not outside_scope,
        "changed_paths": paths,
        "forbidden_hits": forbidden_hits,
        "outside_scope": outside_scope,
    }


def verify(job: dict[str, Any], repo: Path) -> tuple[bool, list[dict[str, Any]]]:
    results = [run_command(cmd, repo) for cmd in job["verification_commands"]]
    return all(x["returncode"] == 0 for x in results), results


def run_loop(job: dict[str, Any], repo: Path) -> dict[str, Any]:
    repo = repo.resolve()
    start_head = git(repo, "rev-parse", "HEAD")
    result: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "job_id": job["job_id"],
        "goal": job["goal"],
        "status": "running",
        "code_verified": False,
        "device_verified": False,
        "production_verified": False,
        "start_head": start_head,
        "end_head": start_head,
        "implementation": None,
        "verification_rounds": [],
        "recovery_attempts": [],
        "scope": None,
        "failure_class": None,
        "owner_boundary": [],
    }

    if job.get("implementation_command"):
        result["implementation"] = run_command(job["implementation_command"], repo)
        if result["implementation"]["returncode"] != 0:
            result["failure_class"] = "implementation_failed"

    def scope_now():
        return check_scope(changed_paths(repo, start_head), job["scope"], job.get("forbidden_paths", []))

    scope = scope_now()
    result["scope"] = scope
    if not scope["ok"]:
        result.update(status="blocked", failure_class="scope_violation", end_head=git(repo, "rev-parse", "HEAD"))
        return result

    ok, checks = verify(job, repo)
    result["verification_rounds"].append({"round": 0, "ok": ok, "commands": checks})
    if result["failure_class"] == "implementation_failed":
        ok = False

    recovery = job.get("recovery_command")
    for attempt in range(1, job["max_recovery_attempts"] + 1):
        if ok or not recovery:
            break

        failure = {
            "failure_class": result["failure_class"] or "verification_failed",
            "scope": scope,
            "verification": checks,
        }
        rec = run_command(
            recovery,
            repo,
            {
                "YOS_LOOP_ATTEMPT": str(attempt),
                "YOS_LOOP_JOB_ID": job["job_id"],
                "YOS_LOOP_FAILURE_JSON": json.dumps(failure, ensure_ascii=False),
            },
        )
        result["recovery_attempts"].append({"attempt": attempt, "command": rec})

        scope = scope_now()
        result["scope"] = scope
        if not scope["ok"]:
            result.update(status="blocked", failure_class="scope_violation", end_head=git(repo, "rev-parse", "HEAD"))
            return result

        ok, checks = verify(job, repo)
        result["verification_rounds"].append({"round": attempt, "ok": ok, "commands": checks})
        result["failure_class"] = None if ok else "verification_failed"

    result["end_head"] = git(repo, "rev-parse", "HEAD")
    result["scope"] = scope_now()

    if ok and result["scope"]["ok"]:
        result["code_verified"] = True
        boundaries = []
        if job["requires_device_verification"]:
            boundaries.append("physical_device")
        if job["requires_production_verification"]:
            boundaries.append("production")
        result["owner_boundary"] = boundaries
        result["status"] = "owner_boundary" if boundaries else "code_verified"
        result["failure_class"] = None
    else:
        result["status"] = "blocked"
        result["failure_class"] = result["failure_class"] or "verification_failed"

    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run a bounded YOS implementation/verification loop")
    parser.add_argument("--job", required=True, type=Path)
    parser.add_argument("--repo", default=Path("."), type=Path)
    parser.add_argument("--result", type=Path)
    args = parser.parse_args(argv)

    try:
        result = run_loop(load_job(args.job), args.repo)
    except (ConfigError, RuntimeError, json.JSONDecodeError) as exc:
        result = {
            "schema_version": SCHEMA_VERSION,
            "status": "invalid",
            "failure_class": "configuration_error",
            "error": str(exc),
        }

    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.result:
        args.result.parent.mkdir(parents=True, exist_ok=True)
        args.result.write_text(payload, encoding="utf-8")
    sys.stdout.write(payload)
    return 0 if result.get("status") in {"code_verified", "owner_boundary"} else 1


if __name__ == "__main__":
    raise SystemExit(main())

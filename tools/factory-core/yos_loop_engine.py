#!/usr/bin/env python3
"""YOS Loop Engine v1: durable, bounded execute -> verify -> recover -> audit loop."""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "1.1.0"
TAIL = 8000

DEFAULT_MAX_TOTAL_RECOVERY_ATTEMPTS = 4
HARD_MAX_TOTAL_RECOVERY_ATTEMPTS = 6
DEFAULT_MAX_SAME_FAILURE = 2
DEFAULT_MAX_DURATION_SECONDS = 600
HARD_MAX_DURATION_SECONDS = 3600
DEFAULT_MAX_CHANGED_PATHS = 40
HARD_MAX_CHANGED_PATHS = 500

TERMINAL_STATES = {"COMPLETE", "WAIT_USER", "FAILED_SAFE"}
RECOVERY_KINDS = {"retry", "fix", "alternative", "rollback"}
HUMAN_GATES = {
    "irreversible_change",
    "production_publish",
    "external_send",
    "purchase_or_charge",
    "delete",
    "credential_change",
    "major_data_change",
    "value_judgment",
    "physical_device",
    "production_verification",
}


class ConfigError(ValueError):
    pass


def _stable_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


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

    audit = raw.get("audit_commands")
    if not isinstance(audit, list) or not audit:
        raise ConfigError("audit_commands must contain at least one independent checker command")
    raw["audit_commands"] = [argv(x, f"audit_commands[{i}]") for i, x in enumerate(audit)]
    if raw["audit_commands"] == raw["verification_commands"]:
        raise ConfigError("audit_commands must be distinct from verification_commands")

    strategies = raw.get("recovery_strategies")
    legacy_recovery = raw.get("recovery_command")
    if strategies is not None and legacy_recovery is not None:
        raise ConfigError("use recovery_strategies or legacy recovery_command, not both")
    if legacy_recovery is not None:
        strategies = [{
            "name": "legacy-fix",
            "kind": "fix",
            "command": argv(legacy_recovery, "recovery_command"),
            "failure_classes": [],
            "max_attempts": 1,
        }]
    if strategies is None:
        strategies = []
    if not isinstance(strategies, list):
        raise ConfigError("recovery_strategies must be a list")

    normalized_strategies = []
    names = set()
    for index, item in enumerate(strategies):
        if not isinstance(item, dict):
            raise ConfigError(f"recovery_strategies[{index}] must be an object")
        name = str(item.get("name", "")).strip()
        kind = str(item.get("kind", "")).strip()
        if not name or name in names:
            raise ConfigError("recovery strategy names must be non-empty and unique")
        if kind not in RECOVERY_KINDS:
            raise ConfigError(f"recovery strategy kind must be one of {sorted(RECOVERY_KINDS)}")
        command = argv(item.get("command"), f"recovery_strategies[{index}].command")
        classes = item.get("failure_classes", [])
        if not isinstance(classes, list) or not all(isinstance(x, str) and x.strip() for x in classes):
            raise ConfigError("failure_classes must be a list of strings")
        max_attempts = item.get("max_attempts", 1)
        if not isinstance(max_attempts, int) or max_attempts < 1 or max_attempts > HARD_MAX_TOTAL_RECOVERY_ATTEMPTS:
            raise ConfigError(f"strategy max_attempts must be 1..{HARD_MAX_TOTAL_RECOVERY_ATTEMPTS}")
        names.add(name)
        normalized_strategies.append({
            "name": name,
            "kind": kind,
            "command": command,
            "failure_classes": classes,
            "max_attempts": max_attempts,
        })
    raw["recovery_strategies"] = normalized_strategies

    max_total = raw.get("max_total_recovery_attempts", DEFAULT_MAX_TOTAL_RECOVERY_ATTEMPTS)
    if not isinstance(max_total, int) or max_total < 0 or max_total > HARD_MAX_TOTAL_RECOVERY_ATTEMPTS:
        raise ConfigError(f"max_total_recovery_attempts must be 0..{HARD_MAX_TOTAL_RECOVERY_ATTEMPTS}")
    raw["max_total_recovery_attempts"] = max_total

    max_same = raw.get("max_same_failure", DEFAULT_MAX_SAME_FAILURE)
    if not isinstance(max_same, int) or max_same < 1 or max_same > HARD_MAX_TOTAL_RECOVERY_ATTEMPTS:
        raise ConfigError(f"max_same_failure must be 1..{HARD_MAX_TOTAL_RECOVERY_ATTEMPTS}")
    raw["max_same_failure"] = max_same

    max_duration = raw.get("max_duration_seconds", DEFAULT_MAX_DURATION_SECONDS)
    if not isinstance(max_duration, int) or max_duration < 1 or max_duration > HARD_MAX_DURATION_SECONDS:
        raise ConfigError(f"max_duration_seconds must be 1..{HARD_MAX_DURATION_SECONDS}")
    raw["max_duration_seconds"] = max_duration

    max_changed = raw.get("max_changed_paths", DEFAULT_MAX_CHANGED_PATHS)
    if not isinstance(max_changed, int) or max_changed < 1 or max_changed > HARD_MAX_CHANGED_PATHS:
        raise ConfigError(f"max_changed_paths must be 1..{HARD_MAX_CHANGED_PATHS}")
    raw["max_changed_paths"] = max_changed

    for key in ("requires_device_verification", "requires_production_verification", "rollback_on_failed_safe"):
        default = True if key == "rollback_on_failed_safe" else False
        value = raw.get(key, default)
        if not isinstance(value, bool):
            raise ConfigError(f"{key} must be boolean")
        raw[key] = value

    gates = raw.get("human_gates", [])
    if not isinstance(gates, list) or not all(isinstance(x, str) and x in HUMAN_GATES for x in gates):
        raise ConfigError(f"human_gates must use only {sorted(HUMAN_GATES)}")
    gates = list(dict.fromkeys(gates))
    if raw["requires_device_verification"] and "physical_device" not in gates:
        gates.append("physical_device")
    if raw["requires_production_verification"] and "production_verification" not in gates:
        gates.append("production_verification")
    raw["human_gates"] = gates

    return raw


def run_command(
    argv: list[str],
    cwd: Path,
    extra_env: dict[str, str] | None = None,
    timeout_seconds: float | None = None,
) -> dict[str, Any]:
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)
    started = time.monotonic()
    try:
        proc = subprocess.run(
            argv,
            cwd=cwd,
            env=env,
            text=True,
            capture_output=True,
            shell=False,
            check=False,
            timeout=timeout_seconds,
        )
        return {
            "argv": argv,
            "returncode": proc.returncode,
            "stdout_tail": (proc.stdout or "")[-TAIL:],
            "stderr_tail": (proc.stderr or "")[-TAIL:],
            "duration_ms": round((time.monotonic() - started) * 1000),
            "timed_out": False,
        }
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout.decode() if isinstance(exc.stdout, bytes) else (exc.stdout or "")
        stderr = exc.stderr.decode() if isinstance(exc.stderr, bytes) else (exc.stderr or "")
        return {
            "argv": argv,
            "returncode": 124,
            "stdout_tail": stdout[-TAIL:],
            "stderr_tail": stderr[-TAIL:],
            "duration_ms": round((time.monotonic() - started) * 1000),
            "timed_out": True,
        }


def git(repo: Path, *args: str) -> str:
    proc = subprocess.run(["git", *args], cwd=repo, text=True, capture_output=True, shell=False, check=False)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or f"git {' '.join(args)} failed")
    return proc.stdout.strip()


def workspace_status(repo: Path) -> str:
    return git(repo, "status", "--porcelain=v1", "--untracked-files=all")


def workspace_fingerprint(repo: Path) -> str:
    return _stable_hash(workspace_status(repo))


def changed_paths(repo: Path, start_head: str) -> list[str]:
    tracked = set(filter(None, git(repo, "diff", "--name-only", start_head, "--").splitlines()))
    untracked = set(filter(None, git(repo, "ls-files", "--others", "--exclude-standard").splitlines()))
    return sorted(tracked | untracked)


def matches(path: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatch(path, pattern) for pattern in patterns)


def check_scope(paths: list[str], allowed: list[str], forbidden: list[str], max_changed_paths: int) -> dict[str, Any]:
    forbidden_hits = [p for p in paths if matches(p, forbidden)]
    outside_scope = [p for p in paths if not matches(p, allowed)]
    over_budget = len(paths) > max_changed_paths
    return {
        "ok": not forbidden_hits and not outside_scope and not over_budget,
        "changed_paths": paths,
        "changed_path_count": len(paths),
        "max_changed_paths": max_changed_paths,
        "forbidden_hits": forbidden_hits,
        "outside_scope": outside_scope,
        "over_change_budget": over_budget,
    }


def _remaining_seconds(job: dict[str, Any], state: dict[str, Any]) -> float:
    used = float(state.get("active_elapsed_ms", 0)) / 1000.0
    return max(0.0, float(job["max_duration_seconds"]) - used)


def _record_command(
    state: dict[str, Any],
    role: str,
    phase: str,
    result: dict[str, Any],
    checkpoint,
) -> None:
    state["active_elapsed_ms"] += int(result.get("duration_ms", 0))
    evidence = {
        "role": role,
        "phase": phase,
        "argv": result["argv"],
        "returncode": result["returncode"],
        "duration_ms": result["duration_ms"],
        "timed_out": result.get("timed_out", False),
        "stdout_tail": result.get("stdout_tail", ""),
        "stderr_tail": result.get("stderr_tail", ""),
    }
    state["runtime_evidence"].append(evidence)
    checkpoint()


def _run_with_budget(
    job: dict[str, Any],
    state: dict[str, Any],
    repo: Path,
    argv: list[str],
    role: str,
    phase: str,
    checkpoint,
    extra_env: dict[str, str] | None = None,
) -> dict[str, Any]:
    remaining = _remaining_seconds(job, state)
    if remaining <= 0:
        return {
            "argv": argv,
            "returncode": 124,
            "stdout_tail": "",
            "stderr_tail": "One Enter active execution budget exhausted before command start",
            "duration_ms": 0,
            "timed_out": True,
        }
    result = run_command(argv, repo, extra_env=extra_env, timeout_seconds=remaining)
    _record_command(state, role, phase, result, checkpoint)
    return result


def _failure_fingerprint(failure_class: str, phase: str, evidence: Any) -> str:
    compact = {
        "failure_class": failure_class,
        "phase": phase,
        "evidence": evidence,
    }
    return _stable_hash(compact)[:24]


def _verification_summary(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{
        "argv": row["argv"],
        "returncode": row["returncode"],
        "timed_out": row.get("timed_out", False),
        "stdout_tail": row.get("stdout_tail", "")[-1000:],
        "stderr_tail": row.get("stderr_tail", "")[-1000:],
    } for row in results]


def _scope_now(job: dict[str, Any], repo: Path, start_head: str) -> dict[str, Any]:
    return check_scope(
        changed_paths(repo, start_head),
        job["scope"],
        job.get("forbidden_paths", []),
        job["max_changed_paths"],
    )


def _strategy_counts(state: dict[str, Any]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in state.get("recovery_attempts", []):
        name = row.get("strategy")
        if name:
            counts[name] = counts.get(name, 0) + 1
    return counts


def choose_recovery_strategy(
    job: dict[str, Any],
    state: dict[str, Any],
    failure_class: str,
    fingerprint: str,
) -> dict[str, Any] | None:
    if state["attempt_count"] >= job["max_total_recovery_attempts"]:
        return None

    counts = _strategy_counts(state)
    eligible = []
    for strategy in job["recovery_strategies"]:
        if strategy["failure_classes"] and failure_class not in strategy["failure_classes"]:
            continue
        if counts.get(strategy["name"], 0) >= strategy["max_attempts"]:
            continue
        eligible.append(strategy)

    if not eligible:
        return None

    recent_same = [
        row for row in state["failure_history"]
        if row.get("fingerprint") == fingerprint and row.get("strategy")
    ]
    last_strategy = recent_same[-1]["strategy"] if recent_same else None
    same_count = state.get("same_failure_count", 0)

    if same_count >= job["max_same_failure"] and last_strategy:
        alternative = [s for s in eligible if s["name"] != last_strategy]
        if alternative:
            eligible = alternative
        else:
            return None

    return eligible[0]


def _make_done_conditions(job: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for index, cmd in enumerate(job["verification_commands"], start=1):
        rows.append({"id": f"verify-{index}", "type": "machine", "checker": "verify", "argv": cmd, "verified": False})
    for index, cmd in enumerate(job["audit_commands"], start=1):
        rows.append({"id": f"audit-{index}", "type": "machine", "checker": "audit", "argv": cmd, "verified": False})
    for gate in job["human_gates"]:
        rows.append({"id": f"human-{gate}", "type": "human_gate", "gate": gate, "verified": False})
    return rows


def _mark_conditions(state: dict[str, Any], prefix: str, passed: bool) -> None:
    for row in state["done_conditions"]:
        if row["id"].startswith(prefix):
            row["verified"] = passed


def _checkpoint_writer(path: Path | None, state: dict[str, Any], repo: Path):
    def checkpoint() -> None:
        state["current_state"] = state["phase"]
        try:
            state["last_known_head"] = git(repo, "rev-parse", "HEAD")
            state["workspace_fingerprint"] = workspace_fingerprint(repo)
        except Exception:
            pass
        if path is not None:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(path.suffix + ".tmp")
            tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            tmp.replace(path)
    return checkpoint


def _new_state(job: dict[str, Any], repo: Path) -> dict[str, Any]:
    head = git(repo, "rev-parse", "HEAD")
    return {
        "schema_version": SCHEMA_VERSION,
        "job_hash": _stable_hash(job),
        "job_id": job["job_id"],
        "goal": job["goal"],
        "acceptance": job["acceptance"],
        "status": "RUNNING",
        "terminal_state": None,
        "phase": "RESTORE_STATE",
        "current_state": "RESTORE_STATE",
        "start_head": head,
        "last_known_head": head,
        "initial_workspace_clean": True,
        "workspace_fingerprint": workspace_fingerprint(repo),
        "executed_work": [],
        "verification_results": [],
        "audit_results": [],
        "failure_history": [],
        "recovery_attempts": [],
        "attempt_count": 0,
        "same_failure_count": 0,
        "last_failure_fingerprint": None,
        "unknowns": list(job["human_gates"]),
        "runtime_evidence": [],
        "done_conditions": _make_done_conditions(job),
        "code_verified": False,
        "audit_verified": False,
        "device_verified": False,
        "production_verified": False,
        "next_action": "execute",
        "active_elapsed_ms": 0,
        "scope": None,
        "rollback": None,
        "restored": False,
    }


def _load_or_init_state(job: dict[str, Any], repo: Path, state_path: Path | None) -> dict[str, Any]:
    if state_path is not None and state_path.exists():
        state = json.loads(state_path.read_text(encoding="utf-8"))
        if state.get("job_id") != job["job_id"] or state.get("job_hash") != _stable_hash(job):
            raise ConfigError("durable state belongs to a different job contract")
        if state.get("status") in TERMINAL_STATES:
            return state
        current_head = git(repo, "rev-parse", "HEAD")
        current_fp = workspace_fingerprint(repo)
        if current_head != state.get("last_known_head") or current_fp != state.get("workspace_fingerprint"):
            raise RuntimeError("workspace changed outside the recorded One Enter state; refusing unsafe resume")
        state["restored"] = True
        state["phase"] = "RESTORE_STATE"
        state["next_action"] = "verify_current_runtime_state"
        return state

    if workspace_status(repo):
        raise ConfigError("working tree must be clean before a new One Enter loop job starts")
    return _new_state(job, repo)


def _finalize(
    state: dict[str, Any],
    status: str,
    failure_class: str | None,
    next_action: str,
    checkpoint,
) -> dict[str, Any]:
    state["status"] = status
    state["terminal_state"] = status
    state["failure_class"] = failure_class
    state["next_action"] = next_action
    state["phase"] = status
    state["current_state"] = status
    checkpoint()
    return state


def rollback_workspace(repo: Path, start_head: str) -> dict[str, Any]:
    reset = run_command(["git", "reset", "--hard", start_head], repo, timeout_seconds=60)
    clean = run_command(["git", "clean", "-fd"], repo, timeout_seconds=60)
    ok = reset["returncode"] == 0 and clean["returncode"] == 0 and not workspace_status(repo)
    return {"ok": ok, "reset": reset, "clean": clean, "restored_head": git(repo, "rev-parse", "HEAD")}


def _failed_safe(
    job: dict[str, Any],
    state: dict[str, Any],
    repo: Path,
    failure_class: str,
    reason: str,
    checkpoint,
) -> dict[str, Any]:
    state["next_action"] = "safe_stop"
    state["failure_reason"] = reason
    if job["rollback_on_failed_safe"] and state.get("initial_workspace_clean"):
        state["phase"] = "ROLLBACK"
        checkpoint()
        state["rollback"] = rollback_workspace(repo, state["start_head"])
        checkpoint()
        if not state["rollback"]["ok"]:
            state["failure_reason"] = f"{reason}; rollback did not fully verify"
            failure_class = "rollback_failed"
    return _finalize(state, "FAILED_SAFE", failure_class, "inspect evidence; existing start state preserved if rollback.ok=true", checkpoint)


def _record_failure(
    state: dict[str, Any],
    failure_class: str,
    phase: str,
    evidence: Any,
    checkpoint,
) -> tuple[str, dict[str, Any]]:
    fingerprint = _failure_fingerprint(failure_class, phase, evidence)
    if fingerprint == state.get("last_failure_fingerprint"):
        state["same_failure_count"] = int(state.get("same_failure_count", 0)) + 1
    else:
        state["same_failure_count"] = 1
    state["last_failure_fingerprint"] = fingerprint
    row = {
        "failure_class": failure_class,
        "phase": phase,
        "fingerprint": fingerprint,
        "same_failure_count": state["same_failure_count"],
        "attempt_count": state["attempt_count"],
        "evidence": evidence,
        "strategy": None,
        "strategy_result": None,
    }
    state["failure_history"].append(row)
    state["failure_reason"] = failure_class
    state["next_action"] = "diagnose_and_recover"
    checkpoint()
    return fingerprint, row


def _run_check_group(
    job: dict[str, Any],
    state: dict[str, Any],
    repo: Path,
    commands: list[list[str]],
    role: str,
    phase: str,
    checkpoint,
) -> tuple[bool, list[dict[str, Any]]]:
    results = []
    for command in commands:
        result = _run_with_budget(job, state, repo, command, role, phase, checkpoint)
        results.append(result)
        if result["returncode"] != 0:
            break
    return all(row["returncode"] == 0 for row in results) and len(results) == len(commands), results


def run_loop(
    job: dict[str, Any],
    repo: Path,
    state_path: Path | None = None,
) -> dict[str, Any]:
    repo = repo.resolve()
    state = _load_or_init_state(job, repo, state_path)
    if state.get("status") in TERMINAL_STATES:
        return state

    checkpoint = _checkpoint_writer(state_path, state, repo)
    checkpoint()

    start_head = state["start_head"]

    if not state.get("implementation_done"):
        state["phase"] = "EXECUTE"
        state["next_action"] = "run_maker"
        checkpoint()
        if job.get("implementation_command"):
            result = _run_with_budget(
                job, state, repo, job["implementation_command"], "maker", "EXECUTE", checkpoint
            )
            state["executed_work"].append({"kind": "implementation", "result": result})
            state["implementation_done"] = True
            checkpoint()
            if result["returncode"] != 0:
                state["pending_failure_class"] = "implementation_failed"
        else:
            state["implementation_done"] = True
            checkpoint()

    while True:
        scope = _scope_now(job, repo, start_head)
        state["scope"] = scope
        checkpoint()
        if not scope["ok"]:
            reason = "scope violation"
            if scope["over_change_budget"]:
                reason = "change budget exceeded"
            return _failed_safe(job, state, repo, "scope_violation", reason, checkpoint)

        if _remaining_seconds(job, state) <= 0:
            return _failed_safe(job, state, repo, "execution_budget_exhausted", "active execution time budget exhausted", checkpoint)

        state["phase"] = "VERIFY"
        state["next_action"] = "checker_verify"
        checkpoint()
        verify_ok, verify_results = _run_check_group(
            job, state, repo, job["verification_commands"], "checker", "VERIFY", checkpoint
        )
        verify_row = {
            "round": len(state["verification_results"]),
            "ok": verify_ok,
            "commands": _verification_summary(verify_results),
        }
        state["verification_results"].append(verify_row)
        _mark_conditions(state, "verify-", verify_ok)
        checkpoint()

        pending = state.pop("pending_failure_class", None)
        if pending:
            verify_ok = False
            failure_class = pending
        else:
            failure_class = "verification_failed"

        if verify_ok:
            state["phase"] = "AUDIT"
            state["next_action"] = "independent_audit"
            checkpoint()
            audit_ok, audit_results = _run_check_group(
                job, state, repo, job["audit_commands"], "audit", "AUDIT", checkpoint
            )
            audit_row = {
                "round": len(state["audit_results"]),
                "ok": audit_ok,
                "commands": _verification_summary(audit_results),
            }
            state["audit_results"].append(audit_row)
            _mark_conditions(state, "audit-", audit_ok)
            state["audit_verified"] = audit_ok
            checkpoint()

            if audit_ok:
                state["code_verified"] = True
                state["failure_reason"] = None
                state["same_failure_count"] = 0
                state["last_failure_fingerprint"] = None
                if job["human_gates"]:
                    state["unknowns"] = list(job["human_gates"])
                    state["next_action"] = "user_only_gate"
                    return _finalize(state, "WAIT_USER", None, "complete the minimum human gate(s)", checkpoint)
                state["unknowns"] = []
                return _finalize(state, "COMPLETE", None, "none", checkpoint)

            failure_class = "audit_failed"
            failure_evidence = _verification_summary(audit_results)
            phase = "AUDIT"
        else:
            failure_evidence = _verification_summary(verify_results)
            phase = "VERIFY"

        fingerprint, failure_row = _record_failure(
            state, failure_class, phase, failure_evidence, checkpoint
        )

        strategy = choose_recovery_strategy(job, state, failure_class, fingerprint)
        if strategy is None:
            reason = "safe recovery routes exhausted"
            if state["attempt_count"] >= job["max_total_recovery_attempts"]:
                reason = "total recovery budget exhausted"
            elif state["same_failure_count"] >= job["max_same_failure"]:
                reason = "same failure repeated without a safe alternative"
            return _failed_safe(job, state, repo, "recovery_exhausted", reason, checkpoint)

        state["attempt_count"] += 1
        failure_row["strategy"] = strategy["name"]
        recovery_entry = {
            "attempt": state["attempt_count"],
            "strategy": strategy["name"],
            "kind": strategy["kind"],
            "failure_fingerprint": fingerprint,
            "result": None,
        }
        state["recovery_attempts"].append(recovery_entry)
        state["phase"] = "RECOVER"
        state["next_action"] = f"{strategy['kind']}:{strategy['name']}"
        checkpoint()

        env = {
            "YOS_LOOP_ATTEMPT": str(state["attempt_count"]),
            "YOS_LOOP_JOB_ID": job["job_id"],
            "YOS_LOOP_FAILURE_JSON": json.dumps(failure_row, ensure_ascii=False),
            "YOS_LOOP_RECOVERY_KIND": strategy["kind"],
            "YOS_LOOP_RECOVERY_NAME": strategy["name"],
        }
        result = _run_with_budget(
            job, state, repo, strategy["command"], "recovery", "RECOVER", checkpoint, extra_env=env
        )
        recovery_entry["result"] = result
        failure_row["strategy_result"] = {
            "returncode": result["returncode"],
            "timed_out": result.get("timed_out", False),
        }
        checkpoint()

        if result["returncode"] != 0:
            state["pending_failure_class"] = "recovery_command_failed"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run durable bounded One Enter implementation/verification loop")
    parser.add_argument("--job", required=True, type=Path)
    parser.add_argument("--repo", default=Path("."), type=Path)
    parser.add_argument("--result", type=Path)
    parser.add_argument(
        "--state",
        type=Path,
        help="Durable state path. Defaults to --result so the existing result JSON doubles as the resume state.",
    )
    args = parser.parse_args(argv)

    state_path = args.state or args.result
    try:
        job = load_job(args.job)
        result = run_loop(job, args.repo, state_path=state_path)
    except (ConfigError, RuntimeError, json.JSONDecodeError) as exc:
        result = {
            "schema_version": SCHEMA_VERSION,
            "status": "FAILED_SAFE",
            "terminal_state": "FAILED_SAFE",
            "failure_class": "configuration_or_state_error",
            "failure_reason": str(exc),
            "next_action": "fix the job contract or restore the recorded workspace before retrying",
            "code_verified": False,
            "audit_verified": False,
        }

    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.result and args.result != state_path:
        args.result.parent.mkdir(parents=True, exist_ok=True)
        args.result.write_text(payload, encoding="utf-8")
    elif args.result and state_path is not None and not args.result.exists():
        args.result.parent.mkdir(parents=True, exist_ok=True)
        args.result.write_text(payload, encoding="utf-8")
    sys.stdout.write(payload)
    return 0 if result.get("status") in {"COMPLETE", "WAIT_USER"} else 1


if __name__ == "__main__":
    raise SystemExit(main())

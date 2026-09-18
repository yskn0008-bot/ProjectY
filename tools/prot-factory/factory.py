#!/usr/bin/env python3
"""PROT Factory v0.1 core.

A dependency-free, fail-closed job router for isolated ProjectY prototypes.
It does not call external AI/services. It normalizes a job, applies safety gates,
chooses a manufacturing lane, validates state transitions, and enforces bounded
recovery.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Dict

VALID_RISKS = {"low", "medium", "high", "irreversible"}
VALID_LANES = {"reuse", "shortcut", "web", "product", "external", "unknown"}
VALID_STATUSES = {
    "intake",
    "inventory",
    "planned",
    "building",
    "qa",
    "recovering",
    "trial_ready",
    "needs_yos",
    "done",
    "stopped",
}

ALLOWED_TRANSITIONS = {
    "intake": {"inventory", "needs_yos", "stopped"},
    "inventory": {"planned", "needs_yos", "stopped"},
    "planned": {"building", "needs_yos", "stopped"},
    "building": {"qa", "recovering", "needs_yos", "stopped"},
    "qa": {"trial_ready", "recovering", "needs_yos", "stopped"},
    "recovering": {"building", "qa", "needs_yos", "stopped"},
    "trial_ready": {"done", "needs_yos", "stopped"},
    "needs_yos": set(),
    "done": set(),
    "stopped": set(),
}

REQUIRED_FIELDS = {
    "job_id",
    "idea",
    "desired_state",
    "known_assets",
    "risk",
    "base_sha",
    "status",
    "recovery_count",
    "max_recovery",
}


class FactoryError(ValueError):
    """Raised when a job violates the factory contract."""


def validate_job(job: Dict[str, Any]) -> None:
    if not isinstance(job, dict):
        raise FactoryError("job must be a JSON object")

    missing = sorted(REQUIRED_FIELDS - set(job))
    if missing:
        raise FactoryError(f"missing required fields: {', '.join(missing)}")

    for key in ("job_id", "idea", "desired_state", "base_sha", "status", "risk"):
        if not isinstance(job[key], str) or not job[key].strip():
            raise FactoryError(f"{key} must be a non-empty string")

    if not isinstance(job["known_assets"], list) or not all(
        isinstance(item, str) for item in job["known_assets"]
    ):
        raise FactoryError("known_assets must be a list of strings")

    if job["risk"] not in VALID_RISKS:
        raise FactoryError(f"invalid risk: {job['risk']}")
    if job["status"] not in VALID_STATUSES:
        raise FactoryError(f"invalid status: {job['status']}")

    lane = job.get("lane", "unknown")
    if lane not in VALID_LANES:
        raise FactoryError(f"invalid lane: {lane}")

    for key in ("recovery_count", "max_recovery"):
        if not isinstance(job[key], int) or isinstance(job[key], bool) or job[key] < 0:
            raise FactoryError(f"{key} must be a non-negative integer")

    if job["max_recovery"] > 2:
        raise FactoryError("max_recovery must be <= 2")
    if job["recovery_count"] > job["max_recovery"]:
        raise FactoryError("recovery_count exceeds max_recovery")

    fingerprints = job.get("recovery_fingerprints", [])
    if not isinstance(fingerprints, list) or not all(isinstance(x, str) for x in fingerprints):
        raise FactoryError("recovery_fingerprints must be a list of strings")

    for flag in ("reuse_available", "requires_product_change", "requires_external"):
        if flag in job and not isinstance(job[flag], bool):
            raise FactoryError(f"{flag} must be boolean")

    if "prototype_type" in job and job["prototype_type"] not in {"shortcut", "web", "unknown"}:
        raise FactoryError("prototype_type must be shortcut, web, or unknown")


def transition(job: Dict[str, Any], next_status: str) -> None:
    if next_status not in VALID_STATUSES:
        raise FactoryError(f"invalid next status: {next_status}")
    current = job["status"]
    if next_status not in ALLOWED_TRANSITIONS[current]:
        raise FactoryError(f"invalid transition: {current} -> {next_status}")
    job["status"] = next_status


def select_lane(job: Dict[str, Any]) -> str:
    """Choose the least-expensive safe lane using explicit job hints only."""
    if job.get("reuse_available"):
        return "reuse"
    if job.get("requires_external"):
        return "external"
    if job.get("requires_product_change"):
        return "product"
    prototype_type = job.get("prototype_type", "unknown")
    if prototype_type in {"shortcut", "web"}:
        return prototype_type
    return job.get("lane", "unknown")


def result(job: Dict[str, Any], outcome: str, reason: str) -> Dict[str, Any]:
    return {
        "schema_version": "0.1",
        "job_id": job["job_id"],
        "base_sha": job["base_sha"],
        "lane": job.get("lane", "unknown"),
        "risk": job["risk"],
        "status": job["status"],
        "outcome": outcome,
        "reason": reason,
        "recovery_count": job["recovery_count"],
        "max_recovery": job["max_recovery"],
        "known_assets": job["known_assets"],
    }


def run_dry(job_input: Dict[str, Any]) -> Dict[str, Any]:
    """Run the deterministic no-side-effect v0.1 pipeline."""
    job = copy.deepcopy(job_input)
    validate_job(job)

    if job["status"] != "intake":
        raise FactoryError("dry-run jobs must start at intake")

    if job["risk"] in {"high", "irreversible"}:
        transition(job, "needs_yos")
        return result(job, "blocked", "risk gate requires YOS approval")

    transition(job, "inventory")
    job["lane"] = select_lane(job)

    if job["lane"] == "unknown":
        transition(job, "needs_yos")
        return result(job, "blocked", "no deterministic manufacturing lane")

    if job["lane"] == "external" and job["risk"] != "low":
        transition(job, "needs_yos")
        return result(job, "blocked", "external action is not low risk")

    transition(job, "planned")
    transition(job, "building")
    transition(job, "qa")
    transition(job, "trial_ready")
    return result(job, "trial_ready", "dry-run pipeline passed without owner wait")


def failure_fingerprint(job: Dict[str, Any], failure_class: str, evidence: str) -> str:
    payload = "|".join(
        [job["job_id"], job["base_sha"], failure_class.strip(), evidence.strip()]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:24]


def recover(job_input: Dict[str, Any], failure_class: str, evidence: str) -> Dict[str, Any]:
    job = copy.deepcopy(job_input)
    validate_job(job)

    if job["status"] not in {"building", "qa", "recovering"}:
        raise FactoryError("recovery is only allowed from building, qa, or recovering")
    if not failure_class.strip() or not evidence.strip():
        raise FactoryError("failure_class and evidence are required")

    fingerprint = failure_fingerprint(job, failure_class, evidence)
    seen = list(job.get("recovery_fingerprints", []))

    if fingerprint in seen:
        return result(job, "no_retry", "same failure fingerprint already handled")

    if job["recovery_count"] >= job["max_recovery"]:
        if job["status"] != "recovering":
            transition(job, "needs_yos")
        else:
            job["status"] = "needs_yos"
        return result(job, "blocked", "bounded recovery budget exhausted")

    if job["status"] != "recovering":
        transition(job, "recovering")
    job["recovery_count"] += 1
    seen.append(fingerprint)
    job["recovery_fingerprints"] = seen

    out = result(job, "retry_allowed", "bounded recovery attempt recorded")
    out["failure_fingerprint"] = fingerprint
    out["recovery_fingerprints"] = seen
    return out


def load_job(path: str | None) -> Dict[str, Any]:
    if path:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    return json.load(sys.stdin)


def main() -> int:
    parser = argparse.ArgumentParser(description="PROT Factory v0.1 deterministic core")
    parser.add_argument("job", nargs="?", help="job JSON path; stdin when omitted")
    parser.add_argument("--recover", metavar="FAILURE_CLASS", help="record bounded recovery")
    parser.add_argument("--evidence", default="", help="failure evidence used for fingerprinting")
    args = parser.parse_args()

    try:
        job = load_job(args.job)
        if args.recover:
            output = recover(job, args.recover, args.evidence)
        else:
            output = run_dry(job)
        print(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    except (FactoryError, json.JSONDecodeError, OSError) as exc:
        print(json.dumps({"error": str(exc), "status": "failed_closed"}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

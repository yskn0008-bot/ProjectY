#!/usr/bin/env python3
"""Operational PROT Factory runner for low-risk reuse jobs.

This runner turns an already-built ProjectY asset into a verified trial-ready
artifact without waiting for an owner reply. It intentionally stays narrow:
only the safest REUSE lane is executable here. Other lanes remain delegated to
existing ProjectY/Codex/One Enter machinery.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Dict

from factory import FactoryError, recover, select_lane, validate_job


def _safe_repo_path(repo_root: Path, rel: str) -> Path:
    if not rel or rel.startswith("/"):
        raise FactoryError("artifact_path must be a repository-relative path")
    root = repo_root.resolve()
    candidate = (root / rel).resolve()
    if root not in candidate.parents and candidate != root:
        raise FactoryError("artifact_path escapes repository root")
    return candidate


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run_reuse(job_input: Dict[str, Any], repo_root: Path) -> Dict[str, Any]:
    job = dict(job_input)
    validate_job(job)

    if job["status"] != "intake":
        raise FactoryError("operational jobs must start at intake")
    if job["risk"] != "low":
        return {
            "schema_version": "0.2",
            "job_id": job["job_id"],
            "status": "needs_yos",
            "outcome": "blocked",
            "reason": "operational runner auto-executes only low-risk jobs",
        }

    lane = select_lane(job)
    if lane != "reuse":
        return {
            "schema_version": "0.2",
            "job_id": job["job_id"],
            "status": "needs_yos",
            "outcome": "delegated",
            "reason": f"lane {lane} must use its existing ProjectY executor",
        }

    artifact_rel = job.get("artifact_path")
    if not isinstance(artifact_rel, str):
        raise FactoryError("reuse job requires artifact_path")

    # Manufacture the acceptance result, not a duplicate product: reuse means
    # verifying and preserving the existing asset rather than rebuilding it.
    artifact = _safe_repo_path(repo_root, artifact_rel)

    recovery_count = int(job.get("recovery_count", 0))
    recovery_fingerprints = list(job.get("recovery_fingerprints", []))
    recovered = False

    if job.get("simulate_first_failure"):
        qa_job = dict(job)
        qa_job["status"] = "qa"
        qa_job["lane"] = "reuse"
        qa_job["recovery_count"] = recovery_count
        qa_job["recovery_fingerprints"] = recovery_fingerprints
        rec = recover(qa_job, "ARTIFACT_NOT_READY", artifact_rel)
        if rec["outcome"] != "retry_allowed":
            return {
                "schema_version": "0.2",
                "job_id": job["job_id"],
                "status": rec["status"],
                "outcome": rec["outcome"],
                "reason": rec["reason"],
                "recovery_count": rec["recovery_count"],
            }
        recovery_count = rec["recovery_count"]
        recovery_fingerprints = rec.get("recovery_fingerprints", [])
        recovered = True

    if not artifact.is_file() or artifact.stat().st_size == 0:
        qa_job = dict(job)
        qa_job["status"] = "qa"
        qa_job["lane"] = "reuse"
        qa_job["recovery_count"] = recovery_count
        qa_job["recovery_fingerprints"] = recovery_fingerprints
        rec = recover(qa_job, "ARTIFACT_MISSING", artifact_rel)
        return {
            "schema_version": "0.2",
            "job_id": job["job_id"],
            "status": rec["status"],
            "outcome": rec["outcome"],
            "reason": "artifact verification failed; bounded recovery recorded",
            "recovery_count": rec["recovery_count"],
            "artifact_path": artifact_rel,
        }

    return {
        "schema_version": "0.2",
        "job_id": job["job_id"],
        "base_sha": job["base_sha"],
        "lane": "reuse",
        "risk": job["risk"],
        "status": "trial_ready",
        "outcome": "trial_ready",
        "reason": "existing asset verified and preserved; no rebuild required",
        "artifact_path": artifact_rel,
        "artifact_sha256": _sha256(artifact),
        "artifact_bytes": artifact.stat().st_size,
        "recovery_count": recovery_count,
        "recovered_from_intentional_failure": recovered,
        "owner_continue_required": False,
        "known_assets": job["known_assets"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="PROT Factory operational runner")
    parser.add_argument("job", help="job JSON path")
    parser.add_argument("--repo-root", default=".")
    args = parser.parse_args()
    try:
        job = json.loads(Path(args.job).read_text(encoding="utf-8"))
        result = run_reuse(job, Path(args.repo_root))
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
        return 0 if result.get("status") == "trial_ready" else 2
    except (FactoryError, json.JSONDecodeError, OSError) as exc:
        print(json.dumps({"error": str(exc), "status": "failed_closed"}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

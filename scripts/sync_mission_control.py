#!/usr/bin/env python3
"""Synchronize GitHub state into YOS Mission Control.

Uses only the GitHub Actions GITHUB_TOKEN. No credentials are written to disk.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "yskn0008-bot/ProjectY")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
DATA_PATH = Path(os.environ.get("MISSION_CONTROL_PATH", "data/mission-control.json"))
API_ROOT = "https://api.github.com"
SYNC_COMMIT_PREFIX = "data: sync GitHub state"


def api_get(path: str) -> Any:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "YOS-Mission-Control",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"

    request = urllib.request.Request(f"{API_ROOT}{path}", headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
        raise RuntimeError(f"GitHub API request failed: {path}: {exc}") from exc


def label_names(item: dict[str, Any]) -> list[str]:
    return [str(label.get("name", "")).lower() for label in item.get("labels", [])]


def priority_for(item: dict[str, Any]) -> int:
    labels = label_names(item)
    if any(label in labels for label in ("critical", "urgent", "p0", "priority: critical")):
        return 1
    if any(label in labels for label in ("high", "p1", "priority: high", "codex-ready")):
        return 2
    if any(label in labels for label in ("low", "p3", "priority: low")):
        return 4
    return 3


def update_project(data: dict[str, Any], project_id: str, **changes: Any) -> None:
    for project in data.get("projects", []):
        if project.get("id") == project_id:
            project.update(changes)
            return


def main() -> int:
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Mission Control data not found: {DATA_PATH}")

    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    owner, repo = REPOSITORY.split("/", 1)

    issue_records = api_get(
        f"/repos/{owner}/{repo}/issues?state=open&per_page=50&sort=updated&direction=desc"
    )
    issues = [item for item in issue_records if "pull_request" not in item]
    pulls = api_get(
        f"/repos/{owner}/{repo}/pulls?state=open&per_page=20&sort=updated&direction=desc"
    )
    commits = api_get(f"/repos/{owner}/{repo}/commits?per_page=20")
    commits = [
        item
        for item in commits
        if not str(item.get("commit", {}).get("message", "")).startswith(SYNC_COMMIT_PREFIX)
    ][:5]

    snapshot = {
        "issues": [
            {
                "number": item.get("number"),
                "title": item.get("title"),
                "updated_at": item.get("updated_at"),
                "labels": sorted(label_names(item)),
            }
            for item in issues
        ],
        "pulls": [
            {
                "number": item.get("number"),
                "title": item.get("title"),
                "updated_at": item.get("updated_at"),
                "draft": item.get("draft", False),
            }
            for item in pulls
        ],
        "commits": [item.get("sha") for item in commits],
    }
    snapshot_hash = hashlib.sha256(
        json.dumps(snapshot, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()

    if data.get("github_snapshot_hash") == snapshot_hash:
        print("GitHub state unchanged; no data update required.")
        return 0

    inbox: list[dict[str, Any]] = []
    for pull in pulls[:5]:
        number = pull.get("number")
        inbox.append(
            {
                "id": f"github-pr-{number}",
                "title": f"PR #{number} {pull.get('title', '')}",
                "type": "GitHub PR",
                "status": "draft" if pull.get("draft") else "review",
                "priority": 1 if not pull.get("draft") else 2,
                "next_action": "差分とテスト結果を確認し、マージ可否を判断する",
                "source_url": pull.get("html_url"),
                "updated_at": pull.get("updated_at"),
            }
        )

    for issue in sorted(issues, key=lambda item: (priority_for(item), item.get("number", 0)))[:10]:
        number = issue.get("number")
        inbox.append(
            {
                "id": f"github-issue-{number}",
                "title": f"Issue #{number} {issue.get('title', '')}",
                "type": "GitHub Issue",
                "status": "open",
                "priority": priority_for(issue),
                "next_action": "完成条件を確認し、次の安全な実装を1件進める",
                "source_url": issue.get("html_url"),
                "updated_at": issue.get("updated_at"),
            }
        )

    existing_completed = [
        item
        for item in data.get("recently_completed", [])
        if not str(item.get("id", "")).startswith("github-commit-")
    ]
    commit_completed = []
    for commit in commits:
        sha = str(commit.get("sha", ""))
        info = commit.get("commit", {})
        message = str(info.get("message", "")).splitlines()[0]
        commit_completed.append(
            {
                "id": f"github-commit-{sha[:12]}",
                "title": message or f"Commit {sha[:7]}",
                "completed_at": info.get("committer", {}).get("date"),
                "result": f"GitHub mainへ反映（{sha[:7]}）",
                "source_url": commit.get("html_url"),
            }
        )

    now = datetime.now(ZoneInfo("Asia/Tokyo")).isoformat(timespec="seconds")
    primary_issue = sorted(issues, key=lambda item: (priority_for(item), item.get("number", 0)))[0] if issues else None
    primary_pr = next((pull for pull in pulls if not pull.get("draft")), pulls[0] if pulls else None)

    if primary_pr:
        mission_next = f"PR #{primary_pr.get('number')}をレビューして公開判断する"
    elif primary_issue:
        mission_next = f"Issue #{primary_issue.get('number')}を実装する：{primary_issue.get('title', '')}"
    else:
        mission_next = "新しいInboxまたは改善案を待つ"

    data["updated_at"] = now
    data["updated_by"] = "GitHub Actions"
    data["github_snapshot_hash"] = snapshot_hash
    data["inbox"] = sorted(inbox, key=lambda item: (item.get("priority", 5), item.get("title", "")))[:15]
    data["recently_completed"] = (commit_completed + existing_completed)[:8]

    update_project(
        data,
        "yos-mission-control",
        status="active",
        health="attention" if inbox else "ok",
        progress_percent=90 if inbox else 100,
        next_action=mission_next,
        blocker=None,
        last_update=now,
        updated_by="GitHub Actions",
    )
    update_project(
        data,
        "github",
        status="active",
        health="attention" if primary_pr else "ok",
        progress_percent=90,
        next_action=f"Open Issue {len(issues)}件・Open PR {len(pulls)}件を自動同期中",
        blocker=None,
        last_update=now,
        updated_by="GitHub Actions",
    )
    update_project(
        data,
        "codex",
        status="review" if primary_pr else ("active" if primary_issue else "paused"),
        health="attention" if primary_pr else "ok",
        progress_percent=85,
        next_action=mission_next,
        blocker=None,
        last_update=now,
        updated_by="GitHub Actions",
    )

    DATA_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Synchronized {len(issues)} issues, {len(pulls)} PRs and {len(commits)} commits.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"sync failed: {exc}", file=sys.stderr)
        raise

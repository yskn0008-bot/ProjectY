# Codex-first Development Workflow

## Purpose

Prevent code work from being performed only inside a normal chat, prevent duplicate implementation after handoffs, and make GitHub the recoverable source of truth.

## Default path

```text
YOS decides priority
→ Taxi Lab or development chat clarifies the specification
→ Codex implements on a branch
→ Codex runs tests and inspects the diff
→ GitHub pull request records evidence
→ Actions and review verify the change
→ YOS decides merge and production readiness
```

## New development chat startup

Every new or replacement development chat must:

1. identify the repository and assigned directory;
2. inspect latest `main`;
3. inspect relevant open issues and pull requests;
4. inspect recent commits in the assigned scope;
5. separate verified completion from unverified claims;
6. select one next implementation task;
7. delegate code implementation to Codex.

A chat may perform product judgment, analysis, requirements work, and review directly. It must not silently replace Codex as the implementation agent.

## Handoff record

A handoff must contain:

- repository;
- assigned directory;
- current main SHA;
- relevant issues and pull requests;
- verified completed work;
- unresolved work;
- next task;
- production status;
- iPhone status.

The receiving chat must re-check GitHub rather than trusting the handoff blindly.

## Codex task brief

Every Codex implementation task should include:

```text
Repository: yskn0008-bot/ProjectY
Base: latest main
Scope: <assigned directory>
Issue: <issue number>
Goal: <one concrete result>
Do not change: <forbidden directories/files>
Acceptance criteria: <verifiable conditions>
Required checks: <commands/tests>
Deliverable: branch, commit, test evidence, final diff summary, PR
```

## Exceptions

Codex may be skipped only when:

- no code changes are required;
- Codex is unavailable or blocked;
- YOS approves an emergency rollback.

The pull request must record the exception and reason. “It was quicker in chat” is not an exception.

## Completion labels

- `Code verified`: implementation and automated checks verified.
- `Production verified`: deployed behavior and endpoints verified.
- `iPhone verified`: target Safari/PWA flow verified on the target device.

Do not combine these labels or infer one from another.

## Recovery after a frozen chat

1. Archive but do not delete the frozen chat.
2. Start a replacement chat inside the same Project.
3. Read Project instructions.
4. Reconstruct state from GitHub.
5. Reuse existing branches and PRs when safe.
6. Start a new Codex task only for the unresolved next item.

## Governance

The repository root `AGENTS.md` is the Codex-readable entry point. Keep it concise and current. Detailed decisions belong in Issues, PRs, Master documents, Change Log, and this guide.
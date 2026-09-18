# Development Workflow (Codex Optional)

## Purpose

Keep implementation recoverable, avoid duplicate work after handoffs, and make the actual repository state and test evidence authoritative.

Codex is **not** the default or mandatory implementation path. One Enter / ChatGPT / Factory / connected tools should use the shortest safe, verifiable route. Add Codex only when it materially improves the work.

## Default path

```text
YOS decides priority
→ One Enter reconstructs current state and existing assets
→ One Enter selects the shortest safe implementation route
→ ChatGPT / Factory / connected tools implement and test
→ Codex is added only when large-scale or long-running code work benefits from it
→ GitHub pull request records evidence when GitHub is part of the formal asset path
→ Required checks verify the change
→ YOS decides merge and production readiness
```

## New development chat startup

Every new or replacement development chat must:

1. identify the repository and assigned directory when repository work is required;
2. inspect latest `main`;
3. inspect relevant open issues and pull requests;
4. inspect recent commits in the assigned scope;
5. separate verified completion from unverified claims;
6. select one next implementation task;
7. choose the shortest safe implementation route.

A chat may implement directly when it has the required tools and can preserve the repository, test, and safety boundaries. It must not create a Codex dependency merely because code is involved.

## When to add Codex

Use Codex when it has a concrete advantage, for example:

- large repository-wide changes;
- complex refactors spanning many files;
- long-running code/test/debug loops;
- parallel coding work that is cleanly isolated;
- a task where the available ChatGPT/Factory route cannot execute or verify the work adequately.

Do not use Codex merely to satisfy process. A Codex usage limit must not block work when another safe route exists.

## Handoff record

A handoff must contain:

- repository;
- assigned directory;
- current main SHA;
- relevant issues and pull requests;
- verified completed work;
- unresolved work;
- next task;
- implementation route;
- production status;
- iPhone status.

The receiving chat must re-check GitHub rather than trusting the handoff blindly.

## Codex task brief

When Codex is actually used, include:

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

## Completion labels

- `Code verified`: implementation and automated checks verified.
- `Production verified`: deployed behavior and endpoints verified.
- `iPhone verified`: target iPhone flow verified on the target device.

Do not combine these labels or infer one from another.

## Recovery after a frozen chat

1. Preserve current artifacts and state.
2. Start a replacement chat inside the same Project if needed.
3. Read Project instructions.
4. Reconstruct state from GitHub and other current-state evidence.
5. Reuse existing branches and PRs when safe.
6. Continue the unresolved next item using the shortest safe route; add Codex only if it has a concrete advantage.

## Governance

The repository root `AGENTS.md` is a development entry point. Keep it concise and current. Detailed decisions belong in Issues, PRs, Master documents, Change Log, and this guide.

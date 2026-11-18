# Shortcut Factory Revival — reviewed build lane

This is **additive**. The existing v3 workflow, STASH, Clarity, YOS Common Installer, iCloud POCKET.txt, iPhone Shortcuts, and main are unchanged. This proposal makes the proven factory reusable and auditable; it does **not** imply an iPhone import or successful runtime.

## What improves

1. **One registry:** `registry.json` maps approved names/IDs to existing Cherri sources, exact reviewed Git blob SHA-1 pins, and literal network-host allowlists. Unknown, renamed, modified or unsafe sources fail closed.
2. **Safety before third-party access:** pin checks, path traversal/symlink checks, credential-like string scanning, unreviewed includes and URL hosts, plus the existing secret scanner. These are heuristics, **not proof of privacy**; human review remains mandatory.
3. **Repeatable builds:** pinned checksum-verified Cherri v2.3.0, stale-output removal, compiled plist action validation, and the existing STASH-specific contract tests.
4. **Traceable receipts:** source SHA-256, unsigned/signed SHA-256, action count, and separate machine/device status.
5. **Explicit signing gate:** PRs never call HubSign. A reviewer must manually run the GitHub Actions workflow, select one target, and check `sign_reviewed`. The existing HubSign adapter is reused. AEA1 output is decoded and signed actions compared to the reviewed unsigned workflow.
6. **Safe packaging:** CI artifacts only; no automatic publishing, installing, overwriting, renaming, or changing Notion/Shortcuts.

## Use

The workflow **Shortcut Factory Revival - reviewed builds** runs tests and unsigned builds for relevant pull requests. After source review, use GitHub Actions > this workflow > Run workflow > select the reviewed target > enable signing. Its signed `.shortcut` is an **installation candidate**, not a proven iPhone install. Check name collisions, permissions, execution, and rollback on the physical device before completion.

To register a new Shortcut, review its source/endpoints, add a unique entry with exact Git blob SHA, and add the ID to the workflow choice list. Do not embed private data or credentials in source. The literal-host check cannot guarantee absence of dynamically constructed network requests.

## YOS JOURNAL

The separate JOURNAL source is in PR #830, not main. Do not duplicate, silently merge, or modify its approved magazine UI. Once its notification policy and source are reviewed, register its pinned Cherri source and required hosts, extend the workflow choices, then compile/sign and test iPhone import. Avoid duplicate notifications with the existing GPT editorial automation.

## Remaining gates

GitHub CI compile/sign result; reviewer approval before HubSign; signed file retrieval; physical iPhone import/execution and collision handling. iOS unattended installation and silent replacement are not promised.

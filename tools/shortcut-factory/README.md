# Shortcut Factory v3

ProjectY's code-first iPhone Shortcut build lane.

## Goal

Stop assembling ordinary Shortcuts action-by-action on the iPhone. A Shortcut is described as source, CI compiles it, signs a secret-free artifact, and publishes a `.shortcut` file that can be imported on iPhone.

This reuses the proven direction from Issue #306 / PR #307 but treats the result as a reusable factory instead of a one-off Safari PoC.

## Current factory contract

1. Put a Cherri source file under `tools/shortcut-factory/shortcuts/`.
2. Keep generated sources secret-free. Runtime personal content must not be embedded in source.
3. CI statically scans the source before any third-party signing request.
4. Cherri is pinned to v2.3.0 and compiled in CI.
5. The source is compiled with deterministic UUIDs.
6. Secret-free artifacts are signed through HubSign on the Linux runner.
7. CI verifies the resulting file is a signed `AEA1` Shortcut envelope.
8. The signed `.shortcut` is published as a GitHub Actions artifact.

Adding another small Shortcut should normally mean adding one `.cherri` source and one build entry, not tapping actions together on iPhone.

## First generated Shortcut: STASH

`shortcuts/STASH.cherri` implements a temporary multi-item clipboard:

- Share ordinary text to **STASH** -> append it to `iCloud Drive/Shortcuts/POCKET.txt`.
- In ChatGPT, tap **Copy** first, then share the conversation to **STASH**. ChatGPT supplies a conversation URL; STASH detects that URL and stores the clipboard text instead.
- Launch **STASH** normally -> choose a stored item -> copy that item back to the clipboard.

The separator is `===YOS_NEXT===`, matching the existing on-device POCKET/STASH work so existing stored data remains compatible.

## Security boundary

The factory may use HubSign only for source that contains no secrets or personal data. The runtime contents stored in `POCKET.txt` remain on the user's device/iCloud and are not part of the generated artifact.

If a future Shortcut needs embedded credentials, do not send that artifact through HubSign. Use a local/device-side configuration boundary or a trusted Apple-signing path instead.

## State model

- **Build verified**: CI compiles and validates the signed artifact.
- **試せる**: signed artifact is downloadable and ready to import.
- **利用可能**: the intended action works on the user's iPhone.
- **正式維持可能**: source + build path are retained so YOS can regenerate/update it without reconstructing it manually.

Physical iPhone import is not required to preserve the build artifact or continue factory development; it is only needed to move STASH from `試せる` to `利用可能`.

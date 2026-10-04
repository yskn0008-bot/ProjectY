# Shortcut Factory v3 + STASH

This is the existing ProjectY Shortcut Factory/STASH lane originally developed
in PR #324, restored onto current `main` lineage instead of creating a second
Factory or a second STASH.

## Existing Factory contract

1. Keep Cherri source under `tools/shortcut-factory/shortcuts/`.
2. Keep generated source secret-free.
3. Run the static secret scan before any third-party signing request.
4. Compile with pinned Cherri v2.3.0.
5. Validate the unsigned Shortcut structure.
6. Sign secret-free artifacts with the existing
   `tools/clarity-factory/sign_with_hubsign.py` boundary.
7. Verify the signed artifact is a nontrivial `AEA1` envelope.
8. Publish the signed `.shortcut` as a GitHub Actions artifact.

The runtime storage remains the existing iCloud/Shortcuts `POCKET.txt`. No new
DB, SSOT, cloud service, or persistence file is introduced.

## Existing STASH contract

- Input text -> append to `POCKET.txt`.
- Entry separator -> `===YOS_NEXT===`.
- No input -> show a compact numbered plain-text list.
- Each row shows the first trimmed line, capped at 28 characters.
- Selecting a row maps its numeric prefix back to the exact raw stored item.
- The exact stored item is copied to the clipboard and then consumed from
  `POCKET.txt`.
- The consume rewrite is fixed to `POCKET.txt` with Ask Where to Save disabled
  and overwrite enabled.
- Routine save/copy use is silent; no success/duplicate/empty notifications.
- List formatting is display-only; stored text and the existing delimiter are
  not rewritten merely to make the menu readable.
- The generated source resolves `POCKET.txt` before append, reusing the
  already-proven iOS file persistence pattern from current Clarity.

## STASH Add

`STASH Add` is deliberately small and writes only to the existing `POCKET.txt`.

### Control Center

`copy text -> Control Center -> STASH Add -> clipboard -> existing POCKET.txt`

### Future Clarity

Clarity must call the same `STASH Add` Shortcut with text input. It must not
create a separate Clarity-only storage function.

### Duplicate protection

`STASH Add` reads the existing `POCKET.txt` only to check for the exact
`text + separator` entry. If already present, it silently exits. Empty input also
silently exits. Otherwise it appends that exact entry directly to the existing
`POCKET.txt` using Shortcuts' native explicit file-path append action. This
removes the nested-Shortcut permission gate and avoids the previous malformed
append action that had no file-path parameter. It does not create any new
storage path or SSOT.

## Completion states

- Factory build/sign/package PASS: machine verified.
- Signed STASH / STASH Add artifacts: machine verified.
- Physical iPhone acceptance must confirm exact clipboard copy, no destination
  prompt, no routine notification, and consume-after-use.
- The physical runtime target is native iPhone Shortcuts; Safari/PWA readiness is not applicable.
- Only after that physical E2E should the existing ProjectY asset/status record
  be updated as completed evidence.

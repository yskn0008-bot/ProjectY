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
- No input -> show a readable numbered list, choose a stored entry, copy the exact text to the clipboard, and remove that chosen entry from `POCKET.txt`.
- List formatting is display-only; the stored text and existing `===YOS_NEXT===` contract are not rewritten just to make the list readable.
- The generated source resolves `POCKET.txt` before append, reusing the
  already-proven iOS 26 file persistence pattern from current Clarity.

## STASH Add

`STASH Add` is deliberately thin.

### Control Center

`copy text -> Control Center -> STASH Add -> clipboard -> existing STASH -> POCKET.txt`

### Future Clarity

Clarity must call the same `STASH Add` Shortcut with text input. It must not
create a separate Clarity-only storage function.

### Duplicate protection

`STASH Add` reads the existing `POCKET.txt` only to check for the exact
`text + separator` entry. If already present, it exits without calling STASH.
It never writes to POCKET directly. The only write remains in STASH.

## Completion states

- Factory build/sign/package PASS: machine verified.
- STASH Add importable artifact: machine verified.
- iPhone import + Control Center placement + copy -> STASH Add -> POCKET save:
  physical-device verification.
- Only after that physical E2E should the existing ProjectY asset/status record
  be updated as completed evidence.
